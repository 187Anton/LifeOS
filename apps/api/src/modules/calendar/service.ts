import { randomUUID } from "node:crypto";

import { ApiError } from "../../errors.js";
import {
  CalendarNotFoundError,
  EtagConflictError,
  EventNotFoundError,
  type EventValues,
  type PrismaCalendarRepository,
} from "./repository.js";

export type EventInput =
  | {
      title: string;
      description?: string | null;
      location?: string | null;
      timezone: string;
      isAllDay: false;
      startsAt: string;
      endsAt: string;
      recurrenceRule?: string | null;
      reminderMinutes?: number[];
      uid?: string;
    }
  | {
      title: string;
      description?: string | null;
      location?: string | null;
      timezone: string;
      isAllDay: true;
      startDate: string;
      endDate: string;
      recurrenceRule?: string | null;
      reminderMinutes?: number[];
      uid?: string;
    };

const etag = (): string => `"${randomUUID()}"`;

const eventValues = (input: EventInput): EventValues => {
  if (input.isAllDay) {
    const startDate = new Date(`${input.startDate}T00:00:00.000Z`);
    const endDate = new Date(`${input.endDate}T00:00:00.000Z`);
    if (endDate <= startDate) {
      throw ApiError.validation([
        { field: "body.endDate", message: "Muss nach dem Startdatum liegen." },
      ]);
    }
    return {
      title: input.title,
      description: input.description ?? null,
      location: input.location ?? null,
      timezone: input.timezone,
      isAllDay: true,
      startDate,
      endDate,
      startsAt: null,
      endsAt: null,
      recurrenceRule: input.recurrenceRule ?? null,
      reminderMinutes: [...new Set(input.reminderMinutes ?? [])].sort(
        (left, right) => left - right,
      ),
    };
  }

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (endsAt <= startsAt) {
    throw ApiError.validation([
      { field: "body.endsAt", message: "Muss nach dem Startzeitpunkt liegen." },
    ]);
  }
  return {
    title: input.title,
    description: input.description ?? null,
    location: input.location ?? null,
    timezone: input.timezone,
    isAllDay: false,
    startsAt,
    endsAt,
    startDate: null,
    endDate: null,
    recurrenceRule: input.recurrenceRule ?? null,
    reminderMinutes: [...new Set(input.reminderMinutes ?? [])].sort(
      (left, right) => left - right,
    ),
  };
};

export class CalendarService {
  constructor(private readonly repository: PrismaCalendarRepository) {}

  listCalendars(userId: string) {
    return this.repository.listCalendars(userId);
  }

  async createCalendar(
    userId: string,
    input: { name: string; timezone: string; isPrimary?: boolean },
  ) {
    return this.repository.createCalendar(userId, {
      externalId: randomUUID(),
      name: input.name,
      timezone: input.timezone,
      isPrimary: input.isPrimary ?? false,
    });
  }

  async updateCalendar(
    userId: string,
    calendarId: string,
    changes: { name?: string; timezone?: string; isPrimary?: boolean },
  ) {
    try {
      return await this.repository.updateCalendar(userId, calendarId, changes);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async deleteCalendar(userId: string, calendarId: string) {
    try {
      await this.repository.deleteCalendar(userId, calendarId);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async listEvents(userId: string, calendarId: string) {
    try {
      return await this.repository.listEvents(userId, calendarId);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async getEvent(userId: string, calendarId: string, uid: string) {
    try {
      return await this.repository.getEvent(userId, calendarId, uid);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async createEvent(userId: string, calendarId: string, input: EventInput) {
    try {
      return await this.repository.createEvent(userId, calendarId, {
        ...eventValues(input),
        uid: input.uid ?? `${randomUUID()}@lifeos.local`,
        etag: etag(),
      });
    } catch (error) {
      this.rethrow(error);
    }
  }

  async replaceEvent(
    userId: string,
    calendarId: string,
    uid: string,
    expectedEtag: string,
    input: EventInput,
  ) {
    try {
      return await this.repository.updateEvent(
        userId,
        calendarId,
        uid,
        expectedEtag,
        { ...eventValues(input), etag: etag() },
      );
    } catch (error) {
      this.rethrow(error);
    }
  }

  async deleteEvent(
    userId: string,
    calendarId: string,
    uid: string,
    expectedEtag: string,
  ) {
    try {
      await this.repository.deleteEvent(
        userId,
        calendarId,
        uid,
        expectedEtag,
        etag(),
      );
    } catch (error) {
      this.rethrow(error);
    }
  }

  private rethrow(error: unknown): never {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      throw new ApiError(
        409,
        "CONFLICT",
        "Eine Ressource mit dieser stabilen Kennung existiert bereits.",
      );
    }
    if (error instanceof CalendarNotFoundError) {
      throw new ApiError(
        404,
        "NOT_FOUND",
        "Der Kalender wurde nicht gefunden.",
      );
    }
    if (error instanceof EventNotFoundError) {
      throw new ApiError(
        404,
        "NOT_FOUND",
        "Das Ereignis wurde nicht gefunden.",
      );
    }
    if (error instanceof EtagConflictError) {
      throw new ApiError(
        412,
        "PRECONDITION_FAILED",
        "Das Ereignis wurde zwischenzeitlich geändert. Lade es erneut.",
      );
    }
    throw error;
  }
}
