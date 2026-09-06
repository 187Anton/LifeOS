# Lokaler Abschlussnachweis Roadmap 0.6

Stand: 5. September 2026

## Ergebnis

Roadmap 0.6 ist für den lokalen ARM64-Betrieb mit ausschließlich synthetischen
Daten vollständig geprüft. Der Abschlusslauf deckte Browser, PostgreSQL,
SQLite, Backup und Restore, den gebündelten Sidecar, die installierbare
Tauri-App sowie einen echten Zwei-Versionen-Update-/Rollback-Pfad ab. Dabei
wurden keine persönlichen Daten, echten Zugangsdaten oder externen
Integrationsziele verwendet.

Das geprüfte lokale Artefakt ist kein öffentlich freigegebenes Release. Die
Developer-ID-, Notarisierungs-, Gatekeeper-, Zweit-Mac-, weitere Architektur-
und physische Apple-Kalender-Prüfung bleiben ausdrücklich offen.

## Reproduzierbarer Abschlusslauf

Der vollständige Ablauf wird mit einem bereits geprüften Baseline-DMG
gestartet:

```bash
npm run demo:stabilization -- \
  "/absoluter/pfad/Anton Life OS_0.1.0_aarch64.dmg"
```

Das Skript bricht bei jedem Fehler ab und führt nacheinander aus:

1. Format-, Repository-, Secret-, Typ-, Lint- und Build-Prüfung;
2. PostgreSQL-Start, alle Migrationen, wiederholbaren Seed, Stop, Neustart und
   Verbindungsprüfung mit erhaltenem Volume;
3. vollständige Repository-, Datenbank-, API-, Web-, Desktop- und mobile
   Browsertests;
4. SQLite-Migration, vollständige API-Parität, Laufzeitneustart sowie
   PostgreSQL-/SQLite-Recovery;
5. Rust-Lifecycle-Tests, lokalen Tauri-/DMG-Build und Artefaktprüfung;
6. Zwei-Versionen-Update, Backup, Rollback und Restore in neue Ziele;
7. abschließenden Secret-Scan.

## Geprüfte Produktdemo

Der aus dem DMG kopierte Node-22-/Express-/SQLite-Sidecar führte über reale
HTTP- und Dateigrenzen folgende Schritte aus:

- atomare Ersteinrichtung und Anmeldung;
- authentifizierte CalDAV-Discovery;
- Projekt, Ziel und Meilenstein;
- Aufgabe anlegen und bearbeiten;
- Kalenderereignis mit stabiler UID, ETag, Sync-Version und Sync-Token;
- Notiz sowie Dokument-Upload und unveränderter Download;
- ausschließlich lokale Suche;
- deaktivierte KI-Grundlage ohne externen Netzwerkpfad;
- Finanzbuchung und Budget;
- Fitnessplan, Übung, Training und Satz;
- ICS-Vorschau, bestätigter Import und Export;
- deaktivierte externe CalDAV- und GitHub-Integrationen;
- geordnetes Beenden und Neustarten des Sidecars;
- unveränderte Identitäten und Datensätze nach dem Neustart;
- keine Klartextpasswörter in der SQLite-Datei.

Die vorhandenen 44 Web-Unit- und 32 Playwright-Fälle prüften zusätzlich die
gemeinsame Oberfläche in Desktop- und Mobilviewport, die Offline-App-Shell und
die vom Browser freizugebende PWA-Installation. Persönliche API-Daten wurden
weder in Browser-Storage noch im Service-Worker-Cache persistiert.

## Update, Rollback und Restore

Ein eigener Nachweis verwendete zwei echte DMGs und dieselbe lokale
SQLite-/Dokumentablage:

1. LifeOS 0.1.0 legte Benutzer, Kalender, Ereignis, Aufgabe und Dokument an.
2. LifeOS 0.6.0 startete auf denselben Daten und bestätigte alle Identitäten
   sowie den Dokumenthash.
3. Der 0.6.0-Stand wurde mitsamt Dokumenten und SHA-256-Manifest gesichert.
4. LifeOS 0.1.0 startete als Rollback erneut auf denselben Daten.
5. Das Backup wurde ausschließlich in eine neue SQLite-Datei und ein neues
   Dokumentverzeichnis restauriert.
6. LifeOS 0.6.0 startete auf dem neuen Restore-Ziel und bestätigte erneut
   Benutzer-ID, Kalender-ID, UID, ETag, Sync-Version, Sync-Token, Aufgabe und
   Dokumenthash.

Damit sind App-Austausch, Update, Rollback und Wiederherstellung ohne
Überschreiben der aktiven Quelle nachgewiesen. Das Backup ist
prüfsummengeschützt, aber nicht verschlüsselt und bleibt vertraulich zu
behandeln.

## Installierbare Mac-App

Die App wurde aus dem schreibgeschützt eingebundenen DMG nach
`/private/tmp` kopiert, vollständig ad-hoc-signaturgeprüft und als native
Tauri-App gestartet. Sie legte Datenbank und Log mit Modus `0600` an. Ein
reguläres macOS-Beenden schloss anschließend auch den Sidecar-Prozess.

Die Installation benötigt zur Laufzeit weder Docker noch ein separat
installiertes Node.js. Die Anwendung verwendet die gebündelte offizielle
Node-22-Laufzeit, Express, SQLite und einen dynamischen Loopback-Port.

## Artefakt

Der finale lokale Abschlusslauf erzeugte:

```text
apps/desktop/src-tauri/target/release/bundle/dmg/Anton Life OS_0.6.0_aarch64.dmg
```

- Größe: `52.404.856` Bytes
- SHA-256:
  `9db2528c11bb6b0f86c5f2583cf427374e681066441bdfdd9fd4e76a4ea8ab84`
- Architektur: Apple Silicon/ARM64
- Signaturstatus: lokal konsistent ad-hoc signiert

Die gleichnamige `.sha256`-Datei ist für die konkrete Datei maßgeblich. Ein
erneuter Build darf wegen DMG-Metadaten eine andere, neu erzeugte Prüfsumme
haben.

## Ausgeführte Prüfungen

Der Abschlusslauf bestand unter anderem:

- 14 Repository-Tests;
- 23 PostgreSQL-Datenbanktests;
- 82 API-Fälle auf PostgreSQL;
- 82 API-Fälle auf SQLite;
- 9 SQLite-Migrationsfälle;
- 44 Web-Unit-Tests;
- 32 Desktop-/Mobil-Playwright-Fälle;
- 4 Rust-Lifecycle-Tests;
- PostgreSQL-Migration, wiederholten Seed und echten Neustart;
- PostgreSQL- und SQLite-Recovery einschließlich manipulierter Backups;
- nativen App-Start, reguläres Beenden und Sidecar-Lifecycle;
- vollständige Sidecar-Produktdemo und Neustart;
- Update 0.1.0 → 0.6.0, Rollback 0.6.0 → 0.1.0 und Restore in neue Ziele;
- abschließenden Secret-Scan.

## Behobene Befunde im Abschlusslauf

- Die frühere DMG-Prüfung startete nur den Sidecar. Sie startet nun zusätzlich
  die tatsächlich kopierte native App, prüft private Dateirechte und das
  geordnete Beenden des Kindprozesses.
- Eine App-Kopie im tief verschachtelten benutzerspezifischen temporären
  Verzeichnis konnte Tauri mit `unknown path` beenden. Die installierte
  Prüflaufkopie verwendet deshalb das reguläre macOS-Verzeichnis
  `/private/tmp`; der Fehler ist im reproduzierbaren DMG-Gate abgedeckt.
- Der bisherige Update-Nachweis endete bei 0.1.1. Der neue Test verwendet das
  aktuelle 0.6.0-Artefakt und prüft zusätzlich Dokumenthash, Backup und Restore
  in neue Ziele.

## Offene Release-Gates

Die folgenden Punkte wurden nicht geprüft und sind keine lokale oder
öffentliche Freigabeaussage:

- Developer-ID-Signatur;
- Apple-Notarisierung;
- Gatekeeper-Prüfung eines heruntergeladenen finalen Artefakts;
- zweiter sauberer unterstützter Mac;
- Intel-/x86_64- oder Universal-Build;
- physischer Apple-Kalender-Test über ein abgesichertes LAN.

Der am 7. September 2026 wiederholte Online-Abgleich meldete nach gezielten
Transitivaktualisierungen 0 npm-Advisories. Das Tauri-Lockfile meldete gegen
die aktuelle RustSec-Datenbank keine bekannte Sicherheitslücke; verbleibende
Upstream-Wartungswarnungen, Ursachen und Release-Grenzen stehen im
[`Sicherheitsreview 0.6`](security-review-0.6.md).
