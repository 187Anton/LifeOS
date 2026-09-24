# Kohärenzumbau: Fortschritt und nächste Übergabe

Stand: 24.09.2026. Diese Datei ist eine Übergabe, kein Ersatz für Live-Prüfungen.
Plan: [coherence-implementation-plan.md](coherence-implementation-plan.md).

## Aktuelles Paket

- Paket: **1 – Einstellungen und Integrationseinbettung**.
- Status: Implementiert, lokal geprüft und als PR eröffnet; Pflicht-CI und
  Integration sind vor Abschluss live zu prüfen.
- Basis: `origin/develop` bei `4b57b78`; Paket 0 wurde über
  [PR #120](https://github.com/187Anton/LifeOS/pull/120) nach erfolgreichen
  Pflichtchecks am 24.09.2026 per Squash integriert.
- Branch: `feat/coherence-settings-integrations`.
- Worktree: `/private/tmp/lifeos-coherence-settings-integrations`.
- Inhaltlicher Commit: `f996bbb` (`feat(settings): embed integrations in settings`).
  PR:
  [#121](https://github.com/187Anton/LifeOS/pull/121) nach `develop`.
- Produktänderungen: Der eigenständige Hauptnavigationspunkt Integrationen ist
  entfallen. Die vorhandenen CalDAV- und GitHub-Verbindungen liegen unter
  Einstellungen → Integrationen; Sicherheits- und Bestätigungsgrenzen bleiben
  unverändert. Der Fokus wechselt nach einer Navigation in den Inhaltsbereich.
  Aufgaben, Termine und Studium bleiben direkt erreichbar und ihre drei
  schnellen Neuanlagen sind geprüft.
- Installierte App/persönliche Daten: unverändert.
- Lokale Nachweise: Formatprüfung, Diff-Prüfung, Secret-Scan, Repository-Tests
  (19/19), vollständiger Lint- und Typecheck-Lauf, vollständiger Build,
  Web-Unit-Tests (50/50) und alle 34 Desktop-/Mobile-Playwright-Abläufe
  bestanden. Der Leitfaden wurde vollständig gerendert und auf allen 25 Seiten
  visuell geprüft.
- CI-/Merge-Nachweis: Für Paket 1 noch offen; lokale Prüfungen ersetzen weder
  `Repository checks` noch `Local macOS release`.
- Nächster Schritt: Für PR #121 die Pflichtchecks abwarten, bei erfolgreichem
  Abschluss regelkonform squash-mergen und den Merge sowie `origin/develop`
  live verifizieren. Paket 2 nicht starten.

## Paketfolge

| Paket                         | Status                                      |
| ----------------------------- | ------------------------------------------- |
| 0 Plan und Übergabe           | Integriert über PR #120                     |
| 1 Einstellungen/Integrationen | PR #121 offen; Pflicht-CI/Integration offen |
| 2 Finanzfunktionen entfernen  | Nicht begonnen                              |
| 3 Finanzdatenmigration        | Nicht begonnen                              |
| 4 Aufgaben–Studienmodul       | Nicht begonnen                              |
| 5 Kalender/Planung            | Nicht begonnen                              |
| 6 Modul-Arbeitsbereich        | Nicht begonnen                              |
| 7 PDF-Suche                   | Nicht begonnen                              |
| 8 Office-Suche                | Nicht begonnen                              |
| 9 Aufgaben–CalDAV             | Nicht begonnen                              |
| 10 Mac/iPhone-Anbindung       | Nicht begonnen                              |
| 11 Gesamtabnahme/App-Update   | Nicht begonnen                              |

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
