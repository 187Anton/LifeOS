# Kohärenzumbau: Fortschritt und nächste Übergabe

Stand: 24.09.2026. Diese Datei ist eine Übergabe, kein Ersatz für Live-Prüfungen.
Plan: [coherence-implementation-plan.md](coherence-implementation-plan.md).

## Aktuelles Paket

- Paket: **2 – Finanzfunktionen entfernen**, Teilauftrag **2a – Weboberfläche**;
  unvollständig, weder PR noch Paketabnahme.
- Branch: `feat/coherence-finance-removal`.
- Basis: `22d5ba6b9fdd005baf973a192c7fb082deac621b` (`origin/develop`).
- Worktree: `/private/tmp/lifeos-coherence-finance-removal`.
- Delegationsbezug: `coherence-p2a-deepseek-20260924`, Hermes
  `deleg_b0a1e32e` / `sa-0-80a1e76a`; ein DeepSeek-Subagent beendete
  seinen Lauf am Limit von 40 Arbeitsschritten. Keine weitere Delegation aktiv.
- Vor Start der Codeänderung live geprüft: Worktree auf unverändertem Basisstand
  `22d5ba6`, keine eigenen Commits; ungecommittet waren die Planerweiterung des
  Koordinators (`docs/coherence-implementation-plan.md`, Teilpakete 2a/2b/2c)
  und die Vorgängerfassung dieser Datei. Beide bleiben erhalten.
- Erledigt: AGENTS.md, README, Leitfaden, Plan- und Fortschrittsdatei im
  Worktree gelesen; alle Finanzbezüge in `apps/web` erfasst; Abhängigkeiten im
  Worktree mit `npm ci` installiert (kein Eingriff in den Hauptcheckout).
- Geplanter 2a-Umfang (vor der Codeänderung): `View`-Wert `finance` und beide
  Navigationseinträge (Desktop und Mobil) entfernen, Finanzansicht
  (`FinanceWorkspace.tsx`) und `FinanceIcon` löschen, Finanzoptionen in der
  Oberfläche (Aufgabenbereich- und Filterauswahl „Finanzen“) entfernen,
  Altbestand mit `Task.area=finance` weiterhin korrekt lesbar anzeigen,
  betroffene Unit-/E2E-Tests aktualisieren und um Abwesenheitsprüfungen
  ergänzen. API-Client (`apps/web/src/api.ts`), Verträge und Datenbank bleiben
  unverändert; der Finanz-API-Client und sein Vertragstest folgen in 2b/2c.
- Erledigt in 2a: Finanznavigation/-ansicht/-icon samt UI-Fixtures entfernt;
  neue Finanzbereichsauswahl ausgeblendet, vorhandene `Task.area=finance`-Werte
  bis Paket 3 weiter lesbar und im Editor unverändert. Unit- und E2E-Tests
  angepasst; alles noch ungecommittet.
- Tatsächliche Tests: `git diff --check`, Web-Lint, Web-Typecheck, Web-Build,
  `npm run format:check`, gezielte App-Unit-Tests (20/20), vollständige
  Playwright-E2E (34/34, Desktop und Mobil) bestanden. Vollständige Web-Unit-
  Tests unter Node 26 ohne Zusatzoption: 47/50, drei Fehler in unveränderten
  Integrationstests wegen nicht verfügbarem globalem `localStorage`.
  Mit `NODE_OPTIONS=--no-experimental-webstorage` beim Web-Unit-Test bestanden
  alle 50/50. Der dokumentierte Node-22-Pfad wurde
  hierbei nicht separat geprüft.
- Offene Fehler/Abnahme: 2a-Diff abschließend prüfen und committen; API und
  aktive Verträge bleiben bis 2b/2c unverändert. Finanzschema und Altdaten
  bleiben bis Paket 3. Keine Produktionsmigration, kein PR.
- Exakter nächster Schritt: 2a-Diff/Status vollständig abnehmen, dann
  Conventional Commit im Paketbranch; anschließend 2b mit separater begrenzter
  Übergabe und frisch geprüftem Kontingent beginnen. Paket 2 ist unvollständig.

## Verifizierter Vorgängerstand

- Paket: **1 – Einstellungen und Integrationseinbettung**.
- Status der früheren Übergabe: Implementiert und als PR eröffnet; inzwischen
  ist PR #121 auf GitHub nach `develop` gemergt (Merge-Commit `22d5ba6`).
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
- CI-/Merge-Nachweis: `Repository checks` und `Local macOS release` für PR
  #121 jeweils als `pass` abgefragt; Merge-Commit ist Vorfahr der aktuellen
  Basis `origin/develop`. Auch PR #120 ist als gemergt verifiziert.

## Paketfolge

| Paket                         | Status                                            |
| ----------------------------- | ------------------------------------------------- |
| 0 Plan und Übergabe           | Integriert über PR #120                           |
| 1 Einstellungen/Integrationen | Integriert über PR #121                           |
| 2 Finanzfunktionen entfernen  | 2a implementiert, noch ungecommittet; 2b/2c offen |
| 3 Finanzdatenmigration        | Nicht begonnen                                    |
| 4 Aufgaben–Studienmodul       | Nicht begonnen                                    |
| 5 Kalender/Planung            | Nicht begonnen                                    |
| 6 Modul-Arbeitsbereich        | Nicht begonnen                                    |
| 7 PDF-Suche                   | Nicht begonnen                                    |
| 8 Office-Suche                | Nicht begonnen                                    |
| 9 Aufgaben–CalDAV             | Nicht begonnen                                    |
| 10 Mac/iPhone-Anbindung       | Nicht begonnen                                    |
| 11 Gesamtabnahme/App-Update   | Nicht begonnen                                    |

## Fortsetzen

Den Startauftrag aus Abschnitt 6 des Plans verwenden. Vor dem nächsten
Teilauftrag laufende Schreiber, aktuellen Remote-Stand und 2a-Diff prüfen.
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
