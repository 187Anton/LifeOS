# Quellengestützte KI-API (`/api/v1`)

Die KI-Grundlage ist standardmäßig und im produktiven Serveraufbau vollständig
deaktiviert. Es ist kein externer Anbieter konfiguriert und es findet kein
externer API-Aufruf statt. Alle Routen benötigen die lokale Sitzung und
verwenden ausschließlich besitzgebundene Treffer aus der lokalen Suche.

## Routen

- `GET /ai/status` meldet Aktivierung, Anbieter, Verarbeitungsart und den
  unveränderlich deaktivierten externen Transfer.
- `POST /ai/queries` nimmt `query` mit höchstens 200 Zeichen und optional
  `minimumSources` von 1 bis 5 entgegen. Die Antwort enthält Status, sichtbare
  Quellen und Textausschnitte, Metadaten sowie ausschließlich
  bestätigungspflichtige Vorschläge.
- `POST /ai/interactions/:interactionId/suggestions/:suggestionId/confirm`
  bestätigt einen eigenen, noch offenen Vorschlag. Die Bestätigung erzeugt ein
  Audit-Ereignis, führt aber keine Fachänderung aus.

## Quellen- und Freigabegrenze

Der Service ruft den providerunabhängigen lokalen Suchvertrag auf. Nur eigene,
aktive und ausdrücklich mit `searchEnabled` freigegebene Inhalte gelangen in
die Quellenaufbereitung. Jeder zurückgegebene Quellenverweis enthält Typ,
stabile ID, Titel, Änderungszeit, Detailpfad und den tatsächlich geprüften
Textausschnitt. Suchfreigabe ist keine Freigabe für externe Verarbeitung; eine
solche Verarbeitung bleibt in dieser Ausbaustufe immer blockiert.

Gefundene Textstellen werden als nicht vertrauenswürdige Eingaben behandelt.
Typische Aufforderungen zum Ignorieren vorheriger Anweisungen oder zur
Übernahme eines System-Prompts erhalten `warning: untrusted_instructions` und
werden keinem Adapter übergeben. Gleichnamige Quellen mit abweichenden
Ausschnitten werden konservativ als `possible_conflict` markiert. Diese
regelbasierte Erkennung ersetzt keine inhaltliche Wahrheitsprüfung.

## Zustände

Der Vertrag unterscheidet:

- `disabled`: Funktion deaktiviert;
- `no_sources`: keine freigegebene Quelle;
- `insufficient_sources`: weniger geeignete Quellen als verlangt;
- `conflicting_sources`: mögliche Widersprüche;
- `unsafe_sources`: nur nicht vertrauenswürdige Anweisungen gefunden;
- `provider_missing`: kein freigegebener Adapter;
- `external_release_required`: externe Verarbeitung blockiert;
- `ready`: ausschließlich ein ausdrücklich aktivierter lokaler Adapter hat aus
  den angezeigten Quellen eine Antwort erzeugt.

Ohne geeignete Quellen wird keine Antwort erzeugt und kein Zustand als
verlässlich dargestellt. Der mitgelieferte deaktivierte Adapter lehnt jeden
Erzeugungsversuch ab. Ein echter externer Adapter und eine externe
Quellenfreigabe sind absichtlich nicht implementiert.

## Datensparsame Nachvollziehbarkeit

`AiInteraction` speichert keine Frage, Antwort, Quellentitel, Ausschnitte oder
Vorschlagstexte. Stattdessen werden zufällig geschützte SHA-256-Fingerabdrücke,
Quellen-IDs, Status, Zähler und technische Freigabemetadaten persistiert. Der
je Anfrage verwendete Zufallswert wird nicht gespeichert; gleiche Klartexte
lassen sich deshalb nicht über gleiche Fingerabdrücke verbinden.

Audit-Ereignisse `ai.sources.prepared` und `ai.suggestion.confirmed` enthalten
nur Status, Zähler, IDs und Aktionstypen. Logs erhalten weder Prompt- noch
Antwortklartext. Quellen und Ausschnitte sind nur Bestandteil der aktuellen
API-Antwort und bleiben im Browser flüchtiger React-Zustand.

## Bewusste Grenzen

Die Grundlage erzeugt produktiv noch keine KI-Antwort. Es gibt keine externe
Übertragung, keine automatische Änderung von Aufgaben, Terminen oder anderen
Fachdaten und keine semantische Widerspruchsprüfung. Ein späterer Anbieter
benötigt einen getrennten, geprüften Aktivierungs- und Freigabeprozess sowie
eigene Datenschutz-, Sicherheits- und Qualitätsnachweise.
