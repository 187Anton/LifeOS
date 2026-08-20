# Migrationsprotokoll: Mac-App und SQLite

Stand: 11. August 2026

Dieses Dokument ist der fortlaufende Nachweis für die in
[`mac-desktop-spike-plan.md`](mac-desktop-spike-plan.md) beschriebene Migration.
Ein Arbeitspaket gilt erst als abgeschlossen, wenn sein Ergebnis hier mit
tatsächlich ausgeführten Prüfungen dokumentiert ist.

## Statusübersicht

| Paket                             | Status                                          | Letzter Nachweis |
| --------------------------------- | ----------------------------------------------- | ---------------- |
| M0 – Ziel und Ausführungsplan     | abgeschlossen                                   | 9. August 2026   |
| M1 – SQLite-Schema und Migration  | abgeschlossen                                   | 9. August 2026   |
| M2 – API ohne Docker              | abgeschlossen                                   | 9. August 2026   |
| M3 – Kalender- und CalDAV-Parität | abgeschlossen                                   | 9. August 2026   |
| M4 – Datenübernahme und Recovery  | abgeschlossen                                   | 9. August 2026   |
| M5 – Tauri-Sidecar                | abgeschlossen                                   | 9. August 2026   |
| M6 – Installation und Update      | lokal erfolgreich; Produktfreigabe aufgeschoben | 11. August 2026  |
| M7 – Abschlussdokumentation       | offen                                           | –                |

## Nachweisvorlage

Jeder neue Eintrag verwendet diese Struktur:

- **Datum und Paket:**
- **Befund:**
- **Ursache oder Entscheidung:**
- **Änderungsumfang:**
- **Verifikation:**
- **Datenvergleich:**
- **Risiken und Grenzen:**
- **Nächster Schritt:**

Fehlgeschlagene Prüfungen werden mit Ursache und Auswirkung festgehalten. Ein
offener Handtest oder ein nicht geprüftes Release-Gate darf nicht als Erfolg
formuliert werden.

## 9. August 2026 – M0: Ziel und Ausführungsplan

- **Befund:** Der vorhandene Spike beschrieb Tauri, SQLite, sechs technische
  Arbeitspakete und Stop-Gates. Eine übergreifende Erfolgsdefinition, ein
  sichtbarer Paketstatus und ein einheitliches fortlaufendes Nachweisformat
  fehlten noch.
- **Ursache oder Entscheidung:** Die Migration wird als Folge einzeln
  freizugebender Pakete M1 bis M7 durchgeführt. Der nächste Schritt beginnt
  erst nach bestandenem Gate; PostgreSQL bleibt bis zum geprüften Import und
  Recovery-Nachweis erhalten.
- **Änderungsumfang:** Der Spike-Plan enthält jetzt das verbindliche
  Migrationsziel, Status und Gates, Dokumentationspflicht sowie Schutz- und
  Rückfallprinzip. Die Roadmap verweist auf dieses Protokoll.
- **Verifikation:** Markdown-Formatprüfung, Repository-Tests, Secret-Scan und
  Git-Diff-Prüfung wurden erfolgreich ausgeführt.
- **Datenvergleich:** Nicht anwendbar; M0 ändert keine Daten und kein
  Datenbankschema.
- **Risiken und Grenzen:** SQLite-, Sidecar-, Installations- und
  Recovery-Eigenschaften sind weiterhin Planungsannahmen und werden erst in M1
  bis M6 bewiesen.
- **Nächster Schritt:** M1 als eigenes Arbeitspaket planen und das
  repräsentative SQLite-Schema ausschließlich mit synthetischen Daten
  implementieren.

## 9. August 2026 – M1: SQLite-Schema und Migration

- **Befund:** Das PostgreSQL-Prisma-Schema enthält nicht direkt übertragbare
  Nativtypen, reine `DATE`-Felder und primitive Arrays. Prisma 7.8 validiert und
  generiert ein getrenntes SQLite-Schema. `prisma migrate deploy` scheitert in
  der geprüften lokalen Umgebung jedoch selbst bei einem Minimalmodell vor der
  SQL-Anwendung mit einem unspezifischen Schema-Engine-Fehler; das identische
  SQL lässt sich direkt fehlerfrei anwenden.
- **Ursache oder Entscheidung:** SQLite erhält einen eigenen Schema- und
  Migrationspfad. Reine Tage werden als kanonische `YYYY-MM-DD`-Strings und
  Erinnerungen als geprüftes JSON gespeichert. Ein kleiner
  `better-sqlite3`-Runner wendet ausschließlich sortierte versionierte
  SQL-Dateien transaktional an, speichert deren SHA-256-Prüfsumme und prüft
  anschließend Fremdschlüssel und Datenbankintegrität.
- **Änderungsumfang:** Repräsentative Modelle für Benutzer, Einstellungen,
  Zugangsdaten, Sitzung, CalDAV-Zugang, Kalender, Kalenderereignisse und Audit;
  eine SQLite-Grundmigration; ein synthetischer PostgreSQL-Export; wiederholbarer
  Import; getrennte Prisma-Konfiguration und drei Integrationstests. Das
  PostgreSQL-Schema und sämtliche vorhandenen PostgreSQL-Migrationen wurden
  nicht verändert.
- **Verifikation:** `db:sqlite:validate`, `db:sqlite:generate`,
  `db:sqlite:migrate`, zweimaliger `db:sqlite:seed`, TypeScript-Prüfung und drei
  SQLite-Integrationstests wurden erfolgreich ausgeführt. Zusätzlich bestanden
  Formatprüfung, Secret-Scan, Compose-Prüfung, vollständige Typprüfung, Linting,
  API- und Web-Build sowie 102 Tests: 12 Repository-, 39 API-, 26 Web-Unit-, 16
  Browser-E2E- und neun Datenbanktests.
- **Datenvergleich:** Ein zeitgebundener und ein ganztägiger Termin behalten ID,
  UID, ETag, Sequenz, Sync-Version, Kalender-Sync-Token, IANA-Zeitzone,
  Erinnerungen und Zeitform. Wiederholte Migration und wiederholter Seed ändern
  den ersten Snapshot nicht.
- **Risiken und Grenzen:** Die API verwendet noch PostgreSQL. ETag-Konkurrenz,
  kompletter CalDAV-Roundtrip, WAL-/Sperrverhalten, Backup, Sidecar und DMG sind
  noch nicht bewiesen. Der Prisma-Schema-Engine-Fehler wird nicht als gelöste
  Upstream-Ursache dargestellt. `npm audit --omit=dev` meldete sechs bereits im
  Ausgangs-Lockfile vorhandene transitive Tooling-Advisories; keiner der
  gemeldeten Pfade führt über den neuen SQLite-Adapter. Ihre Aktualisierung ist
  ein getrenntes Sicherheitsarbeitspaket.
- **Nächster Schritt:** M2 bindet den SQLite-Client hinter der zentralen
  Datenbankschnittstelle an und prüft das gebaute Express-Backend ohne Docker,
  ohne den `/api/v1`-Vertrag zu ändern.

## 9. August 2026 – M2: API ohne Docker auf SQLite

- **Befund:** Der bestehende API-Kern war nur an den PostgreSQL-Adapter
  gebunden. Das erste vollständige SQLite-Schema zeigte zwei konkrete
  Connector-Abweichungen: sofortiges `RESTRICT` blockierte eine atomare
  Besitzerlöschung, und `createMany(..., skipDuplicates)` wird für SQLite
  nicht unterstützt. Eine doppelte Ergebnisumwandlung an der
  Transaktionsgrenze verlängerte reine Datumswerte zunächst irrtümlich zu
  ISO-Zeitpunkten.
- **Ursache oder Entscheidung:** Die API erkennt den Provider ausschließlich
  an der validierten Datenbank-URL. Eine kleine Kompatibilitätsschicht wandelt
  nur die sieben reinen Datumsfelder zwischen `Date` und `YYYY-MM-DD` um.
  SQLite bildet schützende Referenzen mit aufgeschobenem `NO ACTION` statt
  sofortigem `RESTRICT` ab; Aufgaben-Termin-Beziehungen verwenden ein
  providerneutrales, idempotentes `upsert`. API-Verträge und PostgreSQL-Schema
  bleiben unverändert.
- **Änderungsumfang:** Zweite versionierte SQLite-Migration für Projekte,
  Aufgaben, Aufgaben-Termin-Beziehungen, Studium, Arbeit und Verfügbarkeit;
  providerabhängige Client-Fabrik; SQLite-Kompatibilitätsclient; absolute
  `file:`-Konfiguration der API; portable Dashboard-Transaktion;
  reproduzierbare SQLite-API-Suite und Neustartprüfung der gebauten API.
- **Verifikation:** SQLite-Schema validierte und generierte mit Prisma 7.8.
  Neun Datenbanktests und alle 41 API-Tests bestanden auf einer frisch
  migrierten SQLite-Datei. Der gebaute Server startete zweimal ohne Docker,
  meldete Readiness und bestand den Persistenzvergleich. Anschließend
  bestanden dieselben neun Datenbank- und 41 API-Tests auf PostgreSQL; der
  Container wurde danach datenerhaltend gestoppt. Der unveränderte Webweg
  bestand 26 Unit- und 16 Browser-E2E-Tests auf Desktop- und Mobile-Profilen.
- **Datenvergleich:** Benutzer und Anmeldung, geänderte Profilzeitzone,
  Kalenderansicht, Wochenendanzeige, Kalender-ID, ganztägige UID und exklusive
  Datumsgrenzen sowie Aufgaben-ID, Titel und Fälligkeit waren nach einem echten
  Prozessneustart identisch. Die bestehende CalDAV-Suite bestätigte zusätzlich
  Discovery, Ereignis-CRUD, ETags, Sync-Token, Tombstones, Zeitzonen,
  Wiederholung und Erinnerungen auf SQLite.
- **Risiken und Grenzen:** Die SQLite-API-Suite läuft bewusst seriell, weil die
  Testdateien jeweils eigene schreibende Clients öffnen; der Zielbetrieb hat
  genau einen Sidecar als schreibenden Prozess. WAL-Modus, Wartezeit bei
  Sperren und zwei tatsächlich konkurrierende ETag-Änderungen sind noch nicht
  geprüft. Der Nachweis verwendet das lokal installierte Node.js; dessen
  Sidecar-Paketierung folgt erst in M5. Backup, Import und physischer
  Apple-Kalender-Test sind ebenfalls offen.
- **Nächster Schritt:** M3 aktiviert und prüft die SQLite-Betriebsparameter und
  beweist REST-/CalDAV-Parität einschließlich konkurrierendem ETag-Konflikt und
  unverändertem Sync-Token des Verlierers.

## 9. August 2026 – M3: Kalender- und CalDAV-Parität

- **Befund:** M2 bestätigte die fachlichen Einzelabläufe, setzte WAL und eine
  Sperrwartezeit aber noch nicht ausdrücklich und startete keine zwei
  Änderungen mit demselben alten ETag gleichzeitig. Der physische
  Apple-Kalender-Zugriff ist ohne laufende LAN-fähige App weiterhin nicht
  verfügbar.
- **Ursache oder Entscheidung:** Der versionierte SQLite-Start schaltet die
  Datei vor Schemaänderungen persistent auf WAL. Jede `better-sqlite3`-
  Verbindung erhält eine explizite Wartezeit von 5000 Millisekunden. Die
  bestehende atomare ETag-Transaktion bleibt unverändert und wird durch einen
  providerübergreifenden Konkurrenztest statt durch eine zweite
  Kalenderimplementierung abgesichert.
- **Änderungsumfang:** Gemeinsame SQLite-Betriebskonstante, WAL-Aktivierung im
  Migrationsrunner, automatisierte Prüfung beider PRAGMAs, neuer paralleler
  Kalender-Repositorytest sowie erweiterter Neustartvergleich für
  Kalenderidentitäten und Synchronisationswerte.
- **Verifikation:** Drei SQLite-Migrationsfälle bestätigten Migration,
  Fremdschlüssel, `journal_mode=wal`, `busy_timeout=5000` und Integrität. Alle
  42 API-, Kalender- und CalDAV-Fälle bestanden auf einer frisch migrierten
  SQLite-Datei. Dieselben 42 Fälle bestanden auf PostgreSQL; der Container
  wurde anschließend datenerhaltend gestoppt. Die gebaute SQLite-API bestand
  erneut den zweimaligen Prozessstart.
- **Datenvergleich:** Nach dem Neustart waren UID, ETag, Sequenz, Zeitzone,
  RRULE, Erinnerung und exklusive Ganztagsgrenzen identisch; persistierte
  `syncVersion` und Kalender-`syncToken` stimmten überein. Im Konkurrenzfall
  erhöhte nur der Gewinner Sequenz, Sync-Token und Update-Audit um eins; der
  Verlierer wurde als `EtagConflictError` zurückgerollt.
- **Risiken und Grenzen:** Der automatisierte Zielbetrieb verwendet
  entsprechend der Architektur genau einen schreibenden Sidecar. Verhalten
  mehrerer unabhängiger schreibender Prozesse ist nicht freigegeben. Der
  physische Apple-Kalender-Handtest ist ausdrücklich offen und wird in M5/M6
  durchgeführt, sobald App und LAN-Betrieb real erreichbar sind. Import,
  Backup und Restore sind noch nicht nachgewiesen.
- **Nächster Schritt:** M4 implementiert einen ausschließlich lesenden
  PostgreSQL-Export in eine neue SQLite-Datei sowie prüfsummengeschütztes
  Online-Backup und Restore mit automatisiertem Identitätsvergleich.

## 9. August 2026 – M4: Datenübernahme und Recovery

- **Befund:** PostgreSQL-Backup und Restore waren bereits sicher, für den
  SQLite-Zielbetrieb fehlten aber ein vollständiger Import aller Fachmodelle,
  ein Online-Backup und die gemeinsame Wiederherstellung von Datenbank und
  Dokumentverzeichnis. Ein direkter Schreibzugriff auf die Zieladresse hätte
  bei einem späten Vergleichsfehler eine unvollständige Datei sichtbar lassen
  können.
- **Ursache oder Entscheidung:** Quelle, Staging und Veröffentlichung werden
  strikt getrennt. PostgreSQL wird unter `REPEATABLE READ` und `READ ONLY`
  gelesen. Import, Backup und Restore arbeiten mit zufälligen Stagingzielen und
  verweigern vorhandene Endziele. Eine Datei gilt erst nach vollständigem
  Daten-, Fremdschlüssel-, Integritäts- und Prüfsummenvergleich als nutzbar.
- **Änderungsumfang:** Vollständiger Importer für 19 Modelle; kanonischer
  Feldvergleich; SQLite Online Backup; versioniertes Manifest mit SHA-256 für
  Datenbank und Dokumente; traversal- und symlink-sichere Dokumentkopie;
  Restore mit Migration in neue Ziele; CLI-Befehle und ein isolierter
  synthetischer Recovery-Test.
- **Verifikation:** `npm run db:sqlite:verify:recovery` lief auf der isolierten
  PostgreSQL-Testdatenbank erfolgreich. Der Test legte für jedes Fachmodell
  mindestens einen Datensatz und zwei Dokumente an, importierte in eine neue
  SQLite-Datei, sicherte sie bei geöffneter Anwendungsverbindung und
  restaurierte sie in neue Ziele. Manipuliertes Manifest, veränderte
  Datenbankdatei, vorhandenes Importziel und vorhandenes Restore-Ziel wurden
  abgelehnt. PostgreSQL wurde anschließend datenerhaltend gestoppt.
- **Datenvergleich:** Der Import verglich jeden skalaren Wert aller 19 Modelle,
  einschließlich UUIDs, UTC-Zeitpunkten, reinen Tagen, Decimal-, Enum-, JSON-
  und Arraywerten. Der Restore erhielt Benutzer-ID, Ereignis-UID und -ETag,
  Sync-Version, Aufgabenfälligkeit, Dokumentreferenz und beide
  Dokumentinhalte. Eine erst nach dem Backup erzeugte Auditzeile fehlte im
  Restore und bestätigte damit den konsistenten Sicherungszeitpunkt.
- **Risiken und Grenzen:** Backups sind nicht verschlüsselt und enthalten
  persönliche Daten; sie benötigen restriktive Dateirechte und vertrauliche
  Aufbewahrung. Der Import bricht ab, wenn sich die Quelle zwischen Export und
  Abschlussvergleich ändert; für einen echten Umzug soll der schreibende
  PostgreSQL-Betrieb daher pausiert werden. Automatische App-Pfade und
  Updateintegration folgen in M5/M6.
- **Nächster Schritt:** M5 bündelt Weboberfläche und gebautes Express-Backend
  als Tauri-Sidecar, übergibt die App-Datenpfade und prüft Start, Readiness,
  Browserzugriff sowie geordnetes Beenden ohne globales Node.js.

## 9. August 2026 – M5: Tauri-App mit gebündeltem Sidecar

- **Befund:** Die bestehende Weboberfläche und API waren einzeln lokal
  lauffähig, aber noch keine installierbare Anwendung. Ein Tauri-Prozess muss
  einen freien Loopback-Port wählen, private App-Pfade übergeben, den
  API-Prozess überwachen und erst nach erfolgreicher Readiness die Oberfläche
  öffnen. Ein auf dem Entwicklungsrechner vorhandenes Node.js darf dabei keine
  versteckte Laufzeitvoraussetzung sein.
- **Ursache oder Entscheidung:** Tauri 2 bleibt eine dünne native Hülle. Es
  startet das gebaute Express-Backend mit einer fest versionierten offiziellen
  Node.js-22-Laufzeit als Sidecar. Express liefert die gebaute React-App und
  `/api/v1` über denselben dynamischen `127.0.0.1`-Port aus; dadurch gilt auch
  für das Sitzungs-Cookie dieselbe Herkunft. SQLite-Migrationen laufen vor dem
  Serverstart automatisch.
- **Änderungsumfang:** Neue Desktop-Workspace-App, Rust-Lifecycle für freien
  Port, Readiness, Startfehler, Protokoll und geordnetes Beenden; reproduzierbar
  vorbereitete ARM64-Sidecars mit SHA-256-Prüfung und Prüfung der dynamischen
  Systembibliotheken; gebündelte Web-, API- und Migrationsressourcen;
  Desktop-Build und automatisierter Sidecar-Prüflauf. Die API kann ihre
  Web-Assets optional selbst ausliefern und unterscheidet sichere Cookies nach
  der tatsächlichen HTTPS-Herkunft.
- **Verifikation:** Die ARM64-`.app` wurde gebaut und außerhalb des Terminals
  gestartet. Sie zeigte die echte LifeOS-Anmeldung, meldete API-Readiness und
  verwendete eine automatisch migrierte SQLite-Datei. Der automatisierte
  Prüflauf startete den gebündelten Server zweimal ohne Homebrew-Node im
  Suchpfad, prüfte Webzugriff, Readiness, CalDAV-Authentifizierungsgrenze, WAL,
  Migrationen, Integrität und private Dateirechte. Beim Beenden protokollierte
  die API `server.shutdown.completed`; danach blieb kein Desktop- oder
  Sidecar-Prozess zurück. Rusts drei Lifecycle-Tests, sämtliche 46 API- und
  CalDAV-Fälle auf SQLite und PostgreSQL, neun Datenbanktests, 26 Web-Unit- und
  16 Browser-E2E-Tests sowie Typprüfung, Linting, Build, Repository- und
  Secret-Prüfung bestanden.
- **Datenvergleich:** Beide Sidecar-Starts verwendeten dieselbe SQLite-Datei
  und denselben Migrationsstand. WAL, Fremdschlüssel- und Integritätsprüfung
  blieben gültig. Der Lauf erzeugte ausschließlich leere synthetische
  App-Daten; persönliche Bestandsdaten wurden nicht importiert oder verändert.
- **Risiken und Grenzen:** Die erzeugte App ist nur ad-hoc signiert. Developer
  ID, Apple-Notarisierung, DMG, terminalfreie Ersteinrichtung, Update und
  Rollback sowie ein Test auf einem sauberen unterstützten Mac sind M6-Gates.
  Der aktuelle Desktop-Prototyp bindet absichtlich nur an Loopback; ein
  physischer Apple-Kalender-Test über LAN ist daher weiterhin offen. Das
  Desktop-Paket unterstützt aktuell die verifizierte ARM64-Zielarchitektur;
  der vorbereitete x64-Prüfsummenpfad ist noch nicht auf Intel gebaut.
  `npm audit --omit=dev` meldet sechs bekannte Advisorys (fünf moderat, eines
  hoch) ausschließlich über die im Arbeitsbereich installierten Prisma-CLI-
  und PWA-Buildketten; diese Pakete werden nicht als Abhängigkeiten neben der
  gebündelten Produktions-App ausgeliefert. Abhängigkeitsupdates bleiben ein
  eigenes Sicherheitsarbeitspaket und dürfen nicht mit `npm audit fix`
  ungeprüft in diese Migration gezogen werden.
- **Nächster Schritt:** M6 erzeugt und prüft ein DMG, ergänzt die
  terminalfreie Ersteinrichtung und dokumentiert Signatur-, Notarisierungs-,
  Update- und Rollback-Gates. Nicht verfügbare Apple-Zertifikate oder ein
  fehlender sauberer Test-Mac werden als externe Blocker ausgewiesen und nicht
  als bestanden behauptet.

## 9. August 2026 – M6: DMG, Ersteinrichtung, Update und Rollback

- **Befund:** Tauri erzeugte die `.app`, sein kosmetischer DMG-Schritt wartete
  in dieser Umgebung jedoch erfolglos auf ein Finder-AppleScript. Außerdem war
  zunächst nur die Signatur einzelner Binärdateien vorhanden; die strikte
  Prüfung des gesamten Bundles meldete fehlende signierte Ressourcen.
- **Ursache oder Entscheidung:** Das funktionale DMG wird reproduzierbar mit
  `hdiutil` aus der bereits geprüften App und einem Programme-Link erzeugt,
  ohne den fehleranfälligen kosmetischen Finder-Schritt. Native Binärdateien
  und Bundle werden explizit signiert: lokal ad-hoc, später über dieselbe
  Schnittstelle mit einer gesetzten Developer-ID. Eine einmalige, nur über
  Loopback erreichbare API richtet Profil, Einstellungen, Primärkalender und
  beide getrennten Zugänge atomar ein.
- **Änderungsumfang:** DMG-Build und -Verifier, konsistente lokale
  Bundle-Signatur, isolierbarer Installations-Testpfad, einmalige
  Ersteinrichtungs-API und responsive Oberfläche sowie Unit-, API- und
  Browsertests. README und Desktop-/API-Dokumentation trennen installierte App
  und Entwicklungsbetrieb.
- **Verifikation:** Das ARM64-DMG bestand `hdiutil verify`, ließ sich
  schreibgeschützt mounten und enthielt App sowie Programme-Link. Die daraus
  kopierte App bestand `codesign --verify --deep --strict`, startete mit
  ausschließlich `/usr/bin:/bin` im Suchpfad und zeigte auf leerer SQLite-Datei
  die echte Ersteinrichtung. Die SQLite-API-Suite bestand 47 Fälle, die
  PostgreSQL-API-Suite ebenfalls 47 Fälle. Zusätzlich bestanden 9
  Datenbanktests, 28 Web-Unit-, 16 Browser-E2E-, 4 Desktop- und 12
  Repository-Tests sowie Typprüfung, Linting, Format-, Build- und Secret-
  Prüfung. Das in diesem Lauf geprüfte DMG hatte die SHA-256-Prüfsumme
  `96563589782571789fe40d7a996b1141a21ef95fe50372300ed73964550abf73`.
- **Datenvergleich:** Vor dem App-Austausch wurde ein Online-Backup erzeugt.
  Update 0.1.0 → 0.1.1, Neustart und Rollback auf 0.1.0 erhielten Benutzer-ID,
  Kalender-ID, Ereignis-UID und -ETag, `syncVersion` und `syncToken`. Der
  Restore in eine neue Datenbank lieferte dieselben Werte; beide Dateien
  bestanden `integrity_check`. Beim anschließenden Entfernen beider isolierten
  App-Versionen blieben SQLite-Daten und Update-Backup erhalten; die
  Nutzerdatenbank bestand danach erneut `integrity_check`.
- **Risiken und Grenzen:** Der Test lief mit isolierten App- und Datenpfaden auf
  dem Entwicklungs-Mac, nicht auf einem zweiten sauberen Gerät. Im
  Schlüsselbund ist keine Developer-ID vorhanden; Notarisierung und
  Gatekeeper-Downloadpfad sind daher nicht nachgewiesen. Intel-/Universal-Build,
  automatische Updateverteilung, Backup-Oberfläche und physischer
  Apple-Kalender-Test über LAN bleiben offen. Das DMG ist noch kein öffentlich
  freigegebenes Release.
- **Nächster Schritt:** Der Quellcode wird nach `develop` als Draft-PR zur
  Prüfung gestellt. Developer-ID, Notarisierung, GitHub-Produktrelease,
  Zweit-Mac-, Universal-/Intel-, Updater- und physischer Apple-Kalender-Test
  bleiben ausdrücklich einem späteren Produktrelease-Arbeitspaket vorbehalten.

## 11. August 2026 – M6: lokaler Quellcodeabschluss

- **Befund:** Der Anwendungscode war bei `9d5a4ce` vollständig lokal geprüft;
  die Roadmap nannte dennoch nur M0 bis M5 und die README führte die bereits
  vorhandenen DMG-Befehle nicht auf.
- **Ursache oder Entscheidung:** M6 wird als „lokal erfolgreich, öffentliche
  Produktfreigabe aufgeschoben“ abgeschlossen. Begonnene Notarisierungs- und
  öffentliche Release-Skripte gehören nicht in diesen Quellcode-PR und wurden
  entfernt.
- **Änderungsumfang:** Ausschließlich Abschlussdokumentation in README,
  Desktop-README, Roadmap, Migrationsplan, Migrationsprotokoll und Leitfaden;
  kein Anwendungs-, Datenbank- oder Migrationscode wurde geändert.
- **Verifikation:** Der unveränderte ARM64-Build und `desktop:verify:dmg`
  bestanden erneut; der gebündelte Node-22.23.2-Sidecar startete aus der
  kopierten App zweimal ohne Homebrew-Pfad. Git-Diff-Prüfung, Formatprüfung,
  Secret-Scan und alle 12 Repository-Tests bestanden. Der aktualisierte
  22-seitige Leitfaden wurde vollständig gerendert und visuell geprüft. Das
  zuletzt geprüfte lokale DMG hat die SHA-256-Prüfsumme
  `9648de7f17294e3619b66772c87c26703e336460c6c55a54237e50cc8207c913`.
- **Datenvergleich:** Nicht erneut erforderlich, da dieser Abschluss keine
  Fachlogik oder Datenpfade verändert. Der zuvor dokumentierte SQLite-/
  PostgreSQL-, Kalender-, CalDAV-, Import-, Backup-, Restore-, Update- und
  Rollback-Nachweis bleibt unverändert maßgeblich.
- **Risiken und Grenzen:** Das lokal ad-hoc signierte DMG ist kein öffentliches
  Produktrelease. Alle externen Apple- und Geräte-Gates bleiben offen.
- **Nächster Schritt:** Kleinen Dokumentations-Commit erstellen, den gesamten
  Unterschied zu `origin/develop` prüfen und – bei gültiger GitHub-
  Authentifizierung – als Draft-PR nach `develop` veröffentlichen.

## 20. August 2026 – Roadmap 0.5.4: sicher deaktivierter Integrationspfad

- **Befund:** Die externe CalDAV-Integration benötigt einen getrennten
  Verschlüsselungsschlüssel. Die Mac-App stellt bewusst noch keinen
  Schlüsselbundpfad bereit und darf deshalb nicht versehentlich mit einem
  über die Elternumgebung geerbten Zugang nach außen kommunizieren.
- **Entscheidung:** Der Sidecar erhält keinen `INTEGRATION_SECRET_KEY`. Sein
  authentifizierter Statusendpunkt muss `available: false`,
  `networkDefault: disabled` und eine leere Verbindungsliste liefern. Ein
  späterer nativer Aktivierungspfad benötigt eine eigene geprüfte
  Schlüsselbund-Integration.
- **Verifikation:** `npm run desktop:verify:sidecar` baute Web und API, wendete
  alle neun SQLite-Migrationen einschließlich
  `20260820210000_external_caldav` an, richtete nur ein synthetisches Profil
  ein, prüfte den deaktivierten Integrationsstatus und startete den
  gebündelten Node-22.23.2-Sidecar zweimal ohne Homebrew-Pfad. Zusätzlich
  bestanden der gebaute SQLite-Neustart, 72 SQLite-API-Fälle, PostgreSQL- und
  SQLite-Recovery sowie der externe CalDAV-Browserablauf auf Desktop und
  Smartphone.
- **Grenzen:** Keine produktive externe CalDAV-Verbindung, kein echter
  Apple-Zugang, kein Mac-Schlüsselbundpfad, kein bidirektionales Schreiben und
  keine Hintergrundsynchronisation wurden geprüft oder als freigegeben
  behauptet.

## 20. August 2026 – Roadmap 0.5.5: deaktivierte GitHub-Leseintegration

- **Befund:** Auch ein lesendes GitHub-Token benötigt einen sicheren lokalen
  Geheimnispfad. Der Mac-Prototyp darf ohne native Schlüsselbundfreigabe kein
  aus der Umgebung geerbtes Token oder Integrationsschlüssel verwenden.
- **Entscheidung:** Der Sidecar erhält keinen `INTEGRATION_SECRET_KEY`. Der
  authentifizierte GitHub-Status muss deshalb `available: false`, den
  Netzwerkstandard `disabled` und eine leere Verbindungsliste liefern.
  Produktive Tokens, OAuth und GitHub-Schreibaktionen bleiben ausgeschlossen.
- **Verifikation:** Der Sidecar-Nachweis wendet alle zehn SQLite-Migrationen
  einschließlich `20260820220000_github_integration` an und prüft den sicheren
  Status vor dem zweiten Start. API, Datenbank, Recovery und Browser verwenden
  nur synthetische Daten beziehungsweise Adapter.
- **Grenzen:** Kein produktives Token, keine echte GitHub-Anmeldung, keine
  native Schlüsselbundablage, keine Webhooks, keine Hintergrundsynchronisation
  und keine Schreibberechtigung wurden geprüft oder freigegeben.
