# Externe CalDAV-Integration

Die optionale externe CalDAV-Integration liest Ereignisse kontrolliert in den
vorhandenen LifeOS-Kalenderkern ein. Sie ist kein zweiter Kalenderkern und in
dieser ersten sicheren Ausbaustufe ausdrücklich **read-only**: LifeOS schreibt,
ändert oder löscht nichts beim externen Dienst.

## Sicherer Betriebszustand

- Ohne `INTEGRATION_SECRET_KEY` meldet die API die Integration als nicht
  verfügbar und führt keinen externen Netzwerkzugriff aus.
- Eine neu konfigurierte Verbindung bleibt deaktiviert. Erst die ausdrücklich
  bestätigte Aktivierung erlaubt Verbindungstest, Kalenderliste und Import.
- Benutzername und Passwort werden gemeinsam mit AES-256-GCM verschlüsselt.
  Die Datenbank enthält nur Chiffretext, zufälligen Initialisierungswert und
  Authentifizierungstag; der Schlüssel liegt ausschließlich in der lokalen
  Prozessumgebung.
- Zugangsdaten, Authorization-Header, externe Antwortkörper und importierte
  Kalenderinhalte erscheinen weder in API-Antworten noch in Logs oder
  Audit-Metadaten. Der Widerruf löscht Verbindung, Chiffretext, Kalenderliste
  und Zuordnungen.
- Maximal 20 Verbindungen, 100 Kalender, 500 Ereignisse und 2 MiB Antwortdaten
  je Abruf begrenzen Speicher- und Laufzeitbedarf. Netzwerkaufrufe haben fünf
  Sekunden Zeitlimit und höchstens zwei gleichursprüngliche Weiterleitungen.

Der Schlüssel besteht aus genau 32 zufälligen Byte als Base64-Wert. Für einen
bewussten lokalen Web-Test kann er beispielsweise mit `openssl rand -base64
32` erzeugt und anschließend nur lokal als `INTEGRATION_SECRET_KEY` gesetzt
werden. Er gehört nie in `.env.example`, das Repository, Browser-Storage oder
ein Backup. Ohne denselben Schlüssel bleiben wiederhergestellte externe
Zugangsdaten absichtlich unlesbar; die fachlichen LifeOS-Daten sind davon
unabhängig.

Die gebündelte Mac-App übergibt derzeit keinen Integrationsschlüssel. Dort ist
die externe Integration deshalb nachweislich nicht verfügbar und
übertragungsfrei. Eine spätere Mac-Aktivierung benötigt einen eigenen
Schlüsselbund-gestützten Schlüsselablauf und ist offen.

## REST-Vertrag

Alle Pfade liegen unter `/api/v1`, benötigen eine lokale Sitzung und prüfen den
Besitzer serverseitig.

| Methode und Pfad                                | Wirkung                                                                 |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| `GET /integrations/caldav`                      | Verfügbarkeit und ausschließlich eigene, redigierte Verbindungen lesen  |
| `POST /integrations/caldav`                     | Zugang lokal verschlüsseln; Verbindung bleibt deaktiviert               |
| `PATCH /integrations/caldav/:id`                | read-only-Verbindung ausdrücklich aktivieren oder deaktivieren          |
| `POST /integrations/caldav/:id/test`            | aktivierte Verbindung begrenzt testen                                   |
| `GET /integrations/caldav/:id/calendars`        | externe Kalender einer aktivierten Verbindung auflisten                 |
| `POST /integrations/caldav/:id/imports/preview` | externe Ereignisse lesen und gegen einen eigenen LifeOS-Kalender prüfen |
| `POST /integrations/caldav/:id/imports/commit`  | kurzlebige, konfliktfreie Vorschau in den Kalenderkern übernehmen       |
| `DELETE /integrations/caldav/:id`               | Zugang und zugehörige Integrationsdaten widerrufen                      |

Die Vorschau verfällt nach 15 Minuten und ist an Nutzer, Verbindung und
Zielkalender gebunden. Abweichende vorhandene UIDs bleiben Konflikte; der
Schreibschritt überschreibt keine Ereignisse. Erfolgreiche Importe speichern
nur die stabile Zuordnung aus externer Ressourcenadresse, externer UID/ETag und
lokaler Kalender-ID/UID. Lokale ETags und Sync-Tokens entstehen weiterhin nur
im vorhandenen Kalenderdienst.

## Netzwerk- und Inhaltsgrenzen

Produktive Zugriffe akzeptieren nur HTTPS mit Zertifikatsprüfung. URLs mit
Zugangsdaten, Fragmenten, Loopback-, privaten, Link-Local-, Multicast- oder
Cloud-Metadata-Adressen werden abgewiesen. DNS wird vor dem TLS-Aufbau geprüft;
die freigegebene Adresse wird für die konkrete Verbindung fest gebunden, um
DNS-Rebinding zu verhindern. Kalenderressourcen und Weiterleitungen müssen
denselben Ursprung behalten. Unsichere XML-Deklarationen, zu große Antworten,
zu viele Ressourcen, ungültige UTF-8-Daten und ungültige ICS-Ereignisse werden
ohne Wiedergabe des Fremdinhalts abgewiesen.

Externe Kalendernamen werden als nicht vertrauenswürdiger Text behandelt. Die
Oberfläche rendert sie nicht als HTML und speichert weder Zugangsdaten noch
Antworten in `localStorage` oder `sessionStorage`.

## Bewusst offene Funktionen

- kein Schreiben, Ändern oder Löschen beim externen CalDAV-Dienst;
- keine automatische oder im Hintergrund laufende Synchronisation;
- keine automatische Konfliktauflösung und keine Löschspiegelung;
- keine Apple-Anmeldung und keine Prüfung mit echten Apple-Zugangsdaten;
- keine Zertifizierung gegen einen produktiven Drittanbieter;
- noch kein Schlüsselbund-Ablauf für die installierte Mac-App.

Automatisierte Prüfungen verwenden ausschließlich einen synthetischen Adapter.
Sie prüfen Deaktivierung, Verschlüsselung, Besitzgrenzen, ungültige und private
URLs, Timeouts, Authentifizierungsfehler, fremde IDs, ungültige ICS-Inhalte,
Importvorschau, stabile Zuordnung, Widerruf, Mengenlimit, PostgreSQL/SQLite,
Recovery sowie Desktop-/Mobiloberfläche.
