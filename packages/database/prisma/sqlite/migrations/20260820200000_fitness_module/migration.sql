CREATE TABLE "FitnessPlan" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "notes" TEXT,
  "archivedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "FitnessPlan_name_check" CHECK (length(trim("name")) > 0 AND length("name") <= 200),
  CONSTRAINT "FitnessPlan_archive_check" CHECK ("archivedAt" IS NULL OR "archivedAt" >= "createdAt"),
  CONSTRAINT "FitnessPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FitnessPlan_id_userId_key" ON "FitnessPlan"("id", "userId");
CREATE UNIQUE INDEX "FitnessPlan_userId_name_key" ON "FitnessPlan"("userId", "name");

CREATE TABLE "FitnessExercise" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "notes" TEXT,
  "archivedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "FitnessExercise_name_check" CHECK (length(trim("name")) > 0 AND length("name") <= 200),
  CONSTRAINT "FitnessExercise_archive_check" CHECK ("archivedAt" IS NULL OR "archivedAt" >= "createdAt"),
  CONSTRAINT "FitnessExercise_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FitnessExercise_id_userId_key" ON "FitnessExercise"("id", "userId");
CREATE UNIQUE INDEX "FitnessExercise_userId_name_key" ON "FitnessExercise"("userId", "name");

CREATE TABLE "FitnessPlanExercise" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "exerciseId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "targetSets" INTEGER,
  "targetRepetitions" INTEGER,
  "targetWeightGrams" INTEGER,
  "targetDurationSeconds" INTEGER,
  "targetDistanceMeters" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "FitnessPlanExercise_values_check" CHECK (
    typeof("position") = 'integer' AND "position" BETWEEN 0 AND 500 AND
    ("targetSets" IS NULL OR (typeof("targetSets") = 'integer' AND "targetSets" BETWEEN 1 AND 100)) AND
    ("targetRepetitions" IS NULL OR (typeof("targetRepetitions") = 'integer' AND "targetRepetitions" BETWEEN 1 AND 10000)) AND
    ("targetWeightGrams" IS NULL OR (typeof("targetWeightGrams") = 'integer' AND "targetWeightGrams" BETWEEN 1 AND 1000000)) AND
    ("targetDurationSeconds" IS NULL OR (typeof("targetDurationSeconds") = 'integer' AND "targetDurationSeconds" BETWEEN 1 AND 604800)) AND
    ("targetDistanceMeters" IS NULL OR (typeof("targetDistanceMeters") = 'integer' AND "targetDistanceMeters" BETWEEN 1 AND 1000000))
  ),
  CONSTRAINT "FitnessPlanExercise_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FitnessPlanExercise_planId_userId_fkey" FOREIGN KEY ("planId", "userId") REFERENCES "FitnessPlan"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FitnessPlanExercise_exerciseId_userId_fkey" FOREIGN KEY ("exerciseId", "userId") REFERENCES "FitnessExercise"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE
);

CREATE TABLE "FitnessSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "planId" TEXT,
  "calendarEventId" TEXT,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'planned' CHECK ("status" IN ('planned', 'completed', 'cancelled')),
  "performedAt" DATETIME,
  "timezone" TEXT,
  "notes" TEXT,
  "archivedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "FitnessSession_title_check" CHECK (length(trim("title")) > 0 AND length("title") <= 200),
  CONSTRAINT "FitnessSession_completion_check" CHECK (("status" = 'completed' AND "performedAt" IS NOT NULL AND "timezone" IS NOT NULL) OR ("status" <> 'completed' AND "performedAt" IS NULL AND "timezone" IS NULL)),
  CONSTRAINT "FitnessSession_archive_check" CHECK ("archivedAt" IS NULL OR "archivedAt" >= "createdAt"),
  CONSTRAINT "FitnessSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FitnessSession_planId_userId_fkey" FOREIGN KEY ("planId", "userId") REFERENCES "FitnessPlan"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE,
  CONSTRAINT "FitnessSession_calendarEventId_userId_fkey" FOREIGN KEY ("calendarEventId", "userId") REFERENCES "CalendarEvent"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FitnessSession_id_userId_key" ON "FitnessSession"("id", "userId");

CREATE TABLE "FitnessSet" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "exerciseId" TEXT NOT NULL,
  "setNumber" INTEGER NOT NULL,
  "repetitions" INTEGER,
  "weightGrams" INTEGER,
  "durationSeconds" INTEGER,
  "distanceMeters" INTEGER,
  "completedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "FitnessSet_values_check" CHECK (
    typeof("setNumber") = 'integer' AND "setNumber" BETWEEN 1 AND 100 AND
    ("repetitions" IS NULL OR (typeof("repetitions") = 'integer' AND "repetitions" BETWEEN 1 AND 10000)) AND
    ("weightGrams" IS NULL OR (typeof("weightGrams") = 'integer' AND "weightGrams" BETWEEN 1 AND 1000000)) AND
    ("durationSeconds" IS NULL OR (typeof("durationSeconds") = 'integer' AND "durationSeconds" BETWEEN 1 AND 604800)) AND
    ("distanceMeters" IS NULL OR (typeof("distanceMeters") = 'integer' AND "distanceMeters" BETWEEN 1 AND 1000000)) AND
    ("repetitions" IS NOT NULL OR "weightGrams" IS NOT NULL OR "durationSeconds" IS NOT NULL OR "distanceMeters" IS NOT NULL)
  ),
  CONSTRAINT "FitnessSet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FitnessSet_sessionId_userId_fkey" FOREIGN KEY ("sessionId", "userId") REFERENCES "FitnessSession"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FitnessSet_exerciseId_userId_fkey" FOREIGN KEY ("exerciseId", "userId") REFERENCES "FitnessExercise"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE
);

CREATE TABLE "BodyWeightEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "measuredDate" TEXT NOT NULL CHECK (length("measuredDate") = 10 AND "measuredDate" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  "weightGrams" INTEGER NOT NULL CHECK (typeof("weightGrams") = 'integer' AND "weightGrams" BETWEEN 20000 AND 500000),
  "note" TEXT,
  "archivedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "BodyWeightEntry_archive_check" CHECK ("archivedAt" IS NULL OR "archivedAt" >= "createdAt"),
  CONSTRAINT "BodyWeightEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FitnessPlanExercise_id_userId_key" ON "FitnessPlanExercise"("id", "userId");
CREATE UNIQUE INDEX "FitnessPlanExercise_planId_exerciseId_key" ON "FitnessPlanExercise"("planId", "exerciseId");
CREATE UNIQUE INDEX "FitnessPlanExercise_planId_position_key" ON "FitnessPlanExercise"("planId", "position");
CREATE INDEX "FitnessPlanExercise_userId_planId_idx" ON "FitnessPlanExercise"("userId", "planId");
CREATE INDEX "FitnessPlan_userId_archivedAt_idx" ON "FitnessPlan"("userId", "archivedAt");
CREATE INDEX "FitnessExercise_userId_archivedAt_idx" ON "FitnessExercise"("userId", "archivedAt");
CREATE INDEX "FitnessSession_userId_status_performedAt_idx" ON "FitnessSession"("userId", "status", "performedAt");
CREATE INDEX "FitnessSession_userId_calendarEventId_idx" ON "FitnessSession"("userId", "calendarEventId");
CREATE UNIQUE INDEX "FitnessSet_id_userId_key" ON "FitnessSet"("id", "userId");
CREATE UNIQUE INDEX "FitnessSet_sessionId_exerciseId_setNumber_key" ON "FitnessSet"("sessionId", "exerciseId", "setNumber");
CREATE INDEX "FitnessSet_userId_exerciseId_completedAt_idx" ON "FitnessSet"("userId", "exerciseId", "completedAt");
CREATE UNIQUE INDEX "BodyWeightEntry_id_userId_key" ON "BodyWeightEntry"("id", "userId");
CREATE UNIQUE INDEX "BodyWeightEntry_userId_measuredDate_key" ON "BodyWeightEntry"("userId", "measuredDate");
CREATE INDEX "BodyWeightEntry_userId_archivedAt_measuredDate_idx" ON "BodyWeightEntry"("userId", "archivedAt", "measuredDate");
