# CLAUDE.md - Project Context for AI Assistants

## Project Overview

**FOF Stats** is a Folding@Home statistics dashboard for Team #240890 "FreilaufendeOnlineFuzzies".
It fetches data from the official Folding@Home API, stores hourly snapshots in SQLite, and serves
an interactive retro-themed (DOS/Win95) web frontend with gamification, analytics, and visualizations.

- **Site:** https://fof-stats.de
- **Repo:** https://github.com/lmarkusl/fof-stats (private)
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

Single-file Express server (~3500+ lines) with:
- Security middleware (CSP, HSTS, rate limiting)
- 16 SQLite tables with auto-creation on startup
- Achievement engine (300+ achievements, condition evaluator)
- In-memory API cache with TTL
- Hourly snapshot scheduler
- 49 API endpoints (48 GET + 1 POST)

### Frontend (public/)

- `index.html` - Main dashboard with tab system
- `donors.html` / `donor.html` - Member overview and individual profiles
- `datenschutz.html` - Privacy policy (DSGVO)

### Tab System

The main dashboard uses four tabs:
1. **tab-overview** - Team stats, charts, activity feed
2. **tab-rankings** - Leaderboard, monthly, season, versus, achievements
3. **tab-analytics** - PPD, heatmap, milestones, predictions, zeitgeist
4. **tab-extras** - Export, certificate, research, global, challenges

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
- Helper functions from utils.js: `formatScore()`, `formatNumber()`, `escapeHtml()`
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

- The `achievements.json` file contains 300+ achievement definitions - it is large
- The server.js is a single large file (~3500+ lines) - do not try to split it
- No build step or transpilation - frontend JS runs directly in the browser
- All feature JS files are loaded via `<script>` tags in HTML (not bundled)
- The Folding@Home API is proxied to avoid CORS issues and to cache responses
