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

## CalDAV

Das Life OS soll selbst als CalDAV-Server auftreten. Dadurch kann die
Apple-Kalender-App einen LifeOS-Kalender als eigenen Account anzeigen und
bearbeiten. Die CalDAV-Schnittstelle bleibt von der internen Datenbankstruktur
entkoppelt.

Ein späterer CalDAV-Client für bestehende iCloud-Kalender ist eine separate
Integration und darf die lokale Kernfunktion nicht voraussetzen.

## Migration und Kompatibilität

- Datenbankänderungen erfolgen ausschließlich über versionierte Prisma-
  Migrationen; `db push` ist kein regulärer Entwicklungsablauf.
- Prisma 7 liest die lokale Verbindungs-URL aus
  `packages/database/prisma.config.ts` und verbindet den generierten Client
  über den PostgreSQL-Treiberadapter.
- Persönliche Datensätze tragen einen Besitzerbezug. Ereignisse sichern die
  Kombination aus Kalender und Benutzer zusätzlich per Fremdschlüssel ab.
- Absolute Zeitpunkte liegen als `TIMESTAMPTZ`, ganztägige Kalenderwerte als
  reine `DATE`-Spalten vor; die fachliche Zeitzone wird getrennt gespeichert.
- CalDAV-UIDs, Kalender-IDs und ETags bleiben stabil.
- Vor potenziell verlustbehafteten Migrationen werden Backups erstellt.
- API-Breaking-Changes werden über eine neue Version oder Übergangsphase
  behandelt.
