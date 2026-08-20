# Fitnessvertrag

Der Fitnessbereich ist eine lokale, besitzgebundene Dokumentation ohne
Diagnosen oder medizinische Empfehlungen. Alle Routen liegen unter
`/api/v1/fitness`, verlangen eine gültige lokale Sitzung und geben nur Daten
des angemeldeten Profils zurück.

## Datenmodell und Einheiten

- `FitnessPlan` und `FitnessExercise` sind reversibel archivierbar.
- `FitnessPlanExercise` ordnet eine eigene aktive Übung einem eigenen aktiven
  Plan zu und hält optionale Zielwerte.
- `FitnessSession` ist `planned`, `completed` oder `cancelled`. Nur eine
  abgeschlossene Einheit besitzt gemeinsam `performedAt` und eine
  IANA-Zeitzone.
- `FitnessSet` enthält mindestens einen positiven Leistungswert.
- Gewichte werden als ganze Gramm, Dauer als ganze Sekunden, Distanz als ganze
  Meter und Wiederholungen als ganze Anzahl gespeichert.
- `BodyWeightEntry.measuredDate` ist ein reiner Kalendertag. Messwerte sind
  ganze Gramm; Life OS interpretiert sie nicht medizinisch.

PostgreSQL und SQLite erzwingen Besitzergrenzen zusätzlich durch
zusammengesetzte Fremdschlüssel. Die versionierten Migrationen heißen
`20260820200000_fitness_module`. Beim PostgreSQL-zu-SQLite-Import sowie bei
SQLite-Backup und -Restore werden alle sechs Fitnessmodelle vollständig
verglichen.

## Routen

| Methode      | Route                              | Zweck                                                           |
| ------------ | ---------------------------------- | --------------------------------------------------------------- |
| `GET`        | `/fitness?includeArchived=false`   | Pläne, Übungen, Einheiten, Sätze, Gewichte und Auswertung laden |
| `POST/PATCH` | `/fitness/plans[/:id]`             | Trainingsplan anlegen oder ändern/archivieren                   |
| `POST/PATCH` | `/fitness/exercises[/:id]`         | Übung anlegen oder ändern/archivieren                           |
| `POST`       | `/fitness/plans/:planId/exercises` | Übung mit Zielwerten zuordnen                                   |
| `PATCH`      | `/fitness/plan-exercises/:id`      | Zielwerte oder Position ändern                                  |
| `POST/PATCH` | `/fitness/sessions[/:id]`          | Einheit planen, abschließen, abbrechen oder archivieren         |
| `POST/PATCH` | `/fitness/sets[/:id]`              | Satz und Leistungswerte dokumentieren                           |
| `POST/PATCH` | `/fitness/body-weights[/:id]`      | Gewicht erfassen, ändern oder archivieren                       |

Schreibmengen sind durch Feld-, Text- und Zahlenlimits begrenzt. Die Übersicht
begrenzt Pläne auf 1.000, Übungen auf 2.000, Einheiten und Gewichtseinträge auf
je 5.000 sowie Sätze auf 20.000 Datensätze. Fremde IDs werden nicht als eigene
Datensätze offengelegt.

## Kalenderbezug

Eine Trainingseinheit kann ein vorhandenes eigenes Kalenderereignis über
`calendarId` und stabile `eventUid` referenzieren. Die API löst erst
serverseitig die interne ID auf. Sie verändert weder Ereignisinhalt noch UID,
ETag, Sequenz oder Sync-Token. Neue beziehungsweise geänderte Kalendertermine
werden weiterhin ausschließlich im Kalenderbereich als getrennte bestätigte
Aktion gespeichert.

## Auswertungen und Grenzen

Die Übersicht berechnet rein lesend Anzahl abgeschlossener Einheiten und
Sätze, Gramm-Wiederholungs-Volumen, Differenz zwischen erstem und letztem
aktiven Gewichtseintrag sowie Maxima je Übung für Gewicht, Wiederholungen,
Dauer und Distanz. Das sind einfache persönliche Fortschrittswerte, keine
Gesundheitsbewertung.

Fitnessdaten werden nicht an KI- oder externe Dienste übertragen, nicht in
Browser-Storage persistiert und nur mit notwendigen Metadaten auditiert. Der
synthetische Seed enthält keine persönlichen oder medizinischen Daten.
