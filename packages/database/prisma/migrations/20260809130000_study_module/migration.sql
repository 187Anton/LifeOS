CREATE TYPE "StudyStatus" AS ENUM ('planned', 'active', 'completed', 'paused', 'cancelled');
CREATE TYPE "StudyEntryKind" AS ENUM ('lecture', 'exam', 'submission', 'learning');

CREATE TABLE "StudyProgram" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "institution" VARCHAR(500) NOT NULL,
    "periodLabel" VARCHAR(200) NOT NULL,
    "status" "StudyStatus" NOT NULL DEFAULT 'planned',
    "notes" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "StudyProgram_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StudyProgram_title_not_blank" CHECK (btrim("title") <> ''),
    CONSTRAINT "StudyProgram_institution_not_blank" CHECK (btrim("institution") <> ''),
    CONSTRAINT "StudyProgram_period_not_blank" CHECK (btrim("periodLabel") <> '')
);

CREATE TABLE "StudyModule" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "programId" UUID NOT NULL,
    "code" VARCHAR(100),
    "title" VARCHAR(500) NOT NULL,
    "status" "StudyStatus" NOT NULL DEFAULT 'planned',
    "credits" DECIMAL(6,2),
    "grade" VARCHAR(100),
    "notes" TEXT,
    "documentReferences" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "StudyModule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StudyModule_title_not_blank" CHECK (btrim("title") <> ''),
    CONSTRAINT "StudyModule_credits_nonnegative" CHECK ("credits" IS NULL OR "credits" >= 0)
);

CREATE TABLE "StudyEntry" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "moduleId" UUID NOT NULL,
    "kind" "StudyEntryKind" NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "status" "StudyStatus" NOT NULL DEFAULT 'planned',
    "dueDate" DATE,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "timezone" VARCHAR(100),
    "credits" DECIMAL(6,2),
    "grade" VARCHAR(100),
    "notes" TEXT,
    "taskId" UUID,
    "calendarEventId" UUID,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "StudyEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StudyEntry_title_not_blank" CHECK (btrim("title") <> ''),
    CONSTRAINT "StudyEntry_credits_nonnegative" CHECK ("credits" IS NULL OR "credits" >= 0),
    CONSTRAINT "StudyEntry_schedule_consistent" CHECK (
      ("kind" IN ('exam', 'submission') AND (("dueDate" IS NOT NULL AND "startsAt" IS NULL AND "endsAt" IS NULL AND "timezone" IS NULL) OR ("dueDate" IS NULL AND "startsAt" IS NOT NULL AND "endsAt" IS NOT NULL AND "timezone" IS NOT NULL AND "endsAt" > "startsAt")))
      OR
      ("kind" IN ('lecture', 'learning') AND "dueDate" IS NULL AND "startsAt" IS NOT NULL AND "endsAt" IS NOT NULL AND "timezone" IS NOT NULL AND "endsAt" > "startsAt")
    )
);

CREATE UNIQUE INDEX "StudyProgram_id_userId_key" ON "StudyProgram"("id", "userId");
CREATE INDEX "StudyProgram_userId_archivedAt_idx" ON "StudyProgram"("userId", "archivedAt");
CREATE UNIQUE INDEX "StudyModule_id_userId_key" ON "StudyModule"("id", "userId");
CREATE INDEX "StudyModule_userId_archivedAt_idx" ON "StudyModule"("userId", "archivedAt");
CREATE INDEX "StudyModule_programId_idx" ON "StudyModule"("programId");
CREATE UNIQUE INDEX "StudyEntry_id_userId_key" ON "StudyEntry"("id", "userId");
CREATE INDEX "StudyEntry_userId_archivedAt_idx" ON "StudyEntry"("userId", "archivedAt");
CREATE INDEX "StudyEntry_moduleId_idx" ON "StudyEntry"("moduleId");
CREATE INDEX "StudyEntry_taskId_idx" ON "StudyEntry"("taskId");
CREATE INDEX "StudyEntry_calendarEventId_idx" ON "StudyEntry"("calendarEventId");
CREATE INDEX "StudyEntry_userId_dueDate_idx" ON "StudyEntry"("userId", "dueDate");
CREATE INDEX "StudyEntry_userId_startsAt_idx" ON "StudyEntry"("userId", "startsAt");

ALTER TABLE "StudyProgram" ADD CONSTRAINT "StudyProgram_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudyModule" ADD CONSTRAINT "StudyModule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudyModule" ADD CONSTRAINT "StudyModule_programId_userId_fkey" FOREIGN KEY ("programId", "userId") REFERENCES "StudyProgram"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudyEntry" ADD CONSTRAINT "StudyEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudyEntry" ADD CONSTRAINT "StudyEntry_moduleId_userId_fkey" FOREIGN KEY ("moduleId", "userId") REFERENCES "StudyModule"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudyEntry" ADD CONSTRAINT "StudyEntry_taskId_userId_fkey" FOREIGN KEY ("taskId", "userId") REFERENCES "Task"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudyEntry" ADD CONSTRAINT "StudyEntry_calendarEventId_userId_fkey" FOREIGN KEY ("calendarEventId", "userId") REFERENCES "CalendarEvent"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
