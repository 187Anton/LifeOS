import type {
  CalendarEventResponse,
  CalendarResponse,
} from "@lifeos/contracts";
import type { DatabaseClient } from "@lifeos/database";

import { mapCalendar, mapEvent } from "../calendar/repository.js";

export interface StoredCalDavCredential {
  userId: string;
  username: string;
  passwordHash: string;
  revision: number;
}

export interface CalDavCalendar extends CalendarResponse {
  databaseId: string;
}

export interface CalDavEventChange {
  event: CalendarEventResponse;
  deleted: boolean;
  syncVersion: number;
}

export interface CalDavRepository {
  findCredential(username: string): Promise<StoredCalDavCredential | null>;
  getUserTimezone(userId: string): Promise<string>;
  listCalendars(userId: string): Promise<CalDavCalendar[]>;
  getCalendar(
    userId: string,
    externalId: string,
  ): Promise<CalDavCalendar | null>;
  listEvents(
    userId: string,
    externalId: string,
  ): Promise<CalendarEventResponse[]>;
  getEvent(
    userId: string,
    externalId: string,
    uid: string,
  ): Promise<CalendarEventResponse | null>;
  listChanges(
    userId: string,
    externalId: string,
    afterSyncVersion: number,
  ): Promise<CalDavEventChange[]>;
}

export class PrismaCalDavRepository implements CalDavRepository {
  constructor(
    private readonly database: DatabaseClient,
    private readonly localUserExternalId = "local-personal-user",
  ) {}

  async findCredential(
    username: string,
  ): Promise<StoredCalDavCredential | null> {
    return this.database.calDavCredential.findFirst({
      where: {
        username,
        revokedAt: null,
        user: { externalId: this.localUserExternalId },
      },
      select: {
        userId: true,
        username: true,
        passwordHash: true,
        revision: true,
      },
    });
  }

  async getUserTimezone(userId: string): Promise<string> {
    const settings = await this.database.userSettings.findUnique({
      where: { userId },
      select: { timezone: true },
    });
    return settings?.timezone ?? "Europe/Berlin";
  }

  async listCalendars(userId: string): Promise<CalDavCalendar[]> {
    return (
      await this.database.calendar.findMany({
        where: { userId, deletedAt: null },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      })
    ).map((calendar) => ({
      ...mapCalendar(calendar),
      databaseId: calendar.id,
    }));
  }

  async getCalendar(
    userId: string,
    externalId: string,
  ): Promise<CalDavCalendar | null> {
    const calendar = await this.database.calendar.findFirst({
      where: { userId, externalId, deletedAt: null },
    });
    return calendar
      ? { ...mapCalendar(calendar), databaseId: calendar.id }
      : null;
  }

  async listEvents(
    userId: string,
    externalId: string,
  ): Promise<CalendarEventResponse[]> {
    const calendar = await this.getCalendar(userId, externalId);
    if (!calendar) return [];
    return (
      await this.database.calendarEvent.findMany({
        where: {
          userId,
          calendarId: calendar.databaseId,
          deletedAt: null,
        },
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
  ): Promise<CalendarEventResponse | null> {
    const calendar = await this.getCalendar(userId, externalId);
    if (!calendar) return null;
    const event = await this.database.calendarEvent.findFirst({
      where: {
        userId,
        calendarId: calendar.databaseId,
        uid,
        deletedAt: null,
      },
    });
    return event ? mapEvent(event) : null;
  }

  async listChanges(
    userId: string,
    externalId: string,
    afterSyncVersion: number,
  ): Promise<CalDavEventChange[]> {
    const calendar = await this.getCalendar(userId, externalId);
    if (!calendar) return [];
    return (
      await this.database.calendarEvent.findMany({
        where: {
          userId,
          calendarId: calendar.databaseId,
          syncVersion: { gt: afterSyncVersion },
        },
        orderBy: [{ syncVersion: "asc" }, { uid: "asc" }],
      })
    ).map((event) => ({
      event: mapEvent(event),
      deleted: event.deletedAt !== null,
      syncVersion: event.syncVersion,
    }));
  }
}
