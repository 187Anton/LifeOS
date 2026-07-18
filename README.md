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

Lokale Datenbank starten:

```bash
docker compose up -d db
```

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

| Aufgabe                                    | Befehl                    |
| ------------------------------------------ | ------------------------- |
| Abhängigkeiten installieren                | `npm ci`                  |
| Datenbankkonfiguration prüfen              | `npm run repo:check`      |
| Formatierung prüfen                        | `npm run format:check`    |
| Repository- und vorhandene Workspace-Tests | `npm test`                |
| Lokale Datenbank starten                   | `docker compose up -d db` |
| Status der lokalen Dienste                 | `docker compose ps`       |
| Lokale Dienste stoppen                     | `docker compose down`     |

Migration, Seed, API-/Web-Start, Linting, Typecheck und Build werden mit den
zugehörigen Arbeitspaketen ergänzt. Bis dahin werden dafür keine erfolgreichen
Platzhalterbefehle behauptet.

## Daten und Backups

Lokale Daten liegen unter `data/` und werden nicht versioniert. Vor späteren
Datenbankmigrationen müssen ein PostgreSQL-Backup und eine Sicherung des
Dokumentenverzeichnisses erstellt werden. Die konkreten Backup-Befehle werden
mit der Datenbankimplementierung ergänzt.

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
