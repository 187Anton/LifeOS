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
  Kombination aus Kalender und Benutzer zusätzlich per Fremdschlüssel ab.
- Absolute Zeitpunkte liegen als `TIMESTAMPTZ`, ganztägige Kalenderwerte als
  reine `DATE`-Spalten vor; die fachliche Zeitzone wird getrennt gespeichert.
- CalDAV-UIDs, Kalender-IDs und ETags bleiben stabil.
- Vor potenziell verlustbehafteten Migrationen werden Backups erstellt.
- API-Breaking-Changes werden über eine neue Version oder Übergangsphase
  behandelt.
