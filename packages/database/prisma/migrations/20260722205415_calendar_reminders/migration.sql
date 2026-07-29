-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN "reminderMinutes" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

ALTER TABLE "CalendarEvent"
ADD CONSTRAINT "CalendarEvent_reminderMinutes_check"
CHECK (
  cardinality("reminderMinutes") <= 10
  AND 0 <= ALL("reminderMinutes")
  AND 10080 >= ALL("reminderMinutes")
);
