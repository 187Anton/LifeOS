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
Produktdokumentation und nimmt das gesamte Paket 2 ab. Kein Teilpaket gilt
allein als abgeschlossenes Paket 2; DB-Reste bleiben bis Paket 3 erhalten.

| Paket | Umfang und Einstieg                                                           | Erforderliche Abnahme zusätzlich zur Pflicht-CI                                                                                                                   |
| ----- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Dieser Plan, Fortschritt, Startanleitung; README-/AGENTS-Verweis              | Inhalt konsistent, Format/Links/Diff geprüft; PR nach develop                                                                                                     |
| 1     | Einstellungen und Integrationseinbettung; Shell/App/IntegrationsWorkspace     | Desktop/mobile Navigation, Tastatur/Fokus, bestehende Integration bleibt bedienbar; drei schnelle Neuanlagen                                                      |
| 2     | Finanzoberfläche/API/aktive Verträge entfernen; finance-Modul und Verbraucher | Keine Finanznavigation oder aktive Schreibroute, betroffene Unit/API/UI-Tests aktualisiert; DB-Reste ausdrücklich bis Paket 3                                     |
| 3     | Finanzschema, Seeds, Import/Recovery, TaskArea bereinigen                     | PostgreSQL und SQLite: neue Installation, Altdatenupgrade, Backup/Restore, Neustart; übrige Fachobjekte erhalten                                                  |
| 4     | Optionaler Studienmodulbezug, Verträge/API und gemeinsamer Aufgabeneditor     | Besitzerprüfung, Zuordnung/Entfernung, Projekt plus Modul, Archivfälle, Filter; Migration/Recovery beider Provider                                                |
| 5     | Gemeinsame Kalender-/Planungsansichten                                        | Alle vier Kalenderansichten, Frist versus Zeitblock, keine Duplikate, Sommerzeit/Serien, Status und Bearbeitung aus Kalender                                      |
| 6     | Moduldetailseite, gemeinsame Dokument-/Notizbedienung                         | Modul → Datei/Notiz/Aufgabe/Termin → Bearbeiten; echte Desktop/mobile Abläufe, Leer-/Fehlerfälle, Suche öffnet Objekt                                             |
| 7     | PDF-Textextraktion und modulspezifische Suche                                 | Fundstellen/Seiten, geschützte/defekte/zu große Dateien, Altdateien, Suchfreigabe/Widerruf/Löschung; lokale App ohne Zusatzinstallation                           |
| 8     | PPTX/DOCX ergänzen                                                            | Folien-/Absatzfundstellen, ZIP-Größenlimits, keine Makros/externen Abrufe; Regression PDF/Text/Notizen                                                            |
| 9     | Verwaltete Aufgaben-CalDAV-Abbildung                                          | Erstellen/Lesen/Ändern/Löschen, ETag-Konflikt mit vollständigem Rollback, Sync-Token, UID-Stabilität, Frist/Block, Duplikatfreiheit, Bestand und Wiederverbindung |
| 10    | Stabile Mac-/LAN-Erreichbarkeit, Einrichtung                                  | Authentifizierung/negative Netzwerkfälle, keine Web-API-Freigabe, Portkonflikt, Quit/Neustart, Mac und iPhone verschieben denselben Block                         |
| 11    | Gesamtabnahme, dokumentierter main-PR und lokales App-Update                  | Vollständiger Studienablauf, echte Apple-Tests, geprüfte Backups/Updates und neues lokales DMG; keine öffentliche Veröffentlichung                                |

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
