# Changelog

Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung nach [SemVer](https://semver.org/lang/de/).

## [0.1.0] – 2026-06-16 (Erstaufbau)

### Hinzugefügt
- Karteikarten-PWA mit Leitner-Wiederholung (5 Boxen, 0/1/3/7/14 Tage) und
  Selbsteinschätzung *Nicht gewusst / Teils / Gewusst*.
- Vier Fächer: Baustofftechnik (noch leer), Baukonstruktion (111),
  Gebäudelehre (30), Städtebau (86). **227 Karten** mit Musterantworten.
- Screens: Start, Lernen, Prüfungsmodus, Suche/Browse mit Lesezeichen,
  Statistik (Streak, Boxenverteilung, 30-Tage-Heatmap), Einstellungen,
  Impressum/Datenschutz, Erst-Start-Hinweis.
- Prüfungs-Countdown, Backup/Restore als JSON, Tastatur-Shortcuts
  (Leertaste aufdecken, 1/2/3 einschätzen, M merken).
- PWA: Manifest mit Icon-Shortcuts (Zufallsmix/Prüfung/Suche), Service Worker
  (App-Shell cache-first, `data.js` stale-while-revalidate), Offline-Betrieb.
- Gestaltung nach dem Design-System „Quiet Precision" (Helvetica Neue LT Std,
  Weiß/Near-Black, ein gelber Akzent, eckig, ohne Schatten und Emoji).
- Härtung: Boot-Validierung (doppelte IDs, Pflichtfelder, verwaiste Karten),
  localStorage-Quota-Hinweis, Cross-Tab-Sync außerhalb laufender Sessions.

### Quelle der Inhalte
- Fragen aus den Übungsfragen-Katalogen der Lehrveranstaltungen
  (Baukonstruktion PM 10, Gebäudelehre/Wohnungsbau, Städtebau I PM 05).
  Musterantworten eigenständig formuliert, ohne Gewähr.
