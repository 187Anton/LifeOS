# Abhängigkeitsupdates über `develop`

Stand: 15. September 2026

## Ursache

Die bisherige `.github/dependabot.yml` enthielt für npm und GitHub Actions kein
`target-branch`. GitHub verwendete deshalb den Default-Branch `main`. Die fünf
offenen PRs #46 bis #50 zielten auf `main`, stammten aus August 2026 und
enthielten ausschließlich voneinander unabhängige Major-Updates. Sie waren
damit weder aktuell gegen `develop` geprüft noch mit dem verbindlichen
Integrationsablauf vereinbar. PR #47 hatte einen fehlgeschlagenen alten
Repository-Check, PR #50 war konfliktbehaftet; keiner der fünf PRs hatte den
heute verpflichtenden Job `Local macOS release` ausgeführt.

## Konfiguration

Reguläre Versionsupdates für npm und GitHub Actions werden monatlich geprüft
und mit `target-branch: develop` auf den Integrationsbranch gerichtet. Pro
Ökosystem dürfen höchstens fünf Versionsupdate-PRs gleichzeitig offen sein.
Das begrenzt die Warteschlange, ohne einzelne Major-Updates zu verdrängen.

Nur fachlich zusammengehörige Minor- und Patch-Updates werden gruppiert:

- `prisma` und `@prisma/client`, weil Generator und Laufzeit gemeinsam
  kompatibel bleiben müssen;
- Vite-, Vitest-, Testing-Library- und jsdom-Werkzeuge für den gemeinsamen
  Web-Entwicklungs- und Testpfad;
- Minor- und Patch-Updates der GitHub Actions.

Major-Updates gehören ausdrücklich keiner Gruppe an. Sie erhalten je einen
eigenen PR und werden nur nach eigener Migrations-, Kompatibilitäts- und
vollständiger CI-Prüfung integriert.

Pull Requests nach `develop` lösen sowohl `Repository checks` als auch `Local
macOS release` aus. Fehlgeschlagene oder fehlende Jobs werden nicht umgangen.

## Grenze automatischer Sicherheitsupdates

GitHub dokumentiert in der
[Dependabot-Optionsreferenz](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#target-branch),
dass `target-branch` nur für reguläre Versionsupdates gilt. Automatische
Dependabot-Sicherheitsupdate-PRs zielen weiterhin auf den Default-Branch
`main`. Diese technische Grenze wird nicht durch eine Änderung des
Default-Branches umgangen: `main` bleibt der stabile Branch.

Ein Sicherheitsupdate gegen `main` wird daher nicht direkt gemergt. Die
Änderung wird auf einem zweckbezogenen Branch aus dem aktuellen `develop`
reproduziert, mit aktuellem Lockfile, npm-Audit, vollständigen Tests und beiden
CI-Jobs geprüft und zuerst nach `develop` integriert.

## Alte Pull Requests

| PR  | Update                            | Befund am 15. September 2026                                              | Entscheidung                                                            |
| --- | --------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| #46 | `@types/node` 22 → 26             | Major-Update gegen `main`; weicht von der gebündelten Node-22-Laufzeit ab | ohne Merge geschlossen; Node-Major-Migration nur separat aus `develop`  |
| #47 | `@vitejs/plugin-react` 5 → 6      | Major-Update gegen `main`; alter Repository-Check fehlgeschlagen          | ohne Merge geschlossen; bei neuem Bedarf separat und vollständig prüfen |
| #48 | `@testing-library/jest-dom` 6 → 7 | Major-Update gegen `main`; heutiger macOS-Pflichtjob fehlt                | ohne Merge geschlossen; bei neuem Bedarf separat und vollständig prüfen |
| #49 | `jsdom` 27 → 30                   | Major-Update gegen `main`; heutiger macOS-Pflichtjob fehlt                | ohne Merge geschlossen; bei neuem Bedarf separat und vollständig prüfen |
| #50 | Vite 7 → 8                        | Major-Update gegen `main` und konfliktbehaftet                            | ohne Merge geschlossen; Migration nur separat aus aktuellem `develop`   |

Die fünf Änderungen wurden nicht zusammengeführt und nicht auf den aktuellen
Lockfile-Stand übertragen. Nach Wirksamwerden der Konfiguration im
Default-Branch erzeugt der nächste reguläre Dependabot-Lauf neue PRs gegen
`develop`, soweit die Updates dann noch relevant sind.

## Verifikation und noch offener externer Nachweis

Die Repository-Tests prüfen beide `target-branch`-Einträge, die expliziten
PR-Grenzen, den monatlichen Takt, die Minor-/Patch-Gruppen, den Ausschluss von
Major-Updates aus Gruppen sowie beide CI-Jobnamen. Prettier validiert dabei
auch die YAML-Syntax. `npm ci`, npm-Audit, vollständige Tests und der lokale
Mac-Releasepfad werden auf dem Änderungs-PR ausgeführt.

Dependabot liest seine Konfiguration laut
[GitHub-Dokumentation](https://docs.github.com/en/code-security/concepts/supply-chain-security/about-the-dependabot-yml-file#where-to-store-the-dependabotyml-file)
aus dem Default-Branch. Da dieser Schritt keinen Merge nach `main` umfasst,
kann ein tatsächlich neu erzeugter Dependabot-PR gegen `develop` erst nach der
späteren regulären Integration von `develop` nach `main` beobachtet werden.
Dieser externe Beobachtungsnachweis bleibt bis dahin ausdrücklich offen; ein
grüner Konfigurations-PR ersetzt ihn nicht.
