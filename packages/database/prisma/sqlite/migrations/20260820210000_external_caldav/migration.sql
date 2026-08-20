CREATE TABLE "ExternalCalDavConnection" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "baseUrl" TEXT NOT NULL,
  "credentialsEncrypted" TEXT NOT NULL,
  "secretIv" TEXT NOT NULL,
  "secretTag" TEXT NOT NULL,
  "enabled" INTEGER NOT NULL DEFAULT 0,
  "readOnly" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'disabled',
  "lastErrorCode" TEXT,
  "lastTestedAt" DATETIME,
  "lastSyncAt" DATETIME,
  "revokedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ExternalCalDavConnection_values_check" CHECK (
    length(trim("name")) BETWEEN 1 AND 100 AND
    length("baseUrl") BETWEEN 1 AND 2048 AND
    "enabled" IN (0, 1) AND "readOnly" = 1 AND
    "status" IN ('disabled', 'ready', 'error', 'revoked') AND
    ("enabled" = 0 OR "revokedAt" IS NULL)
  ),
  CONSTRAINT "ExternalCalDavConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ExternalCalDavConnection_userId_name_key" ON "ExternalCalDavConnection"("userId", "name");
CREATE UNIQUE INDEX "ExternalCalDavConnection_id_userId_key" ON "ExternalCalDavConnection"("id", "userId");
CREATE INDEX "ExternalCalDavConnection_userId_revokedAt_idx" ON "ExternalCalDavConnection"("userId", "revokedAt");

CREATE TABLE "ExternalCalDavCalendar" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "href" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "remoteEtag" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ExternalCalDavCalendar_values_check" CHECK (length(trim("href")) BETWEEN 1 AND 2048 AND length(trim("displayName")) BETWEEN 1 AND 200),
  CONSTRAINT "ExternalCalDavCalendar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ExternalCalDavCalendar_connectionId_userId_fkey" FOREIGN KEY ("connectionId", "userId") REFERENCES "ExternalCalDavConnection"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ExternalCalDavCalendar_connectionId_href_key" ON "ExternalCalDavCalendar"("connectionId", "href");
CREATE UNIQUE INDEX "ExternalCalDavCalendar_id_userId_key" ON "ExternalCalDavCalendar"("id", "userId");
CREATE INDEX "ExternalCalDavCalendar_userId_idx" ON "ExternalCalDavCalendar"("userId");

CREATE TABLE "ExternalCalDavEventMapping" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "externalCalendarId" TEXT NOT NULL,
  "remoteHref" TEXT NOT NULL,
  "remoteUid" TEXT NOT NULL,
  "remoteEtag" TEXT,
  "localCalendarId" TEXT NOT NULL,
  "localEventUid" TEXT NOT NULL,
  "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExternalCalDavEventMapping_values_check" CHECK (length(trim("remoteHref")) BETWEEN 1 AND 2048 AND length(trim("remoteUid")) BETWEEN 1 AND 255 AND length(trim("localCalendarId")) BETWEEN 1 AND 100 AND length(trim("localEventUid")) BETWEEN 1 AND 255),
  CONSTRAINT "ExternalCalDavEventMapping_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ExternalCalDavEventMapping_connectionId_userId_fkey" FOREIGN KEY ("connectionId", "userId") REFERENCES "ExternalCalDavConnection"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ExternalCalDavEventMapping_externalCalendarId_userId_fkey" FOREIGN KEY ("externalCalendarId", "userId") REFERENCES "ExternalCalDavCalendar"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ExternalCalDavEventMapping_connectionId_remoteHref_key" ON "ExternalCalDavEventMapping"("connectionId", "remoteHref");
CREATE UNIQUE INDEX "ExternalCalDavEventMapping_externalCalendarId_remoteUid_key" ON "ExternalCalDavEventMapping"("externalCalendarId", "remoteUid");
CREATE UNIQUE INDEX "ExternalCalDavEventMapping_localCalendarId_localEventUid_key" ON "ExternalCalDavEventMapping"("localCalendarId", "localEventUid");
CREATE INDEX "ExternalCalDavEventMapping_userId_idx" ON "ExternalCalDavEventMapping"("userId");
