# LifeOS Desktop für macOS

Die Desktop-Anwendung ist der in M5 nachgewiesene Tauri-2-Prototyp. Sie startet
dieselbe gebaute React-Oberfläche und denselben Express-/CalDAV-Kern wie der
Browserbetrieb. Eine zweite Fach- oder Kalenderimplementierung gibt es nicht.

## Laufzeitaufbau

Tauri wählt beim Start einen freien Port auf `127.0.0.1`, legt die privaten
Anwendungsverzeichnisse an, startet den gebündelten Node-Sidecar und wartet auf
`/api/v1/readiness`. Die Antwort gilt nur mit einem zufälligen, pro Start neu
erzeugten Nachweis als die eigene Sidecar-Instanz. Erst danach öffnet das Fenster
die lokale HTTP-Adresse.
Beim Beenden erhält der Sidecar `SIGTERM`. Unerwarteter Prozessabbruch oder ein
fehlgeschlagener Start werden als nativer Fehlerdialog angezeigt.

Vor dem Sidecar-Start hält die App eine private, nicht blockierende
Instanzsperre im Datenverzeichnis. Eine zweite Instanz darf deshalb weder einen
zweiten schreibenden SQLite-Prozess noch einen zweiten Sidecar starten. Der
Sidecar erbt keine Elternumgebung; nur die für den lokalen Betrieb fest
freigegebenen Variablen werden gesetzt.

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

Das vollständige lokale Release bauen und die daraus kopierte App prüfen:

```bash
npm run release:build:local
npm run release:verify:local
```

Das lokale, versionierte ARM64-Ergebnis liegt danach unter:

```text
apps/desktop/src-tauri/target/release/bundle/macos/Anton Life OS.app
apps/desktop/src-tauri/target/release/bundle/dmg/Anton Life OS_0.6.0_aarch64.dmg
apps/desktop/src-tauri/target/release/bundle/dmg/Anton Life OS_0.6.0_aarch64.dmg.sha256
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

- M5 und das lokale Release 0.6.0 sind auf macOS ARM64 gebaut und gestartet
  worden. Intel- oder
  Universal-Builds sind noch nicht nachgewiesen.
- M6 hat das DMG schreibgeschützt geprüft, die App daraus in ein isoliertes
  Programme-Verzeichnis kopiert und den gebündelten Sidecar dort ohne globale
  Laufzeit gestartet. Die Bundle-Signatur ist lokal ad-hoc konsistent, aber
  noch nicht mit einer Developer-ID signiert oder von Apple notarisiert. Das
  lokale DMG 0.6.0 wird bei jedem Build mit einer portablen `.sha256`-Datei
  ausgeliefert und vor der Bundle-Prüfung dagegen verifiziert.
- Der dynamische Loopback-Link kann parallel in einem Browser geöffnet werden.
  Die Desktop-App bindet absichtlich noch nicht ins LAN; ein iPhone erreicht
  diesen M5-Prototyp deshalb nicht. Der physische Apple-Kalender-Test bleibt
  offen.
- Der erste App-Start bietet eine terminalfreie Ersteinrichtung für Profil,
  App-Passwort und getrennten CalDAV-Zugang. Ein isolierter Test bestätigte
  Erststart, Neustart, Update von 0.1.0 auf 0.6.0 und Rollback auf 0.1.0 ohne
  Verlust stabiler IDs, Synchronisationswerte, Aufgaben oder Dokumente. Das
  unter 0.6.0 erstellte Backup wurde zusätzlich ausschließlich in neue Ziele
  restauriert und erneut mit 0.6.0 geprüft.
- Die DMG-Prüfung startet die tatsächlich kopierte native App, kontrolliert
  Dateirechte, Startnachweis, Secret-Isolation und Einzelinstanzsperre und
  beendet sie regulär über macOS; der Sidecar darf danach nicht weiterlaufen.
  Backup und Restore sind noch nicht in die Desktop-Oberfläche eingebunden.
- Die externe CalDAV-Integration bleibt in der Mac-App ohne einen nativen
  Schlüsselbundpfad vollständig nicht verfügbar. Der Sidecar-Test bestätigt
  den sicheren Status `available: false`; eine spätere Aktivierung darf keinen
  Schlüssel aus dem Repository oder Browser-Storage verwenden.
- Dasselbe gilt für die optionale GitHub-Integration: Der Sidecar-Test erwartet
  ohne nativen Schlüsselbundpfad `available: false`, eine leere
  Verbindungsliste und ausbleibende Netzwerkaktivität. Produktive Tokens sind
  nicht Teil des Desktop-Nachweises.
- Das Entfernen der isolierten App-Kopien ließ SQLite-Daten und Update-Backup
  unangetastet; die erhaltene Datenbank bestand anschließend erneut ihre
  Integritätsprüfung.
- Ein zweiter sauberer unterstützter Mac, Developer-ID, Notarisierung und ein
  Intel-/Universal-Build bleiben externe Release-Gates; M6 ist deshalb noch
  nicht vollständig freigegeben.

Der vollständige Zwei-Versionen-Test kann mit zwei regulären DMGs wiederholt
werden:

```bash
npm run desktop:verify:update-rollback -- \
  "/absoluter/pfad/Anton Life OS_0.1.0_aarch64.dmg" \
  "/absoluter/pfad/Anton Life OS_0.6.0_aarch64.dmg"
```

Prüfmatrix, Artefakt und offene Gates stehen im
[`lokalen Roadmap-0.6-Nachweis`](../../docs/roadmap-06-local-demo.md).
