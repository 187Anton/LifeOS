# Kohärenzumbau: Fortschritt und nächste Übergabe

Stand: 25.09.2026. Diese Datei ist eine Übergabe, kein Ersatz für Live-Prüfungen.
Plan: [coherence-implementation-plan.md](coherence-implementation-plan.md).

## Aktuelles Paket

- Paket: **5 – Gemeinsame Kalender- und Planungsansichten** lokal umgesetzt und
  in drei Korrekturrunden nachgezogen. Stand nach der dritten Korrekturrunde
  (Kalenderwechsel und veraltete Ereignisantworten): 71/71 Web-Unit- und
  42/42 E2E-Tests in dieser Runde erneut gemessen; die API-Suite blieb bei
  118/118 aus der zweiten Runde, weil in dieser Runde keine API-Datei geändert
  wurde und sie deshalb nicht erneut ausgeführt wurde. Der letzte geprüfte
  Commit ist `60d6697` auf dem getrackten Branch
  `feat/coherence-calendar-planning-views`; für genau diesen Commit ist die
  Pflicht-CI live abgefragt und **grün** (`Repository checks` 5m10s und
  `Local macOS release` 10m50s, Lauf `36161389947`, `gh pr checks 125`).
  [PR #125](https://github.com/187Anton/LifeOS/pull/125) ist gegen `develop`
  eröffnet (`MERGEABLE`, `CLEAN`) und nicht gemergt. Der Commit dieser dritten
  Runde entsteht nach dem Push; seine CI ist im PR separat zu prüfen.
- Vorgänger: **Paket 4** ist über
  [PR #124](https://github.com/187Anton/LifeOS/pull/124) nach `develop`
  integriert; bestätigt ist der Merge-Commit `a8a2847` als Spitze von
  `origin/develop` und damit die Basis dieses Pakets.
- Branch: `feat/coherence-calendar-planning-views`.
- Basis: `a8a2847` (`origin/develop`, PR #124).
- Worktree: `/private/tmp/lifeos-coherence-planning-views`; der Hauptcheckout
  `/Users/anton/Projekte/LifeOS` blieb unverändert.
- Umsetzung: die ursprüngliche Paket-5-Umsetzung und die erste Korrekturrunde
  liefen mit genau einem DeepSeek-Worker nacheinander (Planung, Prüfung und
  Abnahme durch den koordinierenden Agenten, keine zweite Schreibinstanz). Die
  zweite und die dritte Korrekturrunde hat der koordinierende Agent selbst
  umgesetzt und geprüft (keine Delegation).
- Persönliche Daten: Antons Entwicklungsdatenbank blieb unberührt. Der lokale
  Compose-Container dieses Worktrees band PostgreSQL an `127.0.0.1` mit eigener,
  leerer Datenbank `lifeos_planning_views`; Migrationen und Tests liefen
  ausschließlich gegen synthetische Werte. Die installierte App wurde nicht
  angefasst.
- Geänderter Umfang: gemeinsamer Projektionsvertrag in
  `packages/contracts/src/api.ts`, Planning-Service, neue gemeinsame
  Web-Projektion `apps/web/src/calendar-projection.ts`, `CalendarWorkspace.tsx`,
  `PlanningWorkspace.tsx`, `TaskWorkspace.tsx`, `App.tsx`, zugehörige Styles
  sowie die betroffenen API-, Web-Unit- und E2E-Nachweise.
- Nicht geändert: Datenbankschema, Migrationen, CalDAV-Server, Apple-Integration,
  freie `TaskEventLink`-Beziehungen und die Finanzmodule. Eine verwaltete
  Task-Kalender-Relation bleibt Paket 9. `LifeOS Leitfaden.docx` und `README.md`
  blieben unverändert, weil Paket 5 keine neue Bedienung oder Einrichtung
  einführt.
- Git-Stand: Der gemessene Stand ist als `60d6697`
  (`fix(calendar): align calendar and planning projection rules`) auf
  `origin/feat/coherence-calendar-planning-views` gepusht; der Branch ist
  hochgeladen und getrackt, `origin/develop` blieb bei `a8a2847`. PR #125 gegen
  `develop` ist eröffnet (nicht gemergt); die Pflicht-CI für `60d6697` ist live
  als grün bestätigt (Lauf `36161389947`, beide Jobs `pass`).
- Delegation: In der ersten Korrekturrunde hat der koordinierende Agent die
  Umsetzung der vier Befunde an einen deepseek-Worker übergeben und dessen
  Ergebnis unabhängig geprüft (Diff, Paketgrenzen, eigene Testläufe). Die
  Modellwahl wurde in der Delegationssitzung verifiziert; es gab keinen stillen
  Wechsel auf ein anderes Modell. Die zweite Korrekturrunde (Statusfilter,
  öffentliche Identität, Zeitraum und Zeitzone, Übergabe) und die dritte
  Korrekturrunde (Kalenderwechsel und veraltete Ereignisantworten) hat der
  koordinierende Agent selbst umgesetzt und geprüft; beide liefen ohne
  Delegation, weil der jeweilige Auftrag keine Rollenteilung vorgab.

## Paket 5 – lokale Nachweise

> Die Zahlen in diesem Abschnitt sind der Stand **vor** beiden Korrekturrunden
> (108/108 API, 60/60 Web-Unit, 38/38 E2E). Die aktuellen Stände stehen in den
> Abschnitten „Korrektur der vier Abnahmebefunde“ und „Korrektur der offenen
> Befunde (Statusfilter, Identität, Zeitraum und Zeitzone)“ weiter unten.

- Projektion und Trennung: `npm test --workspace @lifeos/api` 108/108, darunter
  die neuen Fälle „unterscheidet Frist, geplanten Zeitblock und
  Startmarkierung“, „rechnet Fristen nicht als belegte Arbeitszeit“,
  „unterdrückt verknüpfte Studieneinträge“, „projiziert keine fremden
  Datensätze desselben Repository-Aufrufs“ und „hält Startmarkierung und
  Zeitblock über die Zeitumstellung korrekt“. Fristen erscheinen als
  Ganztagsobjekte, Aufgaben mit Start und Dauer als geplante Zeitblöcke,
  Aufgaben mit Start ohne Dauer als Startmarkierung ohne Feld `endsAt`; nur
  geplante Blöcke mit geprüfter Dauer fließen in Kapazität und
  Überschneidungsprüfung ein.
- API-Integration: `apps/api/tests/planning.integration.test.ts` (Teil des
  Laufs oben) prüft zusätzlich Besitzergrenzen (`ownerId`, fremde Aufgabe),
  Duplikatunterdrückung (verknüpfter `StudyEntry` liefert kein eigenes Element,
  sein führendes Kalenderereignis bleibt sichtbar) sowie Startmarkierung,
  Frist und Zeitblock nebeneinander.
- Web-Unit: `npx vitest run` in `apps/web` 60/60 (vorher 52/52), darunter der
  neue `apps/web/tests/unit/calendar-projection.test.ts` mit Tag, Woche, Monat
  und Agenda, Serien mit stabiler UID und unverändertem ETag, ganztägigen
  Terminen, Frist/Zeitblock-Trennung derselben Aufgabe, unterdrückten
  verknüpften Studienzeiten, ausgeblendeten erledigten/archivierten Quellen
  sowie Startmarkierungen über die Zeitumstellung ohne erfundenes Ende.
- Web-Unit Bearbeitung: `App.test.tsx` lädt die Projektionen nach der
  Bearbeitung einer Aufgabenfrist aus der Kalenderansicht neu — nachgewiesen
  über gestiegene Aufrufzahlen für Aufgaben, Kalenderereignisse, Studium,
  Dashboard und Planung und die anschließend zwei getrennt beschrifteten
  Projektionen („Frist“ und „Geplanter Zeitblock“).
- Desktop und Mobil: `npx playwright test` in `apps/web` 38/38 in den Projekten
  `desktop-chrome` und `mobile-chrome`, darunter der neue Ablauf „trennt Frist,
  Zeitblock und Startmarkierung, unterdrückt verknüpfte Studienzeiten und
  bearbeitet Aufgaben aus der Ansicht“ (Frist und Startmarkierung getrennt
  beschriftet, Startmarkierung ohne Ende, Monatsansicht mit denselben
  Kennzeichnungen, Öffnen des bestehenden Aufgabeneditors aus der Ansicht,
  anschließend zwei Projektionen derselben Aufgabe) sowie die angepasste
  Studienprüfung, die die Frist nun in der gemeinsamen Kalenderprojektion
  erwartet. Derselbe Ablauf deckt zusätzlich die Bearbeitung eines festen
  Termins aus der Planungsansicht ab: Der Eintrag öffnet den bestehenden
  Termin-Editor im Kalender, das Speichern aktualisiert die Projektionen, und
  die parallele Projektion der Aufgabe bleibt unverändert sichtbar.
- Qualität: `npm run typecheck`, `npm run lint`, `npm run format:check`,
  `npm run build`, `npm run repo:check` und `npm run security:secrets`
  bestanden.
- Bewusste Grenze ohne eigene Datenquelle: Die Weboberfläche liest die
  gemeinsame Projektion unverändert aus dem Kalenderkern; Serienvorkommen
  bleiben flüchtig, bearbeitet wird stets das führende Ereignis mit stabiler UID
  und aktuellem ETag. Für Kalenderereignisse und Aufgaben verwendet die
  Projektion nur öffentliche Kennungen (`uid`, Aufgaben-ID) und gibt keine
  internen IDs heraus.

## Paket 5 – Korrektur der vier Abnahmebefunde

Stand: 25.09.2026, gemessen im Worktree
`/private/tmp/lifeos-coherence-planning-views` auf Branch
`feat/coherence-calendar-planning-views` (Basis `a8a2847`). Alle Zahlen stammen
aus tatsächlich ausgeführten Läufen nach Abschluss aller Änderungen.

- **Befund 1 – Zeitzonen.** Kalender- und Planungsansicht verwenden dieselbe
  Tagesbasis, nämlich die Profilzeitzone (`profile.settings.timezone`): sie gilt
  für Aufgaben, Studieneinträge und Termine. Kalenderereignisse werden in ihrer
  gespeicherten Zeitzone beschriftet und nicht neu interpretiert; die
  Planungs-API gibt dafür `event.timezone` statt der Profilzeitzone aus.
  Nachweise: API-Fall „ordnet Ereignisse nach gespeicherter Ereignis- und Blöcke
  nach Profilzeitzone zu“, Web-Unit-Fall „ordnet Aufgaben und Studium nach
  Profilzeitzone und rasiert Termine im Kalender“ mit Kalenderzeitzone
  `America/New_York` gegen Profilzeitzone `Europe/Berlin` (in der zweiten
  Korrekturrunde auf die gemeinsame Tagesbasis aller Quellen umgeschrieben).
- **Befund 2 – Zeitblöcke über Mitternacht.** Zeitgebundene Blöcke werden in
  beiden Ansichten bei echter Zeitüberlappung aufgenommen; der Anzeigetag ist
  `max(eigener Starttag in Profilzeitzone, Zeitraumstart)`, es entsteht genau
  ein Eintrag pro Block und Zeitraum. Fortsetzungen sind sichtbar
  gekennzeichnet („Fortsetzung vom Vortag“, „Fortsetzung am Folgetag“) und
  zählen die Dauer nur einmal, weil Kapazität einen geplanten Block
  ausschließlich an seinem eigenen Starttag berücksichtigt. Nachweise:
  API-Fälle „zeigt einen Mitternachtsblock genau einmal mit Anzeigetag in der
  Profilzeitzone“, „zählt einen Mitternachtsblock nicht doppelt gegen die
  Verfügbarkeit“ und „führt einen Mitternachtsblock über die Wochengrenze in
  beiden Wochen“; Web-Unit-Fälle „zeigt einen Mitternachtsblock genau einmal am
  Anzeigetag mit Fortsetzung“ und „führt einen Block über die Wochengrenze in
  beiden Wochen fort“; E2E-Fall „zeigt einen über Mitternacht laufenden
  Zeitblock genau einmal mit Fortsetzungskennzeichnung“ in Tages- und
  Wochenansicht.
- **Befund 3 – erledigte Studieneinträge.** Die Kalenderansicht blendet
  `completed`, `cancelled` und archivierte Studieneinträge wieder aus, aktive
  bleiben sichtbar (`paused` bleibt sichtbar, entsprechend dem Altverhalten
  `![completed, cancelled]`). Nachweise: Web-Unit-Fall „blendet erledigte,
  abgebrochene und archivierte Studieneinträge aus, aktive bleiben“ mit vier
  getrennten Fällen und E2E-Fall „zeigt im Kalender nur aktive Studieneinträge
  und blendet erledigte, abgebrochene und archivierte aus“. Der API-Filter war
  in dieser Runde noch auf `status !== "cancelled"` beschränkt; die
  Angleichung folgte in der zweiten Korrekturrunde (siehe unten).
- **Befund 4 – führender Kalendertermin.** Ein verknüpfter Studieneintrag wird
  nur noch unterdrückt, wenn sein führender Termin in der tatsächlich
  gelieferten Projektion vorkommt. Dafür gibt `StudyEntryResponse` die stabile
  öffentliche `calendarEventUid` read-only aus (die interne `calendarEventId`
  bleibt intern), und die Planungs-API sowie die Web-Projektion prüfen gegen die
  tatsächlich projizierten Ereignisse. Liegt der Termin in einem anderen
  Kalender, außerhalb des Zeitraums oder ist er gelöscht, bleibt der Eintrag
  sichtbar. Aus der Planungsansicht öffnet ein fester Termin den bestehenden
  Termin-Editor über `{calendarId, uid}` inklusive Kalenderwechsel. Es entstand
  kein neuer Schreibpfad und keine verwaltete Aufgaben-Kalender-Beziehung.
  Nachweise: API-Fälle „zeigt den Studieneintrag, wenn der führende Termin nicht
  geliefert wird“ und „unterdrückt verknüpfte Studieneinträge nur gegen die
  gelieferte Projektion“, Integrationsfall „projiziert Mitternachtsblock und
  führenden Termin aus der realen Datenbank“, Web-Unit-Fälle „unterdrückt einen
  verknüpften Studieneintrag nur bei tatsächlich gezeigtem führendem Termin“ und
  „wählt für einen festen Termin aus der Planung den Kalender des Eintrags und
  öffnet den bestehenden Editor“ sowie „zeigt einen verknüpften Studieneintrag
  mit führendem Termin in einem anderen Kalender“. In dieser Runde verglichen
  beide Ansichten noch über die UID; der Wechsel auf die zusammengesetzte
  öffentliche Identität `(calendarId, uid)` folgte in der zweiten
  Korrekturrunde (siehe unten).
- Zusätzlich behoben: ein reproduzierbarer E2E-Flake in
  `apps/web/tests/e2e/lifeos.spec.ts` (Test „zeigt die lokale Übersicht und
  speichert Termine ohne Browserpersistenz“). Ursache war die Reihenfolge im
  Test, nicht die Fachlogik: Nach dem Speichern bleibt der Termin-Editor offen,
  bis die Projektionen neu geladen sind; die frühere Prüfung traf deshalb Karte
  und Editorüberschrift gleichzeitig. Der Test wartet jetzt deterministisch auf
  das Schließen des Editors und prüft die Karte eindeutig über ihren Container.
- Gemessene Nachweise dieser Runde (Stand nach der ersten Korrekturrunde):
  `npm test --workspace @lifeos/api` **116/116** (vorher 108), Web-Unit
  `npx vitest run` in `apps/web` **67/67** in
  11 Dateien (vorher 60), Playwright `npx playwright test` in `apps/web`
  **42/42** in `desktop-chrome` und `mobile-chrome` (vorher 38), vier volle
  Läufe hintereinander ohne Fehlschlag. Qualität: `npm run typecheck`,
  `npm run lint`, `npm run format:check`, `npm run build`, `npm run repo:check`
  und `npm run security:secrets` bestanden.
- Nicht ausgeführt: `npm run test:repo`, `npm run test:sqlite:api` und die
  Recovery-/Sidecar-Nachweise; sie sind für diese Korrektur nicht einschlägig,
  weil kein Schema, keine Migration und kein Providerverhalten geändert wurde.
- Nicht geändert: Datenbankschema, Migrationen, CalDAV-/Apple-Pfade, freie
  `TaskEventLink`-Beziehungen, Finanzmodule, Modulseiten und Dokumentsuche. Die
  verwaltete Task-Kalender-Relation bleibt Paket 9.

## Paket 5 – Korrektur der offenen Befunde (Statusfilter, Identität, Zeitraum und Zeitzone)

Stand: 25.09.2026, gemessen im Worktree
`/private/tmp/lifeos-coherence-planning-views` auf Branch
`feat/coherence-calendar-planning-views` (Basis `a8a2847`). Alle Zahlen stammen
aus tatsächlich ausgeführten Läufen nach Abschluss aller Änderungen. Diese
Runde wurde vom koordinierenden Agenten selbst umgesetzt und geprüft (keine
Delegation, siehe oben).

- **Statusfilter angeglichen.** Beide Ansichten verwenden dieselbe Statusregel
  für Studieneinträge: `completed` und `cancelled` bleiben unsichtbar, aktive
  einschließlich `paused` bleiben sichtbar, archivierte Einträge liefert die
  Planungsquelle weiterhin nicht aus. Die Planungs-API wendet sie über
  `hiddenStudyStatus` in `apps/api/src/modules/planning/service.ts` an; die
  Web-Projektion nutzt dieselbe Regel in `apps/web/src/calendar-projection.ts`.
  Nachweise: API-Fall „wendet in der Planung dieselben Statusfälle an wie die
  Kalenderansicht“ (Menge `[paused, planned]`), Erweiterung des
  Integrationsfalls um einen erledigten und einen pausierten Eintrag,
  Web-Unit-Fall „wendet in der Kalenderansicht dieselben Statusfälle an wie die
  Planungs-API“ und der E2E-Fall „zeigt im Kalender nur aktive Studieneinträge
  und blendet erledigte, abgebrochene und archivierte aus“, der jetzt dieselbe
  Statusmenge in Kalender- **und** Planungsansicht prüft.
- **Verknüpfte Ereignisse eindeutig abgeglichen.** Verglichen wird nur noch die
  zusammengesetzte öffentliche Identität `(calendarId, uid)`, nie die UID allein.
  Dafür gibt `StudyEntryResponse.calendarEventCalendarId` den öffentlichen
  Kalender des führenden Termins read-only aus (interne `calendarEventId` bleibt
  intern, es entstand kein neuer Schreibpfad), die Planungsquelle liest die
  Relation schreibgeschützt mit (`include: { calendarEvent: { select: { uid,
calendarId } } }`), und die Web-Projektion prüft gegen die Schlüssel der
  tatsächlich dargestellten Ereignisse ihres Kalenders. Nachweise: API-Fall
  „unterdrückt einen verknüpften Studieneintrag nur bei gleicher UID im selben
  Kalender“ (zwei Kalender mit derselben UID, dritter Kalender bleibt sichtbar),
  Integrationsfall „unterdrückt bei gleicher UID in zwei Kalendern nur den
  verknüpften Termin“ gegen die reale Datenbank und Web-Unit-Fall „unterdrückt
  einen verknüpften Studieneintrag nur bei gleicher UID im selben Kalender“.
- **Zeitraum und Zeitzone angeglichen.** Alle Quellen der Kalenderansicht –
  Aufgaben, Studieneinträge und Termine – verwenden dieselbe Profilzeitzone als
  Tagesbasis; Anker und „Heute“ hängen nicht mehr von der Kalenderzeitzone ab.
  Ein abweichender Kalender-Zeitzonenwert ergibt damit auch über Mitternacht
  keinen anderen sichtbaren Tag. Gespeicherte Zeitpunkte und die
  Ereigniszeitzone bleiben unverändert: Termine werden weiterhin in ihrer
  eigenen Zeitzone beschriftet und über `entry.event` mit stabiler UID und
  aktuellem ETag bearbeitet. Nachweise: Web-Unit-Fall „gibt Aufgaben, Studium
  und Terminen bei abweichender Kalenderzeitzone denselben sichtbaren Tag“ mit
  Kalenderzeitzone `America/New_York` gegen Profilzeitzone `Europe/Berlin` nahe
  dem Tageswechsel und App-Test „zeigt bei abweichender Kalenderzeitzone
  denselben sichtbaren Tag wie die Planung“ mit `Pacific/Kiritimati` gegen
  `Etc/GMT+12` (26 Stunden Unterschied, die Kalendertage können deshalb nie
  übereinstimmen).
- Gemessene Nachweise dieser Runde: `npm test --workspace @lifeos/api`
  **118/118** (vorher 116, inklusive eines neuen Integrationsfalls gegen die
  reale Datenbank), Web-Unit `npx vitest run` in `apps/web` **70/70** in 11
  Dateien (vorher 67), Playwright `npx playwright test` in `apps/web`
  **42/42** in `desktop-chrome` und `mobile-chrome`. Qualität:
  `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`,
  `npm run repo:check` und `npm run security:secrets` bestanden.
- Nicht ausgeführt: `npm run test:repo`, `npm run test:sqlite:api` und die
  Recovery-/Sidecar-Nachweise; sie sind für diese Korrektur nicht einschlägig,
  weil kein Schema, keine Migration und kein Providerverhalten geändert wurde.
  Der ARM64-DMG-/Notarisierungspfad wurde nicht angefasst.
- Nicht geändert: Datenbankschema, Migrationen, CalDAV-/Apple-Pfade, freie
  `TaskEventLink`-Beziehungen, Finanzmodule, Modulseiten und Dokumentsuche. Die
  verwaltete Task-Kalender-Relation bleibt Paket 9.

## Paket 5 – Korrektur der Kalenderwechsel- und Antwortreihenfolge-Befunde

Stand: 25.09.2026, gemessen im Worktree
`/private/tmp/lifeos-coherence-planning-views` auf Branch
`feat/coherence-calendar-planning-views` (Basis `a8a2847`) gegen den Stand
`60d6697`. Diese Runde wurde vom koordinierenden Agenten selbst umgesetzt und
geprüft (keine Delegation).

- **Befund.** Beim Kalenderwechsel blieben die zuvor geladenen Ereignisse im
  Zustand von `App.tsx`, während `selectedCalendarId` bereits den neuen Kalender
  bezeichnete. Die Kalenderprojektion führt Termine unter dem übergebenen
  `calendarId`; dadurch wurden Termine des alten Kalenders mit der ID des neuen
  Kalenders verschlüsselt. Bei gleicher UID konnte ein verknüpfter
  Studieneintrag fälschlich unterdrückt werden. Zusätzlich konnte die verspätete
  Antwort einer überholten Anfrage – etwa bei zwei schnellen Wechseln – die
  Anzeige nach dem letzten Wechsel überschreiben.
- **Korrektur 1 – Zuordnung.** `CalendarWorkspace` leitet die Projektion aus
  `projectedEvents` ab: Ereignisse gehen nur ein, wenn `eventsCalendarId` exakt
  dem ausgewählten Kalender entspricht. Während eines Wechsels, nach einem
  Fehler oder nach einem Kalenderwechsel ohne neue Daten bleiben fremde
  Ereignisse draußen, statt unter der neuen Kalender-ID projiziert zu werden.
  Der Vertrag von `buildCalendarProjection` („die geladenen Ereignisse gehören
  genau diesem Kalender“) ist damit geprüft statt angenommen.
- **Korrektur 2 – Antwortreihenfolge.** `App.tsx` nummeriert jede
  Ereignisanfrage über `eventsRequestRef` und übernimmt Ereignisse,
  Kalenderbezug und Ladezustand nur, wenn die Antwort zur jüngsten Anfrage
  gehört. Eine verspätete Antwort einer überholten Anfrage bleibt ohne Wirkung,
  auch im Fehlerpfad.
- **Regressionstest.** App-Test „wechselt den Kalender ohne veraltete Ereignisse
  und ohne falsche Unterdrückung“: derselbe UID-Wert in zwei Kalendern, ein
  Studieneintrag ist mit dem neuen Kalender verknüpft, sein eigener Termin liegt
  außerhalb des sichtbaren Zeitraums. Der Ereignis-Mock des Tests hält Antworten
  je Kalender zurück (`holdEvents`/`releaseEvents`), damit Laden und vertauschte
  Antwortreihenfolge deterministisch prüfbar sind. Geprüft werden Ausgangslage,
  Ladezustand ohne fremden Termin, die gelieferte Antwort des neuen Kalenders
  und zuletzt die verspätete Antwort des überholten Kalenders; in jedem Schritt
  muss der mit dem ausgewählten Kalender verknüpfte Eintrag sichtbar bleiben.
- **Reproduktion belegt.** Mit dem unveränderten Stand `60d6697` (beide
  Quelldateien per `git show HEAD:…` eingesetzt, ohne Reset, Clean oder
  Checkout; danach aus einer Kopie wiederhergestellt und mit `git diff --stat`
  geprüft) schlägt der Test fehl: nach der verspäteten Antwort sind weder der
  Termin des ausgewählten Kalenders noch der damit verknüpfte Studieneintrag zu
  finden – der Eintrag wird also fälschlich unterdrückt und die Anzeige wechselt
  auf die Daten des überholten Kalenders. Mit der Korrektur ist der Test grün.
- Gemessene Nachweise dieser Runde: Web-Unit `npx vitest run` in `apps/web`
  **71/71** in 11 Dateien (vorher 70, inklusive des neuen Regressionstests),
  Playwright `npx playwright test` in `apps/web` **42/42** in `desktop-chrome`
  und `mobile-chrome`. Qualität: `npm run typecheck`, `npm run lint`,
  `npm run format:check`, `npm run build`, `npm run repo:check` und
  `npm run security:secrets` bestanden.
- Nicht erneut ausgeführt und deshalb hier nicht als Ergebnis behauptet: die
  API-Suite (in dieser Runde wurde keine API-Datei geändert), `npm run
test:repo`, `npm run test:sqlite:api`, die Recovery-/Sidecar-Nachweise und der
  ARM64-DMG-/Notarisierungspfad.
- Nicht geändert: Datenbankschema, Migrationen, CalDAV-/Apple-Pfade, freie
  `TaskEventLink`-Beziehungen, Finanzmodule, Modulseiten und Dokumentsuche.

## Paket 4 – lokale Nachweise

- Schema und Migrationen: `npm run db:validate`, `npm run db:sqlite:validate`,
  `npm run db:generate` und `npm run db:sqlite:generate` gültig bzw. erfolgreich.
  PostgreSQL-Migration `20260925121551_task_study_module` (nullable Spalte,
  zusammengesetzter Fremdschlüssel `(studyModuleId, userId)` mit
  `onDelete: Restrict`, Index, Rückrelation), SQLite-Migration
  `20260925121600_task_study_module` (kontrollierte Tabellenneuanlage mit
  `onDelete: NoAction`, Marker `foreign-keys-off` und `requires-backup`);
  Bestandsaufgaben bleiben `NULL`.
- Migration und Aufbau: `packages/database/tests/sqlite-migration.integration.test.ts`
  11/11 (frische Migration, Index- und Triggerlisten, Modulbezug samt
  Besitzergrenze, archiviertes Modul, unveränderte Bestandsaufgabe) und
  `sqlite-pre-migration-backup.integration.test.ts` 5/5 (Vor-Migrationsstand ohne
  Paket 3 und 4, geprüftes Backup vor beiden destruktiven Migrationen).
- Datenbank: `packages/database/tests/database.integration.test.ts` 12/12 gegen
  die isolierte synthetische PostgreSQL-Datenbank (Zuordnung, Entfernung,
  Projekt plus Modul, fremder Besitzer, archiviertes Modul, unveränderte
  `StudyEntry`-Bezüge, kein stilles Löschen eines referenzierten Moduls).
- Import und Recovery: `npm run db:sqlite:verify:recovery` 2/2 (PostgreSQL-Quelle,
  Import in der Reihenfolge Programme/Module vor Aufgaben, Backup, Restore mit
  erhaltenem Modulbezug) sowie `npm run db:verify:finance-removal` grün gegen
  isolierte synthetische Datenbanken, erweitert um die Spalten- und
  `NULL`-Prüfung der Aufgaben nach der Migration.
- API: `npm run test --workspace @lifeos/api` 102/102 und
  `npm run test:sqlite:api` 102/102, darunter der neue
  `apps/api/tests/task-study-module.integration.test.ts` (Zuordnung, Entfernung,
  Modulfilter einschließlich `none`, fremder Besitzer, archiviertes und
  unbekanntes Modul, unveränderte Studiendaten).
- Web-Unit: `npm run test:unit --workspace @lifeos/web` 52/52, darunter der
  gemeinsame Editor mit Modul- und Projektwahl, der Modulfilter „Ohne Modul“,
  die Kennzeichnung des archivierten Altbezugs und der Einstieg aus dem
  Studienmodul mit vorausgewähltem Bereich „Studium“.
- Desktop und Mobil: `npm run test --workspace @lifeos/web` 36/36 in den
  Projekten `desktop-chrome` und `mobile-chrome`, darunter der neue Ablauf
  „verwaltet den optionalen Studienmodulbezug auf Desktop und Smartphone“.
- SQLite-API-Runtime: `npm run verify:sqlite:api-runtime` grün; nach dem Neustart
  bleibt der Modulbezug erhalten, `studyModuleId` filtert genau die zugeordnete
  Aufgabe, `studyModuleId=none` liefert keine, und die SQLite-Datei enthält
  denselben Bezug samt Modul.
- Mac-Sidecar: `node scripts/verify-mac-desktop-sidecar.mjs` grün (Exit 0) —
  synthetische 0.6-Produktdemo, zweiter Start ohne Homebrew-Pfad, erhaltene
  Fach- und Kalenderidentitäten, erhaltene Modulbezüge der Aufgabe nach dem
  Neustart, Vor-Paket-3-Stand erst nach geprüftem Vor-Migrationsbackup.
- Qualität: `npm run format:check`, `npm run lint`, `npm run typecheck` mit
  synthetischer `DATABASE_URL`, `npm run build`, `npm run test:repo` 19/19,
  `npm run repo:check`, `npm run security:secrets` und `git diff --check`
  bestanden.
- Reproduzierter Umgebungshinweis ohne Fachänderung: `res.sendFile` behandelt
  einen absoluten Pfad unterhalb eines Punktverzeichnisses (etwa `.worktrees`)
  als Dotfile und antwortet mit `Not Found`, obwohl `express.static` dieselbe
  Datei ausliefert. Der Sidecar-Nachweis lief deshalb aus einem punktfreien
  Verzeichnis mit Verweisen auf `resources` und `binaries`.

## Paket 2 – lokale Nachweise (historisch, integriert über PR #122)

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
- Delegationsbezug 2c/1: `coherence-p2c1-deepseek-20260925`,
  `deleg_c900960b` / `sa-0-60001ed6`; Commits `0788ef8` und `2525021`.
- Koordinatorprüfung und Produktdokumentation: 2c/1-Diff und Scope geprüft;
  Web-Unit 50/50, Playwright Desktop/Mobil 34/34, Repository-Tests 19/19,
  Lint, vollständiger Typecheck und Build (mit synthetischer `DATABASE_URL`),
  Formatprüfung bestanden. Ein erster Typecheck ohne `DATABASE_URL` brach
  erwartbar bereits bei Prisma-Generate ab, ohne Datenbankänderung.
  README, API-/Web-README und AGENTS.md sind aktualisiert. Der Leitfaden
  markiert Finanzabschnitte als historischen Ausgangsstand, entfernt den
  Finanznavigationspunkt und nennt Paket 3; mit `python-docx` geschrieben und
  neu geöffnet/geprüft, nicht visuell gerendert. Alles noch ungecommittet.
- Offener Produktrest: `UserSettingsResponse.currencyCode` und der
  `/api/v1/profile/settings`-Schreibpfad sind ausschließlich für Finanzen
  benötigt worden; das Datenbankfeld bleibt bis Paket 3 bestehen. Daher
  Teilauftrag 2c/2 vor der Gesamtabnahme ergänzen.
- Delegationsbezug 2c/2: `coherence-p2c2-deepseek-20260925`; die Hermes-ID trägt
  der Koordinator im Handoff nach, sie ist im Workerlauf nicht abrufbar.
- Vorprüfung 2c/2 (Stand 25.09.2026, vor der ersten Codeänderung): Worktree
  `/private/tmp/lifeos-coherence-finance-removal`, Branch
  `feat/coherence-finance-removal`, HEAD `2525021`
  (`docs(coherence): record 2c/1 commit hash`); ungecommittet unverändert genau
  die sieben Dokumentationsdateien aus 2c/1. Es wurde nichts zurückgesetzt oder
  überschrieben. Bewusst unverändert blieben alle `currencyCode`-Vorkommen
  außerhalb des Paketscopes: beide Prisma-Schemata, Seeds, alte Migrationen,
  `packages/database/tests/*`, `scripts/verify-database-recovery.sh`, die
  generierten Prisma-Clients sowie die alten Query-Parameter in
  `scripts/verify-mac-desktop-sidecar.mjs`.
- Ergebnis 2c/2: `UserSettingsResponse` in `packages/contracts/src/api.ts`
  enthält kein `currencyCode` mehr; damit ist auch `UpdateSettingsRequest` ohne
  Währung. In `apps/api/src/modules/profile/router.ts` sind Feld und
  Währungsvalidierung aus dem strikten Einstellungs-Schema entfernt, sodass ein
  weiterhin gesendeter Währungscode bewusst `400 VALIDATION_ERROR` erhält statt
  stillschweigend ignoriert zu werden. In
  `apps/api/src/modules/profile/repository.ts` bildet `mapProfile` keine Währung
  mehr ab; Feld und Bestandsdaten von `UserSettings.currencyCode` bleiben
  unberührt.
- Tests 2c/2: `apps/api/tests/profile.test.ts` prüft die währungsfreie
  Profilantwort über die Schlüsselmenge, das währungsfreie gültige Update und
  die Ablehnung eines alten Währungsschreibversuchs mit `400`, `VALIDATION_ERROR`
  und unverändertem Audit-Zähler.
  `apps/api/tests/profile-database.integration.test.ts` aktualisiert ohne
  Währung, prüft im Audit `changedFields` ohne `currencyCode` und belegt, dass
  die gespeicherte Spalte weiterhin `EUR` enthält. Angepasst wurden außerdem
  `apps/web/tests/unit/App.test.tsx`, `apps/web/tests/e2e/lifeos.spec.ts` und
  `scripts/verify-sqlite-api-runtime.ts`. Datenbank-, Seed-, Transfer-,
  Backup- und Migrationstests mit gespeicherter Währung blieben unverändert.
- Dokumentation 2c/2: `apps/api/README.md` nennt keinen gültigen ISO-
  Währungscode mehr als unterstützte Einstellung, sondern das bewusste `400` und
  den unveränderten Bestandswert. Der Leitfaden ersetzt in 5.12 Einstellungen
  „Zeitzone, Sprache, Währung und Wochenbeginn“ durch „Zeitzone, Sprache und
  Wochenbeginn“ und ergänzt dort einen Umsetzungsstand 25.09.2026. Historische
  Finanzabschnitte (5.5, Speicherregeln, Tabellen) und die Planungsfrage zu
  Finanzkategorien und Währungen unter „Offene Entscheidungen“ bleiben als
  historischer Nachweis ausdrücklich stehen.
- Tatsächliche Prüfungen 2c/2 (Node 22.21.1 unter
  `/opt/homebrew/opt/node@22/bin`): gezielter Profil-API-Test 3/3;
  `npm run test:sqlite:api` 100/100; `npm run verify:sqlite:api-runtime` mit
  Meldung „SQLite-API-Neustartprüfung erfolgreich“; Web-Unit 50/50 in zehn
  Dateien; Playwright Desktop und Smartphone 34/34; `npm run format:check`,
  `npm run lint`, vollständiger `npm run typecheck` und `npm run build` mit der
  synthetischen `DATABASE_URL` `postgresql://unused:***@127.0.0.1:5432/unused`;
  `npm run test:repo` 19/19; `npm run security:secrets` ohne Treffer;
  `npm run desktop:verify:sidecar` mit acht weiterhin stillgelegten
  Finanzpfaden (`404 NOT_FOUND`) und zwei Starts des gebündelten Sidecars;
  `git diff --check` ohne Befund.
- Leitfaden-Nachweis: Die Datei wurde erneut mit `python-docx` geöffnet und
  geprüft, `docx_validate.py` meldet `{"ok": true, "issues": []}`, und Microsoft
  Word hat den aktualisierten Leitfaden als 25-seitiges PDF gerendert (Artefakt:
  `/Users/anton/.hermes/cache/scratch/p2c2-guide-render/LifeOS Leitfaden.pdf`),
  die Seitenzahl bleibt also bei 25. Eine echte visuelle Sichtprüfung aller 25
  Seiten war in diesem Workerlauf nicht möglich: der Lauf hat kein
  Bildanalyse-Werkzeug, kein LibreOffice und keinen Seiten-Rasterizer
  (`pdftoppm`, `pypdfium2` fehlen, Offline-Installation abgelehnt), und
  Subagenten sind durch den Auftrag ausgeschlossen. Die visuelle Abnahme bleibt
  deshalb offener Koordinatorpunkt; textlich wurden Einstellungs-, Finanz-,
  Umsetzungs- und Änderungsstandspassagen einzeln geprüft.
- Offene Risiken: Alte Clients mit `currencyCode` erhalten jetzt bewusst `400`.
  Das Bestandsfeld, `TaskArea=finance`, historische Finanzabschnitte und die
  alten Finanzmodelle bleiben bis Paket 3 erhalten und sind kein 2c/2-Fehler.
  Paket 2 ist lokal geprüft, aber weder committet noch in der Pflicht-CI oder
  gemergt.
- Zusätzliche Abnahmeprüfung: In einem eigens gestarteten, flüchtigen
  PostgreSQL-17-Container (getrennt von der laufenden Entwicklungsdatenbank)
  wurden alle 20 vorhandenen Migrationen angewendet und
  `apps/api/tests/profile-database.integration.test.ts` erfolgreich ausgeführt
  (1/1). Der Container wurde danach gestoppt. Der historische Finanzvertrag
  beschreibt nun auch die bereits abgeschlossene Bereinigung in 2c.
  `git diff --check` und `npm run format:check` bestanden. Dieser lokale
  Nachweis ersetzt nicht die Pflicht-CI des PR.
- Exakter nächster Schritt: Dokumentation und Code committen, PR nach
  `develop` erstellen und beide Pflichtchecks für dessen Head abwarten.
  Paket 3 (Schema, Seeds, TaskArea) erst danach; kein Push, PR oder Merge ist
  bereits erfolgt.

## Paket 3 – Umsetzung und Nachweise (25.09.2026)

### Schema und Migrationen

- Neue PostgreSQL-Migration `20260925120000_remove_finance_module`: sie überführt
  zuerst `Task.area='finance'` datenerhaltend zu `personal`, baut dann den
  `TaskArea`-Typ ohne `finance` neu auf, entfernt `UserSettings.currencyCode`,
  die drei Finanzmodelle und die vier ausschließlich zugehörigen Finanz-Enums.
  Alle älteren Migrationen bleiben unverändert.
- Neue prüfsummengeschützte SQLite-Migration mit demselben Namen: kontrollierter
  Tabellenneubau von `Task` (Bereichs-CHECK ohne `finance`; alle Spalten, alle
  sechs Indizes einschließlich `Task_id_userId_key` und beide Tag-Trigger
  erhalten) und von `UserSettings` (ohne `currencyCode`), anschließend Entfernen
  der drei Finanztabellen. Der Runner prüft danach verpflichtend
  `foreign_key_check` und `integrity_check`.
- Zwei Migrationsmarker steuern den Rahmen: `requires-backup` (Pflicht zum
  Vor-Migrationsbackup) und `foreign-keys-off` (Tabellenneubau ohne
  kaskadierende Löschung, danach Fremdschlüsselprüfung).

### Backup-Schutz vor der destruktiven Migration

- PostgreSQL: `npm run db:migrate` läuft über `scripts/migrate-database.sh` und
  migriert eine bestehende Datenbank nur mit geprüftem Dump samt SHA-256; fehlt
  der Nachweis oder schlägt die Dumpprüfung fehl, bricht der Lauf ab. Frische
  Datenbanken migrieren ohne unnötiges Backup. Restore- und Stagingpfade
  übergeben ihren bereits geprüften Backup-Kontext ausdrücklich über
  `LIFEOS_MIGRATION_BACKUP`.
- SQLite und Mac-App: Der Sidecar erzeugt vor einer mit `requires-backup`
  markierten Migration automatisch ein vollständiges, geprüftes Backup aus
  Datenbank und Dokumenten in ein neues Ziel unterhalb von
  `SQLITE_BACKUP_PATH`. Ohne Backup-Ziel oder bei fehlgeschlagener Prüfung wird
  nicht migriert; frisch leere Installationen starten ohne Backup. Tauri legt
  dafür sein privates `backups`-Verzeichnis an und übergibt es an den Sidecar.
- Verbleibende Finanzdaten sind nur aus einem vor der Migration erstellten
  Backup in ein neues Ziel wiederherstellbar; ein App-Downgrade ist kein
  Rollback.

### Bereinigte aktive Verbraucher

PostgreSQL- und SQLite-Seeds samt synthetischer Fixture, Kompatibilitätsclient,
PostgreSQL-zu-SQLite-Import, Recovery-Snapshot, Sidecar- und Update-Nachweise,
Verträge, Aufgaben-API und Web-Hilfen setzen keine aktiven Finanzmodelle, keine
gespeicherte Währung und kein `TaskArea=finance` mehr voraus. Die alten
`/api/v1/finance`-Pfade bleiben als negative `404`-Prüfung bestehen.

### Nachweise

- Prisma-Validierung und Client-Generierung für PostgreSQL und SQLite.
- Frische PostgreSQL-Installation mit allen 22 Migrationen; frischer
  SQLite-Lauf mit allen 12 Migrationen und wiederholtem Migrationslauf.
- PostgreSQL-Upgrade aus einem über die echten alten Migrationen aufgebauten
  Vor-Paket-3-Stand mit Finanzdaten und `Task.area=finance`
  (`npm run db:verify:finance-removal`): Aufgabe wird `personal`, ihr übriger
  Datensatz sowie Projekt, Einstellungen und Dokument bleiben unverändert,
  Finanztabellen und Währungsfeld entfallen, `preserved_snapshot` ist identisch.
- Geprüfter Dump, Restore in eine neue Datenbank und anschließende Migration
  über `scripts/restore-database.sh` mit ausdrücklich übergebenem
  Backup-Kontext.
- SQLite: frische Installation ohne Backup, Upgrade mit automatisch erzeugtem
  und geprüftem Backup, Abbruch ohne Backup-Ziel sowie Akzeptanz und Ablehnung
  eines ausdrücklich übergebenen Backup-Kontexts.
- `npm run db:verify:recovery`, `npm run db:sqlite:test`,
  `npm run db:sqlite:verify:recovery`, `npm run test:sqlite:api`,
  `npm run verify:sqlite:api-runtime`, API-, Datenbank- und Web-Unit-Tests,
  Playwright für Desktop und Smartphone, `npm run desktop:verify:sidecar`,
  Update-/Rollback-Nachweis mit dem Basis-DMG aus `origin/develop`,
  `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run build`,
  `npm run test:repo`, `npm run security:secrets` und `git diff --check`.
- Leitfaden mit dem gebündelten Dokumenten-Renderer gerendert (26 Seiten);
  inhaltliche Prüfung der geänderten Passagen, visuelle Seitenprüfung bleibt
  mangels Bildanalyse-Werkzeug eingeschränkt.

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

| Paket                         | Status                               |
| ----------------------------- | ------------------------------------ |
| 0 Plan und Übergabe           | Integriert über PR #120              |
| 1 Einstellungen/Integrationen | Integriert über PR #121              |
| 2 Finanzfunktionen entfernen  | Integriert über PR #122              |
| 3 Finanzdatenmigration        | Lokal geprüft (Paket 3); PR/CI offen |
| 4 Aufgaben–Studienmodul       | Nicht begonnen                       |
| 5 Kalender/Planung            | Nicht begonnen                       |
| 6 Modul-Arbeitsbereich        | Nicht begonnen                       |
| 7 PDF-Suche                   | Nicht begonnen                       |
| 8 Office-Suche                | Nicht begonnen                       |
| 9 Aufgaben–CalDAV             | Nicht begonnen                       |
| 10 Mac/iPhone-Anbindung       | Nicht begonnen                       |
| 11 Gesamtabnahme/App-Update   | Nicht begonnen                       |

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
