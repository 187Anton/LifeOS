# Optionale GitHub-Integration

Roadmap 0.5.5 ergänzt unter `/api/v1/integrations/github` eine ausdrücklich
aktivierbare, ausschließlich lesende GitHub-Integration. Ohne den lokalen
`INTEGRATION_SECRET_KEY` meldet der Status `available: false`; es findet kein
Netzwerkzugriff statt. Der Schlüssel muss 32 Byte als Base64 oder 64
Hexadezimalzeichen enthalten.

## Sicherheitsgrenze

- Ein Token wird genau einmal vom Formular an die lokale API übertragen,
  anschließend AES-256-GCM-verschlüsselt gespeichert und nie wieder
  ausgegeben. Browser-Storage, Logs, Audit-Metadaten, Seeds und Repository
  erhalten weder Token noch externe Antwortkörper.
- Neue Verbindungen sind deaktiviert. Nur die bewusste Aktivierung erlaubt
  nachfolgende GET-Anfragen an den fest eingebauten Ursprung
  `https://api.github.com`; Schreibmethoden und frei wählbare Ziel-URLs
  existieren nicht.
- Empfohlen ist ein Fine-grained Personal Access Token für ausgewählte
  Repositories mit ausschließlich lesenden Berechtigungen für Metadata,
  Contents, Issues, Pull requests und Actions. LifeOS kann die außerhalb der
  Anwendung erteilten Rechte nicht selbst verengen.
- Antworten sind auf 2 MiB begrenzt. Ein Zugriff dauert höchstens fünf
  Sekunden, folgt höchstens zwei gleichursprünglichen Weiterleitungen und
  liefert maximal 50 Repositories sowie je 20 Issues, Pull Requests, Commits,
  Releases und CI-Läufe.
- Alle Routen prüfen Sitzung und Besitz. Fremde oder widerrufene Verbindungen
  sind nicht nutzbar. Widerruf entfernt den gespeicherten Chiffretext; das
  Token muss bei GitHub zusätzlich widerrufen werden, wenn es nicht mehr
  gelten soll.

Externe Titel, Beschreibungen und Commit-Nachrichten gelten als nicht
vertrauenswürdig. Sie werden begrenzt und nur als React-Text dargestellt;
LifeOS übernimmt daraus keine Anweisungen und führt keine Schreibaktion aus.

## Routen

| Methode  | Pfad                                                                        | Wirkung                                                                  |
| -------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `GET`    | `/api/v1/integrations/github`                                               | Verfügbarkeit und ausschließlich redigierte Verbindungen lesen           |
| `POST`   | `/api/v1/integrations/github`                                               | deaktivierte Verbindung mit Token-Chiffretext anlegen                    |
| `PATCH`  | `/api/v1/integrations/github/:connectionId`                                 | Verbindung bewusst aktivieren oder deaktivieren                          |
| `POST`   | `/api/v1/integrations/github/:connectionId/test`                            | Token und minimale Leseberechtigung über den angemeldeten Account prüfen |
| `GET`    | `/api/v1/integrations/github/:connectionId/repositories`                    | höchstens 50 sichtbare Repository-Metadaten lesen                        |
| `GET`    | `/api/v1/integrations/github/:connectionId/repositories/:owner/:repository` | Metadaten, Issues, Pull Requests, Commits, Releases und CI-Status lesen  |
| `DELETE` | `/api/v1/integrations/github/:connectionId`                                 | lokale Verbindung samt Chiffretext widerrufen                            |

Alle Antworten verwenden `Cache-Control: private, no-store`. Rate Limits
werden als verbleibende Anfragen und Rücksetzzeit angezeigt. Autorisierungs-,
Berechtigungs-, Rate-Limit-, Timeout-, Größen- und Anbieterfehler werden über
den versionierten API-Fehlervertrag ohne Stacktrace, Token, internen Pfad oder
fremden Antwortkörper gemeldet.

## Persistenz und Grenzen

Persistiert werden nur Konfiguration, Chiffretext, redigierter Status,
Accountname, Zeitpunkte und Rate-Limit-Metadaten. Repository-, Issue-, PR-,
Commit-, Release- und CI-Inhalte bleiben flüchtige Antworten. PostgreSQL und
SQLite verwenden dieselbe besitzgebundene `GitHubConnection`.

Nicht implementiert sind OAuth/GitHub-App-Anmeldung, Webhooks,
Hintergrundsynchronisation und sämtliche Schreibaktionen wie Issues,
Pull Requests, Kommentare oder Workflow-Starts. Ein produktives Token, eine
echte GitHub-Anmeldung und eine native Mac-Schlüsselbundfreigabe sind nicht
Teil des automatisierten Nachweises.
