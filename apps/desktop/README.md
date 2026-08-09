# LifeOS Desktop für macOS

Die Desktop-Anwendung ist der in M5 nachgewiesene Tauri-2-Prototyp. Sie startet
dieselbe gebaute React-Oberfläche und denselben Express-/CalDAV-Kern wie der
Browserbetrieb. Eine zweite Fach- oder Kalenderimplementierung gibt es nicht.

## Laufzeitaufbau

Tauri wählt beim Start einen freien Port auf `127.0.0.1`, legt die privaten
Anwendungsverzeichnisse an, startet den gebündelten Node-Sidecar und wartet auf
`/api/v1/readiness`. Erst danach öffnet das Fenster die lokale HTTP-Adresse.
Beim Beenden erhält der Sidecar `SIGTERM`. Unerwarteter Prozessabbruch oder ein
fehlgeschlagener Start werden als nativer Fehlerdialog angezeigt.

Die `.app` benötigt zur Laufzeit weder Docker noch Homebrew noch ein separat
installiertes Node.js. Der Build lädt stattdessen das offizielle
Node-22.23.2-Archiv für die aktuelle Mac-Architektur, prüft dessen fest
eingetragene SHA-256-Prüfsumme und verwirft Binärdateien mit Abhängigkeiten
außerhalb der macOS-Systembibliotheken. Web-Build, Server-Bundle,
SQLite-Migrationen und das native `better-sqlite3`-Modul werden als
unveränderliche App-Ressourcen gebündelt.

## Entwickler-Build

Voraussetzungen für den Build, nicht für den späteren App-Start:

- macOS auf Apple Silicon;
- Node.js 22 und npm;
- Rust Stable mit Cargo;
- Xcode oder die Xcode Command Line Tools.

Sidecar und Ressourcen ohne Tauri-Bundle prüfen:

```bash
npm run desktop:verify:sidecar
```

Native `.app` bauen:

```bash
npm run desktop:build:app
```

Das lokale, nicht versionierte Ergebnis liegt danach unter:

```text
apps/desktop/src-tauri/target/release/bundle/macos/Anton Life OS.app
```

Der erste Download wird unter `apps/desktop/.cache/` wiederverwendet. Alle
erzeugten Sidecar-, Ressourcen-, Cache- und Tauri-Zielverzeichnisse bleiben aus
Git ausgeschlossen. `Cargo.lock` und `package-lock.json` sind dagegen Teil des
reproduzierbaren Builds.

## Lokale Datenpfade

Der Bundle-Identifier lautet `de.anton.lifeos`. Im geprüften macOS-Betrieb
werden folgende Pfade verwendet:

- Datenbank: `~/Library/Application Support/de.anton.lifeos/data/lifeos.sqlite`
- Dokumente: `~/Library/Application Support/de.anton.lifeos/documents/`
- Backups: `~/Library/Application Support/de.anton.lifeos/backups/`
- lokale Logs: `~/Library/Logs/de.anton.lifeos/lifeos-api.log`

App-Datenverzeichnisse erhalten Modus `0700`, SQLite-Datei und Log Modus
`0600`. Logs enthalten strukturierte Betriebsmetadaten, aber keine
Anfragekörper, Cookies oder Zugangsdaten.

## Nachgewiesene Grenzen

- M5 ist auf macOS ARM64 gebaut und gestartet worden. Intel- oder
  Universal-Builds sind noch nicht nachgewiesen.
- Die `.app` ist lokal ad-hoc signiert, aber noch nicht mit einer Developer-ID
  signiert oder von Apple notarisiert. DMG und sauberer Installations-/Update-
  Test gehören zu M6.
- Der dynamische Loopback-Link kann parallel in einem Browser geöffnet werden.
  Die Desktop-App bindet absichtlich noch nicht ins LAN; ein iPhone erreicht
  diesen M5-Prototyp deshalb nicht. Der physische Apple-Kalender-Test bleibt
  offen.
- Ein neuer App-Datensatz enthält noch keinen vom Nutzer gesetzten Zugang. Die
  terminalfreie Ersteinrichtung für Web- und CalDAV-Passwort ist ein offenes
  M6-Gate.
- Backup und Restore sind technisch nachgewiesen, aber noch nicht in die
  Desktop-Oberfläche eingebunden.
