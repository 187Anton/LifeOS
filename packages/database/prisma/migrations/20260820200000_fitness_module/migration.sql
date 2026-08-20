BEGIN;

CREATE TYPE "FitnessSessionStatus" AS ENUM ('planned', 'completed', 'cancelled');

CREATE TABLE "FitnessPlan" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "notes" TEXT,
  "archivedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "FitnessPlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FitnessPlan_name_check" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "FitnessPlan_archive_check" CHECK ("archivedAt" IS NULL OR "archivedAt" >= "createdAt"),
  CONSTRAINT "FitnessPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FitnessPlan_id_userId_key" ON "FitnessPlan"("id", "userId");
CREATE UNIQUE INDEX "FitnessPlan_userId_name_key" ON "FitnessPlan"("userId", "name");

CREATE TABLE "FitnessExercise" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "notes" TEXT,
  "archivedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "FitnessExercise_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FitnessExercise_name_check" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "FitnessExercise_archive_check" CHECK ("archivedAt" IS NULL OR "archivedAt" >= "createdAt"),
  CONSTRAINT "FitnessExercise_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FitnessExercise_id_userId_key" ON "FitnessExercise"("id", "userId");
CREATE UNIQUE INDEX "FitnessExercise_userId_name_key" ON "FitnessExercise"("userId", "name");

CREATE TABLE "FitnessPlanExercise" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "planId" UUID NOT NULL,
  "exerciseId" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "targetSets" INTEGER,
  "targetRepetitions" INTEGER,
  "targetWeightGrams" INTEGER,
  "targetDurationSeconds" INTEGER,
  "targetDistanceMeters" INTEGER,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "FitnessPlanExercise_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FitnessPlanExercise_values_check" CHECK (
    "position" BETWEEN 0 AND 500 AND
    ("targetSets" IS NULL OR "targetSets" BETWEEN 1 AND 100) AND
    ("targetRepetitions" IS NULL OR "targetRepetitions" BETWEEN 1 AND 10000) AND
    ("targetWeightGrams" IS NULL OR "targetWeightGrams" BETWEEN 1 AND 1000000) AND
    ("targetDurationSeconds" IS NULL OR "targetDurationSeconds" BETWEEN 1 AND 604800) AND
    ("targetDistanceMeters" IS NULL OR "targetDistanceMeters" BETWEEN 1 AND 1000000)
  ),
  CONSTRAINT "FitnessPlanExercise_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FitnessPlanExercise_planId_userId_fkey" FOREIGN KEY ("planId", "userId") REFERENCES "FitnessPlan"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FitnessPlanExercise_exerciseId_userId_fkey" FOREIGN KEY ("exerciseId", "userId") REFERENCES "FitnessExercise"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "FitnessSession" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "planId" UUID,
  "calendarEventId" UUID,
  "title" VARCHAR(200) NOT NULL,
  "status" "FitnessSessionStatus" NOT NULL DEFAULT 'planned',
  "performedAt" TIMESTAMPTZ(3),
  "timezone" VARCHAR(100),
  "notes" TEXT,
  "archivedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "FitnessSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FitnessSession_title_check" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "FitnessSession_completion_check" CHECK (("status" = 'completed' AND "performedAt" IS NOT NULL AND "timezone" IS NOT NULL) OR ("status" <> 'completed' AND "performedAt" IS NULL AND "timezone" IS NULL)),
  CONSTRAINT "FitnessSession_archive_check" CHECK ("archivedAt" IS NULL OR "archivedAt" >= "createdAt"),
  CONSTRAINT "FitnessSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FitnessSession_planId_userId_fkey" FOREIGN KEY ("planId", "userId") REFERENCES "FitnessPlan"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FitnessSession_calendarEventId_userId_fkey" FOREIGN KEY ("calendarEventId", "userId") REFERENCES "CalendarEvent"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FitnessSession_id_userId_key" ON "FitnessSession"("id", "userId");

CREATE TABLE "FitnessSet" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "exerciseId" UUID NOT NULL,
  "setNumber" INTEGER NOT NULL,
  "repetitions" INTEGER,
  "weightGrams" INTEGER,
  "durationSeconds" INTEGER,
  "distanceMeters" INTEGER,
  "completedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "FitnessSet_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FitnessSet_values_check" CHECK (
    "setNumber" BETWEEN 1 AND 100 AND
    ("repetitions" IS NULL OR "repetitions" BETWEEN 1 AND 10000) AND
    ("weightGrams" IS NULL OR "weightGrams" BETWEEN 1 AND 1000000) AND
    ("durationSeconds" IS NULL OR "durationSeconds" BETWEEN 1 AND 604800) AND
    ("distanceMeters" IS NULL OR "distanceMeters" BETWEEN 1 AND 1000000) AND
    ("repetitions" IS NOT NULL OR "weightGrams" IS NOT NULL OR "durationSeconds" IS NOT NULL OR "distanceMeters" IS NOT NULL)
  ),
  CONSTRAINT "FitnessSet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FitnessSet_sessionId_userId_fkey" FOREIGN KEY ("sessionId", "userId") REFERENCES "FitnessSession"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FitnessSet_exerciseId_userId_fkey" FOREIGN KEY ("exerciseId", "userId") REFERENCES "FitnessExercise"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "BodyWeightEntry" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "measuredDate" DATE NOT NULL,
  "weightGrams" INTEGER NOT NULL,
  "note" TEXT,
  "archivedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "BodyWeightEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BodyWeightEntry_weight_check" CHECK ("weightGrams" BETWEEN 20000 AND 500000),
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

COMMIT;
