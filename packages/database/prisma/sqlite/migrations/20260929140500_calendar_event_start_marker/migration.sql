-- Paket 9: gezielte, verwaltete Startmarkierung als eigener Zeitform-Fall.
--
-- SQLite kann einen Check-Constraint nicht per ALTER TABLE ändern; deshalb wird
-- ausschließlich die Tabelle "CalendarEvent" kontrolliert neu aufgebaut. Alle
-- übrigen Spalten, Indizes, Trigger und Zeilen bleiben unverändert, bestehende
-- Ereignisse behalten ihre Zeitform und erhalten "isStartMarker" = false.
-- Der Lauf benötigt foreign_keys = OFF (Markerdatei), damit das Ersetzen der
-- Tabelle keine abhängigen Zeilen kaskadierend löscht; danach prüft der Runner
-- verpflichtend foreign_key_check und integrity_check.
--
-- Die bisherige Invariante bleibt unverändert: ganztägige Ereignisse brauchen
-- Date-Grenzen mit endDate > startDate, zeitgebundene Ereignisse startsAt/endsAt
-- mit endsAt > startsAt. Neu ist ausschließlich die dritte, über isStartMarker
-- eindeutig abgegrenzte Gestalt: ein zeitgebundenes Ereignis ohne Ende
-- (DTSTART ohne DTEND) für eine verwaltete Startmarkierung.

CREATE TABLE "CalendarEvent_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "startDate" TEXT,
    "endDate" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Berlin',
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "isStartMarker" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceRule" TEXT,
    "reminderMinutes" JSONB NOT NULL DEFAULT [],
    "etag" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "syncVersion" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CalendarEvent_calendarId_userId_fkey" FOREIGN KEY ("calendarId", "userId") REFERENCES "Calendar" ("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CalendarEvent_isAllDay_check" CHECK ("isAllDay" IN (0, 1)),
    CONSTRAINT "CalendarEvent_isStartMarker_check" CHECK ("isStartMarker" IN (0, 1)),
    CONSTRAINT "CalendarEvent_sequence_check" CHECK ("sequence" >= 0),
    CONSTRAINT "CalendarEvent_syncVersion_check" CHECK ("syncVersion" >= 0),
    CONSTRAINT "CalendarEvent_reminderMinutes_json_check" CHECK (
        json_valid("reminderMinutes")
        AND json_type("reminderMinutes") = 'array'
        AND json_array_length("reminderMinutes") <= 10
    ),
    CONSTRAINT "CalendarEvent_time_shape_check" CHECK (
        (
            "isAllDay" = true
            AND "isStartMarker" = false
            AND "startDate" IS NOT NULL
            AND "endDate" IS NOT NULL
            AND "startsAt" IS NULL
            AND "endsAt" IS NULL
            AND length("startDate") = 10
            AND length("endDate") = 10
            AND "startDate" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
            AND "endDate" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
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
    )
);

INSERT INTO "CalendarEvent_new" (
    "id",
    "userId",
    "calendarId",
    "uid",
    "title",
    "description",
    "location",
    "startsAt",
    "endsAt",
    "startDate",
    "endDate",
    "timezone",
    "isAllDay",
    "isStartMarker",
    "recurrenceRule",
    "reminderMinutes",
    "etag",
    "sequence",
    "syncVersion",
    "deletedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "userId",
    "calendarId",
    "uid",
    "title",
    "description",
    "location",
    "startsAt",
    "endsAt",
    "startDate",
    "endDate",
    "timezone",
    "isAllDay",
    false,
    "recurrenceRule",
    "reminderMinutes",
    "etag",
    "sequence",
    "syncVersion",
    "deletedAt",
    "createdAt",
    "updatedAt"
FROM "CalendarEvent";

DROP TABLE "CalendarEvent";
ALTER TABLE "CalendarEvent_new" RENAME TO "CalendarEvent";

CREATE INDEX "CalendarEvent_userId_deletedAt_idx" ON "CalendarEvent"("userId", "deletedAt");
CREATE INDEX "CalendarEvent_calendarId_startsAt_idx" ON "CalendarEvent"("calendarId", "startsAt");
CREATE INDEX "CalendarEvent_calendarId_startDate_idx" ON "CalendarEvent"("calendarId", "startDate");
CREATE INDEX "CalendarEvent_calendarId_deletedAt_idx" ON "CalendarEvent"("calendarId", "deletedAt");
CREATE INDEX "CalendarEvent_calendarId_syncVersion_idx" ON "CalendarEvent"("calendarId", "syncVersion");
CREATE UNIQUE INDEX "CalendarEvent_id_userId_key" ON "CalendarEvent"("id", "userId");
CREATE UNIQUE INDEX "CalendarEvent_calendarId_uid_key" ON "CalendarEvent"("calendarId", "uid");

CREATE TRIGGER "CalendarEvent_reminderMinutes_insert_check"
BEFORE INSERT ON "CalendarEvent"
WHEN EXISTS (
    SELECT 1
    FROM json_each(NEW."reminderMinutes")
    WHERE type <> 'integer' OR value < 0 OR value > 10080
)
BEGIN
    SELECT RAISE(ABORT, 'CalendarEvent reminderMinutes must contain integers from 0 through 10080');
END;

CREATE TRIGGER "CalendarEvent_reminderMinutes_update_check"
BEFORE UPDATE OF "reminderMinutes" ON "CalendarEvent"
WHEN EXISTS (
    SELECT 1
    FROM json_each(NEW."reminderMinutes")
    WHERE type <> 'integer' OR value < 0 OR value > 10080
)
BEGIN
    SELECT RAISE(ABORT, 'CalendarEvent reminderMinutes must contain integers from 0 through 10080');
END;
