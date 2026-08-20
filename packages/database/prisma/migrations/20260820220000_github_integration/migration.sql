BEGIN;

CREATE TABLE "GitHubConnection" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "tokenEncrypted" TEXT NOT NULL,
  "secretIv" VARCHAR(64) NOT NULL,
  "secretTag" VARCHAR(64) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "readOnly" BOOLEAN NOT NULL DEFAULT true,
  "status" VARCHAR(30) NOT NULL DEFAULT 'disabled',
  "accountLogin" VARCHAR(100),
  "lastErrorCode" VARCHAR(100),
  "lastTestedAt" TIMESTAMPTZ(3),
  "lastFetchedAt" TIMESTAMPTZ(3),
  "rateLimitRemaining" INTEGER,
  "rateLimitResetAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "GitHubConnection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GitHubConnection_values_check" CHECK (
    length(btrim("name")) > 0 AND
    "readOnly" = true AND
    "status" IN ('disabled', 'ready', 'error') AND
    ("rateLimitRemaining" IS NULL OR "rateLimitRemaining" >= 0)
  ),
  CONSTRAINT "GitHubConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GitHubConnection_userId_name_key" ON "GitHubConnection"("userId", "name");
CREATE UNIQUE INDEX "GitHubConnection_id_userId_key" ON "GitHubConnection"("id", "userId");
CREATE INDEX "GitHubConnection_userId_idx" ON "GitHubConnection"("userId");

COMMIT;
