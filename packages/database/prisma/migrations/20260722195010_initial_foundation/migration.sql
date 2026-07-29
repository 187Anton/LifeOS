-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "externalId" VARCHAR(100) NOT NULL,
    "displayName" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "userId" UUID NOT NULL,
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'Europe/Berlin',
    "currencyCode" CHAR(3) NOT NULL DEFAULT 'EUR',
    "locale" VARCHAR(35) NOT NULL DEFAULT 'de-DE',
    "weekStartsOn" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Calendar" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "externalId" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'Europe/Berlin',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "syncToken" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Calendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "calendarId" UUID NOT NULL,
    "uid" VARCHAR(255) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "location" VARCHAR(500),
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "startDate" DATE,
    "endDate" DATE,
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'Europe/Berlin',
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceRule" TEXT,
    "etag" VARCHAR(100) NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "entityType" VARCHAR(100) NOT NULL,
    "entityId" VARCHAR(100),
    "metadata" JSONB,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_externalId_key" ON "User"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Calendar_externalId_key" ON "Calendar"("externalId");

-- A user can have only one active primary calendar.
CREATE UNIQUE INDEX "Calendar_one_active_primary_per_user_key" ON "Calendar"("userId")
WHERE "isPrimary" = true AND "deletedAt" IS NULL;

-- CreateIndex
CREATE INDEX "Calendar_userId_deletedAt_idx" ON "Calendar"("userId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Calendar_id_userId_key" ON "Calendar"("id", "userId");

-- CreateIndex
CREATE INDEX "CalendarEvent_userId_deletedAt_idx" ON "CalendarEvent"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_calendarId_startsAt_idx" ON "CalendarEvent"("calendarId", "startsAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_calendarId_startDate_idx" ON "CalendarEvent"("calendarId", "startDate");

-- CreateIndex
CREATE INDEX "CalendarEvent_calendarId_deletedAt_idx" ON "CalendarEvent"("calendarId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_calendarId_uid_key" ON "CalendarEvent"("calendarId", "uid");

-- CreateIndex
CREATE INDEX "AuditEvent_userId_occurredAt_idx" ON "AuditEvent"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Calendar" ADD CONSTRAINT "Calendar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_calendarId_userId_fkey" FOREIGN KEY ("calendarId", "userId") REFERENCES "Calendar"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain constraints not expressible in the Prisma schema.
ALTER TABLE "UserSettings"
ADD CONSTRAINT "UserSettings_weekStartsOn_check"
CHECK ("weekStartsOn" BETWEEN 0 AND 6);

ALTER TABLE "UserSettings"
ADD CONSTRAINT "UserSettings_currencyCode_check"
CHECK ("currencyCode" ~ '^[A-Z]{3}$');

ALTER TABLE "Calendar"
ADD CONSTRAINT "Calendar_syncToken_check"
CHECK ("syncToken" >= 0);

ALTER TABLE "CalendarEvent"
ADD CONSTRAINT "CalendarEvent_sequence_check"
CHECK ("sequence" >= 0);

ALTER TABLE "CalendarEvent"
ADD CONSTRAINT "CalendarEvent_time_shape_check"
CHECK (
    (
        "isAllDay" = true
        AND "startDate" IS NOT NULL
        AND "endDate" IS NOT NULL
        AND "startsAt" IS NULL
        AND "endsAt" IS NULL
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
);
