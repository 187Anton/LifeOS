# LifeOS API

Die API ist das lokale Node.js-/TypeScript-Backend des modularen Monolithen.
Sie verwendet Express 5 und stellt versionierte REST-Endpunkte unter
`/api/v1` bereit.

## Lokal starten

Voraussetzungen sind eine `.env` nach dem Muster der `.env.example` und eine
erreichbare lokale PostgreSQL-Datenbank:

```bash
npm run db:start
npm run api:start
```

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

| Endpunkt                                           | Bedeutung                                        |
| -------------------------------------------------- | ------------------------------------------------ |
| `GET /api/v1/health`                               | HTTP-Prozess ist erreichbar                      |
| `GET /api/v1/readiness`                            | API und PostgreSQL-Verbindung sind einsatzbereit |
| `POST /api/v1/session`                             | lokale Sitzung über Passwort anlegen             |
| `DELETE /api/v1/session`                           | aktuelle Sitzung widerrufen                      |
| `GET /api/v1/profile`                              | persönliches Profil und Einstellungen lesen      |
| `PATCH /api/v1/settings`                           | Basiseinstellungen teilweise ändern              |
| `GET/POST /api/v1/calendars`                       | Kalender auflisten oder anlegen                  |
| `PATCH/DELETE /api/v1/calendars/:id`               | Kalender ändern oder soft löschen                |
| `GET/POST /api/v1/calendars/:id/events`            | Ereignisse auflisten oder anlegen                |
| `GET/PUT/DELETE /api/v1/calendars/:id/events/:uid` | Ereignis verwalten                               |
| `/.well-known/caldav`                              | CalDAV-Discovery auf `/caldav/`                  |
| `/caldav/…`                                        | WebDAV-/CalDAV-Ressourcen                        |

Health greift absichtlich nicht auf die Datenbank zu. Readiness führt dagegen
eine echte, ausschließlich lesende `SELECT 1`-Prüfung über den zentralen
Prisma-Client aus. Bei nicht erreichbarer Datenbank bleibt Health grün und
Readiness antwortet mit HTTP 503.

Profil und Einstellungen benötigen die `HttpOnly`-Sitzung. Der Browser erhält
das zufällige Sitzungstoken ausschließlich als `SameSite=Strict`-Cookie; in
PostgreSQL liegt nur dessen SHA-256-Hash. Die Webentwicklung verwendet dieselbe
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
