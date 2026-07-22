# Datenbank

Dieses Workspace-Paket enthält das Prisma-7-Schema, versionierte PostgreSQL-
Migrationen, den zentralen Prisma-Client und ausschließlich synthetische
Entwicklungsdaten.

## Datenmodell des Fundaments

- `User` ist der persönliche Besitzer aller Daten und hat eine stabile externe
  ID.
- `UserSettings` speichert Zeitzone, Währung, Sprache, Wochenbeginn und
  Kalenderansicht getrennt vom Benutzerstammsatz.
- `UserCredential` enthält ausschließlich den versionierten Passwort-Hash.
- `UserSession` speichert nur den SHA-256-Hash eines zufälligen Tokens,
  Ablaufzeit, Zugangsversion und optionalen Widerrufszeitpunkt.
- `Calendar` gehört immer zu einem Benutzer. `externalId` bleibt als stabile
  Kalenderkennung erhalten.
- `CalendarEvent` trägt zusätzlich zur Kalender-ID die Benutzer-ID. Ein
  zusammengesetzter Fremdschlüssel verhindert, dass ein Ereignis versehentlich
  einem Kalender eines anderen Benutzers zugeordnet wird. UID und ETag bleiben
  stabil bzw. versionsbezogen; Wiederholungsregeln und bis zu zehn
  Erinnerungszeitpunkte werden verlustarm gespeichert.
- `AuditEvent` hält nachvollziehbare Änderungen mit Benutzer- und
  Entitätsbezug fest; Secrets gehören nicht in `metadata`.

Zeitpunkte werden als PostgreSQL `TIMESTAMPTZ` gespeichert und von der
Anwendung als UTC-Zeitpunkte behandelt. Die IANA-Zeitzone, etwa
`Europe/Berlin`, bleibt separat erhalten. Ganztägige Ereignisse verwenden
`startDate` und `endDate` als reine `DATE`-Werte; `endDate` ist wie in
iCalendar exklusiv. Eine Datenbankbedingung verhindert gemischte oder
unvollständige Zeitangaben.

Kalender und Ereignisse werden fachlich per `deletedAt` soft gelöscht. Jede
Ereignisänderung erhöht den Kalender-`syncToken`; Änderungen mit ETag verwenden
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
```

- `db:validate` prüft Schema und Prisma-Konfiguration.
- `db:generate` erzeugt den nicht versionierten TypeScript-Client.
- `db:migrate` wendet ausschließlich vorhandene, versionierte Migrationen an.
- `db:seed` legt wiederholbar dieselbe synthetische Person, Einstellungen,
  einen Kalender, ein Ereignis und ein Audit-Ereignis an.
- `db:test` speichert und liest einen eigenen synthetischen Datensatz und
  entfernt ihn anschließend wieder.

Das lokale Passwort wird getrennt vom Seed mit `npm run auth:bootstrap`
gesetzt. Dadurch liegt kein funktionsfähiges Standardpasswort im Repository.
Ein erneuter Bootstrap erhöht die Zugangsversion und widerruft vorhandene
Sitzungen.

Der Seed muss ausdrücklich ausgeführt werden. Prisma 7 startet ihn nicht mehr
automatisch zusammen mit einer Migration.

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

Vor jeder potenziell verlustbehafteten Migration wird ein PostgreSQL-Backup in
das ignorierte Verzeichnis `backups/` geschrieben und durch eine
Wiederherstellung mit synthetischen Daten geprüft. Die automatisierten Backup-
und Restore-Abläufe folgen im Absicherungspaket 0.1.9.

Interne Umbenennungen müssen Daten in einer neuen Migration übernehmen. Stabile
Benutzer-/Kalender-IDs, Ereignis-UIDs, ETags und CalDAV-Synchronisationswerte
dürfen dabei nicht neu erzeugt oder stillschweigend überschrieben werden.
