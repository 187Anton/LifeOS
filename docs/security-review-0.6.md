# Sicherheits- und Datenschutzprüfung 0.6.1

Stand: 4. September 2026

Diese Prüfung bewertet den vorhandenen LifeOS-Stand mit ausschließlich
synthetischen Daten. Sie ist kein öffentliches Penetrationstest-Zertifikat,
sondern ein nachvollziehbarer technischer Review aus Quellcodeprüfung,
automatisierten Tests und lokalen Laufzeitnachweisen.

## Behobene Befunde

1. **Fehlende Drosselung falscher Anmeldungen:** Der lokale
   `/api/v1/session`-Endpunkt akzeptierte beliebig viele falsche Versuche. Eine
   speicherbegrenzte, rein lokale Sperre begrenzt nun jeden Client auf fünf
   Fehlversuche in 15 Minuten. Erfolgreiche Anmeldung oder Ablauf des Fensters
   setzt den Zustand zurück; es werden weder Passwörter noch Anfragekörper
   gespeichert.
2. **Fehlende Ursprungsprüfung für schreibende Browseranfragen:** Ein anderes
   lokales Webangebot konnte bei gleichartigem Browser-Kontext versuchen,
   Cookie-geschützte Schreibaktionen auszulösen. `POST`, `PUT`, `PATCH` und
   `DELETE` unter `/api/v1` werden nun abgewiesen, wenn ein vorhandener
   `Origin`-Header nicht exakt dem konfigurierten `WEB_ORIGIN` entspricht.
   Lokale Nicht-Browser-Clients ohne `Origin` bleiben kompatibel.
3. **Unvollständige Browser-Sicherheitsheader:** Alle Antworten erhalten nun
   `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` und eine
   restriktive `Permissions-Policy`. API- und CalDAV-Antworten sind global als
   `private, no-store` markiert.
4. **Zu weit gefasste Ursprungs-Konfiguration:** `WEB_ORIGIN` akzeptierte auch
   URLs mit ungeeignetem Schema, Zugangsdaten, Pfad oder Abfrage. Die
   Konfiguration erlaubt nun ausschließlich einen reinen HTTP- oder
   HTTPS-Ursprung und normalisiert einen abschließenden Schrägstrich.

Die neuen Regeln sind durch eigene Middleware-, Login-Limiter- und
API-Integrationstests abgedeckt. Der Fehlervertrag wurde abwärtskompatibel um
`FORBIDDEN` ergänzt; `/api/v1` und der Vertragsstand `1` bleiben bestehen.

## Prüfmatrix

| Bereich                 | Geprüfter Schutz und Nachweis                                                                                                                                                                                      | Ergebnis                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| Anmeldung und Sitzungen | `scrypt` mit Zufallssalz, zufällige Sitzungstokens, ausschließlich SHA-256-Tokenhash, Ablauf, Widerruf, Passwortrevision, sichere Cookie-Attribute und neue Fehlversuchsdrossel                                    | bestanden                           |
| Besitzgrenzen           | Routen leiten den Besitzer aus der Sitzung ab; API-Integrationstests verwenden fremde Nutzer-, Kalender-, Aufgaben-, Projekt-, Studien-, Arbeits-, Finanz-, Fitness-, Dokument- und Integrations-IDs               | bestanden                           |
| Export und Import       | Finanz- und ICS-Export sind besitzgebunden und `no-store`; ICS- und externe CalDAV-Importe benötigen Vorschau, Besitzerprüfung und Bestätigung                                                                     | bestanden                           |
| Backup und Restore      | Keine HTTP-Route vorhanden; lokale Werkzeuge prüfen Zielpfade und schreiben nicht über vorhandene Ziele. Vertiefter Manipulations- und Recovery-Nachweis folgt in 0.6.2                                            | geprüft, Vertiefung in 0.6.2        |
| Dokumentpfade           | Absolute Speicherwurzel, opake Schlüssel, Pfadbegrenzung, Symlink-Ablehnung, `0700`-Verzeichnisse, `0600`-Dateien und 25-MiB-Grenze                                                                                | bestanden                           |
| Anfragegrößen           | JSON 64 KiB, CalDAV 64 KiB, ICS 2 MiB und 500 Ereignisse, Dokumente 25 MiB; Felder und Listen sind zusätzlich fachlich begrenzt                                                                                    | bestanden                           |
| Kalender und CalDAV     | Stabile UID/ETag/Sync-Werte, atomare ETag-Konflikte, DTD-/Entity-Ablehnung, begrenzte XML- und ICS-Körper                                                                                                          | bestanden                           |
| Externes CalDAV         | Standardmäßig aus, Zugang AES-256-GCM-verschlüsselt, ausschließlich HTTPS, SSRF- und DNS-Rebinding-Schutz, feste Zieladresse, fünf Sekunden Timeout, zwei gleichursprüngliche Redirects sowie Größen-/Mengenlimits | bestanden mit synthetischem Adapter |
| GitHub                  | Standardmäßig aus, Token AES-256-GCM-verschlüsselt, fester Ursprung `api.github.com`, ausschließlich GET, Timeout, Redirect-, Größen- und Mengenlimits, redigierter Fremdtext                                      | bestanden mit synthetischem Adapter |
| Secrets und Logs        | Secret-Scan ohne Wertausgabe; strukturierte Logs entfernen rekursiv sensible Schlüssel und protokollieren weder Body noch Header oder interne Fehlermeldungen                                                      | bestanden                           |
| Browser und PWA         | Keine persönlichen Daten in `localStorage`/`sessionStorage`; Service Worker cached nur die App-Shell; validierter HTTP-/HTTPS-Ursprung, neue Ursprungsprüfung und Sicherheitsheader                                | bestanden auf Vertragsebene         |
| Prompt Injection        | Verdächtige Dokument-/Repository-Anweisungen werden als nicht vertrauenswürdig markiert und nicht an einen Adapter übergeben; produktiver Adapter bleibt deaktiviert                                               | bestanden                           |
| Abhängigkeiten          | `npm audit --offline --omit=dev --audit-level=low` meldete keine bekannte Lücke im lokalen Cache. Die aktuelle Registry-Abfrage war wegen eines Registry-Timeouts nicht verifizierbar                              | externe Aktualitätsprüfung offen    |

## Ausgeführte Nachweise

- `npm run security:secrets`
- gezielte Security-, Konfigurations-, Logger-, Storage-, Login- und
  Middleware-Tests: 25 von 25 bestanden
- vollständige API-Matrix mit synthetischer PostgreSQL-Konfiguration: 82 von
  82 Tests bestanden
- `npm run typecheck --workspace @lifeos/contracts`
- `npm run typecheck --workspace @lifeos/api`
- `npm audit --offline --omit=dev --audit-level=low`

## Offene Grenzen

- Die Live-Abfrage der npm-Sicherheitsdatenbank muss bei wieder erreichbarer
  Registry oder in CI erneut ausgeführt werden; der Offline-Befund ist kein
  aktueller externer Nachweis.
- Die externen Integrationen wurden nicht mit echten Zugangsdaten oder
  produktiven Drittanbietern getestet. Sie bleiben standardmäßig deaktiviert,
  read-only und in der Mac-App ohne nativen Schlüsselbundpfad nicht verfügbar.
- Developer-ID, Apple-Notarisierung, Gatekeeper auf einem verteilten Artefakt,
  zweiter sauberer Mac, Intel-/Universal-Build und physischer
  Apple-Kalender-Test sind weiterhin offene Release-Gates.
