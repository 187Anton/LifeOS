CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Project_title_check" CHECK (length(trim("title")) > 0)
);

CREATE UNIQUE INDEX "Project_id_userId_key" ON "Project"("id", "userId");
CREATE INDEX "Project_userId_archivedAt_idx" ON "Project"("userId", "archivedAt");

CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "dueDate" TEXT,
    "scheduledStartAt" DATETIME,
    "scheduledStartTimezone" TEXT,
    "estimatedDurationMinutes" INTEGER,
    "tags" JSONB NOT NULL DEFAULT [],
    "area" TEXT NOT NULL DEFAULT 'personal',
    "projectId" TEXT,
    "parentTaskId" TEXT,
    "completedAt" DATETIME,
    "archivedAt" DATETIME,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_projectId_userId_fkey" FOREIGN KEY ("projectId", "userId") REFERENCES "Project" ("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT "Task_parentTaskId_userId_fkey" FOREIGN KEY ("parentTaskId", "userId") REFERENCES "Task" ("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT "Task_title_check" CHECK (length(trim("title")) > 0),
    CONSTRAINT "Task_status_check" CHECK ("status" IN ('open', 'in_progress', 'blocked', 'done', 'cancelled')),
    CONSTRAINT "Task_priority_check" CHECK ("priority" IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT "Task_area_check" CHECK ("area" IN ('study', 'work', 'projects', 'finance', 'fitness', 'personal')),
    CONSTRAINT "Task_dueDate_check" CHECK (
        "dueDate" IS NULL OR (
            length("dueDate") = 10
            AND "dueDate" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
        )
    ),
    CONSTRAINT "Task_duration_check" CHECK ("estimatedDurationMinutes" IS NULL OR "estimatedDurationMinutes" BETWEEN 1 AND 525600),
    CONSTRAINT "Task_scheduled_start_check" CHECK (
        ("scheduledStartAt" IS NULL AND "scheduledStartTimezone" IS NULL)
        OR ("scheduledStartAt" IS NOT NULL AND "scheduledStartTimezone" IS NOT NULL)
    ),
    CONSTRAINT "Task_completion_check" CHECK (
        ("status" = 'done' AND "completedAt" IS NOT NULL)
        OR ("status" <> 'done' AND "completedAt" IS NULL)
    ),
    CONSTRAINT "Task_parent_check" CHECK ("parentTaskId" IS NULL OR "parentTaskId" <> "id"),
    CONSTRAINT "Task_tags_json_check" CHECK (json_valid("tags") AND json_type("tags") = 'array' AND json_array_length("tags") <= 20),
    CONSTRAINT "Task_archive_check" CHECK ("archivedAt" IS NULL OR "archivedAt" >= "createdAt"),
    CONSTRAINT "Task_delete_check" CHECK ("deletedAt" IS NULL OR "deletedAt" >= "createdAt")
);

CREATE UNIQUE INDEX "Task_id_userId_key" ON "Task"("id", "userId");
CREATE INDEX "Task_userId_deletedAt_archivedAt_idx" ON "Task"("userId", "deletedAt", "archivedAt");
CREATE INDEX "Task_userId_status_dueDate_idx" ON "Task"("userId", "status", "dueDate");
CREATE INDEX "Task_userId_priority_dueDate_idx" ON "Task"("userId", "priority", "dueDate");
CREATE INDEX "Task_userId_area_dueDate_idx" ON "Task"("userId", "area", "dueDate");
CREATE INDEX "Task_parentTaskId_idx" ON "Task"("parentTaskId");
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");

CREATE TRIGGER "Task_tags_insert_check"
BEFORE INSERT ON "Task"
WHEN EXISTS (SELECT 1 FROM json_each(NEW."tags") WHERE type <> 'text' OR length(trim(value)) = 0)
BEGIN
    SELECT RAISE(ABORT, 'Task tags must contain non-empty strings');
END;

CREATE TRIGGER "Task_tags_update_check"
BEFORE UPDATE OF "tags" ON "Task"
WHEN EXISTS (SELECT 1 FROM json_each(NEW."tags") WHERE type <> 'text' OR length(trim(value)) = 0)
BEGIN
    SELECT RAISE(ABORT, 'Task tags must contain non-empty strings');
END;

CREATE TABLE "TaskEventLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "calendarEventId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskEventLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskEventLink_taskId_userId_fkey" FOREIGN KEY ("taskId", "userId") REFERENCES "Task" ("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskEventLink_calendarEventId_userId_fkey" FOREIGN KEY ("calendarEventId", "userId") REFERENCES "CalendarEvent" ("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TaskEventLink_userId_taskId_idx" ON "TaskEventLink"("userId", "taskId");
CREATE INDEX "TaskEventLink_userId_calendarEventId_idx" ON "TaskEventLink"("userId", "calendarEventId");
CREATE UNIQUE INDEX "TaskEventLink_userId_taskId_calendarEventId_key" ON "TaskEventLink"("userId", "taskId", "calendarEventId");

CREATE TABLE "StudyProgram" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "notes" TEXT,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StudyProgram_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudyProgram_title_not_blank" CHECK (length(trim("title")) > 0),
    CONSTRAINT "StudyProgram_institution_not_blank" CHECK (length(trim("institution")) > 0),
    CONSTRAINT "StudyProgram_period_not_blank" CHECK (length(trim("periodLabel")) > 0),
    CONSTRAINT "StudyProgram_status_check" CHECK ("status" IN ('planned', 'active', 'completed', 'paused', 'cancelled'))
);

CREATE UNIQUE INDEX "StudyProgram_id_userId_key" ON "StudyProgram"("id", "userId");
CREATE INDEX "StudyProgram_userId_archivedAt_idx" ON "StudyProgram"("userId", "archivedAt");

CREATE TABLE "StudyModule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "credits" DECIMAL,
    "grade" TEXT,
    "notes" TEXT,
    "documentReferences" JSONB NOT NULL DEFAULT [],
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StudyModule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudyModule_programId_userId_fkey" FOREIGN KEY ("programId", "userId") REFERENCES "StudyProgram" ("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT "StudyModule_title_not_blank" CHECK (length(trim("title")) > 0),
    CONSTRAINT "StudyModule_status_check" CHECK ("status" IN ('planned', 'active', 'completed', 'paused', 'cancelled')),
    CONSTRAINT "StudyModule_credits_nonnegative" CHECK ("credits" IS NULL OR "credits" >= 0),
    CONSTRAINT "StudyModule_documentReferences_json_check" CHECK (json_valid("documentReferences") AND json_type("documentReferences") = 'array')
);

CREATE UNIQUE INDEX "StudyModule_id_userId_key" ON "StudyModule"("id", "userId");
CREATE INDEX "StudyModule_userId_archivedAt_idx" ON "StudyModule"("userId", "archivedAt");
CREATE INDEX "StudyModule_programId_idx" ON "StudyModule"("programId");

CREATE TRIGGER "StudyModule_documentReferences_insert_check"
BEFORE INSERT ON "StudyModule"
WHEN EXISTS (SELECT 1 FROM json_each(NEW."documentReferences") WHERE type <> 'text' OR length(trim(value)) = 0)
BEGIN
    SELECT RAISE(ABORT, 'StudyModule documentReferences must contain non-empty strings');
END;

CREATE TRIGGER "StudyModule_documentReferences_update_check"
BEFORE UPDATE OF "documentReferences" ON "StudyModule"
WHEN EXISTS (SELECT 1 FROM json_each(NEW."documentReferences") WHERE type <> 'text' OR length(trim(value)) = 0)
BEGIN
    SELECT RAISE(ABORT, 'StudyModule documentReferences must contain non-empty strings');
END;

CREATE TABLE "StudyEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "dueDate" TEXT,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "timezone" TEXT,
    "credits" DECIMAL,
    "grade" TEXT,
    "notes" TEXT,
    "taskId" TEXT,
    "calendarEventId" TEXT,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StudyEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudyEntry_moduleId_userId_fkey" FOREIGN KEY ("moduleId", "userId") REFERENCES "StudyModule" ("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT "StudyEntry_taskId_userId_fkey" FOREIGN KEY ("taskId", "userId") REFERENCES "Task" ("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT "StudyEntry_calendarEventId_userId_fkey" FOREIGN KEY ("calendarEventId", "userId") REFERENCES "CalendarEvent" ("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT "StudyEntry_title_not_blank" CHECK (length(trim("title")) > 0),
    CONSTRAINT "StudyEntry_kind_check" CHECK ("kind" IN ('lecture', 'exam', 'submission', 'learning')),
    CONSTRAINT "StudyEntry_status_check" CHECK ("status" IN ('planned', 'active', 'completed', 'paused', 'cancelled')),
    CONSTRAINT "StudyEntry_credits_nonnegative" CHECK ("credits" IS NULL OR "credits" >= 0),
    CONSTRAINT "StudyEntry_dueDate_check" CHECK (
        "dueDate" IS NULL OR (length("dueDate") = 10 AND "dueDate" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
    ),
    CONSTRAINT "StudyEntry_schedule_consistent" CHECK (
        ("kind" IN ('exam', 'submission') AND (("dueDate" IS NOT NULL AND "startsAt" IS NULL AND "endsAt" IS NULL AND "timezone" IS NULL) OR ("dueDate" IS NULL AND "startsAt" IS NOT NULL AND "endsAt" IS NOT NULL AND "timezone" IS NOT NULL AND "endsAt" > "startsAt")))
        OR ("kind" IN ('lecture', 'learning') AND "dueDate" IS NULL AND "startsAt" IS NOT NULL AND "endsAt" IS NOT NULL AND "timezone" IS NOT NULL AND "endsAt" > "startsAt")
    )
);

CREATE UNIQUE INDEX "StudyEntry_id_userId_key" ON "StudyEntry"("id", "userId");
CREATE INDEX "StudyEntry_userId_archivedAt_idx" ON "StudyEntry"("userId", "archivedAt");
CREATE INDEX "StudyEntry_moduleId_idx" ON "StudyEntry"("moduleId");
CREATE INDEX "StudyEntry_taskId_idx" ON "StudyEntry"("taskId");
CREATE INDEX "StudyEntry_calendarEventId_idx" ON "StudyEntry"("calendarEventId");
CREATE INDEX "StudyEntry_userId_dueDate_idx" ON "StudyEntry"("userId", "dueDate");
CREATE INDEX "StudyEntry_userId_startsAt_idx" ON "StudyEntry"("userId", "startsAt");

CREATE TABLE "WorkContext" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "organization" TEXT,
    "startsOn" TEXT,
    "endsOn" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Berlin',
    "status" TEXT NOT NULL DEFAULT 'planned',
    "notes" TEXT,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkContext_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkContext_title_not_blank" CHECK (length(trim("title")) > 0),
    CONSTRAINT "WorkContext_role_not_blank" CHECK (length(trim("role")) > 0),
    CONSTRAINT "WorkContext_timezone_not_blank" CHECK (length(trim("timezone")) > 0),
    CONSTRAINT "WorkContext_status_check" CHECK ("status" IN ('planned', 'active', 'completed', 'paused', 'cancelled')),
    CONSTRAINT "WorkContext_startsOn_check" CHECK ("startsOn" IS NULL OR (length("startsOn") = 10 AND "startsOn" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
    CONSTRAINT "WorkContext_endsOn_check" CHECK ("endsOn" IS NULL OR (length("endsOn") = 10 AND "endsOn" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
    CONSTRAINT "WorkContext_period_consistent" CHECK ("startsOn" IS NULL OR "endsOn" IS NULL OR "endsOn" >= "startsOn")
);

CREATE UNIQUE INDEX "WorkContext_id_userId_key" ON "WorkContext"("id", "userId");
CREATE INDEX "WorkContext_userId_archivedAt_idx" ON "WorkContext"("userId", "archivedAt");
CREATE INDEX "WorkContext_userId_status_startsOn_idx" ON "WorkContext"("userId", "status", "startsOn");

CREATE TABLE "WorkProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "contextId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "goal" TEXT,
    "deadlineDate" TEXT,
    "calendarEventId" TEXT,
    "notes" TEXT,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkProject_contextId_userId_fkey" FOREIGN KEY ("contextId", "userId") REFERENCES "WorkContext" ("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT "WorkProject_calendarEventId_userId_fkey" FOREIGN KEY ("calendarEventId", "userId") REFERENCES "CalendarEvent" ("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT "WorkProject_title_not_blank" CHECK (length(trim("title")) > 0),
    CONSTRAINT "WorkProject_status_check" CHECK ("status" IN ('planned', 'active', 'completed', 'paused', 'cancelled')),
    CONSTRAINT "WorkProject_deadlineDate_check" CHECK ("deadlineDate" IS NULL OR (length("deadlineDate") = 10 AND "deadlineDate" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'))
);

CREATE UNIQUE INDEX "WorkProject_id_userId_key" ON "WorkProject"("id", "userId");
CREATE INDEX "WorkProject_userId_archivedAt_idx" ON "WorkProject"("userId", "archivedAt");
CREATE INDEX "WorkProject_contextId_idx" ON "WorkProject"("contextId");
CREATE INDEX "WorkProject_userId_status_deadlineDate_idx" ON "WorkProject"("userId", "status", "deadlineDate");
CREATE INDEX "WorkProject_calendarEventId_idx" ON "WorkProject"("calendarEventId");

CREATE TABLE "WorkTaskLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "contextId" TEXT NOT NULL,
    "projectId" TEXT,
    "taskId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkTaskLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkTaskLink_contextId_userId_fkey" FOREIGN KEY ("contextId", "userId") REFERENCES "WorkContext" ("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkTaskLink_projectId_userId_fkey" FOREIGN KEY ("projectId", "userId") REFERENCES "WorkProject" ("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkTaskLink_taskId_userId_fkey" FOREIGN KEY ("taskId", "userId") REFERENCES "Task" ("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WorkTaskLink_userId_taskId_key" ON "WorkTaskLink"("userId", "taskId");
CREATE INDEX "WorkTaskLink_userId_contextId_idx" ON "WorkTaskLink"("userId", "contextId");
CREATE INDEX "WorkTaskLink_projectId_idx" ON "WorkTaskLink"("projectId");

CREATE TABLE "WorkTimeEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "contextId" TEXT NOT NULL,
    "projectId" TEXT,
    "taskId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "timezone" TEXT NOT NULL,
    "notes" TEXT,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkTimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkTimeEntry_contextId_userId_fkey" FOREIGN KEY ("contextId", "userId") REFERENCES "WorkContext" ("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT "WorkTimeEntry_projectId_userId_fkey" FOREIGN KEY ("projectId", "userId") REFERENCES "WorkProject" ("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT "WorkTimeEntry_taskId_userId_fkey" FOREIGN KEY ("taskId", "userId") REFERENCES "Task" ("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT "WorkTimeEntry_kind_check" CHECK ("kind" IN ('planned', 'actual')),
    CONSTRAINT "WorkTimeEntry_title_not_blank" CHECK (length(trim("title")) > 0),
    CONSTRAINT "WorkTimeEntry_timezone_not_blank" CHECK (length(trim("timezone")) > 0),
    CONSTRAINT "WorkTimeEntry_period_consistent" CHECK ("endsAt" > "startsAt")
);

CREATE UNIQUE INDEX "WorkTimeEntry_id_userId_key" ON "WorkTimeEntry"("id", "userId");
CREATE INDEX "WorkTimeEntry_userId_archivedAt_idx" ON "WorkTimeEntry"("userId", "archivedAt");
CREATE INDEX "WorkTimeEntry_userId_kind_startsAt_idx" ON "WorkTimeEntry"("userId", "kind", "startsAt");
CREATE INDEX "WorkTimeEntry_contextId_idx" ON "WorkTimeEntry"("contextId");
CREATE INDEX "WorkTimeEntry_projectId_idx" ON "WorkTimeEntry"("projectId");
CREATE INDEX "WorkTimeEntry_taskId_idx" ON "WorkTimeEntry"("taskId");

CREATE TABLE "AvailabilityWindow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AvailabilityWindow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AvailabilityWindow_weekday_valid" CHECK ("weekday" BETWEEN 0 AND 6),
    CONSTRAINT "AvailabilityWindow_minutes_valid" CHECK ("startMinute" BETWEEN 0 AND 1439 AND "endMinute" BETWEEN 1 AND 1440 AND "endMinute" > "startMinute"),
    CONSTRAINT "AvailabilityWindow_timezone_not_blank" CHECK (length(trim("timezone")) > 0)
);

CREATE UNIQUE INDEX "AvailabilityWindow_userId_weekday_startMinute_endMinute_key" ON "AvailabilityWindow"("userId", "weekday", "startMinute", "endMinute");
CREATE INDEX "AvailabilityWindow_userId_weekday_idx" ON "AvailabilityWindow"("userId", "weekday");
