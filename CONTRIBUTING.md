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
