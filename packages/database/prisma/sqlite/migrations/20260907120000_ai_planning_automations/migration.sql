CREATE TABLE "PlanningProposal" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL CHECK (length("fingerprint") = 64 AND "fingerprint" NOT GLOB '*[^0-9a-f]*'),
  "view" TEXT NOT NULL CHECK ("view" IN ('day', 'week')),
  "rangeFrom" DATE NOT NULL,
  "rangeTo" DATE NOT NULL,
  "targetType" TEXT NOT NULL CHECK ("targetType" = 'task'),
  "targetId" TEXT NOT NULL,
  "actionType" TEXT NOT NULL CHECK ("actionType" = 'schedule_task'),
  "proposedStartsAt" DATETIME NOT NULL,
  "proposedEndsAt" DATETIME NOT NULL,
  "timezone" TEXT NOT NULL,
  "sourceReferences" JSONB NOT NULL CHECK (json_valid("sourceReferences")),
  "reasonCodes" JSONB NOT NULL CHECK (json_valid("reasonCodes")),
  "uncertaintyCodes" JSONB NOT NULL CHECK (json_valid("uncertaintyCodes")),
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'confirming', 'applied', 'rejected', 'discarded', 'conflict')),
  "resolutionReason" TEXT,
  "resolvedAt" DATETIME,
  "appliedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PlanningProposal_period_check" CHECK ("rangeTo" >= "rangeFrom" AND "proposedEndsAt" > "proposedStartsAt"),
  CONSTRAINT "PlanningProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PlanningProposal_id_userId_key" ON "PlanningProposal"("id", "userId");
CREATE UNIQUE INDEX "PlanningProposal_userId_fingerprint_key" ON "PlanningProposal"("userId", "fingerprint");
CREATE INDEX "PlanningProposal_userId_status_rangeFrom_rangeTo_idx" ON "PlanningProposal"("userId", "status", "rangeFrom", "rangeTo");
CREATE INDEX "PlanningProposal_userId_targetType_targetId_idx" ON "PlanningProposal"("userId", "targetType", "targetId");

CREATE TABLE "PlanningAutomation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('daily_preview', 'weekly_preview')),
  "enabled" INTEGER NOT NULL DEFAULT 0 CHECK ("enabled" IN (0, 1)),
  "localMinute" INTEGER NOT NULL CHECK ("localMinute" BETWEEN 0 AND 1439),
  "weekday" INTEGER,
  "timezone" TEXT NOT NULL,
  "maxSuggestions" INTEGER NOT NULL DEFAULT 10 CHECK ("maxSuggestions" BETWEEN 1 AND 20),
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PlanningAutomation_weekday_check" CHECK (("kind" = 'daily_preview' AND "weekday" IS NULL) OR ("kind" = 'weekly_preview' AND "weekday" BETWEEN 0 AND 6)),
  CONSTRAINT "PlanningAutomation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PlanningAutomation_id_userId_key" ON "PlanningAutomation"("id", "userId");
CREATE UNIQUE INDEX "PlanningAutomation_userId_kind_key" ON "PlanningAutomation"("userId", "kind");
CREATE INDEX "PlanningAutomation_enabled_kind_idx" ON "PlanningAutomation"("enabled", "kind");

CREATE TABLE "PlanningAutomationRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "automationId" TEXT NOT NULL,
  "runKey" TEXT NOT NULL,
  "trigger" TEXT NOT NULL CHECK ("trigger" IN ('scheduled', 'manual')),
  "status" TEXT NOT NULL CHECK ("status" IN ('running', 'generated', 'no_data', 'failed')),
  "rangeFrom" DATE NOT NULL,
  "rangeTo" DATE NOT NULL,
  "proposalCount" INTEGER NOT NULL DEFAULT 0,
  "issueCodes" JSONB NOT NULL CHECK (json_valid("issueCodes")),
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME,
  CONSTRAINT "PlanningAutomationRun_range_check" CHECK ("rangeTo" >= "rangeFrom"),
  CONSTRAINT "PlanningAutomationRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PlanningAutomationRun_automationId_userId_fkey" FOREIGN KEY ("automationId", "userId") REFERENCES "PlanningAutomation"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PlanningAutomationRun_automationId_runKey_key" ON "PlanningAutomationRun"("automationId", "runKey");
CREATE INDEX "PlanningAutomationRun_userId_startedAt_idx" ON "PlanningAutomationRun"("userId", "startedAt");
