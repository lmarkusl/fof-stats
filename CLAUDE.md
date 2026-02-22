# CLAUDE.md - Project Context for AI Assistants

## Project Overview

**FOF Stats** is a Folding@Home statistics dashboard for Team #240890 "FreilaufendeOnlineFuzzies".
It fetches data from the official Folding@Home API, stores hourly snapshots in SQLite, and serves
an interactive retro-themed (DOS/Win95) web frontend with gamification, analytics, and visualizations.

- **Site:** https://fof-stats.de
- **Repo:** https://github.com/lmarkusl/fof-stats
- **Version:** 2.0.0

## Architecture

| Layer | Technology |
|---|---|
| Backend | Node.js + Express 4 |
| Database | SQLite via better-sqlite3 (WAL mode) |
| Frontend | Vanilla HTML/CSS/JS (no framework, no build step) |
| Charts | Chart.js 4 loaded via CDN with SRI integrity hash |
| Process Manager | PM2 (ecosystem.config.js) |
| Tests | Node.js built-in test runner (`node --test`) |

### Backend (server.js)

Single-file Express server (~4700+ lines) with:
- Security middleware (CSP, HSTS, rate limiting)
- 16 SQLite tables with auto-creation on startup
- Achievement engine (~300 achievements, condition evaluator)
- In-memory API cache with TTL
- Hourly snapshot scheduler
- 49 API endpoints (48 GET + 1 POST)
- `lib.js` contains shared utility functions (`parseMembers`, `getTier`, `formatScore`) used by both server and tests

### Frontend (public/)

**HTML pages:**
- `index.html` - Main dashboard with tab system (loads 20 feature modules + easter-eggs.js)
- `donors.html` - Member overview (searchable card grid, loads donors-page.js)
- `donor.html` - Individual donor profile (loads donor-page.js, feature-predictions.js, feature-diary.js)
- `datenschutz.html` - Privacy policy (DSGVO)

**CSS:** `css/style.css` (main), `css/donor.css` (donor pages)

**Core JS modules:**
- `utils.js` - Shared utilities (`escapeHtml`, `formatScore`, `formatNumber`, `formatScoreShort`, `getTier`)
- `charts.js` - Chart.js wrapper, global chart defaults, `initCharts()`, `storeChart()`, `destroyChart()`, `ensureCanvas()`
- `app.js` - Main application: tab system, dashboard loading, KPI cards, leaderboard, auto-refresh
- `nav-toggle.js` - Mobile hamburger menu and Impressum modal
- `easter-eggs.js` - Three hidden easter eggs (see Easter Eggs section)
- `donor-page.js` - Donor profile: KPIs, score history, achievements, heatmap
- `donors-page.js` - Donor list: searchable card grid sorted by score

### Tab System

The main dashboard uses four tabs (lazy-loaded on first click, except overview):
1. **tab-overview** - KPI cards, team score history (HISTORY.EXE), PPD/throughput (THROUGHPUT.EXE), highlights with streak + Member of the Week (HIGHLIGHTS.EXE), milestones + rank prediction (FORECAST.EXE)
2. **tab-rankings** - Member leaderboard (DIR MEMBERS /S), monthly leaderboard (MONTHLY.EXE), rival teams + rank crossings (RIVALS.EXE), seasonal XP/level system (SEASON.EXE)
3. **tab-analytics** - 11 chart types in ANALYZE.EXE (Pareto, Scatter, Share, Classify, Ranks, Timeline, Movers, Lorenz, Distribution, Heatmap, Rank History), activity feed (EVENTLOG.EXE), global context (GLOBAL.DAT), constellation network visualization (CONSTELLATION.EXE)
4. **tab-extras** - Fun stats (TYPE STATS.TXT), score equivalents (CONVERT.EXE), ASCII achievements (TROPHY.EXE), team goals (GOALS.BAT), achievement leaderboard (ACHIEVEMENTS.EXE), team challenges (CHALLENGE.EXE), weather report (WEATHER.EXE), milestone chronology (HISTORY.LOG), member compare tool (COMPARE.EXE), data export + certificates + forum signatures (EXPORT.EXE)

**Keyboard shortcuts:** Alt+1–4 switch tabs, URL hash routing (e.g., `#tab-analytics`)

## Coding Conventions

### Frontend JavaScript

- **Use `var` (not `const`/`let`)** for maximum browser compatibility
- Style injection via IIFE pattern:
  ```javascript
  (function(){
    var style = document.createElement('style');
    style.textContent = `...`;
    document.head.appendChild(style);
  })();
  ```
- **Always use `escapeHtml()` from utils.js** when inserting user data into innerHTML
- Helper functions from utils.js: `escapeHtml()`, `formatScore()`, `formatNumber()`, `formatScoreShort()`, `getTier()`
- Chart management: `storeChart()`, `destroyChart()`, `ensureCanvas()` from charts.js

### Feature Module Pattern

Each feature lives in its own `feature-*.js` file following this structure:

1. **Header comment block** with feature name, description, API endpoints, container IDs, and dependencies
2. **IIFE CSS injection** for component-specific styles
3. **Init function** (e.g., `initSeason()`) called from app.js
4. **Fetch + render** pattern with error handling

Example header:
```javascript
// ============================================================
// Feature: FEATURE_NAME - Short Description
// Longer description of what the feature does.
// Fetches from /api/endpoint
// Container: #container-id
// Called via initFeatureName(). Depends on: utils.js
// ============================================================
```

### DOS/Win95 Retro Theme

- Monospace fonts (`Courier New`, `var(--font-mono)`)
- Borders use `outset`/`inset` for 3D button effects
- Color palette: `#00cc66` (green accent), `#0a0a0a` (dark bg), `#cc8800` (gold)
- Feature names use `.EXE` suffix in UI (e.g., "SEASON.EXE", "VERSUS.EXE")
- German-language UI text throughout

### Easter Eggs

Three hidden easter eggs in `easter-eggs.js`, initialized via `initEasterEggs()`:

1. **Terminal** - Press backtick (`` ` ``) to open a DOS-style command prompt (`C:\FOF>`). Commands: `DIR` (top 10 members), `VER`, `HELP`, `CLS`, `PING <name>` (open profile), `COLOR 0A` (Matrix mode), `COLOR 07` (normal), `EXIT`. Close with Escape.
2. **BSOD** - Enter the Konami Code (↑↑↓↓←→←→BA) to trigger a Win95 Blue Screen of Death overlay showing team stats with humorous error messages. Dismiss with any key/click.
3. **CRT Scanlines** - Toggle button labeled "CRT" in the footer. Overlays CRT monitor scanline effect with flicker animation. State persisted in localStorage (`fof-crt-enabled`).

### Feature Modules (public/js/feature-*.js)

20 feature modules, each following the Feature Module Pattern:

| Module | Feature | Tab/Page |
|---|---|---|
| `feature-ppd.js` | PPD/Throughput stats | overview |
| `feature-social.js` | Streak counter + Member of the Week | overview |
| `feature-milestone.js` | Milestone tracker + rank prediction | overview |
| `feature-profile.js` | Donor profile modal + export/share | overview |
| `feature-monthly.js` | Monthly leaderboard + active filter | rankings |
| `feature-rivals.js` | Rival teams, rank history, crossings | rankings |
| `feature-season.js` | Seasonal XP/level system | rankings |
| `feature-heatmap.js` | Member activity heatmap | analytics |
| `feature-activity-feed.js` | Live event stream | analytics |
| `feature-global.js` | Global F@H context stats | analytics |
| `feature-constellation.js` | Network visualization | analytics |
| `feature-extras.js` | Fun stats, equivalents, ASCII art, goals | extras |
| `feature-ach-board.js` | Achievement leaderboard | extras |
| `feature-challenges.js` | Team challenge system | extras |
| `feature-weather.js` | Team activity weather report | extras |
| `feature-compare.js` | Member-vs-member comparison | extras |
| `feature-certificate.js` | Certificate PNG generator | extras |
| `feature-export.js` | CSV/JSON export + forum signatures | extras |
| `feature-predictions.js` | Personal score/rank projections | donor.html |
| `feature-diary.js` | Weekly recap card | donor.html |

## API Conventions

- All endpoints are GET except `POST /api/raffle/draw`
- Input validation: `validateName()` for donor names, `validatePeriod()` for time periods
- SQL: Always use prepared statements (never string interpolation)
- Rate limiting: Standard (100 req/min) and heavy (`heavyRateLimit`, 10 req/min) for expensive queries
- Response format: JSON objects/arrays, no wrapper envelope
- Errors return `{ error: "message" }` with appropriate HTTP status codes

## Database

SQLite database (`fah-stats.db`) with WAL mode enabled. 16 tables auto-created on server start:

- **Snapshots:** `team_snapshots`, `member_snapshots`
- **Achievements:** `donor_achievements`
- **Events:** `milestone_events`, `motw_history`
- **Challenges:** `challenges`, `challenge_progress`
- **Quests:** `quest_definitions`, `quest_progress`, `donor_xp`
- **Raffle:** `raffle_entries`, `raffle_winners`
- **Seasons:** `seasons`, `season_xp`
- **Versus:** `versus_duels`, `versus_history`

## Deployment

- Hosted via **Plesk Git Extension** (auto-pull from GitHub)
- Backend changes require **manual Node.js restart** in Plesk panel
- Frontend changes (HTML/CSS/JS) are live after git pull (static files)
- PM2 manages the Node.js process (`ecosystem.config.js`)

## Important Notes

- The `achievements.json` file contains ~300 achievement definitions - it is large
- The server.js is a single large file (~4700+ lines) - do not try to split it
- No build step or transpilation - frontend JS runs directly in the browser
- All feature JS files are loaded via `<script>` tags in HTML (not bundled)
- The Folding@Home API is proxied to avoid CORS issues and to cache responses
