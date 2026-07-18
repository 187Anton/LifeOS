# Mitarbeit am Life OS

## Grundsätze

- Vor Änderungen zunächst \`AGENTS.md\`, README und relevante Dokumentation lesen.
- Anforderungen und Ursachen bei Fehlern nachvollziehbar dokumentieren.
- Kleine Änderungen mit klarer Begründung bevorzugen.
- Keine echten Secrets oder sensiblen Unternehmensdaten verwenden.
- Tests, Formatprüfung und Build passend zur Änderung ausführen.

## Branches und Commits

Für eigenständige Änderungen einen zweckbezogenen Branch verwenden. Commits
folgen möglichst Conventional Commits, zum Beispiel:

\`\`\`text
chore(repo): initialize project foundation
feat(calendar): add local event model
fix(caldav): preserve event etags during update
\`\`\`

## Pull Requests

Pull Requests enthalten:

- Problem und Ursache
- Umfang der Änderung
- Tests und lokale Verifikation
- Annahmen und offene Risiken
