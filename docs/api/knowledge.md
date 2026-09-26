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
- `POST /documents/:id/extraction` verarbeitet ein bereits abgelegtes Dokument
  erneut lokal und liefert den aktualisierten Extraktionszustand. Der Zugriff
  ist besitzgebunden; fremde Dokumente antworten mit `404`.
- `DELETE /documents/:id` markiert die Metadaten gelöscht und entfernt die
  lokale Datei.

Die maximale Dateigröße beträgt 25 MiB. Dateinamen sind Metadaten; der Server
erzeugt den internen Pfad selbst. Relative Storage-Verzeichnisse, Traversal,
symbolische Links, fremde Referenzen und fremde Besitzer werden abgelehnt.
Audit-Ereignisse enthalten nur geänderte Feldnamen, keinen Notiz- oder
Dokumentklartext.

## Lokale PDF-Textextraktion (Paket 7)

Die Wissensansicht zeigt je Dokument den dokumentgebundenen Extraktionszustand
und bietet „Erneut verarbeiten“ an. Der Zustand ist eine Eigenschaft des
Dokuments selbst; es entsteht kein zweiter Dokumentenspeicher und kein
separater Suchindex.

```json
{
  "extraction": {
    "status": "available",
    "version": "pdfjs-6.3.289/text-v1",
    "sourceSha256": "…",
    "current": true,
    "errorCode": null,
    "pageCount": 3,
    "storedPages": 2,
    "truncated": false,
    "extractedAt": "2033-03-01T12:00:00.000Z"
  }
}
```

- `status` ist einer von `pending`, `available`, `no_text`, `protected`,
  `unsupported`, `failed`.
- `sourceSha256` bindet die Extraktion an genau die Datei, aus der sie
  entstanden ist. `current` ist nur dann `true`, wenn diese Prüfsumme zur
  aktuellen Dateiprüfsumme passt.
- `storedPages` zählt die Seiten mit veröffentlichtem Text; die Fundstellen
  selbst bleiben am Dokument gespeichert und werden über die Suche ausgegeben.

### Grenzen und Zustände

| Grenze                       | Wert                                                       |
| ---------------------------- | ---------------------------------------------------------- |
| Eingabegröße je Dokument     | 25 MiB (bestehende Ablagegrenze)                           |
| Seiten je Lauf               | 1 000 (`truncated: true`, wenn mehr Seiten vorliegen)      |
| Extrahierten Text            | 1 000 000 Byte UTF-8 (identisch zur Textgrenze der Ablage) |
| Laufzeit                     | 20 s, danach `failed` mit `errorCode: "timeout"`           |
| Speicher des Arbeits-Threads | 256 MiB                                                    |
| Gleichzeitige Verarbeitungen | 2 je Prozess, dazu 4 feste Warteplätze                     |

- `no_text` gilt für Seiten ohne Text, typischerweise reine Scan-PDFs. Es
  entsteht nie erfundener Text.
- `protected` gilt für passwortgeschützte Dateien. Weder Inhalt noch Seiten
  werden veröffentlicht.
- `failed` gilt für beschädigte oder unlesbare Dateien; die abgelegte Datei
  bleibt in jedem Fall erhalten und herunterladbar.
- `unsupported` bleibt für Formate ohne lokalen Textleser reserviert.
- Bestehende Text-Extraktionen aus `text/plain`, `text/markdown`, `text/csv`
  und `application/json` bleiben datenerhaltend erhalten und werden als
  `legacy-text-v1` geführt. Bereits vorhandene PDFs bleiben bis zur
  Verarbeitung `pending`.

### Isolierter Parserlauf

Die Verarbeitung läuft in einem eigenen, begrenzten Worker-Thread über die
gebündelte Parserbibliothek `pdfjs-dist` (Apache-2.0). Innerhalb dieses Laufs
sind deaktiviert: Netzzugriffe (der Parser erhält ausschließlich `data`, nie
eine URL), Dokument-JavaScript (Skriptaktionen werden nie ausgewertet),
Anhänge (eingebettete Dateien werden nie gelesen) und Rendering (keine
Schrift-, Bild- oder Canvas-Pfade). Es wird ausschließlich Text gelesen; eine
Canvas- oder native Zusatzabhängigkeit wird nicht benötigt und die lokale
Mac-App funktioniert ohne zusätzliche Installation.

Bekannte, im Test beobachtete Grenze der Parserbibliothek: Text, den ein
Dokument außerhalb seiner Seitenfläche setzt, wird nicht ausgegeben. Das
betrifft fehlerhaft gesetzte Dateien; regulär umbrochener Text innerhalb der
Seitenfläche ist vollständig extrahierbar. Das Feld `truncated` meldet
zusätzlich jede Erreichung der Seiten- oder Textgrenze.

### Gleichzeitigkeit und Überlast

Die Begrenzung gilt prozessweit für alle Besitzer und für beide Einstiegspfade
(`POST /documents` und `POST /documents/:id/extraction`): Es laufen höchstens
zwei Verarbeitungen gleichzeitig, weitere Anfragen warten in einer auf vier
Plätze begrenzten Warteschlange. Ist auch diese belegt, antwortet die API
sofort mit `429 RATE_LIMITED` und der Meldung, dass die lokale
PDF-Verarbeitung ausgelastet ist; der Client entscheidet selbst über einen
erneuten Versuch. So entstehen weder beliebig viele Worker-Threads noch eine
unbegrenzte Warteschlange.

Eine abgewiesene Anfrage ist folgenlos: Beim Upload wird die bereits
geschriebene Datei wieder entfernt, es entsteht kein Dokumentdatensatz, und
eine erneute Verarbeitung lässt den bestehenden Extraktionszustand unverändert.
Ein Arbeitsplatz wird nach Erfolg, nach einem Fehler und nach einer
Zeitüberschreitung wieder freigegeben; die Besitzprüfung greift weiterhin vor
der Begrenzung, eine fehlende Sitzung antwortet mit `401`.
