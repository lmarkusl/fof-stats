# Changelog

All notable changes to FOF Stats are documented in this file.

## [2.0.0] - 2026-02-18

### Major Release: 11 New Creative Features

This release transforms FOF Stats from a statistics dashboard into a full gamification platform
with advanced analytics, real-time activity tracking, and interactive visualizations.

### New Features

- **SEASON.EXE** - Seasonal XP/level system with countdown timers and ranked leaderboards (`feature-season.js`)
- **VERSUS.EXE** - Weekly 1v1 duels with VS graphics, progress bars, and win/loss rankings (`feature-versus.js`)
- **TIMELINE.EXE** - DOS-terminal-style chronological event log of team activity (`feature-timeline.js`)
- **WEATHER.EXE** - Team activity weather report with forecast visualization (`feature-weather.js`)
- **PREDICT.EXE (Fun Facts)** - Fun-facts ticker with interesting stats and predictions (`feature-funfacts.js`)
- **DIARY.EXE** - Weekly/monthly recap on donor profile pages (`feature-diary.js`)
- **Donor Predictions** - Personal score/rank forecasts and milestone ETAs (`feature-predictions.js`)
- **CONSTELLATION.EXE** - Network visualization of team member relationships (`feature-constellation.js`)
- **Activity Feed (EVENTLOG.EXE)** - Live event stream showing milestones, achievements, and rank changes (`feature-activity-feed.js`)
- **Power Rankings (POWERRANK.EXE)** - Composite score rankings with radar chart visualization (`feature-power-rankings.js`)
- **ZEITGEIST.EXE** - Period retrospectives (week/month/year) with highlights and records (`feature-zeitgeist.js`)

### New API Endpoints (13+)

- `GET /api/season/current` - Current season info with countdown
- `GET /api/season/leaderboard` - Season XP rankings
- `GET /api/versus/current` - Current week's duel pairings
- `GET /api/versus/rankings` - All-time duel win/loss rankings
- `GET /api/funfacts` - Fun-facts and predictions from history data
- `GET /api/donor/:name/recap` - Weekly/monthly donor recap
- `GET /api/donor/:name/predictions` - Personal score/rank predictions
- `GET /api/timeline` - Chronological event log
- `GET /api/weather` - Team activity weather report
- `GET /api/constellation` - Team network visualization data
- `GET /api/activity-feed` - Live event feed
- `GET /api/power-rankings` - Composite power rankings with radar data
- `GET /api/zeitgeist/:period` - Period retrospective (week/month/year)

### Database

- 16 tables with auto-creation on server startup
- New tables: `seasons`, `season_xp`, `versus_duels`, `versus_history`

### Hardening Fixes

- Fixed Weather API response structure validation
- Fixed Constellation node ID generation for special characters
- Added `object-src 'none'` to Content Security Policy

### Documentation

- Added CLAUDE.md for AI assistant context
- Added CHANGELOG.md
- Updated README.md with all features, API endpoints, and DB schema
- Added header comments to older feature files

---

## [1.0.1] - Initial Release

### Features

- **Team Overview** - Total score, rank, and member count
- **Leaderboard** - Ranked member list with tier system (Copper to Diamond)
- **Member Profiles** - Detail pages with personal stats and project list
- **Historical Data** - Time series for team and individual statistics (hourly to yearly)
- **Achievements** - Achievement system with 300+ achievements (achievements.json)
- **Achievement Leaderboard** - Rankings by unlocked achievements
- **Monthly Leaderboard** - Top contributors of the current month
- **PPD Analysis** - Points-per-day calculation and trends
- **Heatmap** - Activity heatmap per member
- **Streaks** - Active folding streak calculation
- **Milestones** - Score milestone detection and chronology
- **Rank Prediction** - Future rank placement forecasts
- **Rivals** - Comparison with neighboring teams in ranking
- **Rank Crossings** - Detection of overtaking events between members
- **Member of the Week** - Automatic selection of most active weekly member
- **Gini Coefficient** - Distribution analysis of team contributions
- **Certificate Generator** - Personalized participation certificates (PNG)
- **Data Export** - Export as JSON or CSV
- **Forum Signature Generator** - Plain Text, BBCode, and HTML signatures
- **Social Sharing** - Statistics sharing functionality
- **Privacy Page** - DSGVO-compliant privacy policy
- **Research Impact** - Research impact dashboard by disease/cause
- **Global Context** - Team position within overall F@H rankings
- **Member Comparison** - Side-by-side 1v1 member comparison
- **Hall of Fame** - Member of the Week archive (52 weeks)
- **Team Challenges** - Community challenge system with progress tracking
- **Quest System** - Daily/weekly/monthly quest objectives with XP
- **Raffle System** - Monthly raffle with entry tracking and draw history
- **Matrix View** - Matrix-style team activity visualization
- **Easter Eggs** - Hidden interactions (Boot sequence, Terminal, BSOD, CRT effects)

### Technical

- Node.js + Express backend with SQLite (better-sqlite3, WAL mode)
- Vanilla JS frontend with Chart.js for visualizations
- DOS/Win95 retro theme throughout
- Security headers (CSP, HSTS), rate limiting, input validation
- PM2 process management
- Plesk Git Extension deployment
