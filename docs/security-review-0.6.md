# Sicherheits-, Integritäts- und Stabilitätsreview 0.6

Stand: 7. September 2026

## Ergebnis

Der Gesamtstand von Backend, Web/PWA, PostgreSQL, SQLite, Migrationen,
CalDAV/ICS, externen Integrationen, Dateiablage, Recovery, Tauri/Sidecar,
CI und Release wurde mit ausschließlich synthetischen Daten geprüft. Es wurde
kein kritischer Befund festgestellt. Alle bekannten hohen Befunde sind behoben
und durch Regressionstests oder einen realen lokalen Lauf belegt. Mittlere
Befunde sind behoben oder unter „Bewusst offene Grenzen“ mit Ursache und
nächstem sinnvollen Schritt dokumentiert.

Der Review ist ein technischer Quellcode-, Integrations- und Laufzeitnachweis,
kein externer Penetrationstest und keine öffentliche Produktfreigabe.

## Befunde und Korrekturen

| ID      | Einstufung | Ursache                                                                                                                                                                                                                                                                                       | Korrektur und Nachweis                                                                                                                                                                                                                                               | Status  |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| SEC-01  | hoch       | Das npm-Lockfile enthielt 14 bekannte Advisories, davon sieben hoch, sechs mittel und eines niedrig. Betroffen waren Laufzeit- und Buildtransitive unter anderem über `qs`, `fast-uri`, Prisma CLI, `brace-expansion`, `postcss`, `nanoid` und `esbuild`.                                     | Eng begrenzte npm-Overrides aktualisieren nur die verwundbaren Transitiven. `npm ci`, vollständige Tests und Builds bestanden; die aktuelle Registry meldet 0 Advisories. `npm audit --audit-level=low` ist jetzt CI-Gate.                                           | behoben |
| SEC-02  | hoch       | Ein Logout verwendete die aktuelle Uhrzeit direkt. Bei einer vorauseilenden oder manipulierten Erzeugungszeit konnte der Datenbank-Constraint den Widerruf ablehnen und die Sitzung aktiv lassen.                                                                                             | Jeder Einzelwiderruf verwendet atomar den späteren Wert aus `createdAt` und aktueller Zeit. Ein PostgreSQL-Test reproduziert die Zukunftsuhr.                                                                                                                        | behoben |
| SEC-03  | hoch       | Der Tauri-Sidecar erbte die komplette Elternumgebung und damit potenziell Integrationsschlüssel oder andere lokale Secrets.                                                                                                                                                                   | Der Kindprozess startet mit leerer Umgebung und erhält nur eine feste Positivliste. Der DMG-Test startet die Eltern-App mit synthetischen Geheimnissen und prüft ohne Wertausgabe, dass sie im Sidecar fehlen.                                                       | behoben |
| SEC-04  | hoch       | Mehrere native App-Instanzen konnten gleichzeitig schreibend dieselbe SQLite-Datei öffnen. WAL und Sperrwartezeit ersetzen keinen Einzelprozessvertrag.                                                                                                                                       | Eine private, nicht blockierende `flock`-Instanzsperre wird vor Datenbank- und Sidecar-Start gehalten. Rust- und DMG-Tests weisen die Abweisung der zweiten Instanz und genau einen Sidecar nach.                                                                    | behoben |
| SEC-05  | hoch       | Der externe CalDAV-SSRF-Filter sperrte private IPv4-/IPv6-Ziele, aber nicht alle relevanten Übersetzungs-, Benchmark- und reservierten Netze wie NAT64 und 6to4.                                                                                                                              | Getrennte IPv4-/IPv6-Sperrlisten blockieren Loopback, private, Link-Local-, Metadata-nahe, reservierte und IPv4-übersetzende Bereiche vor der gepinnten Verbindung. Neue Clienttests decken diese Klassen ab.                                                        | behoben |
| INT-01  | hoch       | Dokument-/SQLite-Backups konnten in die eigene Quelle oder Restore-Ziele in das Backup gelegt werden; PostgreSQL-Backup und Prüfsumme lehnten bereits vorhandene reguläre Dateien, aber keine Symlinks sicher ab. Dadurch drohten Rekursion, Überschreiben oder inkonsistente Recovery-Sätze. | Quelle, Backup, Datenbank- und Dokumentziel müssen disjunkt sein. Backup-Wurzeln und Quelldateien dürfen keine Symlinks sein. PostgreSQL prüft Dump und Prüfsummenziel mit `-e` und `-L`; der Recovery-Test schützt die Symlinkziele mit einem unveränderten Marker. | behoben |
| SEC-06  | mittel     | Neue Passwörter verwendeten Node-scrypt-Standardparameter `N=2^14, r=8, p=1`, unterhalb der aktuellen OWASP-Empfehlung.                                                                                                                                                                       | Neue `scrypt-v2`-Hashes verwenden `N=2^15, r=8, p=3`, 16-Byte-Zufallssalz und 64-Byte-Ausgabe. Gültige `scrypt-v1`-Hashes werden nur zur Anmeldung akzeptiert und danach vergleichsatomar ohne Sitzungswiderruf hochgestuft.                                         | behoben |
| SEC-07  | mittel     | Fünf parallele Passwortprüfungen konnten gleichzeitig starten, bevor Fehlversuche verbucht wurden.                                                                                                                                                                                            | Laufende Prüfungen zählen gegen das Limit; unerwartete Fehler geben den reservierten Platz frei. Ein Paralleltest deckt die Umgehung ab.                                                                                                                             | behoben |
| SEC-08  | mittel     | Die native Readiness akzeptierte jede HTTP-200-Antwort am reservierten Port. Ein lokaler Port-Wettlauf konnte daher den falschen Prozess als LifeOS ausgeben.                                                                                                                                 | Tauri erzeugt pro Start 32 Zufallsbytes. Nur der Sidecar erhält diesen Nachweis und muss ihn auf Readiness exakt zurückgeben. Der Sidecartest prüft die Bindung.                                                                                                     | behoben |
| INT-02  | mittel     | Dokumentdownloads vertrauten nur den gespeicherten Metadaten und bemerkten eine nachträgliche Dateimanipulation nicht.                                                                                                                                                                        | Größe und SHA-256 werden vor jeder Auslieferung erneut geprüft; Abweichungen liefern einen konfliktfreien API-Fehler statt veränderter Bytes.                                                                                                                        | behoben |
| SEC-09  | mittel     | Es fehlte eine Content Security Policy. Eine dynamische Inline-CSS-Eigenschaft der Monatsansicht war mit einer strikten Policy nicht kompatibel.                                                                                                                                              | Zentrale CSP beschränkt Skripte, Stile, Verbindungen, Frames, Objekte und Formulare auf die lokale App. Die Monatsposition nutzt endliche CSS-Klassen statt Inline-Stil.                                                                                             | behoben |
| SEC-10  | mittel     | Dokument-MIME-Angaben wurden in Header übernommen, ohne das Format syntaktisch zu begrenzen.                                                                                                                                                                                                  | Die API akzeptiert nur normalisierte Media-Type-Syntax bis 200 Zeichen; Downloads bleiben `attachment`, `nosniff`, CSP- und `no-store`-geschützt.                                                                                                                    | behoben |
| SEC-11  | mittel     | Passwort- und Sitzungshashparser akzeptierten unnötig breite oder zusätzliche Darstellungen.                                                                                                                                                                                                  | Exakte Versions-, Zahlen-, Base64url- und Längenprüfung sowie das feste 43-Zeichen-Format für Sitzungstokens begrenzen die Eingabe vor Kryptografie und Datenbankzugriff. Manipulierte Token und Hashes sind getestet.                                               | behoben |
| STAB-01 | mittel     | Ein erwarteter Tauri-Setupfehler endete nach dem Dialog über `expect` in einem Panic-/Abort-Pfad.                                                                                                                                                                                             | Build-/Setupfehler führen nun kontrolliert zum Prozessende; der zweite Instanzstart wird ohne Kindprozess oder Datenänderung beendet.                                                                                                                                | behoben |
| CI-01   | mittel     | Die CI prüfte Secrets, aber keine aktuelle npm- oder RustSec-Advisory-Datenbank.                                                                                                                                                                                                              | Linux führt nach `npm ci` ein vollständiges npm-Audit aus. Der macOS-Job verwendet die festgelegte cargo-audit-Version 0.22.2 für `Cargo.lock`.                                                                                                                      | behoben |
| DOC-01  | mittel     | README, Roadmap und M7-Status enthielten ältere Testzahlen und offene Prüfungen, die inzwischen abgeschlossen waren.                                                                                                                                                                          | Die Betriebsdokumentation verweist auf diesen Gesamtbericht, nennt aktuelle Nachweise und trennt lokale Erfolge von weiterhin offenen externen Release-Gates.                                                                                                        | behoben |

Die stärkere scrypt-Konfiguration folgt der aktuellen
[OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
Node empfiehlt außerdem zufällige Salze von mindestens 16 Byte und beschreibt
die verwendeten Kostenparameter in der
[Crypto-Dokumentation](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback).

## Geprüfte Schutz- und Integritätsgrenzen

- Jede Fachroute unter `/api/v1` leitet den Besitzer serverseitig aus der
  Sitzung ab. Fremde Nutzer-, Projekt-, Ziel-, Meilenstein-, Aufgaben-,
  Kalender-, Ereignis-, Studien-, Arbeits-, Finanz-, Fitness-, Dokument-,
  Such- und Integrations-IDs liefern keinen fremden Datensatz.
- Fehlen, Ablauf, Widerruf, Passwortrevision, Zukunftsuhr sowie formal falsche
  und inhaltlich manipulierte Sitzungstokens sind abgedeckt. Cookies bleiben
  `HttpOnly`, `SameSite=Strict`, pfadgebunden und an HTTPS zusätzlich `Secure`.
- JSON, CalDAV/XML, ICS, Dateien, UUIDs, Enums, Datumswerte, IANA-Zeitzonen,
  URLs, Listen und Textfelder besitzen feste Typ-, Längen- oder Mengenlimits.
  DTDs werden abgewiesen; Datenbankzugriffe sind parameterisiert.
- Dokumente liegen außerhalb des Repositorys unter opaken Schlüsseln, mit
  `0700`/`0600`, Symlink- und Traversal-Schutz, 25-MiB-Grenze sowie
  Hashprüfung bei Speicherung, Download, Backup und Restore.
- Externes CalDAV und GitHub sind ohne getrennten 32-Byte-Schlüssel und
  bewusste Aktivierung netzwerkfrei. Zugangsdaten liegen nur
  AES-256-GCM-verschlüsselt im Backend. CalDAV ist HTTPS-, DNS-, IP-, Timeout-,
  Redirect-, Antwort- und Mengen-begrenzt; GitHub ist zusätzlich auf GET an
  `api.github.com` festgelegt. Beide bleiben read-only.
- Logs redigieren sensible Schlüssel rekursiv und enthalten weder Body noch
  Authorization/Cookie noch Klartextzugänge. Audits speichern keine
  Finanzwerte, Dokumentinhalte, KI-Prompts oder Antworten.
- Browser-Schreibzugriffe mit `Origin` benötigen den exakten `WEB_ORIGIN`.
  Nicht-Browser-Clients ohne `Origin` bleiben möglich. API und CalDAV sind
  `private, no-store`; PWA und Browser verwenden keinen persönlichen
  `localStorage`-/`sessionStorage`- oder Runtime-Cache.
- PostgreSQL und SQLite erzwingen Besitz, Fremdschlüssel, ganzzahlige Geld- und
  Fitnesswerte, reine Kalendertage, getrennte Zeitpunkte mit IANA-Zeitzone,
  Soft-Delete sowie stabile UID-, ETag-, Sync-Token- und Sync-Version-Werte.
  Dashboard und Projektfortschritt bleiben nicht persistierte Projektionen;
  Verknüpfungen kopieren keine Fach- oder Kalenderdaten.
- Die lokale KI verwendet nur eigene, aktive und freigegebene Quellen,
  behandelt deren Text als nicht vertrauenswürdig und führt bei Bestätigung
  keine automatische Fachänderung aus.
- Das Tauri-Fenster besitzt keine IPC-Capability. Der Sidecar startet über den
  fest gebündelten Pfad ohne Shell, ausschließlich auf Loopback, mit privater
  SQLite-Ablage, fester Umgebungs-Positivliste, Startnachweis,
  Einzelinstanzsperre und geordnetem Ende.

## Abhängigkeiten und Repository

- `npm audit --audit-level=low`: 0 bekannte Advisories nach der Korrektur.
- `cargo audit` gegen 1.239 RustSec-Advisories: 0 bekannte Sicherheitslücken;
  17 Wartungswarnungen. Die GTK3-/glib-Warnungen gehören nicht zum gebauten
  ARM64-Ziel. Fünf unmaintained-`unic-*`-Transitiven kommen über
  `urlpattern`/`tauri-utils`; ein erzwungener Austausch ohne Tauri-Freigabe
  wäre riskanter als die dokumentierte Beobachtung.
- `npm outdated` zeigt mehrere mögliche Minor- und Major-Aktualisierungen. Sie
  wurden ohne konkrete Lücke bewusst nicht gebündelt. Große Prisma-, Vite-,
  TypeScript-, jsdom- und Testframework-Upgrades benötigen eigene
  Kompatibilitätsarbeit.
- Der aktuelle Secret-Scan bestand. Eine zusätzliche lokale Historienprüfung
  fand keine Provider-Tokens oder privaten Schlüssel; drei frühere Treffer
  waren ausdrücklich synthetische `SESSION_SECRET`-Beispiele in `.env.example`.
- Lockfiles sind versioniert und konsistent; generierte Clients, Builds,
  Desktop-Ressourcen, Daten, Backups und Caches bleiben ignoriert. Im Git-Index
  liegen keine generierten Buildartefakte oder Symlinks.

## Ausgeführte Nachweise

- `npm ci`, `npm audit --audit-level=low`, `npm outdated --json`, `npm ls --all`
- `npm run format:check`, `npm run repo:check`,
  `npm run security:secrets`, `npm run typecheck`, `npm run lint`,
  `npm run build`, `npm test`
- `npm run db:validate`, `npm run db:sqlite:validate`, `npm run db:migrate`,
  zweimal `npm run db:seed`, `npm run db:test`, `npm run db:sqlite:test`
- `npm run test:sqlite:api`, `npm run verify:sqlite:api-runtime`,
  `npm run db:verify:recovery`, `npm run db:sqlite:verify:recovery`
- `npm run desktop:test`, `npm run desktop:verify:sidecar`,
  `npm run desktop:build:dmg`, `npm run desktop:verify:dmg`
- `cargo audit --file apps/desktop/src-tauri/Cargo.lock`

Der finale lokale Wiederholungslauf nach Dokumentation und Formatierung ist für
die oben genannten Befehle maßgeblich. Die CI-Ergebnisse und Pull-Request-Links
werden erst nach deren tatsächlichem Abschluss im GitHub-Workflow ergänzt.

## Bewusst offene Grenzen

| Risiko                                                                                                                                                                                                                                      | Einstufung und Begründung                                                                                                                      | Nächster sinnvoller Schritt                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL-Dump und Dokumentenbackup sind zwei getrennte Werkzeuge. Ohne Schreibpause können ihre Zeitpunkte auseinanderliegen.                                                                                                             | mittel; Prüfsummen schützen Integrität, aber nicht einen gemeinsamen Snapshot. Die Dokumentation verlangt deshalb weiterhin eine Schreibpause. | Koordinierten anwendungsweiten Backupmodus mit gemeinsamem Snapshot-/Journalvertrag entwerfen, bevor Online-Schreiben während des Backups erlaubt wird. |
| Metadaten-Löschung und Entfernen einer Dokumentdatei sind nicht dieselbe Transaktion. Ein Prozessabbruch dazwischen kann eine nicht mehr sichtbare Orphan-Datei hinterlassen, löscht aber keinen noch sichtbaren Datensatz stillschweigend. | mittel; Vertraulichkeit bleibt durch private Rechte erhalten, Speicherbereinigung kann ausbleiben.                                             | Start-/Wartungsreconciliation mit sicherem Quarantäne- und Wiederholungsprotokoll entwerfen.                                                            |
| Die erste Einrichtung ist bis zum atomaren Abschluss nur über Loopback, aber ohne vorheriges Nutzergeheimnis erreichbar.                                                                                                                    | mittel im Modell eines bereits kompromittierten lokalen Benutzerkontos; Netzwerkzugriff ist ausgeschlossen.                                    | Einen nativen, kurzlebigen Setup-Nachweis zwischen Tauri-Fenster und API einführen, sobald dafür ein kompatibler Browser-/App-Vertrag festgelegt ist.   |
| Die Login-Drosselung ist lokal und speicherbasiert; ein Prozessneustart leert sie.                                                                                                                                                          | mittel für eine später öffentlich erreichbare API, im freigegebenen lokalen Einzelprozess geringer.                                            | Vor einer externen Veröffentlichung persistentes oder betriebssystemgestütztes Rate-Limiting ergänzen.                                                  |
| Der MIME-Typ eines Dokuments wird syntaktisch geprüft, nicht per Dateisignatur erkannt.                                                                                                                                                     | mittel bei späterer Inline-Vorschau, derzeit geringer: nur Download als Attachment, `nosniff`, CSP, keine Ausführung.                          | Vor einer Inline-Vorschau eine gepflegte Magic-Byte-Erkennung plus aktive Typ-Positivliste ergänzen.                                                    |
| Fünf unmaintained Rust-Transitiven bleiben über Tauri aktiv; der aktuelle RustSec-Lauf meldet dafür keine bekannte Lücke.                                                                                                                   | mittel als Wartungsrisiko, nicht als gelöste Schwachstelle.                                                                                    | Tauri-/urlpattern-Updates beobachten und nach Upstream-Ablösung mit vollständigem DMG-Test aktualisieren.                                               |
| Ein vorhandener `scrypt-v1`-Hash wird erst nach der nächsten erfolgreichen Anmeldung hochgestuft.                                                                                                                                           | mittel bis zu diesem Zeitpunkt; Klartext wird dafür weder benötigt noch gespeichert.                                                           | Nach erfolgreicher Anmeldung automatisch abgeschlossen; alternativ bewussten Passwort-Bootstrap ausführen.                                              |
| Externe CalDAV-/GitHub-Dienste wurden nicht mit produktiven Konten geprüft.                                                                                                                                                                 | bewusst offen; echte Zugänge und Daten gehören nicht in diesen Review.                                                                         | Separater freigegebener Integrationstest mit Testkonten und weiterhin read-only.                                                                        |

## Nicht geprüfte Release-Gates

Ausdrücklich nicht geprüft und daher nicht freigegeben sind Developer-ID-
Signatur, Apple-Notarisierung, Gatekeeper nach echtem Download, ein zweiter
sauberer unterstützter Mac, Intel-/Universal-DMG, physischer Apple-Kalender
über abgesichertes LAN, produktive Drittanbieterzugänge und ein öffentliches
GitHub-Release. Das lokal ad-hoc signierte ARM64-DMG ist nur ein lokaler
Build-, Installations- und Datenintegritätsnachweis.
