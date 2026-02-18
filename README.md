# FOF Stats - Folding@Home Team Dashboard

Statistik-Dashboard fuer das Folding@Home-Team **FreilaufendeOnlineFuzzies** (Team #240890). Die Anwendung ruft Daten von der offiziellen Folding@Home-API ab, speichert historische Snapshots in einer SQLite-Datenbank und stellt sie ueber ein interaktives Web-Frontend bereit.

## Tech-Stack

| Komponente | Technologie |
|---|---|
| **Backend** | Node.js + Express 4 |
| **Datenbank** | SQLite via better-sqlite3 (WAL-Modus) |
| **Frontend** | Vanilla HTML/CSS/JS + Chart.js 4 |
| **Prozessmanager** | PM2 (ecosystem.config.js) |
| **Tests** | Node.js built-in Test Runner (`node --test`) |

## Features

### Kern-Features

- **Team-Uebersicht** - Gesamtpunktzahl, Rang und Mitgliederanzahl des Teams
- **Leaderboard** - Rangliste aller Team-Mitglieder mit Tier-System (Copper bis Diamond)
- **Mitglieder-Profile** - Detailseiten mit persoenlicher Statistik und Projektliste
- **Historische Daten** - Zeitreihen fuer Team- und Einzelstatistiken (stuendlich bis jaehrlich)
- **Achievements** - Umfangreiches Achievement-System mit ueber 300 Erfolgen (achievements.json)
- **Achievement-Leaderboard** - Rangliste nach freigeschalteten Achievements
- **Monatliches Leaderboard** - Top-Beitraeger des aktuellen Monats
- **PPD-Analyse** - Points-per-Day-Berechnung und -Verlauf
- **Heatmap** - Aktivitaets-Heatmap pro Mitglied
- **Streaks** - Berechnung aktiver Folding-Serien
- **Meilensteine** - Erkennung und Chronologie von Score-Meilensteinen
- **Rang-Vorhersage** - Prognose zukuenftiger Plaetzierungen
- **Rivalen-Vergleich** - Vergleich mit benachbarten Teams im Ranking
- **Rank-Crossings** - Erkennung von Ueberholmanoevern zwischen Mitgliedern
- **Member of the Week** - Automatische Wahl des aktivsten Mitglieds der Woche
- **Gini-Koeffizient** - Verteilungsanalyse der Team-Beitraege
- **Zertifikat-Generator** - Personalisierte Teilnahme-Zertifikate (PNG-Download)
- **Datenexport** - Export als JSON oder CSV
- **Social-Sharing** - Teilen von Statistiken und Forum-Signatur-Generator
- **Datenschutzseite** - DSGVO-konforme Datenschutzerklaerung

### Gamification (neu in v2.0)

- **SEASON.EXE** - Saisonales XP/Level-System mit Countdown und Saison-Rangliste
- **VERSUS.EXE** - Woechentliche 1v1-Duelle mit VS-Grafik, Fortschrittsbalken und Duell-Rangliste
- **Quest-System** - Taegliche, woechentliche und monatliche Aufgaben mit XP-Belohnungen
- **Team Challenges** - Gemeinschaftliche Herausforderungen mit Fortschrittsanzeige
- **Raffle/Verlosung** - Monatliche Verlosung mit Eintragsverwaltung und Gewinner-Historie

### Aktivitaet und Visualisierung (neu in v2.0)

- **TIMELINE.EXE** - DOS-Terminal-Ansicht als chronologischer Event-Log
- **Activity Feed (EVENTLOG.EXE)** - Live-Event-Stream mit Meilensteinen, Achievements und Rang-Aenderungen
- **WEATHER.EXE** - Team-Aktivitaets-Wetterbericht mit Vorhersage-Visualisierung
- **CONSTELLATION.EXE** - Netzwerk-Visualisierung der Team-Mitglieder-Beziehungen
- **POWERRANK.EXE** - Power Rankings mit Composite Scores und Radar-Chart
- **Matrix-Ansicht** - Matrix-Darstellung der Team-Aktivitaet

### Erweiterte Analyse (neu in v2.0)

- **ZEITGEIST.EXE** - Perioden-Rueckblick (Woche/Monat/Jahr) mit Highlights und Rekorden
- **PREDICT.EXE (Fun-Facts)** - Fun-Facts-Ticker mit interessanten Statistiken und Prognosen
- **Donor Predictions** - Persoenliche Score-/Rang-Prognosen und Meilenstein-ETAs
- **DIARY.EXE** - Wochen-/Monats-Recap auf Donor-Profilseiten

### Community (neu in v2.0)

- **Hall of Fame** - Member-of-the-Week-Archiv (letzte 52 Wochen)
- **Member Comparison** - Side-by-Side 1v1-Vergleich zweier Mitglieder
- **Research Impact** - Forschungs-Impact-Dashboard nach Krankheit/Ursache
- **Global Context** - Einordnung des Teams im globalen F@H-Ranking

### Sonstiges

- **Easter Eggs** - Versteckte Interaktionen (Boot-Sequenz, Terminal, BSOD, CRT-Effekte)

## Voraussetzungen

- Node.js 18 oder hoeher
- npm

## Installation und Start

```bash
# Repository klonen
git clone https://github.com/DEIN-USER/fah-stats.git
cd fah-stats

# Abhaengigkeiten installieren
npm install

# Server starten (Port 3000)
node server.js

# Alternativ: Entwicklungsmodus mit Auto-Reload
npm run dev
```

Die Anwendung ist dann unter `http://localhost:3000` erreichbar.

Der Port kann ueber die Umgebungsvariable `PORT` angepasst werden:

```bash
PORT=8080 node server.js
```

## Tests ausfuehren

```bash
npm test
```

Die Tests nutzen den integrierten Node.js Test Runner und befinden sich im Ordner `test/`.

## API-Endpunkte

### Team und Mitglieder

| Endpunkt | Beschreibung |
|---|---|
| `GET /api/team` | Team-Gesamtstatistik (Score, Rang, Mitglieder) |
| `GET /api/members` | Liste aller Team-Mitglieder |
| `GET /api/member/:name/stats` | Statistik eines einzelnen Mitglieds |
| `GET /api/member/:name/projects` | Projekte eines Mitglieds |
| `GET /api/leaderboard` | Team-internes Leaderboard |
| `GET /api/leaderboard/monthly` | Monats-Leaderboard |

### Historische Daten

| Endpunkt | Beschreibung |
|---|---|
| `GET /api/history/team` | Team-Verlauf (Query: `period`, `limit`) |
| `GET /api/history/member/:name` | Mitglieder-Verlauf |
| `GET /api/history/movers` | Groesste Aufsteiger/Absteiger |
| `GET /api/history/summary` | Zusammenfassung der Verlaufsdaten |

### Analyse und Features

| Endpunkt | Beschreibung |
|---|---|
| `GET /api/milestones` | Erkannte Score-Meilensteine |
| `GET /api/milestones/chronology` | Meilenstein-Chronologie |
| `GET /api/prediction/rank` | Rang-Vorhersage |
| `GET /api/heatmap/:name` | Aktivitaets-Heatmap eines Mitglieds |
| `GET /api/streak` | Aktive Folding-Serien |
| `GET /api/motw` | Member of the Week |
| `GET /api/goals` | Team-Ziele und Fortschritt |
| `GET /api/ppd` | Points-per-Day-Statistiken |
| `GET /api/rivals` | Rivalen-Teams im Ranking |
| `GET /api/crossings` | Rank-Crossings zwischen Mitgliedern |

### Achievements und Donor-Profile

| Endpunkt | Beschreibung |
|---|---|
| `GET /api/achievements` | Verfuegbare Achievements |
| `GET /api/achievements/leaderboard` | Achievement-Rangliste |
| `GET /api/donor/:name/summary` | Donor-Profil-Zusammenfassung |
| `GET /api/donor/:name/achievements` | Achievements eines Donors |
| `GET /api/donor/:name/predictions` | Persoenliche Score-/Rang-Prognosen und Meilenstein-ETAs |
| `GET /api/donor/:name/recap` | Wochen-/Monats-Recap fuer einen Donor |

### Gamification

| Endpunkt | Beschreibung |
|---|---|
| `GET /api/season/current` | Aktuelle Saison-Info (Name, Zeitraum, Countdown) |
| `GET /api/season/leaderboard` | Saison-Rangliste mit XP und Levels |
| `GET /api/versus/current` | Aktuelle Wochenduell-Paarungen |
| `GET /api/versus/rankings` | Duell-Rangliste (Siege, Niederlagen, Winrate) |
| `GET /api/challenges` | Aktive Team-Challenges mit Fortschritt |
| `GET /api/quests` | Quest-Definitionen (taeglich/woechentlich/monatlich) |
| `GET /api/quests/:donorName` | Quest-Fortschritt eines Donors |
| `GET /api/quests/leaderboard/xp` | XP-Rangliste aus Quest-System |
| `GET /api/raffle` | Aktuelle Monatsverlosung mit Eintraegen und Historie |
| `POST /api/raffle/draw` | Verlosung durchfuehren (einziger POST-Endpunkt) |

### Aktivitaet und Visualisierung

| Endpunkt | Beschreibung |
|---|---|
| `GET /api/activity-feed` | Activity Feed mit Events (Meilensteine, Achievements, Rang-Aenderungen) |
| `GET /api/timeline` | Chronologischer Event-Log (Meilensteine, Rang-Aenderungen) |
| `GET /api/weather` | Team-Aktivitaets-Wetterbericht mit Forecast |
| `GET /api/constellation` | Team-Netzwerk-Visualisierung mit Nodes, Edges, Clusters |
| `GET /api/power-rankings` | Power Rankings mit Composite Scores und Radar-Chart-Daten |
| `GET /api/matrix` | Matrix-Ansicht der Team-Aktivitaet |

### Erweiterte Analyse

| Endpunkt | Beschreibung |
|---|---|
| `GET /api/zeitgeist/:period` | Perioden-Rueckblick (week/month/year) mit Highlights und Records |
| `GET /api/funfacts` | Fun-Facts und Prognosen aus History-Daten |
| `GET /api/research` | Forschungs-Impact nach Krankheit/Ursache |
| `GET /api/global-stats` | Globaler F@H-Kontext mit Team-Position |
| `GET /api/compare/:name1/:name2` | Side-by-Side Mitglieder-Vergleich |
| `GET /api/halloffame` | Member-of-the-Week-Archiv (letzte 52 Wochen) |

### Export

| Endpunkt | Beschreibung |
|---|---|
| `GET /api/export/:format` | Datenexport (json, csv) |

## Projektstruktur

```
fah-stats/
├── server.js                  # Express-Server, API-Routen, Caching, Snapshots (49 Endpunkte)
├── lib.js                     # Geteilte Hilfsfunktionen (parseMembers, getTier, etc.)
├── achievements.json          # Achievement-Definitionen (300+ Achievements)
├── package.json               # Abhaengigkeiten und Scripts
├── ecosystem.config.js        # PM2-Konfiguration
├── DEPLOYMENT.md              # Deployment-Anleitung (Linux VPS + Plesk)
├── CLAUDE.md                  # Projekt-Kontext fuer AI-Assistenten
├── CHANGELOG.md               # Versionshistorie
├── .gitignore
├── public/                    # Statische Frontend-Dateien
│   ├── index.html             # Hauptseite / Dashboard (Tab-System)
│   ├── donors.html            # Mitglieder-Uebersicht
│   ├── donor.html             # Einzelnes Mitglieder-Profil
│   ├── datenschutz.html       # Datenschutzerklaerung
│   ├── manifest.json          # Web App Manifest
│   ├── css/
│   │   ├── style.css          # Haupt-Stylesheet (DOS/Win95-Theme)
│   │   └── donor.css          # Donor-Seiten-Styles
│   ├── js/
│   │   ├── app.js             # Haupt-Anwendungslogik und Tab-Steuerung
│   │   ├── charts.js          # Chart.js-Diagramme und Canvas-Management
│   │   ├── utils.js           # Frontend-Hilfsfunktionen (escapeHtml, formatScore, etc.)
│   │   ├── nav-toggle.js      # Navigation (mobil)
│   │   ├── donor-page.js      # Donor-Profilseiten-Logik
│   │   ├── donors-page.js     # Mitglieder-Uebersicht-Logik
│   │   ├── easter-eggs.js     # Easter Eggs (Boot, Terminal, BSOD, CRT)
│   │   ├── feature-ach-board.js       # Achievement-Leaderboard
│   │   ├── feature-activity-feed.js   # Activity Feed / EVENTLOG.EXE
│   │   ├── feature-certificate.js     # Zertifikat-Generator
│   │   ├── feature-challenges.js      # Team Challenges
│   │   ├── feature-compare.js         # Member Comparison (1v1)
│   │   ├── feature-constellation.js   # CONSTELLATION.EXE - Netzwerk-Visualisierung
│   │   ├── feature-diary.js           # DIARY.EXE - Wochen-/Monats-Recap
│   │   ├── feature-export.js          # Datenexport und Signatur-Generator
│   │   ├── feature-extras.js          # Extras-Tab Verwaltung
│   │   ├── feature-funfacts.js        # PREDICT.EXE - Fun-Facts-Ticker
│   │   ├── feature-global.js          # Global Context (F@H-Einordnung)
│   │   ├── feature-halloffame.js      # Hall of Fame (MOTW-Archiv)
│   │   ├── feature-heatmap.js         # Aktivitaets-Heatmap
│   │   ├── feature-milestone.js       # Meilensteine
│   │   ├── feature-monthly.js         # Monatliches Leaderboard
│   │   ├── feature-power-rankings.js  # POWERRANK.EXE - Power Rankings
│   │   ├── feature-ppd.js             # PPD-Analyse
│   │   ├── feature-predictions.js     # Donor Predictions
│   │   ├── feature-profile.js         # Donor-Profil-Features
│   │   ├── feature-research.js        # Research Impact Dashboard
│   │   ├── feature-rivals.js          # Rivalen und Rank-Crossings
│   │   ├── feature-season.js          # SEASON.EXE - Saison-System
│   │   ├── feature-social.js          # Social-Sharing
│   │   ├── feature-timeline.js        # TIMELINE.EXE - Event-Log
│   │   ├── feature-versus.js          # VERSUS.EXE - 1v1 Wochenduell
│   │   ├── feature-weather.js         # WEATHER.EXE - Aktivitaets-Wetterbericht
│   │   └── feature-zeitgeist.js       # ZEITGEIST.EXE - Perioden-Rueckblick
│   └── img/                   # Bilder und Icons
└── test/
    ├── api.test.js            # API-Integrationstests
    └── lib.test.js            # Unit-Tests fuer lib.js
```

## Datenbank-Schema

Die SQLite-Datenbank (`fah-stats.db`, WAL-Modus) enthaelt 16 Tabellen, die beim Serverstart automatisch erstellt werden:

### Snapshots

| Tabelle | Beschreibung |
|---|---|
| `team_snapshots` | Stuendliche Team-Statistik-Snapshots (Score, Rang, WUs, Mitgliederzahl) |
| `member_snapshots` | Stuendliche Mitglieder-Snapshots (Score, WUs, Rang pro Mitglied) |

### Achievements und Events

| Tabelle | Beschreibung |
|---|---|
| `donor_achievements` | Freigeschaltete Achievements pro Donor mit Zeitstempel |
| `milestone_events` | Erkannte Score-Meilensteine (1M, 10M, 100M, etc.) |
| `motw_history` | Member-of-the-Week-Archiv mit Wochen-Statistik |

### Challenges und Quests

| Tabelle | Beschreibung |
|---|---|
| `challenges` | Team-Challenge-Definitionen (Typ, Ziel, Zeitraum) |
| `challenge_progress` | Fortschritt pro Challenge und Donor |
| `quest_definitions` | Quest-Definitionen (taeglich/woechentlich/monatlich) |
| `quest_progress` | Quest-Fortschritt pro Donor und Periode |
| `donor_xp` | Donor-XP und Level aus dem Quest-System |

### Raffle (Verlosung)

| Tabelle | Beschreibung |
|---|---|
| `raffle_entries` | Monatsverlosungs-Eintraege mit Donor und Losnummer |
| `raffle_winners` | Verlosungs-Gewinner-Historie |

### Seasons (Saison-System)

| Tabelle | Beschreibung |
|---|---|
| `seasons` | Saison-Definitionen (Name, Start-/Enddatum) |
| `season_xp` | Saison-XP pro Donor mit Level-Berechnung |

### Versus (Duell-System)

| Tabelle | Beschreibung |
|---|---|
| `versus_duels` | Wochenduell-Paarungen (Spieler A vs B, Scores, Gewinner) |
| `versus_history` | Kumulative Duell-Statistiken pro Donor (Siege, Niederlagen, Winrate) |

## Sicherheit

Die Anwendung implementiert mehrere Sicherheitsmassnahmen:

- Security-Header (CSP, HSTS, X-Frame-Options, etc.)
- Rate Limiting (100 Req/Min allgemein, 10 Req/Min fuer aufwaendige Endpunkte)
- Eingabevalidierung und Schutz vor Path Traversal
- Begrenzung von Cache- und Rate-Limit-Map-Groessen
- IPv6-Normalisierung zur Verhinderung von Rate-Limit-Umgehung

## Deployment

Fuer detaillierte Deployment-Anleitungen (Linux VPS mit PM2/Nginx oder Plesk VPS) siehe [DEPLOYMENT.md](DEPLOYMENT.md).

## Lizenz

Siehe Repository fuer Lizenzinformationen.
