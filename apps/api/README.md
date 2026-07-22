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

## Betriebsendpunkte

| Endpunkt                 | Bedeutung                                        |
| ------------------------ | ------------------------------------------------ |
| `GET /api/v1/health`     | HTTP-Prozess ist erreichbar                      |
| `GET /api/v1/readiness`  | API und PostgreSQL-Verbindung sind einsatzbereit |
| `POST /api/v1/session`   | lokale Sitzung über Passwort anlegen             |
| `DELETE /api/v1/session` | aktuelle Sitzung widerrufen                      |
| `GET /api/v1/profile`    | persönliches Profil und Einstellungen lesen      |
| `PATCH /api/v1/settings` | Basiseinstellungen teilweise ändern              |

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
