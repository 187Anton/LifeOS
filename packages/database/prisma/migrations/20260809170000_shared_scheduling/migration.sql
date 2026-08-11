CREATE TABLE "AvailabilityWindow" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "timezone" VARCHAR(100) NOT NULL,
    "label" VARCHAR(200),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "AvailabilityWindow_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AvailabilityWindow_weekday_valid" CHECK ("weekday" BETWEEN 0 AND 6),
    CONSTRAINT "AvailabilityWindow_minutes_valid" CHECK ("startMinute" BETWEEN 0 AND 1439 AND "endMinute" BETWEEN 1 AND 1440 AND "endMinute" > "startMinute"),
    CONSTRAINT "AvailabilityWindow_timezone_not_blank" CHECK (btrim("timezone") <> '')
);

CREATE UNIQUE INDEX "AvailabilityWindow_userId_weekday_startMinute_endMinute_key" ON "AvailabilityWindow"("userId", "weekday", "startMinute", "endMinute");
CREATE INDEX "AvailabilityWindow_userId_weekday_idx" ON "AvailabilityWindow"("userId", "weekday");

ALTER TABLE "AvailabilityWindow" ADD CONSTRAINT "AvailabilityWindow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
