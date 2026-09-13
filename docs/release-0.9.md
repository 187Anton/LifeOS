# Release-Nachweis Roadmap 0.9

Stand: 13. September 2026

## Ergebnis

LifeOS ist als lokale Releasekandidatin `0.9.0` für Apple Silicon vorbereitet.
Die öffentliche Freigabe ist gesperrt: Auf dem Entwicklungs-Mac fehlen eine
gültige Developer-ID-Application-Identität und ein konfiguriertes
Notarisierungsprofil. Außerdem sind der Test auf einem zweiten sauberen Mac,
der physische Apple-Kalender-LAN-Test, der Gatekeeper-Test eines tatsächlich
heruntergeladenen Artefakts sowie Intel- oder Universal-Nachweise offen.

Ein lokal oder in CI erfolgreich gebautes, ad-hoc signiertes DMG ist weiterhin
kein öffentliches Release. Deshalb wird weder ein Release-Tag erstellt noch ein
GitHub-Release veröffentlicht oder in der README verlinkt, solange ein Gate
offen ist.

## Gate-Matrix

| Gate                                                   | Ergebnis                                           | Datum      | Version | Nachweis                                                          | Offene Einschränkung                                                     |
| ------------------------------------------------------ | -------------------------------------------------- | ---------- | ------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Zentrale Version in npm, Tauri und Cargo               | bestanden                                          | 13.09.2026 | 0.9.0   | `npm run release:verify`                                          | kein öffentliches Gate                                                   |
| Lokaler ARM64-App- und DMG-Build                       | bestanden                                          | 13.09.2026 | 0.9.0   | `npm run release:build:local`                                     | ad-hoc signiert, daher nur lokaler Nachweis                              |
| Portable SHA-256-Prüfsumme und lokale DMG-Verifikation | bestanden                                          | 13.09.2026 | 0.9.0   | `npm run release:verify:local`                                    | keine Download- oder Notarisierungsaussage                               |
| Backup, Restore, Update und Rollback                   | bestanden                                          | 13.09.2026 | 0.9.0   | PostgreSQL-, SQLite- und Zwei-Versionen-Prüfung                   | Baseline frisch aus `origin/main` gebaut                                 |
| npm-Advisory-Datenbank, online                         | bestanden: 0 bekannte Vulnerabilities              | 13.09.2026 | 0.9.0   | `npm audit --audit-level=low`                                     | muss unmittelbar vor Freigabe erneut laufen                              |
| Tauri- und Cargo-Abhängigkeiten, online                | bestanden: 0 Vulnerabilities; 7 erlaubte Warnungen | 13.09.2026 | 0.9.0   | `cargo audit --file apps/desktop/src-tauri/Cargo.lock`            | sechs unmaintained-, eine unsound-Warnung bleiben zu beobachten          |
| Developer-ID-Application-Signatur                      | offen                                              | 13.09.2026 | 0.9.0   | `security find-identity -v -p codesigning`: 0 gültige Identitäten | Apple-Zertifikat fehlt                                                   |
| Apple-Notarisierung und Stapling                       | offen                                              | 13.09.2026 | 0.9.0   | `APPLE_NOTARY_KEYCHAIN_PROFILE` nicht gesetzt                     | ohne Developer-ID nicht ausführbar                                       |
| Gatekeeper nach echtem Download                        | offen                                              | 13.09.2026 | 0.9.0   | `npm run release:verify:downloaded -- <DMG>`                      | benötigt notarisiertes DMG mit Quarantäneattribut                        |
| Zweiter sauberer unterstützter Mac                     | offen                                              | 13.09.2026 | 0.9.0   | Checkliste in diesem Dokument                                     | kein zweiter Mac in diesem Arbeitslauf verfügbar                         |
| Apple Silicon/ARM64                                    | lokal bestanden                                    | 13.09.2026 | 0.9.0   | lokaler Build und nativer Start aus dem DMG                       | nur Entwicklungs-Mac                                                     |
| Intel/x86_64                                           | offen                                              | 13.09.2026 | 0.9.0   | kein gebautes oder gestartetes x64-DMG                            | nicht als unterstützt ausweisen                                          |
| Universal                                              | offen und derzeit nicht vorgesehen                 | 13.09.2026 | 0.9.0   | kein Universal-Buildpfad                                          | native Rust-, Node- und SQLite-Binärteile erfordern gemeinsamen Nachweis |
| CalDAV über private LAN-Adresse, synthetisch           | bestanden                                          | 13.09.2026 | 0.9.0   | `npm run caldav:verify:lan`                                       | ersetzt kein Apple-Gerät                                                 |
| Physischer Apple-Kalender-LAN-Test                     | offen                                              | 13.09.2026 | 0.9.0   | Gerätecheckliste in diesem Dokument                               | kein physisches Gerät im Arbeitslauf bedient                             |
| CI der lokalen Releasekandidatin                       | bestanden                                          | 13.09.2026 | 0.9.0   | PR #88: Repository und lokaler macOS-Release grün                 | vor einer öffentlichen Freigabe mit finalem Artefakt erneut ausführen    |
| Öffentliches GitHub-Release                            | gesperrt                                           | 13.09.2026 | 0.9.0   | erst nach allen vorstehenden Gates                                | kein Tag, kein Upload, kein README-Downloadlink                          |

## Unterstützte Systeme

Als lokal unterstützt darf derzeit ausschließlich der tatsächlich gebaute und
gestartete Apple-Silicon-Pfad bezeichnet werden. Die Mindestversion in der
Tauri-Konfiguration ist macOS 12.0. Das 0.9.0-Artefakt ist auf diesem
Entwicklungs-Mac lokal nachgewiesen; das belegt noch keine öffentliche
Verteilung oder Unterstützung auf einem zweiten Mac.

## Lokales Artefakt und Abschlusslauf

Der lokale ARM64-Kandidat wurde am 13. September 2026 aus dem zweckbezogenen
Branch gebaut und anschließend aus dem schreibgeschützten DMG gestartet:

- Datei: `Anton Life OS_0.9.0_aarch64.dmg`
- Größe: `52.709.497` Byte
- SHA-256:
  `e0d180e2a49072e9627aa5db012f6891c731c4bff5acbe5f761491d228041125`
- Signatur: ad hoc, ohne Team-ID; damit ausdrücklich nicht öffentlich
  verteilbar
- Tests: 213 Root-/API-/Web-/Browser-/Datenbanktests bestanden
- Recovery: PostgreSQL-Backup/Restore sowie PostgreSQL-zu-SQLite-Import,
  Dokumentenbackup und Restore in neue Ziele bestanden
- Update/Rollback: frische `0.6.0`-Baseline aus `origin/main` auf `0.9.0` und
  zurück; Benutzer-, Kalender-, Ereignis-, Aufgaben- und Dokumentidentitäten
  blieben erhalten

Ein älteres lokal vorhandenes 0.6.0-DMG vom 4. September wurde nicht als
Baseline akzeptiert: Es stammte vor der späteren 0.6-Sicherheitsstabilisierung
und konnte den beim Update aktualisierten `scrypt-v2`-Hash beim Rückweg nicht
lesen. Es wurde nicht verändert. Erst der frisch aus dem aktuellen
`origin/main` gebaute 0.6.0-Stand lieferte den gültigen grünen Nachweis.

Der Online-Sicherheitsabgleich meldete für npm keine bekannte Vulnerability.
RustSec meldete ebenfalls keine Vulnerability, jedoch sieben erlaubte
Abhängigkeitswarnungen: sechs als `unmaintained` und
`RUSTSEC-2024-0429` für `glib` als `unsound`. Diese Warnungen sind kein
bestandenes öffentliches Apple-Gate und werden vor einer späteren Freigabe
erneut bewertet.

Der öffentliche Artefaktprüfer wurde bewusst auch gegen den lokalen Kandidaten
ausgeführt und brach korrekt ab, weil kein Apple-Notarisierungsticket gestapelt
ist. Damit ist technisch belegt, dass der lokale Erfolg nicht versehentlich
als öffentlicher Release durchgeht.

Der Branch wurde mit Commit `e3983b4` gepusht. Pull Request #88 bestand die
GitHub-CI mit den Jobs „Repository checks“ und „Local macOS release“ und wurde
anschließend nach `develop` integriert. Der davon getrennte Pull Request #89
von `develop` nach `main` bestand dieselben beiden Jobs und bleibt als
vorbereiteter Stabilitäts-PR offen. Diese CI-Ergebnisse prüfen den aktuellen
Quellstand, ersetzen aber weder die Apple- noch die physischen Geräte-Gates;
mit dem final notarisierten Artefakt müssen die Releaseprüfungen erneut laufen.

Der Vorbereitungsweg kennt zwar die offizielle x86_64-Node-Laufzeit samt fester
Prüfsumme. Das beweist weder das native SQLite-Modul noch den Rust-Build, das
DMG oder den Start auf Intel. Intel-Macs und ein Universal-Artefakt bleiben
daher ausdrücklich nicht unterstützt. Windows, Linux, iOS und Android sind
keine Ziele dieses Mac-DMGs; der getrennte Browserbetrieb bleibt davon
unberührt.

## Sicherer öffentlicher Mac-Release-Pfad

Zertifikate und Notarisierungsdaten werden nicht im Repository gespeichert.
Vor dem ersten Lauf wird außerhalb des Repositorys ein Schlüsselbundprofil
angelegt:

```bash
xcrun notarytool store-credentials "lifeos-notary"
```

Danach werden nur die Identitätsbezeichnung und der Profilname an den Build
übergeben. Das Skript bricht ab, wenn Identität oder Profil fehlen:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Name (TEAMID)"
export APPLE_NOTARY_KEYCHAIN_PROFILE="lifeos-notary"
npm run release:build:public
unset APPLE_SIGNING_IDENTITY APPLE_NOTARY_KEYCHAIN_PROFILE
```

Der Ablauf prüft die Release-Metadaten, signiert App, Node-Sidecar und natives
SQLite-Modul mit Hardened Runtime und Zeitstempel, baut das DMG, übermittelt es
mit `notarytool`, wartet auf Apples Ergebnis und stapelt den Nachweis. Weil das
Stapling die DMG-Datei verändert, wird die portable SHA-256-Datei erst danach
neu erzeugt. Anschließend müssen Signatur, Stapling, Gatekeeper,
Architekturkennzeichnung und Prüfsumme gemeinsam bestehen.

Ein lokaler, notarisierter Build belegt noch nicht den Downloadpfad. Nach einem
tatsächlichen Browser-Download des final veröffentlichten DMGs und seiner
gleichnamigen `.sha256`-Datei wird auf einem Release-Prüf-Mac mit Checkout und
festgelegter Node-22-Buildumgebung ausgeführt:

```bash
npm run release:verify:downloaded -- \
  "/absoluter/Downloadpfad/Anton Life OS_0.9.0_aarch64.dmg"
```

Diese Prüfung verlangt zusätzlich das von macOS gesetzte Quarantäneattribut.
Eine lokale Kopie ohne dieses Attribut darf nicht als Download-Gatekeeper-Test
dokumentiert werden. Der davon getrennte saubere Mac benötigt zum Starten und
Nutzen der App weder diesen Checkout noch Docker oder ein globales Node.js.

## Checkliste für einen zweiten sauberen Mac

Voraussetzungen: unterstützter Apple-Silicon-Mac mit mindestens macOS 12,
keine vorhandene LifeOS-Installation, kein Docker und kein global installiertes
Node.js. Verwendet wird exakt das endgültige, heruntergeladene und über seine
SHA-256-Datei geprüfte DMG.

- [ ] DMG besitzt ein Quarantäneattribut und besteht
      `release:verify:downloaded` oder die gleichwertigen Signatur-, Stapling-
      und Gatekeeper-Prüfungen.
- [ ] App wird aus dem DMG nach `Programme` kopiert und ohne Umgehung von
      Gatekeeper gestartet.
- [ ] Start funktioniert ohne Docker und ohne globales Node.js.
- [ ] Ersteinrichtung legt ausschließlich ein synthetisches Profil sowie
      getrennte App- und CalDAV-Passwörter an.
- [ ] Anmeldung funktioniert; ein synthetischer Termin wird erstellt und
      wieder gelesen.
- [ ] Nach App-Neustart bleiben Benutzer-ID, Kalender-ID, UID, ETag,
      Sync-Version und Sync-Token erhalten.
- [ ] SQLite und Dokumente werden gemeinsam gesichert; Restore erfolgt nur in
      neue Ziele und erhält die geprüften Identitäten.
- [ ] Ein Update von der freigegebenen Baseline auf 0.9.0 und der dokumentierte
      Rollbackpfad erhalten Daten und Dokumenthashes.
- [ ] Reguläres Beenden beendet den Sidecar; danach bleibt kein
      `lifeos-node`-Kindprozess zurück.
- [ ] Entfernen der App löscht keine Daten unter
      `~/Library/Application Support/de.anton.lifeos/` und keine Backups.
- [ ] Eine bewusste vollständige Datenentfernung wird getrennt von der
      App-Deinstallation erklärt und nur nach geprüftem Backup ausgeführt.

Der Nachweis protokolliert Mac-Modell, Architektur, macOS-Version,
Artefaktname, SHA-256, Testdatum und das Ergebnis jedes Punkts. Er enthält
keine Passwörter, privaten Kalenderinhalte oder personenbezogenen Daten.

## Apple-Kalender-Test im abgesicherten LAN

Der physische Test verwendet den eigenen LifeOS-CalDAV-Server. Die installierte
Mac-App bleibt aus Sicherheitsgründen auf Loopback beschränkt; für den
Gerätetest wird der Entwicklungsserver bewusst und nur vorübergehend an das
private LAN gebunden.

Voraussetzungen:

- Mac und Apple-Gerät befinden sich im selben vertrauenswürdigen privaten Netz;
- Gastnetz-, Client-Isolation, VPN-Umleitung und öffentliche Portweiterleitung
  sind ausgeschaltet;
- die lokale Firewall erlaubt den gewählten API-Port nur im privaten Netz;
- `localhost` wird nicht verwendet, weil es auf dem iPhone das iPhone selbst
  bezeichnet;
- HTTP Basic Auth ist nur für diesen vertrauenswürdigen LAN-Test zulässig;
  außerhalb davon ist TLS verpflichtend.

Die automatisierte Vorprüfung verwendet eine temporäre SQLite-Datei,
synthetische Zugangsdaten, einen zufälligen Port und die private IPv4-Adresse
des Macs. Sie beendet den Server anschließend wieder:

```bash
npm run caldav:verify:lan
```

Für Apple Kalender wird LifeOS mit einer absichtlich gesetzten privaten
LAN-Bindung gestartet. Benutzername und das getrennte CalDAV-Passwort werden
nur lokal eingegeben; die Serveradresse lautet
`http://<private-LAN-IP>:<Port>/caldav/`, niemals `localhost`.

Auf dem physischen Apple-Gerät sind einzeln zu prüfen und zu protokollieren:

- [ ] Account- und Kalender-Discovery;
- [ ] vorhandenen synthetischen Termin lesen;
- [ ] neuen Termin auf dem Apple-Gerät erstellen und in LifeOS lesen;
- [ ] denselben Termin ändern und die neue ETag-/Sync-Version in LifeOS prüfen;
- [ ] einen absichtlich veralteten ETag als Konflikt abweisen;
- [ ] Termin löschen und den Tombstone ohne Duplikat synchronisieren;
- [ ] ganztägigen Termin mit korrekter exklusiver Endgrenze anzeigen;
- [ ] Termin in `Europe/Berlin` ohne Zeitverschiebung anzeigen;
- [ ] begrenzte Wiederholung und Erinnerung anzeigen;
- [ ] nach erneutem Sync und App-Neustart keine doppelte UID anzeigen.

Der Test gilt nur dann als bestanden, wenn diese Punkte auf einem echten
Apple-Kalender-Gerät durchgeführt wurden. Die automatisierte LAN-Vorprüfung
belegt nur Erreichbarkeit und Serversemantik.

## GitHub-Release erst nach vollständiger Freigabe

Erst wenn jede Zeile der Gate-Matrix bestanden ist, darf ein Tag `v0.9.0`
erstellt und das exakt geprüfte DMG zusammen mit seiner `.sha256`-Datei
veröffentlicht werden. Die Release-Beschreibung nennt macOS-Mindestversion,
Apple-Silicon-Architektur, Installationsweg, lokale Datenpfade, Backup- und
Deinstallationsgrenzen. Danach wird das veröffentlichte Artefakt erneut
heruntergeladen und geprüft; erst anschließend darf die README genau dieses
Release verlinken.

Bis dahin existiert nur eine lokale Releasekandidatin. Es gibt keinen
öffentlichen Downloadlink und keine öffentliche Freigabeaussage.

## PWA

Die PWA bleibt dieselbe React-Weboberfläche. Nach lokalem Start zeigt sie die
Aktion „App installieren“ nur, wenn ein unterstützter Browser die Installation
freigibt. Manifest und statische App-Shell können lokal gespeichert werden;
persönliche API-Antworten, Kalenderdaten und Zugangsdaten werden weder im
Service Worker noch in `localStorage` oder `sessionStorage` persistiert.
