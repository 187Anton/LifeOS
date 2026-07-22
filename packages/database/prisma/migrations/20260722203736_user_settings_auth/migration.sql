-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "defaultCalendarView" VARCHAR(10) NOT NULL DEFAULT 'week',
ADD COLUMN     "showWeekends" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "UserCredential" (
    "userId" UUID NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UserCredential_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "credentialRevision" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "UserSession"("tokenHash");

-- CreateIndex
CREATE INDEX "UserSession_userId_revokedAt_expiresAt_idx" ON "UserSession"("userId", "revokedAt", "expiresAt");

-- AddForeignKey
ALTER TABLE "UserCredential" ADD CONSTRAINT "UserCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain constraints not expressible in the Prisma schema.
ALTER TABLE "UserSettings"
ADD CONSTRAINT "UserSettings_defaultCalendarView_check"
CHECK ("defaultCalendarView" IN ('day', 'week', 'month'));

ALTER TABLE "UserCredential"
ADD CONSTRAINT "UserCredential_revision_check"
CHECK ("revision" >= 1);

ALTER TABLE "UserSession"
ADD CONSTRAINT "UserSession_credentialRevision_check"
CHECK ("credentialRevision" >= 1),
ADD CONSTRAINT "UserSession_tokenHash_check"
CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
ADD CONSTRAINT "UserSession_expiry_check"
CHECK ("expiresAt" > "createdAt"),
ADD CONSTRAINT "UserSession_revocation_check"
CHECK ("revokedAt" IS NULL OR "revokedAt" >= "createdAt");
