CREATE TYPE "WorkStatus" AS ENUM ('planned', 'active', 'completed', 'paused', 'cancelled');
CREATE TYPE "WorkTimeKind" AS ENUM ('planned', 'actual');

CREATE TABLE "WorkContext" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "role" VARCHAR(500) NOT NULL,
    "organization" VARCHAR(500),
    "startsOn" DATE,
    "endsOn" DATE,
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'Europe/Berlin',
    "status" "WorkStatus" NOT NULL DEFAULT 'planned',
    "notes" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "WorkContext_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkContext_title_not_blank" CHECK (btrim("title") <> ''),
    CONSTRAINT "WorkContext_role_not_blank" CHECK (btrim("role") <> ''),
    CONSTRAINT "WorkContext_timezone_not_blank" CHECK (btrim("timezone") <> ''),
    CONSTRAINT "WorkContext_period_consistent" CHECK ("startsOn" IS NULL OR "endsOn" IS NULL OR "endsOn" >= "startsOn")
);

CREATE TABLE "WorkProject" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "contextId" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "status" "WorkStatus" NOT NULL DEFAULT 'planned',
    "goal" TEXT,
    "deadlineDate" DATE,
    "calendarEventId" UUID,
    "notes" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "WorkProject_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkProject_title_not_blank" CHECK (btrim("title") <> '')
);

CREATE TABLE "WorkTaskLink" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "contextId" UUID NOT NULL,
    "projectId" UUID,
    "taskId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "WorkTaskLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkTimeEntry" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "contextId" UUID NOT NULL,
    "projectId" UUID,
    "taskId" UUID,
    "kind" "WorkTimeKind" NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "timezone" VARCHAR(100) NOT NULL,
    "notes" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "WorkTimeEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkTimeEntry_title_not_blank" CHECK (btrim("title") <> ''),
    CONSTRAINT "WorkTimeEntry_timezone_not_blank" CHECK (btrim("timezone") <> ''),
    CONSTRAINT "WorkTimeEntry_period_consistent" CHECK ("endsAt" > "startsAt")
);

CREATE UNIQUE INDEX "WorkContext_id_userId_key" ON "WorkContext"("id", "userId");
CREATE INDEX "WorkContext_userId_archivedAt_idx" ON "WorkContext"("userId", "archivedAt");
CREATE INDEX "WorkContext_userId_status_startsOn_idx" ON "WorkContext"("userId", "status", "startsOn");
CREATE UNIQUE INDEX "WorkProject_id_userId_key" ON "WorkProject"("id", "userId");
CREATE INDEX "WorkProject_userId_archivedAt_idx" ON "WorkProject"("userId", "archivedAt");
CREATE INDEX "WorkProject_contextId_idx" ON "WorkProject"("contextId");
CREATE INDEX "WorkProject_userId_status_deadlineDate_idx" ON "WorkProject"("userId", "status", "deadlineDate");
CREATE INDEX "WorkProject_calendarEventId_idx" ON "WorkProject"("calendarEventId");
CREATE UNIQUE INDEX "WorkTaskLink_userId_taskId_key" ON "WorkTaskLink"("userId", "taskId");
CREATE INDEX "WorkTaskLink_userId_contextId_idx" ON "WorkTaskLink"("userId", "contextId");
CREATE INDEX "WorkTaskLink_projectId_idx" ON "WorkTaskLink"("projectId");
CREATE UNIQUE INDEX "WorkTimeEntry_id_userId_key" ON "WorkTimeEntry"("id", "userId");
CREATE INDEX "WorkTimeEntry_userId_archivedAt_idx" ON "WorkTimeEntry"("userId", "archivedAt");
CREATE INDEX "WorkTimeEntry_userId_kind_startsAt_idx" ON "WorkTimeEntry"("userId", "kind", "startsAt");
CREATE INDEX "WorkTimeEntry_contextId_idx" ON "WorkTimeEntry"("contextId");
CREATE INDEX "WorkTimeEntry_projectId_idx" ON "WorkTimeEntry"("projectId");
CREATE INDEX "WorkTimeEntry_taskId_idx" ON "WorkTimeEntry"("taskId");

ALTER TABLE "WorkContext" ADD CONSTRAINT "WorkContext_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkProject" ADD CONSTRAINT "WorkProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkProject" ADD CONSTRAINT "WorkProject_contextId_userId_fkey" FOREIGN KEY ("contextId", "userId") REFERENCES "WorkContext"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkProject" ADD CONSTRAINT "WorkProject_calendarEventId_userId_fkey" FOREIGN KEY ("calendarEventId", "userId") REFERENCES "CalendarEvent"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkTaskLink" ADD CONSTRAINT "WorkTaskLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkTaskLink" ADD CONSTRAINT "WorkTaskLink_contextId_userId_fkey" FOREIGN KEY ("contextId", "userId") REFERENCES "WorkContext"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkTaskLink" ADD CONSTRAINT "WorkTaskLink_projectId_userId_fkey" FOREIGN KEY ("projectId", "userId") REFERENCES "WorkProject"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkTaskLink" ADD CONSTRAINT "WorkTaskLink_taskId_userId_fkey" FOREIGN KEY ("taskId", "userId") REFERENCES "Task"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkTimeEntry" ADD CONSTRAINT "WorkTimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkTimeEntry" ADD CONSTRAINT "WorkTimeEntry_contextId_userId_fkey" FOREIGN KEY ("contextId", "userId") REFERENCES "WorkContext"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkTimeEntry" ADD CONSTRAINT "WorkTimeEntry_projectId_userId_fkey" FOREIGN KEY ("projectId", "userId") REFERENCES "WorkProject"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkTimeEntry" ADD CONSTRAINT "WorkTimeEntry_taskId_userId_fkey" FOREIGN KEY ("taskId", "userId") REFERENCES "Task"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
