# Datenbank

Dieses Workspace-Paket enthält das produktive Prisma-7-PostgreSQL-Schema, die
zugehörigen versionierten Migrationen, den zentralen Prisma-Client und
ausschließlich synthetische Entwicklungsdaten. Zusätzlich gibt es einen klar
getrennten, repräsentativen SQLite-Migrationspfad für die Mac-App-Migration.

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
- `Project` ist zunächst ein kleiner, besitzgebundener Projektanker für
  Aufgaben. Die vollständige Projekt- und Meilensteinverwaltung bleibt
  Roadmap 0.4 vorbehalten.
- `Task` speichert Titel, Beschreibung, Status, Priorität, Fälligkeit,
  optionale Startplanung, ganzzahlige Dauerminuten, Tags, Bereich,
  Projekt-/Elternbezug sowie Abschluss-, Archivierungs- und Löschzeitpunkte.
  Zusammengesetzte Fremdschlüssel verhindern fremde Elternaufgaben oder
  Projektzuordnungen.
- `TaskEventLink` speichert ausschließlich die besitzgebundene Beziehung
  zwischen Aufgabe und Kalenderereignis. Eine zusammengesetzte Eindeutigkeit
  verhindert Duplikate; Fachdaten werden nicht kopiert.
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
  Beziehung und ein Audit-Ereignis an.
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

## Repräsentativer SQLite-Migrationspfad

Der M1-Spike bildet Benutzer, Einstellungen, Web- und CalDAV-Zugang, Sitzungen,
Kalender, Kalenderereignisse und Audit-Ereignisse ab. Er ersetzt noch nicht den
PostgreSQL-Betrieb der API. PostgreSQL-Schema und vorhandene Migrationen bleiben
unverändert.

Eine isolierte SQLite-Datei wird so geprüft:

```bash
export SQLITE_DATABASE_URL="file:/absoluter/pfad/lifeos.sqlite"
npm run db:sqlite:validate
npm run db:sqlite:generate
npm run db:sqlite:migrate
npm run db:sqlite:seed
npm run db:sqlite:test
unset SQLITE_DATABASE_URL
```

Ohne gesetzte Variable verwenden die lokalen Befehle die ignorierte Datei
`data/sqlite-development.sqlite`. Tests erzeugen immer eigene temporäre
Dateien. Der Seed liest ausschließlich den versionierten synthetischen Export
unter `prisma/sqlite/fixtures/` und ist wiederholbar.

Für SQLite gelten im bestätigten M1-Umfang:

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

Prisma 7.8 validiert und generiert den getrennten SQLite-Client. Ein
reproduzierter Schema-Engine-Fehler verhindert in der geprüften lokalen
Umgebung jedoch selbst bei einem Minimalmodell `prisma migrate deploy` für
SQLite. Deshalb wendet `db:sqlite:migrate` die geprüften SQL-Dateien mit
`better-sqlite3` transaktional an und führt danach `foreign_key_check` sowie
`integrity_check` aus. `prisma db push` bleibt ausdrücklich ausgeschlossen.

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

Interne Umbenennungen müssen Daten in einer neuen Migration übernehmen. Stabile
Benutzer-/Kalender-IDs, Ereignis-UIDs, ETags und CalDAV-Synchronisationswerte
dürfen dabei nicht neu erzeugt oder stillschweigend überschrieben werden.
