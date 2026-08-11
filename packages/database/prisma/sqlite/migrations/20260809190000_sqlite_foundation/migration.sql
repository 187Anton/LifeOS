PRAGMA foreign_keys = ON;

CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "UserSettings" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Berlin',
    "currencyCode" TEXT NOT NULL DEFAULT 'EUR',
    "locale" TEXT NOT NULL DEFAULT 'de-DE',
    "weekStartsOn" INTEGER NOT NULL DEFAULT 1,
    "defaultCalendarView" TEXT NOT NULL DEFAULT 'week',
    "showWeekends" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserSettings_weekStartsOn_check" CHECK ("weekStartsOn" BETWEEN 0 AND 6),
    CONSTRAINT "UserSettings_currencyCode_check" CHECK (
        length("currencyCode") = 3
        AND "currencyCode" NOT GLOB '*[^A-Z]*'
    ),
    CONSTRAINT "UserSettings_locale_check" CHECK ("locale" IN ('de-DE', 'en-US')),
    CONSTRAINT "UserSettings_defaultCalendarView_check" CHECK ("defaultCalendarView" IN ('day', 'week', 'month')),
    CONSTRAINT "UserSettings_showWeekends_check" CHECK ("showWeekends" IN (0, 1))
);

CREATE TABLE "UserCredential" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "passwordHash" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserCredential_revision_check" CHECK ("revision" >= 1)
);

CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "credentialRevision" INTEGER NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserSession_credentialRevision_check" CHECK ("credentialRevision" >= 1),
    CONSTRAINT "UserSession_tokenHash_check" CHECK (
        length("tokenHash") = 64
        AND "tokenHash" NOT GLOB '*[^0-9a-f]*'
    ),
    CONSTRAINT "UserSession_expiry_check" CHECK ("expiresAt" > "createdAt"),
    CONSTRAINT "UserSession_revocation_check" CHECK ("revokedAt" IS NULL OR "revokedAt" >= "createdAt")
);

CREATE TABLE "CalDavCredential" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CalDavCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CalDavCredential_revision_check" CHECK ("revision" >= 1),
    CONSTRAINT "CalDavCredential_revocation_check" CHECK ("revokedAt" IS NULL OR "revokedAt" >= "createdAt")
);

CREATE TABLE "Calendar" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Berlin',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "syncToken" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Calendar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Calendar_isPrimary_check" CHECK ("isPrimary" IN (0, 1)),
    CONSTRAINT "Calendar_syncToken_check" CHECK ("syncToken" >= 0)
);

CREATE TABLE "CalendarEvent" (
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
            AND "startsAt" IS NOT NULL
            AND "endsAt" IS NOT NULL
            AND "startDate" IS NULL
            AND "endDate" IS NULL
            AND "endsAt" > "startsAt"
        )
    )
);

CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuditEvent_metadata_json_check" CHECK ("metadata" IS NULL OR json_valid("metadata"))
);

CREATE UNIQUE INDEX "User_externalId_key" ON "User"("externalId");
CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "UserSession"("tokenHash");
CREATE INDEX "UserSession_userId_revokedAt_expiresAt_idx" ON "UserSession"("userId", "revokedAt", "expiresAt");
CREATE UNIQUE INDEX "CalDavCredential_username_key" ON "CalDavCredential"("username");
CREATE UNIQUE INDEX "Calendar_externalId_key" ON "Calendar"("externalId");
CREATE UNIQUE INDEX "Calendar_one_active_primary_per_user_key" ON "Calendar"("userId") WHERE "isPrimary" = true AND "deletedAt" IS NULL;
CREATE INDEX "Calendar_userId_deletedAt_idx" ON "Calendar"("userId", "deletedAt");
CREATE UNIQUE INDEX "Calendar_id_userId_key" ON "Calendar"("id", "userId");
CREATE INDEX "CalendarEvent_userId_deletedAt_idx" ON "CalendarEvent"("userId", "deletedAt");
CREATE INDEX "CalendarEvent_calendarId_startsAt_idx" ON "CalendarEvent"("calendarId", "startsAt");
CREATE INDEX "CalendarEvent_calendarId_startDate_idx" ON "CalendarEvent"("calendarId", "startDate");
CREATE INDEX "CalendarEvent_calendarId_deletedAt_idx" ON "CalendarEvent"("calendarId", "deletedAt");
CREATE INDEX "CalendarEvent_calendarId_syncVersion_idx" ON "CalendarEvent"("calendarId", "syncVersion");
CREATE UNIQUE INDEX "CalendarEvent_id_userId_key" ON "CalendarEvent"("id", "userId");
CREATE UNIQUE INDEX "CalendarEvent_calendarId_uid_key" ON "CalendarEvent"("calendarId", "uid");
CREATE INDEX "AuditEvent_userId_occurredAt_idx" ON "AuditEvent"("userId", "occurredAt");
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

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
