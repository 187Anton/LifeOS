# Projekt-API (`/api/v1`)

Alle Endpunkte erfordern die lokale Sitzung und grenzen Datensätze serverseitig
über den Besitzer ab. Fremde IDs werden nicht aufgelöst. Fälligkeiten sind reine
Kalendertage im Format `YYYY-MM-DD`.

## Endpunkte

- `GET /projects?includeArchived=false` listet Projekte mit berechnetem Fortschritt.
- `POST /projects`, `GET|PATCH|DELETE /projects/:projectId` verwalten Projekte.
  `DELETE` setzt eine Löschmarkierung; `PATCH {"archived":true|false}` archiviert
  oder reaktiviert reversibel.
- `POST|PATCH|DELETE /projects/:projectId/goals[/:itemId]` verwaltet Ziele.
- `POST|PATCH|DELETE /projects/:projectId/milestones[/:itemId]` verwaltet Meilensteine.
- `POST|DELETE /projects/:projectId/task-links[/:taskId]` setzt oder löst nur
  die vorhandene Aufgabenreferenz.
- `POST /projects/:projectId/event-links` erwartet `calendarId` und `eventUid`.
  `DELETE /projects/:projectId/event-links/:calendarId/:eventUid` löst sie.

Projektverknüpfungen kopieren keine Fachdaten. Aufgabenstatus und Fälligkeit
bleiben an der Aufgabe. Beginn, Ende, stabile UID und ETag bleiben am
Kalenderereignis. Projektaktionen verändern diese Datensätze nicht automatisch.

## Fortschrittsformel

Aktive, nicht archivierte, nicht gelöschte und nicht abgebrochene Ziele,
Meilensteine und Aufgaben zählen gleichgewichtet. Ein Ziel oder Meilenstein ist
mit Status `completed`, eine Aufgabe mit Status `done` abgeschlossen.

`Prozent = gerundet(100 × abgeschlossene Einträge / alle berücksichtigten Einträge)`

Ohne berücksichtigte Einträge liefert die API `state: "no_data"` und
`percent: null`, damit kein scheinbarer Null-Prozent-Fortschritt erfunden wird.
Die Aufschlüsselung nach Quelle ist Teil der Antwort und macht die Berechnung
prüfbar.
