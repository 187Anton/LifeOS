# Datenbank

Dieses Workspace-Paket enthält das produktive Prisma-7-PostgreSQL-Schema, die
zugehörigen versionierten Migrationen, den zentralen Prisma-Client und
ausschließlich synthetische Entwicklungsdaten. Zusätzlich gibt es einen klar
getrennten vollständigen SQLite-Schema- und Migrationspfad für die
Mac-App-Migration.

## Datenmodell des Fundaments

- `User` ist der persönliche Besitzer aller Daten und hat eine stabile externe
  ID.
- `UserSettings` speichert Zeitzone, Währung, Sprache, Wochenbeginn und
  Kalenderansicht getrennt vom Benutzerstammsatz.
- `UserCredential` enthält ausschließlich den versionierten Passwort-Hash.
- `UserSession` speichert nur den SHA-256-Hash eines zufälligen Tokens,
  Ablaufzeit, Zugangsversion und optionalen Widerrufszeitpunkt.
- `CalDavCredential` speichert den getrennt widerrufbaren CalDAV-Benutzernamen
  und ausschließlich dessen versionierten `scrypt`-Passwort-Hash.
- `Calendar` gehört immer zu einem Benutzer. `externalId` bleibt als stabile
  Kalenderkennung erhalten.
- `CalendarEvent` trägt zusätzlich zur Kalender-ID die Benutzer-ID. Ein
  zusammengesetzter Fremdschlüssel verhindert, dass ein Ereignis versehentlich
  einem Kalender eines anderen Benutzers zugeordnet wird. UID und ETag bleiben
  stabil bzw. versionsbezogen; Wiederholungsregeln und bis zu zehn
  Erinnerungszeitpunkte werden verlustarm gespeichert.
- `Project`, `ProjectGoal`, `ProjectMilestone` und `ProjectEventLink` bilden die
  besitzgebundene Projektverwaltung. Projekte, Ziele und Meilensteine besitzen
  Status, optionales Risiko, reines Fälligkeitsdatum sowie reversible Archiv-
  und Löschzeitpunkte. Aufgaben und Kalenderereignisse werden referenziert,
  nicht kopiert.
- `Task` speichert Titel, Beschreibung, Status, Priorität, Fälligkeit,
  optionale Startplanung, ganzzahlige Dauerminuten, Tags, Bereich,
  Projekt-/Elternbezug sowie Abschluss-, Archivierungs- und Löschzeitpunkte.
  Zusammengesetzte Fremdschlüssel verhindern fremde Elternaufgaben oder
  Projektzuordnungen.
- `TaskEventLink` speichert ausschließlich die besitzgebundene Beziehung
  zwischen Aufgabe und Kalenderereignis. Eine zusammengesetzte Eindeutigkeit
  verhindert Duplikate; Fachdaten werden nicht kopiert.
- `Note` speichert Markdown-Inhalte, Kategorie, Tags, optionale Projekt- und
  Studienmodulbezüge sowie eine ausdrücklich gesetzte Suchfreigabe.
  `NoteVersion` hält bei Inhaltsänderungen den nachvollziehbaren Stand; beide
  Modelle bleiben besitzgebunden und Notizen sind archiv- sowie soft-löschbar.
- `Document` enthält ausschließlich besitzgebundene Metadaten, Prüfsumme und
  einen opaken Storage-Schlüssel. Der Binärinhalt liegt außerhalb des
  Repositorys im privaten lokalen Dokumentverzeichnis. Ein optionaler,
  größenbegrenzter `extractedText` enthält nur lokal aus freigegebenen
  UTF-8-Textformaten gewonnenen Inhalt.
- `Project`, `StudyModule` und `WorkProject` besitzen wie `Note` und `Document`
  eine standardmäßig deaktivierte `searchEnabled`-Freigabe. Die Migration
  `20260820100000_local_search` ergänzt diese Felder und die nur für aktive
  Datensätze verwendeten Zugriffspfade in PostgreSQL und SQLite.
- `AiInteraction` hält den besitzgebundenen technischen Nachweis einer lokalen
  Quellenaufbereitung. Fragen, Antworten und Textausschnitte werden nicht im
  Klartext gespeichert; zufällig geschützte SHA-256-Fingerabdrücke,
  Quellen-IDs, Status, Zähler und Bestätigungsmetadaten genügen für
  Nachvollziehbarkeit und Audit. Die Migration
  `20260820150000_source_grounded_ai` ist für PostgreSQL und SQLite
  versioniert.
- `FinanceCategory`, `FinanceTransaction` und `FinanceBudget` bilden den
  lokalen Finanzbereich. Beträge sind positive ganze kleinste
  Währungseinheiten, Währungen explizite dreistellige Codes und Buchungs- sowie
  Budgettage reine Datumswerte. Zusammengesetzte Fremdschlüssel verhindern
  fremde Kategorien; die Migration `20260820190000_finance_module` ist für
  PostgreSQL und SQLite versioniert.
- `FitnessPlan`, `FitnessExercise`, `FitnessPlanExercise`, `FitnessSession`,
  `FitnessSet` und `BodyWeightEntry` bilden die lokale Trainingsverwaltung.
  Messwerte sind ganze Gramm, Sekunden, Meter beziehungsweise Wiederholungen;
  reine Gewichtstage bleiben Datumswerte. Zusammengesetzte Fremdschlüssel
  verhindern fremde Plan-, Übungs-, Einheits- oder Kalenderbezüge. Die
  Migration `20260820200000_fitness_module` ist für PostgreSQL und SQLite
  versioniert.
- `ExternalCalDavConnection`, `ExternalCalDavCalendar` und
  `ExternalCalDavEventMapping` bilden ausschließlich die optionale
  read-only-Integration ab. Jede Zeile trägt den Besitzer; zusammengesetzte
  Fremdschlüssel verhindern fremde Kalender und Zuordnungen. Zugangsdaten
  liegen nur als AES-256-GCM-Chiffretext, Initialisierungswert und
  Authentifizierungstag vor. Die Migration
  `20260820210000_external_caldav` ist für PostgreSQL und SQLite versioniert.
- `GitHubConnection` speichert ausschließlich eine besitzgebundene,
  standardmäßig deaktivierte read-only-Verbindung. Das Token liegt als
  AES-256-GCM-Chiffretext, Initialisierungswert und Authentifizierungstag vor;
  Repository-Inhalte werden nicht persistiert. Die Migration
  `20260820220000_github_integration` ist für PostgreSQL und SQLite versioniert.
- `AvailabilityWindow` speichert wöchentliche persönliche Verfügbarkeit als
  Wochentag, Start- und Endminute sowie IANA-Zeitzone. Gültigkeitsbedingungen
  und Besitzbezug werden zusätzlich in PostgreSQL erzwungen.
- `AuditEvent` hält nachvollziehbare Änderungen mit Benutzer- und
  Entitätsbezug fest; Secrets gehören nicht in `metadata`.

Zeitpunkte werden als PostgreSQL `TIMESTAMPTZ` gespeichert und von der
Anwendung als UTC-Zeitpunkte behandelt. Die IANA-Zeitzone, etwa
`Europe/Berlin`, bleibt separat erhalten. Ganztägige Ereignisse verwenden
`startDate` und `endDate` als reine `DATE`-Werte; `endDate` ist wie in
iCalendar exklusiv. Eine Datenbankbedingung verhindert gemischte oder
unvollständige Zeitangaben.

Aufgabenfälligkeiten verwenden ebenfalls reine `DATE`-Werte. Eine geplante
Bearbeitungszeit besteht aus `scheduledStartAt` als `TIMESTAMPTZ` und
`scheduledStartTimezone` als IANA-Zeitzone; beide Werte sind entweder gemeinsam
gesetzt oder gemeinsam leer. Dauern werden als ganze Minuten gespeichert.
Datenbankbedingungen sichern gültige Dauer, Abschlusszeitpunkt, Tags,
Hierarchie sowie Archivierungs- und Löschzeitpunkte zusätzlich zur
API-Validierung ab.

Kalender und Ereignisse werden fachlich per `deletedAt` soft gelöscht. Jede
Ereignisänderung erhöht den Kalender-`syncToken` und speichert denselben Wert
als `CalendarEvent.syncVersion`. Dadurch kann `sync-collection` seit einem
bestimmten Token auch Löschmarkierungen liefern. Änderungen mit ETag verwenden
eine atomare bedingte Datenbankänderung statt eines getrennten Lesen-und-
Schreiben-Ablaufs.

## Befehle

Die lokale Datenbank muss zuerst mit `npm run db:start` laufen. Danach werden
die Befehle im Repository-Stamm ausgeführt:

```bash
npm run db:validate
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:test
npm run db:backup
npm run db:restore -- backups/<datei>.dump lifeos_restore_<name>
npm run db:verify:recovery
```

- `db:validate` prüft Schema und Prisma-Konfiguration.
- `db:generate` erzeugt den nicht versionierten TypeScript-Client.
- `db:migrate` wendet ausschließlich vorhandene, versionierte Migrationen an.
- `db:seed` legt wiederholbar dieselbe synthetische Person, Einstellungen,
  einen Kalender, ein Ereignis, einen Projektanker, eine Aufgabe, deren
  Beziehung, synthetische Finanzkategorien, Buchung und Budget, einen
  Trainingsplan samt Übung, Einheit, Satz und Gewichtseintrag, eine
  deaktivierte KI-Interaktion ohne Klartext und ein Audit-Ereignis an.
  Externe Verbindungen werden absichtlich nicht geseedet, weil Seeds weder
  Zugangsdaten noch einen Integrationsschlüssel enthalten dürfen.
- `db:test` speichert und liest einen eigenen synthetischen Datensatz und
  entfernt ihn anschließend wieder.
- `db:backup` schreibt einen Custom-Format-Dump samt SHA-256-Prüfsumme in das
  ignorierte Verzeichnis `backups/`; die Dateien enthalten persönliche Daten
  und müssen vertraulich behandelt werden.
- `db:restore` prüft Prüfsumme und Archiv und restauriert ausschließlich in
  eine neue Datenbank mit Präfix `lifeos_restore_`; die konfigurierte Quelle
  wird weder geleert noch überschrieben.
- `db:verify:recovery` prüft Migration, wiederholten Seed, Dump und Restore in
  zwei isolierten synthetischen Datenbanken und entfernt sie anschließend.

Das lokale Passwort wird getrennt vom Seed mit `npm run auth:bootstrap`
gesetzt. Dadurch liegt kein funktionsfähiges Standardpasswort im Repository.
Ein erneuter Bootstrap erhöht die Zugangsversion und widerruft vorhandene
Sitzungen.

Der CalDAV-Zugang wird ebenfalls nicht geseedet. `npm run caldav:bootstrap`
setzt ihn aus der temporären Variable `LIFEOS_CALDAV_PASSWORD`;
`npm run caldav:revoke` widerruft ihn unabhängig von der Web-Anmeldung.

Der Seed muss ausdrücklich ausgeführt werden. Prisma 7 startet ihn nicht mehr
automatisch zusammen mit einer Migration.

## SQLite-Migrations- und API-Pfad

Seit M2 bildet SQLite alle vorhandenen Fachmodelle ab. Eine absolute `file:`-URL
in `DATABASE_URL` wählt den SQLite-Client; eine PostgreSQL-URL behält den
bisherigen Adapter. PostgreSQL-Schema und vorhandene Migrationen bleiben
unverändert.

Eine isolierte SQLite-Datei wird so geprüft:

```bash
export SQLITE_DATABASE_URL="file:/absoluter/pfad/lifeos.sqlite"
npm run db:sqlite:validate
npm run db:sqlite:generate
npm run db:sqlite:migrate
npm run db:sqlite:seed
npm run db:sqlite:test
npm run test:sqlite:api
npm run verify:sqlite:api-runtime
unset SQLITE_DATABASE_URL
```

Ohne gesetzte Variable verwenden die lokalen Befehle die ignorierte Datei
`data/sqlite-development.sqlite`. Tests erzeugen immer eigene temporäre
Dateien. Der Seed liest ausschließlich den versionierten synthetischen Export
unter `prisma/sqlite/fixtures/` und ist wiederholbar.

Für SQLite gelten im bestätigten M2-Umfang:

- reine Kalendertage werden als kanonische `YYYY-MM-DD`-Strings gespeichert;
- absolute Zeitpunkte verwendet der Prisma-Adapter als ISO-8601-UTC-Werte,
  während die fachliche IANA-Zeitzone separat bleibt;
- Erinnerungslisten liegen als valides JSON vor und werden durch Constraint und
  Trigger auf höchstens zehn Werte zwischen 0 und 10080 Minuten begrenzt;
- Besitzgrenzen, genau ein aktiver Primärkalender sowie Zeitform, Sequenz und
  Sync-Version werden zusätzlich in SQLite erzwungen;
- jede SQL-Datei liegt in einem versionierten Migrationsverzeichnis. Der lokale
  Runner speichert eine SHA-256-Prüfsumme und lehnt nachträglich veränderte,
  bereits angewendete Migrationen ab.
- reine Datumsfelder werden nur an der zentralen Datenbankgrenze zwischen
  `Date` und `YYYY-MM-DD` umgewandelt; `/api/v1` bleibt unverändert;
- schützende Referenzen verwenden in SQLite aufgeschobenes `NO ACTION`, damit
  eine atomare Besitzerlöschung alle eigenen Datensätze entfernen kann, eine
  isolierte Löschung referenzierter Fachdaten aber weiterhin scheitert;
- `test:sqlite:api` öffnet bewusst nur seriell schreibende Test-Clients. Der
  vorgesehene Desktopbetrieb erlaubt ebenfalls nur einen schreibenden Sidecar.
- Der Migrationslauf schaltet die Datei persistent auf WAL; jede
  Anwendungsverbindung wartet bei einer belegten Schreibsperre höchstens 5000
  Millisekunden. Die SQLite-Migrationstests lesen beide Werte aus einer neuen
  Verbindung zurück.

Prisma 7.8 validiert und generiert den getrennten SQLite-Client. Ein
reproduzierter Schema-Engine-Fehler verhindert in der geprüften lokalen
Umgebung jedoch selbst bei einem Minimalmodell `prisma migrate deploy` für
SQLite. Deshalb wendet `db:sqlite:migrate` die geprüften SQL-Dateien mit
`better-sqlite3` transaktional an und führt danach `foreign_key_check` sowie
`integrity_check` aus. `prisma db push` bleibt ausdrücklich ausgeschlossen.

## PostgreSQL-Import und SQLite-Recovery

Der M4-Import benötigt eine PostgreSQL-Quelle in `DATABASE_URL` und eine noch
nicht vorhandene absolute SQLite-Zieldatei in `SQLITE_DATABASE_URL`:

```bash
export DATABASE_URL="postgresql://…"
export SQLITE_DATABASE_URL="file:/absoluter/neuer/pfad/lifeos.sqlite"
npm run db:sqlite:import
```

Der Import liest PostgreSQL in einer schreibgeschützten konsistenten
Transaktion, überträgt alle vorhandenen Modelle in eine Stagingdatei und veröffentlicht
das Ziel erst nach vollständigem Feld-, Fremdschlüssel- und
Integritätsvergleich. Ein vorhandenes Ziel wird nie überschrieben. Für den
echten Umzug soll der bisherige schreibende Betrieb pausiert werden; ändert
sich die Quelle während des Laufs, wird das Ziel nicht veröffentlicht.

Backup und Restore umfassen SQLite und das lokale Dokumentverzeichnis:

```bash
export SQLITE_DATABASE_URL="file:/absoluter/pfad/lifeos.sqlite"
export STORAGE_PATH="/absoluter/pfad/documents"
npm run db:sqlite:backup -- /absoluter/neuer/pfad/backup-20320809

export SQLITE_DATABASE_URL="file:/absoluter/neuer/pfad/restored.sqlite"
export STORAGE_PATH="/absoluter/neuer/pfad/restored-documents"
npm run db:sqlite:restore -- /absoluter/pfad/backup-20320809
```

Das Backup nutzt die SQLite Online Backup API und enthält `manifest.json`,
dessen Prüfsumme, die Datenbank sowie Dokumente mit einzelnen SHA-256-Werten.
Restore akzeptiert nur neue Ziele, prüft alle Dateien, wendet Migrationen auf
eine Stagingkopie an und veröffentlicht erst danach. Quelle, Backup,
Datenbankziel und Dokumentziel dürfen weder identisch noch ineinander
verschachtelt sein. Symbolische Links und unsichere Dokumentpfade werden
abgelehnt. Backups sind nicht verschlüsselt und müssen wie persönliche Daten
vertraulich behandelt werden.

Der isolierte Gesamtnachweis lautet:

```bash
npm run db:sqlite:verify:recovery
```

## Eigenständiges Dokumentenbackup für PostgreSQL

Ein PostgreSQL-Dump enthält keine Dateien aus `STORAGE_PATH`. Für den
Browserbetrieb werden Datenbank und Dokumente deshalb zeitlich koordiniert und
gemeinsam aufbewahrt. Das Dokumentenbackup schreibt ausschließlich in ein
neues absolutes Ziel:

```bash
export STORAGE_PATH="/absoluter/pfad/documents"
npm run documents:backup -- /absoluter/neuer/pfad/documents-backup
```

`manifest.json`, `manifest.sha256` und die Prüfsumme jeder Datei schützen den
Inhalt. Symbolische Links, Traversal-Pfade, fehlende Dateien, manipulierte
Prüfsummen, bestehende Ziele und ein Backup innerhalb der Quelle werden
abgewiesen. Restore benötigt ebenfalls ein neues, noch nicht vorhandenes und
nicht im Backup liegendes `STORAGE_PATH`:

```bash
export STORAGE_PATH="/absoluter/neuer/pfad/restored-documents"
npm run documents:restore -- /absoluter/pfad/documents-backup
```

Die Sicherung ist unverschlüsselt und vertraulich. Für einen konsistenten
Zeitpunkt soll die API während Datenbank- und Dokumentenbackup keine
Schreibaktionen annehmen.

## Neue Schemaänderung entwickeln

Eine neue Migration wird zunächst ohne Anwendung erzeugt:

```bash
npm run db:migrate:dev --workspace @lifeos/database -- --name kurze_beschreibung --create-only
```

Anschließend das erzeugte SQL auf Datenverlust, Sperren, Umbenennungen und
notwendige Datenübernahme prüfen. Erst danach anwenden:

```bash
npm run db:migrate
```

`prisma db push` ist kein regulärer LifeOS-Ablauf, weil dabei keine prüfbare
Migrationshistorie entsteht. Bereits angewendete Migrationen werden nicht
nachträglich verändert; jede Korrektur erhält eine neue Migration.

## Backup und Kompatibilität

Vor jeder potenziell verlustbehafteten Migration wird mit `npm run db:backup`
ein PostgreSQL-Backup in das ignorierte Verzeichnis `backups/` geschrieben und
mit `npm run db:verify:recovery` durch eine Wiederherstellung mit synthetischen
Daten geprüft. Der Nachweis überschreibt niemals die konfigurierte Datenbank.
Der sichere reale Wiederherstellungsablauf steht in
[`docs/foundation-verification.md`](../../docs/foundation-verification.md).
Der aktuelle Zwei-Versionen-Nachweis verwendet dieselbe SQLite- und
Dokumentablage für 0.1.0, 0.6.0 und den Rollback auf 0.1.0. Anschließend wird
das 0.6.0-Backup in ausschließlich neue Ziele restauriert und erneut geprüft;
Details stehen im
[`lokalen Roadmap-0.6-Nachweis`](../../docs/roadmap-06-local-demo.md).

Interne Umbenennungen müssen Daten in einer neuen Migration übernehmen. Stabile
Benutzer-/Kalender-IDs, Ereignis-UIDs, ETags und CalDAV-Synchronisationswerte
dürfen dabei nicht neu erzeugt oder stillschweigend überschrieben werden.
