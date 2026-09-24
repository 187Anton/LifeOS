# Kohärenzumbau: Fortschritt und nächste Übergabe

Stand: 23.09.2026. Diese Datei ist eine Übergabe, kein Ersatz für Live-Prüfungen.
Plan: [coherence-implementation-plan.md](coherence-implementation-plan.md).

## Aktuelles Paket

- Paket: **0 – verbindlicher Plan und Übergabe**.
- Status: Dokumentation erstellt und lokal geprüft; Integration noch live prüfen.
- Basis: `origin/develop` bei `1b3401b`.
- Branch: `docs/coherence-implementation-plan`.
- Worktree: `/private/tmp/lifeos-coherence-plan`.
- Commit/PR: Über Branch `docs/coherence-implementation-plan` live ermitteln;
  diese Notiz wird zusammen mit dem Dokumentationscommit veröffentlicht.
- Produktänderungen: keine; Pakete 1–11 sind nicht begonnen.
- Installierte App/persönliche Daten: unverändert.
- Lokale Nachweise: Prettier für alle vier geänderten Markdown-Dateien,
  `git diff --check` und `npm run test:repo` (19/19 bestanden).
- CI-/Merge-Nachweis: nicht durch die lokalen Prüfungen ersetzt; vor Paket 1
  beide Pflichtchecks und den tatsächlichen Merge des Paket-0-PRs prüfen.
- Nächster Schritt: Paket-0-PR/CI/Integration prüfen beziehungsweise abschließen;
  danach ist Paket 1 der nächste fachliche Auftrag.

## Paketfolge

| Paket                         | Status                                               |
| ----------------------------- | ---------------------------------------------------- |
| 0 Plan und Übergabe           | Lokal geprüft; PR/Integration live prüfen            |
| 1 Einstellungen/Integrationen | Wartet auf Integration von Paket 0 und neuen Auftrag |
| 2 Finanzfunktionen entfernen  | Nicht begonnen                                       |
| 3 Finanzdatenmigration        | Nicht begonnen                                       |
| 4 Aufgaben–Studienmodul       | Nicht begonnen                                       |
| 5 Kalender/Planung            | Nicht begonnen                                       |
| 6 Modul-Arbeitsbereich        | Nicht begonnen                                       |
| 7 PDF-Suche                   | Nicht begonnen                                       |
| 8 Office-Suche                | Nicht begonnen                                       |
| 9 Aufgaben–CalDAV             | Nicht begonnen                                       |
| 10 Mac/iPhone-Anbindung       | Nicht begonnen                                       |
| 11 Gesamtabnahme/App-Update   | Nicht begonnen                                       |

## Fortsetzen

Den Startauftrag aus Abschnitt 6 des Plans verwenden. Falls der Vorgänger-PR
noch offen ist, diesen zuerst prüfen; Paket 1 nicht parallel anfangen.
Der Hauptcheckout kann auf einem anderen Branch stehen. Die Plandateien aus
dem aktuellen Remote-Stand lesen, keinen lokalen Branch ungeprüft umschalten.

Vor dem Merge speichert ein Paket seine lokalen Nachweise und PR-Adresse hier.
Ein eigener Merge-Commit kann nicht in derselben Revision dokumentiert werden:
deshalb verifiziert der nächste Auftrag Merge und Checks live und trägt den
bestätigten Vorgängerstatus in seinem eigenen Dokumentationsupdate nach.
Kein zusätzlicher reiner Status-PR und keine endlose Commit-/CI-Schleife nötig.

## Mindestangaben bei jeder Übergabe

- Paket/Teilpaket, Datum, Branch, Worktree und Ausgangscommit.
- Letzter inhaltlicher Commit und PR-Link; ungecommitete Dateien ausdrücklich.
- Änderungen und noch fehlende Abnahmekriterien.
- Tatsächlich ausgeführte Prüfungen mit Ergebnis; CI separat und live prüfen.
- Konkreter nächster Schritt und offene Geräte-/Nutzeraktionen.
- Bei Pause: Grund und sichere Wiederaufnahme; keine Secrets oder Nutzerdaten.
