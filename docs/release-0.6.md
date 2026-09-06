# Lokaler Release-Ablauf 0.6

Stand: 5. September 2026

Dieses Dokument beschreibt den reproduzierbaren lokalen Buildweg für LifeOS
0.6.0. „Reproduzierbar“ bedeutet hier: versionierte Quellen, gesperrte npm-
und Cargo-Abhängigkeiten, festgelegte Node-22-Laufzeit mit veröffentlichter
SHA-256-Prüfsumme, automatisierte Build-/Laufzeitprüfungen und eine neue
Prüfsumme für jedes erzeugte Artefakt. Wegen DMG-Metadaten und lokaler
Signaturzeitpunkte wird keine identische Bytefolge zwischen zwei Builds
behauptet.

## Eine Versionsquelle

`package.json` im Repository-Stamm ist die führende Versionsquelle. Für 0.6
lautet sie `0.6.0`. `npm run release:verify` bricht ab, sobald eine der
folgenden Stellen davon abweicht:

- alle npm-Workspaces und ihre internen LifeOS-Abhängigkeiten;
- `package-lock.json`;
- Tauri-Konfiguration;
- `Cargo.toml` und der eigene Eintrag in `Cargo.lock`;
- Node-Hauptversion in `.nvmrc` und `engines.node`.

Ein Versionswechsel wird bewusst an allen geprüften Stellen vorgenommen und
mit aktualisiertem Lockfile committed. Aus dem führenden Wert werden
DMG-Dateiname und Verifikationspfad abgeleitet; sie enthalten keine fest
eingetragene alte Version mehr.

## Lokaler ARM64-Build

Voraussetzungen auf dem Entwicklungs-Mac:

- macOS mit Xcode Command Line Tools;
- Node.js 22 und npm 10 oder neuer für den Build;
- Rust/Cargo für Tauri;
- eine bestehende npm-Installation aus `package-lock.json`.

Der vollständige Ablauf lautet:

```bash
npm ci
npm run release:build:local
npm run release:verify:local
```

`release:build:local` prüft zuerst alle Versionsstellen, baut dieselbe
React-Oberfläche für Browser und Tauri, bündelt das Express-Backend,
SQLite-Migrationen, das native SQLite-Modul und die offizielle Node-Laufzeit
22.23.2. Die Laufzeit wird vor Verwendung gegen die im Buildskript festgelegte
SHA-256-Prüfsumme geprüft.

Auf Apple Silicon entstehen lokal:

```text
apps/desktop/src-tauri/target/release/bundle/dmg/Anton Life OS_0.6.0_aarch64.dmg
apps/desktop/src-tauri/target/release/bundle/dmg/Anton Life OS_0.6.0_aarch64.dmg.sha256
```

Der finale lokale 0.6.4-Abschlusslauf erzeugte bei `52.404.856` Bytes die
Prüfsumme
`9db2528c11bb6b0f86c5f2583cf427374e681066441bdfdd9fd4e76a4ea8ab84`.
Ein späterer Build erhält wegen DMG-Metadaten voraussichtlich eine andere
Prüfsumme; maßgeblich ist immer die gemeinsam erzeugte `.sha256`-Datei.

`release:verify:local` prüft:

- die portable SHA-256-Datei;
- die interne DMG-Prüfsumme;
- schreibgeschütztes Mounten und den Programme-Link;
- eine isoliert aus dem DMG kopierte App;
- den nativen App-Start aus einer isolierten `/private/tmp`-Installationskopie
  sowie den regulären macOS-Quit mit beendetem Sidecar;
- die vollständige lokale Code-Signaturstruktur;
- gebündeltes Node 22, Express, SQLite und Migrationen ohne Homebrew-/Node-Pfad;
- dynamische Loopback-Ports, Ersteinrichtung, Anmeldung und Neustart;
- den pro Start zufälligen Sidecar-Nachweis, eine leere Kindprozessumgebung und
  die Abweisung einer zweiten schreibenden App-Instanz;
- eine vollständige synthetische Produktdemo von Projekt, Aufgabe, Kalender,
  CalDAV, Dokument, Suche, KI-Grenze, Finanzen, Fitness und ICS;
- unveränderte Benutzer-, Kalender-, UID-, ETag- und Sync-Identitäten.

Das Löschen oder Austauschen der `.app` berührt die persönlichen Daten unter
`~/Library/Application Support/de.anton.lifeos/` nicht. Daten werden nur nach
einer bewussten, separat geprüften Backup-/Restore-Entscheidung umgestellt.
Der tatsächliche Zwei-Versionen-Nachweis 0.1.0 → 0.6.0 → 0.1.0 sowie Restore
in neue Ziele ist im
[`lokalen Abschlussnachweis`](roadmap-06-local-demo.md) protokolliert.

## Browser und PWA

Der Produktions-Build enthält Manifest, lokale Icons und Service Worker. Wenn
ein unterstützter Browser das standardisierte Installationsereignis auslöst,
zeigt LifeOS in der angemeldeten Oberfläche „App installieren“ und übergibt
die Entscheidung an den Browser. Nach Annahme oder Ablehnung wird das Ereignis
nicht erneut verwendet. Persönliche Daten werden dabei weder im Service Worker
noch in `localStorage` oder `sessionStorage` persistiert.

44 Web-Unit- und 32 Playwright-Fälle prüfen die Oberfläche auf Desktop- und
Mobilviewport, darunter Manifest, Offline-App-Shell, Browserfreigabe und
Installationsaktion.

## CI

Die Repository-CI prüft auf jedem PR nach `develop` oder `main` sowie auf
beiden Branches:

- Secret-Scan, aktuelles npm-Advisory-Gate, Format und Compose;
- PostgreSQL-Migration, wiederholbaren Seed und Recovery;
- Lint, Typen, Build und alle Workspace-Tests;
- SQLite-Migration, vollständige API-Parität, Laufzeitneustart und Recovery;
- konsistente Release-Metadaten.

Ein getrennter macOS-Job prüft `Cargo.lock` zusätzlich mit RustSec, baut die
Tauri-App und das DMG, führt sechs Rust-Lifecycle-Tests aus und prüft das lokal
signierte Artefakt. Ein grüner CI-Job ist ein Buildnachweis, aber keine
öffentliche Produktfreigabe.
Die gemeinsame Desktop-Vorbereitung erzeugt zuerst beide Prisma-Clients;
`desktop:test` bereitet anschließend auch seine Sidecar-Ressourcen selbst vor.
Damit sind Test und Build in einem frischen Checkout unabhängig von alten
generierten Dateien. Die Codegenerierung verwendet nur dafür eine synthetische,
nicht kontaktierte PostgreSQL-URL und benötigt weder `.env` noch einen laufenden
Datenbankdienst.

## Klare Release-Grenze

Das 0.6.0-DMG ist auf dem Entwicklungs-Mac lokal ad-hoc signiert und geprüft.
Es wird nicht als öffentlich freigegebenes oder notarisiertes Release
bezeichnet. Eine Veröffentlichung bleibt gesperrt, bis alle folgenden Punkte
mit dem finalen Artefakt tatsächlich nachgewiesen sind:

- Developer-ID-Signatur;
- Apple-Notarisierung;
- Gatekeeper-Prüfung des heruntergeladenen Artefakts;
- Start auf einem zweiten sauberen unterstützten Mac;
- bewusste Festlegung und Prüfung weiterer unterstützter Architekturen;
- physischer Apple-Kalender-Test über abgesichertes LAN.

Der aktuelle lokale Build unterstützt nachgewiesen Apple Silicon/ARM64. Eine
x86_64-Laufzeit ist prüfsummengeschützt vorbereitet, aber ein Intel- oder
Universal-DMG wurde in diesem lokalen Lauf nicht gebaut und bleibt offen.
