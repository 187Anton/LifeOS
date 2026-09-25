-- Paket 4: Optionaler, besitzgebundener Studienmodulbezug an der Aufgabe.
-- SQLite kann einen zusammengesetzten Fremdschlüssel nicht per ALTER TABLE
-- ergänzen; deshalb wird ausschließlich die Tabelle "Task" kontrolliert neu
-- aufgebaut. Alle übrigen Spalten, Indizes, Trigger und Zeilen bleiben
-- unverändert, bestehende Aufgaben behalten den Wert NULL.
-- Der Lauf benötigt foreign_keys = OFF (Markerdatei), damit das Ersetzen der
-- Tabelle "Task" keine abhängigen Zeilen kaskadierend löscht.

CREATE TABLE "Task_new" (
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
    "studyModuleId" TEXT,
    "parentTaskId" TEXT,
    "completedAt" DATETIME,
    "archivedAt" DATETIME,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_projectId_userId_fkey" FOREIGN KEY ("projectId", "userId") REFERENCES "Project" ("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT "Task_studyModuleId_userId_fkey" FOREIGN KEY ("studyModuleId", "userId") REFERENCES "StudyModule" ("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT "Task_parentTaskId_userId_fkey" FOREIGN KEY ("parentTaskId", "userId") REFERENCES "Task" ("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT "Task_title_check" CHECK (length(trim("title")) > 0),
    CONSTRAINT "Task_status_check" CHECK ("status" IN ('open', 'in_progress', 'blocked', 'done', 'cancelled')),
    CONSTRAINT "Task_priority_check" CHECK ("priority" IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT "Task_area_check" CHECK ("area" IN ('study', 'work', 'projects', 'fitness', 'personal')),
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

INSERT INTO "Task_new" (
    "id",
    "userId",
    "title",
    "description",
    "status",
    "priority",
    "dueDate",
    "scheduledStartAt",
    "scheduledStartTimezone",
    "estimatedDurationMinutes",
    "tags",
    "area",
    "projectId",
    "parentTaskId",
    "completedAt",
    "archivedAt",
    "deletedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "userId",
    "title",
    "description",
    "status",
    "priority",
    "dueDate",
    "scheduledStartAt",
    "scheduledStartTimezone",
    "estimatedDurationMinutes",
    "tags",
    "area",
    "projectId",
    "parentTaskId",
    "completedAt",
    "archivedAt",
    "deletedAt",
    "createdAt",
    "updatedAt"
FROM "Task";

DROP TABLE "Task";
ALTER TABLE "Task_new" RENAME TO "Task";

CREATE UNIQUE INDEX "Task_id_userId_key" ON "Task"("id", "userId");
CREATE INDEX "Task_userId_deletedAt_archivedAt_idx" ON "Task"("userId", "deletedAt", "archivedAt");
CREATE INDEX "Task_userId_status_dueDate_idx" ON "Task"("userId", "status", "dueDate");
CREATE INDEX "Task_userId_priority_dueDate_idx" ON "Task"("userId", "priority", "dueDate");
CREATE INDEX "Task_userId_area_dueDate_idx" ON "Task"("userId", "area", "dueDate");
CREATE INDEX "Task_parentTaskId_idx" ON "Task"("parentTaskId");
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");
CREATE INDEX "Task_studyModuleId_idx" ON "Task"("studyModuleId");

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
