ALTER TABLE "Project" ADD COLUMN "description" TEXT;
ALTER TABLE "Project" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'planned';
ALTER TABLE "Project" ADD COLUMN "risk" TEXT;
ALTER TABLE "Project" ADD COLUMN "dueDate" TEXT;
ALTER TABLE "Project" ADD COLUMN "deletedAt" DATETIME;

DROP INDEX "Project_userId_archivedAt_idx";
CREATE INDEX "Project_userId_deletedAt_archivedAt_idx" ON "Project"("userId", "deletedAt", "archivedAt");
CREATE INDEX "Project_userId_status_dueDate_idx" ON "Project"("userId", "status", "dueDate");

CREATE TRIGGER "Project_fields_insert_check" BEFORE INSERT ON "Project"
WHEN NEW."status" NOT IN ('planned','active','paused','completed','cancelled')
  OR (NEW."dueDate" IS NOT NULL AND (length(NEW."dueDate") <> 10 OR NEW."dueDate" NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'))
  OR (NEW."archivedAt" IS NOT NULL AND NEW."archivedAt" < NEW."createdAt")
  OR (NEW."deletedAt" IS NOT NULL AND NEW."deletedAt" < NEW."createdAt")
BEGIN SELECT RAISE(ABORT, 'Invalid project fields'); END;
CREATE TRIGGER "Project_fields_update_check" BEFORE UPDATE OF "status", "dueDate", "archivedAt", "deletedAt" ON "Project"
WHEN NEW."status" NOT IN ('planned','active','paused','completed','cancelled')
  OR (NEW."dueDate" IS NOT NULL AND (length(NEW."dueDate") <> 10 OR NEW."dueDate" NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'))
  OR (NEW."archivedAt" IS NOT NULL AND NEW."archivedAt" < NEW."createdAt")
  OR (NEW."deletedAt" IS NOT NULL AND NEW."deletedAt" < NEW."createdAt")
BEGIN SELECT RAISE(ABORT, 'Invalid project fields'); END;

CREATE TABLE "ProjectGoal" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "projectId" TEXT NOT NULL,
  "title" TEXT NOT NULL, "description" TEXT, "status" TEXT NOT NULL DEFAULT 'open', "risk" TEXT, "dueDate" TEXT,
  "archivedAt" DATETIME, "deletedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ProjectGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectGoal_projectId_userId_fkey" FOREIGN KEY ("projectId", "userId") REFERENCES "Project"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectGoal_title_check" CHECK (length(trim("title")) > 0),
  CONSTRAINT "ProjectGoal_status_check" CHECK ("status" IN ('open','in_progress','completed','cancelled')),
  CONSTRAINT "ProjectGoal_dueDate_check" CHECK ("dueDate" IS NULL OR (length("dueDate") = 10 AND "dueDate" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
  CONSTRAINT "ProjectGoal_archive_check" CHECK ("archivedAt" IS NULL OR "archivedAt" >= "createdAt"),
  CONSTRAINT "ProjectGoal_delete_check" CHECK ("deletedAt" IS NULL OR "deletedAt" >= "createdAt")
);
CREATE UNIQUE INDEX "ProjectGoal_id_userId_key" ON "ProjectGoal"("id", "userId");
CREATE INDEX "ProjectGoal_userId_projectId_deletedAt_archivedAt_idx" ON "ProjectGoal"("userId", "projectId", "deletedAt", "archivedAt");
CREATE INDEX "ProjectGoal_userId_status_dueDate_idx" ON "ProjectGoal"("userId", "status", "dueDate");

CREATE TABLE "ProjectMilestone" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "projectId" TEXT NOT NULL,
  "title" TEXT NOT NULL, "description" TEXT, "status" TEXT NOT NULL DEFAULT 'open', "risk" TEXT, "dueDate" TEXT,
  "archivedAt" DATETIME, "deletedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ProjectMilestone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectMilestone_projectId_userId_fkey" FOREIGN KEY ("projectId", "userId") REFERENCES "Project"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectMilestone_title_check" CHECK (length(trim("title")) > 0),
  CONSTRAINT "ProjectMilestone_status_check" CHECK ("status" IN ('open','in_progress','completed','cancelled')),
  CONSTRAINT "ProjectMilestone_dueDate_check" CHECK ("dueDate" IS NULL OR (length("dueDate") = 10 AND "dueDate" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
  CONSTRAINT "ProjectMilestone_archive_check" CHECK ("archivedAt" IS NULL OR "archivedAt" >= "createdAt"),
  CONSTRAINT "ProjectMilestone_delete_check" CHECK ("deletedAt" IS NULL OR "deletedAt" >= "createdAt")
);
CREATE UNIQUE INDEX "ProjectMilestone_id_userId_key" ON "ProjectMilestone"("id", "userId");
CREATE INDEX "ProjectMilestone_userId_projectId_deletedAt_archivedAt_idx" ON "ProjectMilestone"("userId", "projectId", "deletedAt", "archivedAt");
CREATE INDEX "ProjectMilestone_userId_status_dueDate_idx" ON "ProjectMilestone"("userId", "status", "dueDate");

CREATE TABLE "ProjectEventLink" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "projectId" TEXT NOT NULL, "calendarEventId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectEventLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectEventLink_projectId_userId_fkey" FOREIGN KEY ("projectId", "userId") REFERENCES "Project"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectEventLink_calendarEventId_userId_fkey" FOREIGN KEY ("calendarEventId", "userId") REFERENCES "CalendarEvent"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProjectEventLink_userId_projectId_calendarEventId_key" ON "ProjectEventLink"("userId", "projectId", "calendarEventId");
CREATE INDEX "ProjectEventLink_userId_projectId_idx" ON "ProjectEventLink"("userId", "projectId");
CREATE INDEX "ProjectEventLink_userId_calendarEventId_idx" ON "ProjectEventLink"("userId", "calendarEventId");
