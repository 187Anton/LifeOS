import type { Prisma } from "@lifeos/database";
import type {
  CalendarEventResponse,
  ReconcileTaskCalendarBindingsResponse,
  TaskCalendarBindingKind,
  TaskCalendarBindingResponse,
} from "@lifeos/contracts";

import { ApiError } from "../../errors.js";
import {
  ManagedBindingConflictError,
  ManagedBindingNotFoundError,
  ManagedEventEtagConflictError,
  MissingPrimaryCalendarError,
  UnsupportedManagedEventChangeError,
  type PrismaTaskCalendarBindingRepository,
} from "./repository.js";

/**
 * Schmale Schnittstelle, über die der Kalender-Service verwaltete Ereignisse
 * erkennt und ihre Änderungen an den gemeinsamen Fachtienst weiterreicht.
 * Beide Schreibpfade – die Web-API und der eigene CalDAV-Server – laufen über
 * dieselbe Implementierung.
 */
export interface ManagedTaskBindingPort {
  findManagedEvent(
    userId: string,
    calendarExternalId: string,
    uid: string,
  ): Promise<{ kind: TaskCalendarBindingKind; taskId: string } | null>;
  applyManagedEventChange(
    userId: string,
    request: ManagedEventChangeRequest,
  ): Promise<CalendarEventResponse>;
  removeManagedEvent(
    userId: string,
    request: { calendarExternalId: string; uid: string; expectedEtag: string },
  ): Promise<{ taskId: string; kind: TaskCalendarBindingKind }>;
}

/**
 * Schnittstelle für den Aufgaben-Service: die Abbildung wird innerhalb der
 * laufenden Aufgabentransaktion nachgeführt.
 */
export interface TaskBindingSynchronizer {
  synchronizeTask(
    transaction: Prisma.TransactionClient,
    userId: string,
    taskId: string,
  ): Promise<void>;
}

export interface ManagedEventChangeRequest {
  calendarExternalId: string;
  uid: string;
  expectedEtag: string;
  title: string;
  description: string | null;
  location: string | null;
  timezone: string;
  isAllDay: boolean;
  startsAt: string | null;
  endsAt: string | null;
  startDate: string | null;
  endDate: string | null;
  recurrenceRule: string | null;
  reminderMinutes: number[];
}

export class TaskCalendarBindingService
  implements ManagedTaskBindingPort, TaskBindingSynchronizer
{
  constructor(
    private readonly repository: PrismaTaskCalendarBindingRepository,
  ) {}

  listBindings(userId: string): Promise<TaskCalendarBindingResponse[]> {
    return this.repository.listBindings(userId);
  }

  async reconcile(
    userId: string,
  ): Promise<ReconcileTaskCalendarBindingsResponse> {
    try {
      return await this.repository.reconcile(userId);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async synchronizeTask(
    transaction: Prisma.TransactionClient,
    userId: string,
    taskId: string,
  ): Promise<void> {
    try {
      await this.repository.synchronizeTask(transaction, userId, taskId);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async findManagedEvent(
    userId: string,
    calendarExternalId: string,
    uid: string,
  ): Promise<{ kind: TaskCalendarBindingKind; taskId: string } | null> {
    const binding = await this.repository.findBindingForEvent(
      userId,
      calendarExternalId,
      uid,
    );
    return binding ? { kind: binding.kind, taskId: binding.task.id } : null;
  }

  async applyManagedEventChange(
    userId: string,
    request: ManagedEventChangeRequest,
  ): Promise<CalendarEventResponse> {
    try {
      return await this.repository.applyEventChange(userId, request);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async removeManagedEvent(
    userId: string,
    request: { calendarExternalId: string; uid: string; expectedEtag: string },
  ): Promise<{ taskId: string; kind: TaskCalendarBindingKind }> {
    try {
      return await this.repository.removeEvent(userId, request);
    } catch (error) {
      this.rethrow(error);
    }
  }

  private rethrow(error: unknown): never {
    if (error instanceof ApiError) throw error;
    if (error instanceof MissingPrimaryCalendarError) {
      throw new ApiError(
        409,
        "CONFLICT",
        "Für die verwaltete Aufgabenabbildung fehlt ein persönlicher Primärkalender. Lege einen Kalender an oder bestimme einen als primär; es wird bewusst kein anderer Kalender gewählt.",
      );
    }
    if (error instanceof ManagedEventEtagConflictError) {
      throw new ApiError(
        412,
        "PRECONDITION_FAILED",
        "Das verwaltete Kalenderereignis wurde zwischenzeitlich geändert. Es wurde nichts gespeichert; lade die Aufgabe neu.",
      );
    }
    if (error instanceof UnsupportedManagedEventChangeError) {
      throw new ApiError(
        409,
        "CONFLICT",
        `Nicht unterstützte Änderung an einem verwalteten Aufgabenereignis (${error.field}): ${error.message}`,
      );
    }
    if (error instanceof ManagedBindingConflictError) {
      throw new ApiError(
        409,
        "CONFLICT",
        "Die verwaltete Aufgabenabbildung verletzt die Eindeutigkeitsregel: je Aufgabe höchstens eine Frist und ein Arbeitsblock, je Ereignis höchstens eine Abbildung.",
      );
    }
    if (error instanceof ManagedBindingNotFoundError) {
      throw new ApiError(
        404,
        "NOT_FOUND",
        "Es besteht keine verwaltete Aufgaben-Kalender-Abbildung für dieses Ereignis.",
      );
    }
    throw error;
  }
}
