# Anton Life OS

Persönliche, lokal startbare Plattform für Studium, Arbeit, Projekte, Aufgaben,
Kalender, Fitness und Wissen.

## Geplanter Kohärenzumbau

Die Nutzerentscheidung vom 23.09.2026 sieht die vollständige Entfernung von
Finanzen, Integrationen unter Einstellungen und eng verbundene Aufgaben-,
Kalender- und Studienansichten vor. Paket 0 mit dem verbindlichen Plan und Paket
1 mit der Einordnung der vorhandenen Integrationen unter Einstellungen sind
umgesetzt. Paket 2 hat die aktive Finanzoberfläche, Finanz-API und deren aktive
Verträge entfernt (PR #122). Paket 3 hat die verbliebenen Finanzmodelle, das
gespeicherte Währungsfeld und den Aufgabenbereich `finance` über neue
versionierte Migrationen entfernt und diesen Schritt über einen verpflichtenden
Backup-Nachweis abgesichert (PR #123). Paket 4 hat den optionalen
Studienmodulbezug der Aufgabe ergänzt (PR #124), Paket 5 die gemeinsamen
Kalender- und Planungsansichten (PR #125). Die Pakete 0 bis 5 sind damit in
`develop` integriert. Paket 6 mit der Moduldetailansicht und der gemeinsamen
Dokument-/Notizbedienung ist lokal umgesetzt und geprüft, aber noch nicht in
`develop` integriert. Die Pakete 7 bis 11 bleiben geplant und sind kein
aktueller Funktionsnachweis.
Studienmaterialien sollen lokal durchsuchbar werden; Apple
Kalender auf Mac und iPhone soll Aufgabenplanung einschließlich Verschieben
unterstützen. Umfang, Abnahme und Startauftrag stehen im
[Umsetzungsplan](docs/coherence-implementation-plan.md), der nächste Schritt in
der [Fortschrittsdatei](docs/coherence-progress.md). Die folgenden Angaben
beschreiben weiterhin den bereits vorhandenen Produktstand.

Der operative Stand 0.1 bis 0.5 ist fachlich umgesetzt; 0.6 ist für den lokalen
ARM64-Betrieb umgesetzt und nachgewiesen. Der begrenzte read-only-Ausbau der
optionalen Integrationen aus 0.8 ist ebenfalls umgesetzt. Roadmap 0.9 ist als
lokale ARM64-Releasekandidatin `0.9.0` mit einem gesicherten Signatur-,
Notarisierungs-, Download- und LAN-Prüfpfad vorbereitet. Das umfasst
Fundament, Organisation, Studium und Arbeit, Projekte und Wissen sowie
Fitness und bewusst begrenzte Integrationen. Historische Release-Nachweise
enthalten noch die frühere Finanzfunktion. Das lokale Artefakt ist
noch kein öffentlich freigegebenes Release.

Die operative Roadmap fasst mehrere ursprünglich getrennte Punkte aus dem
Leitfaden zusammen. Die Zuordnung, der genaue Umsetzungsumfang sowie die noch
offenen fachlichen und externen Gates stehen in der [Roadmap](docs/roadmap.md).

Die ersten beiden Lieferstufen der lokalen Einkaufsliste sind implementiert:
Auf Datenmodell, Parser und API folgt eine responsive Oberfläche mit
bearbeitbarer Vorschau, Systemdiktat-Kennzeichnung, Kategorien, Statuswechsel
und Archiv. Der Ablauf ist lokal in echten Desktop- und Smartphone-Browsern
nachgewiesen. Der technische ARM64-Mac-Test hat anschließend bestätigt, dass
die neue lokale Apple-Transkription Deutsch unterstützt, das deutsche Modell
aber nicht installiert und die Speech-Berechtigung noch nicht erteilt ist.
Deshalb bleibt der eigene Mikrofonmodus gesperrt. Der
[`Umsetzungsplan`](docs/grocery-list-voice-plan.md) trennt diesen vollständigen
Text-/Systemdiktat-Pfad von einem eigenen Mikrofonmodus, der nur nach einem
End-to-End-Nachweis lokaler Verarbeitung ohne stillen Cloud-Rückfall
freigegeben wird. Der aktuelle, reproduzierbare Befund steht im
[`lokalen Sprach-Gate`](docs/grocery-local-speech-gate.md).

## Leitentscheidungen

- modularer Monolith statt Microservices
- React und TypeScript für die Weboberfläche
- Node.js und TypeScript für die API
- PostgreSQL als bisherige Entwicklungsdatenbank; SQLite als nachgewiesener
  lokaler Zielpfad der Mac-App-Migration
- Docker Compose für den bisherigen PostgreSQL-Entwicklungsbetrieb
- eine responsive Weboberfläche mit installierbarer PWA-App-Shell
- ein einfach installierbares lokales Release als Veröffentlichungsziel
- CalDAV-Server ab dem Fundament, damit Termine ohne installierte LifeOS-App
  in Apple Kalender sichtbar werden können
- lokaler ICS-Import mit Vorschau und konfliktgeschützter Kalenderexport
- lokale Speicherung und synthetische Beispieldaten
- externe Integrationen und KI standardmäßig deaktiviert
- schreibende Automationen und KI-Vorschläge nur nach ausdrücklicher
  Bestätigung als getrennte Fachaktion

Weitere Regeln stehen in [AGENTS.md](AGENTS.md) und im
[Produkt- und Entwicklungsleitfaden](LifeOS%20Leitfaden.docx).

## GitHub-Workflow

Das Projekt verwendet Conventional Commits und zwei zentrale Branches:

- `main` enthält den stabilen Stand.
- `develop` ist der Integrationsbranch.

Neue Änderungen beginnen auf einem zweckbezogenen Branch aus `develop`, zum
Beispiel `feat/calendar`, `fix/caldav-sync` oder `chore/repository`. Sie werden
zuerst per Pull Request nach `develop` gebracht. Erst nach erfolgreicher
Prüfung und Integration wird `develop` per Pull Request nach `main` überführt.
Ein GitHub-Issue ist dafür optional und nicht für jede Unteraufgabe
verpflichtend.

Commits verwenden dieses Format:

```text
<type>(<scope>): <description>
```

Beispiele sind `feat(calendar): add event model` oder
`chore(repo): update CI workflow`.

Pull Requests gegen `develop` und `main` starten automatisch die GitHub-
Actions-CI. Sie prüft Formatierung, Compose-Konfiguration und alle vorhandenen
automatisierten Tests. Die aktiven Rulesets beider Branches verlangen exakt
`Repository checks` und `Local macOS release` für den aktuellen PR-Stand; ein
fehlender oder fehlgeschlagener Job blockiert den Squash-Merge. Details und der
kontrollierte Negativnachweis stehen unter
[Verbindliche Branch-Prüfungen](docs/branch-rulesets.md).
Externe Actions sind auf vollständige Commit-SHAs festgelegt; der zugehörige
Release bleibt als Kommentar lesbar. Die Repositorytests verhindern neue
veränderliche Action-Referenzen. Details und der kontrollierte Updateablauf
stehen unter [Abgesicherte GitHub Actions](docs/ci-actions.md).

Codex darf und soll Pull Requests selbstständig erstellen, wenn das Repository
mit einem GitHub-Remote verbunden ist und die nötigen Berechtigungen vorhanden
sind. Ohne Remote wird nur der lokale Branch vorbereitet; ein Push oder PR wird
nicht vorgetäuscht.

## Veröffentlichung und Lizenz

Dieses Repository ist öffentlich, damit der Entwicklungsprozess und der
Quellcode als Programmierportfolio eingesehen werden können. LifeOS wird unter
der [MIT-Lizenz](LICENSE) veröffentlicht. Persönliche Daten, lokale Dateien,
Secrets und Backups gehören nicht in dieses Repository. Abhängigkeiten und
externe Assets bleiben unter ihren jeweiligen Lizenzen.

## Projektziel: installierbares lokales Release

LifeOS lässt sich in Version `0.9.0` ohne manuelles Zusammensuchen einzelner
Komponenten als lokale ARM64-Releasekandidatin bauen und prüfen. Der aktuelle
Stand:

- Die Tauri-App bündelt Weboberfläche, Express-/CalDAV-Sidecar, SQLite und eine
  offizielle Node.js-22-Laufzeit. Zur Nutzung sind weder Docker noch ein
  separat installiertes Node.js erforderlich.
- Der Browserbetrieb mit PostgreSQL und Docker Compose bleibt für Entwicklung,
  Tests und Wartung verfügbar.
- Ein Installationsbutton für die vorhandene PWA erscheint, sobald ein
  unterstützter Browser die Installation freigibt.
- Das lokale DMG erhält eine portable SHA-256-Prüfsumme und wird nach dem Bau
  aus einem schreibgeschützten Abbild geprüft.

Das lokale Artefakt ist noch kein öffentlich freigegebenes GitHub-Release.
Developer-ID-Signatur, Apple-Notarisierung, Gatekeeper-Prüfung nach einem
tatsächlichen Download, ein zweiter sauberer unterstützter Mac, weitere
Architekturen und ein physischer Apple-Kalender-Test über abgesichertes LAN
bleiben offene Release-Gates. Vor einer Veröffentlichung ist außerdem ein dann
aktueller Online-Abgleich der npm-Advisory-Datenbank erforderlich. Die aktuelle
Gate-Matrix und die reproduzierbaren Zweit-Mac- und Apple-Kalender-Checklisten
stehen im [Release-Nachweis 0.9](docs/release-0.9.md).

## Repository-Struktur

```text
apps/
api/ Backend, CalDAV- sowie lokale ICS-Schnittstelle
web/ responsive React-Weboberfläche und PWA-App-Shell

packages/
contracts/ Gemeinsame API- und Datenverträge
database/ PostgreSQL-/SQLite-Schemata und zentrale Prisma-Schnittstelle

docs/
architecture.md Architekturentscheidungen
roadmap.md inkrementeller Umsetzungsplan

compose.yaml lokale PostgreSQL-Infrastruktur
.env.example Beispielkonfiguration ohne echte Secrets
.github/ CI, Issue-Vorlagen und Pull-Request-Vorlage
scripts/ Wiederholbare Repository- und GitHub-Einrichtung
```

## Installierte Mac-App auf Apple Silicon

Der lokale M6-Nachweis erzeugt ein komprimiertes ARM64-DMG. Die daraus
kopierte App startet ohne Docker, Homebrew oder separat installiertes Node.js.
Beim ersten Start führt eine lokale Oberfläche durch Anzeigename, App-Passwort
und getrenntes CalDAV-Passwort; eine Terminal-Einrichtung ist für die App nicht
erforderlich.

Für einen lokalen Entwickler-Build werden einmalig Node.js 22, Rust Stable und
die Xcode Command Line Tools benötigt:

```bash
npm ci
npm run release:build:local
npm run release:verify:local
```

Das geprüfte ARM64-Ergebnis liegt als
`apps/desktop/src-tauri/target/release/bundle/dmg/Anton Life OS_0.9.0_aarch64.dmg`
mit gleichnamiger `.sha256`-Datei vor. Im DMG wird die App in den Programme-
Ordner gezogen und anschließend von dort gestartet. Persönliche Daten liegen
außerhalb des App-Bundles im anwendungsspezifischen macOS-Datenverzeichnis und
bleiben bei App-Austausch oder Deinstallation erhalten.

Das aktuelle Artefakt ist noch kein öffentlich freigegebenes Download-Release:
Es ist lokal ad-hoc signiert, aber mangels verfügbarer Developer-ID nicht von
Apple notarisiert. Auch der verpflichtende Gegencheck auf einem zweiten
sauberen Mac und ein Intel-/Universal-Build sind noch offene Release-Gates.
Die Details und der lokale Update-/Rollback-Nachweis stehen im
[Migrationsprotokoll](docs/mac-desktop-migration-log.md). M6 ist damit lokal
erfolgreich; die öffentliche Produktfreigabe ist ausdrücklich aufgeschoben.
Der tatsächliche Abschlusslauf mit Produktdemo, nativem App-Start, Update
0.1.0 → 0.6.0, Rollback und Restore in neue Ziele steht im
[`lokalen Roadmap-0.6-Nachweis`](docs/roadmap-06-local-demo.md).
Der aktuelle providerübergreifende Stabilitäts- und Backup-Nachweis steht in
[`docs/reliability-recovery-0.6.md`](docs/reliability-recovery-0.6.md).
Versionsquelle, Buildablauf, Prüfsumme und öffentliche Gates beschreibt die
historische [`Release-Dokumentation 0.6`](docs/release-0.6.md). Der aktuelle
Signatur-, Notarisierungs-, Architektur-, Zweit-Mac- und LAN-Prüfpfad steht im
[`Release-Nachweis 0.9`](docs/release-0.9.md).

## Browser- und Entwicklungsbetrieb

Voraussetzungen:

- Node.js 22
- npm 10 oder neuer
- Docker Desktop oder Docker Engine mit Compose

Konfiguration anlegen:

```bash
cp .env.example .env
```

Die Werte sind ausschließlich synthetische Entwicklungswerte. Die Datei `.env`
bleibt lokal und darf keine echten Passwörter oder personenbezogenen Daten
enthalten.

Docker und die Compose-Konfiguration vorab prüfen:

```bash
npm run env:check
```

Lokale Datenbank starten und auf einen grünen Healthcheck warten:

```bash
npm run db:start
```

Der Startbefehl prüft anschließend mit `pg_isready` und `SELECT 1`, ob
PostgreSQL nicht nur läuft, sondern auch SQL-Verbindungen annimmt. Der Port ist
nur an `127.0.0.1` gebunden und daher nicht aus dem lokalen Netzwerk erreichbar.

Status und SQL-Verbindung erneut prüfen oder die Dienste stoppen:

```bash
npm run db:check
npm run db:stop
```

`db:stop` entfernt keine Daten. Das benannte Docker-Volume `lifeos-postgres`
bleibt erhalten und wird beim nächsten Start wieder verwendet.

Nach dem Datenbankstart kann die API lokal gestartet werden:

```bash
npm run api:start
```

Sie bindet standardmäßig nur an `127.0.0.1:3000`. Der Health-Endpunkt unter
`/api/v1/health` prüft den HTTP-Prozess, während `/api/v1/readiness` zusätzlich
die konfigurierte PostgreSQL- oder SQLite-Verbindung prüft. Details und
Fehlervertrag stehen in
[apps/api/README.md](apps/api/README.md).

Nach lokaler Anmeldung stehen außerdem Kalender- und Ereignis-CRUD unter
`/api/v1/calendars` bereit. Ereignisänderungen verwenden ETags und `If-Match`,
damit ein veralteter Client keinen neueren Stand überschreibt.

Aufgaben werden nach lokaler Anmeldung unter `/api/v1/tasks` verwaltet. Das
Aufgabenmodell unterstützt Status, Priorität, Fälligkeit als reines Datum,
optionale geplante Startzeit mit IANA-Zeitzone, ganzzahlige Dauerminuten, Tags,
Bereich, Projekt-, Studienmodul- und Elternbezug sowie Archivierung und
Soft-Delete. Die responsive Aufgabenoberfläche unterstützt Erstellen,
Bearbeiten, Statuswechsel, Archivierung, bestätigtes Löschen sowie kombinierbare
Suche und Filter einschließlich „Ohne Modul“.

Eine Aufgabe kann optional auf höchstens ein eigenes Studienmodul verweisen;
Projekt- und Studienmodulbezug dürfen gleichzeitig bestehen. Die Zuordnung wird
über `studyModuleId` in `POST /api/v1/tasks` und `PATCH /api/v1/tasks/:id`
gesetzt und mit `null` ausdrücklich entfernt. Für neue Zuordnungen akzeptiert
die API ausschließlich vorhandene, nicht archivierte Module desselben Besitzers;
fremde, archivierte oder unbekannte Module werden mit `400 VALIDATION_ERROR`
abgelehnt. Ein bereits archivierter Bezug bleibt bei fachfremden Änderungen
erhalten, bleibt sichtbar gekennzeichnet und darf entfernt werden. Der
Aufgabenfilter `GET /api/v1/tasks?studyModuleId=<uuid|none>` filtert
serverseitig und besitzgebunden auf ein Modul beziehungsweise auf Aufgaben ohne
Modulbezug. Der gemeinsame Aufgabeneditor bietet die aktive Modul- und
Projektauswahl; aus einem aktiven Modul der Studienansicht öffnet „Aufgabe
anlegen“ denselben Editor mit vorausgewähltem Modul und sichtbar vorausgewähltem
Bereich „Studium“. Bestehende `StudyEntry.taskId`-Verknüpfungen werden dabei
weder umgeschrieben noch als Modulzuordnung interpretiert; Termine, Fristen und
Status ändern sich nicht automatisch.

Studienabschnitte, Module, Prüfungen, Abgaben, Lehrveranstaltungen und
Lernzeiten werden nach lokaler Anmeldung unter `/api/v1/study` verwaltet. Die
responsive Studienansicht erlaubt das Anlegen, Statuswechseln und Archivieren.
Prüfungstage und Abgabefristen bleiben ohne bekannte Uhrzeit reine
Kalendertage; zeitgebundene Lehr- und Lernblöcke besitzen eine IANA-Zeitzone.
Optionale Aufgaben- und Kalenderbezüge werden besitzgeprüft und lösen keine
automatische Änderung des referenzierten Objekts aus.
Offene Prüfungen, Abgaben und Lernzeiten erscheinen zusätzlich rein lesend im
Organisations-Dashboard und im sichtbaren Zeitraum der Kalenderansicht.

Die getrennte Studienübersicht bleibt unverändert bestehen; jede Modulkarte
öffnet über „Moduldetails öffnen“ eine eigene, besitzgebundene Moduldetailansicht,
und „Zur Übersicht“ führt zurück. Sie zeigt Titel, Kürzel, Studienabschnitt samt
Zeitraum, Status, Leistungspunkte, Note, Notizen, Suchfreigabe, Archivzustand und
die Dokumentverweise des Moduls. Die zugehörigen Objekte werden ausschließlich
aus vorhandenen Besitzfiltern zusammengestellt: Aufgaben über
`Task.studyModuleId` (aktive und archivierte), Studieneinträge über
`StudyEntry.moduleId`, Notizen und Dokumente über ihre echte Modulbeziehung. Die
freien Dokumentverweise eines Moduls erscheinen getrennt als unverbindliche
Angaben und werden nie als Datei-ID interpretiert. Bearbeitet wird ausschließlich
über die vorhandenen Facheditoren: Modul und Studieneintrag über die
Studienformulare, Aufgaben über den gemeinsamen Aufgabeneditor, Notizen und
Dokumentmetadaten über die Wissensansicht. Zeitgebundene Studieneinträge behalten
beim Bearbeiten ihre gespeicherte IANA-Zeitzone und ihren Zeitpunkt; nur neue
Einträge werden in der Profilzeitzone angelegt. Das ist der lokale Stand von
Paket 6 (umgesetzt und geprüft, noch nicht in `develop` integriert).

Die Einkaufsliste ist nach Anmeldung unter `/api/v1/shopping-lists` verfügbar.
Die ersten beiden Lieferstufen umfassen genau eine aktive Liste pro Besitzer,
archivierbare Listen, bestätigte atomare Mehrfacheingabe, zehn stabile
Systemkategorien, sichtbares `Sonstiges`, persönliche Kategorieregeln nur nach
ausdrücklicher Bestätigung sowie Positionen mit unterstützten Einheiten. Die
flüchtige Vorschau unter `/api/v1/shopping-lists/parse-preview` schreibt keine
Positionen. Die gemeinsame responsive Oberfläche stellt offene Positionen vor
erledigten Positionen nach Kategorien dar. Sie kann die aktive Liste in einem
atomaren Schritt archivieren und durch eine neue aktive Liste ersetzen. Text
und Betriebssystem-Diktat sind der vollständige Basispfad; ein eigener
Mikrofonmodus ist nicht freigegeben. `npm run grocery:verify:local-speech`
prüft die lokale Apple-Fähigkeit read-only im App-Bundle-Kontext; der aktuelle
ARM64-Mac-Befund und die noch fehlenden End-to-End-Gates sind
[separat dokumentiert](docs/grocery-local-speech-gate.md).

Die gemeinsame Planung unter `/api/v1/planning` führt Kalendertermine,
Aufgabenfristen, Studium, Arbeit, geplante und tatsächliche Zeit sowie die
persönliche Verfügbarkeit als rein lesende Wochen- oder Agendasicht zusammen.
Regelbasierte Hinweise erklären Überschneidungen, überfällige Fristen,
Kapazitätsüberschreitungen und Häufungen hoher Prioritäten. Filter verändern
nur die Darstellung; Termine und Quelldaten werden weder kopiert noch
automatisch verschoben.

Der Kalender bietet Tages-, Wochen-, Monats- und Agendaansicht. Termine werden
weiterhin ausschließlich über den gemeinsamen Kalenderkern gespeichert:
Ganztagswerte bleiben reine Daten, Serienvorkommen sind flüchtige Projektionen
der RRULE und Bearbeiten oder Löschen verwendet immer die stabile UID und den
aktuellen ETag des zugrunde liegenden Ereignisses.

Aufgaben und Termine können optional über `/api/v1/task-event-links`
miteinander verknüpft und in beiden Editoren wieder getrennt werden. Die
Beziehung speichert nur die besitzgeprüften Referenzen: Status und Fälligkeit
bleiben an der Aufgabe, Start und Ende am Kalenderereignis. Abschluss,
Löschung oder Änderung eines Objekts verändert das andere nicht automatisch.

Das Organisations-Dashboard lädt über den geschützten, rein lesenden Endpunkt
`/api/v1/dashboard` aktive Aufgaben, Termine aus allen eigenen Kalendern und
aktuelle Projektanker aus der konfigurierten lokalen Datenbank. Heutige und
werden anhand der Profilzeitzone bestimmt. Die responsive Übersicht zeigt
Leer- und Fehlerzustände, Überschneidungen, fehlende Fälligkeiten sowie
Schnellaktionen, die ausschließlich die bestehenden Aufgaben- und
Termin-Formulare öffnen.

Im Entwicklungsbetrieb liegt der CalDAV-Server unabhängig von der REST-API
unter `/caldav/`. Sein Zugang wird getrennt von der Browser-Anmeldung gesetzt
und widerrufen:

```bash
read -s LIFEOS_CALDAV_PASSWORD
export LIFEOS_CALDAV_PASSWORD
npm run caldav:bootstrap
unset LIFEOS_CALDAV_PASSWORD
```

Für einen Client auf demselben Rechner lautet die Account-URL
`http://127.0.0.1:3000/caldav/`, der Benutzername ist `local`. Mit
`npm run caldav:revoke` lässt sich nur dieser Zugang sperren.

Auf einem iPhone bezeichnet `localhost` das iPhone, nicht den
Entwicklungsrechner. Für Apple Kalender muss die API deshalb bewusst im
vertrauenswürdigen lokalen Netz gebunden werden, beispielsweise mit
`API_HOST=0.0.0.0 npm run api:start`. Als Server dient dann die LAN-Adresse des
Rechners mit Port `3000` und Pfad `/caldav/`. Der erste lokale Betrieb nutzt
HTTP Basic Auth und darf nicht ohne TLS oder Reverse Proxy ins öffentliche
Internet gestellt werden. Details stehen in
[apps/api/README.md](apps/api/README.md).

Im Browser- und Entwicklungsbetrieb wird vor dem ersten geschützten
Profilzugriff einmalig ein lokales Passwort gesetzt. Die installierte Mac-App
erledigt diesen Schritt stattdessen über ihre Ersteinrichtungsoberfläche. Das
Passwort wird nicht in `.env` oder im Frontend gespeichert:

```bash
read -s LIFEOS_BOOTSTRAP_PASSWORD
export LIFEOS_BOOTSTRAP_PASSWORD
npm run auth:bootstrap
unset LIFEOS_BOOTSTRAP_PASSWORD
```

Anschließend werden API und Weboberfläche in zwei Terminals gestartet:

```bash
npm run api:start
npm run web:dev
```

Die Oberfläche ist unter `http://127.0.0.1:5173` erreichbar. Sie verwendet
einen lokalen API-Proxy und zeigt Aufgaben, Kalender, Studium, Arbeit und
persönliche Projekte auf Desktop und Smartphone an. Projektziele,
Meilensteine, Risiken, berechneter Fortschritt sowie reine Verknüpfungen zu
Aufgaben und Kalenderereignissen sind lokal verfügbar. Arbeitskontexte, Projekte, Ziele,
Fristen und getrennte geplante beziehungsweise tatsächliche Zeitblöcke werden
lokal verwaltet; Arbeitsaufgaben bleiben dabei im gemeinsamen Aufgabenmodell.
Eine gemeinsame Wochen- und Agendaansicht verbindet diese Daten mit Aufgaben
und Kalender, zeigt Konflikte sowie nachvollziehbare Überlastungsursachen und
verwaltet optionale wöchentliche Verfügbarkeitsfenster.

Der Bereich **Wissen** verwaltet Markdown-Notizen und lokale Dokumente.
Notizen können kategorisiert, getaggt, versioniert und mit Projekten oder
Studienmodulen verknüpft werden. Dokumente werden bis 25 MiB im absoluten
`STORAGE_PATH` außerhalb des Repositorys gespeichert; die API verwendet nur
interne, validierte Schlüssel. Archivierung ist reversibel, Löschen entfernt
Dokumentmetadaten logisch und den lokalen Binärinhalt physisch. Die Option
„Für lokale Suche freigeben“ ist standardmäßig aus. Notizen und
Dokumentmetadaten – einschließlich Projekt- und Studienmodulbezug sowie
Suchfreigabe – lassen sich auch aus der Moduldetailansicht über dieselben
Wissenseditoren ändern; der Dateiname bleibt dabei unverändert, und die Datei
wird weder ersetzt noch neu angelegt. Die Mac-App verwendet
automatisch ihr privates Anwendungs-Dokumentverzeichnis.

Die lokale Suche im Bereich **Wissen** berücksichtigt nur eigene, aktive und
ausdrücklich freigegebene Projekte, Ziele, Meilensteine, Notizen, Dokumente,
Studienmodule, Studieneinträge und Arbeitsprojekte. Treffer zeigen Quelle,
Änderungsdatum, Ausschnitt und Treffergrund. Zulässige kleine Text-, Markdown-,
CSV- und JSON-Dokumente werden beim Upload lokal als UTF-8-Text extrahiert;
andere Formate bleiben über ihre Metadaten auffindbar. Suchanfragen,
Suchergebnisse und kombinierbare Aufgaben-, Arbeitsbereichs-, Status- und
Zeitraumfilter bleiben flüchtiger UI-Zustand. Details und Grenzen stehen im
[Suchvertrag](docs/api/search.md).

Die **quellengestützte KI-Grundlage** bereitet für eine Frage ausschließlich
eigene, aktive und für die lokale Suche freigegebene Quellen auf. Sie zeigt
Quellen, Textausschnitte, Freigabestatus und Sicherheitswarnungen sichtbar an.
Der produktive Adapter ist standardmäßig deaktiviert; es ist kein externer
Anbieter eingerichtet und es werden keine Daten nach außen übertragen.
Vorschläge benötigen eine Bestätigung, und selbst diese Bestätigung ändert
noch keine Fachdaten. Fragen, Antworten und Ausschnitte werden weder
protokolliert noch im Klartext persistiert. Details stehen im
[KI-Vertrag](docs/api/ai.md).

**Finanzen sind kein aktiver Produktbereich mehr.** Es gibt keine Navigation,
Finanzansicht oder registrierte Finanz-API-Route. Die bisherigen
`/api/v1/finance`-Pfade antworten mit `404 NOT_FOUND`; eine Finanzbuchung lässt
sich darüber nicht mehr anlegen. Paket 3 hat zusätzlich die Finanzmodelle, die
Finanztabellen, die zugehörigen Enums, das gespeicherte Währungsfeld und den
Aufgabenbereich `finance` über die versionierte Migration
`20260925120000_remove_finance_module` entfernt; bestehende Aufgaben mit
`area=finance` wurden datenerhaltend zu `personal` überführt. Vor jeder
destruktiven Migration verlangt LifeOS ein geprüftes Backup: PostgreSQL nur mit
Dump samt SHA-256, der Mac-Sidecar erzeugt selbst ein vollständiges und
geprüftes Datenbank- und Dokumentenbackup, bevor er migriert. Der
[historische Finanzvertrag](docs/api/finance.md) dokumentiert die Stilllegung
und den vorherigen Stand. Die Wiederherstellung entfernter Finanzdaten ist
danach nur aus einem vorher erstellten Backup in ein neues Ziel möglich; ein
bloßes App-Downgrade ist kein Wiederherstellungsverfahren.

Der Bereich **Fitness** verwaltet Trainingspläne, Übungen, Einheiten, Sätze und
Gewichtseinträge vollständig lokal. Gewichte, Wiederholungen, Dauer und Distanz
werden als kontrollierte ganze Basiseinheiten gespeichert. Historie,
Trainingsvolumen, Gewichtsverlauf und persönliche Bestleistungen sind einfache
rein lesende Auswertungen und ausdrücklich keine Diagnose oder medizinische
Empfehlung. Eine Einheit kann einen vorhandenen Termin über Kalender-ID und
stabile UID referenzieren; der Termin samt ETag und Sync-Token bleibt
unverändert. Es gibt keine ungefragte externe Übertragung. Details stehen im
[Fitnessvertrag](docs/api/fitness.md).

Unter **Einstellungen → Integrationen** kann ein externer CalDAV-Dienst als
standardmäßig deaktivierte read-only-Quelle anbinden. Zugangsdaten erreichen
nur die lokale API und liegen dort AES-256-GCM-verschlüsselt; ohne den
separaten lokalen `INTEGRATION_SECRET_KEY` bleibt die Funktion vollständig
aus. Nach ausdrücklicher Aktivierung lassen sich Verbindung und Kalender
kontrolliert prüfen. Ereignisse werden erst nach Importvorschau und erneuter
Bestätigung in den vorhandenen Kalenderkern übernommen. Der Abruf ist auf 365
Tage Vergangenheit und 730 Tage Zukunft begrenzt; Ereignisse und ihre externe
UID-/ETag-Zuordnung werden atomar geschrieben. Es gibt keine automatische oder
bidirektionale Synchronisation und keine Schreibaktion zum externen Dienst.
Details und offene Grenzen stehen im
[externen CalDAV-Vertrag](docs/api/external-caldav.md).

Im selben Einstellungsabschnitt kann optional eine ausschließlich lesende
GitHub-Verbindung
eingerichtet werden. Sie bleibt ohne `INTEGRATION_SECRET_KEY` und bis zur
bewussten Aktivierung netzwerkfrei. Das Token wird nur verschlüsselt im
Backend gespeichert und nie wieder ausgegeben. Danach lassen sich
Repository-Metadaten, Issues, Pull Requests, Commits, Releases und CI-Status
flüchtig innerhalb harter Antwort- und Mengenlimits anzeigen; LifeOS speichert
diese Inhalte nicht dauerhaft und führt keine GitHub-Schreibaktion aus.
Details, Berechtigungen, Limits und offene Grenzen stehen im
[GitHub-Integrationsvertrag](docs/api/github-integration.md).

Der eigene LifeOS-Kalender, der lokale CalDAV-Server, ICS-Import/-Export und
der Browserbetrieb benötigen keine externe Verbindung. OAuth, Webhooks,
Hintergrundsynchronisation, externe Schreibaktionen und Löschspiegelung bleiben
bewusst offen. Die installierte Mac-App erhält weiterhin keinen
Integrationsschlüssel; eine spätere Aktivierung erfordert einen separat
geprüften Schlüsselbundpfad.

Der historische synthetische Abschlusslauf für Finanzen, Fitness, ICS,
optionale Integrationen, PostgreSQL, SQLite, Recovery, Browser und Mac-Sidecar
ist im [lokalen Roadmap-0.5-Nachweis](docs/roadmap-05-local-demo.md)
dokumentiert. Dort sind auch Update-/Backup-Schritte und ausdrücklich offene
externe Release-Gates getrennt aufgeführt.

Der vollständige Sicherheits-, Integritäts- und Stabilitätsreview ist im
[Sicherheitsreview 0.6](docs/security-review-0.6.md) dokumentiert. Sie enthält
alle eingestuften Befunde, Ursachen, Korrekturen, Regressionstests und bewusst
offenen Grenzen. Die aktuelle npm- und RustSec-Prüfung ist enthalten;
öffentliche Apple- und Geräte-Gates bleiben davon getrennt offen.

Ein Produktions-Build erzeugt zusätzlich Manifest und Offline-App-Shell:

```bash
npm run build --workspace @lifeos/web
npm run web:preview
```

Die App-Shell ist offline verfügbar; persönliche API-Daten werden absichtlich
nicht offline gecacht und nicht in `localStorage` oder `sessionStorage`
geschrieben. Details stehen in [apps/web/README.md](apps/web/README.md).

Die allgemeinen Repository-Prüfungen lauten:

```bash
npm install
npm run format:check
npm run repo:check
npm run security:secrets
npm run db:verify:recovery
npm run db:verify:finance-removal
npm test
```

`npm test` führt Repository-, Datenbank-, API- und Web-Tests aus. Für die
Playwright-End-to-End-Tests wird ein lokal verfügbares Chrome benötigt.
Der vollständige Demo-, Backup-/Restore- und Apple-Kalender-Nachweis steht in
[docs/foundation-verification.md](docs/foundation-verification.md).

### Aktuell verfügbare Befehle

| Aufgabe                                          | Befehl                                                                     |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| Abhängigkeiten installieren                      | `npm ci`                                                                   |
| Docker und lokale Konfiguration prüfen           | `npm run env:check`                                                        |
| Datenbank starten und Verbindung prüfen          | `npm run db:start`                                                         |
| Datenbankstatus und SQL-Verbindung prüfen        | `npm run db:check`                                                         |
| Lokale Dienste ohne Datenverlust stoppen         | `npm run db:stop`                                                          |
| Prisma-Schema prüfen                             | `npm run db:validate`                                                      |
| Versionierte Migrationen mit Backup-Nachweis     | `npm run db:migrate`                                                       |
| Synthetische Seed-Daten anlegen                  | `npm run db:seed`                                                          |
| Datenbank-Integrationstest ausführen             | `npm run db:test`                                                          |
| SQLite-Spike-Schema prüfen                       | `npm run db:sqlite:validate`                                               |
| SQLite-Spike-Migration anwenden                  | `npm run db:sqlite:migrate`                                                |
| SQLite-Spike synthetisch befüllen                | `npm run db:sqlite:seed`                                                   |
| SQLite-Migrationsgate prüfen                     | `npm run db:sqlite:test`                                                   |
| Vollständige API auf SQLite prüfen               | `npm run test:sqlite:api`                                                  |
| Gebaute SQLite-API mit Neustart prüfen           | `npm run verify:sqlite:api-runtime`                                        |
| Gebündelten Mac-Sidecar prüfen                   | `npm run desktop:verify:sidecar`                                           |
| Native Mac-App lokal bauen                       | `npm run desktop:build:app`                                                |
| ARM64-DMG lokal bauen                            | `npm run desktop:build:dmg`                                                |
| Lokales DMG und gebündelten Sidecar prüfen       | `npm run desktop:verify:dmg`                                               |
| Release-Metadaten abgleichen                     | `npm run release:verify`                                                   |
| Lokales Release vollständig bauen                | `npm run release:build:local`                                              |
| Lokales Release vollständig prüfen               | `npm run release:verify:local`                                             |
| Developer-ID-Build notarisiert vorbereiten       | `npm run release:build:public`                                             |
| Notarisiertes lokales Artefakt prüfen            | `npm run release:verify:public -- <dmg>`                                   |
| Heruntergeladenes Artefakt mit Gatekeeper prüfen | `npm run release:verify:downloaded -- <dmg>`                               |
| CalDAV über die private LAN-Adresse vorprüfen    | `npm run caldav:verify:lan`                                                |
| Zwei Versionen, Update und Rollback prüfen       | `npm run desktop:verify:update-rollback -- <baseline-dmg> <aktuelles-dmg>` |
| Vollständige Stabilitätsdemo ausführen           | `npm run demo:stabilization -- <baseline-dmg>`                             |
| PostgreSQL vollständig nach SQLite übertragen    | `npm run db:sqlite:import`                                                 |
| SQLite und Dokumente sichern                     | `npm run db:sqlite:backup -- …`                                            |
| SQLite-Backup in neue Ziele restaurieren         | `npm run db:sqlite:restore -- …`                                           |
| SQLite und Dokumente verschlüsselt sichern       | `npm run db:sqlite:backup:encrypted -- …`                                  |
| Verschlüsseltes Backup in neue Ziele laden       | `npm run db:sqlite:restore:encrypted -- …`                                 |
| SQLite-Import und Recovery isoliert prüfen       | `npm run db:sqlite:verify:recovery`                                        |
| Lokales PostgreSQL-Backup erstellen              | `npm run db:backup`                                                        |
| Backup sicher in neue Datenbank restaurieren     | `npm run db:restore -- …`                                                  |
| Dokumente prüfsummengeschützt sichern            | `npm run documents:backup -- …`                                            |
| Dokumente ausschließlich in neues Ziel laden     | `npm run documents:restore -- …`                                           |
| Migration, Backup und Restore isoliert prüfen    | `npm run db:verify:recovery`                                               |
| Finanzentfernung mit Backup-Pflicht prüfen       | `npm run db:verify:finance-removal`                                        |
| API lokal starten                                | `npm run api:start`                                                        |
| API im Watch-Modus starten                       | `npm run api:dev`                                                          |
| Weboberfläche lokal starten                      | `npm run web:dev`                                                          |
| Gebaute Weboberfläche lokal prüfen               | `npm run web:preview`                                                      |
| Lokales Passwort setzen/Sitzungen widerrufen     | `npm run auth:bootstrap`                                                   |
| Getrennten CalDAV-Zugang setzen                  | `npm run caldav:bootstrap`                                                 |
| Getrennten CalDAV-Zugang widerrufen              | `npm run caldav:revoke`                                                    |
| Workspaces linten                                | `npm run lint`                                                             |
| Workspaces typprüfen                             | `npm run typecheck`                                                        |
| Anwendungen und Packages bauen                   | `npm run build`                                                            |
| Compose-Konfiguration ohne Start prüfen          | `npm run repo:check`                                                       |
| Versionierte Dateien auf Secrets prüfen          | `npm run security:secrets`                                                 |
| Formatierung prüfen                              | `npm run format:check`                                                     |
| Repository- und vorhandene Workspace-Tests       | `npm test`                                                                 |

Die SQLite-Befehle bilden alle vorhandenen Fachmodelle ab. Die gebaute API
läuft damit ohne Docker und behält synthetische Daten nach einem Neustart. M3
und M4 weisen Kalender-/CalDAV-Parität, vollständigen PostgreSQL-Import sowie
Backup und Restore von SQLite und Dokumenten nach. M5 ergänzt eine tatsächlich
gebaute und gestartete Tauri-`.app` für macOS ARM64 mit gebündeltem Node-
Sidecar; zur Laufzeit sind weder Docker noch ein globales Node.js nötig. M6
ergänzt das geprüfte DMG, die terminalfreie Ersteinrichtung sowie einen
datenerhaltenden Update-, Rollback- und Restore-Nachweis. Noch offen sind
Developer-ID-Signierung, Notarisierung, Gatekeeper-Downloadpfad, weitere
Architekturen, der Gegencheck auf einem zweiten sauberen Mac und der physische
Apple-Kalender-Test. Roadmap 0.9 stellt dafür reproduzierbare Prüfpfade und
Checklisten bereit, erklärt die Gates aber erst nach einem tatsächlichen
Nachweis für bestanden. Buildweg, App-Pfade und Grenzen stehen in
[`apps/desktop/README.md`](apps/desktop/README.md). Weitere Datenregeln stehen in
[`packages/database/README.md`](packages/database/README.md) und im
[`Migrationsprotokoll`](docs/mac-desktop-migration-log.md).

Details zu Web- und PWA-Prüfungen stehen in
[apps/web/README.md](apps/web/README.md). Details zu Schemaänderungen,
Zeitwerten und Migrationssicherheit stehen in
[packages/database/README.md](packages/database/README.md).

### Häufige Docker-Probleme

- **„Docker wurde nicht gefunden“:** Docker Desktop oder Docker Engine samt
  Compose-Plugin installieren und das Terminal neu öffnen.
- **„Docker-Dienst ist nicht erreichbar“:** Docker Desktop bzw. den
  Docker-Daemon starten. Danach `npm run env:check` wiederholen.
- **Datenbank wird nicht gesund:** `docker compose logs db` zeigt die
  PostgreSQL-Ausgabe. Häufig sind widersprüchliche Werte in `.env` oder ein
  bereits belegter Port die Ursache.
- **Port 5432 ist belegt:** In `.env` beispielsweise `POSTGRES_PORT=5433`
  setzen und den Port in `DATABASE_URL` ebenfalls auf `5433` ändern.

`docker compose down --volumes` löscht das persistente Datenbank-Volume und ist
nicht Teil des normalen Stop-Ablaufs. Dieser destruktive Befehl darf nur bewusst
mit entbehrlichen, gesicherten Testdaten verwendet werden.

## Daten und Backups

Lokale Dokumentdaten liegen unter `data/`, PostgreSQL-Daten im benannten
Docker-Volume `lifeos-postgres`; beides wird nicht versioniert. Prisma-
Migrationen liegen dagegen versioniert unter
`packages/database/prisma/migrations/`. Vor potenziell verlustbehafteten
Migrationen müssen ein PostgreSQL-Backup und eine Sicherung des
Dokumentenverzeichnisses erstellt werden. Der vollständige automatisierte
Backup-/Wiederherstellungsnachweis umfasst Prüfsummen, manipulierte Archive,
Symlinks, disjunkte neue Ziele und Datenvergleich; Details stehen im
[Recovery-Nachweis 0.6](docs/reliability-recovery-0.6.md). Für portable
SQLite-Sicherungen schützt der empfohlene verschlüsselte Container Datenbank
und Dokumente gemeinsam. Unterstützte Ziele, Passphrasenübergabe,
Wiederherstellung und der kompatibel erhaltene unverschlüsselte Bestand sind
unter [Verschlüsselte Backups](docs/encrypted-backups.md) dokumentiert.

## Optionale GitHub-Planung

GitHub-Issues, Milestones und Projects sind Hilfsmittel, aber keine
Voraussetzung für eine Änderung. Der verbindliche Ablauf besteht aus
zweckbezogenem Branch, Conventional Commit, Push, Pull Request und erfolgreicher
CI. Planungsobjekte werden nur bei ausdrücklichem Bedarf angelegt; eine
Browser-Aktion ist dafür nicht vorgeschrieben.

Die Labels, Roadmap-Milestones und das persönliche GitHub-Project werden mit
dem folgenden optionalen Skript eingerichtet:

```bash
bash scripts/setup-github-planning.sh
```

Das Skript benötigt eine gültige GitHub-CLI-Anmeldung und den `project`-Scope:

```bash
gh auth login -h github.com
gh auth refresh -s project
```

Die Einrichtung wird im eigenen, bereits bei GitHub angemeldeten Terminal
ausgeführt. Für persönliche Projects muss die Anmeldung den `project`-Scope
besitzen; das Skript legt keine Zugangsdaten im Repository ab.

Reguläre Abhängigkeitsupdates laufen ebenfalls zuerst über `develop`.
Gruppierung, Major-Update-Grenze, die abweichende GitHub-Behandlung
automatischer Sicherheitsupdates und der noch offene reale Dependabot-Nachweis
sind unter [Abhängigkeitsupdates über `develop`](docs/dependency-updates.md)
dokumentiert.

Es ist wiederholbar: Bereits vorhandene Labels, Milestones, Project-Felder und
Ansichten werden nicht doppelt angelegt. Das Project enthält die Ansichten
`Backlog`, `Kanban` und `Roadmap`.

## Entwicklungsprinzip

Kleine, nachvollziehbare Änderungen bevorzugen. Neue dauerhafte Erkenntnisse
werden gemäß den Regeln in [AGENTS.md](AGENTS.md) dokumentiert.
