# Abgesicherte GitHub Actions

Stand: 15. September 2026

## Ursache und Ziel

Der CI-Workflow verwendete `actions/checkout@v7` und
`actions/setup-node@v7`. Ein Major-Tag kann später auf einen anderen Commit
zeigen und identifiziert deshalb keinen unveränderlichen Quellstand. Dadurch
hing der ausgeführte CI-Code trotz unverändertem LifeOS-Commit von einem
veränderlichen externen Verweis ab.

Alle externen Actions sind nun auf den vollständigen Commit des geprüften
Releases festgelegt. Die exakte Version bleibt direkt am Eintrag lesbar:

| Action               | Release | Commit                                     |
| -------------------- | ------- | ------------------------------------------ |
| `actions/checkout`   | v7.0.1  | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/setup-node` | v7.0.0  | `820762786026740c76f36085b0efc47a31fe5020` |

Die Commits wurden am 15. September 2026 über die offiziellen GitHub-
Repositorydaten auf gültige Signatur und Zugehörigkeit zum jeweiligen
Release-Tag geprüft.

## Durchgesetzte Grenze

Die Repositoryprüfung durchsucht alle YAML-Dateien unter
`.github/workflows` und `.github/actions`. Lokale Actions unter `./` bleiben
zulässig. Jede externe GitHub Action benötigt einen vollständigen
40-stelligen Commit-SHA und einen Kommentar mit der exakten Releaseversion.
Externe Container-Actions benötigen entsprechend einen vollständigen
SHA-256-Image-Digest.

Die Workflowberechtigung bleibt auf `contents: read` beschränkt. Das Pinnen
ändert weder Berechtigungen noch Secrets, Trigger oder ausgeführte Schritte.

## Kontrollierte Aktualisierung

Dependabot bleibt für das Ökosystem `github-actions` aktiviert und richtet
reguläre Update-PRs auf `develop`. Bei jedem Update werden Releasehinweise,
neuer Commit und Versionskommentar gemeinsam geprüft. Erst die erfolgreichen
Jobs `Repository checks` und `Local macOS release` belegen, dass Checkout,
Node-Cache, npm-/Rust-Audit und lokaler DMG-Pfad mit dem neuen Pin weiterhin
funktionieren.

Ein fester Commit schützt nicht vor Schadcode, der bereits in diesem Commit
enthalten ist. Releaseprüfung, minimale Berechtigungen, Dependency-Audits und
Branch-Schutz bleiben deshalb eigenständige Sicherheitsgrenzen. Dieser Schritt
ändert keine öffentliche Releasefreigabe und führt keinen Merge nach `main`
durch.
