# Verschlüsselte Backups

Stand: 15. September 2026

## Ursache und Schutzbereich

Die vorhandenen PostgreSQL-, Dokumenten- und SQLite-Sicherungen erkannten
Manipulationen mit SHA-256, schützten die Inhalte aber nicht vor dem Lesen.
Eine kopierte unverschlüsselte Sicherung konnte daher persönliche Daten und
Dokumente offenlegen. Dateirechte allein reichen auf Wechselmedien oder in
Cloudspeichern nicht aus.

Der portable verschlüsselte Backup-Pfad schützt die SQLite-Datenbank und das
zugehörige Dokumentverzeichnis gemeinsam in genau einer neuen Datei. Er ist der
empfohlene Pfad für die lokale Mac-App. Das bisherige SQLite-Verzeichnisformat
bleibt für vorhandene Sicherungen kompatibel und wird weder automatisch
verschlüsselt noch gelöscht oder überschrieben.

## Unterstützte Ziele

| Ziel                                                                      | Vertraulichkeitsanforderung                                                                                                                                                          |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lokale interne SSD                                                        | Verschlüsselten Befehl verwenden; das Systemvolume soll mit FileVault oder gleichwertig geschützt sein.                                                                              |
| Wechselmedium                                                             | Nur den verschlüsselten `.lifeos-backup`-Container verwenden oder zusätzlich eine nachweislich verschlüsselte Datenträgerverschlüsselung einsetzen.                                  |
| Cloud-Speicher                                                            | Nur den bereits lokal verschlüsselten `.lifeos-backup`-Container hochladen; die Passphrase getrennt aufbewahren. Anbieterregeln und Löschfristen bleiben zusätzlich zu prüfen.       |
| Legacy-Backupverzeichnis, PostgreSQL-Dump oder separates Dokumentenbackup | Nur auf einem vertrauenswürdigen verschlüsselten lokalen Datenträger aufbewahren. Unverschlüsselte Kopien auf Wechselmedien oder in Cloudspeichern gelten nicht als sicherer Ablauf. |

Die Verschlüsselung verwendet einen versionierten Container mit AES-256-GCM.
Der Schlüssel wird über `scrypt` mit `N=32768`, `r=8`, `p=3`, einem zufälligen
16-Byte-Salz und 32 Byte Schlüssellänge aus einer Passphrase abgeleitet. Ein
zufälliger 12-Byte-IV wird je Sicherung neu erzeugt. Der authentifizierte äußere
Header enthält nur Format- und Kryptografieparameter. Datenbank,
Dokumentinhalte sowie das bestehende SQLite-Manifest mit seinen SHA-256-Werten
liegen vollständig im verschlüsselten Nutzdatenbereich.

## Verschlüsselte Sicherung erstellen

`SQLITE_DATABASE_URL` und `STORAGE_PATH` müssen auf die aktive lokale
SQLite-Datei und ihr Dokumentverzeichnis zeigen. Der Zielpfad ist absolut und
darf noch nicht existieren. Die Passphrase muss mindestens 16 Zeichen lang sein
und sollte in einem Passwortmanager erzeugt und gespeichert werden.

```bash
export SQLITE_DATABASE_URL="file:/absoluter/pfad/lifeos.sqlite"
export STORAGE_PATH="/absoluter/pfad/documents"
read -s LIFEOS_BACKUP_PASSPHRASE
echo
export LIFEOS_BACKUP_PASSPHRASE
npm run db:sqlite:backup:encrypted -- /absoluter/neuer/pfad/lifeos.lifeos-backup
unset LIFEOS_BACKUP_PASSPHRASE
```

Die Passphrase steht dadurch nicht als Befehlsargument in der Shell-Historie.
Der CLI-Prozess entfernt sie unmittelbar aus seiner Umgebung und protokolliert
weder die Passphrase noch Datenbank- oder Dokumentinhalte. Während der
Erstellung entsteht nur in einem privaten temporären Verzeichnis kurzzeitig das
unverschlüsselte innere Backup. Deshalb muss auch das lokale System- und
Temporärvolume verschlüsselt und vertrauenswürdig sein.

## In neue Ziele wiederherstellen

Eine Wiederherstellung schreibt niemals über die aktive Datenbank oder ein
vorhandenes Dokumentverzeichnis. Zuerst werden Containerformat, Header und
AES-GCM-Authentifizierung geprüft. Danach prüft der bestehende Restore das
innere Manifest, jede SHA-256-Prüfsumme, die SQLite-Integrität und die
Migrationen. Erst der vollständig geprüfte Bestand wird in neue Ziele
veröffentlicht.

```bash
export SQLITE_DATABASE_URL="file:/absoluter/neuer/pfad/lifeos.sqlite"
export STORAGE_PATH="/absoluter/neuer/pfad/documents"
read -s LIFEOS_BACKUP_PASSPHRASE
echo
export LIFEOS_BACKUP_PASSPHRASE
npm run db:sqlite:restore:encrypted -- /absoluter/pfad/lifeos.lifeos-backup
unset LIFEOS_BACKUP_PASSPHRASE
```

Nach dem Restore werden Readiness, Anmeldung, stabile Kalender-IDs, ETags,
Sync-Werte und Dokumente am neuen Bestand geprüft. Die bewusste Umschaltung auf
diese Ziele ist ein separater Schritt; die Quelle bleibt bis zum erfolgreichen
Datenvergleich erhalten.

## Fehler- und Übergangsverhalten

- Eine falsche Passphrase und jede Änderung am authentifizierten Header oder
  verschlüsselten Inhalt brechen mit derselben neutralen
  Authentifizierungsfehlermeldung ab.
- Fehlende, gekürzte oder symbolisch verknüpfte Quelldateien werden vor dem
  Restore abgewiesen.
- Doppelte oder unsichere Pfade im entschlüsselten Nutzdatenformat sowie
  fehlende oder manipulierte Dateien im inneren Manifest werden abgewiesen.
- Bereits vorhandene Backup- oder Restore-Ziele werden nicht überschrieben.
- Temporäre Klartextdaten und unvollständige Stagingdateien werden auch nach
  Fehlern entfernt. Passphrase und persönliche Inhalte erscheinen nicht in den
  vorgesehenen Logs.
- Die bisherigen Befehle `db:sqlite:backup`, `db:sqlite:restore`, `db:backup`,
  `db:restore`, `documents:backup` und `documents:restore` bleiben unverändert
  verfügbar. Sie sind unverschlüsselte Legacy- beziehungsweise
  PostgreSQL-Werkzeuge und werden nicht stillschweigend umgedeutet.

Geht die Passphrase verloren, kann der verschlüsselte Container nicht
wiederhergestellt werden. Mindestens eine regelmäßig getestete Sicherung und
die zugehörige Passphrase müssen daher getrennt und redundant aufbewahrt
werden. PostgreSQL-Dump und separates Dokumentenbackup bleiben zwei zeitlich zu
koordinierende, unverschlüsselte Artefakte; ein gemeinsamer verschlüsselter
PostgreSQL-Container ist nicht Bestandteil dieses Schritts.

## Automatisierter Nachweis

`npm run db:sqlite:verify:recovery` erstellt mit synthetischen Daten einen
vollständigen PostgreSQL-zu-SQLite-Bestand, verschlüsselt Datenbank und zwei
Dokumente gemeinsam und restauriert sie in neue Ziele. Der Test vergleicht
stabile Fachwerte und weist falsche Passphrase, manipulierten Container,
fehlende Datei, Symlinkquelle sowie vorhandene Ziele ab. Außerdem bestätigt er
private Dateirechte und dass Passphrase und synthetischer Dokumentinhalt nicht
im Container als Klartext vorkommen.
