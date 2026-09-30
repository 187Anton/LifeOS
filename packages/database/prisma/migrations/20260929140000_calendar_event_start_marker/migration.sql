-- Paket 9: gezielte, verwaltete Startmarkierung als eigener Zeitform-Fall.
--
-- Eine Aufgabe mit geplantem Start ohne Dauer erhält eine sichtbare, für Apple
-- interoperable Startmarkierung: ein zeitgebundenes Ereignis mit DTSTART ohne
-- DTEND. Die bisherige Invariante bleibt für alle übrigen Ereignisse
-- unverändert bestehen; es wird nichts global aufgeweicht. Die neue Gestalt ist
-- über das Kennzeichen "isStartMarker" eindeutig von ganztägigen Ereignissen
-- und von zeitgebundenen Ereignissen mit Ende getrennt:
--
--   ganztägig               : isAllDay = true,  startDate/endDate, Date > Date
--   zeitgebunden mit Ende   : isAllDay = false, startsAt/endsAt,   end > start
--   Startmarkierung (neu)   : isAllDay = false, startsAt, endsAt IS NULL,
--                             isStartMarker = true
--
-- Bestehende Zeilen behalten ihren bisherigen Zustand (Standard false).

ALTER TABLE "CalendarEvent"
ADD COLUMN "isStartMarker" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "CalendarEvent"
DROP CONSTRAINT "CalendarEvent_time_shape_check";

ALTER TABLE "CalendarEvent"
ADD CONSTRAINT "CalendarEvent_time_shape_check"
CHECK (
    (
        "isAllDay" = true
        AND "isStartMarker" = false
        AND "startDate" IS NOT NULL
        AND "endDate" IS NOT NULL
        AND "startsAt" IS NULL
        AND "endsAt" IS NULL
        AND "endDate" > "startDate"
    )
    OR
    (
        "isAllDay" = false
        AND "isStartMarker" = false
        AND "startsAt" IS NOT NULL
        AND "endsAt" IS NOT NULL
        AND "startDate" IS NULL
        AND "endDate" IS NULL
        AND "endsAt" > "startsAt"
    )
    OR
    (
        "isAllDay" = false
        AND "isStartMarker" = true
        AND "startsAt" IS NOT NULL
        AND "endsAt" IS NULL
        AND "startDate" IS NULL
        AND "endDate" IS NULL
    )
);
