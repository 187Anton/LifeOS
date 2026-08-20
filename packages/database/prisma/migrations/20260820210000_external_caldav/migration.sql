BEGIN;

CREATE TABLE "ExternalCalDavConnection" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "baseUrl" VARCHAR(2048) NOT NULL,
  "credentialsEncrypted" TEXT NOT NULL,
  "secretIv" VARCHAR(64) NOT NULL,
  "secretTag" VARCHAR(64) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "readOnly" BOOLEAN NOT NULL DEFAULT true,
  "status" VARCHAR(30) NOT NULL DEFAULT 'disabled',
  "lastErrorCode" VARCHAR(100),
  "lastTestedAt" TIMESTAMPTZ(3),
  "lastSyncAt" TIMESTAMPTZ(3),
  "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ExternalCalDavConnection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExternalCalDavConnection_values_check" CHECK (
    length(btrim("name")) > 0 AND
    "readOnly" = true AND
    "status" IN ('disabled', 'ready', 'error', 'revoked') AND
    ("enabled" = false OR "revokedAt" IS NULL)
  ),
  CONSTRAINT "ExternalCalDavConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ExternalCalDavConnection_userId_name_key" ON "ExternalCalDavConnection"("userId", "name");
CREATE UNIQUE INDEX "ExternalCalDavConnection_id_userId_key" ON "ExternalCalDavConnection"("id", "userId");
CREATE INDEX "ExternalCalDavConnection_userId_revokedAt_idx" ON "ExternalCalDavConnection"("userId", "revokedAt");

CREATE TABLE "ExternalCalDavCalendar" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "connectionId" UUID NOT NULL,
  "href" VARCHAR(2048) NOT NULL,
  "displayName" VARCHAR(200) NOT NULL,
  "remoteEtag" VARCHAR(255),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ExternalCalDavCalendar_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExternalCalDavCalendar_values_check" CHECK (length(btrim("href")) > 0 AND length(btrim("displayName")) > 0),
  CONSTRAINT "ExternalCalDavCalendar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ExternalCalDavCalendar_connectionId_userId_fkey" FOREIGN KEY ("connectionId", "userId") REFERENCES "ExternalCalDavConnection"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ExternalCalDavCalendar_connectionId_href_key" ON "ExternalCalDavCalendar"("connectionId", "href");
CREATE UNIQUE INDEX "ExternalCalDavCalendar_id_userId_key" ON "ExternalCalDavCalendar"("id", "userId");
CREATE INDEX "ExternalCalDavCalendar_userId_idx" ON "ExternalCalDavCalendar"("userId");

CREATE TABLE "ExternalCalDavEventMapping" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "connectionId" UUID NOT NULL,
  "externalCalendarId" UUID NOT NULL,
  "remoteHref" VARCHAR(2048) NOT NULL,
  "remoteUid" VARCHAR(255) NOT NULL,
  "remoteEtag" VARCHAR(255),
  "localCalendarId" VARCHAR(100) NOT NULL,
  "localEventUid" VARCHAR(255) NOT NULL,
  "importedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExternalCalDavEventMapping_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExternalCalDavEventMapping_values_check" CHECK (length(btrim("remoteHref")) > 0 AND length(btrim("remoteUid")) > 0 AND length(btrim("localCalendarId")) > 0 AND length(btrim("localEventUid")) > 0),
  CONSTRAINT "ExternalCalDavEventMapping_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ExternalCalDavEventMapping_connectionId_userId_fkey" FOREIGN KEY ("connectionId", "userId") REFERENCES "ExternalCalDavConnection"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ExternalCalDavEventMapping_externalCalendarId_userId_fkey" FOREIGN KEY ("externalCalendarId", "userId") REFERENCES "ExternalCalDavCalendar"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ExternalCalDavEventMapping_connectionId_remoteHref_key" ON "ExternalCalDavEventMapping"("connectionId", "remoteHref");
CREATE UNIQUE INDEX "ExternalCalDavEventMapping_externalCalendarId_remoteUid_key" ON "ExternalCalDavEventMapping"("externalCalendarId", "remoteUid");
CREATE UNIQUE INDEX "ExternalCalDavEventMapping_localCalendarId_localEventUid_key" ON "ExternalCalDavEventMapping"("localCalendarId", "localEventUid");
CREATE INDEX "ExternalCalDavEventMapping_userId_idx" ON "ExternalCalDavEventMapping"("userId");

COMMIT;
