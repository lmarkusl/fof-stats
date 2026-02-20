# FOF Stats - Folding@Home Team Dashboard

**Das Statistik-Dashboard fuer die [FreilaufendeOnlineFuzzies](https://freilaufendeonlinefuzzies.de) (Team #240890) - eines der Top-20 Folding@Home Teams weltweit.**

> [fof-stats.de](https://fof-stats.de) | [Team auf Folding@Home](https://stats.foldingathome.org/team/240890) | [Community](https://freilaufendeonlinefuzzies.de)

---

## Ueber das Projekt

Die FreilaufendeOnlineFuzzies sind eine deutschsprachige Community, die seit Februar 2020 ihre Rechenleistung fuer die medizinische Forschung spendet. Was als Antwort auf COVID-19 begann, ist heute ein Team von 69 Mitgliedern, das mit ueber **369 Milliarden Punkten** und **470.000+ abgeschlossenen Arbeitspaketen** auf **Rang 19 von 230.000+ Teams** weltweit steht.

**FOF Stats** macht die Leistung des Teams sichtbar: Ein interaktives Dashboard im Retro-DOS-Look, das Daten von der offiziellen Folding@Home-API abruft, stuendlich Snapshots speichert und mit Gamification, Analysen und Visualisierungen aufbereitet.

---

## Features

### Team-Statistiken und Ranglisten

- **Team-Uebersicht** mit Gesamtpunktzahl, globalem Rang und Mitgliederzahl
- **Leaderboard** mit Tier-System (Copper bis Diamond)
- **Monatliches Leaderboard** fuer die Top-Beitraeger des Monats
- **Member of the Week** - automatische Wahl des aktivsten Mitglieds
- **Hall of Fame** - Archiv der letzten 52 Wochen-Champions
- **Rivalen-Vergleich** mit benachbarten Teams im globalen Ranking

### Analyse und Vorhersagen

- **PPD-Analyse** (Points per Day) mit Verlaufsdaten
- **Aktivitaets-Heatmap** pro Mitglied nach Wochentag/Uhrzeit
- **Meilenstein-Chronologie** und Score-Prognosen
- **Rang-Vorhersagen** fuer Team und einzelne Mitglieder
- **Zeitgeist** - Wochen-, Monats- und Jahres-Rueckblicke mit Highlights
- **Lorenz-Kurve und Gini-Koeffizient** fuer Verteilungsanalysen
- **Globaler Kontext** - Einordnung im weltweiten F@H-Ranking

### Gamification

- **SEASON.EXE** - Saisonales XP- und Level-System
- **VERSUS.EXE** - Woechentliche 1v1-Duelle mit VS-Grafik und Duell-Rangliste
- **CHALLENGE.EXE** - Gemeinschaftliche Team-Herausforderungen
- **TROPHY.EXE** - Ueber 300 freischaltbare Achievements
- **Quest-System** - Taegliche, woechentliche und monatliche Aufgaben

### Visualisierungen

- **CONSTELLATION.EXE** - Netzwerk-Visualisierung der Team-Mitglieder
- **WEATHER.EXE** - Team-Aktivitaet als Wetterbericht mit Vorhersage
- **EVENTLOG.EXE** - Live-Activity-Feed mit Meilensteinen und Rang-Aenderungen
- **TIMELINE.LOG** - Chronologischer Event-Log im Terminal-Stil

### Mitglieder-Profile

- Detailseiten mit persoenlicher Statistik und Projektliste
- **DIARY.EXE** - Wochen- und Monats-Recaps
- Score- und Rang-Prognosen mit Meilenstein-ETAs
- Persoenliche Achievement-Uebersicht

### Tools und Export

- **Zertifikat-Generator** fuer personalisierte Teilnahme-Zertifikate (PNG)
- **Score-Card** Export als Bild
- **Forum-Signatur-Generator** fuer Hardwareluxx & Co.
- **Datenexport** als JSON oder CSV
- **Member Comparison** fuer Side-by-Side 1v1-Vergleiche

### Easter Eggs

Boot-Sequenz, Terminal-Emulator, BSOD, CRT-Effekte und mehr - wer sucht, der findet.

---

## Das DOS-Theme

Das gesamte Dashboard ist im Stil eines DOS/Windows-95-Terminals gestaltet:

- Monospace-Fonts und gruene Akzentfarben auf dunklem Hintergrund
- 3D-Button-Effekte mit `outset`/`inset` Borders
- Features heissen `*.EXE`, `*.BAT`, `*.COM` oder `*.DAT`
- Kommandozeilen-Prompt `C:\FOF>` als Designelement
- Komplett deutschsprachige Oberflaeche

---

## Technik

| Komponente | Technologie |
|---|---|
| Backend | Node.js + Express 4 |
| Datenbank | SQLite via better-sqlite3 (WAL-Modus) |
| Frontend | Vanilla HTML/CSS/JS (kein Framework, kein Build-Step) |
| Charts | Chart.js 4 (CDN mit SRI) |
| Prozessmanager | PM2 |
| Tests | Node.js built-in Test Runner |
| Hosting | Plesk VPS mit Git-Extension |
| CI/CD | GitHub Actions + Claude Code |

**49 API-Endpunkte** | **16 SQLite-Tabellen** | **300+ Achievements** | **Stuendliche Snapshots**

---

## Automatische Feature-Implementierung

Dieses Repo nutzt eine GitHub Actions Pipeline mit [Claude Code](https://claude.com/claude-code), die es auch Nicht-Entwicklern ermoeglicht, Features anzufordern:

1. **Issue erstellen** ueber das [Feature-Formular](../../issues/new?template=feature_request.yml)
2. **Repo-Owner prueft** das Issue und setzt das Label `claude`
3. **Claude Code implementiert** das Feature automatisch (Opus 4.6)
4. **Pull Request wird erstellt** - Owner reviewed und merged

Die Pipeline ist abgesichert mit Expression-Injection-Schutz, Maintainer-Verifizierung, gepinnten Actions und eingeschraenkten Tool-Berechtigungen.

---

## Mitmachen

### Als Falter

1. [Folding@Home](https://foldingathome.org) herunterladen
2. Team-Nummer **240890** eingeben
3. Falten - egal ob wenig oder viel, jeder Beitrag zaehlt

Die Community tauscht sich im [Hardwareluxx-Forum](https://www.hardwareluxx.de/community/forums/folding-home-und-distributed-computing.339/) aus.

### Als Entwickler

```bash
git clone https://github.com/lmarkusl/fof-stats.git
cd fof-stats
npm install
node server.js
# Dashboard unter http://localhost:3000
```

Oder einfach ein [Feature-Issue](../../issues/new?template=feature_request.yml) erstellen - Claude uebernimmt den Rest.

---

## Lizenz

Siehe Repository fuer Lizenzinformationen.
