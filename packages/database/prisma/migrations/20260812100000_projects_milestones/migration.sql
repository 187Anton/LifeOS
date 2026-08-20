CREATE TYPE "ProjectStatus" AS ENUM ('planned', 'active', 'paused', 'completed', 'cancelled');
CREATE TYPE "ProjectItemStatus" AS ENUM ('open', 'in_progress', 'completed', 'cancelled');

ALTER TABLE "Project"
ADD COLUMN "description" TEXT,
ADD COLUMN "status" "ProjectStatus" NOT NULL DEFAULT 'planned',
ADD COLUMN "risk" TEXT,
ADD COLUMN "dueDate" DATE,
ADD COLUMN "deletedAt" TIMESTAMPTZ(3);

DROP INDEX "Project_userId_archivedAt_idx";
CREATE INDEX "Project_userId_deletedAt_archivedAt_idx" ON "Project"("userId", "deletedAt", "archivedAt");
CREATE INDEX "Project_userId_status_dueDate_idx" ON "Project"("userId", "status", "dueDate");

CREATE TABLE "ProjectGoal" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "title" VARCHAR(500) NOT NULL,
  "description" TEXT,
  "status" "ProjectItemStatus" NOT NULL DEFAULT 'open',
  "risk" TEXT,
  "dueDate" DATE,
  "archivedAt" TIMESTAMPTZ(3),
  "deletedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ProjectGoal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectGoal_title_check" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "ProjectGoal_archive_check" CHECK ("archivedAt" IS NULL OR "archivedAt" >= "createdAt"),
  CONSTRAINT "ProjectGoal_delete_check" CHECK ("deletedAt" IS NULL OR "deletedAt" >= "createdAt")
);

CREATE TABLE "ProjectMilestone" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "title" VARCHAR(500) NOT NULL,
  "description" TEXT,
  "status" "ProjectItemStatus" NOT NULL DEFAULT 'open',
  "risk" TEXT,
  "dueDate" DATE,
  "archivedAt" TIMESTAMPTZ(3),
  "deletedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ProjectMilestone_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectMilestone_title_check" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "ProjectMilestone_archive_check" CHECK ("archivedAt" IS NULL OR "archivedAt" >= "createdAt"),
  CONSTRAINT "ProjectMilestone_delete_check" CHECK ("deletedAt" IS NULL OR "deletedAt" >= "createdAt")
);

CREATE TABLE "ProjectEventLink" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "calendarEventId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectEventLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectGoal_id_userId_key" ON "ProjectGoal"("id", "userId");
CREATE INDEX "ProjectGoal_userId_projectId_deletedAt_archivedAt_idx" ON "ProjectGoal"("userId", "projectId", "deletedAt", "archivedAt");
CREATE INDEX "ProjectGoal_userId_status_dueDate_idx" ON "ProjectGoal"("userId", "status", "dueDate");
CREATE UNIQUE INDEX "ProjectMilestone_id_userId_key" ON "ProjectMilestone"("id", "userId");
CREATE INDEX "ProjectMilestone_userId_projectId_deletedAt_archivedAt_idx" ON "ProjectMilestone"("userId", "projectId", "deletedAt", "archivedAt");
CREATE INDEX "ProjectMilestone_userId_status_dueDate_idx" ON "ProjectMilestone"("userId", "status", "dueDate");
CREATE UNIQUE INDEX "ProjectEventLink_userId_projectId_calendarEventId_key" ON "ProjectEventLink"("userId", "projectId", "calendarEventId");
CREATE INDEX "ProjectEventLink_userId_projectId_idx" ON "ProjectEventLink"("userId", "projectId");
CREATE INDEX "ProjectEventLink_userId_calendarEventId_idx" ON "ProjectEventLink"("userId", "calendarEventId");

ALTER TABLE "ProjectGoal" ADD CONSTRAINT "ProjectGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectGoal" ADD CONSTRAINT "ProjectGoal_projectId_userId_fkey" FOREIGN KEY ("projectId", "userId") REFERENCES "Project"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectMilestone" ADD CONSTRAINT "ProjectMilestone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectMilestone" ADD CONSTRAINT "ProjectMilestone_projectId_userId_fkey" FOREIGN KEY ("projectId", "userId") REFERENCES "Project"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectEventLink" ADD CONSTRAINT "ProjectEventLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectEventLink" ADD CONSTRAINT "ProjectEventLink_projectId_userId_fkey" FOREIGN KEY ("projectId", "userId") REFERENCES "Project"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectEventLink" ADD CONSTRAINT "ProjectEventLink_calendarEventId_userId_fkey" FOREIGN KEY ("calendarEventId", "userId") REFERENCES "CalendarEvent"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Project" ADD CONSTRAINT "Project_archive_check" CHECK ("archivedAt" IS NULL OR "archivedAt" >= "createdAt");
ALTER TABLE "Project" ADD CONSTRAINT "Project_delete_check" CHECK ("deletedAt" IS NULL OR "deletedAt" >= "createdAt");
