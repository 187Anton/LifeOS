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

## Repository-Struktur

\`\`\`text
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
\`\`\`

## Lokaler Start

Voraussetzungen:

- Node.js 22
- npm 10 oder neuer
- Docker Desktop oder Docker Engine mit Compose

Konfiguration anlegen:

\`\`\`bash
cp .env.example .env
\`\`\`

Lokale Datenbank starten:

\`\`\`bash
docker compose up -d db
\`\`\`

Die Anwendung selbst wird nach dem Scaffolding von API und Weboberfläche über
die jeweiligen Workspace-Skripte gestartet. Bis dahin prüft der Repository-
Check die Compose-Konfiguration:

\`\`\`bash
npm install
npm run format:check
npm run repo:check
\`\`\`

## Daten und Backups

Lokale Daten liegen unter \`data/\` und werden nicht versioniert. Vor späteren
Datenbankmigrationen müssen ein PostgreSQL-Backup und eine Sicherung des
Dokumentenverzeichnisses erstellt werden. Die konkreten Backup-Befehle werden
mit der Datenbankimplementierung ergänzt.

## Entwicklungsprinzip

Kleine, nachvollziehbare Änderungen bevorzugen. Neue dauerhafte Erkenntnisse
werden gemäß den Regeln in [AGENTS.md](AGENTS.md) dokumentiert.
