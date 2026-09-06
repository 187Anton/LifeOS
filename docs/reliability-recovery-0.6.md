# Stabilitäts-, Kompatibilitäts- und Recovery-Nachweis 0.6.2

Stand: 4. September 2026

Der Nachweis verwendet ausschließlich synthetische Daten. Er prüft den
integrierten Stand von Roadmap 0.1 bis 0.6.1 ohne neue Fachmodule und trennt
aktuell ausgeführte Prüfungen von älteren oder extern noch offenen Gates.

## Behobene Befunde

1. **PostgreSQL-Restore ohne Prüfsumme:** `db:restore` akzeptierte einen Dump,
   wenn die zugehörige `.sha256`-Datei fehlte. Restore verlangt nun eine
   reguläre, nicht symbolisch verknüpfte Dump- und Prüfsummendatei, prüft einen
   kanonischen SHA-256-Wert und lehnt eine ungeeignete Datenbank-URL ab.
2. **Kein eigener Dokumenten-Restore im PostgreSQL-/Browserbetrieb:** Das
   vorhandene PostgreSQL-Backup enthält konstruktionsbedingt nur die
   Datenbank. `documents:backup` und `documents:restore` sichern nun das lokale
   Dokumentverzeichnis mit Manifest, Manifest-Prüfsumme und einzelnen
   Dateiprüfsummen. Restore schreibt ausschließlich in ein noch nicht
   vorhandenes Ziel; Symlinks und unsichere Pfade werden abgewiesen.
3. **Unvollständig validiertes SQLite-Manifest:** Ein formal manipuliertes
   Manifest konnte bisher erst durch einen nachfolgenden Datei- oder
   Laufzeitfehler scheitern. Formatversion, Pflichtfelder, Größen, SHA-256-Werte
   und kanonische Pfade werden nun vor jedem Restore explizit validiert.
4. **Lokaler SQLite-Recovery-Befehl benötigte eine manuelle Umgebung:**
   `db:sqlite:verify:recovery` lädt eine vorhandene lokale `.env`, ohne bereits
   gesetzte Umgebungswerte zu überschreiben. Der dokumentierte Befehl ist
   dadurch direkt reproduzierbar.
5. **Gesamttest hing von einer exportierten Shell-Umgebung ab:** Einzelne API-
   und Datenbanktests konnten trotz vorhandener `.env` ohne manuell exportierte
   `DATABASE_URL` scheitern. Beide Workspace-Testeinstiege laden die lokale
   Datei nun optional; explizit gesetzte CI-Werte behalten Vorrang.

## Nachweismatrix

| Grenze                 | Aktueller Nachweis                                                                                                                              | Ergebnis                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| PostgreSQL-Migration   | 19 versionierte Migrationen auf neuer Datenbank; zweiter Lauf ohne offene Migration                                                             | bestanden                             |
| SQLite-Migration       | 10 prüfsummengeschützte SQL-Migrationen; Wiederholung, Fremdschlüssel- und Integritätsprüfung                                                   | bestanden                             |
| Seed                   | PostgreSQL-Seed zweimal auf demselben Bestand                                                                                                   | bestanden, unverändert                |
| PostgreSQL-Neustart    | Compose-Stopp ohne Volume-Löschung, Neustart, Readiness und Migrationsstatus                                                                    | bestanden                             |
| Providerparität        | dieselben 82 API-Fälle seriell auf PostgreSQL und neuer SQLite-Datei                                                                            | bestanden                             |
| Datenmodell            | 23 Datenbanktests für Besitz, Beziehungen, Basiseinheiten, Termine und beide Provider                                                           | bestanden                             |
| PostgreSQL-Recovery    | neue Quell- und Zieldatenbanken, Datenvergleich, Pflichtprüfsumme, falsche Prüfsumme, ungültiges Archiv und wiederholter Restore                | bestanden                             |
| SQLite-Import/Recovery | vollständiger Modellimport, Online-Backup, Dokumente, neue Ziele, Daten- und Identitätsvergleich                                                | bestanden                             |
| Dokumente              | private Verzeichnisse/Dateien, Manifest, Downloadhash, fehlende Datei/Prüfsumme, Traversal, Symlink, disjunkte Ziele und wiederholter Restore   | bestanden                             |
| API und Fachmodule     | `/api/v1`, Fehlervertrag, Besitz, Archivierung/Soft-Delete, Dashboard, Suche, KI, Projekte, Aufgaben, Studium, Arbeit, Finanzen und Fitness     | bestanden                             |
| Kalender und CalDAV    | UID, ETag, Sync-Token/-Version, Ganztag, Zeitzone, `VTIMEZONE`, Wiederholung, Erinnerungen, Konflikte und Soft-Delete                           | bestanden                             |
| Browser/PWA            | 43 Unit- und 30 Playwright-Fälle auf Desktop- und Mobilviewport einschließlich App-Shell ohne persönliche Browserpersistenz                     | bestanden                             |
| Sidecar-Neustart       | gebündeltes Node 22, dynamischer Loopback-Port, SQLite, Anmeldung nach Neustart sowie unveränderte Benutzer-, Kalender- und Ereignisidentitäten | bestanden                             |
| Lokales DMG            | ARM64-Build, `hdiutil verify`, isolierte Kopie, ad-hoc-Signatur und Sidecar ohne globales Node oder Docker                                      | bestanden auf diesem Entwicklungs-Mac |

Die Prüfungen enthalten fremde IDs, ungültige Zeitformen, ETag-Konkurrenz und
Verknüpfungen von Aufgaben, Projekten und Fitness mit Kalenderereignissen. Die
Verknüpfungen kopieren oder ändern keine Ereignisdaten. `db push` ist in keinem
ausführbaren Projekt- oder CI-Skript enthalten.

## Backup und Restore

Für den PostgreSQL-/Browserbetrieb bilden Datenbank und Dokumente gemeinsam
den wiederherzustellenden Bestand:

```bash
npm run db:backup -- backups/lifeos-<zeitpunkt>.dump
STORAGE_PATH="/absoluter/pfad/documents" \
  npm run documents:backup -- /absoluter/neuer/pfad/documents-backup
```

Beide Backups sind unverschlüsselt und vertraulich. Eine Wiederherstellung
verwendet immer neue Ziele:

```bash
npm run db:restore -- backups/lifeos-<zeitpunkt>.dump lifeos_restore_<name>
STORAGE_PATH="/absoluter/neuer/pfad/documents" \
  npm run documents:restore -- /absoluter/pfad/documents-backup
```

Die Umschaltung auf diese Ziele bleibt eine bewusste Aktion nach Readiness-,
Integritäts- und Datenvergleich. Die aktive Datenbank und das aktive
Dokumentverzeichnis werden nicht überschrieben.

Backup- und Prüfsummenziele dürfen weder vorhandene Dateien noch symbolische
Links sein. Ein Dokumenten- oder SQLite-Backup darf nicht innerhalb seiner
Quelle liegen; Restore-Datenbank und -Dokumentverzeichnis dürfen weder im
Backup noch ineinander liegen. Der automatisierte Recovery-Test prüft diese
Grenzen vor jedem Schreibvorgang. PostgreSQL-Dump und Dokumentensicherung sind
weiterhin zwei zeitlich zu koordinierende Vorgänge; währenddessen sind
Schreibaktionen zu pausieren.

Die Mac-App verwendet weiterhin das gemeinsame SQLite-Backup, das Datenbank
und Dokumente in einem Manifest zusammenführt:

```bash
npm run db:sqlite:backup -- /absoluter/neuer/pfad/backup
npm run db:sqlite:restore -- /absoluter/pfad/backup
```

## Update und Rollback

0.6.2 fügte keine Schemaänderung hinzu. Der finale 0.6.4-Lauf startete zuerst
das echte 0.1.0-DMG, legte Benutzer, Kalender, Ereignis, Aufgabe und Dokument
an und verwendete anschließend dieselbe SQLite-/Dokumentablage mit 0.6.0 und
erneut 0.1.0. Benutzer-ID, Kalender-ID, Ereignis-UID, ETag, Sync-Version,
Sync-Token, Aufgabe und Dokumenthash blieben erhalten. Ein unter 0.6.0
erstelltes prüfsummengeschütztes Backup wurde zusätzlich ausschließlich in
eine neue SQLite-Datei und ein neues Dokumentverzeichnis restauriert und dort
erneut mit 0.6.0 geprüft. Details stehen im
[`lokalen Abschlussnachweis Roadmap 0.6`](roadmap-06-local-demo.md).

## Aktuell ausgeführte Befehle

- `npm run db:validate`
- `npm run db:sqlite:validate`
- `npm run db:migrate`
- `npm run db:seed` (zweimal)
- `npm run db:test`: 23 von 23 bestanden
- `npm run db:sqlite:test`: 9 von 9 bestanden
- `npm run test:sqlite:api`: 82 von 82 bestanden
- PostgreSQL-API-Matrix: 82 von 82 bestanden
- `npm run verify:sqlite:api-runtime`
- `npm run db:verify:recovery`
- `npm run db:sqlite:verify:recovery`
- `npm test --workspace @lifeos/web`: 43 Unit- und 30 Browsertests bestanden
- `npm run desktop:verify:sidecar`
- `npm run desktop:build:dmg`
- `npm run desktop:verify:dmg`

## Grenzen

- Der lokale Zwei-Versionen-Update-/Rollback-Lauf ist abgeschlossen. Er ist
  kein Ersatz für einen Update-Test des später öffentlich signierten und
  notarisierten Download-Artefakts.
- PostgreSQL- und Dokumentenbackup sind zwei gemeinsam aufzubewahrende,
  zeitlich koordinierte Artefakte. Während der Sicherung soll der schreibende
  Betrieb pausieren.
- Backups sind nicht verschlüsselt.
- Developer-ID, Apple-Notarisierung, Gatekeeper-Downloadpfad, zweiter sauberer
  unterstützter Mac, Intel-/Universal-Build und physischer Apple-Kalender-Test
  über abgesichertes LAN sind nicht geprüft und bleiben offen.
