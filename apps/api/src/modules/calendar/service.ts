import { randomUUID } from "node:crypto";

import { ApiError } from "../../errors.js";
import type {
  ManagedEventChangeRequest,
  ManagedTaskBindingPort,
} from "../task-calendar-bindings/service.js";
import {
  CalendarNotFoundError,
  EtagConflictError,
  EventNotFoundError,
  type EventImportSideEffect,
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
      isAllDay: false;
      /**
       * Paket 9: gezielte Startmarkierung eines verwalteten Aufgabenereignisses.
       * `DTSTART` ohne `DTEND` – es wird kein Ende erfunden. Nur der verwaltete
       * Schreibpfad nimmt diese Form an.
       */
      startMarker: true;
      startsAt: string;
      /**
       * Ausdrücklich ohne Ende: `null` statt einer erfundenen Dauer. Der Wert
       * muss mitgegeben werden, damit die Form nicht stillschweigend entsteht.
       */
      endsAt: null;
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

/** Form des eingehenden Ereignisses. */
export const isStartMarkerInput = (
  input: EventInput,
): input is Extract<EventInput, { startMarker: true }> =>
  input.isAllDay === false &&
  "startMarker" in input &&
  input.startMarker === true;

const etag = (): string => `"${randomUUID()}"`;

const eventValues = (
  input: EventInput,
  options: {
    /** Nur der verwaltete Schreibpfad darf eine Startmarkierung anlegen. */
    allowStartMarker?: boolean;
  } = {},
): EventValues => {
  if (isStartMarkerInput(input)) {
    if (!options.allowStartMarker) {
      throw ApiError.validation([
        {
          field: "body.endsAt",
          message:
            "Ein zeitgebundenes Ereignis braucht einen Endzeitpunkt; „ohne Ende“ ist ausschließlich für verwaltete Startmarkierungen vorgesehen.",
        },
      ]);
    }
    return {
      title: input.title,
      description: input.description ?? null,
      location: input.location ?? null,
      timezone: input.timezone,
      isAllDay: false,
      isStartMarker: true,
      startsAt: new Date(input.startsAt),
      endsAt: null,
      startDate: null,
      endDate: null,
      recurrenceRule: input.recurrenceRule ?? null,
      reminderMinutes: [...new Set(input.reminderMinutes ?? [])].sort(
        (left, right) => left - right,
      ),
    };
  }
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
      isStartMarker: false,
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
    isStartMarker: false,
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
  constructor(
    private readonly repository: PrismaCalendarRepository,
    /**
     * Paket 9: dieselbe Transaktion für verwaltete Aufgabenereignisse. Ohne
     * Angabe verhält sich der Dienst wie bisher.
     */
    private readonly bindings?: ManagedTaskBindingPort,
  ) {}

  private managedChangeRequest(
    calendarId: string,
    uid: string,
    expectedEtag: string,
    input: EventInput,
  ): ManagedEventChangeRequest {
    const common = {
      calendarExternalId: calendarId,
      uid,
      expectedEtag,
      title: input.title,
      description: input.description ?? null,
      location: input.location ?? null,
      timezone: input.timezone,
      recurrenceRule: input.recurrenceRule ?? null,
      reminderMinutes: [...new Set(input.reminderMinutes ?? [])].sort(
        (left, right) => left - right,
      ),
    };
    return input.isAllDay
      ? {
          ...common,
          isAllDay: true,
          startDate: input.startDate,
          endDate: input.endDate,
          startsAt: null,
          endsAt: null,
        }
      : {
          ...common,
          isAllDay: false,
          startsAt: input.startsAt,
          endsAt: input.endsAt ?? null,
          startDate: null,
          endDate: null,
        };
  }

  listCalendars(userId: string) {
    return this.repository.listCalendars(userId);
  }

  async createCalendar(
    userId: string,
    input: { name: string; timezone: string; isPrimary?: boolean },
    externalId: string = randomUUID(),
  ) {
    return this.repository.createCalendar(userId, {
      externalId,
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

  async listExistingEventUids(
    userId: string,
    calendarId: string,
    uids: string[],
  ) {
    try {
      return await this.repository.listExistingEventUids(
        userId,
        calendarId,
        uids,
      );
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

  async importEvents(
    userId: string,
    calendarId: string,
    inputs: EventInput[],
    sideEffect?: EventImportSideEffect,
  ) {
    try {
      return await this.repository.createEvents(
        userId,
        calendarId,
        inputs.map((input) => ({
          ...eventValues(input),
          uid: input.uid ?? `${randomUUID()}@lifeos.local`,
          etag: etag(),
        })),
        sideEffect,
      );
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
      /**
       * Verwaltete Aufgabenereignisse laufen über den gemeinsamen
       * Binding-Fachdienst: Aufgabe, Ereignis, Beziehung, Sync-Token und Audit
       * werden in einer Transaktion geändert oder vollständig zurückgerollt.
       */
      const managed = await this.bindings?.findManagedEvent(
        userId,
        calendarId,
        uid,
      );
      if (managed && this.bindings) {
        return await this.bindings.applyManagedEventChange(
          userId,
          this.managedChangeRequest(calendarId, uid, expectedEtag, input),
        );
      }
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
      /**
       * Ein gelöschtes verwaltetes Ereignis entfernt die zugehörige
       * Fachangabe der Aufgabe (Fälligkeit beziehungsweise Planung); die
       * Aufgabe selbst bleibt bestehen.
       */
      const managed = await this.bindings?.findManagedEvent(
        userId,
        calendarId,
        uid,
      );
      if (managed && this.bindings) {
        await this.bindings.removeManagedEvent(userId, {
          calendarExternalId: calendarId,
          uid,
          expectedEtag,
        });
        return;
      }
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
