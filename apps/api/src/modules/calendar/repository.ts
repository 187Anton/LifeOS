import type { DatabaseClient } from "@lifeos/database";
import type {
  CalendarEventResponse,
  CalendarResponse,
} from "@lifeos/contracts";

export interface EventValues {
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  startDate?: Date | null;
  endDate?: Date | null;
  timezone: string;
  isAllDay: boolean;
  recurrenceRule?: string | null;
  reminderMinutes: number[];
}

export class CalendarNotFoundError extends Error {}
export class EventNotFoundError extends Error {}
export class EtagConflictError extends Error {}

const mapCalendar = (calendar: {
  externalId: string;
  name: string;
  timezone: string;
  isPrimary: boolean;
  syncToken: number;
}): CalendarResponse => ({
  id: calendar.externalId,
  name: calendar.name,
  timezone: calendar.timezone,
  isPrimary: calendar.isPrimary,
  syncToken: calendar.syncToken,
});

const mapEvent = (event: {
  uid: string;
  title: string;
  description: string | null;
  location: string | null;
  isAllDay: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  startDate: Date | null;
  endDate: Date | null;
  timezone: string;
  recurrenceRule: string | null;
  reminderMinutes: number[];
  etag: string;
  sequence: number;
  updatedAt: Date;
}): CalendarEventResponse => ({
  uid: event.uid,
  title: event.title,
  description: event.description,
  location: event.location,
  isAllDay: event.isAllDay,
  startsAt: event.startsAt?.toISOString() ?? null,
  endsAt: event.endsAt?.toISOString() ?? null,
  startDate: event.startDate?.toISOString().slice(0, 10) ?? null,
  endDate: event.endDate?.toISOString().slice(0, 10) ?? null,
  timezone: event.timezone,
  recurrenceRule: event.recurrenceRule,
  reminderMinutes: event.reminderMinutes,
  etag: event.etag,
  sequence: event.sequence,
  updatedAt: event.updatedAt.toISOString(),
});

export class PrismaCalendarRepository {
  constructor(private readonly database: DatabaseClient) {}

  async listCalendars(userId: string): Promise<CalendarResponse[]> {
    return (
      await this.database.calendar.findMany({
        where: { userId, deletedAt: null },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      })
    ).map(mapCalendar);
  }

  async createCalendar(
    userId: string,
    input: {
      externalId: string;
      name: string;
      timezone: string;
      isPrimary: boolean;
    },
  ): Promise<CalendarResponse> {
    return this.database.$transaction(async (transaction) => {
      const existingCount = await transaction.calendar.count({
        where: { userId, deletedAt: null },
      });
      const makePrimary = input.isPrimary || existingCount === 0;
      if (makePrimary) {
        await transaction.calendar.updateMany({
          where: { userId, deletedAt: null, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      const calendar = await transaction.calendar.create({
        data: { ...input, userId, isPrimary: makePrimary },
      });
      await transaction.auditEvent.create({
        data: {
          userId,
          action: "calendar.created",
          entityType: "Calendar",
          entityId: calendar.externalId,
        },
      });
      return mapCalendar(calendar);
    });
  }

  async updateCalendar(
    userId: string,
    externalId: string,
    changes: { name?: string; timezone?: string; isPrimary?: boolean },
  ): Promise<CalendarResponse> {
    return this.database.$transaction(async (transaction) => {
      const current = await transaction.calendar.findFirst({
        where: { userId, externalId, deletedAt: null },
      });
      if (!current) throw new CalendarNotFoundError();
      if (changes.isPrimary === true) {
        await transaction.calendar.updateMany({
          where: { userId, deletedAt: null, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      const calendar = await transaction.calendar.update({
        where: { id: current.id },
        data: { ...changes, syncToken: { increment: 1 } },
      });
      await transaction.auditEvent.create({
        data: {
          userId,
          action: "calendar.updated",
          entityType: "Calendar",
          entityId: externalId,
          metadata: { changedFields: Object.keys(changes).sort() },
        },
      });
      return mapCalendar(calendar);
    });
  }

  async deleteCalendar(userId: string, externalId: string): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const current = await transaction.calendar.findFirst({
        where: { userId, externalId, deletedAt: null },
      });
      if (!current) throw new CalendarNotFoundError();
      const now = new Date();
      await transaction.calendar.update({
        where: { id: current.id },
        data: { deletedAt: now, isPrimary: false, syncToken: { increment: 1 } },
      });
      await transaction.calendarEvent.updateMany({
        where: { calendarId: current.id, deletedAt: null },
        data: { deletedAt: now },
      });
      if (current.isPrimary) {
        const replacement = await transaction.calendar.findFirst({
          where: { userId, deletedAt: null },
          orderBy: { createdAt: "asc" },
        });
        if (replacement) {
          await transaction.calendar.update({
            where: { id: replacement.id },
            data: { isPrimary: true, syncToken: { increment: 1 } },
          });
        }
      }
      await transaction.auditEvent.create({
        data: {
          userId,
          action: "calendar.deleted",
          entityType: "Calendar",
          entityId: externalId,
        },
      });
    });
  }

  async listEvents(
    userId: string,
    externalId: string,
  ): Promise<CalendarEventResponse[]> {
    const calendar = await this.findCalendar(userId, externalId);
    return (
      await this.database.calendarEvent.findMany({
        where: { userId, calendarId: calendar.id, deletedAt: null },
        orderBy: [
          { startDate: "asc" },
          { startsAt: "asc" },
          { createdAt: "asc" },
        ],
      })
    ).map(mapEvent);
  }

  async getEvent(
    userId: string,
    externalId: string,
    uid: string,
  ): Promise<CalendarEventResponse> {
    const calendar = await this.findCalendar(userId, externalId);
    const event = await this.database.calendarEvent.findFirst({
      where: { userId, calendarId: calendar.id, uid, deletedAt: null },
    });
    if (!event) throw new EventNotFoundError();
    return mapEvent(event);
  }

  async createEvent(
    userId: string,
    externalId: string,
    input: EventValues & { uid: string; etag: string },
  ): Promise<CalendarEventResponse> {
    return this.database.$transaction(async (transaction) => {
      const calendar = await transaction.calendar.findFirst({
        where: { userId, externalId, deletedAt: null },
      });
      if (!calendar) throw new CalendarNotFoundError();
      const event = await transaction.calendarEvent.create({
        data: { ...input, userId, calendarId: calendar.id },
      });
      await transaction.calendar.update({
        where: { id: calendar.id },
        data: { syncToken: { increment: 1 } },
      });
      await transaction.auditEvent.create({
        data: {
          userId,
          action: "calendar.event.created",
          entityType: "CalendarEvent",
          entityId: input.uid,
        },
      });
      return mapEvent(event);
    });
  }

  async updateEvent(
    userId: string,
    externalId: string,
    uid: string,
    expectedEtag: string,
    values: EventValues & { etag: string },
  ): Promise<CalendarEventResponse> {
    return this.database.$transaction(async (transaction) => {
      const calendar = await transaction.calendar.findFirst({
        where: { userId, externalId, deletedAt: null },
      });
      if (!calendar) throw new CalendarNotFoundError();
      const current = await transaction.calendarEvent.findFirst({
        where: { userId, calendarId: calendar.id, uid, deletedAt: null },
      });
      if (!current) throw new EventNotFoundError();
      const updated = await transaction.calendarEvent.updateMany({
        where: { id: current.id, etag: expectedEtag, deletedAt: null },
        data: { ...values, sequence: { increment: 1 } },
      });
      if (updated.count !== 1) throw new EtagConflictError();
      const event = await transaction.calendarEvent.findUniqueOrThrow({
        where: { id: current.id },
      });
      await transaction.calendar.update({
        where: { id: calendar.id },
        data: { syncToken: { increment: 1 } },
      });
      await transaction.auditEvent.create({
        data: {
          userId,
          action: "calendar.event.updated",
          entityType: "CalendarEvent",
          entityId: uid,
        },
      });
      return mapEvent(event);
    });
  }

  async deleteEvent(
    userId: string,
    externalId: string,
    uid: string,
    expectedEtag: string,
    deletedEtag: string,
  ): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const calendar = await transaction.calendar.findFirst({
        where: { userId, externalId, deletedAt: null },
      });
      if (!calendar) throw new CalendarNotFoundError();
      const current = await transaction.calendarEvent.findFirst({
        where: { userId, calendarId: calendar.id, uid, deletedAt: null },
      });
      if (!current) throw new EventNotFoundError();
      const deleted = await transaction.calendarEvent.updateMany({
        where: { id: current.id, etag: expectedEtag, deletedAt: null },
        data: {
          deletedAt: new Date(),
          etag: deletedEtag,
          sequence: { increment: 1 },
        },
      });
      if (deleted.count !== 1) throw new EtagConflictError();
      await transaction.calendar.update({
        where: { id: calendar.id },
        data: { syncToken: { increment: 1 } },
      });
      await transaction.auditEvent.create({
        data: {
          userId,
          action: "calendar.event.deleted",
          entityType: "CalendarEvent",
          entityId: uid,
        },
      });
    });
  }

  private async findCalendar(userId: string, externalId: string) {
    const calendar = await this.database.calendar.findFirst({
      where: { userId, externalId, deletedAt: null },
      select: { id: true },
    });
    if (!calendar) throw new CalendarNotFoundError();
    return calendar;
  }
}
