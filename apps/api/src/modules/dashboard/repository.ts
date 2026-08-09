import type { DatabaseClient } from "@lifeos/database";
import type {
  DashboardEventResponse,
  DashboardResponse,
} from "@lifeos/contracts";

import { mapEvent } from "../calendar/repository.js";
import { mapTask } from "../tasks/repository.js";

export class DashboardProfileNotFoundError extends Error {}

export interface DashboardRepository {
  getSnapshot(userId: string, generatedAt: Date): Promise<DashboardResponse>;
}

const dateKeyInTimezone = (value: Date, timezone: string): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

const addDays = (date: string, days: number): string => {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const timezoneOffsetAt = (timestamp: number, timezone: string): number => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((item) => item.type === type)?.value);
  return (
    Date.UTC(
      part("year"),
      part("month") - 1,
      part("day"),
      part("hour"),
      part("minute"),
      part("second"),
    ) - timestamp
  );
};

const startOfDateInTimezone = (date: string, timezone: string): Date => {
  const wallTime = new Date(`${date}T00:00:00.000Z`).valueOf();
  let timestamp = wallTime - timezoneOffsetAt(wallTime, timezone);
  timestamp = wallTime - timezoneOffsetAt(timestamp, timezone);
  return new Date(timestamp);
};

export class PrismaDashboardRepository implements DashboardRepository {
  constructor(private readonly database: DatabaseClient) {}

  async getSnapshot(
    userId: string,
    generatedAt: Date,
  ): Promise<DashboardResponse> {
    const settings = await this.database.userSettings.findUnique({
      where: { userId },
      select: { timezone: true },
    });
    if (!settings) throw new DashboardProfileNotFoundError();

    const today = dateKeyInTimezone(generatedAt, settings.timezone);
    const horizon = addDays(today, 31);
    const startsAt = startOfDateInTimezone(today, settings.timezone);
    const endsAt = startOfDateInTimezone(horizon, settings.timezone);
    const startDate = new Date(`${today}T00:00:00.000Z`);
    const endDate = new Date(`${horizon}T00:00:00.000Z`);

    const [tasks, events, projects] = await this.database.$transaction(
      async (transaction) =>
        Promise.all([
          transaction.task.findMany({
            where: {
              userId,
              deletedAt: null,
              archivedAt: null,
              status: { in: ["open", "in_progress", "blocked"] },
            },
            orderBy: [
              { dueDate: { sort: "asc", nulls: "last" } },
              { priority: "desc" },
              { createdAt: "asc" },
            ],
          }),
          transaction.calendarEvent.findMany({
            where: {
              userId,
              deletedAt: null,
              calendar: { deletedAt: null },
              OR: [
                { recurrenceRule: { not: null } },
                {
                  isAllDay: false,
                  startsAt: { lt: endsAt },
                  endsAt: { gt: startsAt },
                },
                {
                  isAllDay: true,
                  startDate: { lt: endDate },
                  endDate: { gt: startDate },
                },
              ],
            },
            include: {
              calendar: {
                select: { externalId: true, name: true },
              },
            },
            orderBy: [
              { startDate: "asc" },
              { startsAt: "asc" },
              { createdAt: "asc" },
            ],
          }),
          transaction.project.findMany({
            where: {
              userId,
              archivedAt: null,
              tasks: {
                some: {
                  deletedAt: null,
                  archivedAt: null,
                  status: { in: ["open", "in_progress", "blocked"] },
                },
              },
            },
            select: {
              id: true,
              title: true,
              _count: {
                select: {
                  tasks: {
                    where: {
                      deletedAt: null,
                      archivedAt: null,
                      status: { in: ["open", "in_progress", "blocked"] },
                    },
                  },
                },
              },
            },
            orderBy: { title: "asc" },
          }),
        ]),
    );

    return {
      generatedAt: generatedAt.toISOString(),
      timezone: settings.timezone,
      tasks: tasks.map(mapTask),
      events: events.map((event): DashboardEventResponse => ({
        ...mapEvent(event),
        calendarId: event.calendar.externalId,
        calendarName: event.calendar.name,
      })),
      projects: projects.map((project) => ({
        id: project.id,
        title: project.title,
        openTaskCount: project._count.tasks,
      })),
    };
  }
}
