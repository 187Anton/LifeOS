# Roadmap

Die Roadmap beschreibt die fachliche Reihenfolge. Jede Unteraufgabe wird als
kleines GitHub-Issue umgesetzt und erhält einen eigenen Branch aus `develop`,
einen Pull Request, passende Tests und eine kurze Dokumentation.

## Arbeitsprinzip

Eine Unteraufgabe gilt erst als abgeschlossen, wenn:

- die Akzeptanzkriterien erfüllt sind,
- automatisierte Tests und lokale Prüfungen erfolgreich sind,
- Datenschutz-, Migrations- und Rückwärtskompatibilitätsfolgen geprüft sind,
- die Dokumentation bei dauerhaften Entscheidungen aktualisiert wurde.

Die Phasen bauen aufeinander auf. Innerhalb einer Phase werden die Punkte von
oben nach unten bearbeitet, sofern ein Issue keine andere Abhängigkeit nennt.

## 0.1 Fundament

Ziel: Eine lokal startbare, testbare Basis mit einem ersten nutzbaren Kalender.

### 0.1.1 Repository und Arbeitsweise

- Repository-Struktur, `AGENTS.md`, README und CONTRIBUTING festlegen.
- Conventional Commits, `develop`-Branch, Pull Requests und CI dokumentieren.
- GitHub-Regeln, Labels, Milestones, Project und Ansichten einrichten.

Abschlusskriterium: Eine kleine Beispieländerung kann über Branch, PR, CI und
Merge nach `develop` durchgeführt werden.

### 0.1.2 Lokale Entwicklungsumgebung

- `.env.example` prüfen und lokale `.env` anlegen.
- Docker Compose mit PostgreSQL starten.
- Datenbank-Healthcheck und Verbindungsprüfung dokumentieren.
- Lokale Daten, Volumes und sensible Konfiguration von Git ausschließen.

Abschlusskriterium: Ein neuer Rechner kann die lokale Datenbank reproduzierbar
starten, ohne echte Zugangsdaten zu benötigen.

### 0.1.3 Datenbank und Prisma

- Prisma-Client und Datenbankpaket anbinden.
- Erste Migration für Benutzer, Kalender, Ereignisse und Audit-Ereignisse
  erstellen.
- Synthetische Seed-Daten für lokale Entwicklung ergänzen.
- Migrationen und Datenbank-Backup-Regeln dokumentieren.

Abschlusskriterium: Migration und Seed laufen lokal erfolgreich; ein Test kann
ein Kalenderereignis speichern und wieder lesen.

### 0.1.4 API-Grundgerüst

- Node.js-/TypeScript-Server mit Konfigurationsvalidierung starten.
- Health- und Readiness-Endpunkt bereitstellen.
- Einheitliches Fehlerformat und API-Versionierung festlegen.
- Datenbankzugriff über eine zentrale, testbare Schicht anbinden.
- Keine öffentliche Registrierung; zunächst ein lokaler persönlicher Benutzer.

Abschlusskriterium: Die API startet lokal, meldet Datenbankstatus und liefert
für ungültige Eingaben nachvollziehbare Fehler.

### 0.1.5 Nutzerprofil und Einstellungen

- Persönlichen Benutzer und Basiseinstellungen verwalten.
- Zeitzone `Europe/Berlin` und Währung `EUR` unterstützen.
- Einstellungen lesen und ändern können.
- Änderungen nachvollziehbar protokollieren, ohne Secrets zu speichern.

Abschlusskriterium: Zeitzone und persönliche Grundeinstellungen werden über
API und Datenbank gespeichert und getestet.

### 0.1.6 Kalender-Kernmodell

- Kalender anlegen, auflisten und als primär markieren.
- Ereignisse erstellen, lesen, ändern und löschen.
- Ganztägige Ereignisse, Zeitzonen, Beschreibung und Ort unterstützen.
- Stabile UID, ETag, Änderungszeitpunkt und Löschmarkierung verwenden.
- Wiederholungsregeln zunächst speichern und sicher ausgeben; komplexe
  Bearbeitung erst nach einem belastbaren Testkonzept ergänzen.

Abschlusskriterium: Kalenderereignisse können über die API vollständig und
ohne Verlust ihrer UID oder ETag-Information verwaltet werden.

### 0.1.7 CalDAV-Server

- CalDAV-Authentifizierung für den lokalen persönlichen Benutzer einrichten.
- Principal- und Calendar-Home-Discovery bereitstellen.
- Kalenderressourcen und Ereignisressourcen über `PROPFIND`, `REPORT`, `GET`,
  `PUT` und `DELETE` unterstützen.
- ETags und Sync-Tokens korrekt zurückgeben.
- iCalendar-Daten mit stabilen UIDs und Zeitzonen erzeugen.
- Kompatibilität mit rückwärtskompatiblen Clients sichern.
- Verbindung aus Apple Kalender im lokalen Netzwerk testen.

Abschlusskriterium: Ein Kalender kann ohne LifeOS-App in Apple Kalender
hinzugefügt werden; ein angelegtes Ereignis ist in beiden Richtungen sichtbar.

### 0.1.8 Weboberfläche und PWA-Grundlage

- React-/TypeScript-Webanwendung starten.
- Responsive Layout, Navigation und Lade-/Fehlerzustände erstellen.
- Kalenderliste und einfache Ereignisansicht anzeigen.
- Ereignisse erstellen und bearbeiten können.
- PWA-Manifest und installierbare Offline-Shell vorbereiten.
- Keine sensiblen Daten dauerhaft im Browser-Storage ablegen.

Abschlusskriterium: Die Weboberfläche kann lokal gestartet werden und zeigt
die über die API gespeicherten Kalenderdaten auf Desktop und Handy an.

### 0.1.9 Fundament absichern

- API-, Datenbank-, Web- und CalDAV-Tests ausführen.
- Apple-Kalender-Test und lokale Startanleitung dokumentieren.
- Migration, Backup und Wiederherstellung mit synthetischen Daten prüfen.
- Bekannte Grenzen und offene Kompatibilitätsfragen dokumentieren.

Abschlusskriterium: Phase 0.1 kann als stabile lokale Demo reproduziert werden.

Der verbindliche Abschlussnachweis besteht aus `npm run security:secrets`,
`npm run db:verify:recovery`, der vollständigen Root-/Workspace-Suite sowie der
in [`docs/foundation-verification.md`](foundation-verification.md)
dokumentierten lokalen Demo und Apple-Kalender-Checkliste. Issue #17 und dessen
CI-Lauf bilden das technische Gate für den anschließenden Pull Request von
`develop` nach `main`.

## Frühes Querschnittsziel: lokale Mac-App

Ziel: LifeOS früh als installierbare lokale Mac-App ausrichten, ohne die
gemeinsame React-Weboberfläche, den separaten Browserbetrieb oder den
vorhandenen API-/CalDAV-Kern aufzugeben. Dieses Querschnittsziel hat vor den
noch nicht begonnenen Produktphasen 0.4 und 0.5 Priorität.

Der aktuelle Stand umfasst die abgeschlossenen Pakete M0 bis M5 sowie den
lokalen Teil von M6: Planung, vollständiges SQLite-Schema, API-/CalDAV-Parität,
Import und Recovery, eine gebaute und gestartete Tauri-`.app`, ein geprüftes
ARM64-DMG sowie Ersteinrichtung, Update, Rollback, Backup, Restore und
Deinstallation sind nachgewiesen. Ein öffentlich freigegebener
Mac-Installationsweg ist das noch nicht, weil Developer-ID, Notarisierung und
der Gegencheck auf einem zweiten sauberen Mac fehlen. Die detaillierte
Bestandsaufnahme, Entscheidungen, Risiken und
Akzeptanzkriterien stehen in
[`docs/mac-desktop-spike-plan.md`](mac-desktop-spike-plan.md). Der Fortschritt
und die tatsächlich ausgeführten Nachweise werden fortlaufend in
[`docs/mac-desktop-migration-log.md`](mac-desktop-migration-log.md)
dokumentiert.

### D1 SQLite- und lokale Betriebsprüfung

- Prisma-7.8-Unterstützung für SQLite mit einem getrennten Schema- und
  Migrationspfad prüfen.
- Benutzer, Einstellungen, Kalender, zeitgebundenes Ereignis, Ganztag,
  Zeitzone, Audit und stabile Synchronisationswerte repräsentativ migrieren.
- PostgreSQL-spezifische Typen, Arrays, Enums, Constraints und Indizes bewusst
  ersetzen; bestehende PostgreSQL-Migrationen nicht umschreiben.
- Das gebaute Node-/Express-Backend ohne Docker gegen die lokale SQLite-Datei
  starten und denselben `/api/v1`-Vertrag im Browser verwenden.

Abschlusskriterium: Migration, Seed, API-Start, Neustart und Datenvergleich
funktionieren mit synthetischen Daten ohne Docker; offene Abweichungen sind
konkret dokumentiert.

### D2 Kalender-, CalDAV- und Recovery-Parität

Kalender, CalDAV und der Recovery-Anteil sind mit M3 und M4 automatisiert
abgeschlossen. Der physische Apple-Kalender-Handtest bleibt bis zum
LAN-fähigen App-Prototyp ausdrücklich offen.

- REST und CalDAV gegen denselben SQLite-Kalenderkern prüfen.
- Lesen, Erstellen, Ändern, Löschen, ETag-Konflikt, Sync-Token, Tombstones,
  Zeitzonen, Ganztag, Wiederholung und Erinnerung automatisiert testen.
- SQLite-Backup über die Online Backup API samt Prüfsumme erstellen und immer
  zuerst in ein neues Ziel wiederherstellen.
- Datenbank und lokales Dokumentverzeichnis als gemeinsames Recovery-Paket
  behandeln.

Abschlusskriterium: Ein Recovery-Test erhält IDs, UIDs, ETags, Sync-Versionen,
Zeitzonen, Ganztagsgrenzen und Dokumente; ein veralteter ETag überschreibt keine
neueren Daten.

### D3 Tauri- und Sidecar-Prototyp

Dieser Prototyp ist mit M5 auf macOS ARM64 abgeschlossen. Die App bündelt eine
per SHA-256 geprüfte offizielle Node-22-Laufzeit, wartet vor dem Fensterstart
auf die SQLite-Readiness und verwendet für Web, API und CalDAV denselben
dynamischen Loopback-Ursprung. Daten, Dokumente, Backups und Logs liegen in den
anwendungsspezifischen macOS-Verzeichnissen mit privaten Dateirechten.

- Tauri 2 als Mac-Hülle für dieselbe gebaute React-Oberfläche anlegen.
- Das vorhandene Node-/Express-Backend als reproduzierbaren Sidecar paketieren,
  starten, auf Readiness prüfen und geordnet beenden.
- Datenbank, Dokumente, Konfiguration, Backups und Logs in den vorgesehenen
  anwendungsspezifischen macOS-Verzeichnissen speichern.
- Portkonflikte, Sidecar-Absturz und fehlgeschlagenen Datenbankstart
  verständlich anzeigen.
- CalDAV erreichbar halten, solange die Mac-App beziehungsweise der lokale
  Dienst läuft; LAN-Bindung für andere Apple-Geräte bleibt eine bewusste
  Betriebsart.

Abschlusskriterium: Der Prototyp startet auf dem zunächst unterstützten Mac die
Weboberfläche und das lokale Backend ohne Docker und ohne global installiertes
Node; der Browserbetrieb bleibt separat möglich.

### D4 Installations- und Update-Nachweis

- `.app` und `.dmg` reproduzierbar bauen und mit synthetischen Daten prüfen.
- Erststart, Neustart, Backup, Restore, Update und Deinstallation testen.
- Signierung, Notarisierung, unterstützte Mac-Architekturen und Updateverfahren
  als geprüfte Release-Gates dokumentieren.
- Docker nur noch als Entwicklungs-, Test- und Wartungswerkzeug dokumentieren;
  die README erst nach einem tatsächlich erfolgreichen Ablauf umstellen.

Abschlusskriterium: Ein sauberer unterstützter Mac installiert und startet
LifeOS ohne Docker; ein Update erhält lokale Daten und CalDAV-Identitäten.
Nicht geprüfte Release-Gates bleiben ausdrücklich offen.

Lokaler M6-Stand: Das DMG und sämtliche Datenhaltungsabläufe des
Abschlusskriteriums sind auf dem Entwicklungs-Mac mit isolierten App-, Daten-
und Laufzeitpfaden erfolgreich geprüft. M6 ist damit lokal erfolgreich; die
öffentliche Produktfreigabe mit Developer-ID, Notarisierung und Zweit-Mac-Test
ist ausdrücklich auf ein späteres Arbeitspaket verschoben.

### D5 Installierbares lokales Release

Ziel: den geprüften lokalen Mac-App-Pfad als verständlich installierbares,
versioniertes Release bereitzustellen, ohne den Local-First-Betrieb, den
Browserbetrieb oder die gemeinsame Weboberfläche aufzugeben.

- Reproduzierbares Release-Artefakt mit Anwendung, Docker-Compose-Konfiguration
  und verständlichen Startskripten erzeugen.
- Unterstützte Betriebssysteme und notwendige Voraussetzungen im Release und
  in der README eindeutig nennen.
- Einen README-Button erst auf ein tatsächlich veröffentlichtes und geprüftes
  GitHub-Release verlinken.
- Nach dem lokalen Start einen Installationsbutton für die vorhandene PWA
  anbieten und browserspezifische Alternativen dokumentieren.
- Installation, Update, Neustart, Backup und Deinstallation mit synthetischen
  Daten prüfen; normale Updates dürfen lokale Daten nicht löschen.
- Die öffentliche Mac-Freigabe mit Developer-ID, Notarisierung, unterstützten
  Architekturen und Gegencheck auf einem zweiten sauberen Mac als eigene,
  nachweisbare Release-Gates behandeln.

Abschlusskriterium: Ein unterstützter Rechner kann LifeOS anhand des
Release-Artefakts und der README reproduzierbar lokal starten, als PWA
installieren, aktualisieren und ohne Verlust der lokalen Daten neu starten.

## 0.2 Organisation

Ziel: Aufgaben und Kalender im Alltag miteinander verbinden.

### 0.2.1 Aufgabenmodell

- Aufgaben mit Titel, Beschreibung, Status, Priorität und Fälligkeit anlegen.
- Aufgaben archivieren, wieder öffnen und löschen können.
- Statusänderungen und relevante Änderungen protokollieren.

Umsetzungsnachweis: Issue #32 führt das besitzgebundene Aufgabenmodell,
versionierte Migrationen, synthetische Seed-Daten und `/api/v1/tasks` mit
Unit-, API- und Datenbanktests ein. Projektverwaltung bleibt in 0.4; 0.2.1
stellt dafür nur einen besitzgesicherten Relationsanker bereit.

### 0.2.2 Aufgabenoberfläche

- Aufgabenliste, Detailansicht und Bearbeitungsformular erstellen.
- Nach Status, Priorität und Fälligkeit filtern und sortieren.
- Mobile Bedienung und verständliche leere Zustände ergänzen.

Umsetzungsnachweis: Issue #33 ergänzt die gemeinsame React-PWA um responsive
Aufgaben-Navigation, vollständiges Erstellen und Bearbeiten, Statusaktionen,
Archivierung, bestätigtes Soft-Delete sowie kombinierbare Suche und Filter.
Unit- und Playwright-Tests prüfen den zentralen Ablauf auf Desktop und
Smartphone einschließlich Neuladen und fehlender Browserpersistenz.

### 0.2.3 Kalenderansichten

- Tages-, Wochen-, Monats- und Agendaansicht ergänzen.
- Ereignisse aus dem internen Kalender anzeigen.
- Zeitzonen und Ganztägigkeit konsistent darstellen.

Umsetzungsnachweis: Issue #34 ergänzt Zeitraum-Navigation, flüchtige
RRULE-Projektionen sowie vollständiges Termin-CRUD in der gemeinsamen
React-PWA. UID, ETag, Zeitpunkte, Ganztagsdaten und Serienregel bleiben im
vorhandenen Kalenderkern führend. Unit-, Playwright-, REST- und
CalDAV-Integrationstests prüfen Ansichten, Zeitzonen, Ganztägigkeit,
Serienvorkommen, Löschung und veraltete ETags.

### 0.2.4 Aufgaben-Termin-Verknüpfung

- Aufgaben mit Ereignissen verknüpfen.
- Verknüpfungen in beiden Detailansichten anzeigen.
- Verknüpfungen wieder entfernen und nicht verfügbare Objekte anzeigen.

Umsetzungsnachweis: Issue #35 ergänzt eine besitzgebundene, idempotente
Beziehung ohne kopierte Fachdaten. Aufgabenstatus und Fälligkeit bleiben im
Aufgabenmodell, Terminbeginn und -ende im Kalenderkern. API-, Datenbank-,
Unit- und Playwright-Tests prüfen Verknüpfung, Aufhebung, Besitzgrenzen,
Soft-Delete und ausbleibende Seiteneffekte.

### 0.2.5 Dashboard

- Offene Aufgaben, heutige Termine und überfällige Aufgaben zusammenfassen.
- Dashboard vollständig aus lokalen Daten berechnen.
- Ladezeit und verständliche Fehlerzustände testen.

Umsetzungsnachweis: Issue #36 ergänzt einen geschützten, rein lesenden
Dashboard-Snapshot aus PostgreSQL und eine responsive Übersicht. Profilzeitzone
und Snapshot-Zeitpunkt führen die Bestimmung von „heute“ und „überfällig“;
Serientermine bleiben flüchtige Projektionen. Unit-, API-, Datenbank- und
Playwright-Tests prüfen echte gespeicherte Daten, Besitzgrenzen,
Schnellaktionen, Aktualisierung, Leer- und Fehlerzustände sowie Desktop und
Smartphone.

Abschlusskriterium: Ein typischer Tag kann vollständig über Aufgaben,
Kalender und Dashboard geplant werden.

## 0.3 Studium und Arbeit

Ziel: Studien- und Arbeitsinformationen nachvollziehbar verwalten.

### 0.3.1 Studium

- Studiengänge und Module verwalten.
- Prüfungen, Abgaben und Fristen erfassen.
- Lernfortschritt und Status pro Modul anzeigen.

Umsetzungsnachweis: Issue #45 ergänzt ein bewusst schlankes Studienmodell für
Studienabschnitte, Module sowie Lehrveranstaltungen, Prüfungen, Abgaben und
Lernzeiten. Reine Prüfungstage und Abgabefristen bleiben `DATE`-Werte;
zeitgebundene Einträge verwenden `TIMESTAMPTZ` plus IANA-Zeitzone. Optionale
Aufgaben- und Kalenderbezüge referenzieren die vorhandenen Fachobjekte ohne
Kopie oder automatische Änderung. Besitzprüfung, Audit-Ereignisse,
Archivierung, API und responsive Oberfläche werden durch Datenbank-, API-,
Unit- und End-to-End-Tests abgesichert.

### 0.3.2 Arbeit und Praxis

- Berufliche Kontexte und optionale Organisationen flexibel erfassen.
- Projekte, Ziele, Fristen, Notizen und vorhandene Arbeitsaufgaben zuordnen.
- Geplante und tatsächliche Arbeitszeit getrennt und nachvollziehbar berechnen.

Umsetzungsnachweis: Issue #43 ergänzt besitzgebundene Arbeitskontexte,
berufliche Projekte mit Ziel und Frist, reine Verknüpfungen zum bestehenden
Aufgabenmodell sowie geplante und tatsächliche Zeitblöcke. Zeitblöcke speichern
`TIMESTAMPTZ` plus IANA-Zeitzone und geben ihre berechnete Dauer ausdrücklich
in Minuten zurück. API- und Datenbankregeln verhindern fremde Referenzen;
Audit-Metadaten enthalten nur geänderte Feldnamen. Die responsive Oberfläche
bietet Bereichs-, Status- und Zeitraumfilter, ohne Filter oder persönliche
Antworten im Browser zu persistieren. Arbeitgeber-, GitHub- und externe
Zeiterfassungsintegrationen bleiben bewusst außerhalb dieser Phase.

### 0.3.3 Gemeinsame Zeitplanung

- Studien- und Arbeitstermine in Kalenderansichten integrieren.
- Konflikte und Überschneidungen sichtbar machen.
- Berechnungen mit festen Zeitzonen und dokumentierten Regeln testen.

Umsetzungsnachweis: Issue #44 ergänzt den geschützten Endpunkt
`/api/v1/planning`, eine gemeinsame Wochen- und Agendaansicht sowie
besitzgebundene wöchentliche Verfügbarkeitsfenster. Die Planung projiziert
Kalender, Aufgaben, Studium und Arbeit ohne Kopie der Quelldaten. Transparente
Regeln melden überlappende feste Termine, überfällige Fristen, mehr geplante
Zeit als Verfügbarkeit, fehlende Verfügbarkeitsdaten und mehrere hohe
Prioritäten im selben Zeitraum. Benutzerzeitzone und DST-Tagesgrenzen werden
automatisiert geprüft; es gibt keine automatische Terminverschiebung.

Abschlusskriterium: Studium und Arbeit können getrennt erfasst, gemeinsam
angezeigt und zeitlich nachvollziehbar ausgewertet werden.

## 0.4 Projekte und Wissen

Ziel: Eigene Projekte und lokale Wissensquellen strukturiert nutzen.

### 0.4.1 Projekte und Meilensteine

- **Umgesetzt (12. August 2026):** Besitzgebundene Projekte, Ziele und
  Meilensteine können angelegt, angezeigt, bearbeitet, archiviert, reaktiviert
  und per Löschmarkierung ausgeblendet werden. Status, optionale Risiken und
  reine Fälligkeitstage sind in PostgreSQL und SQLite versioniert.
- Aufgaben und Kalenderereignisse werden ausschließlich referenziert. Aufgabe,
  Kalender-UID und ETag bleiben in ihren führenden Modulen; fremde oder
  ungültige Referenzen weist die API zurück.
- Der Fortschritt ist eine gleichgewichtete Projektion aktiver, nicht
  abgebrochener Ziele, Meilensteine und Aufgaben. Ohne Datengrundlage zeigt die
  Oberfläche „noch nicht messbar“. Formel und Vertrag sind in
  [`docs/api/projects.md`](api/projects.md) festgelegt.
- Responsive Projektübersicht und Detailansicht, synthetische Seeds sowie Unit-,
  API-, PostgreSQL-/SQLite-Datenbank- und Desktop-/Mobiltests wurden ergänzt.

Abschlusskriterium: Projektverwaltung und Verknüpfungen funktionieren lokal;
PostgreSQL- und SQLite-Parität, Migration, Import und Recovery werden durch die
automatisierten Prüfungen des Teilabschnitts nachgewiesen.

### 0.4.2 Lokale Dokumente und Notizen

- **Umgesetzt (12. August 2026):** Besitzgebundene Markdown-Notizen mit
  Kategorien, Tags, Projekt-/Studienmodulbezug, Versionen, Suchfreigabe,
  Archivierung und Soft-Delete stehen in PostgreSQL und SQLite bereit.
- Dokumente werden über eine lokale Storage-Schnittstelle außerhalb des
  Repositorys abgelegt. Opaque interne Schlüssel, serverseitige
  Pfadbegrenzung, Symlink-Schutz, `0700`-Verzeichnisse, `0600`-Dateien,
  SHA-256 und eine Grenze von 25 MiB sichern die Ablage ab.
- Die responsive Wissensoberfläche unterstützt Anlage, Änderung,
  Versionsanzeige, Archivierung, Wiederherstellung, Upload, Download und
  Löschung. Persönliche Inhalte werden nicht im Browser gespeichert.
- PostgreSQL→SQLite-Import sowie SQLite-Backup und -Restore umfassen die neuen
  Modelle und Dokumentdateien; alle Nachweise verwenden synthetische Daten.

Abschlusskriterium: Notiz- und Dokumentverwaltung funktionieren lokal in
Browser und Mac-Sidecar; Besitz-, Pfad-, Archivierungs-, Lösch-, Migrations-
und Recovery-Regeln sind automatisiert geprüft.

### 0.4.3 Suche

- **Umgesetzt (20. August 2026):** Die providerunabhängige lokale Suche erfasst
  ausdrücklich freigegebene Projekte samt aktiven Zielen und Meilensteinen,
  Notizen, Dokumentmetadaten und sicher extrahierten Text sowie freigegebene
  Studienmodule, Studieneinträge und Arbeitsprojekte.
- Jeder Treffer nennt Titel, Inhaltstyp, führende Quelle, Änderungsdatum,
  Ausschnitt, Treffergrund und Detailpfad. Die responsive Oberfläche öffnet die
  führenden Fachdaten, ohne Treffer im Browser zu persistieren.
- Besitzergrenzen, Freigabe, Archivierung und Löschmarkierung werden vor der
  Bewertung serverseitig gefiltert. PostgreSQL und SQLite verwenden denselben
  deterministischen Vertrag und dieselbe Gewichtung; es gibt keinen externen
  Suchdienst und keinen separaten Schattenindex.
- Der genaue Vertrag, die Text-Extraktionsgrenze und bewusst fehlende
  unscharfe beziehungsweise sprachabhängige Suche sind in
  [`docs/api/search.md`](api/search.md) dokumentiert und durch Unit-, API-,
  PostgreSQL-/SQLite- sowie Desktop-/Mobiltests festgelegt.

Abschlusskriterium: Freigegebene lokale Inhalte sind besitzgebunden mit
vergleichbaren Ergebnissen auf PostgreSQL und SQLite durchsuchbar; private,
archivierte und gelöschte Inhalte erscheinen nicht.

### 0.4.4 Quellengestützte KI

- **Umgesetzt (20. August 2026):** Ein providerunabhängiger KI-Servicevertrag,
  lokale Anfrage-/Antwortstrukturen und ein deaktivierter Adapter bereiten
  quellengestützte Antworten vor. Im produktiven Server ist kein Anbieter
  aktiv; externe Verarbeitung und externe API-Aufrufe sind technisch
  blockiert.
- Die Quellenaufbereitung übernimmt ausschließlich eigene, aktive und
  ausdrücklich für die lokale Suche freigegebene Inhalte. Quellen,
  Textausschnitte, Freigabestatus, fehlende beziehungsweise unzureichende
  Belege und mögliche Widersprüche werden sichtbar ausgewiesen.
- Regelbasierte Prompt-Injection-Erkennung schließt verdächtige Textstellen als
  Adapterkontext aus. Fragen, Antworten und Ausschnitte werden nicht im
  Klartext persistiert oder protokolliert; Interaktionen speichern nur
  geschützte Fingerabdrücke und technische Metadaten.
- Schreibende Ergebnisse sind ausschließlich Vorschläge mit zwingender
  Bestätigung. Auch die Bestätigung protokolliert nur die Freigabe und führt
  keine Fachänderung aus. Details und Grenzen stehen im
  [`KI-Vertrag`](api/ai.md).

Abschlusskriterium: Projekte und Wissen sind lokal durchsuchbar; KI bleibt
erklärbar, vollständig abschaltbar und ohne ausdrücklich implementierte
externe Freigabe übertragungsfrei. PostgreSQL-/SQLite-Persistenz,
Besitzgrenzen, Recovery, Browser-/Mac-App-Vertrag und datensparsame Audits sind
automatisiert geprüft.

## 0.5 Finanzen, Fitness und Integrationen

Ziel: Weitere persönliche Bereiche ergänzen, ohne den lokalen Kern zu gefährden.

### 0.5.1 Finanzen

- **Umgesetzt (20. August 2026):** Einnahmen, Ausgaben und Kategorien lassen
  sich besitzgebunden anlegen, bearbeiten und reversibel archivieren. Betrag,
  Währung und Buchungsdatum werden serverseitig validiert; Geldwerte bleiben
  in PostgreSQL und SQLite ganze kleinste Währungseinheiten.
- Wiederkehrende Buchungen werden ohne automatische Erzeugung vorbereitet.
  Monats- und Jahresbudgets, Zeitraum- und Kategoriefilter, Monatsvergleich,
  Sparquote und nachvollziehbare Budgetwarnungen stehen lokal zur Verfügung.
- Der versionierte JSON-Export enthält ausschließlich eigene Finanzdaten. Es
  gibt keine Bankanbindung, Steuer- oder Rechtsbewertung, KI-Freigabe oder
  externe Übertragung.
- Responsive Oberfläche, synthetischer Seed, API-, Datenbank-, SQLite-,
  Recovery- und Browsernachweise sowie Grenzen sind im
  [`Finanzvertrag`](api/finance.md) dokumentiert.

Abschlusskriterium: Der Finanzbereich ist lokal nutzbar, besitzgebunden,
ganzzahlig ausgewertet und über PostgreSQL, SQLite, Backup und Restore geprüft;
persönliche Antworten werden nicht im Browser gespeichert.

### 0.5.2 Fitness

- **Umgesetzt (20. August 2026):** Besitzgebundene Trainingspläne, Übungen,
  Zielwerte, geplante und abgeschlossene Einheiten, Sätze sowie Gewichtseinträge
  lassen sich lokal anlegen, anzeigen, bearbeiten und soweit fachlich passend
  reversibel archivieren.
- Gewicht, Dauer, Distanz und Wiederholungen verwenden kontrollierte ganze
  Basiseinheiten. Trainingshistorie, Volumen, Gewichtsverlauf und persönliche
  Maxima sind rein lesende, einfache Fortschrittsauswertungen ohne Diagnose
  oder medizinische Empfehlung.
- Einheiten referenzieren vorhandene Kalenderereignisse ausschließlich über
  eigene Kalender-ID und stabile UID. Ereignis, ETag und Sync-Token werden
  nicht automatisch geändert.
- PostgreSQL-/SQLite-Migration, synthetischer Seed, Import, Recovery, API,
  responsive Oberfläche und Sicherheitsgrenzen sind im
  [`Fitnessvertrag`](api/fitness.md) dokumentiert und automatisiert geprüft.

Abschlusskriterium: Fitnessdaten funktionieren lokal, besitzgebunden und ohne
externe Übertragung; Datenbankparität, Kalender-Unabhängigkeit, Recovery sowie
Desktop-/Mobilbetrieb sind nachgewiesen.

### 0.5.3 ICS-Import und -Export

- **Umgesetzt (20. August 2026):** Eigene Kalender lassen sich lokal als
  RFC-5545-iCalendar-Datei exportieren; begrenzte ICS-Dateien werden vor jedem
  Import vollständig geprüft und als Vorschau angezeigt.
- Stabile UIDs, `VTIMEZONE`, zeitgebundene und ganztägige Ereignisse,
  begrenzte Wiederholungen und DISPLAY-Erinnerungen werden verlustarm
  übernommen. Wiederholter Import identischer Daten erzeugt keine Duplikate.
- Doppelte, gelöschte oder abweichend vorhandene UIDs sowie ungültige
  Ereignisse blockieren den atomaren Schreibschritt. Lokale ETags und
  Sync-Daten werden nicht ungefragt überschrieben.
- Besitzgrenzen, 2-MiB-/500-Ereignis-Limits, kurzlebige Einmal-Vorschauen,
  PostgreSQL-/SQLite-Parität und die responsive Bedienung sind im
  [`ICS-Vertrag`](api/ics.md) dokumentiert und automatisiert geprüft.

Abschlusskriterium: Import und Export verwenden ausschließlich den vorhandenen
Kalenderkern; Konflikte sind vor dem Schreiben sichtbar, identische Importe
sind idempotent und persönliche Kalenderdaten bleiben lokal.

### 0.5.4 Externe CalDAV-Integration

- **Umgesetzt (20. August 2026):** Externe CalDAV-Kalender lassen sich als
  optionale, standardmäßig deaktivierte read-only-Quelle konfigurieren,
  testen, auflisten und nach Vorschau manuell in einen eigenen
  LifeOS-Kalender importieren.
- Zugangsdaten bleiben ausschließlich im Backend und werden mit einem
  getrennten lokalen AES-256-GCM-Schlüssel verschlüsselt. Ohne Schlüssel ist
  die Funktion vollständig nicht verfügbar; Widerruf löscht Chiffretext und
  Integrationsdaten.
- HTTPS, Zertifikatsprüfung, DNS-/IP-Prüfung mit fest gebundener Zieladresse,
  gleichursprüngliche begrenzte Weiterleitungen, Timeouts sowie Antwort- und
  Mengenlimits schützen den optionalen Netzwerkpfad. Private, Loopback-,
  Link-Local- und Metadata-Ziele werden abgewiesen.
- Fremde ICS-Inhalte werden begrenzt validiert. Abweichende UIDs bleiben vor
  dem Schreiben sichtbare Konflikte; stabile externe UID-/ETag-Zuordnungen
  verändern lokale ETags und Sync-Tokens nicht.
- PostgreSQL-/SQLite-Persistenz, Transfer, Recovery, synthetischer Adapter,
  Besitzgrenzen, Widerruf sowie Desktop-/Mobilbedienung sind im
  [`externen CalDAV-Vertrag`](api/external-caldav.md) dokumentiert und
  automatisiert geprüft.

Abschlusskriterium: Der externe Netzwerkpfad ist nur nach bewusster
Aktivierung nutzbar, importiert ausschließlich nach Vorschau und Bestätigung
und kann vollständig widerrufen werden. Bidirektionale Synchronisation,
Schreiben, Löschspiegelung, echte Apple-Zugänge und der Mac-Schlüsselbundpfad
bleiben ausdrücklich offen.

### 0.5.5 Optionale GitHub-Integration

- Als standardmäßig deaktivierte, ausschließlich lesende Integration
  umgesetzt. Ohne getrennten lokalen `INTEGRATION_SECRET_KEY` ist sie nicht
  verfügbar; eine Verbindung muss vor jedem Netzwerkpfad bewusst aktiviert
  sein.
- Token werden ausschließlich im Backend AES-256-GCM-verschlüsselt und nie an
  die Oberfläche zurückgegeben. Widerruf entfernt den Chiffretext. Fine-grained
  Tokens sollen auf ausgewählte Repositories und lesende Rechte für Metadata,
  Contents, Issues, Pull requests und Actions begrenzt werden.
- Repository-Metadaten, Issues, Pull Requests, Commits, Releases und CI-Status
  werden über den festen Ursprung `api.github.com` mit GET, Timeouts,
  Antwort-/Mengenlimits und begrenzten gleichursprünglichen Weiterleitungen
  gelesen. Rate Limits und Fehler bleiben sichtbar.
- Fremde Inhalte werden nur als begrenzter Text dargestellt, nicht dauerhaft
  kopiert und lösen keine Anweisung oder Schreibaktion aus. PostgreSQL,
  SQLite, Transfer, Recovery, Besitzgrenzen, Widerruf, synthetischer Adapter
  sowie Desktop-/Mobilbedienung sind im
  [`GitHub-Integrationsvertrag`](api/github-integration.md) dokumentiert.

Abschlusskriterium: Der Netzwerkzugriff erfolgt ausschließlich nach expliziter
Aktivierung, das Token bleibt serverseitig verschlüsselt und die fünf
Metadatenbereiche sind lesbar, ohne externe Inhalte zu persistieren. OAuth,
Webhooks, Hintergrundsynchronisation und sämtliche GitHub-Schreibaktionen
bleiben ausdrücklich außerhalb dieses Stands.

### 0.5.6 Abschluss und produktionsnahe Demo

- **Abgeschlossen (20. August 2026):** Die Sicherheits- und Datenschutzmatrix
  prüft Authentifizierung, Besitz, fremde IDs, Limits, Timeouts, widerrufene
  Zugänge, fehlende Berechtigungen, Secret-Scan und standardmäßig ausbleibende
  externe Übertragung.
- PostgreSQL und SQLite wenden alle versionierten Migrationen an. Seed,
  Neustart, vollständiger Fachmodelltransfer, Backup und Restore in neue Ziele
  sowie der gebündelte Node-22-Sidecar sind reproduzierbar geprüft.
- Die reale lokale Browserdemo legte Finanzdaten an, änderte und wertete sie
  aus, löste den eigenen Export aus, ergänzte einen Fitnessfortschritt und
  führte ICS-Vorschau, bestätigten Import und Export am gemeinsamen
  Kalenderkern aus. CalDAV und GitHub blieben ohne Schlüssel vollständig
  deaktiviert.
- Ein im Demoablauf entdeckter Uhrzeitfehler beim Widerruf zukünftiger
  synthetischer Sitzungen wurde providerunabhängig behoben und mit Unit- sowie
  SQLite-Bootstrap-Test abgesichert.
- Ablauf, Prüfmatrix, Update-/Recovery-Regeln und offene Release-Gates stehen
  im [`lokalen Roadmap-0.5-Nachweis`](roadmap-05-local-demo.md).

Abschlusskriterium: Die zusätzlichen Bereiche bleiben optional, lokal und
deaktivierbar; der Kalender- und Aufgaben-Kern bleibt unabhängig nutzbar.
Roadmap 0.5 ist damit fachlich und technisch abgeschlossen.
