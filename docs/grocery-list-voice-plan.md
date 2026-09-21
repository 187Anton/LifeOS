# Einkaufsliste mit Spracheingabe

## Ergebnis und Status

LifeOS soll eine lokale, besitzgebundene Einkaufsliste erhalten. Mehrere frei
gesprochene oder geschriebene Lebensmittel werden in einzelne Positionen
zerlegt, deterministisch Kategorien zugeordnet und vor dem Speichern als
bearbeitbare Vorschau angezeigt. Erst eine ausdrückliche Bestätigung schreibt
die Positionen in die aktive Einkaufsliste.

Status: geplant, nicht implementiert und nicht lokal nachgewiesen. Dieses
Dokument beschreibt den vorgesehenen fachlichen und technischen Umfang. Es ist
weder ein Implementierungsnachweis noch eine öffentliche Freigabe.

## Nutzererlebnis

Ein typischer Ablauf lautet:

1. Anton öffnet die aktive Einkaufsliste und wählt „Mehrere Einträge erfassen“.
2. Er spricht oder schreibt beispielsweise „zwei Liter Milch, Käse,
   Hähnchenbrust, Chips und sechs Äpfel“.
3. LifeOS zeigt die erkannten Positionen samt Menge und vorgeschlagener
   Kategorie in einer Vorschau.
4. Anton korrigiert bei Bedarf Bezeichnung, Menge oder Kategorie.
5. Erst „Zur Liste hinzufügen“ speichert alle bestätigten Positionen atomar.
6. Die Einkaufsliste zeigt offene Positionen untereinander, gruppiert nach der
   gewählten Reihenfolge der Kategorien.

Die Spracheingabe ist eine zusätzliche Eingabemethode. Texteingabe, Bearbeiten,
Kategoriewechsel, Abbrechen und Bestätigen müssen vollständig ohne Mikrofon
funktionieren. Während einer Aufnahme zeigt die Oberfläche eindeutig an, dass
das Mikrofon aktiv ist, und bietet jederzeit Stoppen und Verwerfen an.

## Fachlicher Umfang der ersten Ausbaustufe

### Einkaufslisten

- Mindestens eine aktive Einkaufsliste pro Besitzer. Ob mehrere Listen
  gleichzeitig aktiv sein dürfen, bleibt eine offene Produktentscheidung.
- Titel, Status, Erstellungs- und Änderungszeitpunkt.
- Positionen anlegen, bearbeiten, abhaken, wieder öffnen, sortieren und mit
  Löschmarkierung entfernen.
- Offene und erledigte Positionen getrennt darstellen.
- Mehrere bestätigte Positionen in einer Datenbanktransaktion hinzufügen.
- Keine automatische Änderung anderer LifeOS-Module.

### Einkaufspositionen

Die flüchtige Vorschau hält den ursprünglichen Eingabetext nur bis zur
Bestätigung oder zum Abbruch. Eine gespeicherte Position enthält mindestens:

- normalisierte und angezeigte Produktbezeichnung,
- optionale Menge und Einheit als getrennte, validierte Werte,
- Kategorie und Sortierposition,
- Status `open` oder `completed`,
- Eingabequelle `manual`, `dictation` oder `voice`,
- Besitzer-, Listen- und Zeitstempelbezug.

Unklare Mengen bleiben als sichtbarer Text erhalten, statt stillschweigend in
einen erfundenen Zahlenwert umgewandelt zu werden. Doppelte Produkte werden
nicht automatisch zusammengeführt. LifeOS darf eine Zusammenführung
vorschlagen, sie aber erst nach Bestätigung ausführen.

### Kategorien

Die erste Version verwendet eine kleine, verständliche Grundmenge:

- Obst und Gemüse
- Brot und Backwaren
- Milchprodukte und Eier
- Fleisch und Fisch
- Tiefkühlprodukte
- Vorrat und Grundnahrungsmittel
- Getränke
- Snacks und Süßes
- Drogerie und Haushalt
- Sonstiges

Kategorien sind keine medizinische oder ernährungswissenschaftliche
Bewertung. Begriffe werden über eine versionierte lokale Aliasliste zugeordnet,
beispielsweise `Käse` zu `Milchprodukte und Eier` und `Chips` zu `Snacks und
Süßes`. Direkte Nutzerauswahl hat Vorrang. Unbekannte oder mehrdeutige Begriffe
landen sichtbar in `Sonstiges`.

Eine spätere persönliche Zuordnungsregel darf nur aus einer ausdrücklich
bestätigten Korrektur entstehen. Sie bleibt lokal, besitzgebunden, löschbar und
überschreibt keine globale Grundregel für andere Nutzerprofile.

## Abgrenzung der Spracheingabe

Die Erweiterung ist keine allgemeine Sprachsteuerung. Sie lauscht nicht im
Hintergrund, interpretiert keine freien App-Befehle und startet keine
schreibende Aktion allein durch Sprache.

Die Umsetzung erfolgt in zwei Stufen:

1. **Text und Systemdiktat:** Das Mehrfacheingabefeld funktioniert sofort mit
   Tastatur und der vom Betriebssystem angebotenen Diktierfunktion. LifeOS
   erhält dabei nur den eingefügten Text und öffnet selbst keinen Audiokanal.
   Ob das Betriebssystem die Diktierfunktion lokal oder extern verarbeitet,
   liegt außerhalb der App und darf von LifeOS nicht als lokale Verarbeitung
   behauptet werden.
2. **Eigener Mikrofonmodus:** Ein Mikrofonknopf wird erst nach einem technischen
   Nachweis aktiviert, dass die gewählte Plattform für die deutsche Sprache
   lokale Verarbeitung erzwingen kann. Wenn dieser Nachweis auf dem aktuellen
   Gerät fehlt, gibt es keinen stillen Cloud-Rückfall; die Oberfläche bleibt
   bei Text beziehungsweise Systemdiktat.

Die Web-Speech-Schnittstelle ist nicht in allen verbreiteten Browsern
verfügbar; ihre lokale Verarbeitung ist experimentell. Auch Apples Speech-
Framework muss die lokale Erkennung für Gerät und Sprache ausdrücklich
unterstützen, bevor sie erzwungen werden kann. Diese Eigenschaften werden zum
Zeitpunkt der Implementierung erneut gegen die offiziellen Quellen geprüft:

- [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)
- [MDN processLocally](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally)
- [Apple supportsOnDeviceRecognition](https://developer.apple.com/documentation/speech/sfspeechrecognizer/supportsondevicerecognition)
- [Apple requiresOnDeviceRecognition](https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/requiresondevicerecognition)

## Vorgesehene Architektur

### Datenfluss

```text
Tastatur oder lokal nachgewiesene Spracherkennung
│
▼
bearbeitbarer Text im React-Formular
│
▼
POST /api/v1/shopping-lists/parse-preview
│
├── Zerlegung in Positionen
├── Mengen- und Einheitenanalyse
└── deterministische Kategorisierung
│
▼
bearbeitbare Vorschau ohne Datenbankschreibzugriff
│
▼ ausdrückliche Bestätigung
POST /api/v1/shopping-lists/{id}/items/batch
│
▼
atomare Speicherung in PostgreSQL oder SQLite
```

Audio wird weder an die LifeOS-API übertragen noch in Datenbank, Browser-
Storage, Service-Worker-Cache, Logs, Audit oder Backup gespeichert. Die API
erhält nur den vom Nutzer sichtbaren Text. Vorschau und Bestätigung verwenden
denselben versionierten Parservertrag; der Server validiert beim Schreiben
Besitz, Kategorie, Limits und Vorschauversion erneut.

### Fachmodul und Verträge

Das Einkaufslistenmodul bleibt innerhalb des modularen Monolithen ein eigenes
Fachmodul. Es verwendet gemeinsame Authentifizierung, Fehlervertrag, Audit,
PostgreSQL-/SQLite-Fabrik, Migration, Backup und Restore. Es greift nicht direkt
auf Fitness-, Finanz-, Aufgaben- oder Kalenderdaten zu.

Vorgesehene Endpunkte unter `/api/v1`:

- `GET /shopping-lists` und `POST /shopping-lists`
- `GET`, `PATCH` und `DELETE /shopping-lists/{id}`
- `POST /shopping-lists/parse-preview` ohne Persistenz
- `POST /shopping-lists/{id}/items/batch` nach Bestätigung
- `PATCH` und `DELETE /shopping-lists/{id}/items/{itemId}`
- `GET`, `POST`, `PATCH` und `DELETE /shopping-categories`

Die genaue Request- und Response-Struktur wird bei der Implementierung in
`packages/contracts` versioniert. Grenzen für einen Vorschauaufruf sind
höchstens 100 Positionen und 10.000 Zeichen. Überschreitungen werden vor jeder
Schreibaktion verständlich abgewiesen.

### Datenmodell

Geplante Kernmodelle:

- `ShoppingList`: Besitzer, Titel, Status, Zeitstempel und Archivierung.
- `ShoppingCategory`: Besitzer oder Systemursprung, Name, Sortierung, Farbe und
  Aktivstatus.
- `ShoppingItem`: Liste, Besitzer, Bezeichnung, optionale Menge und Einheit,
  Kategorie, Status, Sortierung, Quelle und Löschmarkierung.
- `ShoppingCategoryRule`: Besitzer, normalisierter Begriff, Kategorie und
  Ursprung `default` oder `confirmed_correction`.

Alle Beziehungen enthalten einen Besitzerbezug. Kategorien und Positionen
können nicht listen- oder besitzerübergreifend referenziert werden. Jede
Schemaänderung erhält gleichwertige, versionierte PostgreSQL- und
SQLite-Migrationen sowie Import-, Backup- und Restore-Prüfungen.

## Parser und Kategorisierung

Der Parser arbeitet ohne externe KI:

1. Unicode, Leerzeichen und Großschreibung normalisieren, ohne den sichtbaren
   Originaltext zu verlieren.
2. Einträge anhand von Zeilenumbrüchen, Aufzählungen, Kommata und den Wörtern
   `und` beziehungsweise `sowie` trennen.
3. Unterstützte Mengen und Einheiten erkennen, zum Beispiel `2 Liter`,
   `500 Gramm`, `6 Stück` oder `eine Packung`.
4. Produktnamen über exakte Aliase und kontrollierte Singular-/Pluralformen
   zuordnen.
5. Persönliche, bestätigte Regel vor der globalen Grundregel anwenden.
6. Fehlende oder mehrdeutige Zuordnung als `Sonstiges` kennzeichnen.

Der Parser zeigt Unsicherheit an und erfindet keine Kategorien, Mengen oder
Produkte. Eine spätere KI-Unterstützung ist kein Bestandteil dieser Planung
und benötigt eine eigene Freigabe mit Quellen-, Datenschutz- und
Bestätigungsregeln.

## Datenschutz und Sicherheit

- Mikrofonzugriff wird erst beim bewussten Start angefragt und endet bei
  Stoppen, Abbruch, Navigation oder Fehler.
- Kein dauerhaftes oder verstecktes Zuhören.
- Kein Audio, Rohtranskript oder Produktname in Logs oder Audit-Metadaten.
- Audit speichert nur Aktion, Anzahl betroffener Positionen und geänderte
  Feldnamen.
- Die Vorschau wird nicht in `localStorage`, `sessionStorage` oder im Service
  Worker persistiert.
- Schreibende Endpunkte prüfen Sitzung, Besitzer, Eingabelimits und
  referenzierte Kategorien serverseitig.
- Export, Löschmarkierung, Backup und Restore umfassen die bestätigten
  Einkaufsdaten; verworfene Vorschauen und Audio gehören nicht dazu.
- Synthetische Lebensmittel und Kategorien werden für Seeds, Screenshots und
  Tests verwendet.

## Barrierefreiheit und Fehlerfälle

- Der Mikrofonknopf besitzt eine verständliche Beschriftung, sichtbaren Fokus,
  Statusanzeige und Tastaturbedienung.
- Farbe ist nie das einzige Merkmal für Kategorie oder Aufnahmestatus.
- Bei verweigerter Berechtigung, fehlender lokaler Erkennung oder Abbruch bleibt
  der Textweg vollständig nutzbar.
- Teiltranskripte werden als vorläufig gekennzeichnet und erst nach Ende der
  Aufnahme zur Vorschau übergeben.
- Eine Parserstörung oder ungültige Position verhindert den atomaren
  Schreibschritt; bereits vorhandene Listenpositionen bleiben unverändert.
- Leere Eingabe, nur Satzzeichen und nicht erkannte Sprache erzeugen keine
  Position.

## Arbeitspakete

### 1 Technischer Sprachtest

- Deutsche lokale Erkennung in Tauri auf dem unterstützten ARM64-Mac prüfen.
- Browserunterstützung und lokale Sprachpakete im tatsächlichen PWA-Pfad
  prüfen.
- Berechtigungen, Aufnahmeanzeige, Abbruch und fehlende Verfügbarkeit testen.
- Entscheidung dokumentieren: eigener lokaler Mikrofonmodus oder zunächst nur
  Systemdiktat.

Ergebnis: reproduzierbarer Nachweis ohne Cloud-Rückfall. Ohne diesen Nachweis
bleibt der eigene Mikrofonmodus gesperrt.

### 2 Datenmodell und Verträge

- PostgreSQL- und SQLite-Migrationen erstellen.
- Gemeinsame Verträge, Validierung, Besitzregeln und wertfreies Audit ergänzen.
- Transfer, Backup, Restore und Neustart prüfen.

### 3 Textbasierte Einkaufsliste

- Responsive Listenansicht und Mehrfacheingabefeld erstellen.
- Positionen bearbeiten, gruppieren, abhaken, wieder öffnen, archivieren und
  löschen.
- Text- und Systemdiktat-Pfad auf Desktop und Smartphone prüfen.

### 4 Vorschau und Kategorisierung

- Versionierten Parser und Grundregeln implementieren.
- Vorschau mit Mengen-, Kategorie- und Unsicherheitskorrektur erstellen.
- Bestätigte Batch-Speicherung atomar umsetzen.
- Persönliche Regeln erst nach ausdrücklicher Korrekturbestätigung ergänzen.

### 5 Eigener Mikrofonmodus

- Nur den in Arbeitspaket 1 nachgewiesenen lokalen Adapter implementieren.
- Audiokanal ausschließlich im Client beziehungsweise nativen App-Teil halten.
- Kein Netzwerk-Fallback; Textweg bei fehlender Verfügbarkeit anbieten.
- Berechtigungen und Datenschutzbeschreibung in App und Dokumentation ergänzen.

### 6 Gesamtverifikation

- Unit-Tests für Parser, Mengen, Aliase, Mehrdeutigkeit und Grenzwerte.
- API-Tests für Besitz, Vorschau ohne Persistenz, atomare Bestätigung,
  Kategorien, Archivierung und Löschmarkierung.
- PostgreSQL-/SQLite-Parität, Migration, Import, Backup und Restore.
- Responsive Browser- und Mac-App-Abläufe einschließlich Tastaturbedienung,
  verweigerter Mikrofonberechtigung und nicht verfügbarer lokaler Erkennung.
- Secret-Scan, Formatierung, Linting, Build und vollständige CI.

## Akzeptanzkriterien

- „Milch, Käse, Hähnchenbrust, Chips und Äpfel“ ergibt fünf bearbeitbare
  Vorschaupositionen in nachvollziehbaren Kategorien.
- Mengen wie „zwei Liter Milch“ bleiben mit Produkt und Einheit verbunden.
- Unbekannte Begriffe erscheinen in `Sonstiges` und bleiben korrigierbar.
- Keine Vorschau schreibt Daten; Abbruch hinterlässt keine Positionen.
- Eine Bestätigung schreibt entweder alle gültigen Positionen oder keine.
- Eine Kategoriekorrektur beeinflusst andere Einträge nur nach separater,
  ausdrücklicher Bestätigung als persönliche Regel.
- Ohne Mikrofonberechtigung oder lokale Spracherkennung funktioniert der
  vollständige Textweg weiter.
- LifeOS speichert und protokolliert kein Audio.
- Externe KI- oder Cloud-Spracherkennung ist weder erforderlich noch als
  stiller Rückfall verdrahtet.
- Funktion, Migration und Recovery sind mit synthetischen Daten auf PostgreSQL
  und SQLite automatisiert geprüft.

## Nicht Bestandteil dieser Erweiterung

- allgemeine Sprachsteuerung der App oder ständig aktives Zuhören,
- Ernährungsanalyse, Kalorienberechnung oder medizinische Empfehlungen,
- Rezepte, Essensplanung oder automatische Bestellvorschläge,
- Preisvergleich, Angebots-, Kassenbon- oder Barcode-Erkennung,
- Supermarkt- oder Lieferdienstintegration,
- gemeinsame Haushaltslisten oder Echtzeit-Mehrbenutzersynchronisation,
- automatische Käufe, Bestellungen oder externe Schreibaktionen,
- externe KI-Kategorisierung oder Cloud-Spracherkennung als Standard.

## Aufwand und Reihenfolge

Für eine repository-reife Umsetzung mit beiden Datenbankpfaden, Recovery,
responsiver Oberfläche, Tests und Dokumentation ist grob mit 15 bis 25
Entwicklungstagen zu rechnen. Davon entfallen voraussichtlich zwei bis vier
Tage auf den technischen Sprachtest. Ein eigener lokaler Mikrofonmodus kann den
Aufwand abhängig von Plattformunterstützung und Berechtigungsintegration um
weitere drei bis sieben Tage erhöhen. Diese Spanne ist eine Planungshilfe und
keine Terminzusage.

Die Umsetzung beginnt erst auf einem zweckbezogenen Branch aus dem dann
aktuellen `develop`. Jedes Arbeitspaket benötigt passende Tests, einen
Conventional Commit, einen Pull Request nach `develop` und grüne Pflicht-CI.

## Offene Produktentscheidungen

- Soll es zunächst genau eine aktive Liste oder mehrere parallele aktive
  Listen geben?
- Sollen benutzerdefinierte Kategorien bereits in der ersten Ausbaustufe
  enthalten sein?
- Darf eine bestätigte Kategoriekorrektur automatisch als persönliche Regel
  angeboten werden oder erst über eine eigene Einstellung?
- Welche Einheiten außer Stück, Packung, Gramm, Kilogramm, Milliliter und Liter
  werden benötigt?
- Soll der eigene Mikrofonmodus zuerst ausschließlich in der Mac-App angeboten
  werden, wenn dort lokale deutsche Erkennung zuverlässig nachgewiesen ist?

Keine dieser Entscheidungen darf die lokale textbasierte Kernfunktion
blockieren.
