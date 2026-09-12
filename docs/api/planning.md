# Planungs-API

Die Planungs-API unter `/api/v1/planning` arbeitet ausschließlich mit der
angemeldeten Person. Tages- und Wochenvorschläge werden lokal, deterministisch
und ohne externen KI- oder Netzwerkdienst erzeugt. Ein Vorschlag ist bis zu
einer ausdrücklichen Bestätigung unverbindlich.

## Gemeinsame Projektion

`GET /api/v1/planning?from=YYYY-MM-DD&to=YYYY-MM-DD&areas=...` liefert die
vorhandene gemeinsame Zeitprojektion. Der Zeitraum umfasst höchstens 31 Tage.
Unterstützte Bereiche sind `calendar`, `tasks`, `study`, `work`, `projects`,
`fitness` und `availability`.

Die Projektion liest nur eigene aktive Quellen. Reine Fälligkeitstage bleiben
`YYYY-MM-DD`; zeitgebundene Werte werden als ISO-Zeitpunkte zusammen mit der
Profil-IANA-Zeitzone ausgegeben. Ganztagstermine blockieren ihre lokalen Tage.
RRULE-Serien werden nur im angefragten Bereich und mit festen
Iterationsgrenzen expandiert.

## Vorschläge erzeugen und lesen

`POST /api/v1/planning/proposals` akzeptiert:

```json
{
  "view": "week",
  "from": "2032-06-14",
  "to": "2032-06-20",
  "maxSuggestions": 10
}
```

Für `day` müssen Start und Ende gleich sein; `week` umfasst höchstens sieben
Tage. `maxSuggestions` liegt zwischen 1 und 20. Die lokale Regel bewertet
offene, nicht archivierte oder gelöschte Aufgaben mit bekannter Fälligkeit und
einem Aufwand von höchstens 480 Minuten. Harte Prüfungs-, Abgabe-, Arbeits-,
Projekt- und Meilensteinfristen, Priorität und Fälligkeit bestimmen die
Reihenfolge. Verfügbarkeit wird um feste Kalendertermine, Studium, Arbeit,
bereits geplante Aufgaben und referenzierte Trainingseinheiten reduziert.

Die Antwort enthält je Vorschlag die Zielaufgabe, das konkrete Zeitfenster,
eine Begründung, aktuelle Quellenreferenzen, Unsicherheiten,
`requiresConfirmation: true` und den Status `pending`. Fehlen
Verfügbarkeit, Aufwand oder Fälligkeit oder reicht die Kapazität nicht aus,
liefert die API eindeutige Hinweise statt eines scheinpräzisen Fensters.
`externalAiUsed` ist immer `false`.

`GET /api/v1/planning/proposals?from=...&to=...` liest höchstens 100 eigene
Vorschläge. Titel und Begründung werden aus den aktuellen Quellen und
gespeicherten Regelcodes aufgebaut. Persistiert werden nur IDs,
Fingerabdrücke, Zeitfenster und Regel-/Unsicherheitscodes, keine Quellausschnitte,
Prompts oder Antworten. Derselbe Datenstand erzeugt denselben Fingerabdruck;
erneutes Laden oder Ausführen erzeugt kein Duplikat.

## Bestätigen, ablehnen und verwerfen

- `POST /api/v1/planning/proposals/:id/confirm` bestätigt genau einen
  Vorschlag.
- `POST /api/v1/planning/proposals/confirm` bestätigt eine sichtbar gewählte
  Gruppe von höchstens 20 IDs.
- `POST /api/v1/planning/proposals/:id/reject` lehnt ab.
- `POST /api/v1/planning/proposals/:id/discard` verwirft.
- `POST /api/v1/planning/proposals/:id/reopen` setzt abgelehnte, verworfene
  oder konfliktbehaftete Vorschläge wieder auf `pending`.

Die Bestätigung prüft Besitzer, Aufgabe, Quellstände, Zeitfenster und alle
gespeicherten Kalender-ETags erneut. Erst danach ruft sie den bestehenden
Aufgabenservice auf, um `scheduledStartAt` und Zeitzone zu setzen. Ein
abweichender ETag liefert HTTP `412`; es wird nichts überschrieben. Ein bereits
angewendeter Vorschlag ist idempotent. Eine Bestätigung löst keine weitere
Aufgaben-, Kalender-, Projekt- oder Fitnessänderung aus. Audits enthalten nur
Aktion, IDs, Status und Regelcodes.

## Kontrollierte lokale Automationen

`GET /api/v1/planning/automations` liefert die beiden standardmäßig
deaktivierten Arten `daily_preview` und `weekly_preview`.
`PUT /api/v1/planning/automations/:kind` setzt `enabled`, lokale Minute,
IANA-Zeitzone, bei Wochenplanung den Wochentag und höchstens 20 Vorschläge.
`POST /api/v1/planning/automations/:id/run` führt eine aktivierte Automation
manuell aus.

Der lokale Prozess prüft fällige Automationen begrenzt einmal pro Minute.
Ein eindeutiger Lauf-Schlüssel schützt täglich beziehungsweise wöchentlich vor
Mehrfachausführung, auch nach einem Neustart. Ohne ausreichende Daten wird ein
`no_data`-Lauf mit Codes, aber ohne erfundene Vorschläge gespeichert.
Automationen erzeugen ausschließlich Vorschläge und lokale Hinweise. Sie
ändern keine Fachdaten, senden keine Nachrichten und führen keine externen
Netzwerkaufrufe aus. Deaktivieren beendet weitere geplante Läufe.

## Sicherheitsgrenzen

Alle Endpunkte benötigen die lokale Sitzung; bestehende Origin-/CSRF-Regeln
gelten auch für schreibende Planungsaufrufe. IDs werden immer zusammen mit der
Sitzungs-Besitzer-ID aufgelöst. Fremde oder nicht vorhandene IDs liefern `404`.
Quellen sind pro Modell auf 500 aktive Datensätze begrenzt, Wiederholungen auf
500 Vorkommen und Vorschläge auf 20. Der externe KI-Adapter bleibt
providerunabhängig, vollständig deaktiviert und besitzt weder Schlüssel noch
Netzwerkpfad. Suchfreigabe ist keine externe Verarbeitungsfreigabe;
Dokument- und Repository-Text kann keine Planungs- oder Systemregel ändern.
