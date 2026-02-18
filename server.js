const express = require('express');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { parseMembers } = require('./lib');

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
  // CSP: unsafe-inline required for scripts because index.html and donors.html have inline <script> blocks.
  // TODO: extract inline scripts to external files and remove 'unsafe-inline' from script-src.
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';");
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
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 100; // max requests per window per IP

app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
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

function heavyRateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
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

function validatePeriod(period) {
  if (!period || !ALLOWED_PERIODS.has(period)) return 'daily';
  return period;
}

function validatePositiveInt(value, defaultVal, max) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 1) return defaultVal;
  return Math.min(parsed, max);
}

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

function validateAchievementId(id) {
  if (typeof id !== 'string' || id.length === 0 || id.length > 100) return false;
  // Achievement IDs should be alphanumeric with underscores/hyphens only
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

// ============================================================
// SQLite Database for historical data
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
`);

// Prepared statements
const insertTeamSnapshot = db.prepare(`
  INSERT INTO team_snapshots (score, wus, rank, member_count)
  VALUES (@score, @wus, @rank, @member_count)
`);

const insertMemberSnapshot = db.prepare(`
  INSERT INTO member_snapshots (name, fah_id, score, wus, rank)
  VALUES (@name, @fah_id, @score, @wus, @rank)
`);

const insertManyMembers = db.transaction((members) => {
  for (const m of members) insertMemberSnapshot.run(m);
});

const insertMilestone = db.prepare(
  'INSERT OR IGNORE INTO milestone_events (name, milestone, score_at_time) VALUES (?, ?, ?)'
);

const MILESTONE_THRESHOLDS = [1e6, 10e6, 100e6, 1e9, 10e9, 100e9, 1e12];

// ============================================================
// Achievements system
// ============================================================
const ALL_ACHIEVEMENTS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'achievements.json'), 'utf8')
);
const TOTAL_ACHIEVEMENT_POINTS = ALL_ACHIEVEMENTS.reduce((s, a) => s + (a.points || 0), 0);

const getUnlockedAchievements = db.prepare(
  'SELECT achievement_id, unlocked_at FROM donor_achievements WHERE donor_name = ?'
);
const insertAchievement = db.prepare(
  'INSERT OR IGNORE INTO donor_achievements (donor_name, achievement_id) VALUES (?, ?)'
);
const insertManyAchievements = db.transaction((donorName, ids) => {
  for (const id of ids) {
    if (validateAchievementId(id)) {
      insertAchievement.run(donorName, id);
    }
  }
});

// ============================================================
// Achievement helper functions
// ============================================================

function isPrime(n) {
  if (n < 2) return false;
  if (n < 4) return true;
  if (n % 2 === 0 || n % 3 === 0) return false;
  for (let i = 5; i * i <= n; i += 6) {
    if (n % i === 0 || n % (i + 2) === 0) return false;
  }
  return true;
}

function isPalindrome(n) {
  const s = String(n);
  return s.length > 1 && s === s.split('').reverse().join('');
}

function isFibonacci(n) {
  if (n <= 0) return false;
  // A number is Fibonacci if (5*n^2 + 4) or (5*n^2 - 4) is a perfect square
  const a = 5 * n * n + 4;
  const b = 5 * n * n - 4;
  const sqrtA = Math.round(Math.sqrt(a));
  const sqrtB = Math.round(Math.sqrt(b));
  return sqrtA * sqrtA === a || sqrtB * sqrtB === b;
}

function isPowerOf2(n) {
  return n > 0 && (n & (n - 1)) === 0;
}

function hasRepeatingDigits(n) {
  const s = String(n);
  if (s.length < 3) return false;
  // Check if all digits are the same
  return /^(\d)\1{2,}$/.test(s);
}

function isAscendingDigits(n) {
  const s = String(n);
  if (s.length < 2) return false;
  for (let i = 1; i < s.length; i++) {
    if (s[i] <= s[i - 1]) return false;
  }
  return true;
}

function isOnlyBinaryDigits(n) {
  return /^[01]+$/.test(String(n)) && n > 0;
}

function isPerfectSquare(n) {
  if (n < 0) return false;
  const s = Math.round(Math.sqrt(n));
  return s * s === n;
}

function isPowerOf10(n) {
  if (n < 1) return false;
  while (n >= 10) {
    if (n % 10 !== 0) return false;
    n /= 10;
  }
  return n === 1;
}

/**
 * Compute donor stats needed for achievement evaluation.
 * Returns an object with all the stats needed by conditions.
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
    // Current streak: count backwards from end
    for (let i = memberHistory.length - 1; i >= 1; i--) {
      if (memberHistory[i].wus > memberHistory[i - 1].wus) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  // days_active: days with any WU gain
  let daysActive = 0;
  if (memberHistory.length >= 2) {
    for (let i = 1; i < memberHistory.length; i++) {
      if (memberHistory[i].wus > memberHistory[i - 1].wus) daysActive++;
    }
  }

  // member_since_days: days since first snapshot
  const firstSnapshot = memberHistory.length > 0 ? memberHistory[0] : null;
  const memberSinceDays = firstSnapshot
    ? Math.floor((Date.now() - new Date(firstSnapshot.date).getTime()) / 86400000)
    : 0;

  // Daily gain: latest day score delta
  let dailyGain = 0;
  if (memberHistory.length >= 2) {
    const last = memberHistory[memberHistory.length - 1];
    const prev = memberHistory[memberHistory.length - 2];
    dailyGain = last.score - prev.score;
  }

  // Weekly gain: last 7 days score delta
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

/**
 * Check a single achievement condition against donor stats.
 * Returns { met: boolean, progress: number (0-1), current: number, target: number }
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
      // Lower rank is better; progress = how close to target
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
 * Handle special condition checks that don't fit the simple pattern.
 * Many of these are snapshot-dependent and require historical data;
 * we do best-effort with available data.
 */
function checkSpecialCondition(check, stats) {
  const score = stats.score;
  const wus = stats.wus;
  const rank = stats.rank;
  const history = stats.member_history || [];
  const members = stats.members || [];

  switch (check) {
    // Score-based specials
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

    // WU-based specials
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

    // WU daily specials
    case 'wus_daily_gte_10':
      return boolResult(getDailyWuGain(history) >= 10);
    case 'wus_daily_gte_50':
      return boolResult(getDailyWuGain(history) >= 50);
    case 'wus_daily_gte_100':
      return boolResult(getDailyWuGain(history) >= 100);

    // Rank climb specials
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

    // Streak specials
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

    // Weekly improvement specials
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

    // Team specials
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

    // Date/time specials
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

    // Activity percentage specials
    case 'active_pct_gte_50':
      return boolResult(getActivityPct(stats) >= 50);
    case 'active_pct_gte_75':
      return boolResult(getActivityPct(stats) >= 75);
    case 'active_pct_gte_90':
      return boolResult(getActivityPct(stats) >= 90);
    case 'active_pct_gte_99':
      return boolResult(getActivityPct(stats) >= 99);

    // Special month/pattern specials
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

    // Efficiency special
    case 'efficiency_near_golden_ratio': {
      const ratio = stats.efficiency;
      // Golden ratio ~= 1.618 * some power of 10
      const digits = Math.floor(Math.log10(Math.max(ratio, 1)));
      const normalized = ratio / Math.pow(10, digits);
      return boolResult(Math.abs(normalized - 1.618) < 0.01);
    }

    // Meta-achievement specials (require checking unlocked achievements)
    case '10_achievements_not_top_3':
      return boolResult(false); // Evaluated after main loop
    case 'return_after_30_days_inactive':
      return boolResult(hasReturnedAfterInactivity(history, 30));
    case 'first_day_score_gte_1m':
      return boolResult(history.length >= 2 && (history[1].score - history[0].score) >= 1e6);
    case '10_achievements_in_one_day':
      return boolResult(false); // Meta: evaluated after
    case '7_categories_in_one_week':
      return boolResult(false); // Meta: evaluated after
    case 'outperform_higher_ranked_7_days':
      return boolResult(false); // Requires cross-member analysis

    // Achievement-based meta specials
    case 'achievements_unlocked_pct_50':
    case 'achievements_unlocked_pct_90':
    case 'achievements_unlocked_pct_100':
    case 'legendary_unlocked_gte_10':
    case 'achievement_in_every_category':
    case 'achievement_points_gte_1000':
    case 'achievement_points_gte_5000':
    case 'achievement_points_maximum':
      return boolResult(false); // Meta: evaluated in post-pass

    default:
      return boolResult(false);
  }
}

// Helper: wrap boolean into result object
function boolResult(met) {
  return { met: !!met, progress: met ? 1 : 0, current: null, target: null };
}

function allSameDigits(n) {
  const s = String(n);
  return s.length >= 2 && /^(\d)\1+$/.test(s);
}

function getDailyWuGain(history) {
  if (history.length < 2) return 0;
  return Math.max(0, history[history.length - 1].wus - history[history.length - 2].wus);
}

function getRankClimb(history) {
  if (history.length < 2) return 0;
  const first = history[0].best_rank || history[0].rank || 999999;
  const last = history[history.length - 1].best_rank || history[history.length - 1].rank || 999999;
  return Math.max(0, first - last);
}

function getDailyRankGain(history) {
  if (history.length < 2) return 0;
  const prev = history[history.length - 2].best_rank || history[history.length - 2].rank || 999999;
  const last = history[history.length - 1].best_rank || history[history.length - 1].rank || 999999;
  return Math.max(0, prev - last);
}

function hasDefendedRank(history, days) {
  if (history.length < days) return false;
  const tail = history.slice(-days);
  const baseRank = tail[0].best_rank || tail[0].rank;
  return tail.every(h => (h.best_rank || h.rank) <= baseRank);
}

function hasComeback(history, inactiveDays, activeDays) {
  // Look for a gap of inactiveDays followed by activeDays of activity
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

function hasWeekendStreaks(history, weekends) {
  let count = 0;
  for (const h of history) {
    const d = new Date(h.date);
    const dayOfWeek = d.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) count++;
  }
  return count >= weekends * 2; // 2 weekend days per weekend
}

function hasPerfectStart(history, days) {
  if (history.length < days + 1) return false;
  for (let i = 1; i <= days && i < history.length; i++) {
    if (history[i].wus <= history[i - 1].wus) return false;
  }
  return true;
}

function getWeeklyImprovement(history) {
  if (history.length < 15) return 0;
  const recentWeek = history.slice(-7);
  const prevWeek = history.slice(-14, -7);
  const recentGain = recentWeek[recentWeek.length - 1].score - recentWeek[0].score;
  const prevGain = prevWeek[prevWeek.length - 1].score - prevWeek[0].score;
  if (prevGain <= 0) return 0;
  return ((recentGain - prevGain) / prevGain) * 100;
}

function hasConsistentOutput(history, days) {
  if (history.length < days + 1) return false;
  const tail = history.slice(-days - 1);
  const gains = [];
  for (let i = 1; i < tail.length; i++) {
    gains.push(tail[i].score - tail[i - 1].score);
  }
  if (gains.length === 0 || gains.some(g => g <= 0)) return false;
  const avg = gains.reduce((a, b) => a + b, 0) / gains.length;
  // Consistent if all gains within 50% of average
  return gains.every(g => g >= avg * 0.5 && g <= avg * 1.5);
}

function isTopDailyScorer(stats) {
  return stats.team_rank === 1 && stats.daily_gain > 0;
}

function getTeamTotalScore(members) {
  return members.reduce((s, m) => s + m.score, 0);
}

function wasActiveDuringYear(history, year) {
  return history.some(h => h.date && h.date.startsWith(String(year)));
}

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

function wasActiveOnFriday13(history) {
  for (let i = 1; i < history.length; i++) {
    const d = new Date(history[i].date);
    if (d.getDate() === 13 && d.getDay() === 5 && history[i].wus > history[i - 1].wus) {
      return true;
    }
  }
  return false;
}

function getActivityPct(stats) {
  if (stats.member_since_days <= 0) return 100;
  return Math.min(100, (stats.days_active / stats.member_since_days) * 100);
}

function hasFoldedEveryDayInMonth(history, month) {
  // Check if any year has all days active in given month
  const mm = String(month).padStart(2, '0');
  const byYearMonth = {};
  for (let i = 1; i < history.length; i++) {
    const d = history[i].date;
    if (!d) continue;
    const ym = d.slice(0, 7);
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

function hasFoldedEveryDayAnyMonth(history) {
  for (let m = 1; m <= 12; m++) {
    if (hasFoldedEveryDayInMonth(history, m)) return true;
  }
  return false;
}

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

/**
 * Main evaluation function: evaluate all achievements for a donor.
 */
async function evaluateDonorAchievements(donorName) {
  // Fetch current member data
  const raw = await fahFetch('/team/' + TEAM_ID + '/members');
  const members = parseMembers(raw);
  const member = members.find(m => m.name === donorName);
  if (!member) return null;

  // Get member history from DB (ascending by date)
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

  // Second pass: evaluate meta-achievements that depend on unlocked count
  const unlockedCount = unlocked.length;
  const pointsEarned = unlocked.reduce((s, a) => s + (a.points || 0), 0);
  const categories = new Set(unlocked.map(a => a.category));
  const legendaryCount = unlocked.filter(a => a.tier === 'legendary').length;

  // Re-check meta achievements that were locked
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

  // Persist newly unlocked achievements
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
// In-memory API cache
// ============================================================
const cache = new Map();

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data;
  }
  return null;
}

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
// Periodic snapshot collection
// ============================================================
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

    // Detect milestone crossings
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
  } catch (err) {
    console.error('[SNAPSHOT ERROR]', err.message);
  }
}

// Take first snapshot on startup, then every hour
takeSnapshot();
const snapshotInterval = setInterval(takeSnapshot, SNAPSHOT_INTERVAL);

// ============================================================
// Static files
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
// Live API proxy routes
// ============================================================
app.get('/api/team', async (req, res) => {
  try {
    const data = await fahFetch(`/team/${TEAM_ID}`);
    res.json(data);
  } catch (err) {
    console.error('[API /api/team]', err.message);
    res.status(502).json({ error: 'Failed to fetch team data from upstream API.' });
  }
});

app.get('/api/members', async (req, res) => {
  try {
    const raw = await fahFetch(`/team/${TEAM_ID}/members`);
    res.json(parseMembers(raw));
  } catch (err) {
    console.error('[API /api/members]', err.message);
    res.status(502).json({ error: 'Failed to fetch member data from upstream API.' });
  }
});

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
// Historical data API routes
// ============================================================

// Team history - aggregated by period
// GET /api/history/team?period=hourly|daily|weekly|monthly|yearly&limit=100
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

  // Compute deltas (score gained per period)
  const result = rows.reverse().map((row, i, arr) => ({
    ...row,
    score_delta: i > 0 ? row.score - arr[i - 1].score : 0,
    wus_delta: i > 0 ? row.wus - arr[i - 1].wus : 0,
  }));

  res.json(result);
});

// Member history for a specific member
// GET /api/history/member/:name?period=daily&limit=365
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

// Top movers: who gained most in last N days
// GET /api/history/movers?days=7
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

// Database stats / summary
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
// Analytics & prediction endpoints
// ============================================================

// Milestones - calculate next score milestones with ETA
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

// Rank prediction based on 30-day trend
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

// Heatmap - hourly activity data for a member (last 30 days)
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

// Streak - consecutive days with WU gains
app.get('/api/streak', (req, res) => {
  const dailyWUs = db.prepare(`
    SELECT strftime('%Y-%m-%d', timestamp) as date, MAX(wus) as wus
    FROM team_snapshots
    GROUP BY date
    ORDER BY date DESC
    LIMIT 365
  `).all();

  // Compute all streaks (consecutive days with WU gains)
  // Data is DESC so earlier entries have smaller WUs (cumulative)
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
  // Final check
  if (tempStreak > maxStreak) maxStreak = tempStreak;
  if (!currentStreakDone) currentStreak = tempStreak;

  res.json({
    current_streak: currentStreak,
    max_streak: maxStreak,
    total_active_days: dailyWUs.length,
  });
});

// Member of the Week - highest score gain in last 7 days
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

// Team goals with progress tracking
app.get('/api/goals', (req, res) => {
  const latest = db.prepare('SELECT score, wus, rank, member_count FROM team_snapshots ORDER BY timestamp DESC LIMIT 1').get();
  if (!latest) return res.json([]);

  const goals = [
    { id: 'score-400b', name: '400 Milliarden Score', target: 400e9, current: latest.score, unit: 'Score' },
    { id: 'rank-15', name: 'Top 15 Rang', target: 15, current: latest.rank, unit: 'Rank', invert: true },
    { id: 'wus-500k', name: '500.000 Work Units', target: 500000, current: latest.wus, unit: 'WUs' },
    { id: 'members-100', name: '100 Mitglieder', target: 100, current: latest.member_count || 0, unit: 'Members' },
  ];

  // Get historical starting rank for progress baseline
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
// Donor profile routes
// ============================================================

// Serve donor listing page
app.get('/donors', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'donors.html'));
});

// Serve individual donor profile page
app.get('/donor/:name', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'donor.html'));
});

// Comprehensive donor summary combining multiple data sources
app.get('/api/donor/:name/summary', heavyRateLimit, async (req, res) => {
  const name = validateName(req.params.name);
  if (!name) return res.status(400).json({ error: 'Invalid name parameter.' });
  try {
    // Get current data from F@H API via members cache
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

    // Historical data from DB
    const history = db.prepare(
      "SELECT strftime('%Y-%m-%d', timestamp) as date, MAX(score) as score, MAX(wus) as wus, MIN(rank) as best_rank FROM member_snapshots WHERE name = ? GROUP BY date ORDER BY date DESC LIMIT 90"
    ).all(name);

    // 7-day gain
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

// Per-user achievements (powered by achievement engine)
app.get('/api/donor/:name/achievements', heavyRateLimit, async (req, res) => {
  const name = validateName(req.params.name);
  if (!name) return res.status(400).json({ error: 'Invalid name parameter.' });
  try {
    const result = await evaluateDonorAchievements(name);
    if (!result) return res.status(404).json({ error: 'Member not found' });
    res.json(result);
  } catch (err) {
    console.error('[API /api/donor/achievements]', err.message);
    res.status(502).json({ error: 'Failed to load achievements' });
  }
});

// Browse all 300 achievements (catalog view)
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

// Achievement leaderboard - top donors by achievement points
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
    return {
      donor_name: row.donor_name,
      unlocked_count: row.unlocked_count,
      points,
      total: ALL_ACHIEVEMENTS.length,
      completion_pct: parseFloat(((row.unlocked_count / ALL_ACHIEVEMENTS.length) * 100).toFixed(1)),
    };
  });

  res.json(leaderboard);
});

// ============================================================
// PPD, Monthly Leaderboard, Rivals, Crossings, Milestones Chronology, Export
// ============================================================

app.get('/api/ppd', (req, res) => {
  // Team PPD: compare latest vs 24h/7d/30d ago snapshots
  const latest = db.prepare('SELECT score, timestamp FROM team_snapshots ORDER BY timestamp DESC LIMIT 1').get();
  const h24 = db.prepare("SELECT score FROM team_snapshots WHERE timestamp <= datetime('now', '-1 day') ORDER BY timestamp DESC LIMIT 1").get();
  const d7 = db.prepare("SELECT score FROM team_snapshots WHERE timestamp <= datetime('now', '-7 days') ORDER BY timestamp DESC LIMIT 1").get();
  const d30 = db.prepare("SELECT score FROM team_snapshots WHERE timestamp <= datetime('now', '-30 days') ORDER BY timestamp DESC LIMIT 1").get();

  if (!latest) return res.json({ team: {}, members: [] });

  const team_ppd_24h = h24 ? Math.round((latest.score - h24.score) / 1) : 0;
  const team_ppd_7d = d7 ? Math.round((latest.score - d7.score) / 7) : 0;
  const team_ppd_30d = d30 ? Math.round((latest.score - d30.score) / 30) : 0;

  // Per-member PPD
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

app.get('/api/rivals', async (req, res) => {
  try {
    const ourTeam = await fahFetch('/team/' + TEAM_ID);
    if (!ourTeam || !ourTeam.rank) return res.json({ our_team: null, rivals: [] });

    const ourRank = ourTeam.rank;
    // FAH API /team?limit=N returns top teams by credit (name, team, credit, wus - no rank field)
    const fetchLimit = Math.min(ourRank + 10, 100);
    const data = await fahFetch('/team?limit=' + fetchLimit);
    const allTeams = Array.isArray(data) ? data : (data.results || []);

    // Sort by credit descending and assign ranks
    const sorted = allTeams.sort((a, b) => (b.credit || 0) - (a.credit || 0));
    sorted.forEach((t, i) => { t._rank = i + 1; });

    // Find teams near our rank (5 above, 5 below)
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
// Custom 404 handler (prevent Express default page leaking framework info)
// ============================================================
app.use((req, res) => {
  res.status(404);
  if (req.path.startsWith('/api/')) {
    res.json({ error: 'Not found.' });
  } else {
    res.type('text/plain').send('404 Not Found');
  }
});

// ============================================================
// Catch-all error handler (prevent stack trace leakage)
// ============================================================
app.use((err, req, res, _next) => {
  console.error('[UNHANDLED ERROR]', err.message);
  res.status(500).json({ error: 'An internal server error occurred.' });
});

// ============================================================
// Start
// ============================================================
const server = app.listen(PORT, () => {
  console.log(`[FAH-STATS] Dashboard running at http://localhost:${PORT}`);
  console.log(`[FAH-STATS] Historical data stored in fah-stats.db`);
  console.log(`[FAH-STATS] Snapshots every ${SNAPSHOT_INTERVAL / 60000} minutes`);
});

// SECURITY: Set timeouts to prevent slow-loris and similar DoS attacks
server.keepAliveTimeout = 65 * 1000; // slightly above typical LB idle timeout
server.headersTimeout = 66 * 1000;   // must be > keepAliveTimeout

// Graceful shutdown: close server, clear intervals, then close DB
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
