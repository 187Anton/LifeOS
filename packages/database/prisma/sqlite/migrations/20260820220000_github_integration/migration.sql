CREATE TABLE "GitHubConnection" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tokenEncrypted" TEXT NOT NULL,
  "secretIv" TEXT NOT NULL,
  "secretTag" TEXT NOT NULL,
  "enabled" INTEGER NOT NULL DEFAULT 0,
  "readOnly" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'disabled',
  "accountLogin" TEXT,
  "lastErrorCode" TEXT,
  "lastTestedAt" DATETIME,
  "lastFetchedAt" DATETIME,
  "rateLimitRemaining" INTEGER,
  "rateLimitResetAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "GitHubConnection_values_check" CHECK (
    length(trim("name")) BETWEEN 1 AND 100 AND
    "enabled" IN (0, 1) AND "readOnly" = 1 AND
    "status" IN ('disabled', 'ready', 'error') AND
    ("rateLimitRemaining" IS NULL OR "rateLimitRemaining" >= 0)
  ),
  CONSTRAINT "GitHubConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GitHubConnection_userId_name_key" ON "GitHubConnection"("userId", "name");
CREATE UNIQUE INDEX "GitHubConnection_id_userId_key" ON "GitHubConnection"("id", "userId");
CREATE INDEX "GitHubConnection_userId_idx" ON "GitHubConnection"("userId");
