# Einkaufsliste API

Die Einkaufsliste ist ein lokales, besitzgebundenes Fachmodul unter
`/api/v1`. Alle Routen benötigen die lokale Sitzung.

## Vorschau und Bestätigung

`POST /shopping-lists/parse-preview` nimmt ausschließlich sichtbaren Text an:

```json
{ "text": "zwei Liter Milch, Käse und sechs Äpfel", "source": "manual" }
```

Die Antwort enthält `parserVersion`, `previewVersion` und höchstens 100
bearbeitbare Positionen. Die Eingabe ist auf 10.000 Zeichen begrenzt. Der
Endpunkt schreibt keine Einkaufsliste, Position und persönliche Regel. Audio
wird von der API nicht angenommen.

`POST /shopping-lists/{listId}/items/batch` schreibt eine bestätigte Vorschau
atomar. Der Server prüft Besitzer, aktive Liste, Versionen, Einheiten,
Kategorien und Grenzwerte erneut. Schlägt eine Position fehl, bleibt die Liste
unverändert. `rememberCategory: true` erzeugt oder aktualisiert erst dann eine
besitzgebundene persönliche Kategorieregel.

## Listen und Positionen

- `GET /shopping-lists` listet eigene nicht gelöschte Listen und bestätigte
  Positionen.
- `POST /shopping-lists` legt eine aktive Liste an. Eine zweite aktive Liste
  für denselben Besitzer liefert `409 CONFLICT`.
- `GET`, `PATCH` und `DELETE /shopping-lists/{listId}` lesen, archivieren,
  reaktivieren oder markieren eine eigene Liste als gelöscht.
- `GET /shopping-categories` liefert die zehn stabil sortierten
  Systemkategorien.
- `PATCH` und `DELETE /shopping-lists/{listId}/items/{itemId}` bearbeiten,
  erledigen, öffnen oder markieren eine eigene Position als gelöscht.

Unterstützte strukturierte Einheiten sind `piece`, `pack`, `gram`, `kilogram`,
`milliliter` und `liter`. Nicht strukturierbare Mengen bleiben als
`quantityText` sichtbar. Produkte werden nicht automatisch zusammengeführt.

## Datenschutzgrenzen

Die Vorschau lebt nur im laufenden API-Aufruf und im React-Zustand. Audio,
Teiltranskripte und Rohtranskripte gelangen weder in API, Datenbank,
Browser-Storage, Service-Worker-Cache, Logs, Audit noch Backup. Audit-Metadaten
enthalten nur Aktionen, Mengen und geänderte Feldnamen.
