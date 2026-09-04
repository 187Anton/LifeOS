# Verifikation des Fundaments 0.1

Dieses Dokument ist der reproduzierbare Abschlussnachweis für die lokalen
Arbeitspakete #9 bis #17. Alle Beispiele verwenden ausschließlich synthetische
Daten. Echte Passwörter, Kalenderinhalte oder Unternehmensdaten gehören nicht
in diesen Ablauf.

## Lokale Demo von einem sauberen Stand

Voraussetzungen sind Node.js 22, npm 10 oder neuer, Docker mit Compose sowie
ein lokal verfügbares Chrome für die Playwright-Tests.

```bash
npm ci
cp .env.example .env
npm run security:secrets
npm run db:start
npm run db:migrate
npm run db:seed
```

Danach werden Web- und CalDAV-Passwort getrennt und nur temporär gesetzt:

```bash
read -s LIFEOS_BOOTSTRAP_PASSWORD
export LIFEOS_BOOTSTRAP_PASSWORD
npm run auth:bootstrap
unset LIFEOS_BOOTSTRAP_PASSWORD

read -s LIFEOS_CALDAV_PASSWORD
export LIFEOS_CALDAV_PASSWORD
npm run caldav:bootstrap
unset LIFEOS_CALDAV_PASSWORD
```

API und Weboberfläche laufen in zwei Terminals:

```bash
npm run api:start
npm run web:dev
```

Unter `http://127.0.0.1:5173` muss nach der Anmeldung die lokale Testperson mit
dem Kalender `Persönlicher Kalender` und dem synthetischen Termin erscheinen.
Ein neuer Termin muss nach dem Neuladen erhalten bleiben. `npm run db:stop`
beendet PostgreSQL anschließend ohne das benannte Volume zu löschen.

## Automatisches Abschluss-Gate

```bash
npm run format:check
npm run repo:check
npm run security:secrets
npm run lint
npm run typecheck
npm run build
npm run db:verify:recovery
npm test
```

Die Prüfungen decken folgende Schichten ab:

| Bereich                | Nachweis                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| Repository und Compose | Struktur, sichere Ignore-Regeln, lokale Portbindung und datenerhaltender Stop               |
| API und Profil         | Konfiguration, Health/Readiness, Fehlervertrag, Hashing, Sitzung und Audit                  |
| Kalender               | CRUD, Ganztag, Zeitzone, RRULE, Erinnerungen, UID, ETag, Konflikt und Soft-Delete           |
| CalDAV                 | Discovery, PROPFIND/REPORT/GET/PUT/DELETE, Sync-Token, VTIMEZONE und Widerruf               |
| Web/PWA                | Lade-/Leer-/Fehlerzustand, API-Client, Desktop/Mobil, CRUD, Manifest und Offline-Shell      |
| Datenbank              | leere Migration, wiederholter Seed, Custom-Format-Dump, Restore und stabiler Datenvergleich |
| Sicherheit             | hochsichere Provider-Muster, Private-Key-Blöcke und feste sensible Zuweisungen              |

`db:verify:recovery` erzeugt zwei eindeutig benannte, isolierte Datenbanken.
Es migriert und seedet die erste Datenbank, legt getrennte synthetische
Zugänge an, wiederholt Migration und Seed, erstellt einen PostgreSQL-Dump und
stellt ihn in der zweiten Datenbank wieder her. Anschließend werden stabile
Profil-, Einstellungs-, Zugangs-, Kalender-, Ereignis- und Auditwerte
verglichen. Ein `trap` entfernt beide Datenbanken und den temporären Dump auch
bei einem Fehler. Die konfigurierte LifeOS-Datenbank und ihr Volume werden
nicht verändert oder gelöscht.

## Echtes lokales Backup und sichere Wiederherstellung

Ein Backup der aktuell konfigurierten lokalen Datenbank wird bewusst manuell
ausgelöst:

```bash
npm run db:backup
```

Der Befehl schreibt ein nicht versioniertes Custom-Format-Archiv und eine
SHA-256-Prüfsumme nach `backups/`. Das Archiv enthält persönliche Daten und
muss wie ein Secret geschützt werden. Zuerst wird die Prüfsumme kontrolliert:

```bash
cd backups
shasum -a 256 -c <backup-datei>.dump.sha256 # macOS
# oder: sha256sum -c <backup-datei>.dump.sha256 # Linux
cd ..
```

Danach wird die Wiederherstellbarkeit vor Updates isoliert geprüft:

```bash
npm run db:verify:recovery
```

Eine reale Wiederherstellung erhält zwingend einen neuen Zielnamen:

```bash
npm run db:restore -- backups/<backup-datei>.dump lifeos_restore_20260722
```

Der Befehl akzeptiert nur neue Datenbanknamen mit Präfix `lifeos_restore_`,
verlangt eine reguläre SHA-256-Datei und prüft anschließend die Archivstruktur, stellt mit
`--exit-on-error` wieder her und wendet ausstehende Migrationen an. Bei einem
Fehler wird nur die neu angelegte Zieldatenbank entfernt. Die konfigurierte
Quelldatenbank bleibt unverändert.

Der sichere Ablauf lautet:

1. API stoppen und Backup sowie Prüfsumme in eine gesicherte lokale Kopie
   übernehmen.
2. Mit `pg_restore --list` das Archiv prüfen.
3. Mit `npm run db:restore -- … lifeos_restore_<name>` in eine neue,
   eindeutig benannte Zieldatenbank wiederherstellen.
4. `DATABASE_URL` nur für die Prüfung auf das Ziel setzen, Migration,
   Readiness und Kalenderdaten kontrollieren.
5. Erst nach erfolgreicher Kontrolle bewusst auf die wiederhergestellte
   Datenbank umstellen; die Quelle bis dahin behalten.

Der automatisierte Nachweis verwendet genau dieses Verfahren. PostgreSQL
dokumentiert Custom-Format-Dumps als flexible, komprimierte Archive für
`pg_restore`: [pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html)
und [pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html).
Nur selbst erstellte und vertrauenswürdige Dumps dürfen wiederhergestellt
werden, weil ein Restore Anweisungen aus dem Archiv ausführt.

Dokumente sind nicht Teil des PostgreSQL-Dumps. Sie werden mit
`npm run documents:backup -- /absoluter/neuer/pfad` gesichert und mit
`npm run documents:restore -- /absoluter/pfad` ausschließlich in ein neues
`STORAGE_PATH` restauriert. Manifest und jede Datei sind durch SHA-256
geschützt. Der vollständige aktuelle Ablauf steht im
[`Recovery-Nachweis 0.6.2`](reliability-recovery-0.6.md).

## Apple-Kalender-Handtest im lokalen Netz

Der automatisierte CalDAV-Test bildet einen Apple-ähnlichen Client vollständig
synthetisch ab. Die physische Geräteprüfung bleibt zusätzlich notwendig, weil
Netzwerk, Firewall und iOS-Version nicht in CI nachgebildet werden können.

Vorbereitung:

1. Mac und iPhone befinden sich im selben vertrauenswürdigen WLAN.
2. `npm run db:start`, Migration, Seed und `npm run caldav:bootstrap` sind
   erfolgreich.
3. Die API läuft bewusst mit `API_HOST=0.0.0.0 npm run api:start`.
4. Die LAN-IP des Macs ist bekannt; `localhost` darf auf dem iPhone nicht
   verwendet werden.
5. Diese HTTP-Verbindung wird niemals in einem fremden oder öffentlichen Netz
   benutzt. Dort ist TLS vor der API Pflicht.

Apple beschreibt den aktuellen Weg als **Einstellungen → Apps → Kalender →
Kalenderaccounts → Account hinzufügen → Anderen Account hinzufügen →
CalDAV-Account**. Danach werden Server-/Accountdaten eingetragen:
[Apple iPhone-Benutzerhandbuch](https://support.apple.com/en-euro/guide/iphone/iphc37be2016/ios).

Für LifeOS:

- Server: `<LAN-IP>:3000/caldav/`
- Benutzername: `local`
- Passwort: das lokal gesetzte CalDAV-Passwort
- SSL: für diesen ausdrücklich lokalen HTTP-Test aus

Checkliste:

- [ ] Account wird ohne wiederholte Passwortabfrage angelegt; LifeOS-Kalender erscheint.
- [ ] Der synthetische Seed-Termin ist auf dem iPhone mit korrekter Berliner Zeit sichtbar.
- [ ] Ein zeitgebundener iPhone-Termin erscheint nach Aktualisierung in der LifeOS-Weboberfläche.
- [ ] Titel und Zeit lassen sich auf beiden Seiten ändern, ohne eine zweite UID zu erzeugen.
- [ ] Ein ganztägiger Termin behält Start- und exklusives Enddatum.
- [ ] Ein wiederholter Termin mit Erinnerung bleibt nach erneutem Abruf erhalten.
- [ ] Löschen auf dem iPhone entfernt den Termin aus der aktiven LifeOS-Liste.
- [ ] Parallele Änderung erzeugt keinen stillen Überschreibvorgang oder Duplikat; der veraltete ETag wird abgelehnt und neu geladen.
- [ ] `npm run caldav:revoke` sperrt nur CalDAV; die Web-Anmeldung bleibt nutzbar.

Das Ergebnis wird mit Datum, iPhone-Modell, iOS-Version, LifeOS-Commit und
Abweichungen notiert. Ein fehlendes physisches Gerät ist eine dokumentierte
Testgrenze und kein automatisierter Erfolgsnachweis.

## Ergänzender Fitness-Nachweis 0.5.2

Der Fitness-Nachweis ergänzt die allgemeine Matrix um `npm run db:test`,
`npm run db:sqlite:test`, `npm run test:sqlite:api`, den
PostgreSQL-zu-SQLite-Transfer-/Recovery-Test, `npm run
desktop:verify:sidecar` sowie den Playwright-Ablauf „verwaltet Fitness lokal“.
Er prüft ausschließlich synthetische Pläne, Übungen, Einheiten, Sätze und
Gewichtswerte. Ein Kalenderbezug muss UID, ETag und Sync-Version unverändert
lassen; Browser-Storage und externe Übertragung bleiben leer.

## Ergänzender ICS-Nachweis 0.5.3

Der ICS-Nachweis ergänzt die Kalender- und CalDAV-Suite um Vorschau, atomaren
Commit und Export. Synthetische Fälle prüfen Zeitpunkte, `VTIMEZONE`, Ganztag,
RRULE, Erinnerung, doppelte und abweichende UIDs, fehlerhafte Dateien,
wiederholten Import, fremde Kalender, abgelaufene Vorschauen sowie die Grenzen
von 2 MiB, 500 Ereignissen und 1000 Wiederholungen. PostgreSQL, SQLite,
Browser- und Sidecar-Prüfung verwenden denselben `/api/v1`-Kalenderkern.

## Ergänzender externer CalDAV-Nachweis 0.5.4

Der externe CalDAV-Nachweis verwendet ausschließlich einen synthetischen
Adapter und keine produktiven Zugangsdaten. API-Tests prüfen fehlende Sitzung,
fremde IDs, standardmäßige Deaktivierung, AES-256-GCM-Chiffretext,
verbotene HTTP-/Loopback-/Private-/Metadata-Ziele, Timeoutfehler ohne fremden
Antwortkörper, ungültige ICS-Ressourcen, maximal 20 Verbindungen, manuelle
Vorschau, bestätigten Import, stabile UID-/ETag-Zuordnung und vollständigen
Widerruf. Datenbank-, SQLite- und Recovery-Tests vergleichen Verbindung,
Kalender und Zuordnungen. Playwright prüft Desktop und Smartphone ohne
Browser-Storage. Der Sidecar-Nachweis startet ohne Integrationsschlüssel und
erwartet deshalb `available: false` sowie ausbleibende externe Übertragung.

## Ergänzender GitHub-Nachweis 0.5.5

Der GitHub-Nachweis verwendet ausschließlich einen synthetischen Adapter und
keine produktiven Tokens. API-Tests prüfen fehlende Sitzung, fremde IDs,
standardmäßige Deaktivierung, verschlüsselten Chiffretext, Einmalübertragung,
maximal fünf Verbindungen, widerrufene Verbindungen, ungültige Eingaben,
Berechtigungs- und Rate-Limit-Fehler sowie die flüchtige Ausgabe aller fünf
Metadatenbereiche. Datenbank-, SQLite-, Transfer- und Recovery-Prüfungen
vergleichen nur Konfiguration und Status, weil externe Inhalte bewusst nicht
persistiert werden. Playwright prüft Desktop und Smartphone ohne
Browser-Storage. Der Sidecar startet ohne Integrationsschlüssel und muss
`available: false` melden.

## Roadmap-0.5-Stabilisierung und lokale Demo

Der Abschlusslauf kombiniert die vollständige automatisierte Suite mit einer
real gestarteten, gebauten LifeOS-Oberfläche an einem gemeinsamen
Loopback-Ursprung. Eine neue temporäre SQLite-Datei erhielt alle zehn
Migrationen und ausschließlich synthetische Seed-Daten. Im Browser wurden
Finanz-Anlage, Änderung, Auswertung und Export, Fitness-Fortschritt sowie
ICS-Vorschau, Commit und Export geprüft. Externes CalDAV und GitHub meldeten
ohne Integrationsschlüssel `available: false`; der Browser protokollierte keine
Konsolenfehler. Das temporäre Demo-Verzeichnis wurde anschließend entfernt.

Die Demo reproduzierte außerdem eine Constraint-Verletzung beim Widerruf einer
zukünftig datierten synthetischen Sitzung. Der korrigierte Bootstrap verwendet
nun je Sitzung frühestens deren Erzeugungszeitpunkt. Unit-Test und realer
SQLite-Bootstrap mit einer 2030-Sitzung belegen diesen Recovery-Randfall. Die
vollständige Matrix und offene Gates dokumentiert
[`roadmap-05-local-demo.md`](roadmap-05-local-demo.md).

## Bekannte Grenzen und Folgearbeiten

- LifeOS unterstützt im Fundament genau ein lokales Profil und keine
  öffentliche Registrierung oder Passwort-Wiederherstellung. Ein neues
  Passwort wird per Bootstrap gesetzt.
- Der Standardbetrieb bindet die API an Loopback. LAN-Zugriff ist eine bewusste
  Testbetriebsart; ein öffentlicher Betrieb ohne TLS ist untersagt.
- Der CalDAV-Server stellt LifeOS-Kalender bereit. Eine iCloud-/externe
  CalDAV-Clientintegration ist ein späteres, getrenntes Arbeitspaket.
- RRULE-Werte werden verlustarm gespeichert und unterstützte Serien in den
  Kalenderansichten projiziert. Ein visueller Serieneditor und die getrennte
  Bearbeitung einzelner Ausnahmen sind noch nicht implementiert; Änderungen
  betreffen nachvollziehbar das führende Serienereignis.
- Konflikte werden sicher per ETag abgelehnt; eine fachliche Zusammenführung
  konkurrierender Änderungen ist noch nicht implementiert.
- Die PWA cached nur die statische App-Shell. Persönliche Daten benötigen eine
  erreichbare lokale API; Push-Benachrichtigungen und Hintergrund-Sync fehlen.
- Die Weboberfläche kann Termine anlegen, bearbeiten und nach Bestätigung
  löschen. Die Verwaltung ganzer Kalender bleibt über REST/CalDAV verfügbar,
  aber noch nicht als Web-Bedienung.
- Der lokale Secret-Scan ist eine nachvollziehbare Musterprüfung, aber kein
  mathematischer Beweis. GitHubs Secret Scanning und Push Protection ergänzen
  ihn für bekannte Provider-Muster und die Repository-Historie.
- PostgreSQL-Backups enthalten keine späteren Dokumentdateien aus `data/`;
  deren konsistenter gemeinsamer Backup-Ablauf folgt mit dem Dokumentenmodul.
