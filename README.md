# Anton Life OS

Persönliche, lokal startbare Plattform für Studium, Arbeit, Projekte, Aufgaben,
Kalender, Finanzen, Fitness und Wissen.

Der aktuelle Stand ist bewusst ein stabiles Projektfundament. Die eigentliche
Fachlogik wird schrittweise ergänzt.

## Leitentscheidungen

- modularer Monolith statt Microservices
- React und TypeScript für die Weboberfläche
- Node.js und TypeScript für die API
- PostgreSQL als relationale Datenbank
- Docker Compose für die lokale Infrastruktur
- responsive Weboberfläche mit späterer PWA-Nutzung
- CalDAV-Server ab dem Fundament, damit Termine ohne installierte LifeOS-App
  in Apple Kalender sichtbar werden können
- lokale Speicherung und synthetische Beispieldaten
- externe Integrationen und KI standardmäßig deaktiviert

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

Commits verwenden dieses Format:

```text
<type>(<scope>): <description>
```

Beispiele sind `feat(calendar): add event model` oder
`chore(repo): update CI workflow`.

Pull Requests gegen `develop` und `main` starten automatisch die GitHub-
Actions-CI. Sie prüft Formatierung, Compose-Konfiguration und alle vorhandenen
automatisierten Tests. Auf GitHub sollten für beide Branches erforderliche
Statusprüfungen und Pull Requests als Branch-Schutz eingerichtet werden.

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

## Repository-Struktur

```text
apps/
api/ Backend und spätere CalDAV-Schnittstelle
web/ React-Weboberfläche

packages/
contracts/ Gemeinsame API- und Datenverträge
database/ PostgreSQL-/Prisma-Modell

docs/
architecture.md Architekturentscheidungen
roadmap.md inkrementeller Umsetzungsplan

compose.yaml lokale PostgreSQL-Infrastruktur
.env.example Beispielkonfiguration ohne echte Secrets
.github/ CI, Issue-Vorlagen und Pull-Request-Vorlage
scripts/ Wiederholbare Repository- und GitHub-Einrichtung
```

## Lokaler Start

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

Die Anwendung selbst wird nach dem Scaffolding von API und Weboberfläche über
die jeweiligen Workspace-Skripte gestartet. Bis dahin prüft der Repository-
Check die Compose-Konfiguration:

```bash
npm install
npm run format:check
npm run repo:check
npm test
```

`npm test` führt bereits echte Repository-Vertragstests aus. Die Ausgaben der
API- und Web-Workspaces sind bis zu den Arbeitspaketen 0.1.4 und 0.1.8 noch
ausdrücklich als Platzhalter markiert; sie gelten nicht als implementierte
Anwendungstests.

### Aktuell verfügbare Befehle

| Aufgabe                                    | Befehl                 |
| ------------------------------------------ | ---------------------- |
| Abhängigkeiten installieren                | `npm ci`               |
| Docker und lokale Konfiguration prüfen     | `npm run env:check`    |
| Datenbank starten und Verbindung prüfen    | `npm run db:start`     |
| Datenbankstatus und SQL-Verbindung prüfen  | `npm run db:check`     |
| Lokale Dienste ohne Datenverlust stoppen   | `npm run db:stop`      |
| Prisma-Schema prüfen                       | `npm run db:validate`  |
| Versionierte Migrationen anwenden          | `npm run db:migrate`   |
| Synthetische Seed-Daten anlegen            | `npm run db:seed`      |
| Datenbank-Integrationstest ausführen       | `npm run db:test`      |
| Compose-Konfiguration ohne Start prüfen    | `npm run repo:check`   |
| Formatierung prüfen                        | `npm run format:check` |
| Repository- und vorhandene Workspace-Tests | `npm test`             |

API-/Web-Start, Linting, Typecheck und Build werden mit den zugehörigen
Arbeitspaketen ergänzt. Bis dahin werden dafür keine erfolgreichen
Platzhalterbefehle behauptet. Details zu Schemaänderungen, Zeitwerten und
Migrationssicherheit stehen in
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
Backup-/Wiederherstellungstest folgt im Absicherungspaket 0.1.9.

## GitHub-Planung einrichten

Die Labels, Roadmap-Milestones und das persönliche GitHub-Project werden mit
dem folgenden Skript eingerichtet:

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

Es ist wiederholbar: Bereits vorhandene Labels, Milestones, Project-Felder und
Ansichten werden nicht doppelt angelegt. Das Project enthält die Ansichten
`Backlog`, `Kanban` und `Roadmap`.

## Entwicklungsprinzip

Kleine, nachvollziehbare Änderungen bevorzugen. Neue dauerhafte Erkenntnisse
werden gemäß den Regeln in [AGENTS.md](AGENTS.md) dokumentiert.
