/**
 * @file server.js - Folding@Home Team Statistics Dashboard
 *
 * Express server that proxies the Folding@Home API, stores periodic snapshots
 * in SQLite for historical tracking, and provides analytics endpoints including
 * milestones, achievements, PPD calculations, and member profiles.
 *
 * Architecture overview:
 *  1. Security & rate-limiting middleware
 *  2. SQLite database setup (snapshots, achievements, milestones)
 *  3. Achievement engine (300 achievements with condition evaluator)
 *  4. In-memory API cache with TTL
 *  5. Periodic snapshot scheduler
 *  6. REST API routes (live proxy, historical, analytics, donor profiles)
 *  7. Graceful shutdown handling
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { parseMembers } = require('./lib');

// ============================================================
// App initialization & constants
// ============================================================

const app = express();
app.disable('x-powered-by');
// SECURITY: Only trust first proxy (e.g. nginx). Set to the number of trusted
// proxies in your deployment so req.ip reflects the real client IP, not a
// spoofed X-Forwarded-For header. Adjust if behind multiple proxies.
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const TEAM_ID = 240890;
const FAH_API = 'https://api.foldingathome.org';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const CACHE_MAX_ENTRIES = 500; // SECURITY: prevent unbounded cache growth
const SNAPSHOT_INTERVAL = 60 * 60 * 1000; // snapshot every hour

// ============================================================
// Security headers middleware
// ============================================================
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net/npm/chart.js@4/; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';");
  // Prevent caching of API responses that may contain user-specific data
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
  }
  next();
});

// ============================================================
// Rate limiting middleware (in-memory, no dependencies)
// ============================================================
const RATE_LIMIT_MAX_ENTRIES = 50000; // SECURITY: bound map size against IP flooding

/**
 * Normalize an IP address for rate-limiting purposes.
 * IPv6 addresses are truncated to /64 prefix to prevent bypass via address rotation.
 * @param {string} ip - Raw IP address from the request
 * @returns {string} Normalized IP string
 */
function normalizeIP(ip) {
  if (!ip) return 'unknown';
  if (ip.includes(':')) {
    return ip.split(':').slice(0, 4).join(':') + '::/64';
  }
  return ip;
}

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 100; // max requests per window per IP

app.use((req, res, next) => {
  const ip = normalizeIP(req.ip || req.connection.remoteAddress);
  if (rateLimitMap.size >= RATE_LIMIT_MAX_ENTRIES) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
    return next();
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    res.setHeader('Retry-After', Math.ceil((entry.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000));
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  next();
});

// Stricter rate limit for expensive endpoints (achievement evaluation)
const heavyRateLimitMap = new Map();
const HEAVY_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const HEAVY_RATE_LIMIT_MAX = 10; // max 10 expensive requests per minute per IP

/**
 * Express middleware enforcing a stricter rate limit for CPU-intensive routes
 * such as achievement evaluation and donor summaries.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function heavyRateLimit(req, res, next) {
  const ip = normalizeIP(req.ip || req.connection.remoteAddress);
  if (heavyRateLimitMap.size >= RATE_LIMIT_MAX_ENTRIES) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  const now = Date.now();
  const entry = heavyRateLimitMap.get(ip);

  if (!entry || now - entry.windowStart > HEAVY_RATE_LIMIT_WINDOW_MS) {
    heavyRateLimitMap.set(ip, { windowStart: now, count: 1 });
    return next();
  }

  entry.count++;
  if (entry.count > HEAVY_RATE_LIMIT_MAX) {
    res.setHeader('Retry-After', Math.ceil((entry.windowStart + HEAVY_RATE_LIMIT_WINDOW_MS - now) / 1000));
    return res.status(429).json({ error: 'Too many requests to this endpoint. Please try again later.' });
  }

  next();
}

// Clean up stale rate limit entries and expired cache every 5 minutes
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      rateLimitMap.delete(ip);
    }
  }
  for (const [ip, entry] of heavyRateLimitMap) {
    if (now - entry.windowStart > HEAVY_RATE_LIMIT_WINDOW_MS) {
      heavyRateLimitMap.delete(ip);
    }
  }
  // SECURITY: Evict expired cache entries to prevent memory growth
  for (const [key, entry] of cache) {
    if (now - entry.timestamp >= CACHE_TTL) {
      cache.delete(key);
    }
  }
}, 5 * 60 * 1000);

// ============================================================
// Input validation helpers
// ============================================================
const ALLOWED_PERIODS = new Set(['hourly', 'daily', 'weekly', 'monthly', 'yearly']);

// SECURITY: These SQL fragments are used in GROUP BY clauses via string interpolation.
// This is safe because: (1) values are hardcoded here, (2) the key is validated against
// ALLOWED_PERIODS whitelist before lookup, (3) user input NEVER reaches these strings.
// Do NOT add dynamic values to this map.
const PERIOD_TO_GROUP_BY = Object.freeze({
  hourly:  "strftime('%Y-%m-%d %H:00', timestamp)",
  daily:   "strftime('%Y-%m-%d', timestamp)",
  weekly:  "strftime('%Y-W%W', timestamp)",
  monthly: "strftime('%Y-%m', timestamp)",
  yearly:  "strftime('%Y', timestamp)",
});

/**
 * Validate a time period string against the allowed whitelist.
 * @param {string} period - User-supplied period value
 * @returns {string} A safe period string, defaults to 'daily'
 */
function validatePeriod(period) {
  if (!period || !ALLOWED_PERIODS.has(period)) return 'daily';
  return period;
}

/**
 * Parse and clamp a positive integer from user input.
 * @param {*} value - Raw input value (typically from query string)
 * @param {number} defaultVal - Fallback if parsing fails
 * @param {number} max - Upper bound to prevent abuse
 * @returns {number} Validated integer in range [1, max]
 */
function validatePositiveInt(value, defaultVal, max) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 1) return defaultVal;
  return Math.min(parsed, max);
}

/**
 * Validate a donor/member name parameter. Rejects control characters,
 * path traversal attempts, and URL-encoded sequences.
 * @param {string} name - User-supplied name
 * @returns {string|null} Sanitized name, or null if invalid
 */
function validateName(name) {
  if (typeof name !== 'string' || name.length === 0 || name.length > 200) return null;
  // SECURITY: Block control characters (including null bytes)
  if (/[\x00-\x1f\x7f]/.test(name)) return null;
  // SECURITY: Block path traversal - bare "..", leading/trailing dots, slashes, backslashes
  if (/\.\./.test(name)) return null;
  if (/[/\\]/.test(name)) return null;
  // SECURITY: Block URL-encoded traversal attempts (e.g. %2e%2e, %00)
  if (/%[0-9a-fA-F]{2}/.test(name)) return null;
  return name;
}

/**
 * Validate an achievement ID. Only allows alphanumeric, underscores, and hyphens.
 * @param {string} id - Achievement identifier to validate
 * @returns {boolean} True if the ID is safe and well-formed
 */
function validateAchievementId(id) {
  if (typeof id !== 'string' || id.length === 0 || id.length > 100) return false;
  // Achievement IDs should be alphanumeric with underscores/hyphens only
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

// ============================================================
// SQLite Database setup
// ============================================================
const db = new Database(path.join(__dirname, 'fah-stats.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS team_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    score INTEGER NOT NULL,
    wus INTEGER NOT NULL,
    rank INTEGER,
    member_count INTEGER
  );

  CREATE TABLE IF NOT EXISTS member_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    name TEXT NOT NULL,
    fah_id INTEGER,
    score INTEGER NOT NULL,
    wus INTEGER NOT NULL,
    rank INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_team_ts ON team_snapshots(timestamp);
  CREATE INDEX IF NOT EXISTS idx_member_ts ON member_snapshots(timestamp);
  CREATE INDEX IF NOT EXISTS idx_member_name_ts ON member_snapshots(name, timestamp);

  CREATE TABLE IF NOT EXISTS donor_achievements (
    donor_name TEXT NOT NULL,
    achievement_id TEXT NOT NULL,
    unlocked_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (donor_name, achievement_id)
  );

  CREATE INDEX IF NOT EXISTS idx_donor_achievements_name ON donor_achievements(donor_name);

  CREATE TABLE IF NOT EXISTS milestone_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    milestone TEXT NOT NULL,
    score_at_time INTEGER,
    detected_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(name, milestone)
  );
  CREATE INDEX IF NOT EXISTS idx_milestone_events_date ON milestone_events(detected_at);

  CREATE TABLE IF NOT EXISTS motw_history (
    week TEXT NOT NULL,
    name TEXT NOT NULL,
    score_gain INTEGER NOT NULL,
    wu_gain INTEGER NOT NULL,
    PRIMARY KEY (week)
  );

  CREATE TABLE IF NOT EXISTS challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL,
    target INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS challenge_progress (
    challenge_id INTEGER NOT NULL,
    donor_name TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (challenge_id, donor_name),
    FOREIGN KEY (challenge_id) REFERENCES challenges(id)
  );

  CREATE TABLE IF NOT EXISTS quest_definitions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    type TEXT NOT NULL,
    target INTEGER NOT NULL,
    xp_reward INTEGER NOT NULL DEFAULT 100,
    frequency TEXT NOT NULL DEFAULT 'daily',
    active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS quest_progress (
    quest_id TEXT NOT NULL,
    donor_name TEXT NOT NULL,
    period_key TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    completed INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    PRIMARY KEY (quest_id, donor_name, period_key),
    FOREIGN KEY (quest_id) REFERENCES quest_definitions(id)
  );
  CREATE INDEX IF NOT EXISTS idx_quest_progress_donor ON quest_progress(donor_name, period_key);

  CREATE TABLE IF NOT EXISTS donor_xp (
    donor_name TEXT PRIMARY KEY,
    total_xp INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,
    quests_completed INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS raffle_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month_key TEXT NOT NULL,
    donor_name TEXT NOT NULL,
    tickets INTEGER NOT NULL DEFAULT 1,
    UNIQUE(month_key, donor_name)
  );
  CREATE INDEX IF NOT EXISTS idx_raffle_month ON raffle_entries(month_key);

  CREATE TABLE IF NOT EXISTS raffle_winners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month_key TEXT NOT NULL UNIQUE,
    donor_name TEXT NOT NULL,
    tickets INTEGER NOT NULL,
    total_participants INTEGER NOT NULL,
    drawn_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS seasons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS season_xp (
    season_id INTEGER NOT NULL,
    donor_name TEXT NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (season_id, donor_name),
    FOREIGN KEY (season_id) REFERENCES seasons(id)
  );
  CREATE INDEX IF NOT EXISTS idx_season_xp_season ON season_xp(season_id);

  CREATE TABLE IF NOT EXISTS versus_duels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week TEXT NOT NULL,
    member1 TEXT NOT NULL,
    member2 TEXT NOT NULL,
    score1_start INTEGER NOT NULL DEFAULT 0,
    score2_start INTEGER NOT NULL DEFAULT 0,
    score1_current INTEGER NOT NULL DEFAULT 0,
    score2_current INTEGER NOT NULL DEFAULT 0,
    winner TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_versus_week ON versus_duels(week);

  CREATE TABLE IF NOT EXISTS versus_history (
    donor_name TEXT NOT NULL,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (donor_name)
  );
`);

// ============================================================
// Prepared statements for snapshot & milestone insertion
// ============================================================

const insertTeamSnapshot = db.prepare(`
  INSERT INTO team_snapshots (score, wus, rank, member_count)
  VALUES (@score, @wus, @rank, @member_count)
`);

const insertMemberSnapshot = db.prepare(`
  INSERT INTO member_snapshots (name, fah_id, score, wus, rank)
  VALUES (@name, @fah_id, @score, @wus, @rank)
`);

/** Batch-insert member snapshots inside a single transaction for performance. */
const insertManyMembers = db.transaction((members) => {
  for (const m of members) insertMemberSnapshot.run(m);
});

const insertMilestone = db.prepare(
  'INSERT OR IGNORE INTO milestone_events (name, milestone, score_at_time) VALUES (?, ?, ?)'
);

const insertMotwHistory = db.prepare(
  'INSERT OR REPLACE INTO motw_history (week, name, score_gain, wu_gain) VALUES (?, ?, ?, ?)'
);

const updateChallengeProgress = db.prepare(
  'INSERT OR REPLACE INTO challenge_progress (challenge_id, donor_name, progress) VALUES (?, ?, ?)'
);

// Quest & XP prepared statements
const upsertQuestProgress = db.prepare(
  'INSERT OR REPLACE INTO quest_progress (quest_id, donor_name, period_key, progress, completed, completed_at) VALUES (?, ?, ?, ?, ?, ?)'
);
const upsertDonorXp = db.prepare(
  'INSERT INTO donor_xp (donor_name, total_xp, level, quests_completed) VALUES (?, ?, ?, ?) ON CONFLICT(donor_name) DO UPDATE SET total_xp=?, level=?, quests_completed=?'
);
const upsertRaffleEntry = db.prepare(
  'INSERT INTO raffle_entries (month_key, donor_name, tickets) VALUES (?, ?, ?) ON CONFLICT(month_key, donor_name) DO UPDATE SET tickets = tickets + ?'
);

// Seed default quest definitions (INSERT OR IGNORE so they persist)
const QUEST_SEED = [
  { id: 'daily_fold_1',     title: 'Daily Folder',         description: 'Complete at least 1 WU today',                type: 'wu_gain',    target: 1,     xp: 50,   freq: 'daily' },
  { id: 'daily_fold_5',     title: 'Busy Bee',             description: 'Complete 5 WUs today',                        type: 'wu_gain',    target: 5,     xp: 100,  freq: 'daily' },
  { id: 'daily_fold_20',    title: 'Folding Frenzy',       description: 'Complete 20 WUs today',                       type: 'wu_gain',    target: 20,    xp: 250,  freq: 'daily' },
  { id: 'daily_score_1m',   title: 'Point Collector',      description: 'Earn 1,000,000 points today',                 type: 'score_gain', target: 1e6,   xp: 150,  freq: 'daily' },
  { id: 'weekly_fold_25',   title: 'Weekly Warrior',       description: 'Complete 25 WUs this week',                   type: 'wu_gain',    target: 25,    xp: 300,  freq: 'weekly' },
  { id: 'weekly_fold_100',  title: 'Century Club',         description: 'Complete 100 WUs this week',                  type: 'wu_gain',    target: 100,   xp: 750,  freq: 'weekly' },
  { id: 'weekly_score_10m', title: 'Score Surge',          description: 'Earn 10,000,000 points this week',            type: 'score_gain', target: 10e6,  xp: 500,  freq: 'weekly' },
  { id: 'weekly_score_50m', title: 'Point Tsunami',        description: 'Earn 50,000,000 points this week',            type: 'score_gain', target: 50e6,  xp: 1000, freq: 'weekly' },
  { id: 'weekly_streak_5',  title: 'Streak Master',        description: 'Fold on 5 consecutive days this week',        type: 'streak',     target: 5,     xp: 400,  freq: 'weekly' },
  { id: 'monthly_fold_200', title: 'Monthly Marathon',     description: 'Complete 200 WUs this month',                 type: 'wu_gain',    target: 200,   xp: 1500, freq: 'monthly' },
  { id: 'monthly_score_100m', title: 'Hundred Million Club', description: 'Earn 100,000,000 points this month',        type: 'score_gain', target: 100e6, xp: 2000, freq: 'monthly' },
  { id: 'monthly_top3',     title: 'Podium Finish',        description: 'Finish in the top 3 of team rankings',       type: 'team_rank',  target: 3,     xp: 1000, freq: 'monthly' },
];

const seedQuest = db.prepare(
  'INSERT OR IGNORE INTO quest_definitions (id, title, description, type, target, xp_reward, frequency) VALUES (?, ?, ?, ?, ?, ?, ?)'
);
for (const q of QUEST_SEED) {
  seedQuest.run(q.id, q.title, q.description, q.type, q.target, q.xp, q.freq);
}

/** XP required per level (roughly quadratic curve). Level N requires N^1.8 * 100 XP total. */
function xpForLevel(level) {
  return Math.round(Math.pow(level, 1.8) * 100);
}

/** Compute level from total XP. */
function levelFromXp(totalXp) {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXp) level++;
  return level;
}

// Season auto-creation: ensure a current season always exists
const SEASON_NAMES = [
  'Alpha Fold', 'Beta Sheet', 'Gamma Helix', 'Delta Chain',
  'Epsilon Wave', 'Zeta Storm', 'Eta Pulse', 'Theta Core',
  'Iota Spark', 'Kappa Rise', 'Lambda Flow', 'Mu Drift',
];

/** Rank titles for season levels. */
const SEASON_RANK_TITLES = [
  { minLevel: 1,  title: 'Rookie Folder' },
  { minLevel: 5,  title: 'Data Cruncher' },
  { minLevel: 10, title: 'Protein Wrangler' },
  { minLevel: 20, title: 'Simulation Ace' },
  { minLevel: 30, title: 'Folding Veteran' },
  { minLevel: 40, title: 'Science Hero' },
  { minLevel: 50, title: 'Compute Legend' },
];

function getSeasonRankTitle(level) {
  let title = SEASON_RANK_TITLES[0].title;
  for (const t of SEASON_RANK_TITLES) {
    if (level >= t.minLevel) title = t.title;
  }
  return title;
}

function ensureCurrentSeason() {
  const now = new Date();
  const active = db.prepare("SELECT * FROM seasons WHERE active = 1 AND end_date >= date('now') ORDER BY start_date DESC LIMIT 1").get();
  if (active) return active;
  // Create a new 90-day season
  const startDate = now.toISOString().split('T')[0];
  const endDate = new Date(now.getTime() + 90 * 86400000).toISOString().split('T')[0];
  const seasonCount = db.prepare('SELECT COUNT(*) as cnt FROM seasons').get().cnt;
  const name = SEASON_NAMES[seasonCount % SEASON_NAMES.length];
  // Deactivate old seasons
  db.prepare("UPDATE seasons SET active = 0 WHERE active = 1").run();
  const result = db.prepare('INSERT INTO seasons (name, start_date, end_date, active) VALUES (?, ?, ?, 1)').run(name, startDate, endDate);
  return { id: result.lastInsertRowid, name, start_date: startDate, end_date: endDate, active: 1 };
}

// Ensure a season exists at startup
const currentSeason = ensureCurrentSeason();

// Versus matchmaking helper: create weekly duels pairing members by score proximity
function createWeeklyDuels(members) {
  const weekKey = new Date().toISOString().split('T')[0].slice(0, 4) + '-W' +
    String(Math.ceil((new Date().getDate() + new Date(new Date().getFullYear(), new Date().getMonth(), 1).getDay()) / 7)).padStart(2, '0');

  // Check if duels already exist for this week
  const existing = db.prepare('SELECT COUNT(*) as cnt FROM versus_duels WHERE week = ?').get(weekKey);
  if (existing.cnt > 0) return;

  // Sort by score and pair adjacent members
  const sorted = [...members].sort((a, b) => b.score - a.score);
  const pairs = [];
  for (let i = 0; i < sorted.length - 1; i += 2) {
    pairs.push({ m1: sorted[i], m2: sorted[i + 1] });
  }

  const insertDuel = db.prepare(
    'INSERT INTO versus_duels (week, member1, member2, score1_start, score2_start, score1_current, score2_current, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertMany = db.transaction((pairs) => {
    for (const p of pairs) {
      insertDuel.run(weekKey, p.m1.name, p.m2.name, p.m1.score, p.m2.score, p.m1.score, p.m2.score, 'active');
    }
  });
  insertMany(pairs);
  console.log(`[VERSUS] Created ${pairs.length} duels for week ${weekKey}`);
}

// Versus: finalize completed week's duels
function finalizeExpiredDuels() {
  const weekKey = new Date().toISOString().split('T')[0].slice(0, 4) + '-W' +
    String(Math.ceil((new Date().getDate() + new Date(new Date().getFullYear(), new Date().getMonth(), 1).getDay()) / 7)).padStart(2, '0');

  const expiredDuels = db.prepare("SELECT * FROM versus_duels WHERE status = 'active' AND week < ?").all(weekKey);
  const upsertHistory = db.prepare(
    'INSERT INTO versus_history (donor_name, wins, losses, draws) VALUES (?, ?, ?, ?) ON CONFLICT(donor_name) DO UPDATE SET wins = wins + ?, losses = losses + ?, draws = draws + ?'
  );

  for (const duel of expiredDuels) {
    const gain1 = duel.score1_current - duel.score1_start;
    const gain2 = duel.score2_current - duel.score2_start;
    let winner = null;
    if (gain1 > gain2) {
      winner = duel.member1;
      upsertHistory.run(duel.member1, 1, 0, 0, 1, 0, 0);
      upsertHistory.run(duel.member2, 0, 1, 0, 0, 1, 0);
    } else if (gain2 > gain1) {
      winner = duel.member2;
      upsertHistory.run(duel.member2, 1, 0, 0, 1, 0, 0);
      upsertHistory.run(duel.member1, 0, 1, 0, 0, 1, 0);
    } else {
      upsertHistory.run(duel.member1, 0, 0, 1, 0, 0, 1);
      upsertHistory.run(duel.member2, 0, 0, 1, 0, 0, 1);
    }
    db.prepare("UPDATE versus_duels SET winner = ?, status = 'completed' WHERE id = ?").run(winner, duel.id);
  }
}

/** Score thresholds that trigger milestone events (1M, 10M, ... 1T). */
const MILESTONE_THRESHOLDS = [1e6, 10e6, 100e6, 1e9, 10e9, 100e9, 1e12];

// ============================================================
// Achievements system - definition loading & DB access
// ============================================================

/** @type {Array<Object>} All achievement definitions loaded from achievements.json */
const ALL_ACHIEVEMENTS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'achievements.json'), 'utf8')
);

/** Sum of all achievement points (used for completion percentage). */
const TOTAL_ACHIEVEMENT_POINTS = ALL_ACHIEVEMENTS.reduce((s, a) => s + (a.points || 0), 0);

const getUnlockedAchievements = db.prepare(
  'SELECT achievement_id, unlocked_at FROM donor_achievements WHERE donor_name = ?'
);
const insertAchievement = db.prepare(
  'INSERT OR IGNORE INTO donor_achievements (donor_name, achievement_id) VALUES (?, ?)'
);

/** Batch-insert newly unlocked achievement IDs for a donor (with validation). */
const insertManyAchievements = db.transaction((donorName, ids) => {
  for (const id of ids) {
    if (validateAchievementId(id)) {
      insertAchievement.run(donorName, id);
    }
  }
});

// ============================================================
// Achievement helper functions - number theory & pattern checks
// ============================================================

/**
 * Test if a number is prime using trial division (6k +/- 1 optimization).
 * @param {number} n
 * @returns {boolean}
 */
function isPrime(n) {
  if (n < 2) return false;
  if (n < 4) return true;
  if (n % 2 === 0 || n % 3 === 0) return false;
  for (let i = 5; i * i <= n; i += 6) {
    if (n % i === 0 || n % (i + 2) === 0) return false;
  }
  return true;
}

/**
 * Test if a number reads the same forwards and backwards (min 2 digits).
 * @param {number} n
 * @returns {boolean}
 */
function isPalindrome(n) {
  const s = String(n);
  return s.length > 1 && s === s.split('').reverse().join('');
}

/**
 * Test if a number belongs to the Fibonacci sequence using the
 * property that n is Fibonacci iff 5n^2+4 or 5n^2-4 is a perfect square.
 * @param {number} n
 * @returns {boolean}
 */
function isFibonacci(n) {
  if (n <= 0) return false;
  const a = 5 * n * n + 4;
  const b = 5 * n * n - 4;
  const sqrtA = Math.round(Math.sqrt(a));
  const sqrtB = Math.round(Math.sqrt(b));
  return sqrtA * sqrtA === a || sqrtB * sqrtB === b;
}

/**
 * @param {number} n
 * @returns {boolean} True if n is a power of 2
 */
function isPowerOf2(n) {
  return n > 0 && (n & (n - 1)) === 0;
}

/**
 * Check if all digits in n are the same (e.g. 111, 9999). Requires 3+ digits.
 * @param {number} n
 * @returns {boolean}
 */
function hasRepeatingDigits(n) {
  const s = String(n);
  if (s.length < 3) return false;
  return /^(\d)\1{2,}$/.test(s);
}

/**
 * Check if digits are strictly ascending (e.g. 1234, 258).
 * @param {number} n
 * @returns {boolean}
 */
function isAscendingDigits(n) {
  const s = String(n);
  if (s.length < 2) return false;
  for (let i = 1; i < s.length; i++) {
    if (s[i] <= s[i - 1]) return false;
  }
  return true;
}

/**
 * Check if a number consists only of 0s and 1s (binary-looking in decimal).
 * @param {number} n
 * @returns {boolean}
 */
function isOnlyBinaryDigits(n) {
  return /^[01]+$/.test(String(n)) && n > 0;
}

/**
 * @param {number} n
 * @returns {boolean} True if n is a perfect square
 */
function isPerfectSquare(n) {
  if (n < 0) return false;
  const s = Math.round(Math.sqrt(n));
  return s * s === n;
}

/**
 * @param {number} n
 * @returns {boolean} True if n is an exact power of 10 (10, 100, 1000, ...)
 */
function isPowerOf10(n) {
  if (n < 1) return false;
  while (n >= 10) {
    if (n % 10 !== 0) return false;
    n /= 10;
  }
  return n === 1;
}

// ============================================================
// Achievement engine - stat computation
// ============================================================

/**
 * Compute all donor statistics needed for achievement evaluation.
 * Derives team rank, contribution percentage, efficiency, streaks,
 * daily/weekly gains, and activity metrics from current + historical data.
 *
 * @param {Object} member - Current member data (name, score, wus, rank)
 * @param {Array<Object>} members - All current team members
 * @param {Array<Object>} memberHistory - Daily snapshots sorted ascending by date
 * @returns {Object} Stats object consumed by checkCondition()
 */
function computeDonorStats(member, members, memberHistory) {
  const sorted = [...members].sort((a, b) => b.score - a.score);
  const teamRank = sorted.findIndex(m => m.name === member.name) + 1;
  const totalScore = members.reduce((s, m) => s + m.score, 0);
  const contribution = totalScore > 0 ? (member.score / totalScore * 100) : 0;
  const efficiency = member.wus > 0 ? Math.round(member.score / member.wus) : 0;

  // Compute streak (consecutive days with WU gains) from member history
  // memberHistory is sorted ascending by date
  let currentStreak = 0;
  let maxStreak = 0;
  if (memberHistory.length >= 2) {
    let streak = 0;
    for (let i = 1; i < memberHistory.length; i++) {
      if (memberHistory[i].wus > memberHistory[i - 1].wus) {
        streak++;
      } else {
        if (streak > maxStreak) maxStreak = streak;
        streak = 0;
      }
    }
    if (streak > maxStreak) maxStreak = streak;
    // Current streak: count backwards from most recent snapshot
    for (let i = memberHistory.length - 1; i >= 1; i--) {
      if (memberHistory[i].wus > memberHistory[i - 1].wus) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  // days_active: count of days where WU count increased
  let daysActive = 0;
  if (memberHistory.length >= 2) {
    for (let i = 1; i < memberHistory.length; i++) {
      if (memberHistory[i].wus > memberHistory[i - 1].wus) daysActive++;
    }
  }

  // member_since_days: elapsed days since first recorded snapshot
  const firstSnapshot = memberHistory.length > 0 ? memberHistory[0] : null;
  const memberSinceDays = firstSnapshot
    ? Math.floor((Date.now() - new Date(firstSnapshot.date).getTime()) / 86400000)
    : 0;

  // Daily gain: score delta for the most recent day
  let dailyGain = 0;
  if (memberHistory.length >= 2) {
    const last = memberHistory[memberHistory.length - 1];
    const prev = memberHistory[memberHistory.length - 2];
    dailyGain = last.score - prev.score;
  }

  // Weekly gain: score delta over last 7 snapshots (or all available)
  let weeklyGain = 0;
  if (memberHistory.length >= 8) {
    const last = memberHistory[memberHistory.length - 1];
    const weekAgo = memberHistory[memberHistory.length - 8];
    weeklyGain = last.score - weekAgo.score;
  } else if (memberHistory.length >= 2) {
    weeklyGain = memberHistory[memberHistory.length - 1].score - memberHistory[0].score;
  }

  return {
    score: member.score,
    wus: member.wus,
    rank: member.rank || 999999,
    team_rank: teamRank,
    team_pct: contribution,
    efficiency,
    streak: currentStreak,
    max_streak: maxStreak,
    daily_gain: dailyGain,
    weekly_gain: weeklyGain,
    days_active: daysActive,
    member_since_days: memberSinceDays,
    member_history: memberHistory,
    members,
    member,
  };
}

// ============================================================
// Achievement engine - condition evaluation
// ============================================================

/**
 * Evaluate a single achievement's condition against computed donor stats.
 * Each condition type maps to a threshold comparison or special check.
 *
 * @param {Object} achievement - Achievement definition with .condition
 * @param {Object} stats - Donor stats from computeDonorStats()
 * @returns {{ met: boolean, progress: number, current: number|null, target: number|null }}
 */
function checkCondition(achievement, stats) {
  const cond = achievement.condition;
  const type = cond.type;
  const value = cond.value;

  switch (type) {
    case 'score_gte':
      return { met: stats.score >= value, progress: Math.min(1, stats.score / value), current: stats.score, target: value };
    case 'wus_gte':
      return { met: stats.wus >= value, progress: Math.min(1, stats.wus / value), current: stats.wus, target: value };
    case 'streak_gte':
      return { met: stats.streak >= value, progress: Math.min(1, stats.streak / value), current: stats.streak, target: value };
    case 'rank_lte':
      // Lower rank is better; progress inverts the distance-to-target ratio
      return {
        met: stats.rank <= value,
        progress: stats.rank <= value ? 1 : Math.min(1, Math.max(0, 1 - (stats.rank - value) / Math.max(stats.rank, 1))),
        current: stats.rank,
        target: value,
      };
    case 'efficiency_gte':
      return { met: stats.efficiency >= value, progress: Math.min(1, stats.efficiency / value), current: stats.efficiency, target: value };
    case 'daily_gain_gte':
      return { met: stats.daily_gain >= value, progress: Math.min(1, Math.max(0, stats.daily_gain / value)), current: stats.daily_gain, target: value };
    case 'weekly_gain_gte':
      return { met: stats.weekly_gain >= value, progress: Math.min(1, Math.max(0, stats.weekly_gain / value)), current: stats.weekly_gain, target: value };
    case 'team_pct_gte':
      return { met: stats.team_pct >= value, progress: Math.min(1, stats.team_pct / value), current: parseFloat(stats.team_pct.toFixed(2)), target: value };
    case 'team_rank_lte':
      return {
        met: stats.team_rank <= value,
        progress: stats.team_rank <= value ? 1 : Math.min(1, Math.max(0, 1 - (stats.team_rank - value) / Math.max(stats.team_rank, 1))),
        current: stats.team_rank,
        target: value,
      };
    case 'days_active_gte':
      return { met: stats.days_active >= value, progress: Math.min(1, stats.days_active / value), current: stats.days_active, target: value };
    case 'member_since_days':
      return { met: stats.member_since_days >= value, progress: value === 0 ? 1 : Math.min(1, stats.member_since_days / value), current: stats.member_since_days, target: value };
    case 'score_palindrome':
      return { met: isPalindrome(stats.score), progress: isPalindrome(stats.score) ? 1 : 0, current: stats.score, target: null };
    case 'wus_prime':
      // wus_prime with value = minimum WUs for the prime check to count
      return {
        met: stats.wus >= (value || 0) && isPrime(stats.wus),
        progress: stats.wus >= (value || 0) ? (isPrime(stats.wus) ? 1 : 0.5) : Math.min(0.5, stats.wus / (value || 1)),
        current: stats.wus,
        target: value || null,
      };
    case 'special':
      return checkSpecialCondition(cond.check, stats);
    default:
      return { met: false, progress: 0, current: 0, target: null };
  }
}

/**
 * Handle special condition checks that don't fit the simple threshold pattern.
 * These cover number patterns, date-based activity, rank climbs, streaks,
 * team milestones, and meta-achievement conditions.
 *
 * Many checks are best-effort with available snapshot data; some are deferred
 * to a post-evaluation pass (meta-achievements) and always return false here.
 *
 * @param {string} check - The special condition identifier
 * @param {Object} stats - Donor stats from computeDonorStats()
 * @returns {{ met: boolean, progress: number, current: number|null, target: number|null }}
 */
function checkSpecialCondition(check, stats) {
  const score = stats.score;
  const wus = stats.wus;
  const rank = stats.rank;
  const history = stats.member_history || [];
  const members = stats.members || [];

  switch (check) {
    // --- Score-based pattern checks ---
    case 'score_odd_million':
      return boolResult(score >= 1e6 && Math.floor(score / 1e6) % 2 === 1);
    case 'score_contains_314159':
      return boolResult(String(score).includes('314159'));
    case 'score_repeating_digits':
      return boolResult(hasRepeatingDigits(score));
    case 'score_contains_777':
      return boolResult(String(score).includes('777'));
    case 'score_contains_42424242':
      return boolResult(String(score).includes('42424242'));
    case 'score_fibonacci':
      return boolResult(isFibonacci(score));
    case 'score_power_of_2':
      return boolResult(isPowerOf2(score));
    case 'score_round_million':
      return boolResult(score >= 1e6 && score % 1e6 === 0);
    case 'score_contains_2718281':
      return boolResult(String(score).includes('2718281'));
    case 'score_contains_888888':
      return boolResult(String(score).includes('888888'));
    case 'score_contains_54321':
      return boolResult(String(score).includes('54321'));
    case 'score_digits_ascending':
      return boolResult(isAscendingDigits(score));
    case 'score_only_binary_digits':
      return boolResult(isOnlyBinaryDigits(score));

    // --- WU-based pattern checks ---
    case 'wus_perfect_square_above_100':
      return boolResult(wus > 100 && isPerfectSquare(wus));
    case 'wus_power_of_10':
      return boolResult(isPowerOf10(wus));
    case 'wus_palindrome':
      return boolResult(isPalindrome(wus));
    case 'wus_exact_42':
      return boolResult(wus === 42);
    case 'wus_exact_69':
      return boolResult(wus === 69);
    case 'wus_exact_404':
      return boolResult(wus === 404);
    case 'wus_exact_1337':
      return boolResult(wus === 1337);
    case 'wus_exact_2048':
      return boolResult(wus === 2048);
    case 'score_or_wus_all_same_digits':
      return boolResult(allSameDigits(score) || allSameDigits(wus));
    case 'score_wus_same_last_2_digits':
      return boolResult(score >= 100 && wus >= 100 && (score % 100) === (wus % 100));
    case 'score_wus_same_first_3_digits':
      return boolResult(String(score).length >= 3 && String(wus).length >= 3 && String(score).slice(0, 3) === String(wus).slice(0, 3));
    case 'score_wus_rank_same_digit_3_times': {
      const d = String(score).charAt(0);
      return boolResult(String(wus).includes(d) && String(rank).includes(d));
    }

    // --- Daily WU gain thresholds ---
    case 'wus_daily_gte_10':
      return boolResult(getDailyWuGain(history) >= 10);
    case 'wus_daily_gte_50':
      return boolResult(getDailyWuGain(history) >= 50);
    case 'wus_daily_gte_100':
      return boolResult(getDailyWuGain(history) >= 100);

    // --- Rank climb achievements (total positions gained since first snapshot) ---
    case 'rank_climb_100':
      return boolResult(getRankClimb(history) >= 100);
    case 'rank_climb_1000':
      return boolResult(getRankClimb(history) >= 1000);
    case 'rank_climb_5000':
      return boolResult(getRankClimb(history) >= 5000);
    case 'rank_climb_10000':
      return boolResult(getRankClimb(history) >= 10000);
    case 'rank_climb_50000':
      return boolResult(getRankClimb(history) >= 50000);
    case 'rank_climb_100000':
      return boolResult(getRankClimb(history) >= 100000);
    case 'rank_is_palindrome':
      return boolResult(isPalindrome(rank));
    case 'rank_round_thousand':
      return boolResult(rank >= 1000 && rank % 1000 === 0);
    case 'rank_overtake_5_daily':
      return boolResult(getDailyRankGain(history) >= 5);
    case 'rank_overtake_20_daily':
      return boolResult(getDailyRankGain(history) >= 20);
    case 'rank_overtake_100_daily':
      return boolResult(getDailyRankGain(history) >= 100);
    case 'rank_defend_7_days':
      return boolResult(hasDefendedRank(history, 7));
    case 'rank_defend_30_days':
      return boolResult(hasDefendedRank(history, 30));

    // --- Streak-based achievements ---
    case 'streak_comeback_3_after_7':
      return boolResult(hasComeback(history, 7, 3));
    case 'streak_comeback_7_after_30':
      return boolResult(hasComeback(history, 30, 7));
    case 'streak_4_weekends':
      return boolResult(hasWeekendStreaks(history, 4));
    case 'streak_perfect_first_30':
      return boolResult(hasPerfectStart(history, 30));
    case 'streak_through_holidays':
      return boolResult(stats.streak >= 14); // Simplified: 14+ day streak implies crossing some holiday
    case 'streak_on_anniversary':
      return boolResult(stats.streak > 0 && stats.member_since_days >= 365);

    // --- Weekly improvement checks ---
    case 'weekly_improvement_10pct':
      return boolResult(getWeeklyImprovement(history) >= 10);
    case 'weekly_improvement_50pct':
      return boolResult(getWeeklyImprovement(history) >= 50);
    case 'weekly_improvement_100pct':
      return boolResult(getWeeklyImprovement(history) >= 100);
    case 'consistent_output_7_days':
      return boolResult(hasConsistentOutput(history, 7));
    case 'consistent_output_30_days':
      return boolResult(hasConsistentOutput(history, 30));

    // --- Team-based achievements ---
    case 'team_daily_top_scorer':
      return boolResult(isTopDailyScorer(stats));
    case 'team_weekly_top_scorer':
      return boolResult(stats.team_rank === 1);
    case 'team_daily_leader_7_times':
      return boolResult(false); // Requires persistent tracking; future enhancement
    case 'team_daily_leader_30_times':
      return boolResult(false);
    case 'active_when_new_member_joins':
      return boolResult(stats.streak >= 1);
    case 'all_members_active_same_day':
      return boolResult(false); // Requires full team daily analysis
    case 'team_total_score_gte_1b':
      return boolResult(getTeamTotalScore(members) >= 1e9);
    case 'team_total_score_gte_10b':
      return boolResult(getTeamTotalScore(members) >= 10e9);
    case 'team_total_score_gte_100b':
      return boolResult(getTeamTotalScore(members) >= 100e9);
    case 'team_total_score_gte_1t':
      return boolResult(getTeamTotalScore(members) >= 1e12);
    case 'founding_member_top_5':
      return boolResult(stats.member_since_days >= 365 && stats.team_rank <= 5);
    case 'team_daily_contribution_30_days':
      return boolResult(stats.days_active >= 30 && stats.team_pct >= 1);
    case 'team_daily_gain_100m_contributor':
      return boolResult(stats.daily_gain >= 100e6);
    case 'duo_personal_bests_same_day':
      return boolResult(false); // Requires cross-member analysis
    case 'new_member_boosts_output_10pct':
      return boolResult(false); // Requires team output tracking
    case 'team_active_members_gte_10':
      return boolResult(members.length >= 10);
    case 'team_active_members_gte_25':
      return boolResult(members.length >= 25);
    case 'team_active_members_gte_50':
      return boolResult(members.length >= 50);

    // --- Date/time-based activity achievements ---
    case 'active_during_2020':
      return boolResult(wasActiveDuringYear(history, 2020));
    case 'fold_on_jan_1':
      return boolResult(wasActiveOnDate(history, 1, 1));
    case 'fold_on_feb_29':
      return boolResult(wasActiveOnDate(history, 2, 29));
    case 'fold_on_dec_25':
      return boolResult(wasActiveOnDate(history, 12, 25));
    case 'fold_on_oct_31':
      return boolResult(wasActiveOnDate(history, 10, 31));
    case 'fold_on_feb_14':
      return boolResult(wasActiveOnDate(history, 2, 14));
    case 'fold_on_mar_14':
      return boolResult(wasActiveOnDate(history, 3, 14));
    case 'fold_on_may_4':
      return boolResult(wasActiveOnDate(history, 5, 4));
    case 'fold_on_oct_1':
      return boolResult(wasActiveOnDate(history, 10, 1));
    case 'fold_on_friday_13':
      return boolResult(wasActiveOnFriday13(history));
    case 'fold_on_easter':
      return boolResult(false); // Easter date computation is complex; deferred
    case 'activity_at_midnight':
      return boolResult(false); // Requires hourly granularity data
    case 'activity_between_midnight_and_5am':
      return boolResult(false); // Requires hourly granularity data
    case 'longest_serving_member':
      return boolResult(stats.member_since_days >= 730); // Simplified: 2+ years
    case 'joined_same_day_as_another':
      return boolResult(false); // Requires cross-member join date analysis

    // --- Activity percentage thresholds ---
    case 'active_pct_gte_50':
      return boolResult(getActivityPct(stats) >= 50);
    case 'active_pct_gte_75':
      return boolResult(getActivityPct(stats) >= 75);
    case 'active_pct_gte_90':
      return boolResult(getActivityPct(stats) >= 90);
    case 'active_pct_gte_99':
      return boolResult(getActivityPct(stats) >= 99);

    // --- Special month/pattern achievements ---
    case 'fold_5_holidays_one_year':
      return boolResult(false); // Requires holiday date tracking
    case 'weekend_score_gt_weekday_for_month':
      return boolResult(false); // Requires day-of-week analysis
    case 'fold_every_day_july':
      return boolResult(hasFoldedEveryDayInMonth(history, 7));
    case 'fold_every_day_december':
      return boolResult(hasFoldedEveryDayInMonth(history, 12));
    case 'fold_every_day_any_month':
      return boolResult(hasFoldedEveryDayAnyMonth(history));
    case 'fold_first_of_month_6_months':
      return boolResult(hasFoldedFirstOfMonth(history, 6));
    case 'no_zero_day_first_60':
      return boolResult(hasPerfectStart(history, 60));

    // --- Efficiency special: golden ratio pattern ---
    case 'efficiency_near_golden_ratio': {
      const ratio = stats.efficiency;
      // Normalize to check if leading digits match 1.618 (golden ratio)
      const digits = Math.floor(Math.log10(Math.max(ratio, 1)));
      const normalized = ratio / Math.pow(10, digits);
      return boolResult(Math.abs(normalized - 1.618) < 0.01);
    }

    // --- Meta-achievements (evaluated in second pass after main loop) ---
    case '10_achievements_not_top_3':
      return boolResult(false);
    case 'return_after_30_days_inactive':
      return boolResult(hasReturnedAfterInactivity(history, 30));
    case 'first_day_score_gte_1m':
      return boolResult(history.length >= 2 && (history[1].score - history[0].score) >= 1e6);
    case '10_achievements_in_one_day':
      return boolResult(false);
    case '7_categories_in_one_week':
      return boolResult(false);
    case 'outperform_higher_ranked_7_days':
      return boolResult(false); // Requires cross-member analysis

    // --- Achievement-based meta specials (resolved in post-pass) ---
    case 'achievements_unlocked_pct_50':
    case 'achievements_unlocked_pct_90':
    case 'achievements_unlocked_pct_100':
    case 'legendary_unlocked_gte_10':
    case 'achievement_in_every_category':
    case 'achievement_points_gte_1000':
    case 'achievement_points_gte_5000':
    case 'achievement_points_maximum':
      return boolResult(false);

    default:
      return boolResult(false);
  }
}

/**
 * Wrap a boolean into the standard achievement result shape.
 * @param {boolean} met - Whether the condition is satisfied
 * @returns {{ met: boolean, progress: number, current: null, target: null }}
 */
function boolResult(met) {
  return { met: !!met, progress: met ? 1 : 0, current: null, target: null };
}

// ============================================================
// Achievement helper functions - history analysis
// ============================================================

/**
 * Check if all digits in a number are identical (e.g. 11, 333, 9999).
 * @param {number} n
 * @returns {boolean}
 */
function allSameDigits(n) {
  const s = String(n);
  return s.length >= 2 && /^(\d)\1+$/.test(s);
}

/**
 * Get the WU gain between the two most recent snapshots.
 * @param {Array<Object>} history - Ascending-sorted daily snapshots
 * @returns {number} WU gain (0 if insufficient data)
 */
function getDailyWuGain(history) {
  if (history.length < 2) return 0;
  return Math.max(0, history[history.length - 1].wus - history[history.length - 2].wus);
}

/**
 * Calculate total rank positions climbed from first to latest snapshot.
 * @param {Array<Object>} history
 * @returns {number} Positive number of positions gained (higher = better)
 */
function getRankClimb(history) {
  if (history.length < 2) return 0;
  const first = history[0].best_rank || history[0].rank || 999999;
  const last = history[history.length - 1].best_rank || history[history.length - 1].rank || 999999;
  return Math.max(0, first - last);
}

/**
 * Calculate rank positions gained in the most recent day.
 * @param {Array<Object>} history
 * @returns {number}
 */
function getDailyRankGain(history) {
  if (history.length < 2) return 0;
  const prev = history[history.length - 2].best_rank || history[history.length - 2].rank || 999999;
  const last = history[history.length - 1].best_rank || history[history.length - 1].rank || 999999;
  return Math.max(0, prev - last);
}

/**
 * Check if the donor held or improved their rank for N consecutive days.
 * @param {Array<Object>} history
 * @param {number} days - Minimum consecutive days to defend
 * @returns {boolean}
 */
function hasDefendedRank(history, days) {
  if (history.length < days) return false;
  const tail = history.slice(-days);
  const baseRank = tail[0].best_rank || tail[0].rank;
  return tail.every(h => (h.best_rank || h.rank) <= baseRank);
}

/**
 * Detect a comeback: inactiveDays of no WU gain followed by activeDays of consecutive gains.
 * @param {Array<Object>} history
 * @param {number} inactiveDays - Minimum gap length (no WU change)
 * @param {number} activeDays - Minimum active streak after the gap
 * @returns {boolean}
 */
function hasComeback(history, inactiveDays, activeDays) {
  if (history.length < inactiveDays + activeDays) return false;
  for (let i = 1; i < history.length - activeDays; i++) {
    const gapStart = i;
    let gapLen = 0;
    while (gapStart + gapLen < history.length - 1 && history[gapStart + gapLen + 1].wus === history[gapStart + gapLen].wus) {
      gapLen++;
    }
    if (gapLen >= inactiveDays) {
      let activeLen = 0;
      const resumeIdx = gapStart + gapLen;
      for (let j = resumeIdx; j < history.length - 1; j++) {
        if (history[j + 1].wus > history[j].wus) activeLen++;
        else break;
      }
      if (activeLen >= activeDays) return true;
    }
  }
  return false;
}

/**
 * Check if a donor was active on at least N*2 weekend days (Sat/Sun).
 * @param {Array<Object>} history
 * @param {number} weekends - Required number of weekends
 * @returns {boolean}
 */
function hasWeekendStreaks(history, weekends) {
  let count = 0;
  for (const h of history) {
    const d = new Date(h.date);
    const dayOfWeek = d.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) count++;
  }
  return count >= weekends * 2; // 2 weekend days per weekend
}

/**
 * Check if the donor had WU gains every day for the first N days of history.
 * @param {Array<Object>} history
 * @param {number} days - Number of consecutive days from start
 * @returns {boolean}
 */
function hasPerfectStart(history, days) {
  if (history.length < days + 1) return false;
  for (let i = 1; i <= days && i < history.length; i++) {
    if (history[i].wus <= history[i - 1].wus) return false;
  }
  return true;
}

/**
 * Calculate the week-over-week score improvement as a percentage.
 * Compares the most recent 7-day gain to the previous 7-day gain.
 * @param {Array<Object>} history - Needs at least 15 entries
 * @returns {number} Improvement percentage (0 if insufficient data or no previous gain)
 */
function getWeeklyImprovement(history) {
  if (history.length < 15) return 0;
  const recentWeek = history.slice(-7);
  const prevWeek = history.slice(-14, -7);
  const recentGain = recentWeek[recentWeek.length - 1].score - recentWeek[0].score;
  const prevGain = prevWeek[prevWeek.length - 1].score - prevWeek[0].score;
  if (prevGain <= 0) return 0;
  return ((recentGain - prevGain) / prevGain) * 100;
}

/**
 * Check if daily score gains were consistent (within +/-50% of average) over N days.
 * @param {Array<Object>} history
 * @param {number} days - Window size for consistency check
 * @returns {boolean}
 */
function hasConsistentOutput(history, days) {
  if (history.length < days + 1) return false;
  const tail = history.slice(-days - 1);
  const gains = [];
  for (let i = 1; i < tail.length; i++) {
    gains.push(tail[i].score - tail[i - 1].score);
  }
  if (gains.length === 0 || gains.some(g => g <= 0)) return false;
  const avg = gains.reduce((a, b) => a + b, 0) / gains.length;
  return gains.every(g => g >= avg * 0.5 && g <= avg * 1.5);
}

/**
 * @param {Object} stats - Donor stats
 * @returns {boolean} True if the donor is #1 on the team with a positive daily gain
 */
function isTopDailyScorer(stats) {
  return stats.team_rank === 1 && stats.daily_gain > 0;
}

/**
 * @param {Array<Object>} members - All team members
 * @returns {number} Sum of all member scores
 */
function getTeamTotalScore(members) {
  return members.reduce((s, m) => s + m.score, 0);
}

/**
 * Check if any snapshot falls within a given calendar year.
 * @param {Array<Object>} history
 * @param {number} year
 * @returns {boolean}
 */
function wasActiveDuringYear(history, year) {
  return history.some(h => h.date && h.date.startsWith(String(year)));
}

/**
 * Check if the donor had a WU gain on a specific month/day (any year).
 * @param {Array<Object>} history
 * @param {number} month - 1-12
 * @param {number} day - 1-31
 * @returns {boolean}
 */
function wasActiveOnDate(history, month, day) {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  for (let i = 1; i < history.length; i++) {
    if (history[i].date && history[i].date.endsWith(`-${mm}-${dd}`)) {
      if (history[i].wus > history[i - 1].wus) return true;
    }
  }
  return false;
}

/**
 * Check if the donor was active on any Friday the 13th.
 * @param {Array<Object>} history
 * @returns {boolean}
 */
function wasActiveOnFriday13(history) {
  for (let i = 1; i < history.length; i++) {
    const d = new Date(history[i].date);
    if (d.getDate() === 13 && d.getDay() === 5 && history[i].wus > history[i - 1].wus) {
      return true;
    }
  }
  return false;
}

/**
 * Calculate the percentage of days the donor was active (had WU gains).
 * @param {Object} stats
 * @returns {number} Activity percentage (0-100)
 */
function getActivityPct(stats) {
  if (stats.member_since_days <= 0) return 100;
  return Math.min(100, (stats.days_active / stats.member_since_days) * 100);
}

/**
 * Check if the donor folded every day in a specific month (any year).
 * Groups history by year-month and checks if all calendar days were active.
 * @param {Array<Object>} history
 * @param {number} month - 1-12
 * @returns {boolean}
 */
function hasFoldedEveryDayInMonth(history, month) {
  const mm = String(month).padStart(2, '0');
  const byYearMonth = {};
  for (let i = 1; i < history.length; i++) {
    const d = history[i].date;
    if (!d) continue;
    const ym = d.slice(0, 7); // "YYYY-MM"
    if (ym.endsWith(`-${mm}`)) {
      if (history[i].wus > history[i - 1].wus) {
        if (!byYearMonth[ym]) byYearMonth[ym] = new Set();
        byYearMonth[ym].add(parseInt(d.slice(8, 10)));
      }
    }
  }
  for (const ym of Object.keys(byYearMonth)) {
    const year = parseInt(ym.slice(0, 4));
    const daysInMonth = new Date(year, month, 0).getDate();
    if (byYearMonth[ym].size >= daysInMonth) return true;
  }
  return false;
}

/**
 * Check if the donor folded every day of any single calendar month.
 * @param {Array<Object>} history
 * @returns {boolean}
 */
function hasFoldedEveryDayAnyMonth(history) {
  for (let m = 1; m <= 12; m++) {
    if (hasFoldedEveryDayInMonth(history, m)) return true;
  }
  return false;
}

/**
 * Check if the donor was active on the 1st of the month for N distinct months.
 * @param {Array<Object>} history
 * @param {number} months - Minimum number of distinct year-months
 * @returns {boolean}
 */
function hasFoldedFirstOfMonth(history, months) {
  let count = 0;
  const seen = new Set();
  for (let i = 1; i < history.length; i++) {
    const d = history[i].date;
    if (!d) continue;
    if (d.endsWith('-01') && history[i].wus > history[i - 1].wus) {
      const ym = d.slice(0, 7);
      if (!seen.has(ym)) {
        seen.add(ym);
        count++;
      }
    }
  }
  return count >= months;
}

/**
 * Check if the donor returned to activity after a period of inactivity.
 * Scans history for a gap of N+ days with no WU change, followed by a gain.
 * @param {Array<Object>} history
 * @param {number} inactiveDays - Minimum inactive gap length
 * @returns {boolean}
 */
function hasReturnedAfterInactivity(history, inactiveDays) {
  if (history.length < inactiveDays + 2) return false;
  let inactiveCount = 0;
  for (let i = 1; i < history.length; i++) {
    if (history[i].wus === history[i - 1].wus) {
      inactiveCount++;
    } else {
      if (inactiveCount >= inactiveDays) return true;
      inactiveCount = 0;
    }
  }
  return false;
}

// ============================================================
// Achievement engine - main evaluation
// ============================================================

/**
 * Evaluate all achievements for a given donor. This is the main entry point
 * for the achievement system, performing two passes:
 *
 *  1. First pass: evaluate all standard achievement conditions against donor stats.
 *  2. Second pass: evaluate meta-achievements that depend on the count/composition
 *     of already-unlocked achievements (e.g. "unlock 50% of all achievements").
 *
 * Newly unlocked achievements are persisted to the database.
 *
 * @param {string} donorName - The donor's F@H display name
 * @returns {Promise<Object|null>} Achievement summary with unlocked/locked arrays,
 *   counts, points, and completion percentage. Null if member not found.
 */
async function evaluateDonorAchievements(donorName) {
  // Fetch current member data from F@H API (cached)
  const raw = await fahFetch('/team/' + TEAM_ID + '/members');
  const members = parseMembers(raw);
  const member = members.find(m => m.name === donorName);
  if (!member) return null;

  // Get member history from DB (ascending by date, max 1000 days)
  const memberHistory = db.prepare(
    "SELECT strftime('%Y-%m-%d', timestamp) as date, MAX(score) as score, MAX(wus) as wus, MIN(rank) as best_rank FROM member_snapshots WHERE name = ? GROUP BY date ORDER BY date ASC LIMIT 1000"
  ).all(donorName);

  const stats = computeDonorStats(member, members, memberHistory);

  // Get already-unlocked achievements from DB
  const dbUnlocked = getUnlockedAchievements.all(donorName);
  const unlockedSet = new Set(dbUnlocked.map(r => r.achievement_id));
  const unlockedDateMap = {};
  for (const r of dbUnlocked) unlockedDateMap[r.achievement_id] = r.unlocked_at;

  const unlocked = [];
  const locked = [];
  const newlyUnlocked = [];

  // First pass: evaluate all non-meta achievements
  for (const achievement of ALL_ACHIEVEMENTS) {
    const result = checkCondition(achievement, stats);

    if (result.met || unlockedSet.has(achievement.id)) {
      unlocked.push({
        ...achievement,
        unlocked_at: unlockedDateMap[achievement.id] || new Date().toISOString(),
      });
      if (!unlockedSet.has(achievement.id)) {
        newlyUnlocked.push(achievement.id);
        unlockedSet.add(achievement.id);
      }
    } else {
      locked.push({
        ...achievement,
        progress: result.progress,
        current: result.current,
        target: result.target,
        hint: achievement.hint || achievement.description,
      });
    }
  }

  // Second pass: evaluate meta-achievements that depend on unlocked count/points
  const unlockedCount = unlocked.length;
  const pointsEarned = unlocked.reduce((s, a) => s + (a.points || 0), 0);
  const categories = new Set(unlocked.map(a => a.category));
  const legendaryCount = unlocked.filter(a => a.tier === 'legendary').length;

  const metaChecks = {
    'achievements_unlocked_pct_50': unlockedCount >= ALL_ACHIEVEMENTS.length * 0.5,
    'achievements_unlocked_pct_90': unlockedCount >= ALL_ACHIEVEMENTS.length * 0.9,
    'achievements_unlocked_pct_100': unlockedCount >= ALL_ACHIEVEMENTS.length,
    'legendary_unlocked_gte_10': legendaryCount >= 10,
    'achievement_in_every_category': categories.size >= new Set(ALL_ACHIEVEMENTS.map(a => a.category)).size,
    'achievement_points_gte_1000': pointsEarned >= 1000,
    'achievement_points_gte_5000': pointsEarned >= 5000,
    'achievement_points_maximum': pointsEarned >= TOTAL_ACHIEVEMENT_POINTS,
    '10_achievements_not_top_3': unlockedCount >= 10 && stats.team_rank > 3,
  };

  // Move matching locked meta-achievements to unlocked (iterate backwards for safe splice)
  for (let i = locked.length - 1; i >= 0; i--) {
    const a = locked[i];
    if (a.condition && a.condition.type === 'special' && metaChecks[a.condition.check] === true) {
      locked.splice(i, 1);
      unlocked.push({
        ...a,
        progress: undefined,
        current: undefined,
        target: undefined,
        hint: undefined,
        unlocked_at: new Date().toISOString(),
      });
      if (!unlockedSet.has(a.id)) {
        newlyUnlocked.push(a.id);
        unlockedSet.add(a.id);
      }
    }
  }

  // Persist newly unlocked achievements to DB
  if (newlyUnlocked.length > 0) {
    insertManyAchievements(donorName, newlyUnlocked);
  }

  const finalPointsEarned = unlocked.reduce((s, a) => s + (a.points || 0), 0);

  return {
    unlocked,
    locked,
    total: ALL_ACHIEVEMENTS.length,
    unlocked_count: unlocked.length,
    points_earned: finalPointsEarned,
    points_total: TOTAL_ACHIEVEMENT_POINTS,
    completion_pct: parseFloat(((unlocked.length / ALL_ACHIEVEMENTS.length) * 100).toFixed(1)),
  };
}

// ============================================================
// In-memory API cache (TTL-based with LRU eviction)
// ============================================================
const cache = new Map();

/**
 * Retrieve a cached value if it exists and hasn't expired.
 * @param {string} key - Cache key (typically an API endpoint path)
 * @returns {*} Cached data, or null if miss/expired
 */
function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data;
  }
  return null;
}

/**
 * Store a value in the cache. If the cache is full, evicts the oldest entry.
 * @param {string} key - Cache key
 * @param {*} data - Data to cache
 */
function setCache(key, data) {
  // SECURITY: Evict oldest entries if cache exceeds max size to prevent memory exhaustion.
  // The cache is keyed by API endpoint paths which are bounded, but defend in depth.
  if (cache.size >= CACHE_MAX_ENTRIES) {
    let oldestKey = null;
    let oldestTs = Infinity;
    for (const [k, v] of cache) {
      if (v.timestamp < oldestTs) {
        oldestTs = v.timestamp;
        oldestKey = k;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Fetch data from the Folding@Home API with caching and a 15-second timeout.
 * Results are cached for CACHE_TTL (1 hour) to reduce upstream load.
 *
 * @param {string} endpoint - API path (e.g. '/team/240890/members')
 * @returns {Promise<*>} Parsed JSON response
 * @throws {Error} On non-OK status or network failure
 */
async function fahFetch(endpoint) {
  const cached = getCached(endpoint);
  if (cached) return cached;

  // SECURITY: Timeout prevents hanging if upstream F@H API is slow or unresponsive.
  // AbortController ensures the connection is actually closed, not just ignored.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${FAH_API}${endpoint}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`F@H API error: ${res.status}`);
    const data = await res.json();
    setCache(endpoint, data);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================
// Periodic snapshot scheduler
// ============================================================

/**
 * Take a point-in-time snapshot of team and member data from the F@H API.
 * Stores results in SQLite, detects milestone crossings, and re-evaluates
 * achievements for all active members.
 *
 * Called once on startup and then every SNAPSHOT_INTERVAL (1 hour).
 */
async function takeSnapshot() {
  try {
    const [teamData, rawMembers] = await Promise.all([
      fahFetch(`/team/${TEAM_ID}`),
      fahFetch(`/team/${TEAM_ID}/members`),
    ]);

    const members = parseMembers(rawMembers);

    insertTeamSnapshot.run({
      score: teamData.score,
      wus: teamData.wus,
      rank: teamData.rank,
      member_count: members.length,
    });

    insertManyMembers(members.map(m => ({
      name: m.name,
      fah_id: m.id,
      score: m.score,
      wus: m.wus,
      rank: m.rank,
    })));

    // Detect milestone crossings for each member
    for (const m of members) {
      for (const threshold of MILESTONE_THRESHOLDS) {
        if (m.score >= threshold) {
          insertMilestone.run(m.name, String(threshold), m.score);
        }
      }
    }

    console.log(`[SNAPSHOT] score=${teamData.score}, members=${members.length}`);

    // Re-evaluate achievements for active members.
    // SECURITY/DoS: Cap evaluation to prevent CPU exhaustion if member list grows very large.
    const MAX_ACHIEVEMENT_EVAL = 500;
    const evalMembers = members.slice(0, MAX_ACHIEVEMENT_EVAL);
    if (members.length > MAX_ACHIEVEMENT_EVAL) {
      console.warn(`[SNAPSHOT] Capping achievement evaluation to ${MAX_ACHIEVEMENT_EVAL} of ${members.length} members`);
    }
    for (const m of evalMembers) {
      try {
        await evaluateDonorAchievements(m.name);
      } catch (achErr) {
        console.error(`[ACHIEVEMENT EVAL ERROR] ${m.name}:`, achErr.message);
      }
    }
    console.log(`[SNAPSHOT] Achievement evaluation complete for ${evalMembers.length} members`);

    // Record MOTW (Member of the Week) in history table on weekly boundaries
    const currentWeek = new Date().toISOString().slice(0, 10);
    const existingMotw = db.prepare('SELECT week FROM motw_history WHERE week = ?').get(currentWeek);
    if (!existingMotw) {
      const motwData = db.prepare(`
        WITH latest AS (
          SELECT name, MAX(score) as current_score, MAX(wus) as current_wus
          FROM member_snapshots WHERE timestamp >= datetime('now', '-1 day') GROUP BY name
        ),
        week_ago AS (
          SELECT name, MIN(score) as old_score, MIN(wus) as old_wus
          FROM member_snapshots
          WHERE timestamp >= datetime('now', '-8 days') AND timestamp < datetime('now', '-6 days')
          GROUP BY name
        )
        SELECT l.name,
          l.current_score - COALESCE(w.old_score, l.current_score) as score_gain,
          l.current_wus - COALESCE(w.old_wus, l.current_wus) as wu_gain
        FROM latest l LEFT JOIN week_ago w ON l.name = w.name
        ORDER BY score_gain DESC LIMIT 1
      `).get();
      if (motwData && motwData.score_gain > 0) {
        insertMotwHistory.run(currentWeek, motwData.name, motwData.score_gain, motwData.wu_gain);
        console.log(`[SNAPSHOT] MOTW recorded: ${motwData.name} (+${motwData.score_gain})`);
      }
    }

    // Update challenge progress for active challenges
    const activeChallenges = db.prepare('SELECT * FROM challenges WHERE active = 1 AND end_date >= date(\'now\')').all();
    for (const challenge of activeChallenges) {
      for (const m of members) {
        let progress = 0;
        if (challenge.type === 'score') {
          progress = m.score;
        } else if (challenge.type === 'wus') {
          progress = m.wus;
        } else if (challenge.type === 'score_gain') {
          const snap = db.prepare(
            'SELECT MIN(score) as start_score FROM member_snapshots WHERE name = ? AND timestamp >= ?'
          ).get(m.name, challenge.start_date);
          progress = snap ? m.score - (snap.start_score || 0) : 0;
        } else if (challenge.type === 'wu_gain') {
          const snap = db.prepare(
            'SELECT MIN(wus) as start_wus FROM member_snapshots WHERE name = ? AND timestamp >= ?'
          ).get(m.name, challenge.start_date);
          progress = snap ? m.wus - (snap.start_wus || 0) : 0;
        }
        if (progress > 0) {
          updateChallengeProgress.run(challenge.id, m.name, progress);
        }
      }
    }

    // Evaluate quest progress for all members
    const today = new Date().toISOString().split('T')[0];
    const weekKey = today.slice(0, 4) + '-W' + String(Math.ceil((new Date(today).getDate()) / 7)).padStart(2, '0') + '-' + today.slice(5, 7);
    const monthKey = today.slice(0, 7);
    const activeQuests = db.prepare('SELECT * FROM quest_definitions WHERE active = 1').all();

    for (const m of members) {
      // Get period start snapshots for gain calculations
      const dayStart = db.prepare(
        "SELECT MIN(score) as score, MIN(wus) as wus FROM member_snapshots WHERE name = ? AND timestamp >= date('now')"
      ).get(m.name);
      const weekStart = db.prepare(
        "SELECT MIN(score) as score, MIN(wus) as wus FROM member_snapshots WHERE name = ? AND timestamp >= date('now', 'weekday 0', '-7 days')"
      ).get(m.name);
      const monthStart = db.prepare(
        "SELECT MIN(score) as score, MIN(wus) as wus FROM member_snapshots WHERE name = ? AND timestamp >= date('now', 'start of month')"
      ).get(m.name);

      // Compute daily streak
      const recentHist = db.prepare(
        "SELECT strftime('%Y-%m-%d', timestamp) as date, MAX(wus) as wus FROM member_snapshots WHERE name = ? GROUP BY date ORDER BY date DESC LIMIT 14"
      ).all(m.name).reverse();
      let streak = 0;
      for (let i = recentHist.length - 1; i >= 1; i--) {
        if (recentHist[i].wus > recentHist[i - 1].wus) streak++;
        else break;
      }

      const sorted2 = [...members].sort((a2, b2) => b2.score - a2.score);
      const tRank = sorted2.findIndex(m2 => m2.name === m.name) + 1;

      for (const quest of activeQuests) {
        let periodKey;
        let startSnap;
        if (quest.frequency === 'daily') { periodKey = today; startSnap = dayStart; }
        else if (quest.frequency === 'weekly') { periodKey = weekKey; startSnap = weekStart; }
        else { periodKey = monthKey; startSnap = monthStart; }

        let progress = 0;
        if (quest.type === 'wu_gain' && startSnap && startSnap.wus) {
          progress = m.wus - startSnap.wus;
        } else if (quest.type === 'score_gain' && startSnap && startSnap.score) {
          progress = m.score - startSnap.score;
        } else if (quest.type === 'streak') {
          progress = streak;
        } else if (quest.type === 'team_rank') {
          progress = tRank <= quest.target ? quest.target : tRank;
        }

        const existing = db.prepare(
          'SELECT completed FROM quest_progress WHERE quest_id = ? AND donor_name = ? AND period_key = ?'
        ).get(quest.id, m.name, periodKey);

        const wasCompleted = existing && existing.completed;
        const nowCompleted = progress >= quest.target;

        upsertQuestProgress.run(
          quest.id, m.name, periodKey,
          Math.max(0, progress),
          nowCompleted ? 1 : 0,
          nowCompleted && !wasCompleted ? new Date().toISOString() : (existing ? null : null)
        );

        // Award XP on first completion
        if (nowCompleted && !wasCompleted) {
          const currentXp = db.prepare('SELECT total_xp, quests_completed FROM donor_xp WHERE donor_name = ?').get(m.name);
          const oldXp = currentXp ? currentXp.total_xp : 0;
          const oldCompleted = currentXp ? currentXp.quests_completed : 0;
          const newXp = oldXp + quest.xp_reward;
          const newLevel = levelFromXp(newXp);
          const newCompleted = oldCompleted + 1;
          upsertDonorXp.run(m.name, newXp, newLevel, newCompleted, newXp, newLevel, newCompleted);
        }
      }

      // Award raffle tickets: 1 ticket for being active (any WU gain today)
      if (dayStart && dayStart.wus && m.wus > dayStart.wus) {
        upsertRaffleEntry.run(monthKey, m.name, 1, 1);
      }
    }
    console.log(`[SNAPSHOT] Quest progress and raffle entries updated for ${members.length} members`);

    // Season XP: award XP based on score_delta and wu_delta since last snapshot
    const season = ensureCurrentSeason();
    if (season) {
      for (const m of members) {
        const prevSnap = db.prepare(
          "SELECT score, wus FROM member_snapshots WHERE name = ? AND timestamp < datetime('now', '-30 minutes') ORDER BY timestamp DESC LIMIT 1"
        ).get(m.name);
        if (prevSnap) {
          const scoreDelta = Math.max(0, m.score - prevSnap.score);
          const wusDelta = Math.max(0, m.wus - prevSnap.wus);
          // 1 XP per 100k score + 2 XP per WU + streak bonus
          const recentHist2 = db.prepare(
            "SELECT strftime('%Y-%m-%d', timestamp) as date, MAX(wus) as wus FROM member_snapshots WHERE name = ? GROUP BY date ORDER BY date DESC LIMIT 14"
          ).all(m.name).reverse();
          let memberStreak = 0;
          for (let si = recentHist2.length - 1; si >= 1; si--) {
            if (recentHist2[si].wus > recentHist2[si - 1].wus) memberStreak++;
            else break;
          }
          const streakBonus = Math.min(memberStreak * 5, 50); // up to 50 bonus XP from streak
          const xpGain = Math.floor(scoreDelta / 100000) + wusDelta * 2 + (wusDelta > 0 ? streakBonus : 0);
          if (xpGain > 0) {
            const existing = db.prepare('SELECT xp FROM season_xp WHERE season_id = ? AND donor_name = ?').get(season.id, m.name);
            const newXp = (existing ? existing.xp : 0) + xpGain;
            db.prepare('INSERT INTO season_xp (season_id, donor_name, xp, wins) VALUES (?, ?, ?, 0) ON CONFLICT(season_id, donor_name) DO UPDATE SET xp = ?')
              .run(season.id, m.name, newXp, newXp);
          }
        }
      }
      console.log(`[SNAPSHOT] Season XP updated for season "${season.name}"`);
    }

    // Versus: finalize old duels, update current duel scores, create new duels if needed
    finalizeExpiredDuels();
    // Update current duel scores
    const activeDuels = db.prepare("SELECT * FROM versus_duels WHERE status = 'active'").all();
    for (const duel of activeDuels) {
      const m1 = members.find(m => m.name === duel.member1);
      const m2 = members.find(m => m.name === duel.member2);
      if (m1) db.prepare('UPDATE versus_duels SET score1_current = ? WHERE id = ?').run(m1.score, duel.id);
      if (m2) db.prepare('UPDATE versus_duels SET score2_current = ? WHERE id = ?').run(m2.score, duel.id);
    }
    // Create weekly duels if none exist for current week
    createWeeklyDuels(members);
    console.log(`[SNAPSHOT] Versus duels updated`);
  } catch (err) {
    console.error('[SNAPSHOT ERROR]', err.message);
  }
}

// Take first snapshot on startup, then every hour
takeSnapshot();
const snapshotInterval = setInterval(takeSnapshot, SNAPSHOT_INTERVAL);

// ============================================================
// Static file serving
// ============================================================
// SECURITY: dotfiles denied prevents serving .env, .git, etc. if they somehow
// end up in public/. extensions is false to prevent extension guessing.
app.use(express.static(path.join(__dirname, 'public'), {
  dotfiles: 'deny',
  index: 'index.html',
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    // Longer cache for immutable assets (images, fonts)
    if (/\.(png|jpg|jpeg|gif|ico|svg|woff2?)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    }
  },
}));

// ============================================================
// API routes - live proxy to F@H API
// ============================================================

/** GET /api/team - Proxy team summary from F@H API */
app.get('/api/team', async (req, res) => {
  try {
    const data = await fahFetch(`/team/${TEAM_ID}`);
    res.json(data);
  } catch (err) {
    console.error('[API /api/team]', err.message);
    res.status(502).json({ error: 'Failed to fetch team data from upstream API.' });
  }
});

/** GET /api/members - Proxy and parse team member list from F@H API */
app.get('/api/members', async (req, res) => {
  try {
    const raw = await fahFetch(`/team/${TEAM_ID}/members`);
    res.json(parseMembers(raw));
  } catch (err) {
    console.error('[API /api/members]', err.message);
    res.status(502).json({ error: 'Failed to fetch member data from upstream API.' });
  }
});

/** GET /api/member/:name/stats - Proxy individual member stats */
app.get('/api/member/:name/stats', async (req, res) => {
  const name = validateName(req.params.name);
  if (!name) return res.status(400).json({ error: 'Invalid member name.' });

  try {
    const data = await fahFetch(`/user/${encodeURIComponent(name)}/stats`);
    res.json(data);
  } catch (err) {
    console.error('[API /api/member/stats]', err.message);
    res.status(502).json({ error: 'Failed to fetch member stats from upstream API.' });
  }
});

/** GET /api/member/:name/projects - Proxy member's project list */
app.get('/api/member/:name/projects', async (req, res) => {
  const name = validateName(req.params.name);
  if (!name) return res.status(400).json({ error: 'Invalid member name.' });

  try {
    const data = await fahFetch(`/user/${encodeURIComponent(name)}/projects`);
    res.json(data);
  } catch (err) {
    console.error('[API /api/member/projects]', err.message);
    res.status(502).json({ error: 'Failed to fetch member projects from upstream API.' });
  }
});

/** GET /api/leaderboard - Proxy global team leaderboard */
app.get('/api/leaderboard', async (req, res) => {
  try {
    const data = await fahFetch('/team');
    res.json(data);
  } catch (err) {
    console.error('[API /api/leaderboard]', err.message);
    res.status(502).json({ error: 'Failed to fetch leaderboard from upstream API.' });
  }
});

// ============================================================
// API routes - historical data from SQLite
// ============================================================

/**
 * GET /api/history/team - Team score/WU history aggregated by time period.
 * Query params: period (hourly|daily|weekly|monthly|yearly), limit (max 5000)
 */
app.get('/api/history/team', (req, res) => {
  const period = validatePeriod(req.query.period);
  const limit = validatePositiveInt(req.query.limit, 365, 5000);
  const groupBy = PERIOD_TO_GROUP_BY[period];

  const rows = db.prepare(`
    SELECT
      ${groupBy} as date,
      MAX(score) as score,
      MAX(wus) as wus,
      MIN(rank) as best_rank,
      MAX(member_count) as members,
      COUNT(*) as samples
    FROM team_snapshots
    GROUP BY ${groupBy}
    ORDER BY date DESC
    LIMIT ?
  `).all(limit);

  // Compute period-over-period deltas after reversing to chronological order
  const result = rows.reverse().map((row, i, arr) => ({
    ...row,
    score_delta: i > 0 ? row.score - arr[i - 1].score : 0,
    wus_delta: i > 0 ? row.wus - arr[i - 1].wus : 0,
  }));

  res.json(result);
});

/**
 * GET /api/history/member/:name - Individual member score/WU history.
 * Query params: period, limit (same as team history)
 */
app.get('/api/history/member/:name', (req, res) => {
  const name = validateName(req.params.name);
  if (!name) return res.status(400).json({ error: 'Invalid member name.' });

  const period = validatePeriod(req.query.period);
  const limit = validatePositiveInt(req.query.limit, 365, 5000);
  const groupBy = PERIOD_TO_GROUP_BY[period];

  const rows = db.prepare(`
    SELECT
      ${groupBy} as date,
      MAX(score) as score,
      MAX(wus) as wus,
      MIN(rank) as best_rank
    FROM member_snapshots
    WHERE name = ?
    GROUP BY ${groupBy}
    ORDER BY date DESC
    LIMIT ?
  `).all(name, limit);

  const result = rows.reverse().map((row, i, arr) => ({
    ...row,
    score_delta: i > 0 ? row.score - arr[i - 1].score : 0,
    wus_delta: i > 0 ? row.wus - arr[i - 1].wus : 0,
  }));

  res.json(result);
});

/**
 * GET /api/history/movers - Top members by score gain over N days.
 * Query params: days (default 7, max 365)
 */
app.get('/api/history/movers', (req, res) => {
  const days = validatePositiveInt(req.query.days, 7, 365);

  const rows = db.prepare(`
    WITH latest AS (
      SELECT name, MAX(score) as current_score, MAX(wus) as current_wus
      FROM member_snapshots
      WHERE timestamp >= datetime('now', '-1 day')
      GROUP BY name
    ),
    earlier AS (
      SELECT name, MIN(score) as old_score, MIN(wus) as old_wus
      FROM member_snapshots
      WHERE timestamp >= datetime('now', '-' || ? || ' days')
        AND timestamp < datetime('now', '-' || (? - 1) || ' days')
      GROUP BY name
    )
    SELECT
      l.name,
      l.current_score,
      l.current_wus,
      COALESCE(e.old_score, l.current_score) as old_score,
      COALESCE(e.old_wus, l.current_wus) as old_wus,
      l.current_score - COALESCE(e.old_score, l.current_score) as score_gained,
      l.current_wus - COALESCE(e.old_wus, l.current_wus) as wus_gained
    FROM latest l
    LEFT JOIN earlier e ON l.name = e.name
    ORDER BY score_gained DESC
    LIMIT 200
  `).all(days, days);

  res.json(rows);
});

/** GET /api/history/summary - Database-level statistics (snapshot counts, date range) */
app.get('/api/history/summary', (req, res) => {
  const teamCount = db.prepare('SELECT COUNT(*) as count FROM team_snapshots').get();
  const memberCount = db.prepare('SELECT COUNT(DISTINCT name) as count FROM member_snapshots').get();
  const first = db.prepare('SELECT MIN(timestamp) as ts FROM team_snapshots').get();
  const last = db.prepare('SELECT MAX(timestamp) as ts FROM team_snapshots').get();
  const totalSnapshots = db.prepare('SELECT COUNT(*) as count FROM member_snapshots').get();

  res.json({
    team_snapshots: teamCount.count,
    unique_members_tracked: memberCount.count,
    total_member_snapshots: totalSnapshots.count,
    first_snapshot: first.ts,
    last_snapshot: last.ts,
    tracking_since: first.ts,
  });
});

// ============================================================
// API routes - analytics & predictions
// ============================================================

/** GET /api/milestones - Calculate next score milestones with ETAs based on 7-day rate */
app.get('/api/milestones', (req, res) => {
  const latest = db.prepare('SELECT score, wus, rank FROM team_snapshots ORDER BY timestamp DESC LIMIT 1').get();
  const weekAgo = db.prepare("SELECT score FROM team_snapshots WHERE timestamp <= datetime('now', '-7 days') ORDER BY timestamp DESC LIMIT 1").get();

  if (!latest) return res.json({ milestones: [] });

  const dailyRate = weekAgo ? (latest.score - weekAgo.score) / 7 : 0;

  const targets = [375e9, 400e9, 450e9, 500e9, 750e9, 1e12];
  const milestones = targets
    .filter(t => t > latest.score)
    .map(target => ({
      target,
      remaining: target - latest.score,
      days_estimated: dailyRate > 0 ? Math.ceil((target - latest.score) / dailyRate) : null,
      estimated_date: dailyRate > 0 ? new Date(Date.now() + ((target - latest.score) / dailyRate) * 86400000).toISOString().split('T')[0] : null,
    }));

  res.json({
    current_score: latest.score,
    daily_rate: Math.round(dailyRate),
    weekly_rate: Math.round(dailyRate * 7),
    milestones,
  });
});

/** GET /api/prediction/rank - Predict future team rank based on 30-day linear trend */
app.get('/api/prediction/rank', (req, res) => {
  const history = db.prepare(`
    SELECT rank, score, timestamp FROM team_snapshots
    WHERE timestamp >= datetime('now', '-30 days')
    ORDER BY timestamp DESC
    LIMIT 30
  `).all();

  if (history.length < 2) return res.json({ predictions: [] });

  const latest = history[0];
  const oldest = history[history.length - 1];
  const daysDiff = (new Date(latest.timestamp) - new Date(oldest.timestamp)) / 86400000;
  const rankChange = daysDiff > 0 ? (oldest.rank - latest.rank) / daysDiff : 0;

  const predictions = [7, 14, 30, 90].map(days => ({
    days,
    predicted_rank: Math.max(1, Math.round(latest.rank - rankChange * days)),
  }));

  res.json({
    current_rank: latest.rank,
    rank_change_per_day: parseFloat(rankChange.toFixed(3)),
    predictions,
  });
});

/** GET /api/heatmap/:name - Hourly activity heatmap for a member (last 30 days) */
app.get('/api/heatmap/:name', (req, res) => {
  const name = validateName(req.params.name);
  if (!name) return res.status(400).json({ error: 'Invalid member name.' });

  const rows = db.prepare(`
    SELECT
      strftime('%w', timestamp) as day_of_week,
      strftime('%H', timestamp) as hour,
      MAX(score) - MIN(score) as score_delta,
      MAX(wus) - MIN(wus) as wus_delta
    FROM member_snapshots
    WHERE name = ? AND timestamp >= datetime('now', '-30 days')
    GROUP BY day_of_week, hour
    ORDER BY day_of_week, hour
  `).all(name);

  res.json(rows);
});

/** GET /api/streak - Team-level consecutive-day activity streak */
app.get('/api/streak', (req, res) => {
  const dailyWUs = db.prepare(`
    SELECT strftime('%Y-%m-%d', timestamp) as date, MAX(wus) as wus
    FROM team_snapshots
    GROUP BY date
    ORDER BY date DESC
    LIMIT 365
  `).all();

  // Walk backwards through daily WU totals to find streaks.
  // Data is DESC: earlier entries have smaller WUs (cumulative counter).
  let currentStreak = 0;
  let maxStreak = 0;
  let tempStreak = 0;
  let lastWUs = null;
  let currentStreakDone = false;

  for (const day of dailyWUs) {
    if (lastWUs !== null && day.wus < lastWUs) {
      // Earlier day had fewer WUs = gain happened on the later day
      tempStreak++;
    } else if (lastWUs !== null) {
      // No gain (same or higher WUs on earlier day = no activity)
      if (tempStreak > maxStreak) maxStreak = tempStreak;
      if (!currentStreakDone) {
        currentStreak = tempStreak;
        currentStreakDone = true;
      }
      tempStreak = 0;
    }
    lastWUs = day.wus;
  }
  // Final check for streak reaching the oldest data
  if (tempStreak > maxStreak) maxStreak = tempStreak;
  if (!currentStreakDone) currentStreak = tempStreak;

  res.json({
    current_streak: currentStreak,
    max_streak: maxStreak,
    total_active_days: dailyWUs.length,
  });
});

/** GET /api/motw - Member of the Week (highest score gain in last 7 days) */
app.get('/api/motw', (req, res) => {
  const rows = db.prepare(`
    WITH latest AS (
      SELECT name, MAX(score) as current_score, MAX(wus) as current_wus
      FROM member_snapshots
      WHERE timestamp >= datetime('now', '-1 day')
      GROUP BY name
    ),
    week_ago AS (
      SELECT name, MIN(score) as old_score, MIN(wus) as old_wus
      FROM member_snapshots
      WHERE timestamp >= datetime('now', '-8 days') AND timestamp < datetime('now', '-6 days')
      GROUP BY name
    )
    SELECT
      l.name,
      l.current_score,
      l.current_wus,
      COALESCE(w.old_score, l.current_score) as old_score,
      l.current_score - COALESCE(w.old_score, l.current_score) as score_gained,
      l.current_wus - COALESCE(w.old_wus, l.current_wus) as wus_gained
    FROM latest l
    LEFT JOIN week_ago w ON l.name = w.name
    ORDER BY score_gained DESC
    LIMIT 1
  `).get();

  res.json(rows || { name: null, score_gained: 0 });
});

/** GET /api/goals - Team goals with progress tracking (score, rank, WUs, members) */
app.get('/api/goals', (req, res) => {
  const latest = db.prepare('SELECT score, wus, rank, member_count FROM team_snapshots ORDER BY timestamp DESC LIMIT 1').get();
  if (!latest) return res.json([]);

  const goals = [
    { id: 'score-400b', name: '400 Milliarden Score', target: 400e9, current: latest.score, unit: 'Score' },
    { id: 'rank-15', name: 'Top 15 Rang', target: 15, current: latest.rank, unit: 'Rank', invert: true },
    { id: 'wus-500k', name: '500.000 Work Units', target: 500000, current: latest.wus, unit: 'WUs' },
    { id: 'members-100', name: '100 Mitglieder', target: 100, current: latest.member_count || 0, unit: 'Members' },
  ];

  // For inverted goals (rank), calculate progress relative to historical starting point
  const firstSnap = db.prepare('SELECT rank FROM team_snapshots ORDER BY timestamp ASC LIMIT 1').get();
  const startRank = firstSnap ? Math.max(firstSnap.rank, latest.rank + 1) : latest.rank + 10;

  res.json(goals.map(g => ({
    ...g,
    progress: g.invert
      ? Math.min(100, Math.max(0, ((startRank - g.current) / (startRank - g.target)) * 100))
      : Math.min(100, (g.current / g.target) * 100),
    remaining: g.invert ? g.current - g.target : g.target - g.current,
  })));
});

// ============================================================
// API routes - donor profiles
// ============================================================

/** GET /donors - Serve the donor listing page */
app.get('/donors', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'donors.html'));
});

/** GET /donor/:name - Serve the individual donor profile page */
app.get('/donor/:name', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'donor.html'));
});

/**
 * GET /api/donor/:name/summary - Comprehensive donor profile combining live API
 * data with historical snapshots (7-day gain, team rank, efficiency, etc.).
 * Rate-limited via heavyRateLimit middleware.
 */
app.get('/api/donor/:name/summary', heavyRateLimit, async (req, res) => {
  const name = validateName(req.params.name);
  if (!name) return res.status(400).json({ error: 'Invalid name parameter.' });
  try {
    const raw = await fahFetch('/team/' + TEAM_ID + '/members');
    const members = parseMembers(raw);
    const member = members.find(m => m.name === name);
    if (!member) return res.status(404).json({ error: 'Member not found' });

    const totalScore = members.reduce((s, m) => s + m.score, 0);
    const totalWUs = members.reduce((s, m) => s + m.wus, 0);
    const sorted = [...members].sort((a, b) => b.score - a.score);
    const teamRank = sorted.findIndex(m => m.name === name) + 1;
    const efficiency = member.wus > 0 ? Math.round(member.score / member.wus) : 0;
    const contribution = totalScore > 0 ? (member.score / totalScore * 100) : 0;
    const avgScore = totalScore / members.length;
    const avgWUs = totalWUs / members.length;

    // Last 90 days of daily history from DB
    const history = db.prepare(
      "SELECT strftime('%Y-%m-%d', timestamp) as date, MAX(score) as score, MAX(wus) as wus, MIN(rank) as best_rank FROM member_snapshots WHERE name = ? GROUP BY date ORDER BY date DESC LIMIT 90"
    ).all(name);

    // 7-day gain calculation
    const latestSnap = db.prepare('SELECT MAX(score) as score, MAX(wus) as wus FROM member_snapshots WHERE name = ? AND timestamp >= datetime(\'now\', \'-1 day\')').get(name);
    const weekAgoSnap = db.prepare('SELECT MIN(score) as score, MIN(wus) as wus FROM member_snapshots WHERE name = ? AND timestamp >= datetime(\'now\', \'-8 days\') AND timestamp < datetime(\'now\', \'-6 days\')').get(name);
    const scoreGain7d = latestSnap && weekAgoSnap && weekAgoSnap.score ? latestSnap.score - weekAgoSnap.score : 0;
    const wusGain7d = latestSnap && weekAgoSnap && weekAgoSnap.wus ? latestSnap.wus - weekAgoSnap.wus : 0;

    res.json({
      name: member.name,
      id: member.id,
      score: member.score,
      wus: member.wus,
      rank: member.rank,
      team_rank: teamRank,
      team_total_members: members.length,
      efficiency,
      contribution: parseFloat(contribution.toFixed(2)),
      avg_score: Math.round(avgScore),
      avg_wus: Math.round(avgWUs),
      score_vs_avg: parseFloat((member.score / avgScore).toFixed(2)),
      score_gain_7d: scoreGain7d,
      wus_gain_7d: wusGain7d,
      history: history.reverse(),
    });
  } catch (err) {
    console.error('[API /api/donor/summary]', err.message);
    res.status(502).json({ error: 'Failed to load donor data' });
  }
});

// ============================================================
// API routes - achievement endpoints
// ============================================================

// SECURITY: concurrency limit + result caching for expensive achievement evaluations
let activeEvaluations = 0;
const MAX_CONCURRENT_EVALUATIONS = 3;
const achievementResultCache = new Map();
const ACHIEVEMENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * GET /api/donor/:name/achievements - Evaluate and return all achievements for a donor.
 * Results are cached for 5 minutes and limited to 3 concurrent evaluations.
 */
app.get('/api/donor/:name/achievements', heavyRateLimit, async (req, res) => {
  const name = validateName(req.params.name);
  if (!name) return res.status(400).json({ error: 'Invalid name parameter.' });

  // Check result cache first
  const cached = achievementResultCache.get(name);
  if (cached && Date.now() - cached.timestamp < ACHIEVEMENT_CACHE_TTL) {
    return res.json(cached.data);
  }

  // Reject if too many concurrent evaluations are in-flight
  if (activeEvaluations >= MAX_CONCURRENT_EVALUATIONS) {
    return res.status(503).json({ error: 'Server busy. Try again shortly.' });
  }
  activeEvaluations++;
  try {
    const result = await evaluateDonorAchievements(name);
    if (!result) return res.status(404).json({ error: 'Member not found' });
    achievementResultCache.set(name, { data: result, timestamp: Date.now() });
    res.json(result);
  } catch (err) {
    console.error('[API /api/donor/achievements]', err.message);
    res.status(502).json({ error: 'Failed to load achievements' });
  } finally {
    activeEvaluations--;
  }
});

/** GET /api/achievements - Browse all achievement definitions (catalog), with optional category/tier filter */
app.get('/api/achievements', (req, res) => {
  const category = req.query.category;
  const tier = req.query.tier;
  let results = ALL_ACHIEVEMENTS;
  // SECURITY: validate category/tier are reasonable strings (max 50 chars, no injection risk
  // since they're only used for strict equality comparison in .filter())
  if (category && typeof category === 'string' && category.length <= 50) {
    results = results.filter(a => a.category === category);
  }
  if (tier && typeof tier === 'string' && tier.length <= 50) {
    results = results.filter(a => a.tier === tier);
  }
  res.json({
    achievements: results,
    total: ALL_ACHIEVEMENTS.length,
    points_total: TOTAL_ACHIEVEMENT_POINTS,
    categories: [...new Set(ALL_ACHIEVEMENTS.map(a => a.category))],
    tiers: [...new Set(ALL_ACHIEVEMENTS.map(a => a.tier))],
  });
});

/** GET /api/achievements/leaderboard - Top donors ranked by achievement unlock count and points */
app.get('/api/achievements/leaderboard', (req, res) => {
  const limit = validatePositiveInt(req.query.limit, 25, 100);
  const rows = db.prepare(`
    SELECT
      da.donor_name,
      COUNT(*) as unlocked_count,
      GROUP_CONCAT(da.achievement_id) as achievement_ids
    FROM donor_achievements da
    GROUP BY da.donor_name
    ORDER BY unlocked_count DESC
    LIMIT ?
  `).all(limit);

  const leaderboard = rows.map(row => {
    const ids = row.achievement_ids ? row.achievement_ids.split(',') : [];
    const points = ids.reduce((s, id) => {
      const a = ALL_ACHIEVEMENTS.find(ach => ach.id === id);
      return s + (a ? a.points || 0 : 0);
    }, 0);

    // Tier distribution: count unlocked achievements per tier
    const tierDistribution = {};
    for (const id of ids) {
      const a = ALL_ACHIEVEMENTS.find(ach => ach.id === id);
      if (a && a.tier) {
        tierDistribution[a.tier] = (tierDistribution[a.tier] || 0) + 1;
      }
    }

    return {
      donor_name: row.donor_name,
      unlocked_count: row.unlocked_count,
      points,
      total: ALL_ACHIEVEMENTS.length,
      points_total: TOTAL_ACHIEVEMENT_POINTS,
      completion_pct: parseFloat(((row.unlocked_count / ALL_ACHIEVEMENTS.length) * 100).toFixed(1)),
      tier_distribution: tierDistribution,
    };
  });

  res.json(leaderboard);
});

// ============================================================
// API routes - PPD, monthly leaderboard, rivals, crossings, milestones, export
// ============================================================

/** GET /api/ppd - Points Per Day for team and all members (24h, 7d, 30d windows) */
app.get('/api/ppd', (req, res) => {
  const latest = db.prepare('SELECT score, timestamp FROM team_snapshots ORDER BY timestamp DESC LIMIT 1').get();
  const h24 = db.prepare("SELECT score FROM team_snapshots WHERE timestamp <= datetime('now', '-1 day') ORDER BY timestamp DESC LIMIT 1").get();
  const d7 = db.prepare("SELECT score FROM team_snapshots WHERE timestamp <= datetime('now', '-7 days') ORDER BY timestamp DESC LIMIT 1").get();
  const d30 = db.prepare("SELECT score FROM team_snapshots WHERE timestamp <= datetime('now', '-30 days') ORDER BY timestamp DESC LIMIT 1").get();

  if (!latest) return res.json({ team: {}, members: [] });

  const team_ppd_24h = h24 ? Math.round((latest.score - h24.score) / 1) : 0;
  const team_ppd_7d = d7 ? Math.round((latest.score - d7.score) / 7) : 0;
  const team_ppd_30d = d30 ? Math.round((latest.score - d30.score) / 30) : 0;

  // Per-member PPD via CTE joins across time windows
  const members = db.prepare(`
    WITH latest_snap AS (
      SELECT name, MAX(score) as score FROM member_snapshots
      WHERE timestamp >= datetime('now', '-1 day') GROUP BY name
    ),
    snap_24h AS (
      SELECT name, score FROM member_snapshots
      WHERE timestamp >= datetime('now', '-2 days') AND timestamp < datetime('now', '-1 day')
      GROUP BY name HAVING MAX(timestamp)
    ),
    snap_7d AS (
      SELECT name, score FROM member_snapshots
      WHERE timestamp >= datetime('now', '-8 days') AND timestamp < datetime('now', '-7 days')
      GROUP BY name HAVING MAX(timestamp)
    ),
    snap_30d AS (
      SELECT name, score FROM member_snapshots
      WHERE timestamp >= datetime('now', '-31 days') AND timestamp < datetime('now', '-30 days')
      GROUP BY name HAVING MAX(timestamp)
    )
    SELECT
      l.name,
      l.score as current_score,
      COALESCE(l.score - h.score, 0) as ppd_24h,
      CASE WHEN s7.score IS NOT NULL THEN ROUND((l.score - s7.score) / 7.0) ELSE 0 END as ppd_7d,
      CASE WHEN s30.score IS NOT NULL THEN ROUND((l.score - s30.score) / 30.0) ELSE 0 END as ppd_30d
    FROM latest_snap l
    LEFT JOIN snap_24h h ON l.name = h.name
    LEFT JOIN snap_7d s7 ON l.name = s7.name
    LEFT JOIN snap_30d s30 ON l.name = s30.name
    ORDER BY ppd_7d DESC
  `).all();

  res.json({
    team: { ppd_24h: team_ppd_24h, ppd_7d: team_ppd_7d, ppd_30d: team_ppd_30d },
    members
  });
});

/** GET /api/leaderboard/monthly - Member leaderboard by score gained this calendar month */
app.get('/api/leaderboard/monthly', (req, res) => {
  const rows = db.prepare(`
    WITH month_start AS (
      SELECT name, MIN(score) as start_score, MIN(wus) as start_wus
      FROM member_snapshots
      WHERE timestamp >= strftime('%Y-%m-01', 'now')
      GROUP BY name
    ),
    current AS (
      SELECT name, MAX(score) as current_score, MAX(wus) as current_wus
      FROM member_snapshots
      WHERE timestamp >= datetime('now', '-1 day')
      GROUP BY name
    )
    SELECT
      c.name,
      c.current_score,
      c.current_wus,
      c.current_score - COALESCE(ms.start_score, c.current_score) as score_gained,
      c.current_wus - COALESCE(ms.start_wus, c.current_wus) as wus_gained
    FROM current c
    LEFT JOIN month_start ms ON c.name = ms.name
    ORDER BY score_gained DESC
  `).all();

  res.json(rows);
});

/**
 * GET /api/rivals - Teams ranked near ours for competitive comparison.
 * Fetches top teams from F@H, sorts by credit, and returns ~5 above / 5 below our rank.
 */
app.get('/api/rivals', async (req, res) => {
  try {
    const ourTeam = await fahFetch('/team/' + TEAM_ID);
    if (!ourTeam || !ourTeam.rank) return res.json({ our_team: null, rivals: [] });

    const ourRank = ourTeam.rank;
    // Fetch enough teams to capture those near our rank
    const fetchLimit = Math.min(ourRank + 10, 100);
    const data = await fahFetch('/team?limit=' + fetchLimit);
    const allTeams = Array.isArray(data) ? data : (data.results || []);

    // Sort by credit descending and assign computed ranks
    const sorted = allTeams.sort((a, b) => (b.credit || 0) - (a.credit || 0));
    sorted.forEach((t, i) => { t._rank = i + 1; });

    // Find our position and extract a window of +/-5 teams
    const ourIdx = sorted.findIndex(t => t.team === TEAM_ID || t.name === ourTeam.name);
    const centerIdx = ourIdx >= 0 ? ourIdx : Math.min(ourRank - 1, sorted.length - 1);
    const startIdx = Math.max(0, centerIdx - 5);
    const endIdx = Math.min(sorted.length, startIdx + 11);
    const nearby = sorted.slice(startIdx, endIdx);

    res.json({
      our_team: { name: ourTeam.name, score: ourTeam.score, rank: ourTeam.rank, wus: ourTeam.wus, team_id: TEAM_ID },
      rivals: nearby.map(t => ({
        name: t.name,
        score: t.credit || 0,
        rank: t._rank,
        wus: t.wus || 0,
        team_id: t.team,
        delta_score: (t.credit || 0) - ourTeam.score,
        delta_rank: t._rank - ourRank,
      }))
    });
  } catch (err) {
    console.error('[API /api/rivals]', err.message);
    res.status(502).json({ error: 'Failed to fetch rival teams.' });
  }
});

/** GET /api/crossings - Daily rank changes (when team rank moved up or down) */
app.get('/api/crossings', (req, res) => {
  const rows = db.prepare(`
    SELECT
      strftime('%Y-%m-%d', timestamp) as date,
      MIN(rank) as best_rank
    FROM team_snapshots
    GROUP BY strftime('%Y-%m-%d', timestamp)
    ORDER BY date ASC
  `).all();

  const crossings = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].best_rank !== rows[i-1].best_rank) {
      crossings.push({
        date: rows[i].date,
        old_rank: rows[i-1].best_rank,
        new_rank: rows[i].best_rank,
        direction: rows[i].best_rank < rows[i-1].best_rank ? 'up' : 'down',
        positions: Math.abs(rows[i].best_rank - rows[i-1].best_rank),
      });
    }
  }

  res.json(crossings.reverse()); // newest first
});

/** GET /api/milestones/chronology - Timeline of member milestone achievements */
app.get('/api/milestones/chronology', (req, res) => {
  const limit = validatePositiveInt(req.query.limit, 100, 500);

  const rows = db.prepare(`
    SELECT name, milestone, score_at_time, detected_at
    FROM milestone_events
    ORDER BY detected_at DESC
    LIMIT ?
  `).all(limit);

  res.json(rows);
});

/**
 * GET /api/export/:format - Export current member list as CSV or JSON download.
 * @param {string} format - 'csv' or 'json'
 */
app.get('/api/export/:format', async (req, res) => {
  const format = req.params.format;
  if (format !== 'csv' && format !== 'json') {
    return res.status(400).json({ error: 'Format must be csv or json.' });
  }

  try {
    const raw = await fahFetch('/team/' + TEAM_ID + '/members');
    const members = parseMembers(raw);
    const sorted = [...members].sort((a, b) => b.score - a.score);

    if (format === 'json') {
      res.setHeader('Content-Disposition', 'attachment; filename="fof-members.json"');
      res.json(sorted.map((m, i) => ({ rank: i + 1, name: m.name, score: m.score, wus: m.wus, global_rank: m.rank })));
    } else {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="fof-members.csv"');
      let csv = 'Rank,Name,Score,Work Units,Global Rank\n';
      sorted.forEach((m, i) => {
        csv += `${i + 1},"${(m.name || '').replace(/"/g, '""')}",${m.score},${m.wus},${m.rank}\n`;
      });
      res.send(csv);
    }
  } catch (err) {
    console.error('[API /api/export]', err.message);
    res.status(502).json({ error: 'Failed to export data.' });
  }
});

// ============================================================
// API routes - Research Impact, Global Stats, Compare, Hall of Fame, Challenges
// ============================================================

/** GET /api/research - Aggregated research impact by disease/cause */
app.get('/api/research', heavyRateLimit, async (req, res) => {
  try {
    // Fetch project-cause mapping (cached 1h via fahFetch)
    let causeData;
    try {
      causeData = await fahFetch('/project/cause');
    } catch {
      causeData = null;
    }

    // Build cause-to-project mapping from cause data
    const causeMap = new Map(); // cause name -> Set of project IDs
    if (Array.isArray(causeData)) {
      for (const entry of causeData) {
        const causeName = entry.cause || entry.name || 'Unknown';
        if (!causeMap.has(causeName)) causeMap.set(causeName, new Set());
        if (entry.project) causeMap.get(causeName).add(entry.project);
      }
    }

    // Fetch members and their projects
    const raw = await fahFetch(`/team/${TEAM_ID}/members`);
    const members = parseMembers(raw);

    const causeStats = new Map(); // cause -> { projects: Set, wus: number }
    const MAX_PROJECT_FETCH = 50;
    const fetchMembers = members.slice(0, MAX_PROJECT_FETCH);

    for (const m of fetchMembers) {
      try {
        const projects = await fahFetch(`/user/${encodeURIComponent(m.name)}/projects`);
        if (Array.isArray(projects)) {
          for (const p of projects) {
            // Try to find the cause for this project
            let foundCause = 'Other';
            for (const [cause, projectIds] of causeMap) {
              if (projectIds.has(p.project)) {
                foundCause = cause;
                break;
              }
            }
            // Also check if the project itself has a cause field
            if (p.cause) foundCause = p.cause;

            if (!causeStats.has(foundCause)) {
              causeStats.set(foundCause, { projects: new Set(), wus: 0 });
            }
            const cs = causeStats.get(foundCause);
            cs.projects.add(p.project);
            cs.wus += p.wus || p.credit || 0;
          }
        }
      } catch {
        // Skip members whose projects cannot be fetched
      }
    }

    const causes = [];
    for (const [name, stats] of causeStats) {
      causes.push({
        name,
        projects: stats.projects.size,
        wus: stats.wus,
      });
    }
    causes.sort((a, b) => b.wus - a.wus);

    res.json({ causes });
  } catch (err) {
    console.error('[API /api/research]', err.message);
    res.status(502).json({ error: 'Failed to fetch research data.' });
  }
});

/** GET /api/global-stats - Global F@H context with our team's position */
app.get('/api/global-stats', async (req, res) => {
  try {
    const [userCount, teamCount, ourTeam] = await Promise.all([
      fahFetch('/user-count'),
      fahFetch('/team/count'),
      fahFetch(`/team/${TEAM_ID}`),
    ]);

    // Extract counts - API may return number directly or as an object
    const totalUsers = typeof userCount === 'number' ? userCount : (userCount.count || userCount.total || 0);
    const totalTeams = typeof teamCount === 'number' ? teamCount : (teamCount.count || teamCount.total || 0);

    const raw = await fahFetch(`/team/${TEAM_ID}/members`);
    const members = parseMembers(raw);

    res.json({
      total_users: totalUsers,
      total_teams: totalTeams,
      our_rank: ourTeam.rank || 0,
      our_members: members.length,
    });
  } catch (err) {
    console.error('[API /api/global-stats]', err.message);
    res.status(502).json({ error: 'Failed to fetch global stats.' });
  }
});

/** GET /api/compare/:name1/:name2 - Side-by-side member comparison */
app.get('/api/compare/:name1/:name2', heavyRateLimit, async (req, res) => {
  const name1 = validateName(req.params.name1);
  const name2 = validateName(req.params.name2);
  if (!name1 || !name2) return res.status(400).json({ error: 'Invalid member name(s).' });
  if (name1 === name2) return res.status(400).json({ error: 'Cannot compare a member to themselves.' });

  try {
    const raw = await fahFetch(`/team/${TEAM_ID}/members`);
    const members = parseMembers(raw);
    const sorted = [...members].sort((a, b) => b.score - a.score);

    const m1 = members.find(m => m.name === name1);
    const m2 = members.find(m => m.name === name2);
    if (!m1) return res.status(404).json({ error: `Member '${name1}' not found.` });
    if (!m2) return res.status(404).json({ error: `Member '${name2}' not found.` });

    const teamRank1 = sorted.findIndex(m => m.name === name1) + 1;
    const teamRank2 = sorted.findIndex(m => m.name === name2) + 1;
    const eff1 = m1.wus > 0 ? Math.round(m1.score / m1.wus) : 0;
    const eff2 = m2.wus > 0 ? Math.round(m2.score / m2.wus) : 0;

    // 7-day PPD from snapshots
    const getPpd7d = (name) => {
      const latest = db.prepare(
        'SELECT MAX(score) as score FROM member_snapshots WHERE name = ? AND timestamp >= datetime(\'now\', \'-1 day\')'
      ).get(name);
      const weekAgo = db.prepare(
        'SELECT MIN(score) as score FROM member_snapshots WHERE name = ? AND timestamp >= datetime(\'now\', \'-8 days\') AND timestamp < datetime(\'now\', \'-6 days\')'
      ).get(name);
      if (latest && weekAgo && weekAgo.score) {
        return Math.round((latest.score - weekAgo.score) / 7);
      }
      return 0;
    };

    const ppd7d_1 = getPpd7d(name1);
    const ppd7d_2 = getPpd7d(name2);

    const member1 = {
      name: m1.name,
      score: m1.score,
      wus: m1.wus,
      rank: m1.rank,
      team_rank: teamRank1,
      efficiency: eff1,
      ppd_7d: ppd7d_1,
    };

    const member2 = {
      name: m2.name,
      score: m2.score,
      wus: m2.wus,
      rank: m2.rank,
      team_rank: teamRank2,
      efficiency: eff2,
      ppd_7d: ppd7d_2,
    };

    res.json({
      member1,
      member2,
      differences: {
        score_diff: m1.score - m2.score,
        wus_diff: m1.wus - m2.wus,
        rank_diff: m1.rank - m2.rank,
        team_rank_diff: teamRank1 - teamRank2,
        efficiency_diff: eff1 - eff2,
        ppd_7d_diff: ppd7d_1 - ppd7d_2,
      },
    });
  } catch (err) {
    console.error('[API /api/compare]', err.message);
    res.status(502).json({ error: 'Failed to compare members.' });
  }
});

/** GET /api/halloffame - MOTW history (last 52 weeks) */
app.get('/api/halloffame', (req, res) => {
  const rows = db.prepare(`
    SELECT week, name, score_gain, wu_gain
    FROM motw_history
    ORDER BY week DESC
    LIMIT 52
  `).all();

  res.json(rows);
});

/** GET /api/challenges - List active challenges with participant progress */
app.get('/api/challenges', (req, res) => {
  const challenges = db.prepare(
    "SELECT * FROM challenges WHERE active = 1 AND end_date >= date('now') ORDER BY end_date ASC"
  ).all();

  const result = challenges.map(challenge => {
    const participants = db.prepare(
      'SELECT donor_name, progress FROM challenge_progress WHERE challenge_id = ? ORDER BY progress DESC'
    ).all(challenge.id);

    const completedCount = participants.filter(p => p.progress >= challenge.target).length;

    return {
      ...challenge,
      participants: participants.map(p => ({
        name: p.donor_name,
        progress: p.progress,
        progress_pct: Math.min(100, parseFloat(((p.progress / challenge.target) * 100).toFixed(1))),
        completed: p.progress >= challenge.target,
      })),
      participant_count: participants.length,
      completed_count: completedCount,
    };
  });

  res.json(result);
});

// ============================================================
// API routes - Activity Feed (live event stream)
// ============================================================

/**
 * GET /api/activity-feed - Aggregated feed of recent team events.
 * Combines milestones, achievement unlocks, rank changes, and score jumps
 * into a single chronological feed for a "live activity" display.
 * Query params: limit (default 50, max 200)
 *
 * Response: {
 *   events: [{
 *     type: 'milestone' | 'achievement' | 'rank_change' | 'score_jump' | 'new_member',
 *     timestamp: string (ISO),
 *     donor_name: string,
 *     details: {
 *       milestone?: string,
 *       score_at_time?: number,
 *       achievement_id?: string,
 *       achievement_name?: string,
 *       achievement_tier?: string,
 *       achievement_points?: number,
 *       old_rank?: number,
 *       new_rank?: number,
 *       direction?: 'up' | 'down',
 *       positions?: number,
 *       score_gain?: number,
 *       period?: string
 *     }
 *   }],
 *   total: number
 * }
 */
app.get('/api/activity-feed', (req, res) => {
  const limit = validatePositiveInt(req.query.limit, 50, 200);

  // Milestones as events
  const milestones = db.prepare(`
    SELECT name, milestone, score_at_time, detected_at
    FROM milestone_events
    ORDER BY detected_at DESC
    LIMIT ?
  `).all(limit);

  const milestoneEvents = milestones.map(m => ({
    type: 'milestone',
    timestamp: m.detected_at,
    donor_name: m.name,
    details: {
      milestone: m.milestone,
      score_at_time: m.score_at_time,
    },
  }));

  // Achievement unlocks as events
  const achievements = db.prepare(`
    SELECT da.donor_name, da.achievement_id, da.unlocked_at
    FROM donor_achievements da
    ORDER BY da.unlocked_at DESC
    LIMIT ?
  `).all(limit);

  const achievementEvents = achievements.map(a => {
    const def = ALL_ACHIEVEMENTS.find(ach => ach.id === a.achievement_id);
    return {
      type: 'achievement',
      timestamp: a.unlocked_at,
      donor_name: a.donor_name,
      details: {
        achievement_id: a.achievement_id,
        achievement_name: def ? def.name : a.achievement_id,
        achievement_tier: def ? def.tier : 'unknown',
        achievement_points: def ? (def.points || 0) : 0,
      },
    };
  });

  // Rank changes from team snapshots (daily granularity)
  const rankRows = db.prepare(`
    SELECT
      strftime('%Y-%m-%d', timestamp) as date,
      MIN(rank) as best_rank
    FROM team_snapshots
    GROUP BY strftime('%Y-%m-%d', timestamp)
    ORDER BY date DESC
    LIMIT ?
  `).all(limit + 1);

  const rankEvents = [];
  for (let i = 0; i < rankRows.length - 1; i++) {
    if (rankRows[i].best_rank !== rankRows[i + 1].best_rank) {
      rankEvents.push({
        type: 'rank_change',
        timestamp: rankRows[i].date + 'T00:00:00',
        donor_name: '_team_',
        details: {
          old_rank: rankRows[i + 1].best_rank,
          new_rank: rankRows[i].best_rank,
          direction: rankRows[i].best_rank < rankRows[i + 1].best_rank ? 'up' : 'down',
          positions: Math.abs(rankRows[i].best_rank - rankRows[i + 1].best_rank),
        },
      });
    }
  }

  // Big score jumps (members gaining >1M in a day)
  const scoreJumps = db.prepare(`
    WITH daily AS (
      SELECT
        name,
        strftime('%Y-%m-%d', timestamp) as date,
        MAX(score) as day_score
      FROM member_snapshots
      WHERE timestamp >= datetime('now', '-30 days')
      GROUP BY name, strftime('%Y-%m-%d', timestamp)
    ),
    with_prev AS (
      SELECT
        d1.name,
        d1.date,
        d1.day_score - d2.day_score as score_gain
      FROM daily d1
      INNER JOIN daily d2 ON d1.name = d2.name
        AND d2.date = strftime('%Y-%m-%d', d1.date, '-1 day')
      WHERE d1.day_score > d2.day_score
    )
    SELECT name, date, score_gain
    FROM with_prev
    WHERE score_gain >= 1000000
    ORDER BY date DESC
    LIMIT ?
  `).all(limit);

  const scoreJumpEvents = scoreJumps.map(s => ({
    type: 'score_jump',
    timestamp: s.date + 'T00:00:00',
    donor_name: s.name,
    details: {
      score_gain: s.score_gain,
      period: 'daily',
    },
  }));

  // Merge all events, sort by timestamp descending, apply limit
  const allEvents = [
    ...milestoneEvents,
    ...achievementEvents,
    ...rankEvents,
    ...scoreJumpEvents,
  ].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);

  res.json({ events: allEvents, total: allEvents.length });
});

// ============================================================
// API routes - Power Rankings (composite scoring system)
// ============================================================

/**
 * GET /api/power-rankings - Composite power score for all team members.
 * Combines normalized score, PPD, efficiency, streak, and achievement count
 * into a single ranking with tier/level classification.
 *
 * Response: {
 *   rankings: [{
 *     rank: number,
 *     name: string,
 *     power_score: number (0-10000),
 *     level: number (1-99),
 *     tier: 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond' | 'Legend',
 *     breakdown: {
 *       score_pts: number,
 *       ppd_pts: number,
 *       efficiency_pts: number,
 *       streak_pts: number,
 *       achievement_pts: number
 *     },
 *     raw: { score: number, wus: number, rank: number, ppd_7d: number, efficiency: number }
 *   }],
 *   tier_thresholds: { Bronze: number, Silver: number, Gold: number, Platinum: number, Diamond: number, Legend: number },
 *   total: number
 * }
 */
app.get('/api/power-rankings', async (req, res) => {
  try {
    const raw = await fahFetch(`/team/${TEAM_ID}/members`);
    const members = parseMembers(raw);
    if (members.length === 0) return res.json({ rankings: [], tier_thresholds: {}, total: 0 });

    // Gather PPD (7d) for each member
    const ppd7dMap = {};
    const ppdRows = db.prepare(`
      WITH latest_snap AS (
        SELECT name, MAX(score) as score FROM member_snapshots
        WHERE timestamp >= datetime('now', '-1 day') GROUP BY name
      ),
      snap_7d AS (
        SELECT name, score FROM member_snapshots
        WHERE timestamp >= datetime('now', '-8 days') AND timestamp < datetime('now', '-7 days')
        GROUP BY name HAVING MAX(timestamp)
      )
      SELECT l.name, CASE WHEN s7.score IS NOT NULL THEN ROUND((l.score - s7.score) / 7.0) ELSE 0 END as ppd_7d
      FROM latest_snap l LEFT JOIN snap_7d s7 ON l.name = s7.name
    `).all();
    for (const r of ppdRows) ppd7dMap[r.name] = Math.max(0, r.ppd_7d || 0);

    // Gather achievement counts
    const achCounts = {};
    const achRows = db.prepare(`
      SELECT donor_name, COUNT(*) as cnt FROM donor_achievements GROUP BY donor_name
    `).all();
    for (const r of achRows) achCounts[r.donor_name] = r.cnt;

    // Gather streak info from member history
    const streakMap = {};
    for (const m of members) {
      const hist = db.prepare(
        "SELECT strftime('%Y-%m-%d', timestamp) as date, MAX(wus) as wus FROM member_snapshots WHERE name = ? GROUP BY date ORDER BY date ASC LIMIT 90"
      ).all(m.name);
      let streak = 0;
      for (let i = hist.length - 1; i >= 1; i--) {
        if (hist[i].wus > hist[i - 1].wus) streak++;
        else break;
      }
      streakMap[m.name] = streak;
    }

    // Find max values for normalization
    const maxScore = Math.max(1, ...members.map(m => m.score));
    const maxPpd = Math.max(1, ...Object.values(ppd7dMap));
    const maxEff = Math.max(1, ...members.map(m => m.wus > 0 ? m.score / m.wus : 0));
    const maxStreak = Math.max(1, ...Object.values(streakMap));
    const maxAch = Math.max(1, ...Object.values(achCounts), 1);

    // Weights for composite score (out of 10000)
    const W_SCORE = 3000;
    const W_PPD = 2500;
    const W_EFF = 1500;
    const W_STREAK = 1500;
    const W_ACH = 1500;

    const rankings = members.map(m => {
      const eff = m.wus > 0 ? m.score / m.wus : 0;
      const ppd = ppd7dMap[m.name] || 0;
      const streak = streakMap[m.name] || 0;
      const ach = achCounts[m.name] || 0;

      const scorePts = Math.round((m.score / maxScore) * W_SCORE);
      const ppdPts = Math.round((ppd / maxPpd) * W_PPD);
      const effPts = Math.round((eff / maxEff) * W_EFF);
      const streakPts = Math.round((streak / maxStreak) * W_STREAK);
      const achPts = Math.round((ach / maxAch) * W_ACH);
      const powerScore = scorePts + ppdPts + effPts + streakPts + achPts;

      // Level: 1-99 based on power score (logarithmic curve)
      const level = Math.min(99, Math.max(1, Math.round(Math.log(powerScore + 1) / Math.log(10001) * 99)));

      // Tier assignment
      let tier = 'Bronze';
      if (powerScore >= 8500) tier = 'Legend';
      else if (powerScore >= 7000) tier = 'Diamond';
      else if (powerScore >= 5000) tier = 'Platinum';
      else if (powerScore >= 3000) tier = 'Gold';
      else if (powerScore >= 1500) tier = 'Silver';

      return {
        name: m.name,
        power_score: powerScore,
        level,
        tier,
        breakdown: {
          score_pts: scorePts,
          ppd_pts: ppdPts,
          efficiency_pts: effPts,
          streak_pts: streakPts,
          achievement_pts: achPts,
        },
        raw: {
          score: m.score,
          wus: m.wus,
          rank: m.rank,
          ppd_7d: ppd,
          efficiency: Math.round(eff),
        },
      };
    });

    rankings.sort((a, b) => b.power_score - a.power_score);
    rankings.forEach((r, i) => { r.rank = i + 1; });

    const tierThresholds = { Bronze: 0, Silver: 1500, Gold: 3000, Platinum: 5000, Diamond: 7000, Legend: 8500 };

    res.json({ rankings, tier_thresholds: tierThresholds, total: rankings.length });
  } catch (err) {
    console.error('[API /api/power-rankings]', err.message);
    res.status(502).json({ error: 'Failed to compute power rankings.' });
  }
});

// ============================================================
// API routes - Team Zeitgeist (period-in-review summary)
// ============================================================

/**
 * GET /api/zeitgeist/:period - "This week/month/year in review" summary.
 * Provides highlight stats, top performers, records broken, and fun facts.
 * @param {string} period - 'week' | 'month' | 'year'
 *
 * Response: {
 *   period: string,
 *   date_range: { start: string, end: string },
 *   highlights: {
 *     total_score_gained: number,
 *     total_wus_gained: number,
 *     active_members: number,
 *     new_milestones: number,
 *     new_achievements: number,
 *     rank_change: number
 *   },
 *   top_performers: [{ name: string, score_gained: number, wus_gained: number }],
 *   records: [{ type: string, holder: string, value: number, description: string }],
 *   fun_facts: [{ icon: string, text: string }]
 * }
 */
app.get('/api/zeitgeist/:period', (req, res) => {
  const validPeriods = { week: '-7 days', month: '-30 days', year: '-365 days' };
  const period = req.params.period;
  if (!validPeriods[period]) {
    return res.status(400).json({ error: 'Period must be week, month, or year.' });
  }
  const offset = validPeriods[period];
  const now = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() + parseInt(offset) * 86400000);
  const startStr = startDate.toISOString().split('T')[0];

  // Team score/wus gained in period
  const teamStart = db.prepare(
    'SELECT score, wus, rank FROM team_snapshots WHERE timestamp >= datetime(\'now\', ?) ORDER BY timestamp ASC LIMIT 1'
  ).get(offset);
  const teamEnd = db.prepare(
    'SELECT score, wus, rank FROM team_snapshots ORDER BY timestamp DESC LIMIT 1'
  ).get();

  const totalScoreGained = teamStart && teamEnd ? teamEnd.score - teamStart.score : 0;
  const totalWusGained = teamStart && teamEnd ? teamEnd.wus - teamStart.wus : 0;
  const rankChange = teamStart && teamEnd ? teamStart.rank - teamEnd.rank : 0;

  // Active members in period
  const activeMembersRow = db.prepare(
    'SELECT COUNT(DISTINCT name) as cnt FROM member_snapshots WHERE timestamp >= datetime(\'now\', ?)'
  ).get(offset);
  const activeMembers = activeMembersRow ? activeMembersRow.cnt : 0;

  // New milestones in period
  const newMilestonesRow = db.prepare(
    'SELECT COUNT(*) as cnt FROM milestone_events WHERE detected_at >= datetime(\'now\', ?)'
  ).get(offset);
  const newMilestones = newMilestonesRow ? newMilestonesRow.cnt : 0;

  // New achievements in period
  const newAchRow = db.prepare(
    'SELECT COUNT(*) as cnt FROM donor_achievements WHERE unlocked_at >= datetime(\'now\', ?)'
  ).get(offset);
  const newAchievements = newAchRow ? newAchRow.cnt : 0;

  // Top performers by score gain
  const topPerformers = db.prepare(`
    WITH period_start AS (
      SELECT name, MIN(score) as start_score, MIN(wus) as start_wus
      FROM member_snapshots WHERE timestamp >= datetime('now', ?)
        AND timestamp < datetime('now', ?, '+1 day')
      GROUP BY name
    ),
    period_end AS (
      SELECT name, MAX(score) as end_score, MAX(wus) as end_wus
      FROM member_snapshots WHERE timestamp >= datetime('now', '-1 day')
      GROUP BY name
    )
    SELECT
      e.name,
      e.end_score - COALESCE(s.start_score, e.end_score) as score_gained,
      e.end_wus - COALESCE(s.start_wus, e.end_wus) as wus_gained
    FROM period_end e LEFT JOIN period_start s ON e.name = s.name
    ORDER BY score_gained DESC
    LIMIT 5
  `).all(offset, offset);

  // Records: highest single-day score gain in period
  const bestDayRow = db.prepare(`
    WITH daily AS (
      SELECT name, strftime('%Y-%m-%d', timestamp) as date, MAX(score) as day_score
      FROM member_snapshots WHERE timestamp >= datetime('now', ?)
      GROUP BY name, strftime('%Y-%m-%d', timestamp)
    ),
    with_prev AS (
      SELECT d1.name, d1.date, d1.day_score - d2.day_score as gain
      FROM daily d1 INNER JOIN daily d2 ON d1.name = d2.name
        AND d2.date = strftime('%Y-%m-%d', d1.date, '-1 day')
      WHERE d1.day_score > d2.day_score
    )
    SELECT name, MAX(gain) as value FROM with_prev GROUP BY name ORDER BY value DESC LIMIT 1
  `).get(offset);

  // Records: most WUs in a single day in period
  const bestWuDayRow = db.prepare(`
    WITH daily AS (
      SELECT name, strftime('%Y-%m-%d', timestamp) as date, MAX(wus) as day_wus
      FROM member_snapshots WHERE timestamp >= datetime('now', ?)
      GROUP BY name, strftime('%Y-%m-%d', timestamp)
    ),
    with_prev AS (
      SELECT d1.name, d1.date, d1.day_wus - d2.day_wus as gain
      FROM daily d1 INNER JOIN daily d2 ON d1.name = d2.name
        AND d2.date = strftime('%Y-%m-%d', d1.date, '-1 day')
      WHERE d1.day_wus > d2.day_wus
    )
    SELECT name, MAX(gain) as value FROM with_prev GROUP BY name ORDER BY value DESC LIMIT 1
  `).get(offset);

  const records = [];
  if (bestDayRow && bestDayRow.value > 0) {
    records.push({ type: 'best_daily_score', holder: bestDayRow.name, value: bestDayRow.value, description: 'Highest single-day score gain' });
  }
  if (bestWuDayRow && bestWuDayRow.value > 0) {
    records.push({ type: 'best_daily_wus', holder: bestWuDayRow.name, value: bestWuDayRow.value, description: 'Most WUs completed in a single day' });
  }

  // Fun facts
  const funFacts = [];
  if (totalScoreGained > 0) {
    const proteinsSim = Math.round(totalScoreGained / 500);
    funFacts.push({ icon: 'science', text: `Team simulated the equivalent of ~${proteinsSim.toLocaleString()} protein structures` });
  }
  if (totalWusGained > 0) {
    funFacts.push({ icon: 'bolt', text: `${totalWusGained.toLocaleString()} work units completed - that's ~${Math.round(totalWusGained * 0.5)} CPU-hours donated` });
  }
  if (activeMembers > 0 && totalScoreGained > 0) {
    funFacts.push({ icon: 'group', text: `Average contribution: ${Math.round(totalScoreGained / activeMembers).toLocaleString()} points per active member` });
  }
  if (rankChange > 0) {
    funFacts.push({ icon: 'trending_up', text: `Team climbed ${rankChange} rank position${rankChange > 1 ? 's' : ''} in the global leaderboard` });
  }

  res.json({
    period,
    date_range: { start: startStr, end: now },
    highlights: {
      total_score_gained: totalScoreGained,
      total_wus_gained: totalWusGained,
      active_members: activeMembers,
      new_milestones: newMilestones,
      new_achievements: newAchievements,
      rank_change: rankChange,
    },
    top_performers: topPerformers,
    records,
    fun_facts: funFacts,
  });
});

// ============================================================
// API routes - Constellation (team network/cluster data)
// ============================================================

/**
 * GET /api/constellation - Team member network data for visualization.
 * Returns nodes (members) with size/color based on metrics, and edges
 * representing relationships (similar score range, co-active periods,
 * complementary efficiency).
 *
 * Response: {
 *   nodes: [{
 *     id: string,
 *     name: string,
 *     score: number,
 *     wus: number,
 *     tier: 'newcomer' | 'regular' | 'veteran' | 'elite' | 'legend',
 *     size: number (1-100),
 *     activity_level: number (0-1),
 *     joined_days_ago: number
 *   }],
 *   edges: [{
 *     source: string,
 *     target: string,
 *     type: 'score_proximity' | 'co_active' | 'efficiency_pair',
 *     weight: number (0-1)
 *   }],
 *   clusters: [{
 *     name: string,
 *     members: string[],
 *     avg_score: number
 *   }]
 * }
 */
app.get('/api/constellation', async (req, res) => {
  try {
    const raw = await fahFetch(`/team/${TEAM_ID}/members`);
    const members = parseMembers(raw);
    if (members.length === 0) return res.json({ nodes: [], edges: [], clusters: [] });

    const maxScore = Math.max(1, ...members.map(m => m.score));

    // Get join dates and activity levels
    const memberMeta = {};
    for (const m of members) {
      const first = db.prepare(
        'SELECT MIN(timestamp) as ts FROM member_snapshots WHERE name = ?'
      ).get(m.name);
      const recentActivity = db.prepare(
        'SELECT COUNT(DISTINCT strftime(\'%Y-%m-%d\', timestamp)) as active_days FROM member_snapshots WHERE name = ? AND timestamp >= datetime(\'now\', \'-30 days\')'
      ).get(m.name);
      const joinedDaysAgo = first && first.ts ? Math.floor((Date.now() - new Date(first.ts).getTime()) / 86400000) : 0;
      const activityLevel = recentActivity ? Math.min(1, recentActivity.active_days / 30) : 0;
      memberMeta[m.name] = { joinedDaysAgo, activityLevel };
    }

    // Build nodes
    const nodes = members.map(m => {
      const meta = memberMeta[m.name] || { joinedDaysAgo: 0, activityLevel: 0 };
      let tier = 'newcomer';
      if (m.score >= maxScore * 0.5) tier = 'legend';
      else if (m.score >= maxScore * 0.2) tier = 'elite';
      else if (m.score >= maxScore * 0.05) tier = 'veteran';
      else if (m.score >= maxScore * 0.01) tier = 'regular';

      return {
        id: m.name,
        name: m.name,
        score: m.score,
        wus: m.wus,
        tier,
        size: Math.max(1, Math.round((m.score / maxScore) * 100)),
        activity_level: parseFloat(meta.activityLevel.toFixed(2)),
        joined_days_ago: meta.joinedDaysAgo,
      };
    });

    // Build edges based on score proximity (within 20% of each other)
    const edges = [];
    const sorted = [...members].sort((a, b) => b.score - a.score);
    for (let i = 0; i < sorted.length - 1 && i < 50; i++) {
      for (let j = i + 1; j < sorted.length && j < i + 5; j++) {
        const ratio = sorted[j].score > 0 ? sorted[i].score / sorted[j].score : 999;
        if (ratio <= 1.2 && ratio >= 0.8) {
          edges.push({
            source: sorted[i].name,
            target: sorted[j].name,
            type: 'score_proximity',
            weight: parseFloat((1 - Math.abs(1 - ratio) / 0.2).toFixed(2)),
          });
        }
      }
    }

    // Cluster members by score quartiles
    const q1 = maxScore * 0.01;
    const q2 = maxScore * 0.05;
    const q3 = maxScore * 0.2;
    const clusters = [
      { name: 'Newcomers', members: [], avg_score: 0 },
      { name: 'Rising Stars', members: [], avg_score: 0 },
      { name: 'Veterans', members: [], avg_score: 0 },
      { name: 'Legends', members: [], avg_score: 0 },
    ];

    for (const m of members) {
      if (m.score >= q3) clusters[3].members.push(m.name);
      else if (m.score >= q2) clusters[2].members.push(m.name);
      else if (m.score >= q1) clusters[1].members.push(m.name);
      else clusters[0].members.push(m.name);
    }
    for (const c of clusters) {
      const clusterMembers = members.filter(m => c.members.includes(m.name));
      c.avg_score = clusterMembers.length > 0
        ? Math.round(clusterMembers.reduce((s, m) => s + m.score, 0) / clusterMembers.length)
        : 0;
    }

    res.json({ nodes, edges, clusters: clusters.filter(c => c.members.length > 0) });
  } catch (err) {
    console.error('[API /api/constellation]', err.message);
    res.status(502).json({ error: 'Failed to compute constellation data.' });
  }
});

// ============================================================
// API routes - Donor Predictions (personal forecasts)
// ============================================================

/**
 * GET /api/donor/:name/predictions - Personal predictions and projected milestones.
 * Uses linear regression on recent history to project future score, rank,
 * and WU milestones with estimated dates.
 *
 * Response: {
 *   donor: string,
 *   current: { score: number, wus: number, rank: number, team_rank: number },
 *   trends: {
 *     ppd_7d: number,
 *     ppd_30d: number,
 *     wus_per_day_7d: number,
 *     wus_per_day_30d: number,
 *     trend_direction: 'accelerating' | 'steady' | 'slowing'
 *   },
 *   score_projections: [{ days: number, projected_score: number, date: string }],
 *   next_milestones: [{ milestone: number, remaining: number, days_estimated: number | null, date: string | null }],
 *   rank_projection: [{ days: number, projected_rank: number }],
 *   achievement_forecast: {
 *     current_unlocked: number,
 *     total: number,
 *     estimated_next_unlock: string | null
 *   },
 *   peer_comparison: {
 *     above: { name: string, score: number, gap: number } | null,
 *     below: { name: string, score: number, gap: number } | null,
 *     days_to_overtake: number | null
 *   }
 * }
 */
app.get('/api/donor/:name/predictions', heavyRateLimit, async (req, res) => {
  const name = validateName(req.params.name);
  if (!name) return res.status(400).json({ error: 'Invalid name parameter.' });

  try {
    const raw = await fahFetch(`/team/${TEAM_ID}/members`);
    const members = parseMembers(raw);
    const member = members.find(m => m.name === name);
    if (!member) return res.status(404).json({ error: 'Member not found' });

    const sorted = [...members].sort((a, b) => b.score - a.score);
    const teamRank = sorted.findIndex(m => m.name === name) + 1;

    // Gather history for trend calculation
    const history = db.prepare(
      "SELECT strftime('%Y-%m-%d', timestamp) as date, MAX(score) as score, MAX(wus) as wus, MIN(rank) as best_rank FROM member_snapshots WHERE name = ? GROUP BY date ORDER BY date DESC LIMIT 90"
    ).all(name).reverse();

    // PPD calculations
    let ppd7d = 0;
    let ppd30d = 0;
    let wusPd7d = 0;
    let wusPd30d = 0;
    if (history.length >= 2) {
      const last = history[history.length - 1];
      const h7idx = Math.max(0, history.length - 8);
      const h30idx = Math.max(0, history.length - 31);
      if (history.length > 7) {
        ppd7d = Math.round((last.score - history[h7idx].score) / Math.min(7, history.length - h7idx - 1));
        wusPd7d = Math.round((last.wus - history[h7idx].wus) / Math.min(7, history.length - h7idx - 1));
      }
      if (history.length > 2) {
        const days = Math.min(30, history.length - 1);
        ppd30d = Math.round((last.score - history[history.length - 1 - days].score) / days);
        wusPd30d = Math.round((last.wus - history[history.length - 1 - days].wus) / days);
      }
    }

    // Trend direction
    let trendDirection = 'steady';
    if (ppd7d > 0 && ppd30d > 0) {
      const ratio = ppd7d / ppd30d;
      if (ratio > 1.15) trendDirection = 'accelerating';
      else if (ratio < 0.85) trendDirection = 'slowing';
    }

    // Score projections
    const rate = ppd7d > 0 ? ppd7d : ppd30d;
    const scoreProjections = [7, 14, 30, 90, 180, 365].map(days => ({
      days,
      projected_score: member.score + rate * days,
      date: new Date(Date.now() + days * 86400000).toISOString().split('T')[0],
    }));

    // Next milestones
    const personalMilestones = [1e6, 5e6, 10e6, 50e6, 100e6, 500e6, 1e9, 5e9, 10e9, 50e9, 100e9];
    const nextMilestones = personalMilestones
      .filter(m => m > member.score)
      .slice(0, 4)
      .map(milestone => ({
        milestone,
        remaining: milestone - member.score,
        days_estimated: rate > 0 ? Math.ceil((milestone - member.score) / rate) : null,
        date: rate > 0 ? new Date(Date.now() + ((milestone - member.score) / rate) * 86400000).toISOString().split('T')[0] : null,
      }));

    // Rank projection (using rank trend from history)
    const rankProjection = [];
    if (history.length >= 7) {
      const recentRank = history[history.length - 1].best_rank;
      const olderRank = history[Math.max(0, history.length - 8)].best_rank;
      const rankPd = (olderRank - recentRank) / Math.min(7, history.length - 1);
      [7, 14, 30, 90].forEach(days => {
        rankProjection.push({
          days,
          projected_rank: Math.max(1, Math.round(recentRank - rankPd * days)),
        });
      });
    }

    // Achievement forecast
    const achCount = db.prepare(
      'SELECT COUNT(*) as cnt FROM donor_achievements WHERE donor_name = ?'
    ).get(name);

    // Peer comparison: who is directly above and below in team ranking
    let above = null;
    let below = null;
    let daysToOvertake = null;
    if (teamRank > 1) {
      const aboveMember = sorted[teamRank - 2];
      const gap = aboveMember.score - member.score;
      above = { name: aboveMember.name, score: aboveMember.score, gap };
      if (rate > 0) {
        // Check if the above member has a PPD too
        const aboveHist = db.prepare(
          "SELECT MAX(score) as score FROM member_snapshots WHERE name = ? AND timestamp >= datetime('now', '-8 days') AND timestamp < datetime('now', '-7 days')"
        ).get(aboveMember.name);
        const aboveLatest = db.prepare(
          "SELECT MAX(score) as score FROM member_snapshots WHERE name = ? AND timestamp >= datetime('now', '-1 day')"
        ).get(aboveMember.name);
        const abovePpd = aboveHist && aboveLatest && aboveHist.score
          ? Math.round((aboveLatest.score - aboveHist.score) / 7) : 0;
        const netGainPerDay = rate - Math.max(0, abovePpd);
        daysToOvertake = netGainPerDay > 0 ? Math.ceil(gap / netGainPerDay) : null;
      }
    }
    if (teamRank < sorted.length) {
      const belowMember = sorted[teamRank];
      below = { name: belowMember.name, score: belowMember.score, gap: member.score - belowMember.score };
    }

    res.json({
      donor: name,
      current: { score: member.score, wus: member.wus, rank: member.rank, team_rank: teamRank },
      trends: {
        ppd_7d: ppd7d,
        ppd_30d: ppd30d,
        wus_per_day_7d: wusPd7d,
        wus_per_day_30d: wusPd30d,
        trend_direction: trendDirection,
      },
      score_projections: scoreProjections,
      next_milestones: nextMilestones,
      rank_projection: rankProjection,
      achievement_forecast: {
        current_unlocked: achCount ? achCount.cnt : 0,
        total: ALL_ACHIEVEMENTS.length,
        estimated_next_unlock: null,
      },
      peer_comparison: {
        above,
        below,
        days_to_overtake: daysToOvertake,
      },
    });
  } catch (err) {
    console.error('[API /api/donor/predictions]', err.message);
    res.status(502).json({ error: 'Failed to compute predictions.' });
  }
});

// ============================================================
// API routes - QUEST.EXE (Daily/Weekly Quests with XP & Leveling)
// ============================================================

/**
 * GET /api/quests - List all quest definitions with optional frequency filter.
 * Query params: frequency ('daily' | 'weekly' | 'monthly')
 *
 * Response: {
 *   quests: [{
 *     id: string,
 *     title: string,
 *     description: string,
 *     type: string,
 *     target: number,
 *     xp_reward: number,
 *     frequency: 'daily' | 'weekly' | 'monthly'
 *   }],
 *   total: number
 * }
 */
app.get('/api/quests', (req, res) => {
  const freq = req.query.frequency;
  let quests;
  if (freq && typeof freq === 'string' && ['daily', 'weekly', 'monthly'].includes(freq)) {
    quests = db.prepare('SELECT * FROM quest_definitions WHERE active = 1 AND frequency = ?').all(freq);
  } else {
    quests = db.prepare('SELECT * FROM quest_definitions WHERE active = 1').all();
  }
  res.json({ quests, total: quests.length });
});

/**
 * GET /api/quests/:donorName - Get quest progress and XP for a specific donor.
 * Shows all active quests with current progress, plus XP/level info.
 *
 * Response: {
 *   donor: string,
 *   xp: { total_xp: number, level: number, xp_for_current_level: number, xp_for_next_level: number, progress_pct: number, quests_completed: number },
 *   active_quests: [{
 *     quest_id: string,
 *     title: string,
 *     description: string,
 *     frequency: 'daily' | 'weekly' | 'monthly',
 *     target: number,
 *     xp_reward: number,
 *     progress: number,
 *     progress_pct: number,
 *     completed: boolean,
 *     completed_at: string | null
 *   }],
 *   recently_completed: [{
 *     quest_id: string,
 *     title: string,
 *     xp_reward: number,
 *     completed_at: string,
 *     period_key: string
 *   }]
 * }
 */
app.get('/api/quests/:donorName', (req, res) => {
  const name = validateName(req.params.donorName);
  if (!name) return res.status(400).json({ error: 'Invalid donor name.' });

  const today = new Date().toISOString().split('T')[0];
  const weekKey = today.slice(0, 4) + '-W' + String(Math.ceil((new Date(today).getDate()) / 7)).padStart(2, '0') + '-' + today.slice(5, 7);
  const monthKey = today.slice(0, 7);

  // XP & level info
  const xpRow = db.prepare('SELECT * FROM donor_xp WHERE donor_name = ?').get(name);
  const totalXp = xpRow ? xpRow.total_xp : 0;
  const level = xpRow ? xpRow.level : 1;
  const questsCompleted = xpRow ? xpRow.quests_completed : 0;
  const xpCurrent = xpForLevel(level);
  const xpNext = xpForLevel(level + 1);
  const progressInLevel = totalXp - xpCurrent;
  const xpNeeded = xpNext - xpCurrent;

  const xpInfo = {
    total_xp: totalXp,
    level,
    xp_for_current_level: xpCurrent,
    xp_for_next_level: xpNext,
    progress_pct: xpNeeded > 0 ? parseFloat(((progressInLevel / xpNeeded) * 100).toFixed(1)) : 100,
    quests_completed: questsCompleted,
  };

  // Active quests with progress
  const quests = db.prepare('SELECT * FROM quest_definitions WHERE active = 1').all();
  const activeQuests = quests.map(q => {
    let periodKey;
    if (q.frequency === 'daily') periodKey = today;
    else if (q.frequency === 'weekly') periodKey = weekKey;
    else periodKey = monthKey;

    const prog = db.prepare(
      'SELECT progress, completed, completed_at FROM quest_progress WHERE quest_id = ? AND donor_name = ? AND period_key = ?'
    ).get(q.id, name, periodKey);

    const progress = prog ? prog.progress : 0;
    return {
      quest_id: q.id,
      title: q.title,
      description: q.description,
      frequency: q.frequency,
      target: q.target,
      xp_reward: q.xp_reward,
      progress,
      progress_pct: Math.min(100, parseFloat(((progress / q.target) * 100).toFixed(1))),
      completed: prog ? !!prog.completed : false,
      completed_at: prog ? prog.completed_at : null,
    };
  });

  // Recently completed quests (last 20)
  const recentlyCompleted = db.prepare(`
    SELECT qp.quest_id, qd.title, qd.xp_reward, qp.completed_at, qp.period_key
    FROM quest_progress qp
    JOIN quest_definitions qd ON qp.quest_id = qd.id
    WHERE qp.donor_name = ? AND qp.completed = 1
    ORDER BY qp.completed_at DESC
    LIMIT 20
  `).all(name);

  res.json({ donor: name, xp: xpInfo, active_quests: activeQuests, recently_completed: recentlyCompleted });
});

/**
 * GET /api/quests/leaderboard/xp - XP leaderboard showing top donors by level and XP.
 * Query params: limit (default 25, max 100)
 *
 * Response: {
 *   leaderboard: [{
 *     rank: number,
 *     donor_name: string,
 *     total_xp: number,
 *     level: number,
 *     quests_completed: number
 *   }],
 *   total: number
 * }
 */
app.get('/api/quests/leaderboard/xp', (req, res) => {
  const limit = validatePositiveInt(req.query.limit, 25, 100);
  const rows = db.prepare(
    'SELECT donor_name, total_xp, level, quests_completed FROM donor_xp ORDER BY total_xp DESC LIMIT ?'
  ).all(limit);

  const leaderboard = rows.map((r, i) => ({ rank: i + 1, ...r }));
  res.json({ leaderboard, total: leaderboard.length });
});

// ============================================================
// API routes - TIMELINE.EXE (Unified Event Feed)
// ============================================================

/**
 * GET /api/timeline - Unified event feed combining score milestones,
 * rank changes, new members, MOTW winners, and achievement unlocks.
 * Query params: days (default 30, max 365), limit (default 50, max 200)
 *
 * Response: [{ type: string, timestamp: string, message: string, icon: string, details: object }]
 *
 * type values: 'score_milestone' | 'rank_change' | 'new_member' | 'motw_winner' | 'achievement_unlock'
 * icon values: 'trophy' | 'arrow_up' | 'arrow_down' | 'person_add' | 'star' | 'medal'
 */
app.get('/api/timeline', (req, res) => {
  const days = validatePositiveInt(req.query.days, 30, 365);
  const limit = validatePositiveInt(req.query.limit, 50, 200);
  const events = [];

  // Score milestones
  const milestones = db.prepare(
    'SELECT name, milestone, score_at_time, detected_at FROM milestone_events WHERE detected_at >= datetime(\'now\', \'-\' || ? || \' days\') ORDER BY detected_at DESC'
  ).all(days);
  for (const m of milestones) {
    const mVal = parseFloat(m.milestone);
    const label = mVal >= 1e12 ? (mVal / 1e12) + 'T' : mVal >= 1e9 ? (mVal / 1e9) + 'B' : mVal >= 1e6 ? (mVal / 1e6) + 'M' : mVal.toLocaleString();
    events.push({
      type: 'score_milestone',
      timestamp: m.detected_at,
      message: `${m.name} erreichte ${label} Punkte!`,
      icon: 'trophy',
      details: { name: m.name, milestone: m.milestone, score_at_time: m.score_at_time },
    });
  }

  // Rank changes from team snapshots
  const rankRows = db.prepare(`
    SELECT strftime('%Y-%m-%d', timestamp) as date, MIN(rank) as best_rank
    FROM team_snapshots
    WHERE timestamp >= datetime('now', '-' || ? || ' days')
    GROUP BY strftime('%Y-%m-%d', timestamp)
    ORDER BY date ASC
  `).all(days);
  for (let i = 1; i < rankRows.length; i++) {
    if (rankRows[i].best_rank !== rankRows[i - 1].best_rank) {
      const direction = rankRows[i].best_rank < rankRows[i - 1].best_rank ? 'up' : 'down';
      const positions = Math.abs(rankRows[i].best_rank - rankRows[i - 1].best_rank);
      events.push({
        type: 'rank_change',
        timestamp: rankRows[i].date + 'T12:00:00',
        message: direction === 'up'
          ? `Team stieg um ${positions} Platz${positions > 1 ? 'e' : ''} auf Rang #${rankRows[i].best_rank}`
          : `Team fiel um ${positions} Platz${positions > 1 ? 'e' : ''} auf Rang #${rankRows[i].best_rank}`,
        icon: direction === 'up' ? 'arrow_up' : 'arrow_down',
        details: { old_rank: rankRows[i - 1].best_rank, new_rank: rankRows[i].best_rank, direction, positions },
      });
    }
  }

  // New members (first appearance in snapshots within the time window)
  const newMembers = db.prepare(`
    SELECT name, MIN(timestamp) as first_seen
    FROM member_snapshots
    GROUP BY name
    HAVING first_seen >= datetime('now', '-' || ? || ' days')
    ORDER BY first_seen DESC
  `).all(days);
  for (const m of newMembers) {
    events.push({
      type: 'new_member',
      timestamp: m.first_seen,
      message: `${m.name} ist dem Team beigetreten!`,
      icon: 'person_add',
      details: { name: m.name, first_seen: m.first_seen },
    });
  }

  // MOTW winners
  const motwRows = db.prepare(
    'SELECT week, name, score_gain, wu_gain FROM motw_history WHERE week >= date(\'now\', \'-\' || ? || \' days\') ORDER BY week DESC'
  ).all(days);
  for (const m of motwRows) {
    events.push({
      type: 'motw_winner',
      timestamp: m.week + 'T00:00:00',
      message: `${m.name} ist Member of the Week! (+${(m.score_gain || 0).toLocaleString()} Score)`,
      icon: 'star',
      details: { name: m.name, score_gain: m.score_gain, wu_gain: m.wu_gain },
    });
  }

  // Achievement unlocks
  const achievements = db.prepare(
    'SELECT donor_name, achievement_id, unlocked_at FROM donor_achievements WHERE unlocked_at >= datetime(\'now\', \'-\' || ? || \' days\') ORDER BY unlocked_at DESC'
  ).all(days);
  for (const a of achievements) {
    const def = ALL_ACHIEVEMENTS.find(ach => ach.id === a.achievement_id);
    if (!def) continue;
    events.push({
      type: 'achievement_unlock',
      timestamp: a.unlocked_at,
      message: `${a.donor_name} hat "${def.name}" freigeschaltet!`,
      icon: 'medal',
      details: { name: a.donor_name, achievement_id: a.achievement_id, achievement_name: def.name, tier: def.tier, points: def.points || 0 },
    });
  }

  // Sort by timestamp descending, apply limit
  events.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  res.json(events.slice(0, limit));
});

// ============================================================
// API routes - WEATHER.EXE (Folding Weather Report)
// ============================================================

/**
 * GET /api/weather - Team activity expressed as a weather metaphor.
 * Compares 24h activity against 30d average to determine weather conditions.
 * Conditions: sunny (>120% avg), partly_cloudy (80-120%), cloudy (50-80%), rainy (<50%), thunderstorm (>200%)
 *
 * Response: {
 *   current: {
 *     condition: 'thunderstorm' | 'sunny' | 'partly_cloudy' | 'cloudy' | 'rainy',
 *     icon: string,
 *     description: string,
 *     score_delta_24h: number,
 *     active_members: number,
 *     trend: 'rising' | 'falling' | 'steady'
 *   },
 *   forecast: [{ day: string, condition: string, icon: string }]
 * }
 */
app.get('/api/weather', (req, res) => {
  const latest = db.prepare('SELECT score, wus, rank, member_count FROM team_snapshots ORDER BY timestamp DESC LIMIT 1').get();
  const h24 = db.prepare("SELECT score FROM team_snapshots WHERE timestamp <= datetime('now', '-1 day') ORDER BY timestamp DESC LIMIT 1").get();
  const d7 = db.prepare("SELECT score FROM team_snapshots WHERE timestamp <= datetime('now', '-7 days') ORDER BY timestamp DESC LIMIT 1").get();
  const d30 = db.prepare("SELECT score FROM team_snapshots WHERE timestamp <= datetime('now', '-30 days') ORDER BY timestamp DESC LIMIT 1").get();

  if (!latest) {
    return res.json({
      current: { condition: 'cloudy', icon: 'cloud', description: 'Keine Daten verfuegbar...', score_delta_24h: 0, active_members: 0, trend: 'steady' },
      forecast: [],
    });
  }

  const scoreDelta24h = h24 ? latest.score - h24.score : 0;
  const ppd7d = d7 ? Math.round((latest.score - d7.score) / 7) : 0;
  const ppd30d = d30 ? Math.round((latest.score - d30.score) / 30) : 0;

  // Active members today
  const activeTodayRow = db.prepare(
    "SELECT COUNT(DISTINCT name) as cnt FROM member_snapshots WHERE timestamp >= datetime('now', '-1 day')"
  ).get();
  const activeMembers = activeTodayRow ? activeTodayRow.cnt : 0;

  // Activity ratio: 24h output vs 30d daily average
  const activityPct = ppd30d > 0 ? (scoreDelta24h / ppd30d) * 100 : 100;

  // Condition mapping per spec: sunny >120%, partly_cloudy 80-120%, cloudy 50-80%, rainy <50%, thunderstorm >200%
  let condition, icon, description;
  if (activityPct > 200) {
    condition = 'thunderstorm'; icon = 'zap';
    description = 'GEWITTER! Extreme Folding-Aktivitaet! Ueber 200% des Durchschnitts - alle GPUs gluehen!';
  } else if (activityPct > 120) {
    condition = 'sunny'; icon = 'sun';
    description = 'Sonnenschein! Ueberdurchschnittliche Aktivitaet - die Proteine werden gecruncht!';
  } else if (activityPct >= 80) {
    condition = 'partly_cloudy'; icon = 'cloud_sun';
    description = 'Leicht bewoelkt. Normale Aktivitaet - stetig und zuverlaessig.';
  } else if (activityPct >= 50) {
    condition = 'cloudy'; icon = 'cloud';
    description = 'Bewoelkt. Unterdurchschnittliche Aktivitaet, aber einige Folder sind noch aktiv.';
  } else {
    condition = 'rainy'; icon = 'cloud_rain';
    description = 'Regen. Wenig Aktivitaet heute - die GPUs machen Pause.';
  }

  // Trend: compare 7d PPD vs 30d PPD
  let trend = 'steady';
  if (ppd7d > 0 && ppd30d > 0) {
    const trendRatio = ppd7d / ppd30d;
    if (trendRatio > 1.1) trend = 'rising';
    else if (trendRatio < 0.9) trend = 'falling';
  }

  // 3-day forecast based on current activity pattern
  const forecast = [];
  const dayNames = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  for (let i = 1; i <= 3; i++) {
    const futureDate = new Date(Date.now() + i * 86400000);
    const dayName = dayNames[futureDate.getDay()];
    const isWeekend = futureDate.getDay() === 0 || futureDate.getDay() === 6;
    const forecastPct = activityPct * (isWeekend ? 0.85 : 1.05);
    let fCondition, fIcon;
    if (forecastPct > 200) { fCondition = 'thunderstorm'; fIcon = 'zap'; }
    else if (forecastPct > 120) { fCondition = 'sunny'; fIcon = 'sun'; }
    else if (forecastPct >= 80) { fCondition = 'partly_cloudy'; fIcon = 'cloud_sun'; }
    else if (forecastPct >= 50) { fCondition = 'cloudy'; fIcon = 'cloud'; }
    else { fCondition = 'rainy'; fIcon = 'cloud_rain'; }
    forecast.push({ day: dayName, condition: fCondition, icon: fIcon });
  }

  res.json({
    current: {
      condition,
      icon,
      description,
      score_delta_24h: scoreDelta24h,
      active_members: activeMembers,
      trend,
    },
    forecast,
  });
});

// ============================================================
// API routes - MATRIX.EXE (Real-time fold data for matrix visualization)
// ============================================================

/**
 * GET /api/matrix - Live-style data stream for a matrix rain visualization.
 * Returns recent member activity as a stream of "data drops" with names,
 * scores, WUs, and activity intensity for rendering as matrix rain columns.
 *
 * Response: {
 *   columns: [{
 *     id: number,
 *     donor_name: string,
 *     score: number,
 *     wus: number,
 *     score_gain_24h: number,
 *     wus_gain_24h: number,
 *     intensity: number (0-1),
 *     chars: string[]
 *   }],
 *   team_score: number,
 *   team_wus: number,
 *   active_count: number,
 *   data_points: number,
 *   pulse: number (0-1, overall team activity pulse)
 * }
 */
app.get('/api/matrix', async (req, res) => {
  try {
    const raw = await fahFetch(`/team/${TEAM_ID}/members`);
    const members = parseMembers(raw);

    // Get 24h deltas for each member
    const columns = [];
    let totalGain = 0;
    const maxPossibleGain = Math.max(1, ...members.map(m => m.score));

    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      const prevSnap = db.prepare(
        "SELECT score, wus FROM member_snapshots WHERE name = ? AND timestamp <= datetime('now', '-1 day') ORDER BY timestamp DESC LIMIT 1"
      ).get(m.name);

      const scoreGain = prevSnap ? Math.max(0, m.score - prevSnap.score) : 0;
      const wusGain = prevSnap ? Math.max(0, m.wus - prevSnap.wus) : 0;
      totalGain += scoreGain;

      // Build "chars" array from score digits and name chars for the matrix rain effect
      const scoreStr = String(m.score);
      const nameChars = m.name.split('');
      const chars = [];
      for (let c = 0; c < Math.min(20, scoreStr.length + nameChars.length); c++) {
        if (c < nameChars.length) chars.push(nameChars[c]);
        else chars.push(scoreStr[c - nameChars.length] || '0');
      }

      columns.push({
        id: i,
        donor_name: m.name,
        score: m.score,
        wus: m.wus,
        score_gain_24h: scoreGain,
        wus_gain_24h: wusGain,
        intensity: scoreGain > 0 ? Math.min(1, scoreGain / (maxPossibleGain * 0.01)) : 0,
        chars,
      });
    }

    // Sort by activity intensity so most active columns come first
    columns.sort((a, b) => b.intensity - a.intensity);

    const teamLatest = db.prepare('SELECT score, wus FROM team_snapshots ORDER BY timestamp DESC LIMIT 1').get();
    const teamPrev = db.prepare("SELECT score FROM team_snapshots WHERE timestamp <= datetime('now', '-1 day') ORDER BY timestamp DESC LIMIT 1").get();
    const teamGain = teamLatest && teamPrev ? teamLatest.score - teamPrev.score : 0;
    const avgGain30d = db.prepare("SELECT AVG(daily_gain) as avg FROM (SELECT MAX(score) - MIN(score) as daily_gain FROM team_snapshots GROUP BY strftime('%Y-%m-%d', timestamp) ORDER BY strftime('%Y-%m-%d', timestamp) DESC LIMIT 30)").get();
    const pulse = avgGain30d && avgGain30d.avg > 0 ? Math.min(1, teamGain / avgGain30d.avg) : 0;

    res.json({
      columns,
      team_score: teamLatest ? teamLatest.score : 0,
      team_wus: teamLatest ? teamLatest.wus : 0,
      active_count: columns.filter(c => c.intensity > 0).length,
      data_points: columns.length,
      pulse: parseFloat(pulse.toFixed(2)),
    });
  } catch (err) {
    console.error('[API /api/matrix]', err.message);
    res.status(502).json({ error: 'Failed to generate matrix data.' });
  }
});

// ============================================================
// API routes - RAFFLE.EXE (Monthly Raffle)
// ============================================================

/**
 * GET /api/raffle - Current month raffle status: participants, ticket counts,
 * and past winners.
 *
 * Response: {
 *   current_month: string (YYYY-MM),
 *   status: 'open' | 'drawn',
 *   entries: [{ donor_name: string, tickets: number }],
 *   total_tickets: number,
 *   total_participants: number,
 *   winner: { donor_name: string, tickets: number, drawn_at: string } | null,
 *   past_winners: [{ month_key: string, donor_name: string, tickets: number, total_participants: number, drawn_at: string }],
 *   rules: { earn_tickets: string, draw_date: string }
 * }
 */
app.get('/api/raffle', (req, res) => {
  const monthKey = new Date().toISOString().slice(0, 7);

  // Current month entries
  const entries = db.prepare(
    'SELECT donor_name, tickets FROM raffle_entries WHERE month_key = ? ORDER BY tickets DESC'
  ).all(monthKey);
  const totalTickets = entries.reduce((s, e) => s + e.tickets, 0);

  // Check if already drawn this month
  const winner = db.prepare('SELECT * FROM raffle_winners WHERE month_key = ?').get(monthKey);

  // Past winners
  const pastWinners = db.prepare(
    'SELECT month_key, donor_name, tickets, total_participants, drawn_at FROM raffle_winners ORDER BY month_key DESC LIMIT 12'
  ).all();

  res.json({
    current_month: monthKey,
    status: winner ? 'drawn' : 'open',
    entries,
    total_tickets: totalTickets,
    total_participants: entries.length,
    winner: winner ? { donor_name: winner.donor_name, tickets: winner.tickets, drawn_at: winner.drawn_at } : null,
    past_winners: pastWinners,
    rules: {
      earn_tickets: 'Earn 1 raffle ticket for each day you complete at least 1 WU. More active days = more tickets = higher chance to win!',
      draw_date: 'Drawing happens on the 1st of each month for the previous month.',
    },
  });
});

/**
 * POST /api/raffle/draw - Draw the raffle winner for the previous month.
 * Uses a weighted random selection based on ticket count.
 * Can only be drawn once per month.
 *
 * Response: {
 *   success: boolean,
 *   month_key: string,
 *   winner: { donor_name: string, tickets: number, total_participants: number } | null,
 *   message: string
 * }
 */
app.post('/api/raffle/draw', express.json(), (req, res) => {
  // Draw for previous month
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthKey = prevMonth.toISOString().slice(0, 7);

  // Check if already drawn
  const existing = db.prepare('SELECT * FROM raffle_winners WHERE month_key = ?').get(monthKey);
  if (existing) {
    return res.json({ success: false, month_key: monthKey, winner: null, message: `Raffle for ${monthKey} was already drawn. Winner: ${existing.donor_name}` });
  }

  // Get entries
  const entries = db.prepare('SELECT donor_name, tickets FROM raffle_entries WHERE month_key = ?').all(monthKey);
  if (entries.length === 0) {
    return res.json({ success: false, month_key: monthKey, winner: null, message: `No entries for ${monthKey}.` });
  }

  // Weighted random selection
  const totalTickets = entries.reduce((s, e) => s + e.tickets, 0);
  let rand = Math.floor(Math.random() * totalTickets);
  let winnerEntry = entries[0];
  for (const entry of entries) {
    rand -= entry.tickets;
    if (rand < 0) {
      winnerEntry = entry;
      break;
    }
  }

  // Record winner
  db.prepare(
    'INSERT INTO raffle_winners (month_key, donor_name, tickets, total_participants) VALUES (?, ?, ?, ?)'
  ).run(monthKey, winnerEntry.donor_name, winnerEntry.tickets, entries.length);

  res.json({
    success: true,
    month_key: monthKey,
    winner: { donor_name: winnerEntry.donor_name, tickets: winnerEntry.tickets, total_participants: entries.length },
    message: `Congratulations to ${winnerEntry.donor_name}! Won with ${winnerEntry.tickets} tickets out of ${totalTickets} total.`,
  });
});

// ============================================================
// API routes - SEASON.EXE (Seasonal XP/Level System)
// ============================================================

/**
 * GET /api/season/current - Current active season info.
 *
 * Response: { name: string, start_date: string, end_date: string, days_remaining: number }
 */
app.get('/api/season/current', (req, res) => {
  const season = ensureCurrentSeason();
  const now = new Date();
  const endDate = new Date(season.end_date);
  const daysRemaining = Math.max(0, Math.ceil((endDate - now) / 86400000));

  res.json({
    name: season.name,
    start_date: season.start_date,
    end_date: season.end_date,
    days_remaining: daysRemaining,
  });
});

/**
 * GET /api/season/leaderboard - Season XP leaderboard with levels and rank titles.
 * Query params: limit (default 50, max 200)
 *
 * Response: [{ name: string, xp: number, level: number, rank_title: string, wins: number }]
 */
app.get('/api/season/leaderboard', (req, res) => {
  const limit = validatePositiveInt(req.query.limit, 50, 200);
  const season = ensureCurrentSeason();

  const rows = db.prepare(
    'SELECT donor_name, xp, wins FROM season_xp WHERE season_id = ? ORDER BY xp DESC LIMIT ?'
  ).all(season.id, limit);

  const leaderboard = rows.map(r => {
    const level = levelFromXp(r.xp);
    return {
      name: r.donor_name,
      xp: r.xp,
      level,
      rank_title: getSeasonRankTitle(level),
      wins: r.wins,
    };
  });

  res.json(leaderboard);
});

// ============================================================
// API routes - VERSUS.EXE (Weekly Duel System)
// ============================================================

/**
 * GET /api/versus/current - Current week's active duels.
 *
 * Response: {
 *   week: string,
 *   duels: [{
 *     member1: string, member2: string,
 *     score1: number, score2: number,
 *     gain1: number, gain2: number,
 *     status: 'active' | 'completed',
 *     winner: string | null
 *   }]
 * }
 */
app.get('/api/versus/current', (req, res) => {
  // Determine current week key
  const now = new Date();
  const weekKey = now.toISOString().split('T')[0].slice(0, 4) + '-W' +
    String(Math.ceil((now.getDate() + new Date(now.getFullYear(), now.getMonth(), 1).getDay()) / 7)).padStart(2, '0');

  const duels = db.prepare(
    'SELECT * FROM versus_duels WHERE week = ? ORDER BY id ASC'
  ).all(weekKey);

  const result = duels.map(d => ({
    member1: d.member1,
    member2: d.member2,
    score1: d.score1_current,
    score2: d.score2_current,
    gain1: d.score1_current - d.score1_start,
    gain2: d.score2_current - d.score2_start,
    status: d.status,
    winner: d.winner,
  }));

  res.json({ week: weekKey, duels: result });
});

/**
 * GET /api/versus/rankings - All-time versus duel rankings.
 * Query params: limit (default 50, max 200)
 *
 * Response: [{ name: string, wins: number, losses: number, win_rate: number, duel_rank: number }]
 */
app.get('/api/versus/rankings', (req, res) => {
  const limit = validatePositiveInt(req.query.limit, 50, 200);

  const rows = db.prepare(
    'SELECT donor_name, wins, losses, draws FROM versus_history ORDER BY wins DESC, losses ASC LIMIT ?'
  ).all(limit);

  const rankings = rows.map((r, i) => {
    const totalDuels = r.wins + r.losses + r.draws;
    return {
      name: r.donor_name,
      wins: r.wins,
      losses: r.losses,
      win_rate: totalDuels > 0 ? parseFloat(((r.wins / totalDuels) * 100).toFixed(1)) : 0,
      duel_rank: i + 1,
    };
  });

  res.json(rankings);
});

// ============================================================
// API routes - PREDICT.EXE / FUNFACTS (Fun Facts & Prognoses)
// ============================================================

/**
 * GET /api/funfacts - Fun facts and predictions computed from history data.
 * Includes milestone ETAs, rival overtakes, team trends, and fun comparisons.
 *
 * Response: { facts: [{ icon: string, title: string, text: string, category: string }] }
 *
 * category values: 'milestone' | 'rivalry' | 'trend' | 'fun' | 'record'
 */
app.get('/api/funfacts', async (req, res) => {
  try {
    const facts = [];

    // Team data
    const latest = db.prepare('SELECT score, wus, rank, member_count FROM team_snapshots ORDER BY timestamp DESC LIMIT 1').get();
    const d7 = db.prepare("SELECT score FROM team_snapshots WHERE timestamp <= datetime('now', '-7 days') ORDER BY timestamp DESC LIMIT 1").get();
    const d30 = db.prepare("SELECT score FROM team_snapshots WHERE timestamp <= datetime('now', '-30 days') ORDER BY timestamp DESC LIMIT 1").get();

    if (!latest) return res.json({ facts: [] });

    const ppd7d = d7 ? Math.round((latest.score - d7.score) / 7) : 0;
    const ppd30d = d30 ? Math.round((latest.score - d30.score) / 30) : 0;

    // Milestone ETAs
    const milestoneTargets = [400e9, 500e9, 750e9, 1e12];
    for (const target of milestoneTargets) {
      if (latest.score < target && ppd7d > 0) {
        const remaining = target - latest.score;
        const daysEst = Math.ceil(remaining / ppd7d);
        const targetDate = new Date(Date.now() + daysEst * 86400000).toISOString().split('T')[0];
        const label = target >= 1e12 ? (target / 1e12) + ' Billion' : (target / 1e9) + ' Milliarden';
        facts.push({
          icon: 'flag', title: `${label} Score`,
          text: `Bei aktuellem Tempo erreichen wir ${label} in ~${daysEst} Tagen (ca. ${targetDate}).`,
          category: 'milestone',
        });
        break; // Only show next milestone
      }
    }

    // Trend analysis
    if (ppd7d > 0 && ppd30d > 0) {
      const ratio = ppd7d / ppd30d;
      if (ratio > 1.2) {
        facts.push({
          icon: 'rocket', title: 'Beschleunigung!',
          text: `Das Team produziert ${Math.round((ratio - 1) * 100)}% mehr als im 30-Tage-Schnitt. Weiter so!`,
          category: 'trend',
        });
      } else if (ratio < 0.8) {
        facts.push({
          icon: 'hourglass', title: 'Rueckgang',
          text: `Die 7-Tage-Produktion liegt ${Math.round((1 - ratio) * 100)}% unter dem 30-Tage-Schnitt.`,
          category: 'trend',
        });
      }
    }

    // Fun comparisons
    if (latest.wus > 0) {
      const cpuHours = latest.wus * 4; // rough estimate
      facts.push({
        icon: 'bolt', title: 'Rechenpower',
        text: `Das Team hat ~${cpuHours.toLocaleString()} CPU-Stunden gespendet - das sind ${Math.round(cpuHours / 8760)} CPU-Jahre!`,
        category: 'fun',
      });
    }

    if (latest.score > 0) {
      const proteins = Math.round(latest.score / 500);
      facts.push({
        icon: 'dna', title: 'Protein-Simulationen',
        text: `Aequivalent zu ~${proteins.toLocaleString()} Protein-Struktur-Simulationen beigetragen.`,
        category: 'fun',
      });
    }

    // Rivalry: check who might overtake us or who we might overtake
    try {
      const ourTeam = await fahFetch('/team/' + TEAM_ID);
      if (ourTeam && ourTeam.rank && ppd7d > 0) {
        facts.push({
          icon: 'swords', title: 'Rang-Kampf',
          text: `Aktuell auf Rang #${ourTeam.rank}. Bei ${ppd7d.toLocaleString()} PPD klettern wir stetig nach oben.`,
          category: 'rivalry',
        });
      }
    } catch { /* skip rivalry fact if API fails */ }

    // Records: best single-day score gain ever
    const bestDay = db.prepare(`
      WITH daily AS (
        SELECT strftime('%Y-%m-%d', timestamp) as date, MAX(score) as score
        FROM team_snapshots GROUP BY strftime('%Y-%m-%d', timestamp) ORDER BY date ASC
      ),
      gains AS (
        SELECT d1.date, d1.score - d2.score as gain
        FROM daily d1, daily d2
        WHERE d2.date = strftime('%Y-%m-%d', d1.date, '-1 day') AND d1.score > d2.score
      )
      SELECT date, gain FROM gains ORDER BY gain DESC LIMIT 1
    `).get();
    if (bestDay) {
      facts.push({
        icon: 'crown', title: 'Tagesrekord',
        text: `Bester einzelner Tag: +${bestDay.gain.toLocaleString()} Score am ${bestDay.date}.`,
        category: 'record',
      });
    }

    // Member count fact
    if (latest.member_count) {
      facts.push({
        icon: 'group', title: 'Team-Groesse',
        text: `${latest.member_count} aktive Mitglieder falten gemeinsam fuer die Wissenschaft.`,
        category: 'fun',
      });
    }

    res.json({ facts });
  } catch (err) {
    console.error('[API /api/funfacts]', err.message);
    res.status(502).json({ error: 'Failed to compute fun facts.' });
  }
});

// ============================================================
// API routes - DIARY.EXE (Personal Week Recap)
// ============================================================

/**
 * GET /api/donor/:name/recap - Personal weekly or monthly recap for a donor.
 * Generates a narrative summary of the donor's recent activity.
 * Query params: period ('week' | 'month', default 'week')
 *
 * Response: {
 *   period_label: string,
 *   narrative: string,
 *   stats: {
 *     score_gain: number,
 *     wus_gain: number,
 *     achievements_unlocked: number,
 *     rank_change: number,
 *     streak_days: number
 *   },
 *   badges: [string]
 * }
 */
app.get('/api/donor/:name/recap', (req, res) => {
  const name = validateName(req.params.name);
  if (!name) return res.status(400).json({ error: 'Invalid name parameter.' });

  const period = req.query.period === 'month' ? 'month' : 'week';
  const offset = period === 'month' ? '-30 days' : '-7 days';
  const periodLabel = period === 'month' ? 'Monatliches Recap' : 'Woechentliches Recap';

  // Score & WU gain in period
  const startSnap = db.prepare(
    'SELECT MIN(score) as score, MIN(wus) as wus, MIN(rank) as rank FROM member_snapshots WHERE name = ? AND timestamp >= datetime(\'now\', ?)'
  ).get(name, offset);
  const endSnap = db.prepare(
    'SELECT MAX(score) as score, MAX(wus) as wus, MIN(rank) as rank FROM member_snapshots WHERE name = ? AND timestamp >= datetime(\'now\', \'-1 day\')'
  ).get(name);

  if (!startSnap || !endSnap || !endSnap.score) {
    return res.json({
      period_label: periodLabel,
      narrative: `Keine Daten fuer ${name} in diesem Zeitraum vorhanden.`,
      stats: { score_gain: 0, wus_gain: 0, achievements_unlocked: 0, rank_change: 0, streak_days: 0 },
      badges: [],
    });
  }

  const scoreGain = Math.max(0, endSnap.score - (startSnap.score || 0));
  const wusGain = Math.max(0, endSnap.wus - (startSnap.wus || 0));
  const rankChange = (startSnap.rank || 0) - (endSnap.rank || 0); // positive = improved

  // Achievements unlocked in period
  const achRow = db.prepare(
    'SELECT COUNT(*) as cnt FROM donor_achievements WHERE donor_name = ? AND unlocked_at >= datetime(\'now\', ?)'
  ).get(name, offset);
  const achievementsUnlocked = achRow ? achRow.cnt : 0;

  // Streak (consecutive active days in period)
  const hist = db.prepare(
    "SELECT strftime('%Y-%m-%d', timestamp) as date, MAX(wus) as wus FROM member_snapshots WHERE name = ? AND timestamp >= datetime('now', ?) GROUP BY date ORDER BY date ASC"
  ).all(name, offset);
  let streakDays = 0;
  for (let i = hist.length - 1; i >= 1; i--) {
    if (hist[i].wus > hist[i - 1].wus) streakDays++;
    else break;
  }

  // Generate narrative
  const parts = [];
  if (scoreGain > 0) {
    parts.push(`${name} hat ${scoreGain.toLocaleString()} Punkte erzielt`);
  }
  if (wusGain > 0) {
    parts.push(`${wusGain} Work Units abgeschlossen`);
  }
  if (rankChange > 0) {
    parts.push(`${rankChange} Rang-Plaetze geklettert`);
  } else if (rankChange < 0) {
    parts.push(`${Math.abs(rankChange)} Rang-Plaetze verloren`);
  }
  if (achievementsUnlocked > 0) {
    parts.push(`${achievementsUnlocked} Achievement${achievementsUnlocked > 1 ? 's' : ''} freigeschaltet`);
  }
  if (streakDays > 0) {
    parts.push(`eine ${streakDays}-Tage-Serie aufgebaut`);
  }

  let narrative;
  if (parts.length === 0) {
    narrative = `${name} war in diesem Zeitraum nicht aktiv. Zeit, die GPUs anzuwerfen!`;
  } else if (parts.length === 1) {
    narrative = `${parts[0]}. Gute Arbeit!`;
  } else {
    narrative = parts.slice(0, -1).join(', ') + ' und ' + parts[parts.length - 1] + '. Weiter so!';
  }

  // Badges based on performance
  const badges = [];
  if (scoreGain >= 10e6) badges.push('Score-Maschine');
  if (wusGain >= 50) badges.push('WU-Monster');
  if (streakDays >= 5) badges.push('Serien-Held');
  if (streakDays >= (period === 'month' ? 25 : 7)) badges.push('Perfekte ' + (period === 'month' ? 'Monat' : 'Woche'));
  if (rankChange >= 10) badges.push('Aufsteiger');
  if (achievementsUnlocked >= 3) badges.push('Achievement-Jaeger');
  if (scoreGain >= 100e6) badges.push('Punkte-Tsunami');
  if (wusGain >= 200) badges.push('Unaufhaltsam');

  res.json({
    period_label: periodLabel,
    narrative,
    stats: {
      score_gain: scoreGain,
      wus_gain: wusGain,
      achievements_unlocked: achievementsUnlocked,
      rank_change: rankChange,
      streak_days: streakDays,
    },
    badges,
  });
});

// ============================================================
// Error handling
// ============================================================

/** Custom 404 handler - prevents Express default page from leaking framework info */
app.use((req, res) => {
  res.status(404);
  if (req.path.startsWith('/api/')) {
    res.json({ error: 'Not found.' });
  } else {
    res.type('text/plain').send('404 Not Found');
  }
});

/** Catch-all error handler - prevents stack trace leakage to clients */
app.use((err, req, res, _next) => {
  console.error('[UNHANDLED ERROR]', err.message);
  res.status(500).json({ error: 'An internal server error occurred.' });
});

// ============================================================
// Server startup
// ============================================================
const server = app.listen(PORT, () => {
  console.log(`[FAH-STATS] Dashboard running at http://localhost:${PORT}`);
  console.log(`[FAH-STATS] Historical data stored in fah-stats.db`);
  console.log(`[FAH-STATS] Snapshots every ${SNAPSHOT_INTERVAL / 60000} minutes`);
});

// SECURITY: Set timeouts to prevent slow-loris and similar DoS attacks
server.keepAliveTimeout = 65 * 1000; // slightly above typical LB idle timeout
server.headersTimeout = 66 * 1000;   // must be > keepAliveTimeout

// ============================================================
// Graceful shutdown
// ============================================================

/**
 * Gracefully shut down the server: stop accepting connections, clear scheduled
 * tasks, and close the database. Forces exit after 10 seconds if connections linger.
 * @param {string} signal - The OS signal that triggered shutdown (e.g. 'SIGINT')
 */
function gracefulShutdown(signal) {
  console.log(`\n[FAH-STATS] Received ${signal}, shutting down gracefully...`);
  clearInterval(snapshotInterval);
  clearInterval(cleanupInterval);
  server.close(() => {
    console.log('[FAH-STATS] HTTP server closed.');
    db.close();
    console.log('[FAH-STATS] Database closed.');
    process.exit(0);
  });
  // Force shutdown after 10 seconds if connections linger
  setTimeout(() => {
    console.error('[FAH-STATS] Forced shutdown after timeout.');
    db.close();
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// SECURITY: Prevent process crash on unhandled rejections (e.g. network errors in async routes)
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason instanceof Error ? reason.message : reason);
});
