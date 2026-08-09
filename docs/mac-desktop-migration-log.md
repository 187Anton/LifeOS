# Migrationsprotokoll: Mac-App und SQLite

Stand: 9. August 2026

Dieses Dokument ist der fortlaufende Nachweis für die in
[`mac-desktop-spike-plan.md`](mac-desktop-spike-plan.md) beschriebene Migration.
Ein Arbeitspaket gilt erst als abgeschlossen, wenn sein Ergebnis hier mit
tatsächlich ausgeführten Prüfungen dokumentiert ist.

## Statusübersicht

| Paket                             | Status        | Letzter Nachweis |
| --------------------------------- | ------------- | ---------------- |
| M0 – Ziel und Ausführungsplan     | abgeschlossen | 9. August 2026   |
| M1 – SQLite-Schema und Migration  | abgeschlossen | 9. August 2026   |
| M2 – API ohne Docker              | abgeschlossen | 9. August 2026   |
| M3 – Kalender- und CalDAV-Parität | offen         | –                |
| M4 – Datenübernahme und Recovery  | offen         | –                |
| M5 – Tauri-Sidecar                | offen         | –                |
| M6 – Installation und Update      | offen         | –                |
| M7 – Abschlussdokumentation       | offen         | –                |

## Nachweisvorlage

Jeder neue Eintrag verwendet diese Struktur:

- **Datum und Paket:**
- **Befund:**
- **Ursache oder Entscheidung:**
- **Änderungsumfang:**
- **Verifikation:**
- **Datenvergleich:**
- **Risiken und Grenzen:**
- **Nächster Schritt:**

Fehlgeschlagene Prüfungen werden mit Ursache und Auswirkung festgehalten. Ein
offener Handtest oder ein nicht geprüftes Release-Gate darf nicht als Erfolg
formuliert werden.

## 9. August 2026 – M0: Ziel und Ausführungsplan

- **Befund:** Der vorhandene Spike beschrieb Tauri, SQLite, sechs technische
  Arbeitspakete und Stop-Gates. Eine übergreifende Erfolgsdefinition, ein
  sichtbarer Paketstatus und ein einheitliches fortlaufendes Nachweisformat
  fehlten noch.
- **Ursache oder Entscheidung:** Die Migration wird als Folge einzeln
  freizugebender Pakete M1 bis M7 durchgeführt. Der nächste Schritt beginnt
  erst nach bestandenem Gate; PostgreSQL bleibt bis zum geprüften Import und
  Recovery-Nachweis erhalten.
- **Änderungsumfang:** Der Spike-Plan enthält jetzt das verbindliche
  Migrationsziel, Status und Gates, Dokumentationspflicht sowie Schutz- und
  Rückfallprinzip. Die Roadmap verweist auf dieses Protokoll.
- **Verifikation:** Markdown-Formatprüfung, Repository-Tests, Secret-Scan und
  Git-Diff-Prüfung wurden erfolgreich ausgeführt.
- **Datenvergleich:** Nicht anwendbar; M0 ändert keine Daten und kein
  Datenbankschema.
- **Risiken und Grenzen:** SQLite-, Sidecar-, Installations- und
  Recovery-Eigenschaften sind weiterhin Planungsannahmen und werden erst in M1
  bis M6 bewiesen.
- **Nächster Schritt:** M1 als eigenes Arbeitspaket planen und das
  repräsentative SQLite-Schema ausschließlich mit synthetischen Daten
  implementieren.

## 9. August 2026 – M1: SQLite-Schema und Migration

- **Befund:** Das PostgreSQL-Prisma-Schema enthält nicht direkt übertragbare
  Nativtypen, reine `DATE`-Felder und primitive Arrays. Prisma 7.8 validiert und
  generiert ein getrenntes SQLite-Schema. `prisma migrate deploy` scheitert in
  der geprüften lokalen Umgebung jedoch selbst bei einem Minimalmodell vor der
  SQL-Anwendung mit einem unspezifischen Schema-Engine-Fehler; das identische
  SQL lässt sich direkt fehlerfrei anwenden.
- **Ursache oder Entscheidung:** SQLite erhält einen eigenen Schema- und
  Migrationspfad. Reine Tage werden als kanonische `YYYY-MM-DD`-Strings und
  Erinnerungen als geprüftes JSON gespeichert. Ein kleiner
  `better-sqlite3`-Runner wendet ausschließlich sortierte versionierte
  SQL-Dateien transaktional an, speichert deren SHA-256-Prüfsumme und prüft
  anschließend Fremdschlüssel und Datenbankintegrität.
- **Änderungsumfang:** Repräsentative Modelle für Benutzer, Einstellungen,
  Zugangsdaten, Sitzung, CalDAV-Zugang, Kalender, Kalenderereignisse und Audit;
  eine SQLite-Grundmigration; ein synthetischer PostgreSQL-Export; wiederholbarer
  Import; getrennte Prisma-Konfiguration und drei Integrationstests. Das
  PostgreSQL-Schema und sämtliche vorhandenen PostgreSQL-Migrationen wurden
  nicht verändert.
- **Verifikation:** `db:sqlite:validate`, `db:sqlite:generate`,
  `db:sqlite:migrate`, zweimaliger `db:sqlite:seed`, TypeScript-Prüfung und drei
  SQLite-Integrationstests wurden erfolgreich ausgeführt. Zusätzlich bestanden
  Formatprüfung, Secret-Scan, Compose-Prüfung, vollständige Typprüfung, Linting,
  API- und Web-Build sowie 102 Tests: 12 Repository-, 39 API-, 26 Web-Unit-, 16
  Browser-E2E- und neun Datenbanktests.
- **Datenvergleich:** Ein zeitgebundener und ein ganztägiger Termin behalten ID,
  UID, ETag, Sequenz, Sync-Version, Kalender-Sync-Token, IANA-Zeitzone,
  Erinnerungen und Zeitform. Wiederholte Migration und wiederholter Seed ändern
  den ersten Snapshot nicht.
- **Risiken und Grenzen:** Die API verwendet noch PostgreSQL. ETag-Konkurrenz,
  kompletter CalDAV-Roundtrip, WAL-/Sperrverhalten, Backup, Sidecar und DMG sind
  noch nicht bewiesen. Der Prisma-Schema-Engine-Fehler wird nicht als gelöste
  Upstream-Ursache dargestellt. `npm audit --omit=dev` meldete sechs bereits im
  Ausgangs-Lockfile vorhandene transitive Tooling-Advisories; keiner der
  gemeldeten Pfade führt über den neuen SQLite-Adapter. Ihre Aktualisierung ist
  ein getrenntes Sicherheitsarbeitspaket.
- **Nächster Schritt:** M2 bindet den SQLite-Client hinter der zentralen
  Datenbankschnittstelle an und prüft das gebaute Express-Backend ohne Docker,
  ohne den `/api/v1`-Vertrag zu ändern.

## 9. August 2026 – M2: API ohne Docker auf SQLite

- **Befund:** Der bestehende API-Kern war nur an den PostgreSQL-Adapter
  gebunden. Das erste vollständige SQLite-Schema zeigte zwei konkrete
  Connector-Abweichungen: sofortiges `RESTRICT` blockierte eine atomare
  Besitzerlöschung, und `createMany(..., skipDuplicates)` wird für SQLite
  nicht unterstützt. Eine doppelte Ergebnisumwandlung an der
  Transaktionsgrenze verlängerte reine Datumswerte zunächst irrtümlich zu
  ISO-Zeitpunkten.
- **Ursache oder Entscheidung:** Die API erkennt den Provider ausschließlich
  an der validierten Datenbank-URL. Eine kleine Kompatibilitätsschicht wandelt
  nur die sieben reinen Datumsfelder zwischen `Date` und `YYYY-MM-DD` um.
  SQLite bildet schützende Referenzen mit aufgeschobenem `NO ACTION` statt
  sofortigem `RESTRICT` ab; Aufgaben-Termin-Beziehungen verwenden ein
  providerneutrales, idempotentes `upsert`. API-Verträge und PostgreSQL-Schema
  bleiben unverändert.
- **Änderungsumfang:** Zweite versionierte SQLite-Migration für Projekte,
  Aufgaben, Aufgaben-Termin-Beziehungen, Studium, Arbeit und Verfügbarkeit;
  providerabhängige Client-Fabrik; SQLite-Kompatibilitätsclient; absolute
  `file:`-Konfiguration der API; portable Dashboard-Transaktion;
  reproduzierbare SQLite-API-Suite und Neustartprüfung der gebauten API.
- **Verifikation:** SQLite-Schema validierte und generierte mit Prisma 7.8.
  Neun Datenbanktests und alle 41 API-Tests bestanden auf einer frisch
  migrierten SQLite-Datei. Der gebaute Server startete zweimal ohne Docker,
  meldete Readiness und bestand den Persistenzvergleich. Anschließend
  bestanden dieselben neun Datenbank- und 41 API-Tests auf PostgreSQL; der
  Container wurde danach datenerhaltend gestoppt. Der unveränderte Webweg
  bestand 26 Unit- und 16 Browser-E2E-Tests auf Desktop- und Mobile-Profilen.
- **Datenvergleich:** Benutzer und Anmeldung, geänderte Profilzeitzone,
  Kalenderansicht, Wochenendanzeige, Kalender-ID, ganztägige UID und exklusive
  Datumsgrenzen sowie Aufgaben-ID, Titel und Fälligkeit waren nach einem echten
  Prozessneustart identisch. Die bestehende CalDAV-Suite bestätigte zusätzlich
  Discovery, Ereignis-CRUD, ETags, Sync-Token, Tombstones, Zeitzonen,
  Wiederholung und Erinnerungen auf SQLite.
- **Risiken und Grenzen:** Die SQLite-API-Suite läuft bewusst seriell, weil die
  Testdateien jeweils eigene schreibende Clients öffnen; der Zielbetrieb hat
  genau einen Sidecar als schreibenden Prozess. WAL-Modus, Wartezeit bei
  Sperren und zwei tatsächlich konkurrierende ETag-Änderungen sind noch nicht
  geprüft. Der Nachweis verwendet das lokal installierte Node.js; dessen
  Sidecar-Paketierung folgt erst in M5. Backup, Import und physischer
  Apple-Kalender-Test sind ebenfalls offen.
- **Nächster Schritt:** M3 aktiviert und prüft die SQLite-Betriebsparameter und
  beweist REST-/CalDAV-Parität einschließlich konkurrierendem ETag-Konflikt und
  unverändertem Sync-Token des Verlierers.
