BEGIN;

-- Paket 9: separat erkennbare, besitzgebundene verwaltete Verbindung zwischen
-- Aufgabe und Kalenderereignis. Rein additive Änderung: bestehende Aufgaben,
-- Kalenderereignisse und freie TaskEventLink-Beziehungen bleiben unverändert
-- und werden ausdrücklich nicht umgedeutet. Je Aufgabe sind höchstens eine
-- Frist (`due`) und höchstens ein Arbeitsblock (`work_block`) möglich; ein
-- Ereignis gehört höchstens zu einer verwalteten Abbildung.

CREATE TYPE "TaskCalendarBindingKind" AS ENUM ('due', 'work_block');

CREATE TABLE "TaskCalendarBinding" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "calendarEventId" UUID NOT NULL,
    "kind" "TaskCalendarBindingKind" NOT NULL,
    "lastKnownEtag" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TaskCalendarBinding_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TaskCalendarBinding_etag_check" CHECK (length(btrim("lastKnownEtag")) BETWEEN 1 AND 100)
);

CREATE UNIQUE INDEX "TaskCalendarBinding_taskId_kind_key" ON "TaskCalendarBinding"("taskId", "kind");
CREATE UNIQUE INDEX "TaskCalendarBinding_calendarEventId_key" ON "TaskCalendarBinding"("calendarEventId");
CREATE UNIQUE INDEX "TaskCalendarBinding_id_userId_key" ON "TaskCalendarBinding"("id", "userId");
CREATE INDEX "TaskCalendarBinding_userId_kind_idx" ON "TaskCalendarBinding"("userId", "kind");
CREATE INDEX "TaskCalendarBinding_userId_taskId_idx" ON "TaskCalendarBinding"("userId", "taskId");
CREATE INDEX "TaskCalendarBinding_calendarEventId_idx" ON "TaskCalendarBinding"("calendarEventId");

ALTER TABLE "TaskCalendarBinding" ADD CONSTRAINT "TaskCalendarBinding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskCalendarBinding" ADD CONSTRAINT "TaskCalendarBinding_taskId_userId_fkey" FOREIGN KEY ("taskId", "userId") REFERENCES "Task"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskCalendarBinding" ADD CONSTRAINT "TaskCalendarBinding_calendarEventId_userId_fkey" FOREIGN KEY ("calendarEventId", "userId") REFERENCES "CalendarEvent"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
