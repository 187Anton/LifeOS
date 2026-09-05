# Changelog

Alle relevanten Änderungen werden hier kurz und nachvollziehbar dokumentiert.

## [0.6.0] – 2026-09-05

- Roadmap 0.5 um lokale Finanzen, Fitness, sicheren ICS-Transfer, optionalen
  externen CalDAV-read-only-Import und eine optionale GitHub-Leseintegration
  ergänzt; PostgreSQL, SQLite, Recovery, Browser und Mac-Sidecar stabilisiert.
- Roadmap 0.6.1 mit Login-Drosselung, exakter Browser-Ursprungsprüfung,
  zentralen Sicherheitsheadern und dokumentiertem technischen Security-Review
  ergänzt.
- Roadmap 0.6.2 mit verpflichtender PostgreSQL-Prüfsumme, eigenständigem
  Dokumentenbackup, strenger SQLite-Manifestprüfung und aktuellem
  Provider-/Recovery-Nachweis sowie reproduzierbarer lokaler Testumgebung
  ergänzt.
- Eine gemeinsame Versionsquelle für npm, Tauri und Cargo, portable
  DMG-Prüfsummen, lokale Release-Befehle, ein macOS-CI-Gate und die vom Browser
  freigegebene PWA-Installation für Roadmap 0.6.3 ergänzt.
- Roadmap 0.6.4 mit vollständiger synthetischer Produktdemo, echtem nativen
  App-Start, geordnetem Sidecar-Ende sowie Update 0.1.0 → 0.6.0, Rollback,
  prüfsummengeschütztem Backup und Restore in neue Ziele abgeschlossen.

## [0.1.0] – 2026-07-18

- Repository-Grundstruktur angelegt.
- Lokale PostgreSQL-Infrastruktur vorbereitet.
- GitHub- und Entwicklungsdokumentation ergänzt.
- CalDAV und PWA als frühe Architekturziele dokumentiert.
- Lokalen CalDAV-Server mit Discovery, Kalender-/Ereignisverwaltung,
  iCalendar-Zeitzonen, ETags, Sync-Tokens und getrenntem Zugang ergänzt.
- Responsive React-Weboberfläche mit lokaler Anmeldung, Dashboard,
  Kalenderanzeige sowie Termin-Erstellung und -Bearbeitung ergänzt.
- PWA-Manifest, lokal gebündelte Icons, Offline-App-Shell und automatisierte
  Desktop-/Smartphone-Tests ohne persistente persönliche Browserdaten ergänzt.
- Nachvollziehbaren Secret-Scan und verpflichtende CI-Prüfung ergänzt.
- Isolierten Migrations-, Backup- und Restore-Nachweis mit stabiler
  Datenprüfung sowie manuelles PostgreSQL-Backup mit Prüfsumme ergänzt.
- Reproduzierbare lokale Demo, Apple-Kalender-Testmatrix und konkrete Grenzen
  des Fundaments dokumentiert.
