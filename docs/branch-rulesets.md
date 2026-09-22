# Verbindliche Branch-Prüfungen

Stand: 15. September 2026

## Geschützte Branches

Die aktiven GitHub-Rulesets `protect-main` (`19152257`) und
`protect-develop` (`19152343`) schützen `main` beziehungsweise `develop`.
Beide Rulesets erzwingen unverändert:

- keine Branch-Löschung und keine nicht-lineare Fortschreibung,
- lineare Historie,
- Änderungen ausschließlich per Pull Request,
- nur Squash-Merges,
- aufgelöste Review-Unterhaltungen und
- keine Bypass-Akteure.

## Exakte Pflichtchecks

Beide Rulesets verlangen über die GitHub-Actions-Integration `15368` exakt
diese beiden Statuschecks:

1. `Repository checks`
2. `Local macOS release`

Die strikte Aktualitätsprüfung bleibt aktiviert. Ein fehlender, laufender oder
fehlgeschlagener Pflichtcheck blockiert deshalb den Merge. Erst wenn beide
Checks für den aktuellen Pull-Request-Stand erfolgreich sind und alle übrigen
Ruleset-Bedingungen erfüllt sind, darf per Squash gemergt werden.

## Kontrollierte Verifikation

Die Durchsetzung wird mit einem Pull Request gegen `develop` geprüft:

1. Ein vorübergehender, ausschließlich im macOS-Job liegender Fehlschritt lässt
   `Local macOS release` fehlschlagen, ohne `Repository checks` zu verändern.
2. Bei grünem `Repository checks` und rotem `Local macOS release` muss GitHub
   den Pull Request als nicht mergebar melden.
3. Der vorübergehende Fehlschritt wird vollständig entfernt.
4. Beide Jobs werden für den neuen Head erneut ausgeführt und müssen
   erfolgreich sein, bevor der Pull Request gemergt wird.

Der Negativtest verändert keine Produktlogik und bleibt nicht im Zielbranch.
Die GitHub-API-Antworten der beiden Rulesets sowie die Checkläufe des
Test-Pull-Requests bilden den externen Nachweis; die Repositorydokumentation
allein ersetzt ihn nicht.

Am 15. September 2026 wurde dieser Ablauf mit
[Pull Request #109](https://github.com/187Anton/LifeOS/pull/109) auf dem
Test-Head `ccf2a9f6c29042a4d8ad41021a45a4ba3dc4f567` ausgeführt:

- [`Repository checks`](https://github.com/187Anton/LifeOS/actions/runs/34996517451/job/104474012642)
  war nach 4 Minuten und 16 Sekunden erfolgreich.
- [`Local macOS release`](https://github.com/187Anton/LifeOS/actions/runs/34996517451/job/104474012297)
  schlug durch den ausschließlich dort eingefügten Fehlschritt nach 5 Sekunden
  fehl.
- GitHub meldete den Quellstand als konfliktfrei (`MERGEABLE`), den
  Merge-Status aber als `BLOCKED`. Das angewendete Ruleset verlangte beide
  Statuschecks streng und keine genehmigende Review.

Anschließend wurde der Fehlschritt vollständig entfernt. Der finale
Pull-Request-Stand darf erst nach zwei erfolgreichen Pflichtchecks gemergt
werden.

## Abgrenzung

Diese Regeln machen den bestehenden lokalen macOS-CI-Pfad merge-blockierend.
Sie sind kein Nachweis für Developer-ID-Signierung, Apple-Notarisierung,
Gatekeeper nach Download, Intel-/Universal-Unterstützung, einen zweiten sauberen
Mac oder eine öffentliche Freigabe. Diese Release-Gates bleiben getrennt und
offen, bis sie tatsächlich erbracht wurden.
