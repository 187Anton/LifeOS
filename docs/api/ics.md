# ICS-Import und -Export

Der ICS-Pfad verwendet den vorhandenen Kalenderkern unter `/api/v1`. Er legt
keine zweite Ereignisquelle an und verändert bestehende Ereignisse niemals
automatisch.

## Ablauf und Endpunkte

| Endpunkt                                  | Zweck                                                   |
| ----------------------------------------- | ------------------------------------------------------- |
| `POST /calendars/:calendarId/ics/preview` | UTF-8-ICS als `text/calendar` prüfen                    |
| `POST /calendars/:calendarId/ics/commit`  | eine gültige, noch aktuelle Vorschau einmalig schreiben |
| `GET /calendars/:calendarId/ics/export`   | aktive eigene Ereignisse als ICS herunterladen          |

Die Vorschau ist flüchtig, benutzer- und kalendergebunden, höchstens 15 Minuten
gültig und nach einem Commitversuch verbraucht. Sie unterscheidet neue,
unveränderte, konfliktbehaftete und ungültige Ereignisse. Ein Import ist nur
möglich, wenn jedes Ereignis neu oder inhaltlich unverändert ist. Alle neuen
Ereignisse werden atomar geschrieben; eine zwischen Vorschau und Commit
geänderte UID führt zu einem Konflikt ohne Teilimport.

## Kompatibilität

Import und Export erhalten stabile UIDs, zeitgebundene Ereignisse mit IANA-
Zeitzone und `VTIMEZONE`, ganztägige Ereignisse mit exklusivem Enddatum,
unterstützte RRULE-Werte und DISPLAY-Erinnerungen. Der Export erzeugt keinen
neuen ETag-Vertrag: importierte Ereignisse erhalten lokale ETags und
Sync-Versionen, vorhandene Ereignisse behalten ihre Werte. Wiederholter Import
identischer Daten erzeugt keine Duplikate.

## Sicherheitsgrenzen

- Jede Route benötigt die lokale Sitzung und prüft den Kalenderbesitz.
- Dateien sind auf 2 MiB und 500 `VEVENT`-Komponenten begrenzt.
- Importierte Serien benötigen `COUNT` oder `UNTIL`; `COUNT` ist auf 1000
  begrenzt. Beim Import werden keine Serieninstanzen expandiert.
- Doppelte UIDs, gelöschte lokale UIDs, fehlerhafte Ereignisse und abweichende
  vorhandene Inhalte blockieren den Commit.
- Titel, Orte und Beschreibungen gelten als nicht vertrauenswürdig und werden
  in React ausschließlich als Text angezeigt.
- Vorschauen und persönliche ICS-Daten werden weder im Browser-Storage noch im
  Service-Worker-Cache persistiert oder extern übertragen.
- Fehlerantworten enthalten weder Quelldatei noch interne Pfade oder
  Stacktraces; Audit-Einträge enthalten nur notwendige Ereignismetadaten.

Nicht unterstützt sind die fachliche Zusammenführung abweichender Ereignisse,
Serienausnahmen und die Bearbeitung einzelner Wiederholungen. Diese Grenzen
werden als Konflikt beziehungsweise unveränderte bestehende Kalendergrenze
behandelt.
