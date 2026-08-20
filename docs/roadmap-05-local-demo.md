# Roadmap 0.5 – lokale Demo und Abschlussnachweis

Stand: 20. August 2026

Roadmap 0.5 wurde mit ausschließlich synthetischen Daten in drei voneinander
getrennten Ebenen geprüft: gegen PostgreSQL, gegen eine temporäre SQLite-Datei
und als gebündelter Mac-Sidecar. Die manuelle Browserdemo lief am gemeinsamen
Loopback-Ursprung; externe Integrationsschlüssel waren nicht gesetzt.

## Geprüfter Produktablauf

| Bereich         | Lokaler Nachweis                                                                                    | Ergebnis                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Finanzen        | Ausgabe anlegen, von 42,50 EUR auf 40,00 EUR ändern, Zeitraum auswerten und eigenen Export auslösen | Buchung, Saldo, Monatsvergleich und Exportstatus korrekt                                                      |
| Fitness         | vorhandenen Plan, Einheit, Satz und Bestleistung lesen; Gewichtseintrag 74,5 kg anlegen             | Verlauf und Differenz 0,5 kg korrekt, keine Gesundheitsbewertung                                              |
| ICS             | begrenzte Datei mit stabiler UID, Europe/Berlin und DISPLAY-Erinnerung hochladen                    | Vorschau zeigte genau ein neues Ereignis; bestätigter Import und lokaler Export erfolgreich                   |
| Externes CalDAV | Integrationsseite ohne lokalen Schlüssel öffnen                                                     | `available: false`, keine Konfiguration und kein Netzwerkpfad                                                 |
| GitHub          | Integrationsseite ohne lokalen Schlüssel öffnen                                                     | `available: false`, kein Tokenformular und kein Netzwerkpfad                                                  |
| Browser         | gebaute PWA über die lokale Express-API bedienen                                                    | keine Browser-Konsolenfehler; persönliche Persistenz bleibt durch automatisierte Storage-Tests ausgeschlossen |

Die temporäre Demo verwendete eine neue SQLite-Datei außerhalb des Repositorys,
alle zehn versionierten Migrationen und den synthetischen SQLite-Seed. Nach
dem Nachweis wurden Server, Browser-Tab, Datenbank, Dokumentverzeichnis und
ICS-Datei entfernt. Es wurden keine bestehenden lokalen oder persönlichen
Daten verändert.

## Automatisierte Abschlussmatrix

Verbindlich ausgeführt werden:

```bash
npm run format:check
npm run repo:check
npm run security:secrets
npm run typecheck
npm run lint
npm run build
npm test
npm run db:test
npm run db:sqlite:test
npm run test:sqlite:api
npm run verify:sqlite:api-runtime
npm run db:verify:recovery
node --env-file=.env --import tsx --test packages/database/tests/sqlite-transfer.integration.ts
npm run desktop:verify:sidecar
npm run desktop:build:dmg
npm run desktop:verify:dmg
```

Die Matrix deckt Authentifizierung und Besitz, fremde IDs, Validierungs- und
Größenlimits, CalDAV-/ICS-Konflikte, GitHub- und CalDAV-Timeouts,
Rate-Limit-/Berechtigungsfehler, widerrufene Zugänge, PostgreSQL-/SQLite-Parität,
Migration, wiederholbaren Seed, Transfer, Backup, Restore, Browserbetrieb und
den gebündelten Sidecar ab. Testnamen und Einzelbefunde stehen zusätzlich in
[`foundation-verification.md`](foundation-verification.md).

Der aktuelle ARM64-Build erzeugte ein lokal ad-hoc signiertes DMG mit
52.403.778 Bytes und der SHA-256-Prüfsumme
`e79acef81ecb42544e708868db3bad8fa3d8d4eaa90e3946dfa8d3dd1455ee83`.
`desktop:verify:dmg` bestätigte die DMG-Prüfsumme, die kopierte App,
Signaturstruktur und den zweimaligen Start des gebündelten Node-22.23.2-
Sidecars ohne Homebrew-Pfad. Für den erstmaligen lokalen Build wurde die
fehlende Rust-Toolchain 1.97.1 über Homebrew installiert; sie ist eine
Build-Abhängigkeit und wird nicht mit der App ausgeliefert.

## Beim Stabilisieren behobener Fehler

Der SQLite-Migrations-Seed enthält absichtlich eine zukünftige synthetische
Sitzung. Der Passwort-Bootstrap widerrief zuvor alle aktiven Sitzungen mit der
aktuellen Uhrzeit. Bei vorauseilender Fixture- oder Systemuhr konnte der
Widerruf dadurch vor `createdAt` liegen und die Datenbankbedingung verletzen.
Der Bootstrap setzt den Widerruf nun pro Sitzung auf den späteren Wert aus
aktueller Zeit und Erzeugungszeit. Ein Unit-Test und der reale
SQLite-Bootstrap mit einer 2030-Sitzung belegen den Fix.

## Update-, Backup- und Restore-Ablauf

Vor einem Update sind die in der [README](../README.md) dokumentierten
PostgreSQL- beziehungsweise SQLite-Backup-Befehle auszuführen. Migrationen
laufen nur versioniert; Restore schreibt ausschließlich in neue Ziele und
wird vor einer bewussten Umschaltung geprüft. Die Mac-App führt
SQLite-Migrationen vor der Readiness-Prüfung aus und bewahrt die aktive Datei
bei einem fehlgeschlagenen Update.

## Ausdrücklich offene Gates

- kein produktiver externer CalDAV-Zugang und keine bidirektionale
  Synchronisation;
- kein produktives GitHub-Token, OAuth, GitHub App, Webhook oder Schreibzugriff;
- kein nativer Mac-Schlüsselbundpfad für optionale externe Integrationen;
- kein physischer Apple-Kalender-/iPhone-Test für diesen Stand;
- keine Developer-ID-Signatur, Apple-Notarisierung oder Prüfung auf einem
  zweiten sauberen unterstützten Mac;
- kein Intel-/Universal-Build und kein öffentlich freigegebenes Release.

Diese Punkte sind keine Freigabehemmnisse für die vollständig lokale,
netzwerkfreie Demo, bleiben aber Voraussetzungen für eine spätere öffentliche
oder produktive externe Bereitstellung.
