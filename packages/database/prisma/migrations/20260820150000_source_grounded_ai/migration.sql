CREATE TABLE "AiInteraction" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "requestHash" CHAR(64) NOT NULL,
  "status" VARCHAR(50) NOT NULL,
  "providerId" VARCHAR(100),
  "processingMode" VARCHAR(20) NOT NULL DEFAULT 'local',
  "externalTransferOccurred" BOOLEAN NOT NULL DEFAULT false,
  "sourceReferences" JSONB NOT NULL,
  "responseMetadata" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "AiInteraction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiInteraction_request_hash_check" CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "AiInteraction_status_check" CHECK ("status" IN ('disabled', 'no_sources', 'insufficient_sources', 'conflicting_sources', 'unsafe_sources', 'external_release_required', 'provider_missing', 'ready')),
  CONSTRAINT "AiInteraction_processing_mode_check" CHECK ("processingMode" IN ('local', 'external')),
  CONSTRAINT "AiInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AiInteraction_id_userId_key" ON "AiInteraction"("id", "userId");
CREATE INDEX "AiInteraction_userId_createdAt_idx" ON "AiInteraction"("userId", "createdAt");
