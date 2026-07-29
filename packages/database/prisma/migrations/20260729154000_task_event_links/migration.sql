-- CreateTable
CREATE TABLE "TaskEventLink" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "calendarEventId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskEventLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskEventLink_userId_taskId_idx" ON "TaskEventLink"("userId", "taskId");

-- CreateIndex
CREATE INDEX "TaskEventLink_userId_calendarEventId_idx" ON "TaskEventLink"("userId", "calendarEventId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskEventLink_userId_taskId_calendarEventId_key" ON "TaskEventLink"("userId", "taskId", "calendarEventId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_id_userId_key" ON "CalendarEvent"("id", "userId");

-- AddForeignKey
ALTER TABLE "TaskEventLink" ADD CONSTRAINT "TaskEventLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEventLink" ADD CONSTRAINT "TaskEventLink_taskId_userId_fkey" FOREIGN KEY ("taskId", "userId") REFERENCES "Task"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEventLink" ADD CONSTRAINT "TaskEventLink_calendarEventId_userId_fkey" FOREIGN KEY ("calendarEventId", "userId") REFERENCES "CalendarEvent"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
