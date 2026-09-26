# Lokale Such-API (`/api/v1`)

`GET /search?q=<suchbegriff>` benötigt die lokale Sitzung. `q` darf höchstens
200 Zeichen enthalten. Eine leere oder nur aus Symbolen bestehende Anfrage
liefert erfolgreich eine leere Trefferliste.

Der optionale Parameter `studyModuleId` aktiviert die Modulsuche. Er beschränkt
die Treffer auf Objekte mit genau diesem Studienmodulbezug und umfasst die
bereits freigegebenen Modul-, Studien-, Notiz- und Dokumentquellen. Aufgaben
bleiben normale Fachfilter und erhalten über den Modulbezug keine automatische
Suchfreigabe. Ohne den Parameter bleibt die Suche unverändert
bereichsübergreifend.

## Freigabe und Besitz

Die API lädt ausschließlich Datensätze des angemeldeten Besitzers, die aktiv,
nicht gelöscht und ausdrücklich mit `searchEnabled` freigegeben sind:

- Projekte sowie deren aktive Ziele und Meilensteine;
- Notizen;
- Dokumentmetadaten und – bei hashaktueller Extraktion – deren seitenbezogener
  Text;
- Studienmodule sowie deren aktive Studieneinträge;
- berufliche Projekte.

Ziele, Meilensteine und Studieneinträge erben die Suchfreigabe ihrer führenden
Quelle. Eine aufgehobene Freigabe oder Archivierung wirkt bei der nächsten
Anfrage unmittelbar. Nicht freigegebene, fremde, archivierte und gelöschte
Inhalte werden bereits vor der Trefferbewertung ausgeschlossen.

## Antwort

Jeder Treffer enthält:

- `title` und `contentType`;
- `source` mit Typ, stabiler ID und Titel der führenden Quelle;
- `updatedAt`;
- einen begrenzten `snippet` und `matchReason` (`title`, `content` oder
  `metadata`);
- `detailPath` zum Fachobjekt;
- `page` und `pages` mit den betroffenen Seiten eines seitenbezogenen
  Dokuments; `null` beziehungsweise `[]` bei Formaten ohne Seitenangabe;
- `ownerId` und den bestätigten Freigabestatus `searchEnabled: true`.

Die Oberfläche hält Anfrage und Treffer nur im React-Zustand. Sie schreibt
keine persönlichen Suchdaten in `localStorage`, `sessionStorage` oder den
Service-Worker-Cache.

## Suchstrategie

PostgreSQL und SQLite verwenden denselben providerunabhängigen Vertrag. Die
Suche normalisiert Groß-/Kleinschreibung und Akzente, zerlegt die Anfrage in
Unicode-Buchstaben und -Zahlen und verlangt, dass alle Suchwörter im Titel,
Inhalt oder in Metadaten vorkommen. Titel werden höher als Inhalt und Metadaten
gewichtet; eine vollständige Phrase erhält einen zusätzlichen Rangvorteil.
Sortierung und Höchstzahl von 50 Treffern sind deterministisch.

Die erste Ausbaustufe verwendet bewusst keinen externen Dienst und keinen
persistierten Schattenindex. Dadurch sind Freigabe- und Löschänderungen sofort
wirksam und beide Datenbankanbieter liefern fachlich vergleichbare Ergebnisse.

## Seitentreffer

Enthält ein Dokument seitenbezogene Fundstellen, muss ein Suchbegriff auf einer
einzigen Seite vollständig vorkommen. Treffer, deren Wörter über mehrere Seiten
verteilt sind, ergeben keinen Seitentreffer. Der Ausschnitt stammt aus genau der
zuerst genannten Seite, und die Liste der Seiten ist auf 20 Einträge begrenzt.
Damit nennt jeder PDF-Treffer die betroffene Seite, ohne einen zusätzlichen
Index aufzubauen.

## Lokale Dokumenttextextraktion

Beim Upload werden höchstens 1 MiB aus `text/plain`, `text/markdown`,
`text/csv` und `application/json` als valides UTF-8 gelesen und auf eine
Million Zeichen begrenzt. Binärformate, größere Inhalte, ungültiges UTF-8 und
Text mit Nullbytes werden nicht interpretiert; ihre freigegebenen Metadaten
bleiben suchbar. Es findet keine externe Übertragung statt.

PDF-Dokumente werden lokal seitenbezogen verarbeitet (siehe
[`Wissens-API`](knowledge.md)). Für die Suche gilt dabei eine bewusst strenge
Regel: Dokumentinhalte werden ausschließlich aus einer eigenen, aktiven,
freigegebenen und zur aktuellen Dateiprüfsumme passenden Extraktion verwendet.
Eine ausstehende, fehlgeschlagene, geschützte, textfreie oder veraltete
Extraktion liefert keinen Inhalt – auch keinen zwischengespeicherten. Das
Dokument bleibt über seine Metadaten auffindbar, damit der Altbestand nach der
Migration nicht verschwindet. Der Text einer veralteten Extraktion erzeugt
dadurch nie einen stillen Falschtreffer.

## Bewusste Grenzen

Die Suche besitzt noch keine Wortstammbildung, Synonyme, Tippfehlertoleranz,
OCR oder Extraktion aus Office-Dateien. Suchtreffer sind
keine automatisch verwendeten KI-Quellen. Die
[`quellengestützte KI-Grundlage`](ai.md) prüft Freigabe und Eignung nochmals,
weist Quellen sichtbar aus und bleibt standardmäßig deaktiviert.
