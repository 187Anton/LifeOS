# Architektur

## Ziel

Das Life OS wird zunächst als modularer Monolith betrieben:

```text
Browser / PWA
│
▼
React-Weboberfläche ── REST/API ── Node.js-Backend
│
├── PostgreSQL
├── lokaler Dokumentenspeicher
└── CalDAV-Schnittstelle
```

## Bewusste Grenzen

- Keine Microservices im MVP.
- Keine öffentliche Registrierung.
- Keine Cloudpflicht.
- Keine automatische Bankintegration.
- Keine externe KI-Verarbeitung ohne Freigabe.
- Keine vollständige native App im ersten Schritt.

## Weboberfläche und PWA

Desktop und Smartphone verwenden dieselbe React-Anwendung. Eine separate
Mobile-App oder zweite PWA-Oberfläche gibt es nicht. Der Browser spricht die
versionierte REST-API über denselben Ursprung beziehungsweise einen lokalen
`/api`-Proxy an; Kalenderänderungen landen dadurch im gemeinsamen Kern und
werden auch über CalDAV sichtbar.

Aufgaben verwenden dieselbe Shell und die geschützte `/api/v1/tasks`-API.
Erstellen, Bearbeiten, Statuswechsel, Archivierung und Soft-Delete werden
serverseitig gespeichert. Suche und kombinierbare Filter werden für die lokal
geladene Aufgabenliste im React-Zustand berechnet und weder persistiert noch
vom Service Worker gecacht.

Vite erzeugt ein Web-App-Manifest und einen Service Worker. Der Service Worker
cached ausschließlich die statische App-Shell. REST-Antworten und persönliche
Kalenderdaten sind von Laufzeit-Caching ausgeschlossen. Die Oberfläche nutzt
weder `localStorage` noch `sessionStorage` für Zugangsdaten oder Fachdaten; das
serverseitig geprüfte Sitzungstoken liegt ausschließlich in einem
`HttpOnly`-/`SameSite=Strict`-Cookie. Notwendige Schriften und Icons sind lokal
verfügbar, sodass die App-Shell keine externe Quelle benötigt.

## API-Grundgerüst

Die Express-API beginnt unter `/api/v1`. Die Schichten bleiben innerhalb des
modularen Monolithen klar getrennt:

```text
HTTP / Express
│
├── Middleware: Anfrage-ID, Validierung, Fehlervertrag
├── Routen: Transport und Statuscodes
├── Fachmodule: Geschäftsregeln der jeweiligen Arbeitspakete
└── Infrastruktur: Prisma und weitere lokale Adapter
```

Health prüft ausschließlich den HTTP-Prozess. Readiness hängt zusätzlich von
einer erfolgreichen PostgreSQL-Abfrage ab. Die Datenbankprüfung wird über eine
austauschbare Schnittstelle injiziert, damit API-Tests keine echte Datenbank
voraussetzen und Fachrouten nicht direkt auf Prisma zugreifen müssen.

Fehler verwenden den in `packages/contracts` definierten Vertragsstand `1`.
Unerwartete interne Fehlermeldungen und ungefilterte Eingaben werden weder an
Clients ausgegeben noch protokolliert. Strukturierte Logs enthalten nur
betriebliche Metadaten wie Ereignis, Anfrage-ID, Methode, Routenmuster, Status
und Dauer.

## Lokales Profil und Sitzungen

Es gibt genau ein synthetisch angelegtes persönliches Profil und keine
öffentliche Registrierung. Der Passwort-Bootstrap liest das Passwort nur aus
einer temporären Umgebungsvariable und speichert einen gesalzenen `scrypt`-
Hash. Ein neues Passwort erhöht die Zugangsversion und macht ältere Sitzungen
ungültig.

Der Browser erhält ein zufälliges, widerrufbares Sitzungstoken als
`HttpOnly`-/`SameSite=Strict`-Cookie. Die Datenbank speichert ausschließlich
den SHA-256-Hash, Ablauf und Widerrufszeitpunkt. Profil- und Einstellungsrouten
enthalten keine Benutzer-ID im Pfad, sondern leiten den Besitzer ausschließlich
aus der serverseitig geprüften Sitzung ab.

Einstellungsänderungen und Zugangserneuerungen erzeugen Audit-Ereignisse. Deren
Metadaten enthalten nur Quelle oder geänderte Feldnamen, keine Passwörter,
Tokens oder persönlichen Einstellungswerte.

## Kalender-Kernmodell

Web und CalDAV verwenden denselben persistenten Kalenderkern. Externe
Kalender-IDs und Ereignis-UIDs bleiben stabil; ETags, Sequenz und Sync-Token
bilden Änderungen nachvollziehbar ab. Ein ETag-Update wird als bedingte
SQL-Änderung ausgeführt, sodass zwei parallele Clients nicht beide denselben
alten Stand überschreiben können.

Zeitgebundene Ereignisse speichern UTC-Zeitpunkte plus fachliche IANA-Zeitzone.
Ganztägige Ereignisse speichern reine, exklusive Datumsgrenzen. RRULE und
Erinnerungsminuten werden verlustarm gespeichert und erst in der CalDAV-
Schicht in iCalendar übersetzt. Löschungen setzen Markierungen statt Daten
physisch zu entfernen; dadurch können spätere Sync-Reports Löschungen melden.

Die React-Kalenderansichten sind ausschließlich eine flüchtige Projektion
dieser Ereignisse. Tages-, Wochen-, Monats- und Agendaansicht erzeugen weder
eigene Ereignisdatensätze noch neue UIDs. Unterstützte RRULE-Vorkommen werden
für den sichtbaren Zeitraum berechnet; Bearbeiten und Löschen adressiert stets
das führende Serienereignis mit dessen stabiler UID und aktuellem ETag.
Aufgabenstatus oder spätere Aufgabenverknüpfungen werden nicht in diese
Kalenderprojektion kopiert.

## Aufgaben-Kernmodell

Aufgaben sind ein eigenes Fachmodul und werden nicht als Kalenderereignisse
modelliert. Sie tragen immer den Besitzer aus der serverseitig geprüften
Sitzung. Status (`open`, `in_progress`, `blocked`, `done`, `cancelled`),
Priorität, Bereich, Tags und ganzzahlige Dauerminuten bleiben Aufgabenlogik.
Eine Fälligkeit ist ein reines `DATE`; eine optionale geplante Startzeit ist
ein `TIMESTAMPTZ` zusammen mit der fachlichen IANA-Zeitzone.

Elternaufgaben und Projektanker verwenden zusammengesetzte Fremdschlüssel mit
der Benutzer-ID. Dadurch können Beziehungen nicht auf Datensätze eines anderen
Besitzers zeigen. Die Services verhindern zusätzlich Hierarchiezyklen und
setzen den Abschlusszeitpunkt passend zum Status. Archivierung ist umkehrbar,
während Löschen eine datenschutzgerechte Löschmarkierung setzt. Jede
schreibende Änderung erzeugt ein wertfreies Audit-Ereignis.

Der `Project`-Datensatz ist in Phase 0.2 nur ein stabiler, besitzgebundener
Anker für die optionale Aufgabenrelation. Projekt-CRUD, Ziele und Meilensteine
gehören weiterhin in Roadmap 0.4 und werden nicht vorweggenommen.

## Aufgaben-Termin-Beziehung

Aufgabe, geplante Bearbeitungszeit und tatsächlich stattfindender Termin
bleiben getrennte Fachkonzepte. Eine Aufgabenfälligkeit und die optionale
Aufgaben-Startplanung gehören zum Aufgabenmodell. Beginn und Ende eines
Termins oder eines ausdrücklich angelegten Zeitblocks gehören weiterhin zum
Kalenderkern.

`TaskEventLink` speichert ausschließlich die Beziehung zwischen beiden
Objekten und den serverseitig geprüften Besitzer. Zusammengesetzte
Fremdschlüssel verhindern Beziehungen über Benutzergrenzen; ein eindeutiger
Schlüssel macht wiederholtes Verknüpfen idempotent. Es werden weder
Aufgabenstatus noch Terminzeiten kopiert. Soft-Deletes bleiben als nicht
verfügbare Beziehungspartner sichtbar. Das Ändern, Abschließen oder Löschen
eines Objekts löst keine unbestätigte Änderung am anderen Objekt aus.

## Studienmodul

Das Studienmodul ist ein eigenes Fachmodul und kein Hochschulverwaltungssystem.
`StudyProgram` beschreibt Studiengang oder Ausbildungsbereich, Einrichtung und
aktuellen Abschnitt. `StudyModule` hält Kursstatus, optionale Leistungspunkte,
Note, Notizen und reine Dokumentverweise nachvollziehbar. `StudyEntry` bildet
Lehrveranstaltung, Prüfung, Abgabe oder Lernzeit ab.

Prüfungen und Abgaben dürfen ohne erfundene Uhrzeit als `DATE` gespeichert
werden. Zeitgebundene Einträge verwenden immer Beginn, Ende und IANA-Zeitzone;
ein Datenbank-Constraint verhindert gemischte oder rückwärts laufende Formen.
Optionale Aufgaben- und Kalenderrelationen verwenden zusammengesetzte
Besitzschlüssel und kopieren keine Fachdaten. Schreibende Änderungen erzeugen
nur Feldnamen im Audit-Ereignis, keine persönlichen Inhalte. Das Studienmodul
ändert weder Aufgaben noch Kalenderereignisse automatisch.
Dashboard und Kalenderansicht laden Studieneinträge als rein lesende
Projektion aus dem Studien-API-Zustand. Sie erzeugen dabei weder zusätzliche
`CalendarEvent`-Datensätze noch CalDAV-Ressourcen.

## Arbeits- und Praxismodul

`WorkContext` beschreibt einen persönlichen beruflichen Kontext mit Rolle,
optionalem Organisationsnamen, Zeitraum und IANA-Zeitzone. `WorkProject`
gehört eindeutig zu einem solchen Kontext und hält Status, Ziel, reine
Datumsfrist sowie optional einen vorhandenen Kalenderbezug. Ein berufliches
Projekt ist kein GitHub-Projekt und löst keine externe Integration aus.

Arbeitsaufgaben bleiben im bestehenden `Task`-Modell mit dem Bereich `work`.
`WorkTaskLink` speichert lediglich deren besitzgesicherte Zuordnung zu einem
Arbeitskontext oder -projekt. `WorkTimeEntry` unterscheidet die Arten
`planned` und `actual`; Beginn und Ende sind absolute `TIMESTAMPTZ`-Werte mit
fachlicher IANA-Zeitzone. Die API leitet daraus eine klar benannte Dauer in
Minuten ab, statt geplante und tatsächliche Werte zusammenzurechnen.

Zusammengesetzte Fremdschlüssel und serverseitige Referenzprüfungen verhindern
Beziehungen über Besitzer- oder Kontextgrenzen. Filter sind reine Abfragen
beziehungsweise UI-Projektionen. Schreibende Änderungen protokollieren nur
Aktion und Feldnamen, niemals Organisation, Notizen, Ziele oder Zeitwerte.
Arbeitsdaten werden weder in Logs noch in Browser-Storage persistiert.

## Organisations-Dashboard

Das Dashboard ist eine rein lesende Projektion der vorhandenen Fachmodule und
keine eigene Datenquelle. Der geschützte Endpunkt `/api/v1/dashboard` liest
aktive Aufgaben, Ereignisse aus allen eigenen Kalendern und aktuelle
Projektanker besitzgebunden aus PostgreSQL. Er speichert keine Kennzahlen und
führt keine ungefragten Schreibaktionen aus.

Der Snapshot enthält Erstellungszeitpunkt und Profilzeitzone. Die gemeinsame
Weboberfläche leitet daraus heutige und nächste Termine, überfällige und hoch
priorisierte Aufgaben, Bereichszähler sowie Hinweise auf zeitliche
Überschneidungen und fehlende Fälligkeiten ab. Wiederkehrende Termine werden
wie in den Kalenderansichten nur flüchtig für den sichtbaren Zeitraum
projiziert. Schnellaktionen öffnen die bestehenden Formulare; erst deren
bestätigtes Speichern verändert das jeweilige Fachmodell.

## CalDAV

Das Life OS soll selbst als CalDAV-Server auftreten. Dadurch kann die
Apple-Kalender-App einen LifeOS-Kalender als eigenen Account anzeigen und
bearbeiten. Die CalDAV-Schnittstelle bleibt von der internen Datenbankstruktur
entkoppelt.

Der Server verwendet die stabilen Pfade `/caldav/principals/local/` und
`/caldav/calendars/local/`. Ein eigener, gesalzen gehashter Basic-Auth-Zugang
ist getrennt von Web-Passwort und Sitzungen widerrufbar. `PROPFIND` bildet
Principal und Calendar Home ab; `calendar-query`, `calendar-multiget` und
`sync-collection` verwenden denselben Kalenderkern wie `/api/v1`.

Eine Ereignisänderung erhöht in derselben Transaktion den Kalender-`syncToken`
und schreibt ihn als `syncVersion` an das Ereignis. Soft gelöschte Ereignisse
bleiben dadurch als Tombstones für inkrementelle Sync-Reports erhalten.
iCalendar-Ausgaben enthalten stabile UID/ETag-Werte, exklusive Ganztagsdaten,
RRULE, DISPLAY-Alarme und eine zur IANA-Zeitzone passende `VTIMEZONE`-
Definition. Eingehendes XML lehnt DTD-/Entity-Deklarationen ab.

Die Standardbindung an `127.0.0.1` bleibt sicher lokal. Zugriff von Apple
Kalender im selben vertrauenswürdigen Netz ist eine bewusste Betriebsart mit
LAN-Bindung. Der erste Entwicklungsbetrieb nutzt HTTP Basic Auth; außerhalb
eines vertrauenswürdigen LAN ist TLS vorgeschaltet erforderlich.

Ein späterer CalDAV-Client für bestehende iCloud-Kalender ist eine separate
Integration und darf die lokale Kernfunktion nicht voraussetzen.

## Migration und Kompatibilität

- Datenbankänderungen erfolgen ausschließlich über versionierte Prisma-
  Migrationen; `db push` ist kein regulärer Entwicklungsablauf.
- Prisma 7 liest die lokale Verbindungs-URL aus
  `packages/database/prisma.config.ts` und verbindet den generierten Client
  über den PostgreSQL-Treiberadapter.
- Persönliche Datensätze tragen einen Besitzerbezug. Ereignisse sichern die
  Kombination aus Kalender und Benutzer zusätzlich per Fremdschlüssel ab;
  Aufgaben sichern Eltern- und Projektbezüge entsprechend ab.
  Aufgaben-Termin-Beziehungen prüfen Aufgabe und Ereignis mit demselben
  Besitzerbezug.
- Absolute Zeitpunkte liegen als `TIMESTAMPTZ`, ganztägige Kalenderwerte als
  reine `DATE`-Spalten vor; die fachliche Zeitzone wird getrennt gespeichert.
  Aufgabenfälligkeiten sind ebenfalls reine `DATE`-Werte, geplante
  Aufgabenstarts verwenden `TIMESTAMPTZ` plus IANA-Zeitzone.
- CalDAV-UIDs, Kalender-IDs und ETags bleiben stabil.
- Vor potenziell verlustbehafteten Migrationen werden Backups erstellt.
- API-Breaking-Changes werden über eine neue Version oder Übergangsphase
  behandelt.

## Backup- und Wiederherstellungsgrenze

PostgreSQL-Backups werden als Custom-Format-Archive mit separater SHA-256-
Prüfsumme erstellt. Ein Restore erfolgt zuerst in eine neue Datenbank und wird
dort durch Migration sowie Vergleich stabiler Profil-, Kalender-, Ereignis-
und Synchronisationswerte geprüft. Die Quelldatenbank wird niemals als erster
Restore-Schritt überschrieben.

`db:verify:recovery` automatisiert diesen Nachweis mit eindeutig benannten,
synthetischen Datenbanken und räumt sie unabhängig vom Ergebnis wieder auf.
Das PostgreSQL-Archiv umfasst keine Dokumentdateien unter `data/`; sobald dort
echte Dateien verwaltet werden, benötigt ein konsistentes Backup beide
Speicherbereiche und einen gemeinsamen Wiederherstellungstest.
