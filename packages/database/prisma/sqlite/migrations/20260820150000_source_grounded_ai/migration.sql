CREATE TABLE "AiInteraction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL CHECK (length("requestHash") = 64 AND "requestHash" NOT GLOB '*[^0-9a-f]*'),
  "status" TEXT NOT NULL CHECK ("status" IN ('disabled', 'no_sources', 'insufficient_sources', 'conflicting_sources', 'unsafe_sources', 'external_release_required', 'provider_missing', 'ready')),
  "providerId" TEXT,
  "processingMode" TEXT NOT NULL DEFAULT 'local' CHECK ("processingMode" IN ('local', 'external')),
  "externalTransferOccurred" INTEGER NOT NULL DEFAULT 0 CHECK ("externalTransferOccurred" IN (0, 1)),
  "sourceReferences" JSONB NOT NULL CHECK (json_valid("sourceReferences")),
  "responseMetadata" JSONB NOT NULL CHECK (json_valid("responseMetadata")),
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AiInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AiInteraction_id_userId_key" ON "AiInteraction"("id", "userId");
CREATE INDEX "AiInteraction_userId_createdAt_idx" ON "AiInteraction"("userId", "createdAt");
