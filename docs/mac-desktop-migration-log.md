# Migrationsprotokoll: Mac-App und SQLite

Stand: 9. August 2026

Dieses Dokument ist der fortlaufende Nachweis für die in
[`mac-desktop-spike-plan.md`](mac-desktop-spike-plan.md) beschriebene Migration.
Ein Arbeitspaket gilt erst als abgeschlossen, wenn sein Ergebnis hier mit
tatsächlich ausgeführten Prüfungen dokumentiert ist.

## Statusübersicht

| Paket                             | Status        | Letzter Nachweis |
| --------------------------------- | ------------- | ---------------- |
| M0 – Ziel und Ausführungsplan     | abgeschlossen | 9. August 2026   |
| M1 – SQLite-Schema und Migration  | offen         | –                |
| M2 – API ohne Docker              | offen         | –                |
| M3 – Kalender- und CalDAV-Parität | offen         | –                |
| M4 – Datenübernahme und Recovery  | offen         | –                |
| M5 – Tauri-Sidecar                | offen         | –                |
| M6 – Installation und Update      | offen         | –                |
| M7 – Abschlussdokumentation       | offen         | –                |

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
