# Wissens-API (`/api/v1`)

Alle Routen benötigen die lokale Sitzung und begrenzen Ergebnisse und
Referenzen serverseitig auf den angemeldeten Besitzer.

## Notizen

- `GET /knowledge?includeArchived=true` listet Notizen und Dokumentmetadaten.
- `POST /notes` legt eine Markdown-Notiz an.
- `GET /notes/:id` liefert die Notiz samt Versionsverlauf.
- `PATCH /notes/:id` ändert Inhalt, Verknüpfungen, Suchfreigabe oder Archivstatus.
- `DELETE /notes/:id` setzt eine nicht sichtbare Löschmarkierung.

Titel, Inhalt, Kategorie und Tags erzeugen eine neue Version. Archivierung,
Verknüpfung und Suchfreigabe ändern keine historische Inhaltsversion.

## Dokumente

- `POST /documents?fileName=…` erwartet den Binärinhalt als Request-Body und
  optional `projectId`, `studyModuleId` sowie `searchEnabled`.
- `GET /documents/:id/content` lädt den Inhalt mit `Cache-Control: private,
no-store` herunter.
- `PATCH /documents/:id` ändert Verknüpfungen, Suchfreigabe oder Archivstatus.
- `DELETE /documents/:id` markiert die Metadaten gelöscht und entfernt die
  lokale Datei.

Die maximale Dateigröße beträgt 25 MiB. Dateinamen sind Metadaten; der Server
erzeugt den internen Pfad selbst. Relative Storage-Verzeichnisse, Traversal,
symbolische Links, fremde Referenzen und fremde Besitzer werden abgelehnt.
Audit-Ereignisse enthalten nur geänderte Feldnamen, keinen Notiz- oder
Dokumentklartext.
