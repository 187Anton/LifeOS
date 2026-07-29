# Sicherheit

Dieses Repository ist zunächst für eine persönliche, lokale Anwendung gedacht.

## Regeln

- Keine Passwörter, Tokens, API-Schlüssel oder echten sensiblen Daten committen.
- Lokale Geheimnisse ausschließlich in `.env` halten.
- Beispieldaten synthetisch halten.
- Sicherheitsrelevante Änderungen im Backend und nicht nur in der Oberfläche
  erzwingen.
- Lokale Server nicht ohne ausdrückliche Entscheidung öffentlich ins Internet
  stellen.
- Der CalDAV-Zugang bleibt getrennt von der Web-Anmeldung widerrufbar. Basic
  Auth über HTTP ist ausschließlich für ein vertrauenswürdiges lokales Netz;
  vor Zugriff aus anderen Netzen muss TLS vorgeschaltet werden.

## Secret-Prüfung

```bash
npm run security:secrets
```

Der lokale, in `scripts/scan-secrets.mjs` einsehbare Scan prüft alle aktuell
versionierten Textdateien auf Private-Key-Blöcke, hochsichere Tokenformate und
fest zugewiesene sensible Werte. Er gibt bei einem Treffer nur Datei,
Zeilennummer und Regel aus, niemals den gefundenen Wert. Klar bezeichnete
synthetische Testwerte sind erlaubt.

Die Prüfung läuft verpflichtend in CI. Sie ergänzt GitHubs Secret Scanning und
Push Protection, ersetzt diese aber nicht: ungewöhnliche oder unbekannte
Secret-Formate können eine reine Musterprüfung umgehen. GitHub dokumentiert
die unterstützten Provider- und generischen Muster unter
[Supported secret scanning patterns](https://docs.github.com/en/code-security/reference/secret-security/supported-secret-scanning-patterns).

Ein tatsächlich eingechecktes Secret gilt unabhängig von einer späteren
Löschung als kompromittiert: zuerst widerrufen/rotieren, dann aus aktuellem
Stand und bei Bedarf kontrolliert aus der Historie entfernen.

## Meldung

Sicherheitsprobleme bitte nicht öffentlich als Issue mit vertraulichen Details
melden. Bis ein privater Meldeweg eingerichtet ist, die betroffene Funktion
lokal deaktivieren und die verantwortliche Person direkt informieren.
