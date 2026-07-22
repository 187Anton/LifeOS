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

## 0.2 Organisation

Ziel: Aufgaben und Kalender im Alltag miteinander verbinden.

### 0.2.1 Aufgabenmodell

- Aufgaben mit Titel, Beschreibung, Status, Priorität und Fälligkeit anlegen.
- Aufgaben archivieren, wieder öffnen und löschen können.
- Statusänderungen und relevante Änderungen protokollieren.

### 0.2.2 Aufgabenoberfläche

- Aufgabenliste, Detailansicht und Bearbeitungsformular erstellen.
- Nach Status, Priorität und Fälligkeit filtern und sortieren.
- Mobile Bedienung und verständliche leere Zustände ergänzen.

### 0.2.3 Kalenderansichten

- Tages-, Wochen- und Monatsansicht ergänzen.
- Ereignisse aus dem internen Kalender anzeigen.
- Zeitzonen und Ganztägigkeit konsistent darstellen.

### 0.2.4 Aufgaben-Termin-Verknüpfung

- Aufgaben mit Ereignissen verknüpfen.
- Aus einem Termin eine Aufgabe erzeugen können.
- Verknüpfungen in beiden Detailansichten anzeigen.

### 0.2.5 Dashboard

- Offene Aufgaben, heutige Termine und überfällige Aufgaben zusammenfassen.
- Dashboard vollständig aus lokalen Daten berechnen.
- Ladezeit und verständliche Fehlerzustände testen.

Abschlusskriterium: Ein typischer Tag kann vollständig über Aufgaben,
Kalender und Dashboard geplant werden.

## 0.3 Studium und Arbeit

Ziel: Studien- und Arbeitsinformationen nachvollziehbar verwalten.

### 0.3.1 Studium

- Studiengänge und Module verwalten.
- Prüfungen, Abgaben und Fristen erfassen.
- Lernfortschritt und Status pro Modul anzeigen.

### 0.3.2 Arbeit und Praxis

- Arbeitgeber, Praxisphasen und Arbeitstage erfassen.
- Tagesberichte und Notizen speichern.
- Arbeitszeit aus nachvollziehbaren Einträgen berechnen.

### 0.3.3 Gemeinsame Zeitplanung

- Studien- und Arbeitstermine in Kalenderansichten integrieren.
- Konflikte und Überschneidungen sichtbar machen.
- Berechnungen mit festen Zeitzonen und dokumentierten Regeln testen.

Abschlusskriterium: Studium und Arbeit können getrennt erfasst, gemeinsam
angezeigt und zeitlich nachvollziehbar ausgewertet werden.

## 0.4 Projekte und Wissen

Ziel: Eigene Projekte und lokale Wissensquellen strukturiert nutzen.

### 0.4.1 Projekte und Meilensteine

- Projekte, Ziele und Meilensteine verwalten.
- Aufgaben und Termine mit Projekten verknüpfen.
- Fortschritt aus nachvollziehbaren Daten berechnen.

### 0.4.2 Lokale Dokumente und Notizen

- Dokumente und Notizen lokal verwalten.
- Dateipfade, Metadaten und Löschvorgänge sicher behandeln.
- Keine automatische externe Übertragung einführen.

### 0.4.3 Suche

- Volltextsuche über freigegebene lokale Inhalte ergänzen.
- Treffer mit Quelle, Änderungsdatum und Inhaltstyp anzeigen.
- Zugriffs- und Löschregeln in Suchergebnissen berücksichtigen.

### 0.4.4 Quellengestützte KI

- KI-Funktionen zunächst deaktiviert lassen.
- Lokale Quellen und verwendete Textstellen sichtbar machen.
- Externe Verarbeitung nur nach ausdrücklicher Freigabe ermöglichen.
- Antworten ohne Quellen nicht als verlässlich markieren.

Abschlusskriterium: Projekte und Wissen sind lokal durchsuchbar; KI bleibt
erklärbar, abschaltbar und bestätigt externe Übertragungen ausdrücklich.

## 0.5 Finanzen, Fitness und Integrationen

Ziel: Weitere persönliche Bereiche ergänzen, ohne den lokalen Kern zu gefährden.

### 0.5.1 Finanzen

- Manuelle Buchungen und Kategorien erfassen.
- Budgets und Auswertungszeiträume unterstützen.
- Keine Bankanbindung im ersten Umsetzungsschritt.

### 0.5.2 Fitness

- Trainings-, Gewichts- und Messwerte lokal erfassen.
- Zeitreihen und einfache Auswertungen anzeigen.
- Sensible Daten besonders schützen und nicht extern übertragen.

### 0.5.3 ICS-Import und -Export

- iCalendar-Dateien importieren und exportieren.
- UID, Zeitzone und Wiederholungsregeln möglichst verlustarm behandeln.
- Importkonflikte vor dem Schreiben anzeigen.

### 0.5.4 Externe CalDAV-Integration

- Bestehende iCloud-/CalDAV-Kalender optional als externe Quelle anbinden.
- Zugangsdaten ausschließlich lokal und verschlüsselt konfigurieren.
- Externe Synchronisierung vom lokalen LifeOS-Kern trennen.
- Konflikt- und Löschverhalten zuerst mit Testdaten prüfen.

### 0.5.5 Optionale GitHub-Integration

- Issues und Pull Requests nur nach expliziter Aktivierung einlesen.
- Keine Schreibaktionen ohne Bestätigung.
- Token und Berechtigungen minimal halten.

### 0.5.6 Abschluss und produktionsnahe Demo

- Sicherheits- und Datenschutzreview durchführen.
- Backups und Wiederherstellung testen.
- Rückwärtskompatibilität von API, Datenmodell, CalDAV-UIDs und ETags prüfen.
- Lokale Demo mit vollständiger Start-, Update- und Backup-Anleitung erstellen.

Abschlusskriterium: Die zusätzlichen Bereiche bleiben optional, lokal und
deaktivierbar; der Kalender- und Aufgaben-Kern bleibt unabhängig nutzbar.
