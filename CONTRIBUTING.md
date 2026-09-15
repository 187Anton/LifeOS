# Mitarbeit am Life OS

## Grundsätze

- Vor Änderungen zunächst `AGENTS.md`, README und relevante Dokumentation lesen.
- Anforderungen und Ursachen bei Fehlern nachvollziehbar dokumentieren.
- Kleine Änderungen mit klarer Begründung bevorzugen.
- Keine echten Secrets oder sensiblen Unternehmensdaten verwenden.
- Tests, Formatprüfung und Build passend zur Änderung ausführen.

## Branches und Commits

`main` ist der stabile Branch, `develop` der Integrationsbranch. Für jede
Änderung einen zweckbezogenen Branch aus dem aktuellen `develop` verwenden.
Ein Branch bearbeitet genau ein GitHub-Issue und darf keine Bezeichnung eines
KI-Werkzeugs tragen. Commits folgen Conventional Commits:

```text
chore(repo): initialize project foundation
feat(calendar): add local event model
fix(caldav): preserve event etags during update
```

Änderungen werden zuerst per Pull Request nach `develop` und erst danach per
Pull Request von `develop` nach `main` integriert.

## Pull Requests

Pull Requests enthalten:

- eine Verknüpfung mit `Closes #<Issue-Nummer>`,
- Problem und Ursache
- Umfang der Änderung
- Tests und lokale Verifikation
- Annahmen und offene Risiken

Die GitHub-Actions-CI läuft automatisch für Pull Requests nach `develop` und
`main`. Pull Requests bleiben Entwürfe, bis Akzeptanzkriterien, relevante Tests
und Dokumentation vollständig sind. Fehlgeschlagene erforderliche Checks
dürfen nicht umgangen werden.

Vor dem Push mindestens ausführen:

```bash
npm run format:check
npm run repo:check
npm test
```

## Abhängigkeitsupdates

Reguläre Dependabot-Versionsupdates für npm und GitHub Actions zielen auf
`develop` und durchlaufen dort dieselben beiden CI-Jobs wie andere Pull
Requests. Zusammengehörige Minor- und Patch-Updates dürfen gruppiert werden;
Major-Updates bleiben einzeln und benötigen eine eigene Migrations- und
Kompatibilitätsprüfung.

GitHub richtet automatische Sicherheitsupdate-PRs technisch weiterhin gegen
den Default-Branch `main`; `target-branch` gilt laut GitHub nur für reguläre
Versionsupdates. Solche Sicherheits-PRs werden deshalb nicht direkt nach
`main` gemergt, sondern als eigener Branch aus dem aktuellen `develop`
übernommen, vollständig geprüft und zuerst nach `develop` integriert.

## GitHub Actions

Externe Actions in Workflows und zusammengesetzten Actions müssen einen
vollständigen 40-stelligen Commit-SHA verwenden. Direkt dahinter bleibt die
exakte Releaseversion als Kommentar sichtbar, zum Beispiel
`owner/action@<commit-sha> # v1.2.3`. Lokale Actions mit einem Pfad unter `./`
sind davon ausgenommen.

GitHub-Actions-Updates werden von Dependabot gegen `develop` vorgeschlagen.
Der PR wird nur nach Prüfung der Releasehinweise, des neuen Commits und beider
CI-Jobs integriert. Workflowberechtigungen dürfen bei einem reinen
Action-Update nicht erweitert werden.
