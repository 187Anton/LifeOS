# LifeOS API

Die API ist das lokale Node.js-/TypeScript-Backend des modularen Monolithen.
Sie verwendet Express 5 und stellt versionierte REST-Endpunkte unter
`/api/v1` bereit.

## Lokal starten

Voraussetzung ist eine `.env` nach dem Muster der `.env.example`. Die API kann
mit einer erreichbaren PostgreSQL-Datenbank oder einer zuvor migrierten,
absolut adressierten SQLite-Datei starten:

```bash
npm run db:start
npm run api:start
```

Der bestätigte SQLite-Prüfweg benötigt keinen Docker-Container:

```bash
export SQLITE_DATABASE_URL="file:/absoluter/pfad/lifeos.sqlite"
export DATABASE_URL="$SQLITE_DATABASE_URL"
npm run db:sqlite:migrate
npm run api:start
```

Relative SQLite-Pfade werden abgelehnt, damit Desktop-App und Hilfsbefehle
nicht versehentlich unterschiedliche Dateien öffnen. Das Setzen eines echten
lokalen Passworts und CalDAV-Zugangs erfolgt im Entwicklungsbetrieb über die
getrennten Bootstrap-Befehle. Die Mac-App verwendet stattdessen die einmalige
lokale Ersteinrichtung unter `GET/POST /api/v1/setup`.

Der SQLite-Migrationslauf aktiviert WAL; der API-Client verwendet eine
Sperrwartezeit von fünf Sekunden. Freigegeben ist genau ein schreibender
API-/Sidecar-Prozess. Der automatisierte ETag-Konkurrenztest bestätigt, dass
von zwei gleichzeitig gestarteten Änderungen mit demselben alten ETag nur eine
gewinnt und die andere keine Synchronisationsversion verbraucht.

## Gebündelter Mac-App-Betrieb

Die Tauri-App startet die gebaute API mit einer fest gebündelten
Node.js-22-Laufzeit. Sie übergibt absolute Pfade für SQLite, Migrationen,
Web-Assets und Dokumente. Vor dem Öffnen der Oberfläche wendet die API alle
noch fehlenden SQLite-Migrationen an und besteht ihre Readiness-Prüfung.

Im Desktop-Betrieb liefert Express die gebaute React-Oberfläche und die API
über denselben dynamisch gewählten `127.0.0.1`-Port aus. Das Sitzungs-Cookie
bleibt `HttpOnly`, `SameSite=Strict` und auf HTTPS-Herkünften zusätzlich
`Secure`; für den ausschließlich lokalen HTTP-Loopback der App wird `Secure`
nicht gesetzt, weil der Browser das Cookie sonst nicht zurücksenden würde.
Persönliche Antworten werden dadurch weiterhin weder in Web Storage noch im
Service-Worker-Cache persistiert.

Die Desktop-Vorbereitung und der geprüfte Sidecar-Start sind über
`npm run desktop:prepare` und `npm run desktop:verify:sidecar` reproduzierbar.
Details zu Laufzeitprüfsummen, App-Pfaden und noch offenen Distributions-Gates
stehen in [`apps/desktop/README.md`](../desktop/README.md) und im
[`Migrationsprotokoll`](../../docs/mac-desktop-migration-log.md).

Der Einrichtungsendpunkt akzeptiert ausschließlich direkte Loopback-Zugriffe.
Er legt Profil, Einstellungen, Primärkalender und beide gehashten Zugänge in
einer Transaktion an und antwortet nach erfolgreichem Abschluss auf weitere
Einrichtungsversuche mit HTTP 409. Die Passwörter werden weder geloggt noch in
Audit-Metadaten geschrieben.

Die API bindet standardmäßig nur an `127.0.0.1:3000`. Ein Start mit fehlender
oder ungültiger Konfiguration endet verständlich und ohne Ausgabe von
Konfigurationswerten.

Der Entwicklungsmodus mit automatischem Neustart lautet:

```bash
npm run api:dev
```

## Lokales Passwort einmalig setzen

Es gibt keine öffentliche Registrierung. Der synthetisch angelegte persönliche
Benutzer erhält sein lokales Passwort über einen bewussten Bootstrap-Schritt.
Das Passwort wird nur aus einer temporären Umgebungsvariable gelesen und als
`scrypt`-Hash gespeichert:

```bash
read -s LIFEOS_BOOTSTRAP_PASSWORD
export LIFEOS_BOOTSTRAP_PASSWORD
npm run auth:bootstrap
unset LIFEOS_BOOTSTRAP_PASSWORD
```

Das Passwort muss 12 bis 200 Zeichen lang sein. Ein erneuter Lauf ersetzt den
Hash, erhöht die Zugangsversion und widerruft alle bestehenden Sitzungen. Das
Passwort darf nicht in `.env`, Shell-Skripten, Browsercode oder Git gespeichert
werden.

## CalDAV-Zugang und lokale Einrichtung

CalDAV verwendet absichtlich nicht das Browser-Cookie. Der eigene Zugang mit
Benutzername `local` wird aus einer temporären Variable gesetzt:

```bash
read -s LIFEOS_CALDAV_PASSWORD
export LIFEOS_CALDAV_PASSWORD
npm run caldav:bootstrap
unset LIFEOS_CALDAV_PASSWORD
```

Das Passwort muss 12 bis 200 Zeichen lang sein und wird als gesalzener
`scrypt`-Hash gespeichert. Ein erneuter Bootstrap ersetzt nur den
CalDAV-Zugang. Dieser kann unabhängig von Web-Passwort und Sitzungen gesperrt
werden:

```bash
npm run caldav:revoke
```

Auf demselben Rechner ist die Account-URL `http://127.0.0.1:3000/caldav/`.
Für Apple Kalender oder einen anderen Client im lokalen Netz:

1. Datenbank, Migrationen und Seed starten; anschließend den CalDAV-Zugang
   setzen.
2. Die API bewusst im LAN erreichbar starten, zum Beispiel
   `API_HOST=0.0.0.0 npm run api:start`.
3. Die LAN-Adresse des Rechners ermitteln und im CalDAV-Client als
   `http://<LAN-IP>:3000/caldav/` eintragen.
4. Benutzer `local`, das lokal eingegebene CalDAV-Passwort, Port `3000` und
   für diese HTTP-Entwicklungsverbindung SSL aus verwenden.

Die vollständige physische Testmatrix für Lesen, Erstellen, Ändern, Löschen,
Ganztag, Wiederholung, Erinnerung und Konflikt steht in
[`docs/foundation-verification.md`](../../docs/foundation-verification.md).

`localhost` auf dem iPhone verweist auf das iPhone und erreicht den Rechner
nicht. Beide Geräte müssen im selben vertrauenswürdigen Netz sein; der Rechner
muss laufen und eine lokale Firewall muss Port 3000 zulassen. Basic Auth über
HTTP schützt das Passwort nicht vor Mitschneiden im Netz. Für jedes fremde
Netz oder einen späteren Dauerbetrieb ist deshalb TLS vor der API Pflicht.

Der Server unterstützt Principal- und Calendar-Home-Discovery, `OPTIONS`,
`PROPFIND`, `MKCALENDAR`, `REPORT`, `GET`, `PUT` und `DELETE`.
`calendar-query`, `calendar-multiget` und `sync-collection` liefern ETags und
stabile Sync-Tokens. Ereignisse werden als RFC-5545-iCalendar mit
`VTIMEZONE`, UID, RRULE, ganztägigen Datumsgrenzen und DISPLAY-Erinnerungen
ausgegeben. Änderungen verlangen `If-Match`; neue Ressourcen können mit
`If-None-Match: *` gegen Duplikate geschützt werden.

Ein kurzer Discovery-Test ohne Klartextpasswort in der Kommandohistorie:

```bash
read -s CALDAV_TEST_PASSWORD
curl --user "local:${CALDAV_TEST_PASSWORD}" \
  -X PROPFIND -H 'Depth: 0' -H 'Content-Type: application/xml' \
  --data '<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>' \
  http://127.0.0.1:3000/caldav/
unset CALDAV_TEST_PASSWORD
```

## Betriebsendpunkte

| Endpunkt                                           | Bedeutung                                          |
| -------------------------------------------------- | -------------------------------------------------- |
| `GET /api/v1/health`                               | HTTP-Prozess ist erreichbar                        |
| `GET /api/v1/readiness`                            | API und konfigurierte Datenbank sind einsatzbereit |
| `POST /api/v1/session`                             | lokale Sitzung über Passwort anlegen               |
| `GET/POST /api/v1/setup`                           | lokale Ersteinrichtung prüfen oder abschließen     |
| `DELETE /api/v1/session`                           | aktuelle Sitzung widerrufen                        |
| `GET /api/v1/profile`                              | persönliches Profil und Einstellungen lesen        |
| `PATCH /api/v1/settings`                           | Basiseinstellungen teilweise ändern                |
| `GET/POST /api/v1/calendars`                       | Kalender auflisten oder anlegen                    |
| `PATCH/DELETE /api/v1/calendars/:id`               | Kalender ändern oder soft löschen                  |
| `GET/POST /api/v1/calendars/:id/events`            | Ereignisse auflisten oder anlegen                  |
| `GET/PUT/DELETE /api/v1/calendars/:id/events/:uid` | Ereignis verwalten                                 |
| `GET/POST /api/v1/tasks`                           | Aufgaben filtern oder anlegen                      |
| `GET/PATCH/DELETE /api/v1/tasks/:taskId`           | Aufgabe lesen, ändern oder soft löschen            |
| `GET/POST /api/v1/task-event-links`                | Aufgaben-Termin-Beziehungen lesen oder anlegen     |
| `DELETE /api/v1/task-event-links/:linkId`          | Aufgaben-Termin-Beziehung entfernen                |
| `GET /api/v1/dashboard`                            | rein lesenden Organisations-Snapshot laden         |
| `GET /api/v1/work`                                 | eigene Arbeitsdaten filtern und laden              |
| `POST/PATCH /api/v1/work/contexts/:id?`            | Arbeitsbereiche anlegen oder ändern                |
| `POST/PATCH /api/v1/work/projects/:id?`            | Arbeitsprojekte, Ziele und Fristen verwalten       |
| `POST/DELETE /api/v1/work/task-links/:id?`         | vorhandene Arbeitsaufgaben zuordnen                |
| `POST/PATCH /api/v1/work/time-entries/:id?`        | geplante oder tatsächliche Zeit verwalten          |
| `GET /api/v1/planning`                             | gemeinsame Planung nach Zeitraum/Bereich laden     |
| `POST/PATCH/DELETE /api/v1/planning/availability`  | persönliche Verfügbarkeit verwalten                |
| `/.well-known/caldav`                              | CalDAV-Discovery auf `/caldav/`                    |
| `/caldav/…`                                        | WebDAV-/CalDAV-Ressourcen                          |

Health greift absichtlich nicht auf die Datenbank zu. Readiness führt dagegen
eine echte, ausschließlich lesende `SELECT 1`-Prüfung über den zentralen
Prisma-Client aus. Bei nicht erreichbarer PostgreSQL- oder SQLite-Datenbank
bleibt Health grün und Readiness antwortet mit HTTP 503.

Profil und Einstellungen benötigen die `HttpOnly`-Sitzung. Der Browser erhält
das zufällige Sitzungstoken ausschließlich als `SameSite=Strict`-Cookie; in
der konfigurierten Datenbank liegt nur dessen SHA-256-Hash. Die Webentwicklung verwendet dieselbe
Hostbezeichnung wie `WEB_ORIGIN` und später einen Same-Origin-Proxy, damit das
Cookie nicht in JavaScript zugänglich werden muss.

Ein lokaler Test mit einer temporären Cookie-Datei:

```bash
curl -c /tmp/lifeos-cookie \
  -H 'Content-Type: application/json' \
  -d '{"password":"lokal-eingegeben"}' \
  http://127.0.0.1:3000/api/v1/session
curl -b /tmp/lifeos-cookie http://127.0.0.1:3000/api/v1/profile
```

Unterstützte Einstellungen sind IANA-Zeitzone, `de-DE` oder `en-US`, gültiger
ISO-Währungscode, Wochenbeginn von 0 bis 6, Standardansicht `day`, `week` oder
`month` und die Wochenendanzeige. Teilupdates schreiben nur geänderte Felder;
das Audit speichert deren Namen, nicht die persönlichen Werte.

## Kalendervertrag

Kalender-IDs und Ereignis-UIDs bleiben stabil. Ein Ereignis-Update ist eine
vollständige Ersetzung per `PUT`; `uid` und Besitzer werden dabei niemals aus
dem Body übernommen. Für `PUT` und `DELETE` ist der zuletzt gelesene ETag im
Header `If-Match` Pflicht. Fehlt er, antwortet die API mit HTTP 428; ist er
veraltet, mit HTTP 412. Vergleich und Änderung erfolgen atomar, damit
parallele Zugriffe keine neueren Daten überschreiben.

Zeitgebundene Ereignisse verwenden ISO-Zeitpunkte mit Offset und eine IANA-
Zeitzone. Ganztägige Ereignisse verwenden ausschließlich `startDate` und das
exklusive `endDate`. RRULE-Werte werden ohne Zeilenumbrüche verlustarm
gespeichert; bis zu zehn Erinnerungen werden als Minuten vor Beginn abgelegt.
Jede Ereignisänderung erzeugt einen neuen ETag, erhöht `sequence` und den
Kalender-`syncToken`. Löschungen sind Soft-Deletes und bleiben damit für die
spätere CalDAV-Synchronisation nachvollziehbar.

## Aufgabenvertrag

Aufgaben gehören immer dem über die Sitzung ermittelten Benutzer; eine
Benutzer-ID wird weder im Pfad noch im Body akzeptiert. `GET /tasks` blendet
archivierte Aufgaben standardmäßig aus und kann über `status`, `priority` und
`area` filtern. `includeArchived=true` schließt archivierte, aber nicht soft
gelöschte Aufgaben ein.

Statuswerte sind `open`, `in_progress`, `blocked`, `done` und `cancelled`.
Direkte Übergänge aus `done` oder `cancelled` sind nur zurück nach `open`
zulässig. Beim Abschluss setzt die API `completedAt`; beim Wiederöffnen wird
dieser Zeitpunkt entfernt. Fälligkeiten sind `YYYY-MM-DD`-Werte. Eine geplante
Startzeit wird nur zusammen mit ihrer gültigen IANA-Zeitzone akzeptiert und als
UTC-Zeitpunkt plus Zeitzone gespeichert. Geschätzte Dauern sind ganzzahlige
Minuten zwischen 1 und 525600.

Elternaufgaben und der optionale Projektanker müssen demselben Besitzer
gehören. Zyklen in der Aufgabenhierarchie werden abgelehnt. Der Projektanker
verweist auf die besitzgebundene Projektverwaltung mit Zielen und
Meilensteinen. Archivierung ist umkehrbar,
`DELETE` setzt dagegen eine Löschmarkierung. Erstellen, Ändern und Löschen
erzeugen wertfreie Audit-Ereignisse.

## Aufgaben-Termin-Vertrag

Eine Beziehung verbindet optional genau eine Aufgabe mit genau einem
Kalenderereignis desselben, aus der Sitzung ermittelten Besitzers. Wiederholtes
Anlegen derselben Beziehung ist idempotent und erzeugt kein Duplikat. Die API
nimmt keine Benutzer-ID entgegen und antwortet für fremde oder nicht
verfügbare Objekte wie bei einem nicht vorhandenen Datensatz.

Die Beziehung speichert keine Kopien von Fachdaten. Aufgabenstatus und
Fälligkeit bleiben im Aufgabenmodell; Beginn und Ende bleiben im
Kalendermodell. Das Abschließen oder Löschen einer Aufgabe verändert den Termin
nicht, und das Löschen eines Termins löscht die Aufgabe nicht. Soft gelöschte
Objekte werden in bestehenden Beziehungen als nicht verfügbar angezeigt,
damit die Beziehung nachvollziehbar entfernt werden kann.

## Dashboard-Vertrag

`GET /dashboard` verwendet ausschließlich den Besitzer aus der geprüften
Sitzung und führt keine schreibende Aktion aus. Der Snapshot enthält aktive,
nicht archivierte Aufgaben, nicht gelöschte Ereignisse aus allen eigenen,
nicht gelöschten Kalendern sowie Projektanker mit offenen Aufgaben. Er nennt
den Erstellungszeitpunkt und die gespeicherte Profilzeitzone, damit der Client
„heute“ und „überfällig“ reproduzierbar bestimmen kann. Nicht wiederkehrende
Ereignisse werden bereits in der Datenbank auf den sichtbaren Zeitraum von
heute bis 30 Tage im Voraus begrenzt; Serienwurzeln bleiben für die flüchtige
Projektion erhalten.

Der Endpunkt erfindet oder ergänzt keine Termine und Aufgaben. Persönliche
Inhalte werden nicht protokolliert; der bestehende Anfrage-Logger speichert nur
Anfrage-ID, Routenmetadaten, Status und Dauer.

## Arbeits- und Praxisvertrag

`/work` verwendet ausschließlich den Besitzer der geprüften Sitzung. Kontexte,
Projekte, Aufgabenbeziehungen und Zeitblöcke können nicht auf fremde oder
archivierte Referenzen zeigen. Aufgaben werden nicht dupliziert, sondern aus
dem bestehenden Aufgabenmodell mit Bereich `work` verknüpft. Filter nach
Arbeitsbereich, Status und Zeitraum ändern nur die Antwortauswahl.

Geplante und tatsächliche Zeit sind verschiedene Werte von `kind`. Beginn und
Ende benötigen ISO-Zeitpunkte mit Offset sowie eine IANA-Zeitzone. Die Antwort
weist die aus den Zeitpunkten berechnete `durationMinutes` aus. Fristen bleiben
reine Kalendertage. Audit-Metadaten enthalten nur geänderte Feldnamen und keine
Organisationen, Ziele, Notizen oder Zeitwerte.

## Vertrag der gemeinsamen Planung

`GET /planning` benötigt `from` und `to` als reine Datumswerte und akzeptiert
optional eine kommagetrennte Bereichsauswahl. Der Zeitraum ist auf 63 Tage
begrenzt. Die Antwort unterscheidet feste Termine, Fristen, geplante Aufgaben,
tatsächliche Zeit und persönliche Verfügbarkeit. Warnungen nennen eine
regelbasierte Ursache und die betroffenen Projektions-IDs; sie schreiben oder
verschieben keine Quelldaten.

Verfügbarkeitsfenster speichern Wochentag, Minuten seit Tagesbeginn und eine
IANA-Zeitzone. Überlappende Fenster desselben Besitzers werden abgelehnt.
Zeitraum-, Überfälligkeits- und DST-Berechnungen verwenden die gespeicherte
Profilzeitzone. Audit-Ereignisse der Verfügbarkeitsverwaltung enthalten nur
geänderte Feldnamen.

Beispiel:

```bash
curl http://127.0.0.1:3000/api/v1/health
curl http://127.0.0.1:3000/api/v1/readiness
```

## Fehlervertrag

API-Fehler besitzen einen eigenen Vertragsstand, damit Clients Änderungen am
Fehlerformat unabhängig von der Routen-Version erkennen können:

```json
{
  "error": {
    "version": "1",
    "code": "VALIDATION_ERROR",
    "message": "Die Anfrage enthält ungültige Eingaben.",
    "requestId": "synthetische-anfrage-id",
    "details": [
      {
        "field": "body.title",
        "message": "Ungültiger Wert."
      }
    ]
  }
}
```

Gemeinsame Typen liegen in `packages/contracts`. Unbekannte Routen, ungültiges
JSON, Validierungsfehler, fehlende Readiness und unerwartete Fehler verwenden
denselben Vertrag. Interne Fehlermeldungen werden nicht an Clients
weitergegeben.

## Modulgrenzen und Logging

- `application.ts` verdrahtet Express, Middleware und fachliche Router.
- `routes/` enthält HTTP-Routen, aber keinen direkten Datenbankzugriff.
- `readiness.ts` kapselt den Datenbankzugriff hinter einer austauschbaren
  Schnittstelle.
- `middleware/` bündelt Anfrage-ID, Validierung und Fehlerbehandlung.
- `http-server.ts` verantwortet Start und kontrollierten Shutdown.
- `modules/profile/` trennt Passwort-/Tokenlogik, Repository, Services und
  HTTP-Routen.
- `modules/calendar/` kapselt Kalenderregeln, atomare ETag-Prüfung,
  Datenbanktransaktionen und HTTP-Verträge.
- `modules/tasks/` kapselt Aufgabenstatus, Besitz- und Hierarchieprüfung,
  Datenbanktransaktionen und HTTP-Verträge.
- `modules/task-event-links/` kapselt besitzgebundene, idempotente Beziehungen
  zwischen Aufgaben- und Kalenderkern.
- `modules/dashboard/` bündelt den besitzgebundenen, rein lesenden
  Organisations-Snapshot ohne eigene Fachdaten oder Schreiblogik.
- `modules/work/` kapselt Arbeitskontexte, berufliche Projekte,
  Aufgabenbeziehungen sowie geplante und tatsächliche Zeit mit Besitzprüfung.
- `modules/planning/` projiziert vorhandene Fachobjekte besitzgebunden und
  erkennt Konflikte beziehungsweise Überlastung mit transparenten Regeln.
- `modules/search/` projiziert ausschließlich eigene, aktive und ausdrücklich
  freigegebene Fachdaten mit einem providerunabhängigen lokalen Suchvertrag;
  es persistiert weder Suchindex noch Suchanfragen oder Treffer.
- `modules/ai/` bereitet ausschließlich diese lokalen Quellen auf, kennzeichnet
  unsichere oder widersprüchliche Ausschnitte und persistiert nur geschützte
  Fingerabdrücke und technische Metadaten. Der produktive Adapter ist
  deaktiviert; externe Verarbeitung und automatische Fachänderungen finden
  nicht statt. Der Vertrag ist in [`docs/api/ai.md`](../../docs/api/ai.md)
  beschrieben.
- `modules/finance/` verwaltet eigene Kategorien, ganzzahlige Buchungen und
  Budgets, berechnet Monatsvergleich, Sparquote und Warnungen rein lokal und
  stellt einen versionierten eigenen Export bereit. Grenzen und Vertrag stehen
  in [`docs/api/finance.md`](../../docs/api/finance.md).
- `modules/caldav/` übersetzt den gemeinsamen Kalenderkern in WebDAV-XML und
  RFC-5545-iCalendar; Zugang, Parser und Transport bleiben von der REST-API
  getrennt.

Logs sind JSON-Zeilen mit Ereignisname, Anfrage-ID, Methode, Routenmuster,
Status und Dauer. Konkrete URL-Pfade, Anfragekörper,
Authorization-/Cookie-Header, Secrets, Passwörter und Tokens werden weder
protokolliert noch in unerwartete Fehlermeldungen übernommen.

## Prüfbefehle

```bash
npm run lint --workspace @lifeos/api
npm run typecheck --workspace @lifeos/api
npm test --workspace @lifeos/api
npm run build --workspace @lifeos/api
npm run start:built --workspace @lifeos/api
```

Der Build erzeugt `apps/api/dist/server.js`. Der abschließende Startbefehl
prüft damit das tatsächlich erzeugte Artefakt und nicht den TypeScript-
Entwicklungsmodus.
