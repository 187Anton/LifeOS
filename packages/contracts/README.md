# Gemeinsame Verträge

Dieses Package enthält versionierte, zwischen API und Weboberfläche geteilte
TypeScript-Verträge. Fachlogik und Datenbankzugriff gehören nicht hierher.

Aktuell definiert es:

- die API-Version `v1`,
- den Fehlervertragsstand `1`,
- stabile Fehlercodes und Validierungsdetails,
- Health- und Readiness-Antworten.
- Profil-, Einstellungs- und Sitzungsantworten.

Der Fehlervertragsstand wird getrennt von der Routen-Version geführt. Dadurch
kann ein Client das Format eindeutig erkennen, ohne dass jede ergänzte
Fehlerart eine neue REST-Routenversion erfordert.

Prüfung und Build:

```bash
npm run typecheck --workspace @lifeos/contracts
npm run build --workspace @lifeos/contracts
```
