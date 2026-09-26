# Kohärentes LifeOS: verbindlicher Umsetzungsplan

Stand: 23.09.2026. Paket 0 dokumentiert die beschlossene Zielrichtung;
die folgenden Funktionen sind damit noch nicht implementiert. Der tatsächliche
Lieferstand steht in [coherence-progress.md](coherence-progress.md).

## 1. Auftrag und Grenzen

Vom Nutzer beschlossen:

- Aufgaben, Kalender und Studium bleiben drei direkt erreichbare Hauptansichten
  mit schneller Neuanlage. Ein gemeinsamer Datenbestand verbindet sie.
- Finanzen werden vollständig aus dem aktiven Produkt entfernt, einschließlich
  Oberfläche, API, ausschließlich dafür benötigter Einstellungen und Datenmodell.
- Integrationen gehören in die Einstellungen.
- Aufgaben können einem Studienmodul zugeordnet werden. Terminierte Aufgaben
  erscheinen im Kalender; Module bündeln Aufgaben, Termine, Materialien und Notizen.
- Lokale Inhaltssuche für PDFs, PPTX-Foliensätze, DOCX und eigene Notizen.
  Keine OCR für Scans/Fotos, keine externe KI-Verarbeitung.
- Apple Kalender auf Mac und iPhone soll Aufgabenplanung anzeigen und Änderungen
  von Zeiten zurück nach LifeOS übertragen können.
- Kleine sequenzielle Pakete, wiederaufnehmbare Zwischenstände und sparsamer
  Umgang mit dem vorhandenen Plus-Kontingent.

Arbeitsannahmen aus der abgestimmten Planung: Apple-Synchronisation zunächst im
gleichen vertrauenswürdigen Heimnetz, solange Mac und LifeOS laufen. Kein neuer
Server, Cloud-Sync, iCloud-Schreibclient oder Zugriff von unterwegs. Die gemeinsame
Weboberfläche bleibt erhalten. Arbeit, Projekte, Fitness, Wissen, Einkaufsliste
und bestehende Integrationen dürfen durch den Umbau keine Funktionen verlieren.
Keine neuen GitHub-Issues, Milestones oder Projects; kein öffentlicher Release.

## 2. Geprüfter Ausgangspunkt

Basis von Paket 0: frisch abgerufenes `origin/develop`, Commit `1b3401b`.
Der ursprüngliche lokale Checkout `docs/align-roadmap-status` unterscheidet sich
davon und wird weder zurückgesetzt noch als aktuelles develop behandelt.
Vor jedem Folgepaket erneut den aktuellen Integrationsstand prüfen.

| Bereich           | Aktueller Ansatzpunkt                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Navigation        | `apps/web/src/components/Shell.tsx`, `apps/web/src/App.tsx`; noch getrennte Finanz-/Integrations-/Planungsansichten                              |
| Aufgaben          | `Task` in beiden Prisma-Schemata; Fälligkeit, geplanter Start, Aufwand und Projekt vorhanden, direkter Studienmodulbezug fehlt                   |
| Studium           | `StudyWorkspace.tsx`, `modules/study`; Studienabschnitte, Module und Einträge vorhanden, eigene Moduldetailseite fehlt                           |
| Kalender/Planung  | `CalendarWorkspace.tsx`, `calendar-view.ts`, `modules/planning`; Studienanzeige separat, Aufgabenplanung bislang in eigener Projektion           |
| Materialien/Suche | `KnowledgeWorkspace.tsx`, `modules/knowledge`, `modules/search`; Dokumente/Notizen bereits Modul-zuordenbar, PDF-/Office-Inhaltsextraktion fehlt |
| CalDAV            | `modules/caldav`, `modules/task-event-links`; Ereignisse und unverbindliche Beziehungen vorhanden, verwaltete Aufgabenabbildung fehlt            |
| Desktop           | `apps/desktop/src-tauri/src/lib.rs`; dynamischer Loopback-Port, kein iPhone-Zugriff auf den App-Sidecar                                          |
| Betriebsnachweise | `scripts/verify-caldav-lan.mjs`, `docs/release-0.9.md`; vorhandene LAN-Prüfungen wiederverwenden, nicht als fertige App-Anbindung ausgeben       |

Lesepflicht aus AGENTS.md einschließlich README und Leitfaden bleibt bestehen.
Danach nur die Dateien des aktuellen Pakets vertiefen; keine erneute Vollinventur
ohne Anlass. Historische Statusangaben sind keine aktuellen Testnachweise.

## 3. Verbindliche fachliche Regeln

### Aufgaben und Studienmodule

Eine Aufgabe erhält höchstens einen optionalen direkten Studienmodulbezug;
Projektbezug ist zusätzlich erlaubt. Alle Beziehungen sind besitzgebunden.
Anlage im Modul füllt den Bezug vor, globale Anlage bietet eine Modulauswahl.
Bestehende Aufgaben bleiben ohne Zwangszuordnung gültig. Modularchivierung
löscht keine Aufgaben oder Dateien. Archivierte Bezüge bleiben nachvollziehbar,
werden aber nicht für neue Zuordnungen angeboten.

Titel, Beschreibung, Status, Priorität, Modul-/Projektbezug und Fälligkeit haben
ihre fachliche Quelle an der Aufgabe. Alle Ansichten öffnen denselben Editor
beziehungsweise dieselbe Detailansicht; Änderungen aktualisieren die betroffenen
Ansichten ohne manuelles Neuladen. Suchtreffer und Kalenderkarten öffnen das
konkrete Objekt, nicht nur die übergeordnete Bereichsseite.

Vorhandene `StudyEntry.taskId`- und `calendarEventId`-Bezüge bleiben erhalten.
Verknüpfte Abgaben zeigen Aufgabenstatus und Aufgabenfrist als führende Werte;
unverknüpfte Studieneinträge bleiben eigenständig. Abweichende Bestandswerte vor
einer Zusammenführung anzeigen und explizit auflösen, nicht still überschreiben.
Prüfungsnoten und Prüfungsstatus sind keine automatisch erledigten Aufgaben.

### Kalender und Apple-Abbildung

| Situation/Aktion                         | Zielverhalten                                                                                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Nur Fälligkeit                           | Ganztägige Fristmarkierung, keine belegte Arbeitszeit                                                                                     |
| Geplanter Start mit Dauer                | Bearbeitungsblock; Aufwandsschätzung und tatsächlich gebuchte Zeit fachlich unterscheiden                                                 |
| Start ohne Dauer                         | Sichtbare Startmarkierung ohne erfundene Endzeit; für Apple in Paket 9 interoperable Darstellung nachweisen                               |
| Planung plus Fälligkeit                  | Zwei verschieden bezeichnete Darstellungen derselben Aufgabe                                                                              |
| Bearbeitungsblock verschieben/verlängern | Planung ändern, Fälligkeit nicht verändern                                                                                                |
| Ganztägige Frist verschieben             | Aufgabenfälligkeit ändern                                                                                                                 |
| Bearbeitungsblock löschen                | Planung entfernen, Aufgabe erhalten                                                                                                       |
| Fristeintrag löschen                     | Fälligkeit entfernen, Aufgabe erhalten                                                                                                    |
| Aufgabe erledigen/wieder öffnen          | LifeOS-Status überall angleichen; Apple-Titel eindeutig als erledigt markieren beziehungsweise Markierung entfernen, stabile UID erhalten |
| Aufgabe archivieren/löschen              | Verwaltete Kalenderabbildungen synchron entfernt; normale nur verknüpfte Termine bleiben bestehen                                         |
| Gleichzeitige Änderungen                 | Veraltete Version zurückweisen und verständlich als Konflikt behandeln; kein stiller Datenverlust                                         |

In LifeOS sind erledigte Aufgaben standardmäßig ausblendbar, aber wieder
einblendbar. Fristen zählen nicht zur Auslastung. Kalender und Planung verwenden
dieselben Filter-, Zeitraum-, Zeitzonen- und Konfliktregeln. Serien, Ganztage,
Sommerzeitwechsel und über Mitternacht laufende Blöcke bleiben korrekt.

Paket 5 baut zunächst die gemeinsame Anzeige aus. Paket 9 ergänzt eine getrennt
erkennbare **verwaltete Aufgaben-Kalender-Beziehung**. Die bisherigen freien
TaskEventLinks bekommen dadurch keine neuen automatischen Seiteneffekte.
Je Aufgabe zunächst höchstens ein verwalteter Bearbeitungsblock und eine Frist.
Mehrere frei verknüpfte Ereignisse bleiben möglich; keine automatische Umdeutung.

Zeitgebundene verwaltete Ereignisse führen Start/Ende im Kalenderkern; Aufgabe
und Planung lesen diese Zeiten. Fälligkeiten bleiben reine Tage an der Aufgabe;
deren CalDAV-Abbildung ist eine kontrollierte Repräsentation. Falls bisherige
API-Felder weiter benötigt werden, werden sie innerhalb derselben Transaktion
kompatibel abgebildet, nicht durch einen späteren Hintergrundabgleich.
LifeOS- und CalDAV-Schreibpfade verwenden denselben Fachservice. Aufgabe,
Ereignis, Beziehung, ETag, Sync-Token und Audit werden atomar geändert.

Paket 9 dokumentiert vor Implementierung die genaue Feldabbildung einschließlich
Titeländerungen, Erinnerungen, vollständigem Apple-PUT, Kalenderwechsel und
Wiederholungen. Nicht unterstützte Änderungen verwalteter Einträge werden klar
abgewiesen, nicht teilweise angewendet. Normale Kalenderereignisse behalten
ihren vorhandenen Funktionsumfang. Änderungen allein an Titel/Erinnerung dürfen
keine Aufgabenfelder löschen. Bestandszuordnungen sind idempotent; uneindeutige
Fälle werden aufgelistet und nicht automatisch dupliziert.

### Studienmaterialien und Suche

Moduldetail: Übersicht, Aufgaben, Termine/Prüfungen, Materialien und Notizen.
Gemeinsame vorhandene Dokumentablage; kein zweiter Uploadspeicher. Direktes
Hochladen, Zuordnen, Öffnen/Herunterladen, Bearbeiten und Archivieren im Modul.
Sinnvolle Materialarten: Foliensatz, Übung, Literatur, Sonstiges; Thema optional.
Lokale Aufgabenfilter bleiben normale Fachfilter. Die bereichsübergreifende
Inhaltssuche beachtet die bestehenden ausdrücklichen Suchfreigaben.

Extraktion ausschließlich lokal, mit Grenzen für Laufzeit, Speicher,
entpackte Größe und Textmenge. Keine Makros ausführen und keine externen
Dokumentverknüpfungen abrufen. Parserbibliotheken erst im jeweiligen Paket nach
Lizenz-, Sicherheits- und Paketierungsprüfung auswählen.
PDF-Treffer nennen die Seite, PPTX-Treffer die Folie; DOCX nennt einen Abschnitt
oder Absatz, keine erfundene stabile Seitennummer. Status: ausstehend, verfügbar,
kein Text, geschützt, nicht unterstützt oder fehlgeschlagen.

Bestehende freigegebene Dateien können erneut verarbeitet werden. Neue
Textextraktion respektiert Widerruf, Archivierung und Löschung; abgeleitete Texte
und Fundstellen werden entsprechend entfernt oder aus Suche ausgeschlossen.
Kein separater persistierter Suchindex in diesem Ausbau. Persistierte
Extraktion/Fundstellen nur am Dokument mit Versions-/Prüfsummenbezug; Änderungen
an Backup/Restore und Migrationen mitprüfen. Keine OCR, Vektorsuche oder KI nötig.

### Finanzen entfernen und Updates erhalten

Paket 2 entfernt die aktive Nutzung, Paket 3 die verbleibenden Schema- und
Kompatibilitätsreste. Diese vorübergehende Trennung ist im Status sichtbar.
Alte Migrationen und historische Nachweise nicht löschen oder umschreiben.
`Task.area=finance` wird datenerhaltend nach `personal` überführt. Gemeinsame
Hilfsfunktionen, Währungseinstellungen oder Icons nur entfernen, wenn kein anderer
aktiver Bereich sie benötigt. Alte API-Verträge erhalten eine dokumentierte
Stilllegung statt unbemerkter inkompatibler Änderung.

Vor Entfernen echter Finanzdatensätze geprüftes vollständiges Backup erstellen;
bei fehlendem Nachweis nicht migrieren. Paket 0 führt keine Migration aus.
Frische Installation, Update einer alten Datenbank und Restore eines alten
Backups sind getrennte Testfälle. Ein altes Backup zunächst isoliert herstellen,
dann kontrolliert migrieren. Ein reiner App-Downgrade nach destruktiver Migration
ist kein Rollback; Wiederherstellung erfolgt aus passendem Backup in neue Ziele.

### Apple auf Mac und iPhone

Eigenen LifeOS-CalDAV-Server ausbauen; der externe read-only-CalDAV-Import bleibt
eine getrennte Integration. Unter Einstellungen: Aktivierung, Serveradresse,
separater CalDAV-Zugang, Verbindungsdiagnose und verständliche Einrichtungshilfe.
Stabile Adresse nach Neustart; Portkonflikt sichtbar behandeln, nicht heimlich
einen anderen Port wählen. HTTP Basic nur nach bewusster Wahl des vertrauenswürdigen
Heimnetzbetriebs, sonst TLS. Vertrauen/Zertifikate auf beiden Geräten prüfen.

Die zusätzliche Erreichbarkeit darf nur den benötigten authentifizierten
CalDAV-Pfad öffnen. Web-API, Einrichtung, Dokumente und Readiness bleiben am
Loopback geschützt. Genau ein SQLite-Schreiber, geordneter Start/Quit,
Sperrmechanismus und datensparsame Logs bleiben erhalten. Architektur und
Port-/Netzwerkdetails in Paket 10 vor Implementierung am aktuellen Code prüfen.
Offline-Änderungen, erneute Verbindung, Schlafen/Aufwachen und Widerruf testen.
Mac-/iPhone-Beweis benötigt echte Geräte; simulierte Tests ersetzen ihn nicht.

## 4. Lieferpakete und Abnahme

Reihenfolge 0 → 11. Ein Paket darf vor Start in kleinere benannte Teilpakete
geteilt werden; Kriterien und Abhängigkeiten vorher hier festhalten. Pro Auftrag
nur ein Paket beziehungsweise bereits definiertes Teilpaket durchführen.

Paket 2 wird sequenziell geliefert: **2a** entfernt die Finanznavigation,
Finanzansicht und Finanzoptionen in der Weboberfläche samt betroffenen UI-Tests;
API und Datenbank bleiben dabei unverändert. **2b** entfernt die aktiven
Finanz-API-Routen und ausschließlich finanzbezogene Backend-Logik samt
API-Tests und dokumentiert die Stilllegung des bisherigen `/api/v1/finance`-
Vertrags. **2c** bereinigt aktive Frontend-/Vertragsverbraucher, Tests und
Produktdokumentation und nimmt das gesamte Paket 2 ab. Innerhalb von 2c
bereinigt **2c/1** Finanztypen, Web-Client und verwaistes CSS; **2c/2**
entfernt die ausschließlich für Finanzen benötigte Währungseinstellung aus
aktiven Profilverträgen und API-Eingaben, ohne das Bestandsfeld vor Paket 3
zu migrieren. Kein Teilpaket gilt allein als abgeschlossenes Paket 2; DB-Reste
bleiben bis Paket 3 erhalten.

Stand 25.09.2026: Paket 2 ist über
[PR #122](https://github.com/187Anton/LifeOS/pull/122) vollständig in `develop`
integriert; live bestätigt sind der Merge-Commit `ef828e7` als Spitze von
`origin/develop` und beide Pflichtchecks (`Repository checks`,
`Local macOS release` mit Ergebnis `pass`). Ein Währungsschreiben an
`PATCH /api/v1/settings` wird weiterhin bewusst mit `400` abgewiesen.

Paket 3 ist auf dieser Basis lokal umgesetzt und geprüft. Der Ablauf ist
sequenziell: **3/1** Backup-Schutz (PostgreSQL-Wächter `db:migrate` mit
geprüftem Dump samt SHA-256, automatisches geprüftes Datenbank- und
Dokumentenbackup des Mac-Sidecars vor `requires-backup`-Migrationen),
**3/2** neue versionierte Migration `20260925120000_remove_finance_module` für
PostgreSQL und SQLite mit datenerhaltender Überführung von `Task.area=finance`
zu `personal` und Entfernung von `UserSettings.currencyCode`, der drei
Finanzmodelle und der zugehörigen Enums, **3/3** Bereinigung der Verbraucher
(Seeds, Import, Kompatibilitätsclient, Recovery-Snapshot, Verträge, Aufgaben-API,
Web-Hilfen, Sidecar-Nachweis) und **3/4** Migrationstests und Dokumentation.
Alte Migrationen, historische Finanznachweise und der historische
Finanzvertrag bleiben unverändert erhalten. Paket 3 ist inzwischen über
[PR #123](https://github.com/187Anton/LifeOS/pull/123) in `develop` integriert;
bestätigt ist der Merge-Commit `56404d7` als Spitze von `origin/develop`.

Paket 4 ist auf dieser Basis lokal umgesetzt und geprüft. Der Ablauf ist
sequenziell: **4/1** optionale, besitzgebundene Relation `Task.studyModuleId`
über den zusammengesetzten Fremdschlüssel `(studyModuleId, userId)` samt
Rückrelation, Index und je einer neuen versionierten Migration für PostgreSQL
(`20260925121551_task_study_module`) und SQLite
(`20260925121600_task_study_module`, kontrollierte Tabellenneuanlage mit
`foreign-keys-off` und `requires-backup`), **4/2** Anpassung von Seeds,
PostgreSQL-zu-SQLite-Import (Studienprogramme und -module vor Aufgaben mit
Modulbezug), Kompatibilitätsgrenze sowie Migrations-, Import-, Backup- und
Recovery-Nachweisen, **4/3** Erweiterung von Aufgabenverträgen und Aufgaben-API
um `studyModuleId` und den serverseitigen Modulfilter (`none` für Aufgaben ohne
Modulbezug) mit Ablehnung fremder, archivierter oder unbekannter Module für
Neuzuordnungen, **4/4** Erweiterung des gemeinsamen `TaskForm` um aktive
Modul- und Projektauswahl, Kennzeichnung archivierter Altbezüge, Modulfilter der
Aufgabenansicht inklusive „Ohne Modul“ und den Einstieg „Aufgabe anlegen“ am
aktiven Modul der Studienansicht. `Task.area` bleibt ein eigenes Feld und wird
nur bei der Neuanlage aus einem Modul sichtbar mit „Studium“ vorbelegt.
Bestehende `StudyEntry.taskId`- und `calendarEventId`-Bezüge bleiben unverändert;
es findet keine automatische Modul-, Frist- oder Statusübernahme statt. Paket 4
ist über [PR #124](https://github.com/187Anton/LifeOS/pull/124) in `develop`
integriert; bestätigt ist der Merge-Commit `a8a2847` als Spitze von
`origin/develop`.

Paket 5 ist auf `a8a2847` (`origin/develop`, PR #124) lokal umgesetzt und
geprüft. Der Ablauf ist sequenziell: **5/1** gemeinsamer Projektionsvertrag in
`packages/contracts/src/api.ts` (`PlanningArea`, `PlanningItemKind`,
`PlanningItemObjectType`, `PlanningEditTarget`, `PlanningPriority`) mit Quelle
(`area`, `sourceId`, `uid`), Objektart (`objectType`), Besitzer (`ownerId`),
Titel, Status (`status`), Datum (`date`), Start und Ende (`startsAt`, `endsAt`),
Zeitzone (`timezone`) und Bearbeitbarkeit (`editable`), **5/2** Anpassung des
Planning-Service, damit Aufgabenfristen als Ganztagsobjekte, Aufgaben mit Start
und Dauer als geplante Zeitblöcke und Aufgaben mit Start ohne Dauer als reine
Startmarkierungen erscheinen – Startmarkierungen erhalten kein Ende, Fristen
erzeugen keine belegte Arbeitszeit und fließen weder in Kapazität noch in
Überschneidungsberechnungen ein, **5/3** gemeinsame Web-Projektion
`apps/web/src/calendar-projection.ts`, die Kalenderereignis-Vorkommen
(Serien bleiben flüchtige Projektionen des Kalenderkerns mit stabiler UID und
aktuellem ETag), Aufgabenfristen, geplante Zeitblöcke, Startmarkierungen und
Verfügbarkeiten auf einen Typ abbildet sowie verknüpfte Studieneinträge über ihr
führendes Kalenderereignis darstellt, **5/4** Umstellung der vier
Kalenderansichten Tag, Woche, Monat und Agenda und der Planungsansichten
(Woche/Agenda) auf diese Projektion inklusive klar getrennter Beschriftung
„Frist“, „Geplanter Zeitblock“ und „Start ohne Dauer“, **5/5** Bearbeitung aus
den Ansichten heraus: Kalenderereignisse öffnen den vorhandenen Termin-Editor,
Aufgabenfristen, Zeitblöcke und Startmarkierungen den vorhandenen Aufgabeneditor
(`editEventRequest`/`editTaskRequest` in `App.tsx`, ohne eigenen Effekt und ohne
zweiten Schreibpfad), **5/6** konsistentes Nachladen von Aufgaben, Kalender,
Studium, Dashboard und Planung nach jeder bestätigten Bearbeitung
(`reloadProjections`) und **5/7** Unit-, Integrations- und E2E-Nachweise. Eine
Aufgabenfrist und ein geplanter Zeitblock derselben Aufgabe bleiben zwei
bewusst beschriftete Projektionen. Es entstanden keine Schemaänderung, keine
Migration und keine verwaltete Task-Kalender-Relation; Paket 9 bleibt dafür
zuständig.

Nach der ersten Abnahme wurde Paket 5 um vier Befunde korrigiert (Stand
25.09.2026, weiterhin lokal, noch nicht über PR und Pflicht-CI abgenommen):
**K1** Aufgaben und Studieneinträge werden in Kalender- und Planungsansicht
nach derselben Projektregel, nämlich der Profilzeitzone, auf Kalendertage
abgebildet, während Kalenderereignisse ihre gespeicherte Zeitzone für die
Anzeige behalten und nicht neu interpretiert werden; **K2** zeitgebundene
Blöcke werden bei echter Zeitüberlappung aufgenommen, erscheinen genau einmal
pro Zeitraum mit dem Anzeigetag `max(eigener Starttag, Zeitraumstart)`, tragen
eine klare Fortsetzungskennzeichnung und zählen die Dauer nur an ihrem eigenen
Starttag gegen die Kapazität; **K3** die Kalenderansicht blendet erledigte,
abgebrochene und archivierte Studieneinträge wieder aus (aktive bleiben
sichtbar), der API-Statusfilter bleibt bewusst unverändert; **K4** ein
verknüpfter Studieneintrag wird nur unterdrückt, wenn sein führender Termin in
der tatsächlich gelieferten Projektion vorkommt – dafür gibt
`StudyEntryResponse` die stabile öffentliche `calendarEventUid` read-only aus,
und ein fester Termin öffnet aus der Planungsansicht den bestehenden
Termin-Editor über `{calendarId, uid}` samt Kalenderwechsel, ohne dass die UID
je als kalenderübergreifend eindeutiger Schlüssel dient. Zusätzlich wurde ein
reproduzierbarer E2E-Testflake (Prüfung direkt nach dem Speichern, während der
Editor noch offen war) im Test deterministisch gemacht; die Fachlogik blieb
unverändert. Gemessener Endstand: 116/116 API-, 67/67 Web-Unit- und 42/42
E2E-Tests (vier volle Playwright-Läufe hintereinander ohne Fehlschlag), dazu
`typecheck`, `lint`, `format:check`, `build`, `repo:check` und `security:secrets`
bestanden. Details stehen in
[coherence-progress.md](coherence-progress.md).

Die zweite Korrekturrunde (Stand 25.09.2026, weiterhin ausschließlich Paket 5)
gleicht die verbliebenen Befunde an: **K5** dieselbe Statusregel in beiden
Ansichten – erledigte und abgebrochene Studieneinträge bleiben unsichtbar,
aktive einschließlich `paused` bleiben sichtbar, archivierte liefert die
Planungsquelle weiterhin nicht aus; die Planungs-API wendet diese Regel über
`hiddenStudyStatus` an. **K6** verknüpfte Studieneinträge werden über die
zusammengesetzte öffentliche Identität `(calendarId, uid)` verglichen, nie über
die UID allein – dieselbe UID in zwei Kalendern unterdrückt nur den tatsächlich
verknüpften Termin; dafür gibt `StudyEntryResponse.calendarEventCalendarId` den
öffentlichen Kalender des führenden Termins read-only aus (interne
Datenbank-IDs bleiben intern) und die Planungsquelle liest die Relation
schreibgeschützt mit. **K7** alle Quellen verwenden dieselbe Profilzeitzone als
Tagesbasis: Anker und „Heute“ der Kalenderansicht hängen nicht mehr von der
Kalenderzeitzone ab, ein abweichender Kalender-Zeitzonenwert ergibt auch über
Mitternacht keinen anderen sichtbaren Tag, und Kalenderereignisse behalten ihre
gespeicherte Zeitzone und ihren Zeitpunkt für Anzeige und Bearbeitung
unverändert. Gemessener Endstand dieser Runde: 118/118 API- (inkl. eines neuen
Integrationsfalls gegen die reale Datenbank), 70/70 Web-Unit- und 42/42
E2E-Tests, dazu `typecheck`, `lint`, `format:check`, `build`, `repo:check` und
`security:secrets` bestanden. Der Commit `acd420b` liegt auf dem getrackten
Paket-5-Branch, PR #125 ist gegen `develop` eröffnet, die Pflicht-CI dort ist
grün und der Merge wurde nicht ausgeführt. Details stehen in
[coherence-progress.md](coherence-progress.md).

Paket 6 ist auf `f37524d` (`origin/develop`, PR #125) lokal umgesetzt und
geprüft. Der Ablauf ist sequenziell: **6/1** Live-Prüfung des Vorgängers
(Spitze von `origin/develop` ist `f37524d`, Ancestry bestätigt, beide
Pflichtchecks für PR #125 `pass`, sauberer Hauptcheckout), **6/2** neue,
abgegrenzte Moduldetail-Komponente
`apps/web/src/components/StudyModuleDetail.tsx`, die von einer Modulkarte der
bestehenden Studienübersicht aus Titel, Kürzel, Studienabschnitt samt Zeitraum,
Status, Leistungspunkte, Note, Notizen, Suchfreigabe, Archivzustand und
Dokumentverweise nachvollziehbar anzeigt, während die getrennte
Studienübersicht unverändert erhalten bleibt, **6/3** Zusammenstellung der
zugehörigen Objekte ausschließlich aus vorhandenen Besitzfiltern – aktive und
archivierte Aufgaben über `Task.studyModuleId`, aktive und archivierte
Studieneinträge über `StudyEntry.moduleId`, Notizen und Dokumente über ihre
echte Modulbeziehung; die freien `studyModule.documentReferences` werden
getrennt als unverbindliche Angaben dargestellt und nie als Datei-ID
interpretiert, **6/4** Bearbeitung ausschließlich über die vorhandenen
Facheditoren: Modul und Studieneintrag über die wiederverwendeten
Studienformulare (die über die neue `formPanel`-Prop in die Detailansicht
gegeben werden; `ModuleForm` und `EntryForm` wurden dafür von einem
`onSave`-Union-Typ auf getrennte `onCreate`/`onUpdate`-Signaturen umgestellt),
Aufgaben über den gemeinsamen `TaskForm`/`TaskWorkspace` und Notizen sowie
Dokument-Metadaten über `KnowledgeWorkspace` mit einem neuen `DocumentEditor`,
der ausschließlich vorhandene Metadaten- und Verknüpfungsfelder bearbeitet und
keine Datei ersetzt, **6/5** vervollständigte Suchnavigation, bei der
`study_module` das konkrete Modul, `study_entry` das Modul mit markiertem
Eintrag (`source.id` ist die Modul-ID, `id` die Eintrags-ID), `note` die
konkrete Notiz und `document` das konkrete Dokument öffnet, während archivierte,
gelöschte oder nicht mehr auffindbare Ziele einen klaren Fehlerzustand statt
eines fremden Objekts erzeugen, **6/6** konsistentes Nachladen der betroffenen
Projektionen nach jeder bestätigten Änderung mit sicherem Umgang mit
Auswahlzuständen (eine nicht mehr vorhandene Auswahl wird verworfen, die
Modulauswahl bleibt für die Rückkehr aus dem Aufgaben- oder Wissenseditor
erhalten) sowie **6/7** Unit-, API- und E2E-Nachweise einschließlich leerer
Modulbereiche, archivierter Bezüge, sichtbarer API-Fehler und verschwundener
Suchziele. Es entstanden keine Schemaänderung, keine Migration, keine neue
API-Ressource, kein zweiter Dokumentenspeicher und keine Dateiextraktion;
Paket 7 und Paket 8 bleiben dafür zuständig. Gemessener Endstand: 121/121
API-, 76/76 Web-Unit- und 48/48 E2E-Tests (24 Tests in beiden
Browserprojekten), dazu `typecheck`, `lint`, `format:check`, `build`,
`repo:check` und `security:secrets` bestanden. Details stehen in
[coherence-progress.md](coherence-progress.md).

Paket 6 wurde nach der lokalen Prüfung um drei Befunde korrigiert (Stand
25.09.2026, weiterhin ausschließlich Paket 6, kein Folgepaket): **K1** Ein
bestehender Studieneintrag behält beim Bearbeiten seine gespeicherte Zeitzone
und seinen Zeitpunkt; angezeigte Wandzeit und Schreibwert werden in genau einer
Zeitzone gelesen und geschrieben (`record.timezone`, sonst Profilzeitzone), nur
neue Einträge verwenden weiterhin die Profilzeitzone. Nachgewiesen durch einen
Regressionstest mit abweichender Profil- und Eintragszeitzone, der Speichern
ohne Zeitänderung prüft und gegen den vorherigen Stand nachweislich fehlschlägt.
**K2** `README.md` und `LifeOS Leitfaden.docx` sind knapp um die
Moduldetailansicht sowie die Bearbeitung verknüpfter Notizen und
Dokumentmetadaten ergänzt; die Paketgrenzen bleiben unverändert, und der
Leitfaden wurde erneut gerendert und die geänderten Seiten geprüft. **K3** Die
Pflichtchecks `Repository checks` und `Local macOS release` sind für den Head
dieser Runde live über PR #126 zu lesen und werden nur dann als bestanden
gemeldet, wenn beide für genau diesen Head erfolgreich sind. Gemessener
Endstand dieser Runde: 77/77 Web-Unit- (vorher 76, inklusive des neuen
Regressionstests), 48/48 E2E- und 19/19 Repository-Tests, dazu `typecheck`,
`lint`, `format:check`, `build`, `repo:check` und `security:secrets` bestanden;
die API-Suite wurde nicht erneut ausgeführt, weil keine API-Datei geändert
wurde. Keine Schemaänderung, keine Migration, keine neue API-Ressource, keine
Änderung an Apple-/CalDAV-Verhalten und kein Merge. Details stehen in
[coherence-progress.md](coherence-progress.md).

| Paket | Umfang und Einstieg                                                           | Erforderliche Abnahme zusätzlich zur Pflicht-CI                                                                                                                                                     |
| ----- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Dieser Plan, Fortschritt, Startanleitung; README-/AGENTS-Verweis              | Inhalt konsistent, Format/Links/Diff geprüft; PR nach develop                                                                                                                                       |
| 1     | Einstellungen und Integrationseinbettung; Shell/App/IntegrationsWorkspace     | Desktop/mobile Navigation, Tastatur/Fokus, bestehende Integration bleibt bedienbar; drei schnelle Neuanlagen                                                                                        |
| 2     | Finanzoberfläche/API/aktive Verträge entfernen; finance-Modul und Verbraucher | Keine Finanznavigation oder aktive Schreibroute, betroffene Unit/API/UI-Tests aktualisiert; DB-Reste ausdrücklich bis Paket 3                                                                       |
| 3     | Finanzschema, Seeds, Import/Recovery, TaskArea bereinigen                     | PostgreSQL und SQLite: neue Installation, Altdatenupgrade, geprüfter Dump/Restore samt SHA-256, Restore nur in neue Ziele; übrige Fachobjekte erhalten; Sidecar migriert erst nach geprüftem Backup |
| 4     | Optionaler Studienmodulbezug, Verträge/API und gemeinsamer Aufgabeneditor     | Besitzerprüfung, Zuordnung/Entfernung, Projekt plus Modul, Archivfälle, Filter; Migration/Recovery beider Provider                                                                                  |
| 5     | Gemeinsame Kalender-/Planungsansichten                                        | Alle vier Kalenderansichten, Frist versus Zeitblock, keine Duplikate, Sommerzeit/Serien, Status und Bearbeitung aus Kalender                                                                        |
| 6     | Moduldetailseite, gemeinsame Dokument-/Notizbedienung                         | Modul → Datei/Notiz/Aufgabe/Termin → Bearbeiten; echte Desktop/mobile Abläufe, Leer-/Fehlerfälle, Suche öffnet Objekt                                                                               |
| 7     | PDF-Textextraktion und modulspezifische Suche                                 | Fundstellen/Seiten, geschützte/defekte/zu große Dateien, Altdateien, Suchfreigabe/Widerruf/Löschung; lokale App ohne Zusatzinstallation                                                             |
| 8     | PPTX/DOCX ergänzen                                                            | Folien-/Absatzfundstellen, ZIP-Größenlimits, keine Makros/externen Abrufe; Regression PDF/Text/Notizen                                                                                              |
| 9     | Verwaltete Aufgaben-CalDAV-Abbildung                                          | Erstellen/Lesen/Ändern/Löschen, ETag-Konflikt mit vollständigem Rollback, Sync-Token, UID-Stabilität, Frist/Block, Duplikatfreiheit, Bestand und Wiederverbindung                                   |
| 10    | Stabile Mac-/LAN-Erreichbarkeit, Einrichtung                                  | Authentifizierung/negative Netzwerkfälle, keine Web-API-Freigabe, Portkonflikt, Quit/Neustart, Mac und iPhone verschieben denselben Block                                                           |
| 11    | Gesamtabnahme, dokumentierter main-PR und lokales App-Update                  | Vollständiger Studienablauf, echte Apple-Tests, geprüfte Backups/Updates und neues lokales DMG; keine öffentliche Veröffentlichung                                                                  |

Für neue Datenfelder beide Prisma-Provider, Verträge und die vorhandenen
Migration-, Import/Transfer-, Backup/Restore-, Recovery-, Runtime- und
Sidecar-Testregistrierungen prüfen. Keine reine Schemaänderung als abgeschlossen
melden. README, Fachverträge und Leitfaden mit dem jeweiligen gelieferten Paket
aktualisieren; Implementierungsstatus und geplantes Ziel getrennt halten.

## 5. Arbeitsweise, Kontingent und Übergabe

1. Paketstatus, Git-Status, vorhandene Worktrees und aktuelle Remote-Refs prüfen.
   Offenen Vorgänger-PR zuerst verifizieren; keine fremden Änderungen übernehmen.
2. Wenn verfügbar, Fünfstunden- und Wochenkontingent lesen. Unter 25 Prozent
   Rest in einem Fenster kein größeres neues Paket beginnen. Eigene Reserve,
   keine garantierte Grenze. Fehlende Anzeige als unbekannt behandeln.
3. Isolierter Worktree/Branch aus aktuellem `origin/develop`. Einen vorhandenen
   unvollständigen Paket-Branch fortsetzen statt neu anfangen. Kein Reset/Clean.
4. Relevante Änderungen, passende Tests, kurze Statusnotiz. Kein paralleler
   Agent, unbeschränktes Goal, Wiederholungsmonitor oder Hermes erforderlich.
5. Conventional Commit, Push, PR nach develop. Beide Pflichtchecks
   `Repository checks` und `Local macOS release` für den aktuellen Head müssen
   terminal erfolgreich sein. Keine ausgelassenen, alten oder nur gestarteten
   Checks als Erfolg werten. CI längere Zeit warten lassen, nicht eng pollen.
6. Squash-Merge nur im autorisierten Auftrag und bei erfüllten Regeln;
   Merge/Remote-Ref live verifizieren. Keine direkte Änderung an main/develop.
7. Fortschritt aktualisieren und beenden; Folgepaket braucht einen neuen Auftrag.
   Vor Limitpause genauen nächsten Schritt speichern. Unvollständige Arbeit
   erhalten und nicht als getestet/integriert kennzeichnen.

Pro Paket neuer Codex-Chat im Projekt LifeOS ist empfohlen. Innerhalb desselben
Pakets denselben Chat fortsetzen, auch nach einer Kontingentpause. Neue Chats
setzen das Kontingent nicht zurück. Sie begrenzen nur unnötige Gesprächshistorie.
Tests/Builds benötigen keine zusätzlichen KI-Agenten; Lesen großer Logs und
wiederholte Analysen erzeugen dagegen zusätzlichen Modellkontext.

Modellvorschlag, keine Änderung der Benutzereinstellungen: Sol mit mittlerem
Denkaufwand als Standard; Luna für eng begrenzte Dokumentation/Navigation;
Astra gezielt für schwierige Migrations-, Synchronisations- oder Sicherheitsfragen.
Die sichtbare Modellauswahl entscheidet: GPT-6 Sol/Luna, wenn vorhanden;
bei der hier gemeldeten älteren Auswahl GPT-5.6 Sol/Luna. Für Pakete 3, 9 und 10
bei Bedarf höheren Denkaufwand beziehungsweise Astra verwenden. Keine pauschale
Max-/Ultra-Einstellung und kein Fast-Modus zum Sparen. Das ist eine
Aufgabenempfehlung, keine garantierte Verbrauchsprognose.

Offizielle Quellen, geprüft am 23.09.2026:
[Modelle](https://learn.chatgpt.com/docs/models) und
[Nutzungslimits](https://learn.chatgpt.com/docs/pricing).
Hermes wird nicht vorausgesetzt. Keine Konten, Credits, API-Abrechnung,
Reset-Guthaben oder Einstellungen ohne eigenen Auftrag ändern.

## 6. Kopierbarer Startauftrag für Folgepakete

```text
Arbeite im Projekt /Users/anton/Projekte/LifeOS an genau einem Paket des
Kohärenzumbaus. Lies AGENTS.md, README, LifeOS Leitfaden.docx sowie
docs/coherence-implementation-plan.md und docs/coherence-progress.md aus dem
aktuellen origin/develop. Falls die Dateien im geöffneten Checkout fehlen,
prüfe origin/develop und docs/coherence-implementation-plan; nichts zurücksetzen.

Prüfe zunächst den Vorgänger-PR und den tatsächlichen Git-/CI-Stand. Setze ein
offenes Paket fort; sonst beginne das nächste freigegebene Paket laut
Fortschrittsdatei. Verwende einen isolierten Worktree aus aktuellem develop,
bewahre fremde Arbeit und arbeite ohne parallele Agenten. Prüfe mein Kontingent,
wenn möglich; unter 25 Prozent Rest kein größeres neues Paket starten.

Implementiere nur dieses Paket, prüfe die Abnahmekriterien, aktualisiere die
Dokumentation und Fortschrittsdatei. Committe, pushe und eröffne einen PR nach
develop. Du darfst diesen PR nach terminal grünen Pflichtchecks Repository checks
und Local macOS release sowie erfüllten Branchregeln squash-mergen. Verifiziere
danach den Merge. Keine main-Änderung außer beim ausdrücklich beauftragten
Abschlusspaket, keine öffentliche Veröffentlichung. Bei fremden CI-Problemen
Ursache dokumentieren und den Auftrag nicht ungefragt erweitern.

Beende nach diesem Paket mit Ergebnis, Prüfungen, PR/Commit, verbleibenden Gates
und dem nächsten Schritt. Bei Pause vorher einen wiederaufnehmbaren Zwischenstand
mit Worktree, Branch, erledigten Prüfungen und genauem nächsten Schritt sichern.
```

Für eine Fortsetzung im selben Chat genügt: „Setze das aktuelle Paket anhand
des gespeicherten Zwischenstands fort; starte kein weiteres Paket.“

## 7. Änderungsverlauf

- 23.09.2026: Paket 0 aus den Nutzerentscheidungen erstellt. Kein Produktcode,
  keine Datenmigration, keine Apple-Konten und keine App-Installation geändert.
- 25.09.2026: Paket 5 nach lokalem Nachweis dokumentiert. Festgehalten sind der
  gemeinsame Projektionsvertrag, die Trennung von Frist, geplantem Zeitblock und
  Startmarkierung ohne erfundenes Ende, die Duplikatunterdrückung verknüpfter
  Studieneinträge, die Bearbeitung aus den Ansichten über die bestehenden
  Editoren, das konsistente Nachladen aller Projektionen sowie die
  besitzgebundene Zuordnung ohne neue interne Schreibpfade. Keine
  Schemaänderung, keine Migration, keine verwaltete Task-Kalender-Relation.
- 25.09.2026: Paket 5 um vier Abnahmebefunde korrigiert. Festgehalten sind
  dieselben Tagesgrenzen für Aufgaben und Studieneinträge nach der
  Profilzeitzone bei unveränderter Ereignis-Zeitzone für die Anzeige,
  Mitternachtsblöcke mit genau einem Eintrag pro Zeitraum, Anzeigetag,
  Fortsetzungskennzeichnung und Kapazität nur am eigenen Starttag, das
  Ausblenden erledigter, abgebrochener und archivierter Studieneinträge in der
  Kalenderansicht sowie die Unterdrückung eines verknüpften Studieneintrags
  ausschließlich gegen die tatsächlich gelieferte Projektion mit sicherer
  Editor-Zuordnung über `{calendarId, uid}`. Read-only ergänzt wurden
  `StudyEntryResponse.calendarEventUid` und `PlanningItemResponse.calendarId`.
  Zusätzlich ein reproduzierbarer E2E-Testflake deterministisch gemacht. Keine
  Schemaänderung, keine Migration, keine CalDAV-/Apple-Änderung, keine Änderung
  freier `TaskEventLink`-Beziehungen und kein neuer Schreibpfad.

- 25.09.2026: Zweite Korrekturrunde zu Paket 5. Festgehalten sind die
  gemeinsame Statusregel beider Ansichten (erledigt und abgebrochen unsichtbar,
  aktiv einschließlich `paused` sichtbar, archiviert weiterhin nicht
  ausgeliefert), der Abgleich verknüpfter Studieneinträge über die
  zusammengesetzte öffentliche Identität `(calendarId, uid)` mit read-only
  ausgegebenem `StudyEntryResponse.calendarEventCalendarId` sowie die
  gemeinsame Profilzeitzone als Tagesbasis der Kalenderansicht, sodass ein
  abweichender Kalender-Zeitzonenwert auch über Mitternacht keinen anderen
  sichtbaren Tag ergibt und Ereigniszeitpunkte unverändert bleiben. Keine
  Schemaänderung, keine Migration, keine CalDAV-/Apple-Änderung, keine Änderung
  freier `TaskEventLink`-Beziehungen und kein neuer Schreibpfad.

- 25.09.2026: Dritte Korrekturrunde zu Paket 5. Festgehalten sind zwei Regeln
  für den Kalenderwechsel: Die Kalenderprojektion verwendet ausschließlich
  Ereignisse, deren geladener Kalenderbezug exakt dem ausgewählten Kalender
  entspricht; und eine Ereignisantwort darf Ereignisse, Kalenderbezug und
  Ladezustand nur setzen, solange sie zur jüngsten Anfrage gehört. Damit kann
  ein Termin desselben UID-Werts aus einem anderen Kalender weder während des
  Ladens noch über eine verspätet eintreffende Antwort einen verknüpften
  Studieneintrag unterdrücken. Belegt durch einen App-Referenztest mit
  kalenderweise zurückgehaltenen Antworten (nachweislich rot gegen den Stand
  `60d6697`, grün mit der Korrektur). Keine Schemaänderung, keine Migration,
  keine CalDAV-/Apple-Änderung, keine Änderung freier
  `TaskEventLink`-Beziehungen und kein neuer Schreibpfad.
- 25.09.2026: Paket 6 nach lokalem Nachweis dokumentiert. Festgehalten sind die
  eigene besitzgebundene Moduldetailansicht bei unverändert bestehender
  Studienübersicht, die Zusammenstellung der zugehörigen Aufgaben,
  Studieneinträge, Notizen und Dokumente ausschließlich aus vorhandenen
  Besitzfiltern mit sichtbarer Trennung zwischen freien Dokumentverweisen und
  echten Dateiverknüpfungen, die Bearbeitung ausschließlich über die
  vorhandenen Facheditoren (Studienformulare, gemeinsamer
  Aufgaben-Editor, Wissensansicht mit einem neuen reinen Metadaten-Editor für
  Dokumente), die Suchnavigation auf das jeweils konkrete Objekt einschließlich
  des markierten Studieneintrags, klare Fehlerzustände für archivierte,
  gelöschte oder verschwundene Suchziele sowie das konsistente Nachladen der
  betroffenen Projektionen mit sicherem Umgang mit Auswahlzuständen. Paket 5 ist
  zuvor live als Spitze `f37524d` von `origin/develop` (PR #125, beide
  Pflichtchecks `pass`) bestätigt worden. Keine Schemaänderung, keine Migration,
  keine neue API-Ressource, kein zweiter Dokumentenspeicher, keine
  Dateiextraktion, keine KI-Funktion und kein neuer Schreibpfad.
- 25.09.2026: Korrekturrunde zu Paket 6 (drei Befunde, weiterhin nur Paket 6).
  Festgehalten sind der Erhalt der gespeicherten Zeitzone und des Zeitpunkts
  beim Bearbeiten eines bestehenden Studieneintrags samt Regressionstest mit
  abweichender Profil- und Eintragszeitzone (nachweislich rot vor der
  Korrektur), die knappe Ergänzung von `README.md` und
  `LifeOS Leitfaden.docx` für die Moduldetailansicht sowie die Bearbeitung
  verknüpfter Notizen und Dokumentmetadaten bei unveränderten Paketgrenzen und
  die ausdrückliche Regel, die Pflichtchecks nur für den exakten Head des
  jeweiligen Pakets und nur bei tatsächlich erfolgreichem Live-Ergebnis als
  bestanden zu melden. Keine Schemaänderung, keine Migration, keine neue
  API-Ressource, keine Änderung an Apple-/CalDAV-Verhalten, kein Merge und
  keine Arbeit an Paket 7 oder späteren Paketen.
