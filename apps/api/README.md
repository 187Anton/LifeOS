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

## Betriebsendpunkte

| Endpunkt                | Bedeutung                                        |
| ----------------------- | ------------------------------------------------ |
| `GET /api/v1/health`    | HTTP-Prozess ist erreichbar                      |
| `GET /api/v1/readiness` | API und PostgreSQL-Verbindung sind einsatzbereit |

Health greift absichtlich nicht auf die Datenbank zu. Readiness führt dagegen
eine echte, ausschließlich lesende `SELECT 1`-Prüfung über den zentralen
Prisma-Client aus. Bei nicht erreichbarer Datenbank bleibt Health grün und
Readiness antwortet mit HTTP 503.

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
