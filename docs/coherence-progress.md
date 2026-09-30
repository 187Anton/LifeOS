# Kohärenzumbau: Fortschritt und nächste Übergabe

Stand: 29.09.2026 (Paket 9 lokal umgesetzt und geprüft; PR und Pflicht-CI stehen aus). Diese Datei ist eine Übergabe, kein Ersatz für Live-Prüfungen.
Plan: [coherence-implementation-plan.md](coherence-implementation-plan.md).

## Aktuelles Paket

- Paket: **9 – verwaltete Aufgaben-CalDAV-Abbildung** lokal umgesetzt, um die
  fünf Befunde der Korrekturrunde nachgezogen und um drei Restbefunde der
  Nachprüfung ergänzt. Stand:
  **254/254** API-Tests, **33/33** Datenbanktests, **94/94** Web-Unit-Tests in
  13 Dateien, **58/58** Playwright-E2E-Abläufe auf Desktop und Smartphone
  (29 je Projekt), dazu `typecheck`, `lint`, `format:check`, `repo:check`,
  `build`, `db:migrate`, `db:sqlite:validate` sowie `caldav:verify:lan` und
  `desktop:verify:sidecar` als synthetische Kalender- und Sidecar-Nachweise.
  `desktop:verify:sidecar` wurde für diesen Stand separat ausgeführt (Der
  LAN-Nachweis allein enthält nur `desktop:prepare`). Ein physischer
  Apple-Gerätetest wurde nicht behauptet und nicht ausgeführt.
  Die Einzelheiten je Befund stehen in den Abschnitten „Paket 9 –
  Korrekturrunde“ und „Paket 9 – Nachprüfung der Korrekturrunde“.
- Vorbedingung Paket 8: live geprüft. `origin/develop` steht auf `e01fe3c`
  (`feat(knowledge): lokale PPTX- und DOCX-Extraktion (#128)`), PR #128 ist
  gemergt und die Vorprüfung des Pakets ist damit im Zielstand enthalten. Der
  Branch dieser Runde `feat/coherence-task-caldav-bindings` ist auf genau
  dieser Basis angelegt; der lokale Hauptcheckout war detached und veraltet
  (`f37524d`) und blieb unverändert.
- Umsetzung: genau ein Worker für Umsetzung, Prüfung und Nachweise; keine
  Subagenten, keine zweite Schreibinstanz und kein paralleler Agent.
- Worktree: `/private/tmp/lifeos-coherence-task-caldav`; der Hauptcheckout
  `/Users/anton/Projekte/LifeOS` blieb unberührt. Eigener Compose-Betrieb
  (`-p lifeos-task-caldav`, PostgreSQL nur auf `127.0.0.1`) mit ausschließlich
  synthetischer Datenbank; die installierte App wurde nicht angefasst.
- Keine neue Abhängigkeit: `package.json` und `package-lock.json` blieben
  unverändert.
- Zwei additive Migrationen: `20260929120000_task_calendar_binding`
  (PostgreSQL) und `20260929120500_task_calendar_binding` (SQLite) legen
  ausschließlich die neue Tabelle mit Besitzer-, Aufgaben- und Ereignisbezug,
  Art, letztem bestätigten ETag und Eindeutigkeitsregeln an. Bestehende
  Tabellen, Zeilen und die freie `TaskEventLink`-Beziehung bleiben unverändert.
- Geänderter Umfang: neuer Bereich
  `apps/api/src/modules/task-calendar-bindings/` (`mapping.ts`,
  `repository.ts`, `service.ts`, `router.ts`), Einbindung in
  `modules/tasks/`, `modules/calendar/` und `modules/caldav/`, Verdrahtung in
  `server.ts`, Verträge in `packages/contracts/src/api.ts`, beide
  Prisma-Schemata, `sqlite-import.ts`, `sqlite-compatibility-client.ts`,
  Oberflächenkennzeichnung in Web (`api.ts`, `App.tsx`, `TaskForm.tsx`,
  `TaskWorkspace.tsx`, `CalendarWorkspace.tsx`, `styles.css`) sowie API-,
  Datenbank-, Web-Unit-, E2E- und Nachweisdateien.
- Nicht geändert: die Fachlogik von `task-event-links/`, die
  `external-caldav/`-Integration, Finanzmodule, Paket-10- und
  Paket-11-Funktionen sowie allgemeine Aufräumarbeiten.
- Offene Blocker: keiner.

## Paket 9 – verwaltete Aufgaben-CalDAV-Abbildung (29.09.2026)

### Ausgangsprüfung und Umfang

`gh`-frei über Git geprüft: `origin/develop` = `e01fe3c` aus PR #128
(Paket 8), Vorgänger `d4dc091` aus PR #127 (Paket 7). Der Branch dieser Runde
zweigt von `e01fe3c` ab; damit ist die geforderte Voraussetzung nachgewiesen
und nicht aus der Dokumentation übernommen. Rein additive Umsetzung ohne
Änderung bestehender Beziehungen, ohne automatische Umdeutung freier
Verknüpfungen und ohne externe CalDAV-Zugangsdaten.

### Datenmodell und Transaktion

`TaskCalendarBinding` trennt die verwaltete Abbildung ausdrücklich von der
freien `TaskEventLink`-Beziehung und speichert Besitzer, Aufgabe, Ereignis, Art
(`due`/`work_block`) und den zuletzt bestätigten ETag. Zusammengesetzte
Fremdschlüssel halten Besitzergrenzen; ein eindeutiger Schlüssel je Aufgabe und
Art erzwingt höchstens eine Frist und höchstens einen Arbeitsblock. Die UID
bleibt über Änderungen stabil und wird nicht aus Eingaben erfunden.

Aufgaben-, Kalender-, Beziehungs-, ETag-, `syncToken`- und Auditdaten werden in
derselben Transaktion geschrieben. Der Binding-Service ist der einzige
Schreibpfad für verwaltete Ereignisse; `TaskService`, `CalendarService` und der
CalDAV-Router reichen denselben Dienst in ihre Transaktion weiter. Ein
ETag-Konflikt beantwortet die API mit `412`, ein fehlender Primärkalender mit
`409`; in beiden Fällen rollt die gesamte Transaktion zurück.

### Verbindliche Abbildung

- Frist: ganztägiges Ereignis im persönlichen Primärkalender, Fälligkeitstag
  als Start und exklusives Ende am Folgetag.
- Arbeitsblock: zeitgebundenes Ereignis bei geplantem Start **mit** geschätzter
  Dauer; das Ende wird aus der Dauer berechnet, nicht erfunden.
- Titel: festes Präfix plus Aufgabentitel plus Statuskennzeichnung
  (` (erledigt)`/` (abgebrochen)`).
- Beschreibung: Aufgabenbeschreibung plus Markierungsblock mit
  Aufgabenkennung und Art.
- Erinnerungen: ausschließlich `DISPLAY`-Alarme und über CalDAV übernehmbar.
- Priorität, Projekt, Studium, Tags und weitere Aufgabenfelder bleiben unter
  Apple-Änderungen unverändert.
- Archivieren und Löschen der Aufgabe entfernen die verwalteten Abbildungen
  synchron; die Aufgabe selbst bleibt erhalten, wenn nur das Ereignis gelöscht
  wird.

### Bewusste Entscheidungen dieser Runde

- **„Start ohne Dauer“ wird als gezielte Startmarkierung abgebildet**
  (in der Korrekturrunde nachgezogen). Die Startmarkierung ist ein
  zeitgebundenes Ereignis mit `DTSTART` ohne `DTEND` und ohne `DURATION`; die
  eigene Spalte `isStartMarker` trennt sie eindeutig von allen anderen
  Zeitformen, und der Prüfpfad erlaubt diese Form nur für verwaltete
  Aufgabenereignisse. Die frühere Begründung dieser Runde bleibt als
  Zwischenstand erhalten: die bestehende Datenbankinvariante verlangt für
  zeitgebundene Ereignisse `endsAt > startsAt`; ein erfundenes Ende oder eine
  Dauer null wären eine erfundene Fachangabe gewesen.
- **Ein vom Client angefordertes `MOVE` wird weiterhin abgelehnt.** Für
  verwaltete Ereignisse geschieht der Kalenderwechsel als interner, atomarer
  Umzug beim Ausrichten der Abbildung; ein freies `MOVE` über CalDAV bleibt
  verboten.
- **Wiederkehrende verwaltete Ereignisse werden abgelehnt.** `RRULE` an einem
  verwalteten Ereignis führt zur atomaren Ablehnung ohne Teiländerung.
- **Kalender ohne Primärkalender.** Fehlt ein aktiver Primärkalender, wird die
  Zuordnung klar abgelehnt statt stillschweigend einen anderen Kalender zu
  wählen; das gilt auch für die Bestandsprüfung: `task-calendar-bindings/reconcile`
  wird ohne aktiven Primärkalender vollständig mit `409 CONFLICT` abgelehnt und
  verbindet, verschiebt oder löscht nichts. Ein aus dem Primärkalender
  gedriftetes verwaltetes Ereignis wird in den aktuellen Primärkalender
  überführt.
- **Apple-Änderungen sind feldweise begrenzt.** Titel mit gültigem Präfix und
  erlaubtem Statuswechsel sowie Erinnerungen sind zulässig; Zeiten, Zeitform,
  Zeitzone, Ort, Beschreibung, Titel ohne Präfix, unzulässiger Statuswechsel
  und `RRULE` werden ohne Teiländerung abgelehnt. Ohne `If-Match` antwortet der
  Server mit `428`.

### Nachweise dieser Runde

- `npm test --workspace @lifeos/api`: **246/246** grün (Baseline vor Paket 9:
  217/217). Neu: 15 Unit-Tests der Abbildungsregeln (Frist, Arbeitsblock,
  Zeitzonen, Sommerzeitwechsel, UID, Status, Erinnerungen, Beschreibung,
  Löschung, Ablehnungen) und 14 Integrationstests (Erstellen, Lesen, Ändern,
  Löschen über API und CalDAV, vollständiges `PUT`, Archivieren, Wiederöffnen,
  stabile UID, Duplikatfreiheit, ETag-Konflikt mit vollständigem Rollback,
  Bestandsprüfung, Besitzergrenzen, fehlender Primärkalender, konkurrierende
  Änderungen, Regression frei verknüpfter und wiederkehrender Ereignisse).
- `npm run db:test`: **33/33** grün, inklusive SQLite-Migrationspfad,
  Vor-Migrationsbackup sowie Transfer, Import, Backup, Restore und Recovery mit
  bestehender Aufgabe, bestehendem Ereignis, freier Verknüpfung und
  verwalteter Abbildung.
- `npm test --workspace @lifeos/web` (Vitest): **89/89** in 12 Dateien. Neu:
  getrennte Darstellung verwalteter und freier Verknüpfungen, Konflikt- und
  Fehleranzeigen, Hinweis zu „Start ohne Dauer“.
- Playwright-E2E auf Desktop und Smartphone: **54/54** grün (27 Abläufe je
  Projekt, 50 vor Paket 9). Neu sind zwei Abläufe zur getrennten Darstellung
  verwalteter und freier Verknüpfungen und zur Benennung fehlender Ereignisse
  sowie zu „Start ohne Dauer“.
- `npm run typecheck`, `npm run lint`, `npm run format:check`: grün.
- `npm run caldav:verify:lan`: grün. Der synthetische LAN-Nachweis deckt
  zusätzlich Fristabbildung, vollständiges `PUT`, Ablehnung einer nicht
  unterstützten Änderung, Arbeitsblock mit Dauer, Löschung über CalDAV und
  Löschung über die Aufgabe ab. Ein physischer Apple-Kalender-Test ist damit
  nicht ersetzt.
- `node scripts/verify-mac-desktop-sidecar.mjs`: grün nach Ergänzung der neuen
  SQLite-Migration in den Nachweislisten.

### Offene Risiken und bewusst unveränderte Punkte

- Ein physischer Apple-Kalender- und Gerätetest bleibt offen; der LAN-Nachweis
  prüft nur den eigenen Server über die Netzwerkschnittstelle.
- Beide Punkte dieser Liste sind in der Korrekturrunde vom 29.09.2026
  nachgezogen: „Start ohne Dauer“ ist als gezielte Startmarkierung abgebildet,
  und beim Überführen in den Primärkalender wird der alte Kalender mit einer
  nachvollziehbaren Entfernung samt fortgeschriebenem `syncToken` versehen.
  Ein physischer Apple-Gerätetest bleibt weiterhin offen.
- PR, Pflicht-CI und Merge nach `develop` stehen noch aus; diese Runde liefert
  den lokalen Nachweis, keine Release-Freigabe.
- Die Paket-8-Notizen dieser Datei bleiben als historischer Stand erhalten und
  sind nicht der aktuelle Git- und CI-Zustand.

## Paket 9 – Korrekturrunde (29.09.2026)

Auftrag: die Umsetzungskarte von Paket 9 vollständig einhalten. Die vorhandenen
Tests waren grün, deckten aber fünf konkrete Fehler nicht ab. Betroffene
Ursache, Korrektur und Nachweis je Fehler:

1. **Apple-Änderungen an verwalteten Ereignissen wurden falsch abgelehnt.**
   _Ursache:_ `reviewManagedEventChange` behandelte `DTSTART`, `DTEND` und die
   Fristdaten als grundsätzlich unveränderlich; jede Verschiebung oder
   Verlängerung lief in eine Ablehnung ohne Teiländerung. _Korrektur:_ Die
   feldweise Prüfung hängt jetzt von der Abbildungsart ab. Eine Frist (`due`)
   verlangt eine gültige ganztägige `DTSTART`/`DTEND`-Kombination mit genau
   einem Tag Abstand und übernimmt den neuen Fälligkeitstag in die Aufgabe; ein
   Arbeitsblock (`work_block`) übernimmt Start, Zeitzone und die aus
   `DTSTART`/`DTEND` berechnete Dauer in ganzen Minuten; fehlt `DTEND`, wird
   daraus die Startmarkierung ohne Dauer. Die jeweils andere Fachangabe bleibt
   unberührt, die Transaktion umfasst Aufgabe, Ereignis, Binding, ETag,
   Sync-Token und Audit. Abgelehnt werden weiterhin Ort, freie Beschreibung,
   ungültige UID, `RRULE`, Zeitform-Wechsel der Frist, `DURATION` ohne `DTEND`
   und unzulässige Statuswechsel; veraltete ETags bleiben 412, fehlendes
   `If-Match` bleibt 428. _Nachweis:_ `apps/api/tests/task-calendar-bindings.test.ts`
   (Verschiebung, Verlängerung, Zeitzonenwechsel, Sommerzeit, Startmarkierung
   aus Apple) und `task-calendar-bindings.integration.test.ts`
   (Fristverschiebung über CalDAV, Arbeitsblockverlängerung).

2. **Kalender- und Planungsansicht zeigten verwaltete Inhalte doppelt.**
   _Ursache:_ `apps/web/src/calendar-projection.ts` und
   `apps/api/src/modules/planning/service.ts` kannten die
   `TaskCalendarBinding`-Beziehung nicht und fügten Aufgabenprojektionen
   unabhängig vom vorhandenen verwalteten Ereignis hinzu. _Korrektur:_ Beide
   Projektionen verwenden dieselbe besitzgebundene Duplikatregel: eine aktive
   verwaltete Abbildung unterdrückt genau die dazugehörige Aufgabenprojektion
   und nur dann, wenn ihr Ereignis über den stabilen Schlüssel aus Besitzer,
   Kalender-ID und UID tatsächlich in derselben Ansicht geliefert wird. Fehlt
   das Ereignis, ist der Kalender nicht verfügbar oder liegt dieselbe UID in
   einem anderen Kalender, bleibt die Aufgabenprojektion sichtbar; freie
   `TaskEventLink`-Beziehungen bleiben unverändert. _Nachweis:_
   `apps/web/tests/unit/calendar-projection.test.ts` (aktive Abbildung,
   fehlendes Ereignis, fremder Kalender, Gegenprobe),
   `apps/api/tests/planning.test.ts` (fünf Fälle der Planning-API) und
   `apps/web/tests/e2e/lifeos.spec.ts` (genau eine Darstellung in Tag-, Wochen-,
   Monats- und Agendaansicht).

3. **Nach einer Apple-Änderung blieb die zweite verwaltete Abbildung
   veraltet.** _Ursache:_ `applyEventChange` aktualisierte nur das bearbeitete
   Ereignis und synchronisierte die Aufgabe danach nicht. _Korrektur:_ Nach der
   akzeptierten Änderung werden innerhalb derselben Transaktion die führenden
   Aufgabenfelder übernommen, die Erinnerungen des bearbeiteten Ereignisses
   geschrieben und anschließend über `synchronizeTask` beide verwalteten
   Abbildungen aus den Aufgabenfeldern neu berechnet. Beide UIDs bleiben stabil,
   es entstehen keine Duplikate, und ein Fehler bei einer der beiden Abbildungen
   rollt die vollständige Änderung zurück. _Nachweis:_
   `task-calendar-bindings.integration.test.ts` („führt nach einer
   Apple-Änderung beide verwalteten Abbildungen derselben Aufgabe nach“).

4. **Das Löschen eines verwalteten Ereignisses prüfte den ETag nicht atomar.**
   _Ursache:_ `removeEvent` verglich den erwarteten ETag nur vorab, das
   eigentliche Update filterte lediglich `deletedAt: null` und konnte eine
   gleichzeitige Änderung überschreiben. _Korrektur:_ Das Lösch-Update prüft
   jetzt Ereignis-ID, erwarteten ETag und `deletedAt: null` und verlangt
   `count === 1`; bei `count === 0` entsteht ein ETag-Konflikt und die
   Transaktion rollt vollständig zurück. _Nachweis:_
   `task-calendar-bindings.integration.test.ts` („verhindert beim Löschen das
   Überschreiben einer konkurrierenden ETag-Änderung“ – die Fremdänderung
   wartet zwischen Lesen und Schreiben auf der Zeilensperre).

5. **Beim Wechsel des Primärkalenders blieb das Ereignis im alten Kalender.**
   _Ursache:_ `writeManagedEvent` aktualisierte Felder, ETag, Sequence und
   Sync-Version, aber nie den Kalenderbezug; `alignBinding` erhöhte nur den
   Sync-Token des neuen Kalenders. _Korrektur:_ Ein Kalenderwechsel ist jetzt
   ein atomarer Umzug mit stabiler UID: der bisherige Datensatz bleibt im alten
   Kalender als nachvollziehbare Löschmarkierung stehen (neuer ETag,
   `sequence + 1`, fortgeschriebener Sync-Token des alten Kalenders), im neuen
   Primärkalender entsteht genau ein aktiver Datensatz derselben UID
   (vorhandene oder gelöschte Datensätze werden übernommen beziehungsweise
   wiederbelebt, nie verdoppelt). Das Binding verweist danach auf das Ereignis
   im neuen Kalender; Erinnerungen wandern mit. Die Bestandsprüfung richtet
   bestehende Abbildungen ebenfalls aus und meldet einen unbestätigten
   Fremdstand als Befund, statt zu raten. Ohne Primärkalender bleibt die klare
   Ablehnung. _Nachweis:_ `task-calendar-bindings.integration.test.ts`
   („überführt ein verwaltetes Ereignis beim Wechsel des Primärkalenders
   atomar in den neuen Kalender“ und „rollt einen Wechsel des Primärkalenders
   bei einer konkurrierenden Änderung vollständig zurück“).

6. **„Start ohne Dauer“ ist jetzt abgebildet.** _Ursache:_ Die vorige Runde
   lehnte den Fall ab, weil die Datenbankinvariante für zeitgebundene
   Ereignisse `endsAt > startsAt` verlangt. _Korrektur:_ Eine gezielt
   verwaltete Startmarkierung ist eine dritte, eindeutig unterschiedene
   Zeitform: `isAllDay = false`, `isStartMarker = true`, `startsAt` gesetzt,
   `endsAt` leer. Der Check-Constraint wurde nicht aufgeweicht, sondern um eine
   ausschließlich für dieses Flag gültige Zeilenform erweitert; alle anderen
   Ereignisse behalten die bisherige Invariante. Für die Erweiterung nötig:
   PostgreSQL-Migration `20260929140000_calendar_event_start_marker`
   (Spalte plus gezielter Constraint-Zweig) und SQLite-Migration
   `20260929140500_calendar_event_start_marker` (kontrollierte Tabellen-
   neuanlage mit den Markern `requires-backup` und `foreign-keys-off`). Der
   iCalendar-Parser nimmt `DTSTART` ohne `DTEND` nur über den verwalteten Pfad
   an, die Serialisierung erzeugt dann genau `DTSTART` ohne `DTEND` und ohne
   `DURATION`, und ein `DURATION`-Feld wird klar abgelehnt, statt eine genannte
   Dauer stillschweigend zu verwerfen. Die Aufgabe bleibt führend: aus dem
   Ereignis werden Start und Zeitzone übernommen, eine Dauer entsteht erst mit
   `DTEND`, und beim Löschen der Startmarkierung wird nur der geplante Start
   entfernt. _Nachweis:_ `task-calendar-bindings.test.ts`,
   `task-calendar-bindings.integration.test.ts` („bildet ‚Start ohne Dauer‘ als
   sichtbare Startmarkierung ohne erfundenes Ende ab“ mit
   Apple-kompatibler Abfrage) und der synthetische LAN-Nachweis
   `npm run caldav:verify:lan` (Startmarkierung, Verlängerung,
   `DURATION:PT0S` abgelehnt, Löschung).

7. **Die Bestandsprüfung konnte ohne Primärkalender stillschweigend einen
   fremden Kalender verwenden.** _Ursache:_ `reconcile` ermittelte den
   persönlichen Primärkalender nur für die Sortierung. Fehlte er, konnte die
   Schleife eine vorhandene markierte Abbildung trotzdem verbinden; der Kalender
   des Ereignisses wurde damit faktisch als Ersatz gewählt. _Korrektur:_
   `reconcile` ermittelt den Primärkalender zuerst und lehnt ohne aktiven
   persönlichen Primärkalender vollständig ab (`MissingPrimaryCalendarError` →
   `409 CONFLICT` mit klarer Meldung). Es entsteht kein `TaskCalendarBinding`,
   das Ereignis bleibt in Kalender, UID, ETag, Sync-Token und Zeitstempel
   unangetastet, es entsteht keine erfolgreiche Wieder-Verbindungs-Auditspur,
   und ein sekundärer oder beliebiger anderer Kalender wird nie als Ersatz
   gewählt. Mit vorhandenem Primärkalender ist das Verhalten unverändert.
   _Nachweis:_ neuer Integrationstest „lehnt die Bestandsprüfung ohne aktiven
   persönlichen Primärkalender vollständig ab“ (markiertes Ereignis im
   Zweitkalender, Aufgabe ohne aktiven Primärkalender: `409`, kein Binding,
   Ereignis und Kalender unverändert, keine Auditspur) und der angepasste zweite
   Teil von „repariert fehlende Abbildungen über die Bestandsprüfung, ohne zu
   erfinden“ (ohne Primärkalender wird auch eine vorhandene Abbildung nicht mehr
   nachgeführt). Ein Wegwerf-Nachweis gegen den ungeprüften Stand zeigte den
   Fehler direkt: `reconnected: 1` und ein Binding auf dem Zweitkalender bei
   null aktiven Primärkalendern.

**Paketgrenzen dieser Runde.** Geändert wurden ausschließlich Dateien des
Pakets 9 sowie die in der Korrektur ausdrücklich benannten Projektionen
(`apps/api/src/modules/planning/{service,repository}.ts`,
`apps/web/src/calendar-projection.ts`, `apps/web/src/calendar-view.ts`) samt
ihren Tests und der Dokumentation. `apps/api/src/modules/external-caldav/`,
`task-event-links/`, die Finanzmodule, die installierte App und die
Paket-10-/Paket-11-Funktionen blieben unberührt; `package.json` und
`package-lock.json` sind unverändert, es entstand keine neue Abhängigkeit.
Kein PR und kein Merge in dieser Runde.

**Nachweise dieser Runde.** `npm test --workspace @lifeos/api`: **253/253**
(16 Unit- und 19 Integrationstests allein für die verwaltete Abbildung; neu:
Fristverschiebung, Arbeitsblockverlängerung, gemeinsame Synchronisierung beider
Abbildungen, atomarer ETag-Schutz beim Löschen, atomarer Kalenderwechsel mit
Rollback, gezielte Startmarkierung, vollständige Ablehnung der Bestandsprüfung
ohne aktiven Primärkalender). `npm run db:test`: **33/33** (SQLite-
Migrationspfad mit 16 versionierten Migrationen, Vor-Migrationsbackup, Transfer
mit Startmarkierung, Backup, Restore, Recovery). Web-Unit: **90/90** in 12
Dateien. Playwright: **56/56** über Desktop und Smartphone, darunter der neue
Ablauf „genau eine Darstellung je fachlicher Bedeutung“ in Tag-, Wochen-,
Monats- und Agendaansicht. `npm run typecheck`, `npm run lint`,
`npm run format:check`, `npm run repo:check`, `npm run db:sqlite:validate` und
`npm run caldav:verify:lan`: grün. `db:migrate` hat die neue
PostgreSQL-Migration `20260929140000_calendar_event_start_marker` auf die
synthetische Entwicklungsdatenbank angewendet.

**Offen.** Ein physischer Apple-Kalender- und Gerätetest bleibt offen; der
LAN-Nachweis prüft weiterhin nur den eigenen Server über die
Netzwerkschnittstelle. Das Bearbeitungsformular für Kalenderereignisse ist auf
Frist und Zeitblock ausgelegt: eine Startmarkierung wird dort nicht in eine
Dauer umgedreht, sondern mit einer klaren Meldung abgelehnt; gepflegt wird sie
über die Aufgabe.

## Paket 9 – Nachprüfung der Korrekturrunde (30.09.2026)

Drei Restbefunde aus der Nachprüfung der Korrekturrunde sind nachgezogen. Die
Änderungen sind rein additiv; die Paketgrenzen bleiben unberührt
(`task-event-links`, `external-caldav`, Finanzmodule, Paket 10, Paket 11; keine
neue Abhängigkeit, kein Reset bestehender Änderungen).

- **Befund 8 – die Bestandsprüfung verband ein Ereignis im falschen Kalender.**
  `reconcile` ermittelte den persönlichen Primärkalender nur für die Sortierung.
  Die Schleife konnte ein ungebundenes, markiertes Ereignis auch dann wieder
  verbinden, wenn es ausschließlich im Zweitkalender lag; dadurch konnte eine
  fremde oder veraltete Kopie als führendes Ereignis gelten. Korrektur: Vor jedem
  automatischen Verbinden wird geprüft, dass das Ereignis im aktuellen
  persönlichen Primärkalender liegt. Andernfalls wird der Fall als mehrdeutig
  gemeldet und das Ereignis bleibt vollständig unangetastet – kein
  `TaskCalendarBinding`, keine Verschiebung, keine Löschung, keine
  Reconnect-Auditspur. Ein bereits eindeutig gebundenes Ereignis wird weiterhin
  atomar in den neuen Primärkalender überführt. Nachweis: neuer
  Integrationstest (aktiver Primär- und Zweitkalender, markiertes Ereignis nur im
  Zweitkalender, kein vorhandenes Binding) mit `reconnected === 0`, mehrdeutiger
  Meldung und unverändertem Ereignis einschließlich UID, ETag, Sync-Token,
  Zeitform, Erinnerungen und Kalenderzugehörigkeit. Gegenprobe: mit ausgegebauter
  Kalenderprüfung meldet derselbe Test `reconnected: 1` und legt die Bindung im
  Zweitkalender an.
- **Befund 9 – eine Startmarkierung wurde im Termineditor zum Zeitblock.** Der
  allgemeine Termineditor ersetzte ein fehlendes Ende durch die nächste volle
  Stunde. Ein unverändertes Öffnen und Speichern erzeugte dadurch eine Dauer und
  schrieb eine andere Zeitform. Korrektur: Kalender- und Planungsansicht führen
  eine aktive verwaltete Startmarkierung in den zugehörigen Aufgabeneditor;
  verglichen wird die öffentliche Identität aus Kalenderkennung und UID, nie die
  reine UID über mehrere Kalender hinweg. Wird der Termineditor doch direkt mit
  einer Startmarkierung aufgerufen, zeigt er eine klare Schreibschutzmeldung,
  bleibt vollständig gesperrt und verhindert das Speichern. `DTSTART` ohne `DTEND`
  wird in keinem Fall in einen Zeitblock umgewandelt; Fristen, echte Zeitblöcke
  und gewöhnliche Termine behalten ihr Bearbeitungsverhalten. Nachweis:
  Web-Unit-Tests für den Editor (Schreibschutz, kein erfundenes Ende, weiterhin
  bearbeitbare Zeitblöcke und Fristen) und ein Playwright-Ablauf auf Desktop und
  Smartphone (genau eine Darstellung, Bearbeiten öffnet den Aufgabeneditor, ein
  unverändertes Speichern sendet `estimatedDurationMinutes: null` und schreibt
  kein Kalenderereignis). Die gemeinsame Kalenderprojektion klassifiziert das
  verwaltete Markerereignis zusätzlich als `start_marker`, damit die sichtbare
  Beschriftung „Start ohne Dauer“ erhalten bleibt; gewöhnliche Ereignisse
  bleiben `fixed_event`/„Fester Termin“. Gegenprobe: ohne den Aufrufpfad scheitert derselbe
  Ablauf, weil der Termineditor mit erfundenem Ende (`11:00`) erscheint. Die
  entsprechende Aussage der Korrekturrunde („wird dort nicht in eine Dauer
  umgedreht“) trifft damit erst für diesen Stand vollständig zu.
- **Befund 10 – die Nachweise waren widersprüchlich.** Der Kopf des Dokuments
  nannte 252/252 API-Tests, während der belegte Lauf 253/253 meldete; außerdem war
  `desktop:verify:sidecar` als Nachweis aufgeführt, obwohl im LAN-Nachweis nur
  `desktop:prepare` läuft. Korrektur: Die Zahlen im Kopf sind auf die
  tatsächlichen Läufe dieses Stands gesetzt, `desktop:verify:sidecar` wurde
  separat ausgeführt, und nur Prüfungen mit belegbarem Lauf sind als grün
  dokumentiert.

### Nachweise der Nachprüfung (30.09.2026)

- `npm test --workspace @lifeos/api`: **254/254** grün (253 vor dieser Runde; die
  Abbildung umfasst 16 Unit- und 20 Integrationstests).
- `npm run db:test`: **33/33** grün.
- `npm test --workspace @lifeos/web`: **94/94** Web-Unit-Tests in 13 Dateien und
  **58/58** Playwright-Abläufe (29 je Projekt).
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`,
  `npm run repo:check`, `npm run db:migrate`, `npm run db:sqlite:validate`:
  grün.
- `npm run caldav:verify:lan`: grün (enthält `desktop:prepare`).
- `npm run desktop:verify:sidecar`: separat ausgeführt, **exit 0**. Der
  synthetische Sidecar-Nachweis meldet: gebündelter Sidecar mit Node 22.23.2,
  synthetische 0.6-Produktdemo ohne aktive Finanzroute (acht alte Finanzpfade
  mit `404 NOT_FOUND`), zweimaliger Start ohne Homebrew-Pfad, empfangene Fach-
  und Kalenderidentitäten sowie Migration eines Vor-Paket-3-Stands erst nach
  geprüftem Vor-Migrationsbackup.
- Die im Abschnitt „Paket 9 – Korrekturrunde“ genannten 253/253 API-Tests
  beschreiben den Stand vor dieser Nachprüfung.
- **Offen.** Ein physischer Apple-Gerätetest (Signierung, Installation und
  echtes Gerät) wurde nicht ausgeführt und wird nicht behauptet.

## Paket 8 – Stand dieser Runde (27.09.2026)

- Paket: **8 – PPTX- und DOCX-Extraktion** lokal umgesetzt, geprüft und um die
  Abnahmekorrektur ergänzt (begrenzter Workerlauf mit harter Frist). Stand dieser
  Runde: **217/217** API-Tests (211 vor der Korrektur, 150 vor Paket 8),
  **33/33** Datenbanktests, **19/19** Repo-Tests, **85/85** Web-Unit-Tests in
  11 Dateien und **50/50** Playwright-E2E-Abläufe auf Desktop und Smartphone für
  Upload, erneute Verarbeitung, Folien- und Absatzfundstellen, Modulsuche,
  Widerruf und Löschung. Dazu `typecheck`, `lint`, `format:check`, `build`,
  `repo:check`, `security:secrets` und `desktop:verify:sidecar`. PR #128 ist zum
  Zeitpunkt dieses Snapshots gegen `develop` offen; der erste Pflichtlauf auf
  Head `2204b6d` bestand `Local macOS release`, aber `Repository checks` scheiterte
  im mobilen PDF-/DOCX-E2E-Klick auf „Lokal ablegen“. Die CI-Korrektur und ihre
  lokalen Nachweise stehen im folgenden Abschnitt. Ein Merge war zu diesem
  Snapshot noch nicht erfolgt. Inzwischen ist PR #128 gemergt; `develop` steht
  auf `e01fe3c`.
- Vorbedingung Paket 7: live geprüft. `gh pr view 127` meldet **MERGED** mit
  Merge-Commit `d4dc091` (`feat(knowledge): add local PDF text extraction`) als
  Spitze von `origin/develop`; beide Pflichtchecks des Merge-Commits sind
  `SUCCESS`, weitere Paket-PRs sind offen nicht vorhanden. Der Branch dieser
  Runde ist auf genau dieser Basis `d4dc091` angelegt.
- Umsetzung: genau ein Worker für Umsetzung, Prüfung und Nachweise; keine
  Subagenten, keine zweite Schreibinstanz und kein paralleler Agent.
- Worktree: `/private/tmp/lifeos-coherence-office-extraction`; der Hauptcheckout
  `/Users/anton/Projekte/LifeOS` blieb unverändert.
- Persönliche Daten: Antons Entwicklungsdatenbank blieb unberührt. Der lokale
  Compose-Container dieses Worktrees band PostgreSQL an `127.0.0.1` auf einem
  eigenen Port (`5437`) mit eigener, nur synthetisch befüllter Datenbank;
  Migrationen und Tests liefen ausschließlich gegen synthetische Werte. Die
  installierte App wurde nicht angefasst.
- Keine neue Abhängigkeit: `apps/api/package.json` und `package-lock.json`
  blieben unverändert. Der ZIP-Leser ist selbst geschrieben und nutzt
  ausschließlich `node:zlib` (`inflateRawSync`, `crc32`); XML wird mit dem
  bereits vorhandenen `fast-xml-parser` gelesen. Damit entsteht weder ein
  natives Zusatzruntime noch ein Lizenz- oder Sidecar-Konflikt.
- Keine Migration und keine Schemaänderung: Die Paket-7-Spalten
  `extractionPages` (JSON) und `extractionPageCount` bleiben unverändert und
  wurden additiv verallgemeinert. `extractionPages` nimmt jetzt auch
  `{slide,text}` und `{paragraph,section,text}` auf; `extractionPageCount` zählt
  die Einheiten des Formats (Seiten, Folien oder Absätze). Der Vertrag benennt
  die Bedeutung über `locatorKind`/`locatorCount`, während `pageCount`
  ausschließlich für seitenbasierte Formate gefüllt wird. Für PPTX und DOCX ist
  `pageCount` deshalb `null`; eine Folie oder ein Absatz wird nie als Seite
  ausgegeben.
- Geänderter Umfang: der lokale OOXML-Extractor (`ooxml-extraction-limits.ts`,
  `ooxml-zip.ts`, `ooxml-extractor.ts`), der begrenzte Workerlauf
  (`ooxml-extractor-thread.ts`, `ooxml-extractor-worker.ts`, die beiden
  Quelldateien `ooxml-source-loader.mjs`/`ooxml-source-resolver.mjs` und die
  Workerdatei als eigener Einstiegspunkt in `tsup.config.ts` und
  `tsup.desktop.config.ts`), der tolerante, rückwärtskompatible
  Locator-Leser (`document-locators.ts`), der Upload- und Reprocess-Pfad in
  `apps/api/src/modules/knowledge/`, die folien- und absatzbezogene Suche in
  `apps/api/src/modules/search/`, die Fundstellenverträge in
  `packages/contracts/src/api.ts`, die Fundstellenbeschriftung in
  `apps/web/src/components/KnowledgeWorkspace.tsx` sowie die zugehörigen
  API-, Web-Unit- und E2E-Nachweise.
- Nicht geändert: CalDAV-Server, Apple-Integration, KI-Funktionen, Fixture- und
  Seed-Bestände, ein zweiter Dokumentenspeicher, ein persistierter Suchindex,
  OCR, Bilderkennung, Audio-, Excel- und Makroverarbeitung sowie alle
  Paket-9+-Arbeiten. `LifeOS Leitfaden.docx` blieb unverändert; damit war keine
  DOCX-Renderprüfung nötig (siehe „Offene Punkte“).
- Offene Blocker: keiner.

### Umgebungsbefund dieser Runde (nicht Paket 8)

`npm run desktop:verify:sidecar` scheiterte zunächst mit
`ERR_DLOPEN_FAILED`: Die native Erweiterung `better_sqlite3.node` lag mit
`NODE_MODULE_VERSION 147` vor, während die gebündelte Node-Laufzeit `v22.23.2`
`NODE_MODULE_VERSION 127` verlangt. Ursache war die Installation dieses
Worktrees: Das `npm ci` dieser Runde lief unter **Node v26.10.0** (das Protokoll
enthält dazu die `EBADENGINE`-Warnung `required: { node: '>=22 <23' },
current: { node: 'v26.10.0' }`), sodass `prebuild-install` eine
ABI-147-Vorübersetzung einspielte. Die ausgelieferte Sidecar-Laufzeit ist
dagegen Node 22. Damit ist der Befund ein Ablauf- und Umgebungsfehler dieser
Runde und keine Eigenschaft des Repositorys. Nach lokalem
`npm rebuild better-sqlite3` unter Node 22 lief der Nachweis vollständig durch.
Vorbedingung für jede Wiederholung: Abhängigkeiten ausschließlich mit Node 22
installieren (`engines: >=22 <23`), sonst ist derselbe Vorbefund zu erwarten.

### Offene Punkte und Entscheidungen dieser Runde

- Beim ursprünglichen Umsetzungssnapshot waren PR und Push nicht beauftragt;
  danach wurde PR #128 auf ausdrücklichen Nutzerauftrag eröffnet.
- `LifeOS Leitfaden.docx` wurde bewusst nicht geändert. Die Produktbeschreibung
  in Abschnitt 5.10 nennt bereits „Dokumente und Anhänge“ und „Volltextsuche“;
  PPTX und DOCX sind Dokumente und fügen keine neue Funktionskategorie hinzu.
  Der dortige Absatz „Umsetzungsstand“ ist ausdrücklich datiert und
  paketbenannt und wurde bereits von Paket 7 nicht fortgeschrieben.
- Dieses Umfeld besitzt keinen Renderer für DOCX (kein LibreOffice, kein
  pandoc) und kein Bildwerkzeug; eine geänderte DOCX-Datei hätte daher nicht
  „vollständig visuell geprüft“ werden können. Deshalb wurde die Änderung nicht
  vorgenommen, statt eine nicht prüfbare Fassung abzugeben. Soll die
  Produktbeschreibung dennoch fortgeschrieben werden, ist das auf einem
  Rechner mit Renderer nachzuholen.

## Paket 8 – lokale Nachweise (27.09.2026)

### Ausgangsprüfung

Paket 7 war harte Vorgängerabhängigkeit und ist live bestätigt: PR #127 ist
`MERGED`, der Merge-Commit `d4dc091` ist Spitze von `origin/develop`, und beide
Pflichtchecks sind `SUCCESS`. Ein fehlender Extraktions- oder Fundstellenpfad
hätte zum Abbruch geführt; er lag vor, deshalb wurde umgesetzt.

### Sicherheitsgrenzen der ZIP-Verarbeitung

Alle Grenzen greifen aus dem zentralen Verzeichnis, also **bevor** ein Eintrag
entpackt wird: 4 000 Einträge, 25 MiB komprimiert, 128 MiB je Eintrag entpackt,
256 MiB gesamt entpackt, ein Kompressionsverhältnis von höchstens 1 000, 16 MiB
je geparstem XML-Teil, 32 MiB XML gesamt, 1 000 veröffentlichte Fundstellen,
1 000 000 Byte Text, 512 MiB harte Speichergrenze des Workers und 20 s Laufzeit
(hart durchgesetzt, siehe Korrektur unten). Abgewiesen werden Pfadtraversal,
absolute Pfade, doppelte Einträge, Symlinks, verschlüsselte Einträge,
beschädigte Archive und Pakete ohne `[Content_Types].xml`.

### Fundstellen

PPTX wird über die Beziehungsreihenfolge der Präsentation nummeriert; ein
`slide10.xml` vor `slide2.xml` ändert die Nummerierung nicht. Gelesen wird nur
sichtbarer Folientext. DOCX wird in Dokumentreihenfolge gelesen; die
Absatznummer ist stabil, zählt leere Absätze mit und trägt die erkennbare
Überschrift als Abschnitt. Header, Footer, Fußnoten und Kommentare wurden nicht
stillschweigend ergänzt. Für DOCX wird keine Seitenzahl ermittelt.

### Abwehr von Makros und externen Zielen

`.pptm`, `.docm`, `vbaProject.bin` und ein Inhaltstypdatensatz, der Makroinhalte
ankündigt, führen zu `unsupported` mit `errorCode: "macro_present"`, ohne dass
ein Archivteil gelesen wird. DTD- und Entity-Angaben werden abgelehnt.
Externe Beziehungen werden ignoriert; es findet kein Netzwerkzugriff statt.

### Nachweise

| Nachweis                              | Ergebnis | Vorher |
| ------------------------------------- | -------- | ------ |
| `npm test` (Repo + alle Workspaces)   | grün     | grün   |
| API-Tests (`tests/*.test.ts`)         | 217      | 211    |
| Datenbanktests                        | 33       | 33     |
| Repo-Tests                            | 19       | 19     |
| Web-Unit-Tests (11 Dateien)           | 85       | 85     |
| Playwright-E2E (Desktop + Smartphone) | 50       | 50     |
| `npm run typecheck`                   | grün     | grün   |
| `npm run lint`                        | grün     | grün   |
| `npm run format:check`                | grün     | grün   |
| `npm run build`                       | grün     | grün   |
| `npm run repo:check`                  | grün     | grün   |
| `npm run security:secrets`            | grün     | grün   |
| `npm run desktop:verify:sidecar`      | grün     | grün   |

### Abnahmebefund und Korrektur (27.09.2026)

**Befund:** Die PPTX-/DOCX-Extraktion lief synchron im API-Prozess. Der
vorhandene Begrenzer verschob synchrone Arbeit nicht in einen Worker;
ZIP-Entpacken und XML-Parsing konnten deshalb den Event-Loop blockieren, und die
kooperative 20-Sekunden-Frist konnte diese Arbeit nicht hart abbrechen. Der
Befund ist zutreffend: Die Frist wurde zwischen Arbeitsschritten geprüft, eine
einzelne blockierende Operation war damit nicht abbruchfähig, und der
Archivleser samt XML-Parser lief im Prozess, der auch Anfragen bedient.

**Korrektur:** Die Verarbeitung läuft jetzt in einem eigenen, begrenzten
Worker-Thread (`ooxml-extractor-thread.ts`), der ausschließlich Text liest und
keinen Netzwerk-, Makro- oder Renderpfad enthält. Die begrenzende Schicht
(`ooxml-extractor-worker.ts`) startet ihn mit harter V8-Speichergrenze, setzt
die Frist **im aufrufenden Prozess** durch, beendet den Thread bei Ablauf und
meldet erst danach `failed` mit `errorCode: "timeout"`. Der gemeinsame
Begrenzer bleibt unverändert zuständig; ein Platz wird erst nach dem
tatsächlichen Threadende freigegeben, beobachtbar über den Zähler
`ooxmlExtractorThreadsInUse()`.

Einzelheiten der Korrektur:

- **Harte Frist statt kooperativer Prüfung:** Der Thread wird bei Ablauf beendet
  und seine Beendigung abgewartet; erst dann entsteht das Ergebnis und erst dann
  wird der Begrenzungsplatz freigegeben. Timer, Thread und Platz werden in jedem
  Ausgang – Ergebnis, Fehler, Abbruch, Zeitüberschreitung – freigegeben.
- **Speicher:** Der OOXML-Worker erhält 512 MiB als harte V8-Obergrenze (der
  PDF-Worker bleibt bei 256 MiB). Grund: Im Thread liegen zusätzlich zu den
  geparsten XML-Objektbäumen die entpackten Teile und ein Entpackpuffer; ein
  einzelner Teil von 16 MiB wächst beim Parsen deutlich über seine Bytegröße
  hinaus. Die Archivgrenzen greifen vor jedem Entpacken und begrenzen den
  Spitzenbedarf nach oben. Wird die Grenze erreicht, endet genau dieser Lauf als
  `failed`/`memory_limit`; der API-Prozess bleibt arbeitsfähig.
- **Vertrag unverändert:** Der Fehlerzustand `timeout` bleibt derselbe wie im
  Vertrag beschrieben (`failed`, `errorCode: "timeout"`, keine Fundstellen).
  Hinzu kommen ausschließlich zwei benannte Fehlercodes derselben Form:
  `memory_limit` und `worker_unavailable`. Keine Schemaänderung, keine
  Migration, keine Vertragsänderung an Fundstellen oder Suchfreigaben.
- **Laufzeitpaket:** Die Workerdatei ist ein eigener Einstiegspunkt des Builds
  (`tsup.config.ts`, `tsup.desktop.config.ts`) und liegt im gebündelten Paket
  unter `modules/knowledge/ooxml-extractor-thread.js`. Ein fehlendes Paket führt
  zu einem sichtbaren `failed`/`worker_unavailable` statt zu stiller
  Verarbeitung im API-Prozess.
- **Quellbetrieb:** Worker-Threads erben die Auflösung des Entwicklungsstarters
  nicht, und Node leitet aus `.js`-Spezifizierern keine `.ts`-Dateien ab. Im
  Quellbetrieb startet der Worker deshalb mit `--experimental-transform-types`
  und einem kleinen Resolver (`ooxml-source-loader.mjs`,
  `ooxml-source-resolver.mjs`); im gebündelten Laufzeitpaket entfällt beides.

**Tatsächliche Ergebnisse der Korrektur:**

| Prüfung                                                     | Ergebnis                                                                                                                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Worker-Unit-Tests (`tests/ooxml-extraction-worker.test.ts`) | 5/5 grün                                                                                                                                                           |
| API-Tests gesamt (`tests/*.test.ts`)                        | 217/217 grün (211 vor der Korrektur)                                                                                                                               |
| Office-Integrationstest (PPTX/DOCX, Fundstellen, Grenzen)   | 3/3 grün (2 vor der Korrektur)                                                                                                                                     |
| Parallele API-Anfrage während eines echten Uploads          | grün: `GET /knowledge` antwortet mit `200`, während der Worker läuft und der Upload noch offen ist                                                                 |
| Zeitüberschreitung                                          | grün: aus der gemessenen Arbeit abgeleitete Frist (mindestens 25 ms, hier rund 50 ms) gegen ~500 ms Arbeit → `failed`/`timeout`, danach 0 Threads und freier Platz |
| Speichergrenze                                              | grün: 16 MiB Grenze → `failed`/`memory_limit`, Prozess und Platz bleiben nutzbar                                                                                   |
| Ablehnung ohne ZIP-Kennung                                  | grün: `invalid_zip` ohne Threadstart                                                                                                                               |
| Beschädigtes Archiv im Worker                               | grün: `damaged_zip`, Platz danach frei                                                                                                                             |
| Gebündelte Workerdatei                                      | im Build-Ausgabe `dist/modules/knowledge/ooxml-extractor-thread.js` vorhanden und direkt ladbar; Ergebnis identisch zum Kern                                       |

**Verbleibende Risiken:**

- **PDF-Workerdatei fehlt im Build (Paket 7, nicht Teil dieses Auftrags):**
  `resolvePdfExtractorWorkerFile()` erwartet eine Datei, die kein
  Build-Einstiegspunkt erzeugt. Im Ausgabeordner existiert keiner der drei
  Kandidaten; ein PDF-Upload im gebündelten Laufzeitpaket endet dadurch als
  `failed`/`worker_unavailable`, während er im Quellbetrieb funktioniert. Der
  Fehler ist nicht Teil von Paket 8 und wurde hier nicht geändert; die Korrektur
  wäre derselbe eine Eintrag in beiden Build-Konfigurationen. Belegt ist die
  Abwesenheit der Datei und der Auflösungsfehler im Quelltext, nicht ein
  Laufzeitversuch im Paket.
- **`--experimental-transform-types`** betrifft nur den Quellbetrieb. Ändert
  Node das Flag, bricht der Workerlauf im Quellbetrieb sichtbar als
  `worker_unavailable` ab; Tests würden das sofort zeigen.
- **Frist und Speichergrenze sind Prozessgrenzen, keine Zeitgarantie:** Eine
  Zeitüberschreitung beendet den Thread hart, sie verkürzt aber nicht die
  Laufzeit anderer, bereits laufender Verarbeitungen. Zwei gleichzeitige
  Verarbeitungen bleiben möglich und sind gewollt begrenzt.
- **Messen statt annehmen:** Die Überlappungsnachweise beruhen auf einer
  bewusst großen Vorlage (120 000 Absätze, ~500 ms Arbeit). Auf deutlich
  schnellerer Hardware bleibt der Abstand zwischen Antwortzeit und Arbeit groß
  genug, weil die Zusicherung auf der Reihenfolge beruht, nicht auf einer
  festen Millisekundengrenze.

## Paket 8 – CI-Korrektur (27.09.2026; Übergabe-Snapshot vor Commit)

Der erste Pflichtlauf von PR #128 auf Head `2204b6d` scheiterte im einzigen
roten Test: `mobile-chrome` überschritt bei `apps/web/tests/e2e/lifeos.spec.ts`
beim Klick auf den DOCX-Upload-Button das 30-Sekunden-Limit. Der GitHub-Trace
zeigte wechselnde Trefferziele: erst das Upload-Formular, dann die am unteren
Rand fixierte mobile Navigation. API-, Unit- und Datenbanktests waren grün;
`Local macOS release` war ebenfalls erfolgreich. Es war kein Extraktionsfehler;
der Upload-Klick kam nicht bis zum Handler.

Der mobile Upload-CTA erhält deshalb `scroll-margin-block-end` für die Höhe der
fixierten Navigation einschließlich `safe-area-inset-bottom`. Nur dieses
Scrollziel wird oberhalb der Navigation ausgerichtet; Klicks auf die mobile
Navigation behalten ihr bisheriges Scrollverhalten. Diese gezielte Korrektur
wurde im Worktree bereits vor diesem Eintrag geprüft:

- der vorhandene mobile PDF-/PPTX-/DOCX-Ablauf: **8/8** Durchläufe mit zwei
  parallelen Playwright-Workern;
- vollständige Desktop-/Mobil-E2E-Suite: **50/50** bestanden;
- `git diff --check`: bestanden.

Der lokale Einzelaufruf vor der ersten Korrektur war zwar grün; die wiederholte
Prüfung und der vollständige E2E-Lauf nach der gezielten Korrektur sind die
aussagekräftigen lokalen Nachweise. Die neue CI hat danach einen globalen
Navigationsklick-Fehler gezeigt; deshalb ist die Korrektur auf den Upload-CTA
eingegrenzt und muss erneut auf dem aktuellen PR-Head geprüft werden.

### Zweite Pflichtlaufdiagnose (27.09.2026)

`Repository checks` in Lauf #208 auf Head `1dc90ff` scheiterte nach 49/50
E2E-Abläufen beim erneuten Wechsel von „Wissen“ nach „Studium“. Der Locator
fand den Tab, Playwright meldete aber ein Suchergebnis als Trefferziel. Eine
lokale Geometriemessung zeigte die Ursache: Der horizontale Mobile-Menüstreifen
war nach dem vorherigen Wechsel zu „Wissen“ nach rechts gescrollt; der
Studium-Tab lag bei `x=-215` außerhalb des sichtbaren Ausschnitts. Das ist kein
Extraktionsfehler und verlangt keine Änderung am Produktverhalten. Der
gemeinsame E2E-Navigationshelfer scrollt den Ziel-Tab vor dem Klick explizit in
den sichtbaren Bereich des mobilen Menüs.

Nach dieser Korrektur bestanden der betroffene mobile Test **10/10** Mal, die
vollständige Desktop-/Mobil-E2E-Suite **50/50** und `npm run format:check`.
Der erste Testhelfer-Ansatz mit `scrollIntoView` allein reichte im zweiten CI-
Lauf #209 dennoch nicht aus: derselbe Klick scheiterte erneut auf Head
`491e048`. Die präzisere Korrektur setzt `scrollLeft` des mobilen Menüs anhand
der realen Elementposition, wartet zwei Bildframes und prüft vor dem Klick,
dass der Tab sichtbar ist und sein Mittelpunkt tatsächlich vom Menü getroffen
wird. Dafür stehen lokal bereits **20/20** mobile Wiederholungen mit vier
Workern, die vollständige Desktop-/Mobil-E2E-Suite **50/50** und
`npm run format:check`. Pflichtlauf #210 stoppte auf diesem Zwischenstand
bereits beim Lint: ESLint beanstandete einen überflüssigen `HTMLElement`-
Typzusatz. Er wurde entfernt; Web-Lint, Web-Typecheck und Formatprüfung sind
lokal grün. Lauf #211 warf danach trotz sichtbarem, per `elementFromPoint`
geprüftem Tab noch denselben Fehler: `locator.click` führte ein zweites
automatisches Scrollen aus und traf erneut den Suchinhalt. Der E2E-Helfer klickt
nun nach Scrollen und Trefferprüfung mit echten Mauskoordinaten genau den
geprüften Mittelpunkt, ohne Locator-Autoscroll. Das ist weiterhin ein realer
Pointer-Klick und kein erzwungener DOM-Klick.

Mit dem Nav-Fix auf Head `6782dd8` bestanden lokal der mobile Test **20/20** Mal
mit vier Workern, die vollständige Desktop-/Mobil-E2E-Suite **50/50**, Web-Lint,
Web-Typecheck und `npm run format:check`. Lauf #212 kam im mobilen Test weiter
und scheiterte dann beim Widerruf der Dokument-Suchfreigabe: Das
Suchfreigabe-Kontrollkästchen im Metadateneditor wurde beim automatischen
Scrollen abwechselnd von einem `select`, dem Formular und der fixierten
Navigation getroffen.

Der Test scrollt das Steuerelement nun mittig ins Bild, prüft mit
`elementFromPoint`, dass der Mittelpunkt tatsächlich das Kontrollkästchen
trifft, und klickt anschließend mit echten Mauskoordinaten. Danach wird der
geänderte Checkbox-Status geprüft. Lauf #213 auf Head `707e11a` bestand diesen
Schritt, scheiterte anschließend beim Löschen des alten PDF: `locator.click`
traf beim automatischen Scrollen den Download-Link statt des Löschknopfs. Der
E2E-Helfer scrollt und prüft nun auch den Löschknopf und klickt anschließend
seinen tatsächlichen Mittelpunkt mit der Maus.

Lauf #214 auf `82e24cc` bestand den macOS-Release-Check, scheiterte im
Repository-Test aber erneut am Ende des Mobile-Ablaufs: Das alte PDF blieb in
der Liste. Die Wiederholung des fehlgeschlagenen Jobs zeigte denselben Fehler;
der CI-Trace wurde nicht als Workflow-Artefakt veröffentlicht. Lokal bestanden
8/8 gezielte Durchläufe mit Maus-Klick. Lauf #215 auf `85c399f` zeigte, dass
auch ein Touch-Tap keinen DELETE-Request auslöste; der Test wartete auf die
Antwort, der Löschhandler/API wurde nicht erreicht. Der mobile E2E-Helfer löst
vor dem Scrollen nun den aktiven Fokus und bestimmt die Zielposition danach neu.
Der Löschschritt wartet mit kurzer Frist auf die erfolgreiche DELETE-Antwort
und anschließend auf die Bestätigung in der Oberfläche. Lokal bestanden danach
erneut **8/8** gezielte Mobile-Durchläufe und die vollständige Desktop-/Mobil-
E2E-Suite **50/50**; Format, Web-Lint, Typecheck und `git diff --check` sind
ebenfalls grün. Die letzte Fokuskorrektur ist noch uncommitted; der
CI-Nachweis auf dem exakten neuen PR-Head steht aus. Lauf #216 auf `0cb9a09`
scheiterte erneut, weil nach dem Touch-Tap kein DELETE-Request eintraf; das
Fokuslösen allein behebt den mobilen Klick nicht. Die Ereignisspur aus Lauf #217
bestätigte die Ursache: Der Android-Visual-Viewport war um 35 Pixel versetzt;
die Eingabe landete im umgebenden `ARTICLE` unterhalb des Knopfs, obwohl die
vorherige Trefferprüfung den Knopf meldete. Der Klickhelfer rechnet die
`visualViewport`-Offsets für die tatsächliche Touch-Eingabe ab. Lauf #218 zeigte,
dass diese Umrechnung nicht für `elementFromPoint` gilt: dessen DOM-Prüfung muss
den unverschobenen Mittelpunkt verwenden. Der Helfer trennt nun die rohe
DOM-Trefferprüfung vom offsetkorrigierten Touch-Punkt. Danach bestanden lokal
**8/8** gezielte Mobile-Läufe und die vollständige Desktop-/Mobil-E2E-Suite
**50/50**; Format, Web-Lint, Typecheck und `git diff --check` sind grün. Die
Korrektur ist noch uncommitted; der nächste Schritt ist Commit/Push und
CI-Prüfung des exakten Heads. API-/Backendänderungen sind nicht angezeigt.

## Paket 7 – Übergabe (26.09.2026)

**Abnahme (27.09.2026 live geprüft):** PR #127 ist `MERGED`, Merge-Commit
`d4dc091` als Spitze von `origin/develop`, beide Pflichtchecks `SUCCESS`. Die
folgende Übergabe beschreibt den Stand vor der Abnahme und bleibt als Nachweis
erhalten.

- Paket: **7 – PDF-Textextraktion und modulspezifische Suche** lokal umgesetzt
  und geprüft. Stand dieser Runde: **150/150** API-Tests (121 vorher),
  **33/33** Datenbanktests, **81/81** Web-Unit-Tests in 11 Dateien und
  **50/50** Playwright-E2E-Abläufe auf Desktop und Smartphone für Upload,
  erneute Verarbeitung, Seitentreffer, Modulsuche, Widerruf und Löschung. Dazu
  `db:validate`, `db:sqlite:validate`, `db:generate`, `db:sqlite:generate`,
  `db:sqlite:verify:recovery`, `verify:sqlite:api-runtime`,
  `desktop:verify:sidecar`, `typecheck`, `lint`, `format:check`, `build`,
  `repo:check` und `security:secrets`. Der Branch ist gepusht und PR #127 offen;
  ein Merge ist nicht beauftragt und wurde nicht ausgeführt.
- Übergabe: [PR #127](https://github.com/187Anton/LifeOS/pull/127) gegen
  `develop`, offen. Inhaltlicher Head (Anwendungscode, Migrationen, Tests) ist
  `d72a082` (`fix(knowledge): bound concurrent PDF extractions per process`);
  alle Commits darüber sind reine Dokumentationscommits, die ausschließlich
  diese Fortschrittsdatei ändern und keinen Anwendungs-, Migrations- oder
  Testcode enthalten.
- Pflichtchecks je Head, jeweils live geprüft über `gh pr checks` mit
  übereinstimmendem `.headSha` des Workflow-Laufs: `d72a082` beide `SUCCESS`
  (Lauf `36251372179`), aktueller PR-Head `3d83a5e` ebenfalls beide `SUCCESS`
  (Lauf `36262379435`). Jeder weitere Dokumentationscommit erzeugt einen neuen
  Head, für den `Repository checks` und `Local macOS release` erneut zu prüfen
  sind; ein Merge ist nicht beauftragt und wurde nicht ausgeführt.
- Vorgänger: **Paket 6** ist über
  [PR #126](https://github.com/187Anton/LifeOS/pull/126) nach `develop`
  integriert. Live bestätigt sind der Merge-Commit `65de029`
  (`feat(study): add bound module detail view`) als Spitze von
  `origin/develop`, `git merge-base --is-ancestor 65de029 origin/develop` sowie
  beide Pflichtchecks über `gh pr checks 126`. Paket 5 ist davor über
  [PR #125](https://github.com/187Anton/LifeOS/pull/125) mit Merge-Commit
  `f37524d` integriert. Die Paket-5- und Paket-6-Details dieser Datei bleiben
  als Nachweisabschnitte weiter unten erhalten.
- Branch: `feat/coherence-pdf-extraction`.
- Basis: `65de029` (`origin/develop`, PR #126).
- Worktree: `/private/tmp/lifeos-coherence-pdf-extraction`; der Hauptcheckout
  `/Users/anton/Projekte/LifeOS` blieb unverändert.
- Umsetzung: genau ein Worker für Umsetzung, Prüfung und Nachweise; keine
  Subagenten, keine zweite Schreibinstanz und kein paralleler Agent.
- Persönliche Daten: Antons Entwicklungsdatenbank blieb unberührt. Der lokale
  Compose-Container dieses Worktrees band PostgreSQL an `127.0.0.1` auf einem
  eigenen Port mit eigener, nur synthetisch befüllter Datenbank; Migrationen und
  Tests liefen ausschließlich gegen synthetische Werte. Die installierte App
  wurde nicht angefasst.
- Geänderter Umfang: Datenmodell und Migrationen für den dokumentgebundenen
  Extraktionszustand, der lokale PDF-Extractor mit begrenztem Worker und
  prozessweiter Begrenzung, der Upload- und Reprocess-Pfad in
  `apps/api/src/modules/knowledge/`, die seitenbezogene Suche mit optionalem
  `studyModuleId`-Filter in `apps/api/src/modules/search/`, der
  Dokument- und Suchvertrag in `packages/contracts/src/api.ts`, der
  SQLite-Importpfad in `packages/database/src/sqlite-import.ts`, die
  Wissens- und Modulansicht in `apps/web/src/` sowie die zugehörigen
  API-, Datenbank-, Web-Unit- und E2E-Nachweise.
- Datenmodell und Migrationen: `Document` trägt zusätzlich `extractionStatus`,
  `extractionVersion`, `extractionSha256`, `extractionErrorCode`,
  `extractionPageCount`, `extractionTruncated`, `extractionPages` und
  `extractedAt`. Beide Prisma-Provider (PostgreSQL und SQLite) erhielten je
  eine additive, versionierte Migration mit Statusprüfung und
  JSON-Array-Prüfung für die Seitenfundstellen; die Tabellen wurden nicht neu
  aufgebaut. Bestehende Textextraktionen bleiben datenerhaltend erhalten und
  werden als `legacy-text-v1` geführt; bereits vorhandene PDFs bleiben bis zur
  Verarbeitung `pending`.
- Extraktionsbereich: lokaler Parserlauf in einem begrenzten Worker-Thread mit
  den dokumentierten Grenzen (25 MiB Eingabe, 1 000 Seiten, 1 000 000 Byte
  Text, 20 s Laufzeit, 256 MiB Speicher) und ohne Netzzugriff,
  Dokument-JavaScript, Anhänge oder Rendering. Je Prozess laufen höchstens zwei
  Verarbeitungen gleichzeitig; zusätzliche Anfragen warten in einer auf vier
  Plätze begrenzten Warteschlange, jeder Überlauf wird sofort mit
  `429 RATE_LIMITED` abgewiesen. Upload und erneute Verarbeitung teilen sich
  dieselbe Begrenzung; ein Platz wird nach Erfolg, Fehler und Zeitüberschreitung
  freigegeben.
- Nicht geändert: CalDAV-Server, Apple-Integration, KI-Funktionen, Fixture- und
  Seed-Bestände, ein zweiter Dokumentenspeicher, ein persistierter Suchindex,
  OCR, Vektorsuche sowie PPTX-/DOCX-Extraktion (Paket 8). `LifeOS
Leitfaden.docx` blieb unverändert; damit war keine DOCX-Renderprüfung nötig.
- Offene Blocker: keiner. Die Pflicht-CI ist für den inhaltlichen Head `d72a082`
  live bestätigt; ein Merge ist nicht beauftragt und wurde nicht ausgeführt.

## Paket 7 – lokale Nachweise (26.09.2026)

### Ausgangsprüfung

Paket 6 war harte Vorgängerabhängigkeit und ist live bestätigt:
`feat(study): add bound module detail view (#126)` ist mit Merge-Commit
`65de029` die Spitze von `origin/develop`; `git merge-base --is-ancestor 65de029
origin/develop` liefert wahr und beide Pflichtchecks standen auf `pass`. Der
Worktree `/private/tmp/lifeos-coherence-pdf-extraction` (Branch
`feat/coherence-pdf-extraction`) wurde auf genau diesem Stand angelegt; der
Hauptcheckout blieb unverändert.

### Parserbibliothek und Grenzen

Gewählt wurde `pdfjs-dist@6.3.289` (Apache-2.0), gebündelt über esbuild direkt
in das eine Laufzeitpaket des Mac-Sidecars. Nachgewiesen ist:

- Lizenz und Sicherheitslage: Apache-2.0, keine native Zusatzabhängigkeit.
- Node-22-Kompatibilität: Der Worker lädt ohne eigene Worker-Datei über den
  Main-Thread-Handler `pdfjsWorker.WorkerMessageHandler`.
- Bundling: ein einziges Bundle, das isoliert ohne `node_modules` läuft.
- Offline-Betrieb: Der Parser erhält ausschließlich `data`, nie eine URL;
  zusätzlich `disableAutoFetch`, `disableRange`, `disableStream` und
  `useWorkerFetch: false`. Ein Test belegt, dass während der Extraktion kein
  `fetch`-Aufruf entsteht.

Feste Grenzen: Eingabe 25 MiB (bestehende Ablagegrenze), 1 000 Seiten je Lauf,
1 000 000 Byte extrahierter Text (identisch zur Textgrenze der Ablage), 20 s
Laufzeit und 256 MiB Speichergrenze des Arbeits-Threads. Seiten- und
Textüberschreitung setzen `extractionTruncated`; ein Laufzeitabbruch liefert
`failed` mit `errorCode: "timeout"`.

### Datenmodell

`Document` trägt jetzt `extractionStatus`, `extractionVersion`,
`extractionSha256`, `extractionErrorCode`, `extractionPageCount`,
`extractionTruncated`, `extractionPages` und `extractedAt`. Alle Spalten sind
additiv; die Tabelle wird nicht neu aufgebaut. Beide Anbieter (PostgreSQL und
SQLite) erhalten je eine neue versionierte Migration mit denselben
Statuswerten und Prüfungen (`jsonb_typeof`/`json_type` = `array`, Statusenum,
Hashformat). Bestehende Textextraktionen werden datenerhaltend als
`legacy-text-v1` gekennzeichnet und bleiben hashaktuell; Bestands-PDFs bleiben
`pending` und werden erst durch die erneute Verarbeitung bewertet. Es entstand
kein zweiter Dokumentenspeicher und kein separater Suchindex.

### Extraktion und Suche

Die Verarbeitung läuft in einem begrenzten Worker-Thread. Deaktiviert sind
Netzzugriffe, Dokument-JavaScript, Anhänge und Rendering (keine Schrift-,
Bild- oder Canvas-Pfade). Die Rückgabe nennt Seitenzahl, Seitentexte und genau
einen der Werte `pending`, `available`, `no_text`, `protected`, `unsupported`
oder `failed`. Upload, Download und erneute Verarbeitung verwenden dieselbe
SHA-256-Prüfung; ein Parserfehler verliert die abgelegte Datei nicht. Klartext
aus Dokumenten erscheint weder in Protokollen noch in Audits.

Die Zahl der Verarbeitungen ist zusätzlich prozessweit begrenzt: Je Prozess
laufen höchstens zwei PDF-Extraktionen gleichzeitig, weitere Anfragen warten in
einer auf vier Plätze begrenzten Warteschlange. Ein Überlauf wird sofort mit
`429 RATE_LIMITED` abgewiesen, statt weitere Worker oder unbegrenzt Wartende
aufzubauen. Upload und erneute Verarbeitung teilen sich dieselbe Begrenzung; ein
Platz wird nach Erfolg, nach einem Fehler und nach einer Zeitüberschreitung
freigegeben. Eine abgewiesene Upload-Anfrage entfernt die bereits geschriebene
Datei wieder und legt keinen Datensatz an, eine abgewiesene erneute Verarbeitung
lässt den bestehenden Extraktionszustand unverändert. Die Besitzprüfung greift
weiterhin vor der Begrenzung.

Die Suche nennt bei seitenbezogenen Quellen die betroffene Seite (`page`,
`pages`) und akzeptiert den optionalen Filter `studyModuleId`. Inhalt wird
ausschließlich aus einer eigenen, aktiven, freigegebenen und hashaktuellen
Extraktion verwendet; ausstehende, fehlgeschlagene, geschützte, textfreie und
veraltete Extraktionen liefern keinen Inhalt, bleiben aber über Metadaten
auffindbar. Der Modulfilter umfasst Modul-, Studien-, Notiz- und
Dokumentquellen; Aufgaben bleiben normale Fachfilter.

### Nachweise dieser Runde

- `npm test --workspace @lifeos/api`: **150/150** grün (Ausgangsstand 121/121;
  29 neue PDF-, Begrenzungs-, Such- und Integrationstests).
- `npm test --workspace @lifeos/database`: **33/33** grün, darunter der neue
  Nachweis, dass Bestandsdokumente datenerhaltend übernommen werden.
- `npm run test:unit --workspace @lifeos/web`: **81/81** grün in 11 Dateien
  (vier neue Tests für Extraktionszustand, erneute Verarbeitung, Seitenanzeige
  und Modulsuche).
- `npm run test:e2e --workspace @lifeos/web`: **50/50** grün (25 Fälle in beiden
  Browserprojekten), darunter der neue Ablauf „verarbeitet PDFs seitenbezogen
  und sucht im Modul auf Desktop und Smartphone“ mit Statusanzeige, erneuter
  Verarbeitung, `Seite …`-Treffern, Modulsuche, Widerruf und Löschung.
- PDF-Unit-Tests decken ein- und mehrseitige Dokumente, leere Seiten,
  bildbasierte Dateien ohne Text, geschützte, abgeschnittene und strukturell
  defekte Dateien, zu große Eingaben, Seiten- und Textgrenzen, Laufzeitabbruch,
  deaktiviertes JavaScript und fehlende Netz-/Anhangspfade ab.
- Begrenzungstests decken die festen Grenzen selbst ab (gleichzeitige Läufe,
  Eingangsreihenfolge, feste Warteschlange, Überlaufabweisung ohne Platzverlust)
  sowie die Freigabe eines Arbeitsplatzes nach Erfolg, nach Fehler und nach
  einer echten Zeitüberschreitung des Workers. Der Integrationstest belegt am
  laufenden HTTP-Server den Überlauf (`429 RATE_LIMITED`), dass eine abgewiesene
  Anfrage weder Datensatz noch verwaiste Datei hinterlässt, dass Upload und
  erneute Verarbeitung dieselbe Begrenzung teilen, dass der bestehende
  Extraktionszustand unverändert bleibt und dass die Besitzprüfung mit `401`
  weiterhin vor der Begrenzung greift.

### Abnahmerunde der Paket-7-Korrekturen (26.09.2026)

Der Abnahmebefund zur fehlenden Ressourcenbegrenzung ist behoben:
`apps/api/src/modules/knowledge/pdf-extraction-concurrency.ts` hält fest, wie
viele PDF-Verarbeitungen je Prozess gleichzeitig laufen dürfen, und begrenzt
zusätzlich die Wartenden. Die festen Werte stehen neben den übrigen Grenzen in
`pdf-extraction-limits.ts`; die Begrenzung selbst sitzt in der Anwendungsschicht
und gilt für alle Besitzer und beide Einstiegspfade. Die bestehende
Besitzprüfung sowie Seiten-, Text-, Laufzeit- und Speichergrenze bleiben
unverändert wirksam.

### Offene Risiken und bewusst unveränderte Punkte

- Im Test beobachtet: Die Parserbibliothek gibt Text, den ein Dokument
  außerhalb seiner Seitenfläche setzt, nicht aus. Das betrifft fehlerhaft
  gesetzte Dateien; regulär umbrochener Text innerhalb der Seitenfläche ist
  vollständig extrahierbar. Diese Grenze ist in `docs/api/knowledge.md`
  dokumentiert.
- OCR, PPTX-/DOCX-Extraktion, Vektorsuche, KI-Verarbeitung und externe Dienste
  bleiben Nicht-Ziel und wurden nicht angefasst.
- `LifeOS Leitfaden.docx` wurde bewusst nicht geändert; damit war keine
  DOCX-Renderprüfung nötig.

## Paket 6 – lokale Nachweise

### Ausgangsprüfung

Vor der Umsetzung wurde live geprüft, dass der Vorgänger integriert und
abgenommen ist: Spitze von `origin/develop` ist `f37524d`, dieser Commit ist
Ancestor von `origin/develop`, und für PR #125 melden beide Pflichtchecks
`pass`. Der Hauptcheckout war sauber; es gab keine fremden lokalen Änderungen zu
übernehmen.

### Moduldetailansicht

`StudyModuleDetail.tsx` ist eine eigene, besitzgebundene Detailansicht. Sie
zeigt Titel, Kürzel, Studienabschnitt samt Zeitraum, Status, Leistungspunkte,
Note, Notizen, Suchfreigabe und Archivzustand sowie die Dokumentverweise des
Moduls. Die Studienübersicht bleibt unverändert bestehen; jede Modulkarte der
Übersicht öffnet die Detailansicht über „Moduldetails öffnen“, und
„Zur Übersicht“ führt zurück. Der aktive Studienabschnitt wird aus der
geladenen Studienübersicht aufgelöst, nicht erfunden.

Die zugehörigen Objekte werden aus den vorhandenen Besitzfiltern zusammengestellt:

- **Aufgaben** über `Task.studyModuleId`, aktive und archivierte, aus der
  bestehenden Aufgabenliste (die Ansicht lädt bereits `includeArchived=true`).
  Aufgaben ohne Modulbezug erscheinen nicht in der Modulansicht.
- **Studieneinträge** über `StudyEntry.moduleId`, aktive und archivierte, aus
  der bestehenden Studienübersicht.
- **Notizen** und **Dokumente** ausschließlich über ihre echte Modulbeziehung
  (`studyModule.id`) aus der Wissensübersicht. Die freien
  `studyModule.documentReferences` werden getrennt als unverbindliche Angaben
  angezeigt und nie als Datei-ID interpretiert; umgekehrt erscheint eine
  verknüpfte Datei nie als Dokumentverweis.
- Kalenderbezüge eines Studieneintrags (`calendarEventId`, `calendarEventUid`,
  `calendarEventCalendarId`) werden read-only angezeigt und nicht mit freien
  `TaskEventLink`-Beziehungen verwechselt. Es entsteht keine neue Verknüpfung.

### Bearbeitung über die bestehenden Facheditoren

- **Modul und Studieneintrag** über die vorhandenen Studienformulare. Dafür
  wurden `ModuleForm` und `EntryForm` in `StudyWorkspace.tsx` von einem
  gemeinsamen `onSave`-Union-Typ auf getrennte, typreine `onCreate`/`onUpdate`
  Signaturen umgestellt; bestehende Datensätze werden über die geprüfte
  `record.id` adressiert. Die Formulare werden über die neue `formPanel`-Prop in
  die Detailansicht gegeben, es gibt keinen zweiten Formularsatz.
- **Aufgaben** über den gemeinsamen `TaskForm`/`TaskWorkspace`: „Aufgabe öffnen“
  öffnet den vorhandenen Editor, „Aufgabe anlegen“ legt mit vorbelegtem
  Modulbezug an. Es entsteht kein zweiter Aufgabenschreibpfad.
- **Notizen** und **Dokument-Metadaten** über `KnowledgeWorkspace`. Der neue
  `DocumentEditor` bearbeitet ausschließlich vorhandene Metadaten- und
  Verknüpfungsfelder (Dateiname bleibt read-only, Suchfreigabe, Projekt- und
  Studiummodulbezug) und ersetzt keine Datei und legt keine neue an.
- Archivierte oder inzwischen nicht mehr auflösbare Verknüpfungsziele bleiben
  in den Auswahlfeldern sichtbar und gekennzeichnet, statt stillschweigend auf
  einen anderen Wert zu springen.

### Suchnavigation

Jeder Treffer öffnet das konkrete Objekt: `study_module` die Detailansicht
dieses Moduls, `study_entry` das Modul mit markiertem und fokussiertem Eintrag
(`StudyEntryResponse`/`StudyModuleResponse`-Quelle: `source.id` ist die
Modul-ID, `id` die Eintrags-ID), `note` die konkrete Notiz und `document` das
konkrete Dokument. Ziele, die archiviert, gelöscht oder nicht mehr auffindbar
sind, erzeugen einen klaren Fehlerzustand und öffnen ausdrücklich kein anderes
Objekt; die jeweilige Übersicht bleibt bedienbar. Bestehende Zielarten
(Projekt, Ziel, Meilenstein, Arbeitsprojekt) behalten ihren bisherigen Weg.

### Nachladen und Zustände

Nach einer bestätigten Änderung werden die betroffenen Projektionen neu geladen
(Aufgabenänderungen laden Aufgaben, Studium, Dashboard und Planung; Studienänderungen
laden Studium und Planung; Wissensänderungen laden Wissen). Auswahlzustände
werden nicht blind beibehalten: eine Auswahl, die in den neuen Daten nicht mehr
existiert, wird verworfen, statt ein anderes Objekt zu zeigen. Die
Modulauswahl bleibt bewusst erhalten, damit die Rückkehr aus dem Aufgaben- oder
Wissenseditor wieder auf demselben Modul landet. Persönliche Daten gelangen
nicht in URL, `localStorage`, `sessionStorage` oder den Service-Worker-Cache;
das prüft der E2E-Test am Ende jedes Ablaufs.

### Nachweise dieser Runde

- `npm run test --workspace @lifeos/api`: **121/121** (118 vorher; drei neue
  Integrationsfälle für Moduldetail/Zeitformwechsel/Archivzustände,
  Besitzgrenzen, Suchfreigabe und Archivzustände von Dokumenten sowie die
  öffentliche Identität jedes Suchziels).
- `npm run test --workspace @lifeos/web`: **76/76** Web-Unit (71 vorher, fünf
  neue) und **48/48** E2E in beiden Browserprojekten (42 vorher, drei neue Tests
  je Projekt).
- Die neuen E2E-Tests decken den vollständigen Ablauf Modul öffnen →
  verknüpfte Objekte anzeigen → Modul, Eintrag, Aufgabe, Notiz und Dokument
  über die bestehenden Editoren bearbeiten → Aktualisierung prüfen, leere
  Modulbereiche, archivierte Bezüge, einen sichtbaren API-Fehler sowie
  verschwundene Suchziele ab.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`,
  `npm run repo:check` und `npm run security:secrets`: bestanden.

### Offene Risiken und bewusst unveränderte Punkte

- Ein Studieneintrag eines **archivierten Moduls** lässt sich nicht ändern: die
  vorhandene Referenzprüfung lehnt archivierte Module ab, die API antwortet mit
  einem Validierungsfehler und die Ansicht zeigt ihn sichtbar an. Keine
  Datenänderung geht verloren; eine Lockerung wäre eine Repository-Änderung
  außerhalb des Paket-6-Scopes und wurde deshalb nur als Test festgehalten.
- Archivierte Module sind – wie bisher – nicht aus der Studienübersicht
  auswählbar und erscheinen nicht in der lokalen Suche. Die Detailansicht
  kennzeichnet einen Archivzustand, der während der geöffneten Ansicht entsteht.
- Die Detailansicht verwendet weiterhin die vorhandenen Übersichtsantworten;
  eine dedizierte Moduldetail-Ressource war nicht nötig und wurde nicht
  eingeführt.
- Paket 7 und Paket 8 bleiben für Dateiextraktion, Fundstellen und Suche in
  Dateiinhalten zuständig; Paket 9 für eine verwaltete
  Aufgaben-CalDAV-Abbildung.

## Paket 6 – Korrektur der Befunde (Zeitzone, Produktdokumentation, Pflicht-CI)

Stand: 25.09.2026, gemessen im Worktree
`/private/tmp/lifeos-coherence-module-detail` auf Branch
`feat/coherence-module-detail` (Basis `f37524d`) gegen den Stand `23a44d7`.
Diese Runde hat der koordinierende Agent selbst umgesetzt und geprüft (keine
Delegation, kein zweiter Schreiber).

- **Befund 1 – Zeitzone beim Bearbeiten von Studieneinträgen.** Der bestehende
  Eintrag wurde in `EntryForm` (`StudyWorkspace.tsx`) zwar in seiner
  gespeicherten Zeitzone angezeigt (`toDateTimeInput(…, record.timezone ??
timezone)`), beim Speichern aber mit der Profilzeitzone interpretiert und mit
  `timezone: <Profilzeitzone>` geschrieben. Bei abweichender Eintragszeitzone
  verschob ein Speichern ohne Zeitänderung damit den Zeitpunkt und überschrieb
  die gespeicherte Zeitzone. Korrektur: eine einzige Größe
  `scheduleTimezone = record?.timezone ?? timezone` gilt für Anzeige,
  Beschriftung („Darstellung in …“) und Schreiben; bestehende Einträge behalten
  Zeitzone und Zeitpunkt, neue Einträge und Altwert ohne Zeitzone verwenden
  weiterhin die Profilzeitzone. Der Wechsel zwischen Ganztagsfrist und Zeitblock
  bleibt unverändert (`dueDate` gegen `startsAt`/`endsAt`/`timezone`).
- **Regressionstest (rot vor der Korrektur, grün danach).** Neuer App-Test
  „bewahrt beim Bearbeiten eines Studieneintrags die gespeicherte Zeitzone und
  den Zeitpunkt“: zeitgebundener Eintrag mit `America/New_York` gegen
  Profilzeitzone `Europe/Berlin`, geprüft werden die angezeigten Wandzeitwerte
  (`2033-04-11T02:30`/`T04:00`) und der tatsächlich gesendete Schreibkörper
  (`startsAt 2033-04-11T06:30:00.000Z`, `endsAt …08:00:00.000Z`, `timezone
America/New_York`, `dueDate null`) nach einem Speichern ohne Zeitänderung.
  Gegen den unveränderten Stand `23a44d7` schlägt genau dieser Test fehl
  (`expected '2033-04-11T00:30:00.000Z' to be '2033-04-11T06:30:00.000Z'`), mit
  der Korrektur ist er grün. Dafür zeichnet der API-Mock der Testdatei die
  gesendeten Studieneintrag-Schreibkörper auf (`studyEntryUpdates`).
- **Befund 2 – Produktdokumentation.** `README.md` nennt den Umsetzungsstand der
  Pakete 0 bis 5 (PR #122 bis #125) und Paket 6 als lokal umgesetzten,
  noch nicht integrierten Stand; ergänzt sind ein Absatz zur
  Moduldetailansicht (Abgrenzung von der unveränderten Studienübersicht,
  Herkunft der verknüpften Objekte aus vorhandenen Besitzfiltern, freie
  Dokumentverweise als unverbindliche Angaben, Bearbeitung ausschließlich über
  die vorhandenen Facheditoren, Erhalt der gespeicherten Zeitzone) sowie im
  Wissensabschnitt ein Satz zur Bearbeitung von Notizen und Dokumentmetadaten
  aus der Moduldetailansicht ohne Dateiersatz. `LifeOS Leitfaden.docx` erhielt in
  5.2 Studium und 5.10 Wissen je einen Absatz „Umsetzungsstand 25.09.2026
  (Paket 6, lokal umgesetzt und geprüft)“ in derselben Aufzählungsformatierung
  wie die Nachbarpunkte.
- **Leitfaden-Nachweis.** Geschrieben mit `python-docx`
  (`/Users/anton/.hermes/cache/scratch/p6-update-guide.py`), Sicherung des
  Vorzustands unter `/Users/anton/.hermes/cache/scratch/p6-leitfaden-vor-edit.docx`;
  `docx_validate.py` meldet `{"ok": true, "issues": []}`. Microsoft Word hat den
  Leitfaden als 26-seitiges PDF gerendert
  (`/Users/anton/.hermes/cache/scratch/p6-guide-render/LifeOS Leitfaden.pdf`).
  Geprüft wurde programmatisch: der neue Studium-Absatz steht am Ende von
  5.2 Studium (Seite 6, vor der Überschrift 5.3 Arbeit), der neue Wissens-Absatz
  am Ende von 5.10 Wissen (Seite 12, nach dem letzten Aufzählungspunkt und vor
  5.11 KI-Assistent), die Aufzählungszeichen sind erhalten, und kein Zeichen
  liegt außerhalb der Seitenfläche (612 × 792 pt, 0 von 44 602 Zeichen außerhalb).
- **Grenze der Prüfung (offen).** Eine echte visuelle Sichtprüfung der
  geänderten Seiten war in diesem Lauf nicht möglich: es stand kein
  Bildanalyse-Werkzeug zur Verfügung. Die Prüfbilder
  `/Users/anton/.hermes/cache/scratch/p6-guide-render/seite-06.png` und
  `…/seite-12.png` sind erzeugt und können von Hand angesehen werden; die
  visuelle Abnahme dieser zwei Seiten bleibt damit offener Koordinatorpunkt.
- **Gemessene Nachweise dieser Runde:** Web-Unit `npx vitest run` in `apps/web`
  **77/77** in 11 Dateien (vorher 76, inklusive des neuen Regressionstests),
  Playwright `npx playwright test` in `apps/web` **48/48** in `desktop-chrome`
  und `mobile-chrome`, `npm run test:repo` **19/19**. Qualität:
  `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`,
  `npm run repo:check` und `npm run security:secrets` bestanden;
  `git diff --check` ohne Befund.
- **Nicht ausgeführt und deshalb hier nicht als Ergebnis behauptet:** die
  API-Suite (in dieser Runde wurde keine API-Datei geändert; letzter Stand
  121/121), `npm run test:sqlite:api`, die Recovery-/Sidecar-Nachweise und der
  ARM64-DMG-/Notarisierungspfad.
- **Nicht geändert:** Prisma-Schema, Migrationen, CalDAV-/Apple-Pfade, freie
  `TaskEventLink`-Beziehungen, Finanzmodule, zweiter Dokumentenspeicher,
  Dateiextraktion, OCR und Vektorsuche. Es entstand keine neue API-Ressource;
  Paket 7 und spätere Pakete wurden nicht begonnen.
- **Befund 3 – Pflicht-CI.** Der Head dieser Korrekturrunde entsteht erst mit
  dem Push nach
  [PR #126](https://github.com/187Anton/LifeOS/pull/126) (Basis `develop`).
  `Repository checks` und `Local macOS release` sind für genau diesen Head live
  über `gh pr checks` zu lesen; in dieser Datei wird kein CI-Ergebnis für einen
  Commit behauptet, dessen Läufe zum Schreibzeitpunkt noch nicht abgeschlossen
  sind. Ein Merge wurde nicht ausgeführt und ist nicht beauftragt.

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

| Paket                         | Status                                            |
| ----------------------------- | ------------------------------------------------- |
| 0 Plan und Übergabe           | Integriert über PR #120                           |
| 1 Einstellungen/Integrationen | Integriert über PR #121                           |
| 2 Finanzfunktionen entfernen  | Integriert über PR #122                           |
| 3 Finanzdatenmigration        | Integriert über PR #123 (`56404d7`)               |
| 4 Aufgaben–Studienmodul       | Integriert über PR #124 (`a8a2847`)               |
| 5 Kalender/Planung            | Integriert über PR #125 (`f37524d`)               |
| 6 Modul-Arbeitsbereich        | Lokal geprüft, um Befunde korrigiert; PR/CI offen |
| 7 PDF-Suche                   | Nicht begonnen                                    |
| 8 Office-Suche                | Integriert über PR #128 (`e01fe3c`)               |
| 9 Aufgaben–CalDAV             | Lokal umgesetzt und um fünf Befunde korrigiert;   |
|                               | PR/CI offen                                       |
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
