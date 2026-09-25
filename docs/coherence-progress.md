# Kohärenzumbau: Fortschritt und nächste Übergabe

Stand: 24.09.2026. Diese Datei ist eine Übergabe, kein Ersatz für Live-Prüfungen.
Plan: [coherence-implementation-plan.md](coherence-implementation-plan.md).

## Aktuelles Paket

- Paket: **2 – Finanzfunktionen entfernen**, Teilauftrag **2c/1 – aktive
  Finanzverträge und Web-Client bereinigen**; in Arbeit, weder PR noch
  Paketabnahme. 2a, 2b/1 und 2b/2 sind committet, 2c/1 ist lokal umgesetzt,
  geprüft und als `0788ef8` committet; Produktdokumentation und Paketabnahme
  sowie Paket 3 bleiben offen.
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
  angepasst; Commit `59dce65` (`refactor(web): remove finance surface`).
- Tatsächliche Tests: `git diff --check`, Web-Lint, Web-Typecheck, Web-Build,
  `npm run format:check`, gezielte App-Unit-Tests (20/20), vollständige
  Playwright-E2E (34/34, Desktop und Mobil) bestanden. Vollständige Web-Unit-
  Tests unter Node 26 ohne Zusatzoption: 47/50, drei Fehler in unveränderten
  Integrationstests wegen nicht verfügbarem globalem `localStorage`.
  Mit `NODE_OPTIONS=--no-experimental-webstorage` beim Web-Unit-Test bestanden
  alle 50/50. Der dokumentierte Node-22-Pfad wurde
  hierbei nicht separat geprüft.
- Offene Fehler/Abnahme: 2a-Diff und Tests durch Koordinator geprüft;
  API und aktive Verträge bleiben bis 2b/2c unverändert. Finanzschema und
  Altdaten bleiben bis Paket 3. Keine Produktionsmigration, kein PR.
- Wiederaufnahme: Nutzer hebt die Wochenkontingent-Schranke ausdrücklich auf.
  Das neue Fünfstundenfenster zeigt 100 % Rest; unter 15 % wird nur an sicherer
  Stelle angehalten. Keine Delegation oder anderer Schreiber aktiv;
  `origin/develop` bleibt `22d5ba6`, Worktree vor Übergabe sauber bei
  `4122ea5`, keine offene Paket-PR. Kein automatischer Kontingent-Reset.
- Geplanter begrenzter Schritt 2b/1: Finanzrouter aus `server.ts` entfernen,
  ausschließlich finanzbezogenen Backend-Modulcode entfernen, API-Tests auf
  stillgelegte Route und unveränderte übrige Routen umstellen; Vertrag und
  Frontend-Client folgen in 2c. Altdaten, TaskArea und Migrationen unberührt.
- Delegationsbezug: `coherence-p2b1-deepseek-20260925`; exakte Hermes-ID
  `deleg_6b20810f` / `sa-0-d698ac71`; 40 Arbeitsschritte ausgeschöpft,
  danach keine aktive Delegation. Übergabe auch separat in
  `/Users/anton/.hermes/coherence-handoff/paket-2.txt` gespeichert.
- Vorprüfung 2b/1 (vor der ersten Codeänderung, Stand 25.09.2026): Worktree
  `/private/tmp/lifeos-coherence-finance-removal` auf Branch
  `feat/coherence-finance-removal`, HEAD `4122ea5`, ungecommittet nur die
  Koordinatoränderung an dieser Datei; Basis `22d5ba6` unverändert. Einzige
  Verbraucher von `apps/api/src/modules/finance/*` sind `src/server.ts` und
  `apps/api/tests/finance.integration.test.ts`.
- Bekannte Abhängigkeit außerhalb des 2b/1-Umfangs: `scripts/verify-mac-desktop-sidecar.mjs`
  (Zeilen 364–394, 539–540, 561, 581–582, 639–654, 693–694) legt über
  `/api/v1/finance/*` synthetische Daten an und liest sie nach dem Neustart
  erneut; dieser Pfad wird von `scripts/verify-mac-dmg.sh` und damit vom
  CI-Pflichtcheck `Local macOS release` ausgeführt. Ohne Bereinigung dieses
  Skripts kann dieser Check nach 2b/1 nicht mehr grün sein. Das Skript wurde in
  2b/1 nicht verändert (Auftragsumfang) und bleibt als erster Schritt für
  2b/2/2c dokumentiert.
- Zwischenstand 2b/1 (Codeänderung durchgeführt, Stand 25.09.2026): Import,
  Service-Instanz und Routerregistrierung des Finanzmoduls aus
  `apps/api/src/server.ts` entfernt; `apps/api/src/modules/finance/` (repository,
  router, service) gelöscht; `apps/api/tests/finance.integration.test.ts`
  entfernt und durch `apps/api/tests/finance-decommissioned.test.ts` (zwei
  Datenbank-freie Prüfungen: statische Serververdrahtung ohne Finanzbezug und
  Laufzeit-`404 NOT_FOUND` für alle alten Finanzpfade) ersetzt;
  `docs/api/finance.md` um den Stilllegungshinweis ergänzt. Bereits bestanden:
  neue Prüfdatei (2/2, Node 22.21.1), ESLint `apps/api`, Typecheck `@lifeos/api`,
  Build `@lifeos/api`, Prettier-Prüfung der geänderten Dateien; im gebauten
  `apps/api/dist/server.js` existiert kein `/finance`-Routenpfad mehr (Treffer
  nur aus Prisma-DMMF und `TaskArea`-Enum, beides bleibt bis Paket 3).
  Der Koordinator baute `better-sqlite3` im isolierten Worktree für Node
  22.21.1 neu (vorher ABI-Konflikt mit Node 26) und führte anschließend
  `npm run test:sqlite:api` aus: 100/100 Tests bestanden, ausschließlich
  temporäre synthetische SQLite-Datei. `npm run format:check` bestand.
  2b/1 ist als `4ec7c46` (`refactor(api): retire finance routes`) committet.
  Folgearbeiten 2b/2 und 2c sind offen.
- Gesperrt/nicht ausgeführt: PostgreSQL-Integrationstests gegen die laufende
  lokale Entwicklungsdatenbank (`lifeos-db-1`, seit 2 Wochen aktiv), um keine
  Finanzaltdaten oder fremden Bestand anzufassen; die Pflicht-CI führt sie in
  ihrer eigenen Wegwerfdatenbank aus.
- Geplanter Schritt 2b/2: ausschließlich
  `scripts/verify-mac-desktop-sidecar.mjs` und diese Fortschrittsdatei
  bearbeiten. Im Sidecar-Nachweis aktive Finanz-API-Aktionen durch negative
  404-Prüfung ersetzen; bestehende fachfremde Persistenz-/Neustartprüfungen
  erhalten. Historische SQLite-Finanzmigration und Datenbankmodell noch nicht
  entfernen (Paket 3). Vorherigen echten Testausgang nicht behaupten.
- Vorprüfung 2b/2 (Stand 25.09.2026, vor der Codeänderung): tatsächliches cwd
  `/private/tmp/lifeos-coherence-finance-removal`, Branch
  `feat/coherence-finance-removal`, HEAD `4ec7c46`, ungecommittet weiterhin nur
  die Koordinatoränderung an dieser Datei; Basis `22d5ba6` unverändert.
  `apps/desktop/src-tauri/resources` und `.../binaries` fehlten im isolierten
  Worktree; der synthetische Lauf erzeugt sie lokal über `desktop:prepare`
  (kein Hauptcheckout, keine installierte App wird ersetzt). Node 22.21.1
  (`/opt/homebrew/opt/node@22/bin`) und die für Node 22 gebaute lokale
  `better-sqlite3`-Binärdatei bleiben die Grundlage.
- Ergebnis 2b/2 (echter synthetischer Lauf bestanden, Stand 25.09.2026): In
  `scripts/verify-mac-desktop-sidecar.mjs` sind die aktiven Finanzanlage- und
  Finanzleseprüfungen entfernt. Eine neue gemeinsame negative Hilfsfunktion
  `expectRetiredFinanceRoutes` prüft acht alte Finanzpfade (GET `/finance`, GET
  `/finance/export`, POST/PATCH `categories`, `transactions`, `budgets`) vor
  und nach dem Sidecar-Neustart auf `404` mit `error.code: "NOT_FOUND"` und
  JSON-Inhalt. Die synthetische SQLite-Zählung `FinanceTransaction` bleibt
  erhalten und wird zusätzlich ausdrücklich als `0` geprüft (vor und nach dem
  Neustart); die historische Migration `20260820190000_finance_module` bleibt
  erwartet, weil erst Paket 3 das Schema bereinigt. Alle fachfremden Prüfungen
  (Setup/Anmeldung, Kalender/CalDAV, ICS, Projekte, Aufgaben, Notizen,
  Dokumente, Suche, KI, Fitness, Integrationen, Rechte, Neustartidentitäten)
  sind unverändert.
- Tatsächliche Tests 2b/2: `npm run desktop:verify:sidecar` mit Node 22.21.1
  (`PATH=/opt/homebrew/opt/node@22/bin:$PATH`) bestand vollständig mit Exit 0.
  `desktop:prepare` baute Web und API neu, holte die geprüfte
  Node-22.23.2-Laufzeit (Prüfsumme stimmte), und der gebündelte Sidecar startete
  zweimal über den dynamischen Loopback-Port; die Schlussmeldung bestätigte den
  Lauf ohne aktive Finanzroute. Protokoll:
  `/Users/anton/.hermes/cache/scratch/p2b2-sidecar-verify.log`.
- Mutationskontrolle zur Wirksamkeit der Negativprüfung: eine Kopie des Scripts
  mit erwartetem `200` statt `404` schlug beim ersten alten Finanzpfad mit
  `actual: 404` fehl, die Assertion wird also wirklich ausgeführt; Protokoll
  `/Users/anton/.hermes/cache/scratch/p2b2-sidecar-mutant.log`. Zusatzbeleg: im
  vorbereiteten Bündel `apps/desktop/src-tauri/resources/server/server.js`
  existiert kein `/api/v1/finance`-Routenpfad (0 Treffer), während
  Fitnessrouten vorhanden sind; verbleibende `finance`-Treffer sind
  ausschließlich Prisma-Modell- und Enum-Namen des bis Paket 3 erhaltenen
  Schemas.
- Geänderte Dateien in 2b/2: nur `scripts/verify-mac-desktop-sidecar.mjs` und
  diese Fortschrittsdatei; keine produktive Migration, kein Schema- oder
  Schutzregelungseingriff, keine Altdaten berührt (ausschließlich temporäre
  synthetische SQLite-Datei im System-Temp).
- Delegationsbezug 2b/2: `coherence-p2b2-deepseek-20260925`,
  `deleg_16bf623e` / `sa-0-1c4885d4`; Commit `2ab72f6`
  (`test(desktop): assert retired finance route in sidecar check`). Der
  Koordinator prüfte Script-Diff und Schlussmeldung des echten Testlaufs.
- Geplanter Schritt 2c/1: tote Finanzmethoden und -Tests aus Web-API-Client,
  aktive Finance-Typen aus `@lifeos/contracts` und ausschließlich verwaiste
  Finanz-CSS-Selektoren entfernen. `TaskArea=finance` und gemeinsame
  Währungseinstellung bis Paket 3 erhalten; historische Dokumentation bleibt.
  Keine Backend-/Datenbankänderung. Delegationsbezug
  `coherence-p2c1-deepseek-20260925` (Hermes-ID separat speichern).
- Vorprüfung 2c/1 (vor der ersten Codeänderung, Stand 25.09.2026): tatsächliches
  cwd `/private/tmp/lifeos-coherence-finance-removal`, Branch
  `feat/coherence-finance-removal`, HEAD `2ab72f6`
  (`test(desktop): assert retired finance route in sidecar check`),
  ungecommittet weiterhin nur die Koordinatoränderung an dieser Datei; Basis
  `22d5ba6` unverändert. Node 22.21.1 unter `/opt/homebrew/opt/node@22/bin`
  vorhanden, `better-sqlite3` im Worktree für Node 22 gebaut. Aktive
  Vertragsverbraucher konkret: `apps/web/src/api.ts` importiert acht
  `Finance*`-Typen und stellt acht Finanzmethoden bereit;
  `apps/web/tests/unit/api.test.ts` enthält genau einen Finanz-Client-Test
  („verwaltet und exportiert Finanzdaten …“). In `apps/web/src/styles.css` sind
  ausschließlich `.finance-page`, `.finance-filters`, `.finance-metrics`,
  `.finance-grid`, `.finance-list`, `.month-comparison`, `.inline-create` und
  `.budget-warning.reached`/`.budget-warning.exceeded` verwaist; belegt über die
  in 2a gelöschte `FinanceWorkspace.tsx`, die genau diese Klassennamen nutzte
  (`.budget-warning` selbst hatte nie eine eigene Regel). `TaskArea=finance`
  (`task.ts`, `TaskForm.tsx`, `App.test.tsx`) und
  `UserSettingsResponse.currencyCode` bleiben unverändert. `apps/web/dist/` liegt
  aus einem früheren Lauf im Worktree und wird nicht editiert.
- Ergebnis 2c/1 (echte Prüfungen bestanden, Stand 25.09.2026): In
  `packages/contracts/src/api.ts` sind ausschließlich die aktiven
  Finance-Typgruppen entfernt (Category, Transaction, Budget, MonthSummary,
  BudgetWarning, Analytics, Overview, Export sowie die zugehörigen Enums und
  Create-/Update-Requests); `TaskArea` inklusive `"finance"` und
  `UserSettingsResponse.currencyCode` bleiben unverändert. In
  `apps/web/src/api.ts` sind die acht Finanzmethoden
  (`getFinance`, `createFinanceCategory`, `updateFinanceCategory`,
  `createFinanceTransaction`, `updateFinanceTransaction`, `createFinanceBudget`,
  `updateFinanceBudget`, `exportFinance`) und die acht zugehörigen Typimporte
  entfernt. Der frühere Finanz-Client-Test in `apps/web/tests/unit/api.test.ts`
  ist durch eine Stilllegungsprüfung ersetzt, die die Clientquelle ohne
  `finance` (case-insensitiv) und die Abwesenheit von `getFinance`/
  `exportFinance` belegt. In `apps/web/src/styles.css` sind ausschließlich die
  verwaisten Regeln `.finance-page`, `.finance-filters`, `.finance-metrics`,
  `.finance-grid`, `.finance-list`, `.month-comparison`, `.inline-create` und
  `.budget-warning.reached`/`.exceeded` samt ihren beiden Media-Queries entfernt;
  gemeinsam genutzte Nachbarregeln (z. B. `.knowledge-editor`,
  `.inline-link-form`, `.study-section`, `.record-card`) blieben unangetastet.
- Tatsächliche Tests 2c/1 (Node 22.21.1,
  `PATH=/opt/homebrew/opt/node@22/bin:$PATH`): Web-Unit-Tests 50/50 bestanden
  (10 Dateien, eine ersetzte Prüfung); `typecheck` und `build` von
  `@lifeos/contracts`; `typecheck`, `lint` und `build` von `@lifeos/web`
  (Buildausgabe u. a. `dist/assets/index-sKz2WLPf.css`); `typecheck` und `build`
  von `@lifeos/api`; `npm run format:check` bestanden; `git diff --check` ohne
  Befund. Abwesenheitsbeleg für das Produktions-CSS: die gebaute
  `apps/web/dist/assets/*.css` enthält keinen der entfernten Selektoren.
- Exakter nächster Schritt: Koordinator prüft den 2c/1-Diff und die Tests selbst;
  danach die noch offene Produktdokumentation (README/Leitfaden-Hinweise zu
  Finanzen) klären und Paket 2 gesammelt abnehmen. Paket 3 (Schema, Seeds,
  TaskArea) erst danach. Paket 2 bleibt offen; kein Push/PR/Merge.
  Delegationsbezug 2c/1: `coherence-p2c1-deepseek-20260925`; Commit `0788ef8`
  (`refactor(web): retire finance client, contracts and css`). Nachgetragen in
  einem reinen Dokumentationscommit direkt danach.

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

| Paket                         | Status                                   |
| ----------------------------- | ---------------------------------------- |
| 0 Plan und Übergabe           | Integriert über PR #120                  |
| 1 Einstellungen/Integrationen | Integriert über PR #121                  |
| 2 Finanzfunktionen entfernen  | 2a/2b/2c-Client committet; Abnahme offen |
| 3 Finanzdatenmigration        | Nicht begonnen                           |
| 4 Aufgaben–Studienmodul       | Nicht begonnen                           |
| 5 Kalender/Planung            | Nicht begonnen                           |
| 6 Modul-Arbeitsbereich        | Nicht begonnen                           |
| 7 PDF-Suche                   | Nicht begonnen                           |
| 8 Office-Suche                | Nicht begonnen                           |
| 9 Aufgaben–CalDAV             | Nicht begonnen                           |
| 10 Mac/iPhone-Anbindung       | Nicht begonnen                           |
| 11 Gesamtabnahme/App-Update   | Nicht begonnen                           |

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
