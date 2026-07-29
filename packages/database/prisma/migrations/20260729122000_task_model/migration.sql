-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM (
    'open',
    'in_progress',
    'blocked',
    'done',
    'cancelled'
);

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
);

-- CreateEnum
CREATE TYPE "TaskArea" AS ENUM (
    'study',
    'work',
    'projects',
    'finance',
    'fitness',
    'personal'
);

-- CreateTable
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'open',
    "priority" "TaskPriority" NOT NULL DEFAULT 'medium',
    "dueDate" DATE,
    "scheduledStartAt" TIMESTAMPTZ(3),
    "scheduledStartTimezone" VARCHAR(100),
    "estimatedDurationMinutes" INTEGER,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "area" "TaskArea" NOT NULL DEFAULT 'personal',
    "projectId" UUID,
    "parentTaskId" UUID,
    "completedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Task_id_userId_key" ON "Task"("id", "userId");

-- CreateIndex
CREATE INDEX "Task_userId_deletedAt_archivedAt_idx"
ON "Task"("userId", "deletedAt", "archivedAt");

-- CreateIndex
CREATE INDEX "Task_userId_status_dueDate_idx"
ON "Task"("userId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Task_userId_priority_dueDate_idx"
ON "Task"("userId", "priority", "dueDate");

-- CreateIndex
CREATE INDEX "Task_userId_area_dueDate_idx"
ON "Task"("userId", "area", "dueDate");

-- CreateIndex
CREATE INDEX "Task_parentTaskId_idx" ON "Task"("parentTaskId");

-- CreateIndex
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");

ALTER TABLE "Task"
ADD CONSTRAINT "Task_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- The composite relation prevents a task from using another user's task as parent.
ALTER TABLE "Task"
ADD CONSTRAINT "Task_parentTaskId_userId_fkey"
FOREIGN KEY ("parentTaskId", "userId") REFERENCES "Task"("id", "userId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain constraints not expressible in the Prisma schema.
ALTER TABLE "Task"
ADD CONSTRAINT "Task_title_check"
CHECK (length(btrim("title")) > 0),
ADD CONSTRAINT "Task_duration_check"
CHECK (
    "estimatedDurationMinutes" IS NULL
    OR "estimatedDurationMinutes" BETWEEN 1 AND 525600
),
ADD CONSTRAINT "Task_scheduled_start_check"
CHECK (
    ("scheduledStartAt" IS NULL AND "scheduledStartTimezone" IS NULL)
    OR
    ("scheduledStartAt" IS NOT NULL AND "scheduledStartTimezone" IS NOT NULL)
),
ADD CONSTRAINT "Task_completion_check"
CHECK (
    ("status" = 'done' AND "completedAt" IS NOT NULL)
    OR
    ("status" <> 'done' AND "completedAt" IS NULL)
),
ADD CONSTRAINT "Task_parent_check"
CHECK ("parentTaskId" IS NULL OR "parentTaskId" <> "id"),
ADD CONSTRAINT "Task_tags_check"
CHECK (
    cardinality("tags") <= 20
    AND array_position("tags", '') IS NULL
    AND array_position("tags", NULL) IS NULL
),
ADD CONSTRAINT "Task_archive_check"
CHECK ("archivedAt" IS NULL OR "archivedAt" >= "createdAt"),
ADD CONSTRAINT "Task_delete_check"
CHECK ("deletedAt" IS NULL OR "deletedAt" >= "createdAt");
