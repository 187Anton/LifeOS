# Bereinigter lokaler Worktree-Stand

Stand: 15. September 2026

## Ziel und Sicherheitsgrenze

Die Bereinigung verhindert, dass neue Änderungen versehentlich auf einem
veralteten lokalen `develop` beginnen. Sie hat keine fachlichen Dateien,
unversionierten Ausgaben oder Branches gelöscht. Es wurden weder
`reset --hard` noch eine rekursive Löschung verwendet.

## Verwaiste Metadaten

Zwei registrierte Worktrees verwiesen auf nicht mehr vorhandene Verzeichnisse.
Nach Prüfung der Branches wurden ausschließlich ihre verwaisten
Worktree-Metadaten mit `git worktree prune --expire now` entfernt:

| ehemaliger Pfad                                | erhaltener Branch                | Zuordnung       |
| ---------------------------------------------- | -------------------------------- | --------------- |
| `/private/tmp/lifeos-mac-desktop-plan`         | `feat/mac-installer`             | PR #54, gemergt |
| `/private/tmp/lifeos-security-integrity-audit` | `chore/sync-security-audit-main` | PR #84, gemergt |

Der lokale `feat/mac-installer`-Zeiger bleibt auf `f5d5c167...`, sein
Remote-Branch auf `b766bc83...`. Der lokale und der entfernte
`chore/sync-security-audit-main`-Zeiger bleiben auf `d0b875a4...`. Ein
abschließender trockener Prune-Lauf meldete keine weiteren verwaisten Einträge.

## Erhalt und Zuordnung des alten `develop`

Der lokale `develop` stand vor der Bereinigung auf `8174d38e...` und war
gegenüber dem damals aktuellen `origin/develop` drei Commits voraus und 44
Commits zurück. Die drei Commits sind vollständig zugeordnet:

| Commit        | Inhalt                                         |
| ------------- | ---------------------------------------------- |
| `409e47d3...` | GitHub-Planungseinrichtung automatisieren      |
| `167eead2...` | Project-Views über GraphQL abfragen            |
| `8174d38e...` | Roadmap in ausführbare Arbeitspakete aufteilen |

Alle drei sind im weiterhin vorhandenen Branch `chore/repository-workflow`
und in dessen Remote-Branch enthalten. Sie gehören zu
[PR #18](https://github.com/187Anton/LifeOS/pull/18), der nach `develop`
gemergt wurde. Der PR-Head `c8c05701...` und der Merge-Commit `a21dbf34...`
haben dieselbe Tree-ID `d89ce46c...`; damit ist der vollständige Inhalt trotz
abweichender Einzel-Commit-Historie integriert.

Vor dem Angleichen wurde zusätzlich der lokale Sicherungsbranch
`archive/local-develop-before-sync-20260915` auf `8174d38e...` angelegt.
Anschließend wurde der lokale Branch-Zeiger kontrolliert auf
`origin/develop` gesetzt und der Worktree wieder an `develop` gebunden. Den
später hinzugekommenen Merge von PR #109 übernahm ein regulärer Fast-Forward.
Dabei wurde keine unversionierte Datei gelöscht.

Die vorhandenen Dateien unter `apps/web/test-results`, die beiden
`*.tsbuildinfo`-Dateien und der generierte Prisma-Client blieben physisch
erhalten. Der aktuelle `.gitignore` deckt sie über `test-results/`,
`*.tsbuildinfo` und `packages/database/src/generated/` ab; der lokale
`develop`-Worktree ist deshalb erwartbar sauber.

## Aktive Worktrees

Die erneute Inventur ergab ausschließlich saubere Arbeitskopien:

| Worktree                      | eindeutiger Branch                   | Status / Zuordnung                 |
| ----------------------------- | ------------------------------------ | ---------------------------------- |
| Repositorywurzel              | `docs/align-roadmap-status`          | sauber, PR #85 gemergt             |
| `lifeos-actions-103`          | `ci/pin-github-actions`              | sauber, PR #108 gemergt            |
| `lifeos-dependabot-98`        | `ci/dependabot-develop`              | sauber, PR #107 gemergt            |
| `lifeos-encrypted-backups-97` | `security/encrypted-backups`         | sauber, PR #106 gemergt            |
| `lifeos-reconcile-prs-101`    | `chore/reconcile-pull-requests`      | sauber, PR #105 gemergt            |
| `lifeos-ruleset-93`           | `ci/require-macos-check`             | sauber, PR #109 gemergt            |
| `lifeos-worktrees-104`        | `chore/reconcile-worktrees`          | sauber, Issue #104                 |
| `.worktrees/ai-planning`      | `feat/ai-planning`                   | sauber, PR #86 offen               |
| `.worktrees/integrations`     | `feat/integrations`                  | sauber, PR #87 gemergt             |
| `.worktrees/phase-03`         | `archive/phase-03-snapshot-20260915` | sauberer historischer Snapshot     |
| `.worktrees/release-0.9`      | `chore/reconcile-roadmap-09-main`    | sauber, PR #91 offen               |
| `.worktrees/scheduling`       | `feat/shared-scheduling`             | sauber, PR #53 gemergt             |
| `.worktrees/study`            | `develop`                            | sauber, identisch zu Remote-Branch |
| `.worktrees/work`             | `feat/work-module`                   | sauber, PR #52 gemergt             |

Der frühere abgetrennte `phase-03`-Stand `830fb776...` ist bereits Vorfahr des
aktuellen `origin/develop`. Er wurde ohne Inhaltsänderung an einen klar
benannten lokalen Archivbranch gebunden. Die offenen PRs #86 und #91 wurden
weder verändert noch gemergt.

## Verbindlicher Ablauf für neue Arbeit

Vor einem neuen Zweckbranch werden Remote-Refs abgerufen, der aktuelle Stand
von `origin/develop` geprüft und `git worktree list --porcelain` auf fehlende
oder verwaiste Pfade kontrolliert. Ein veralteter lokaler Branch wird erst nach
Zuordnung seiner zusätzlichen Commits und Anlegen eines Sicherungsbranches
verschoben. Unversionierte Dateien werden vor jedem Entfernen einzeln geprüft;
eine Worktree-Bereinigung ist kein Anlass für pauschale Lösch- oder
Reset-Befehle.
