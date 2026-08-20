# Gemeinsame Verträge

Dieses Package enthält versionierte, zwischen API und Weboberfläche geteilte
TypeScript-Verträge. Fachlogik und Datenbankzugriff gehören nicht hierher.

Aktuell definiert es:

- die API-Version `v1`,
- den Fehlervertragsstand `1`,
- stabile Fehlercodes und Validierungsdetails,
- Health- und Readiness-Antworten,
- Profil-, Einstellungs- und Sitzungsantworten,
- Kalender- und Ereignisantworten einschließlich UID, ETag und Sync-Token,
- ICS-Importvorschau, Konfliktstatus und atomaren Commit-Nachweis,
- Projekte, Wissen und lokale Suchtreffer,
- lokale Finanzkategorien, Buchungen, Budgets, Auswertungen und den
  versionierten eigenen Export,
- lokale Trainingspläne, Übungen, Einheiten, Sätze, Gewichtseinträge und
  einfache Fortschrittsauswertungen,
- ausschließlich redigierte externe CalDAV-Verbindungen, Kalenderlisten sowie
  kurzlebige read-only-Importvorschauen und Commit-Nachweise,
- ausschließlich redigierte GitHub-Verbindungen, Rate-Limit-Metadaten und
  flüchtige lesende Zusammenfassungen für Repositories, Issues, Pull Requests,
  Commits, Releases und CI-Läufe,
- Status, Quellenreferenzen, Vorschläge und Metadaten der standardmäßig
  deaktivierten quellengestützten KI-Grundlage.

Der Fehlervertragsstand wird getrennt von der Routen-Version geführt. Dadurch
kann ein Client das Format eindeutig erkennen, ohne dass jede ergänzte
Fehlerart eine neue REST-Routenversion erfordert.

Prüfung und Build:

```bash
npm run typecheck --workspace @lifeos/contracts
npm run build --workspace @lifeos/contracts
```
