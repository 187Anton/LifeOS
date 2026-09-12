CREATE TABLE "PlanningProposal" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "fingerprint" CHAR(64) NOT NULL,
  "view" VARCHAR(10) NOT NULL,
  "rangeFrom" DATE NOT NULL,
  "rangeTo" DATE NOT NULL,
  "targetType" VARCHAR(30) NOT NULL,
  "targetId" UUID NOT NULL,
  "actionType" VARCHAR(50) NOT NULL,
  "proposedStartsAt" TIMESTAMPTZ(3) NOT NULL,
  "proposedEndsAt" TIMESTAMPTZ(3) NOT NULL,
  "timezone" VARCHAR(100) NOT NULL,
  "sourceReferences" JSONB NOT NULL,
  "reasonCodes" JSONB NOT NULL,
  "uncertaintyCodes" JSONB NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'pending',
  "resolutionReason" VARCHAR(50),
  "resolvedAt" TIMESTAMPTZ(3),
  "appliedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PlanningProposal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlanningProposal_fingerprint_check" CHECK ("fingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "PlanningProposal_view_check" CHECK ("view" IN ('day', 'week')),
  CONSTRAINT "PlanningProposal_target_check" CHECK ("targetType" = 'task' AND "actionType" = 'schedule_task'),
  CONSTRAINT "PlanningProposal_period_check" CHECK ("rangeTo" >= "rangeFrom" AND "proposedEndsAt" > "proposedStartsAt"),
  CONSTRAINT "PlanningProposal_status_check" CHECK ("status" IN ('pending', 'confirming', 'applied', 'rejected', 'discarded', 'conflict')),
  CONSTRAINT "PlanningProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PlanningProposal_id_userId_key" ON "PlanningProposal"("id", "userId");
CREATE UNIQUE INDEX "PlanningProposal_userId_fingerprint_key" ON "PlanningProposal"("userId", "fingerprint");
CREATE INDEX "PlanningProposal_userId_status_rangeFrom_rangeTo_idx" ON "PlanningProposal"("userId", "status", "rangeFrom", "rangeTo");
CREATE INDEX "PlanningProposal_userId_targetType_targetId_idx" ON "PlanningProposal"("userId", "targetType", "targetId");

CREATE TABLE "PlanningAutomation" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "kind" VARCHAR(30) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "localMinute" INTEGER NOT NULL,
  "weekday" INTEGER,
  "timezone" VARCHAR(100) NOT NULL,
  "maxSuggestions" INTEGER NOT NULL DEFAULT 10,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PlanningAutomation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlanningAutomation_kind_check" CHECK ("kind" IN ('daily_preview', 'weekly_preview')),
  CONSTRAINT "PlanningAutomation_minute_check" CHECK ("localMinute" BETWEEN 0 AND 1439),
  CONSTRAINT "PlanningAutomation_weekday_check" CHECK (("kind" = 'daily_preview' AND "weekday" IS NULL) OR ("kind" = 'weekly_preview' AND "weekday" BETWEEN 0 AND 6)),
  CONSTRAINT "PlanningAutomation_max_check" CHECK ("maxSuggestions" BETWEEN 1 AND 20),
  CONSTRAINT "PlanningAutomation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PlanningAutomation_id_userId_key" ON "PlanningAutomation"("id", "userId");
CREATE UNIQUE INDEX "PlanningAutomation_userId_kind_key" ON "PlanningAutomation"("userId", "kind");
CREATE INDEX "PlanningAutomation_enabled_kind_idx" ON "PlanningAutomation"("enabled", "kind");

CREATE TABLE "PlanningAutomationRun" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "automationId" UUID NOT NULL,
  "runKey" VARCHAR(80) NOT NULL,
  "trigger" VARCHAR(20) NOT NULL,
  "status" VARCHAR(30) NOT NULL,
  "rangeFrom" DATE NOT NULL,
  "rangeTo" DATE NOT NULL,
  "proposalCount" INTEGER NOT NULL DEFAULT 0,
  "issueCodes" JSONB NOT NULL,
  "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(3),
  CONSTRAINT "PlanningAutomationRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlanningAutomationRun_trigger_check" CHECK ("trigger" IN ('scheduled', 'manual')),
  CONSTRAINT "PlanningAutomationRun_status_check" CHECK ("status" IN ('running', 'generated', 'no_data', 'failed')),
  CONSTRAINT "PlanningAutomationRun_range_check" CHECK ("rangeTo" >= "rangeFrom"),
  CONSTRAINT "PlanningAutomationRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PlanningAutomationRun_automationId_userId_fkey" FOREIGN KEY ("automationId", "userId") REFERENCES "PlanningAutomation"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PlanningAutomationRun_automationId_runKey_key" ON "PlanningAutomationRun"("automationId", "runKey");
CREATE INDEX "PlanningAutomationRun_userId_startedAt_idx" ON "PlanningAutomationRun"("userId", "startedAt");
