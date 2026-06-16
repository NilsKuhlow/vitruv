# Vitruv

Karteikarten-Lerntool zur Prüfungsvorbereitung im Architekturstudium
(2. Semester, Hochschule Wismar). Frage lesen, Antwort denken, aufdecken,
ehrlich einschätzen. Wiederholung nach dem Leitner-Prinzip: was sitzt, kommt
seltener, was wackelt, öfter.

## Fächer

| # | Fach | Inhalt | Karten |
|---|------|--------|-------:|
| 01 | Baustofftechnik | Materialkunde und Bauphysik | noch leer |
| 02 | Baukonstruktion | Tragwerk, Konstruktion, Detail | 111 |
| 03 | Gebäudelehre | Entwurf, Typologie, Wohnungsbau | 30 |
| 04 | Städtebau | Stadtraum, Morphologie, Theorie | 86 |

## Funktionsweise

- **Karteikarte:** Vorderseite zeigt die Prüfungsfrage. Nach dem Aufdecken
  erscheint eine Musterantwort. Du bewertest selbst: *Nicht gewusst* / *Teils* /
  *Gewusst*.
- **Leitner-System:** fünf Boxen mit Intervallen 0 / 1 / 3 / 7 / 14 Tage.
  *Gewusst* schiebt eine Karte eine Box höher, *Nicht gewusst* zurück in Box 1.
- **Prüfungsmodus:** feste Kartenzahl am Stück, am Ende Selbsteinschätzung und
  Schulnote.
- **Suche & Lesezeichen**, **Statistik** mit Streak, Boxenverteilung und
  30-Tage-Aktivität, **Prüfungs-Countdown**.
- **PWA:** installierbar, funktioniert offline, Fortschritt bleibt lokal.

## Stack

Vanilla HTML/CSS/JS, kein Build, keine Abhängigkeiten. Service Worker + Web App
Manifest. Fortschritt in `localStorage`. Gestaltung nach dem Design-System
**Quiet Precision** (Nils Kuhlow). Schrift: Helvetica Neue als Systemschrift
(auf Apple-Geräten nativ), nicht gebündelt.

```
index.html        App-Shell, alle Screens
styles.css        Komponenten im Quiet-Precision-Stil
colors_and_type.css  Design-Tokens + @font-face (aus dem Design-System)
app.js            Zustand, Leitner-Logik, Navigation, Statistik
data.js           Fragendatenbank (window.PATHS + window.QUESTIONS)
sw.js             Service Worker (App-Shell-Cache, data.js stale-while-revalidate)
manifest.json     PWA-Manifest
icons/            App-Icons (PNG)
```

## Lokal starten

```
python -m http.server 7790 --directory .
```

Dann <http://localhost:7790> öffnen.

## Fragen ergänzen

Neue Karten in `data.js` im Array `window.QUESTIONS` ergänzen. Schema:

```js
{
  id: "bs001",                 // eindeutig, Präfix je Fach
  path: "baustofftechnik",     // baustofftechnik | baukonstruktion | gebaeudelehre | staedtebau
  category: "Bindemittel",     // Abschnitt
  question: "…",
  answer: "Fließtext. \n für Umbruch, '- ' für Stichpunkte, **fett**.",
  source: "Baustofftechnik · Bindemittel · Frage 1",
  sketch: false                // true, wenn eine Skizze gefragt ist
}
```

Baustofftechnik ist als Fach angelegt, aber noch ohne Fragen. Sobald der
Fragenkatalog vorliegt, einfach Karten mit `path: "baustofftechnik"` ergänzen.

## Inhalte, Schriften und Rechte

- **Fragen** stammen aus den Übungsfragen-Katalogen der Lehrveranstaltungen
  (Hochschule Wismar). Die Rechte daran liegen bei den jeweiligen Lehrenden.
  Dieses Werkzeug dient der **persönlichen Prüfungsvorbereitung**.
- **Musterantworten** sind eigenständig formuliert und **ohne Gewähr**.
  Maßgeblich sind Vorlesung, Skript und Norm.
- **Schrift:** Die App nutzt Helvetica Neue als Systemschrift (auf Apple-Geräten
  nativ vorhanden), sonst Fallback auf Helvetica/Arial/System-Sans. Die
  kommerzielle Helvetica Neue LT Std wird bewusst **nicht** mitgeliefert.

## Lizenz

Quellcode: MIT (siehe `LICENSE`). Für Inhalte und Schriften gelten die Hinweise
oben.
