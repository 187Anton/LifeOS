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

## Lokale Textextraktion (Paket 7 und 8)

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
    "locatorKind": "page",
    "locatorCount": 3,
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
- `storedPages` zählt die Einheiten mit veröffentlichtem Text; die Fundstellen
  selbst bleiben am Dokument gespeichert und werden über die Suche ausgegeben.
- `locatorKind` benennt die Einheit der Fundstellen: `page` für
  seitenbasierte Formate, `slide` für Foliensätze und `paragraph` für
  Fließtextformate. `locatorCount` zählt die Einheiten des Formats.
- `pageCount` bleibt ausschließlich seitenbasierten Formaten vorbehalten. Für
  PPTX und DOCX ist es `null`: Eine Folie oder ein Absatz wird nie als Seite
  ausgegeben und eine Seitenzahl nie erfunden. Beide Felder sind additiv; eine
  Antwort ohne `locatorKind`/`locatorCount` bleibt weiterhin gültig.

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
Dokumentverarbeitung ausgelastet ist; der Client entscheidet selbst über einen
erneuten Versuch. So entstehen weder beliebig viele Worker-Threads noch eine
unbegrenzte Warteschlange. Dieselbe Begrenzung gilt für PDF, PPTX und DOCX;
beide Formate laufen in einem eigenen begrenzten Worker-Thread.

Eine abgewiesene Anfrage ist folgenlos: Beim Upload wird die bereits
geschriebene Datei wieder entfernt, es entsteht kein Dokumentdatensatz, und
eine erneute Verarbeitung lässt den bestehenden Extraktionszustand unverändert.
Ein Arbeitsplatz wird nach Erfolg, nach einem Fehler und nach einer
Zeitüberschreitung wieder freigegeben; die Besitzprüfung greift weiterhin vor
der Begrenzung, eine fehlende Sitzung antwortet mit `401`.

## Lokale OOXML-Textextraktion für PPTX und DOCX (Paket 8)

Zusätzlich zu PDF, `text/plain`, `text/markdown`, `text/csv` und
`application/json` werden zwei OOXML-Formate rein lokal gelesen:

| Format | MIME-Typ                                                                    | Fundstellen           |
| ------ | --------------------------------------------------------------------------- | --------------------- |
| PPTX   | `application/vnd.openxmlformats-officedocument.presentationml.presentation` | Folien (`slide`)      |
| DOCX   | `application/vnd.openxmlformats-officedocument.wordprocessingml.document`   | Absätze (`paragraph`) |

`version` lautet für PPTX `ooxml-zip-v1/pptx-slides-v1` und für DOCX
`ooxml-zip-v1/docx-paragraphs-v1`. Beide Formate bleiben in derselben
dokumentgebundenen Ablage wie Paket 7: Es entsteht kein zweiter Speicher, kein
Schattenindex und keine neue Datenbankstruktur. `POST /documents`,
`POST /documents/:id/extraction`, Suchfreigabe, Archivierung, Löschung,
Modulfilter und die Prüfsummenbindung gelten unverändert.

### Fundstellen

- **PPTX:** Nummeriert wird über die Beziehungsreihenfolge der Präsentation
  (`ppt/_rels/presentation.xml.rels`), nicht über Dateinamen – ein
  `slide10.xml` vor `slide2.xml` ändert die Nummerierung nicht. Gelesen wird
  ausschließlich sichtbarer Folientext innerhalb der Folienfläche. Notizfolien,
  Kommentare und ausgeblendete Teile werden nicht als Folientext ausgegeben.
- **DOCX:** Gelesen wird der Haupttext in Dokumentreihenfolge. Die Absatznummer
  ist stabil und zählt auch leere Absätze mit; Absätze ohne Text liefern keinen
  Inhalt, bleiben aber in der Zählung. Erkennbare Überschriften werden als
  Abschnittsangabe übernommen.
- **Keine erfundenen Seitenzahlen:** Für DOCX und PPTX ist `pageCount` `null`
  und die Suche gibt weder `page` noch `pages` aus. Header, Footer, Fußnoten
  und Kommentare werden nicht stillschweigend ergänzt.

### Archivgrenzen vor dem Entpacken

OOXML-Dateien sind ZIP-Archive. Alle Grenzen greifen gestaffelt und **bevor**
entpackt wird:

| Grenze                            | Wert                               |
| --------------------------------- | ---------------------------------- |
| Eingabegröße je Dokument          | 25 MiB (bestehende Ablagegrenze)   |
| ZIP-Einträge                      | 4 000                              |
| Archiv komprimiert                | 25 MiB                             |
| Einzelner Eintrag entpackt        | 128 MiB                            |
| Alle Einträge zusammen entpackt   | 256 MiB                            |
| Kompressionsverhältnis            | 1 000                              |
| Einzelner geparster XML-Teil      | 16 MiB                             |
| Alle geparsten XML-Teile zusammen | 32 MiB                             |
| Veröffentlichte Fundstellen       | 1 000 (`truncated: true` bei mehr) |
| Veröffentlichter Text             | 1 000 000 Byte UTF-8               |
| Abschnittsüberschrift             | 300 Zeichen                        |
| Speicher des Workers              | 512 MiB (harte V8-Obergrenze)      |
| Laufzeit                          | 20 s, danach `failed`/`timeout`    |

Abgelehnt werden: Pfadtraversal, absolute Pfade, doppelte Einträge, Symlinks,
verschlüsselte Einträge, beschädigte Archive, unerwartete Inhalte ohne
`[Content_Types].xml` sowie jede Überschreitung der genannten Grenzen. Makros
und externe Beziehungen werden nie ausgeführt und nie abgerufen.

### Begrenzter Workerlauf und harte Frist

Entpacken und Parsen sind blockierend. PPTX und DOCX laufen deshalb nicht im
API-Prozess, sondern in einem eigenen Worker-Thread mit harter V8-Obergrenze
(512 MiB; die Grenze des PDF-Workers bleibt bei 256 MiB). Die höhere Grenze
trägt dem zusätzlichen Bedarf von OOXML Rechnung: Im Thread liegen neben dem
Eingabepuffer die entpackten XML-Teile und deren Objektbäume, und ein einzelner
Teil von 16 MiB wächst beim Parsen deutlich über seine Bytegröße hinaus. Die
Archivgrenzen greifen vor jedem Entpacken, sodass der Spitzenbedarf nach oben
begrenzt bleibt.

Die 20-Sekunden-Frist wird **im aufrufenden Prozess** durchgesetzt, nicht im
Thread: Läuft sie ab, beendet der Aufrufer den Thread und meldet `failed` mit
`errorCode: "timeout"`. Eine blockierende Einzeloperation kann sich dieser Frist
deshalb nicht entziehen. Fehler, Abbruch und Zeitüberschreitung beenden den
Thread in jedem Ausgang und geben den Arbeitsplatz der gemeinsamen Begrenzung
erst nach dem tatsächlichen Threadende frei.

Zwei Folgezustände sind ausdrücklich benannt: Erreicht ein Lauf die
Speichergrenze des Threads, endet genau dieser Lauf als `failed` mit
`errorCode: "memory_limit"`, während der API-Prozess arbeitsfähig bleibt. Fehlt
im gebündelten Laufzeitpaket die Workerdatei, meldet der Upload
`failed`/`worker_unavailable`, statt still im API-Prozess zu verarbeiten.

### Grenzen und Zustände

- `.pptm`, `.docm`, jede Datei mit `vbaProject.bin` und jede Datei, deren
  Inhaltstypdatensatz Makroinhalte ankündigt, werden als `unsupported` mit
  `errorCode: "macro_present"` geführt. Die Datei bleibt gespeichert und
  herunterladbar, liefert aber keinen Inhalt. Der Makropfad wird erkannt, bevor
  ein Archivteil gelesen wird.
- `no_text` gilt für Pakete ohne sichtbaren Text, etwa leere Foliensätze.
- `failed` gilt für beschädigte oder unlesbare Pakete mit `damaged_zip`,
  `invalid_zip`, `invalid_xml`, `dtd_rejected`, `zip_size_limit`,
  `unexpected_content` oder `parser_error`; die abgelegte Datei bleibt erhalten.
- DTD- und Entity-Angaben in OOXML-XML werden abgelehnt. Der Parser arbeitet
  ausschließlich lokal auf bereits gelesenen Bytes und führt keine
  Netzwerkzugriffe aus; externe Beziehungen werden ignoriert.
- `.docx` und `.pptx` benötigen keine zusätzliche Systeminstallation und keine
  native Zusatzabhängigkeit; die Mac-Sidecar-App bleibt unverändert
  installierbar.
