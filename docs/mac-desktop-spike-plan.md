# Technische Spike-Planung: lokale Mac-App und SQLite

Stand: 9. August 2026

Ausgangsstand: `origin/develop` bei `830fb77`

## Ziel und Grenze dieses Arbeitspakets

Dieses Dokument hält die Bestandsaufnahme und den Migrationsplan für eine
installierbare lokale Mac-App fest. Es ist noch kein Nachweis, dass SQLite,
Tauri, Backup oder CalDAV in der neuen Betriebsart produktionsreif sind.

Der Spike soll die bestehende React-Oberfläche, die Express-API, den
Kalenderkern und CalDAV erhalten. Er führt keine Cloud, keine Microservices und
keine externe KI ein. Bestehende PostgreSQL-Migrationen werden weder geändert
noch gelöscht.

## Befund

### Bestehender Anwendungskern

- Die React-/Vite-Oberfläche verwendet ausschließlich den versionierten
  Vertrag unter `/api/v1`; Entwicklung und Vorschau leiten `/api` derzeit an
  `127.0.0.1:3000` weiter.
- Die Node-/Express-API kann bereits als gebautes JavaScript mit
  `node dist/server.js` gestartet werden. Sie ist fachlich nicht an Docker,
  aber aktuell an eine PostgreSQL-URL und den PostgreSQL-Prisma-Adapter
  gebunden.
- REST und CalDAV verwenden denselben Kalender-Service und denselben
  persistenten Kalenderkern. CalDAV unterstützt bereits Lesen, Erstellen,
  Ändern, Löschen, ETags, Sync-Token, Tombstones, Zeitzonen, Wiederholungen und
  Erinnerungen.
- Ereignisänderungen vergleichen den erwarteten ETag und schreiben Ereignis,
  Sequenz, `syncVersion`, Kalender-`syncToken` und Audit-Ereignis in einer
  Transaktion. Dieses Verhalten ist zu bewahren und unter SQLite erneut mit
  konkurrierenden Schreibzugriffen zu beweisen.
- Datenbankstart, Backup, Restore und Recovery-Nachweis verwenden derzeit
  Docker- und PostgreSQL-Werkzeuge. Es gibt noch keine Tauri-Anwendung und
  keinen produktiven lokalen Dokumentenspeicher.

### Tatsächlich installierte Prisma-Version

Lokal geprüft wurden Prisma CLI und Prisma Client `7.8.0` auf macOS ARM64. Ein
temporäres, nicht versioniertes Prüfschema bestätigt:

- `provider = "sqlite"`, UUID-Standardwerte, `DateTime`, `Decimal`, `Json` und
  Prisma-Enums werden vom installierten Schema-Validator akzeptiert.
- Primitive Listen werden nicht unterstützt. Betroffen sind aktuell
  `CalendarEvent.reminderMinutes`, `Task.tags` und
  `StudyModule.documentReferences`.
- PostgreSQL-Nativtypen wie `@db.Date` werden vom SQLite-Connector abgelehnt.
  Dasselbe gilt für die vorhandenen Attribute für `UUID`, `TIMESTAMPTZ`,
  `VARCHAR`, `CHAR`, `TEXT` und `DECIMAL`.
- `@prisma/adapter-better-sqlite3` und `better-sqlite3` sind noch nicht
  installiert. Der vorhandene Client wird ausschließlich mit
  `@prisma/adapter-pg` erzeugt und gestartet.

Prisma unterstützt SQLite in dieser Version damit grundsätzlich. Das aktuelle
Schema und die PostgreSQL-Migrationen sind jedoch nicht direkt portierbar.

### PostgreSQL-spezifische Modellbestandteile

Das aktuelle Schema enthält 19 Modelle, sieben Enums und unter anderem:

- 57 `TIMESTAMPTZ`-, sieben `DATE`- und 51 `UUID`-Attribute;
- drei primitive Array-Felder;
- ein JSON-Feld sowie zwei Dezimalfelder;
- PostgreSQL-Enumtypen, reguläre Ausdrücke in `CHECK`-Constraints,
  `btrim`, `cardinality`, `array_position` und Typ-Casts;
- einen partiellen eindeutigen Index für genau einen aktiven Primärkalender;
- zusammengesetzte Fremdschlüssel, Besitzgrenzen und zahlreiche fachliche
  `CHECK`-Constraints.

SQLite kann Fremdschlüssel, Transaktionen, `CHECK`-Constraints und partielle
Indizes abbilden. Die vorhandenen PostgreSQL-SQL-Dateien können dafür aber
nicht wiederverwendet werden. Ausdrücke und Datendarstellung müssen als neue,
getrennte SQLite-Migrationen implementiert und getestet werden.

Besonders wichtig ist die Datumsdarstellung: SQLite besitzt keinen eigenen
`DATE`- oder `TIMESTAMPTZ`-Speichertyp. Für reine Kalendertage soll der
SQLite-Prototyp kanonische `YYYY-MM-DD`-Strings verwenden. Absolute Zeitpunkte
werden als eindeutig normalisierte UTC-Werte gespeichert; die fachliche
IANA-Zeitzone bleibt ein eigenes Feld. Damit bleiben Ganztagsdaten unabhängig
von lokaler Uhrzeit und Sommerzeit.

## Entscheidung für den Spike

### Tauri als Hülle, bestehendes Node-Backend als Sidecar

Für den Spike wird keine Backend-Neuschreibung in Rust begonnen. Die kleinste
robuste Variante ist:

1. Tauri 2 verwaltet Fenster, Start, Beendigung und lokale Verzeichnisse.
2. Das bestehende gebaute Node-/Express-Backend wird als externer Sidecar
   paketiert und von Tauri gestartet.
3. Express stellt im Desktopbetrieb zusätzlich den gebauten Webinhalt bereit.
   Das Tauri-Fenster lädt anschließend dieselbe Loopback-URL wie ein Browser.
4. REST, Sitzungscookie und CalDAV bleiben dadurch an einem gemeinsamen
   lokalen HTTP-Ursprung. Der Browserbetrieb verwendet weiterhin denselben
   `/api/v1`-Vertrag.

Diese Wahl erhält die vorhandene Fachlogik und vermeidet zwei API- oder
Kalenderimplementierungen. Noch offen ist, welche reproduzierbare
Sidecar-Paketierung Prisma, den Node-Laufzeitanteil und das native
`better-sqlite3`-Modul zuverlässig für macOS ARM64 und später gegebenenfalls
x64 bündelt. Das ist ein eigenes Spike-Gate; ein erfolgreicher normaler
`tsup`-Build beweist die Paketierbarkeit noch nicht.

### Lokale Verzeichnisse auf macOS

Tauri ermittelt die Pfade zur Laufzeit; Pfade werden nicht aus `$HOME`
zusammengesetzt. Für den Prototyp gilt folgende Aufteilung innerhalb der
anwendungsspezifischen macOS-Verzeichnisse:

- App-Daten: `data/lifeos.db` einschließlich SQLite-WAL-/SHM-Dateien;
- persönliche Dokumente: `documents/`;
- Backups: `backups/` mit Datenbankabbild, Dokumenten und Manifest;
- nicht geheime Konfiguration: App-Konfigurationsverzeichnis;
- Logs: App-Log-Verzeichnis, ohne Anfragekörper, Cookies oder Zugangsdaten;
- gebündelte, unveränderliche Web- und Sidecar-Dateien: Tauri-Ressourcen.

Die Datenbank und persönlichen Dokumente dürfen nicht im App-Bundle liegen,
weil dieses nicht als beschreibbarer Datenspeicher dient. Der genaue
Bundle-Identifier wird erst mit dem Tauri-Scaffold festgelegt.

### SQLite-Betriebsregeln für den Prototyp

- Eine Anwendung beziehungsweise ein Sidecar ist der einzige schreibende
  Prozess.
- Fremdschlüssel werden bei jeder Verbindung nachweislich aktiviert.
- WAL-Modus und eine begrenzte Wartezeit bei Sperren werden geprüft, nicht nur
  angenommen.
- ETag-Vergleich und Änderung bleiben eine Transaktion. Ein fehlgeschlagener
  Vergleich muss auch die Erhöhung des Sync-Tokens zurückrollen.
- Arrays werden zunächst als versioniertes JSON mit API-seitiger Validierung
  und Datenbank-`CHECK` für gültiges JSON abgebildet. Für später häufig
  abzufragende Werte ist eine normalisierte Kindtabelle vorzuziehen.
- PostgreSQL-Daten werden nur über einen expliziten Export-/Importlauf in eine
  neue SQLite-Datei übernommen. Quelle und vorhandene Migrationen bleiben
  erhalten, bis Datenvergleich und Recovery-Test erfolgreich sind.

## Kleinteilige Arbeitspakete

### M1 – Repräsentatives SQLite-Schema und Migration

Umfang:

- getrennten SQLite-Schema- und Migrationspfad anlegen;
- Benutzer, Einstellungen, Zugangsdaten, Sitzungen, Kalender,
  Kalenderereignis und Audit-Ereignis abbilden;
- mindestens einen zeitgebundenen und einen ganztägigen Termin migrieren;
- UUIDs, UIDs, ETags, Sequenzen, Sync-Versionen und Sync-Token unverändert
  übernehmen;
- reine Daten, Zeitpunkte, JSON-Felder und das Erinnerungsarray SQLite-gerecht
  modellieren.

Akzeptanzkriterien:

- Prisma 7.8 validiert und generiert den SQLite-Client.
- Eine leere Datei wird ausschließlich über versionierte Migrationen erstellt.
- Seed und wiederholte Migration verändern vorhandene synthetische Daten nicht.
- Ungültige Besitzbezüge, gemischte Zeitformen und ungültige Ganztagsgrenzen
  werden von Datenbank oder validierter Fachgrenze abgelehnt.
- PostgreSQL-Schema und vorhandene Migrationen bleiben unverändert.

### M2 – API ohne Docker auf SQLite starten

Umfang:

- Datenbankkonfiguration von der fest verdrahteten PostgreSQL-URL lösen;
- SQLite-Client hinter der bestehenden zentralen Datenbankschnittstelle
  anbinden;
- einen expliziten lokalen Datenpfad verwenden;
- API, Profil, Einstellungen und Kalender mit gebautem Backend starten.

Akzeptanzkriterien:

- `node dist/server.js` startet mit einer neu migrierten SQLite-Datei ohne
  Docker und meldet Readiness.
- Anmeldung, Einstellungsänderung und Kalender-CRUD funktionieren über den
  unveränderten `/api/v1`-Vertrag.
- Der Browser-Entwicklungsbetrieb über Vite funktioniert weiterhin.
- Neustart erhält Benutzer, Einstellungen und Termine.

### M3 – Kalender- und CalDAV-Parität

Umfang:

- REST und CalDAV gegen denselben SQLite-Kalenderkern ausführen;
- CRUD, Ganztag, Zeitzone, RRULE, Erinnerung, ETag, Sync-Token und Tombstones
  prüfen;
- zwei parallele Änderungen mit demselben alten ETag ausführen;
- Apple-Kalender-Handtest auf demselben Mac und anschließend im lokalen Netz
  dokumentieren.

Akzeptanzkriterien:

- Lesen, Erstellen, Ändern und Löschen funktionieren über REST und CalDAV.
- Genau eine parallele Änderung gewinnt; die andere erhält einen Konflikt und
  erhöht den Sync-Token nicht.
- UID, ETag, Sequenz, Sync-Version, Ganztagsgrenzen und IANA-Zeitzone bleiben
  nach Neustart stabil.
- Eine physische Apple-Kalender-Prüfung ist entweder erfolgreich dokumentiert
  oder ausdrücklich als offen markiert.

### M4 – SQLite-Backup und sichere Wiederherstellung

Umfang:

- laufendes Backup über die SQLite Online Backup API erzeugen;
- SHA-256-Prüfsumme und versioniertes Manifest ergänzen;
- Dokumentverzeichnis zusammen mit der Datenbank berücksichtigen;
- Restore immer zunächst in ein neues Ziel durchführen;
- `integrity_check`, Migration und stabilen Datenvergleich automatisieren.

Akzeptanzkriterien:

- Backup während des lokalen Betriebs erzeugt ein lesbares, nicht leeres
  Datenbankabbild.
- Eine veränderte Prüfsumme wird abgelehnt.
- Restore überschreibt niemals ungeprüft die aktive Datei.
- Wiederhergestellte IDs, UIDs, ETags, Sync-Werte, Zeitformen und Dokumente
  entsprechen dem Ausgangsstand.

### M5 – Reproduzierbarer Tauri-Sidecar-Prototyp

Umfang:

- minimale Tauri-2-App mit vorhandener React-Oberfläche anlegen;
- Node-/Express-Sidecar für macOS ARM64 reproduzierbar paketieren;
- App-Datenpfade an den Sidecar übergeben;
- Sidecar starten, Readiness abwarten, Fenster auf die lokale Oberfläche
  richten und beim App-Ende geordnet beenden;
- Portkonflikt und Sidecar-Absturz verständlich anzeigen.

Akzeptanzkriterien:

- ein frischer Entwickler-Checkout baut den Prototyp mit dokumentierten
  Befehlen;
- die App startet Weboberfläche und Backend ohne global installiertes Node und
  ohne Docker;
- genau ein Sidecar läuft, wird beim Schließen beendet und hinterlässt keine
  beschädigte Datenbank;
- separater Browserzugriff verwendet denselben API-Vertrag;
- CalDAV ist erreichbar, solange App beziehungsweise lokaler Dienst läuft.

### M6 – DMG-, Update- und Installationsnachweis

Umfang:

- `.app` und `.dmg` für den zunächst unterstützten Mac-Typ bauen;
- Installation, Erststart, Neustart, Backup, Restore und Deinstallation mit
  synthetischen Daten prüfen;
- Signierung, Notarisierung, Intel-/Universal-Build und Updateverfahren als
  geprüfte Ergebnisse oder offene Release-Gates dokumentieren;
- README erst auf den tatsächlich funktionierenden Weg umstellen.

Akzeptanzkriterien:

- das DMG startet auf einem sauberen unterstützten Mac ohne Docker und ohne
  separate Node-Installation;
- ein App-Update erhält Datenbank, Dokumente und CalDAV-Identitäten;
- die README trennt Entwicklerbetrieb, Browserbetrieb und installierte App;
- nicht geprüfte Release-Gates werden nicht als fertig bezeichnet.

## Reihenfolge und Stop-Gates

Die Pakete werden in der Reihenfolge M1 bis M6 umgesetzt. Nach jedem Paket
werden Befund, Ursache beziehungsweise Entscheidung, geänderte Dateien, Tests,
Risiken und der nächste Schritt dokumentiert.

Der Umbau stoppt zur Architekturprüfung, wenn eines dieser Gates scheitert:

- SQLite kann die ETag-/Sync-Transaktion nicht konfliktfrei abbilden;
- Ganztagsdaten oder Zeitzonen verlieren beim Roundtrip ihre Bedeutung;
- Backup und Restore erhalten stabile Identitäten nicht;
- das native SQLite-Modul lässt sich nicht reproduzierbar in den Sidecar
  paketieren;
- Tauri und Browserbetrieb benötigen unterschiedliche API-Verträge;
- CalDAV ist nur durch eine zweite Kalenderimplementierung möglich.

In diesem Fall wird die konkrete Ursache dokumentiert. Eine größere
Neuschreibung oder eine Cloud-Datenbank wird nicht automatisch begonnen.

## Offene Risiken

- Die native `better-sqlite3`-Binärdatei muss zur Node-Version und zur
  Mac-Architektur des Sidecars passen.
- SQLite erlaubt nur einen gleichzeitigen Schreiber. Für die persönliche lokale
  Einzelplatzanwendung ist das plausibel, muss aber mit REST und CalDAV unter
  konkurrierenden Zugriffen gemessen werden.
- Prisma-Enums werden bei SQLite auf Prisma-Ebene abgebildet. Kritische Regeln
  benötigen deshalb zusätzlich geprüfte Datenbank-Constraints oder eine
  validierte Schreibgrenze.
- Die Umstellung der reinen Datumsfelder auf kanonische Strings verändert
  interne Prisma-Typen und benötigt schmale Abbildungen an den
  Repository-Grenzen. Der öffentliche API-Vertrag soll unverändert bleiben.
- Signierung, Notarisierung und ein Universal-Build sind nicht Teil des ersten
  Architekturspikes.
- Zugriff eines iPhones auf CalDAV erfordert weiterhin eine bewusste
  LAN-Bindung; `localhost` auf dem iPhone zeigt nicht auf den Mac.

## Technische Quellen

- [Prisma: SQLite connector](https://docs.prisma.io/docs/orm/v6/overview/databases/sqlite)
- [Prisma: Database features](https://www.prisma.io/docs/orm/reference/database-features)
- [Tauri: Node.js as a sidecar](https://v2.tauri.app/learn/sidecar-nodejs/)
- [Tauri: DMG](https://v2.tauri.app/distribute/dmg/)
- [Tauri: File system](https://v2.tauri.app/plugin/file-system/)
- [SQLite: Online Backup API](https://www.sqlite.org/backup.html)
