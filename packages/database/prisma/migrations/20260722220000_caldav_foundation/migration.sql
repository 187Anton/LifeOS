-- CreateTable
CREATE TABLE "CalDavCredential" (
    "userId" UUID NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CalDavCredential_pkey" PRIMARY KEY ("userId")
);

-- AlterTable
ALTER TABLE "CalendarEvent"
ADD COLUMN "syncVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "CalDavCredential_username_key" ON "CalDavCredential"("username");

-- CreateIndex
CREATE INDEX "CalendarEvent_calendarId_syncVersion_idx" ON "CalendarEvent"("calendarId", "syncVersion");

-- AddForeignKey
ALTER TABLE "CalDavCredential"
ADD CONSTRAINT "CalDavCredential_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain constraints not expressible in the Prisma schema.
ALTER TABLE "CalDavCredential"
ADD CONSTRAINT "CalDavCredential_revision_check"
CHECK ("revision" >= 1),
ADD CONSTRAINT "CalDavCredential_revocation_check"
CHECK ("revokedAt" IS NULL OR "revokedAt" >= "createdAt");

ALTER TABLE "CalendarEvent"
ADD CONSTRAINT "CalendarEvent_syncVersion_check"
CHECK ("syncVersion" >= 0);
