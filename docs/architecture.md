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
