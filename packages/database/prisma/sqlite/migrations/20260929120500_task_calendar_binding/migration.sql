-- Paket 9: separat erkennbare, besitzgebundene verwaltete Verbindung zwischen
-- Aufgabe und Kalenderereignis. Rein additive Änderung: es wird ausschließlich
-- eine neue Tabelle angelegt. Bestehende Aufgaben, Kalenderereignisse, freie
-- TaskEventLink-Beziehungen, Indizes und Zeilen bleiben unverändert; es wird
-- keine Bestandszeile umgedeutet und kein Datensatz gelöscht. Der Lauf benötigt
-- deshalb kein Vor-Migrationsbackup und kein foreign_keys = OFF.

CREATE TABLE "TaskCalendarBinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "calendarEventId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "lastKnownEtag" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskCalendarBinding_kind_check" CHECK ("kind" IN ('due', 'work_block')),
    CONSTRAINT "TaskCalendarBinding_etag_check" CHECK (length(trim("lastKnownEtag")) BETWEEN 1 AND 100),
    CONSTRAINT "TaskCalendarBinding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskCalendarBinding_taskId_userId_fkey" FOREIGN KEY ("taskId", "userId") REFERENCES "Task" ("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskCalendarBinding_calendarEventId_userId_fkey" FOREIGN KEY ("calendarEventId", "userId") REFERENCES "CalendarEvent" ("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TaskCalendarBinding_taskId_kind_key" ON "TaskCalendarBinding"("taskId", "kind");
CREATE UNIQUE INDEX "TaskCalendarBinding_calendarEventId_key" ON "TaskCalendarBinding"("calendarEventId");
CREATE UNIQUE INDEX "TaskCalendarBinding_id_userId_key" ON "TaskCalendarBinding"("id", "userId");
CREATE INDEX "TaskCalendarBinding_userId_kind_idx" ON "TaskCalendarBinding"("userId", "kind");
CREATE INDEX "TaskCalendarBinding_userId_taskId_idx" ON "TaskCalendarBinding"("userId", "taskId");
CREATE INDEX "TaskCalendarBinding_calendarEventId_idx" ON "TaskCalendarBinding"("calendarEventId");
