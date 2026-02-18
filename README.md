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

- **Team-Uebersicht** - Gesamtpunktzahl, Rang und Mitgliederanzahl des Teams
- **Leaderboard** - Rangliste aller Team-Mitglieder mit Tier-System (Copper bis Diamond)
- **Mitglieder-Profile** - Detailseiten mit persoenlicher Statistik und Projektliste
- **Historische Daten** - Zeitreihen fuer Team- und Einzelstatistiken (stuendlich bis jaehrlich)
- **Achievements** - Umfangreiches Achievement-System mit ueber 100 Erfolgen (achievements.json)
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
- **Zertifikat-Generator** - Personalisierte Teilnahme-Zertifikate
- **Datenexport** - Export als JSON oder CSV
- **Social-Sharing** - Teilen von Statistiken
- **Datenschutzseite** - DSGVO-konforme Datenschutzerklaerung

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

### Export

| Endpunkt | Beschreibung |
|---|---|
| `GET /api/export/:format` | Datenexport (json, csv) |

## Projektstruktur

```
fah-stats/
├── server.js                # Express-Server, API-Routen, Caching, Snapshots
├── lib.js                   # Geteilte Hilfsfunktionen (parseMembers, getTier, etc.)
├── achievements.json        # Achievement-Definitionen
├── package.json             # Abhaengigkeiten und Scripts
├── ecosystem.config.js      # PM2-Konfiguration
├── DEPLOYMENT.md            # Deployment-Anleitung (Linux VPS + Plesk)
├── .gitignore
├── public/                  # Statische Frontend-Dateien
│   ├── index.html           # Hauptseite / Dashboard
│   ├── donors.html          # Mitglieder-Uebersicht
│   ├── donor.html           # Einzelnes Mitglieder-Profil
│   ├── datenschutz.html     # Datenschutzerklaerung
│   ├── css/
│   │   ├── style.css        # Haupt-Stylesheet
│   │   └── donor.css        # Donor-Seiten-Styles
│   ├── js/
│   │   ├── app.js           # Haupt-Anwendungslogik
│   │   ├── charts.js        # Chart.js-Diagramme
│   │   ├── utils.js         # Frontend-Hilfsfunktionen
│   │   ├── nav-toggle.js    # Navigation (mobil)
│   │   ├── donor-page.js    # Donor-Profilseiten-Logik
│   │   ├── donors-page.js   # Mitglieder-Uebersicht-Logik
│   │   ├── feature-*.js     # Feature-Module (Heatmap, PPD, Rivalen, etc.)
│   │   └── ...
│   └── img/                 # Bilder und Icons
└── test/
    ├── api.test.js          # API-Integrationstests
    └── lib.test.js          # Unit-Tests fuer lib.js
```

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
