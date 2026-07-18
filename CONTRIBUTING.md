# Mitarbeit am Life OS

## Grundsätze

- Vor Änderungen zunächst `AGENTS.md`, README und relevante Dokumentation lesen.
- Anforderungen und Ursachen bei Fehlern nachvollziehbar dokumentieren.
- Kleine Änderungen mit klarer Begründung bevorzugen.
- Keine echten Secrets oder sensiblen Unternehmensdaten verwenden.
- Tests, Formatprüfung und Build passend zur Änderung ausführen.

## Branches und Commits

`main` ist der stabile Branch, `develop` der Integrationsbranch. Für jede
Änderung einen zweckbezogenen Branch aus `develop` verwenden. Commits folgen
Conventional Commits:

```text
chore(repo): initialize project foundation
feat(calendar): add local event model
fix(caldav): preserve event etags during update
```

Änderungen werden zuerst per Pull Request nach `develop` und erst danach per
Pull Request von `develop` nach `main` integriert.

## Pull Requests

Pull Requests enthalten:

- Problem und Ursache
- Umfang der Änderung
- Tests und lokale Verifikation
- Annahmen und offene Risiken

Die GitHub-Actions-CI läuft automatisch für Pull Requests nach `develop` und
`main`. Codex soll Pull Requests selbstständig eröffnen, wenn Remote und
Berechtigungen verfügbar sind.
