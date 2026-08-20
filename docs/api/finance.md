# Finanzvertrag

Der Finanzbereich verwaltet ausschließlich die Daten des lokal angemeldeten
Profils. Er stellt keine Bankanbindung, Steuerberechnung, Rechtsbewertung oder
externe Übertragung bereit. Finanzdaten werden weder der lokalen
quellengestützten KI als Quelle angeboten noch in Browser-Storage geschrieben.

## Datenmodell

- `FinanceCategory` trennt Einnahme- und Ausgabekategorien. Kategorien werden
  archiviert und nicht ungefragt gelöscht.
- `FinanceTransaction` speichert Buchungsdatum, Art, Kategorie, Notiz,
  Währung und einen positiven ganzzahligen Betrag in der kleinsten
  Währungseinheit. `1001` bedeutet bei EUR also `10,01 EUR`.
- Wiederholungshäufigkeit, Intervall und optionales Enddatum bereiten eine
  wiederkehrende Buchung vor. Sie erzeugen bewusst keine zukünftigen
  Buchungen automatisch.
- `FinanceBudget` speichert ein Monats- oder Jahreslimit für alle Ausgaben
  oder eine einzelne Ausgabekategorie. Monatsbudgets beginnen am ersten Tag
  des Monats, Jahresbudgets am 1. Januar.

Alle drei Modelle tragen den Besitzer direkt. Zusammengesetzte
Fremdschlüssel verhindern auch auf Datenbankebene die Zuordnung zu einer
fremden Kategorie. PostgreSQL und SQLite verwenden denselben Fachvertrag;
reine Buchungs- und Periodentage werden an der zentralen Datenbankgrenze
zwischen `DATE` und `YYYY-MM-DD` abgebildet.

## Lokale API

Alle Routen liegen unter `/api/v1`, benötigen eine gültige lokale Sitzung und
prüfen den Besitzer serverseitig:

| Methode | Pfad                        | Bedeutung                                                              |
| ------- | --------------------------- | ---------------------------------------------------------------------- |
| `GET`   | `/finance`                  | Buchungen, Kategorien, Budgets und Auswertung für einen Zeitraum laden |
| `GET`   | `/finance/export`           | Eigenen versionierten JSON-Export laden                                |
| `POST`  | `/finance/categories`       | Kategorie anlegen                                                      |
| `PATCH` | `/finance/categories/:id`   | Kategorie ändern oder archivieren                                      |
| `POST`  | `/finance/transactions`     | Buchung anlegen                                                        |
| `PATCH` | `/finance/transactions/:id` | Buchung ändern oder archivieren                                        |
| `POST`  | `/finance/budgets`          | Monats- oder Jahresbudget anlegen                                      |
| `PATCH` | `/finance/budgets/:id`      | Budget ändern oder archivieren                                         |

Die Zeitraumabfrage benötigt `from` und `to` als Kalendertage und akzeptiert
höchstens zehn Jahre. Optional kann nach einer eigenen Kategorie gefiltert
werden. Eine Antwort ist auf 10.000 Buchungen und 2.000 Budgets begrenzt. Die
API akzeptiert nur dreistellige, groß geschriebene Währungscodes und Beträge
von 1 bis 2.000.000.000 kleinsten Einheiten. Notizen sind auf 2.000 Zeichen
begrenzt.

Der Export hat `formatVersion: 1`, enthält ausschließlich eigene Daten und
wird mit `Cache-Control: private, no-store` ausgeliefert. Er ist ein lokaler
Datenauszug, kein steuerliches oder rechtliches Format.

## Auswertungen

Einnahmen, Ausgaben und Saldo werden ausschließlich mit ganzen Zahlen
summiert. Die Sparquote und Budgetauslastung werden als Basispunkte berechnet:
`7500` entspricht `75,00 Prozent`. Ohne positive Einnahmen wird keine
Sparquote erfunden. Der Monatsvergleich gruppiert Buchungen nach ihrem reinen
Buchungstag.

Eine Budgetwarnung wird sichtbar, sobald die konfigurierte ganzzahlige
Prozentschwelle erreicht ist. Überschritten ist ein Budget erst oberhalb des
Limits. Die Warnung schreibt oder verschiebt keine Buchung.

## Sicherheits- und Prüfgrenzen

- Fehlerantworten nennen weder Datenbankdetails noch fremde Datensätze.
- Audits speichern nur Aktion, Objekt-ID und geänderte Feldnamen, nicht Betrag,
  Notiz oder Exportinhalt.
- Seed- und Testdaten sind synthetisch.
- Export, Filter, Änderungen und Archivierung verwenden immer den Besitzer aus
  der serverseitig geprüften Sitzung.
- Der Finanzbereich führt keine Netzwerkzugriffe aus und ist nicht als
  KI-Quelle freigegeben.

Die automatisierten Nachweise umfassen API-Authentifizierung,
Besitzergrenzen, ungültige und große Eingaben, ganzzahlige Auswertungen,
Budgetwarnungen, wiederkehrende Vorbereitung, Export, PostgreSQL-/SQLite-
Migration, Datenübernahme sowie Backup und Restore.
