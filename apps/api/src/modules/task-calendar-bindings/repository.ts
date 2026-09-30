import { randomUUID } from "node:crypto";

import type { DatabaseClient, Prisma } from "@lifeos/database";
import type {
  CalendarEventResponse,
  TaskCalendarBindingKind,
  TaskCalendarBindingResponse,
  TaskCalendarBindingStatus,
  TaskStatus,
} from "@lifeos/contracts";

import { mapEvent } from "../calendar/repository.js";
import {
  desiredManagedEvent,
  managedEventDiffers,
  managedEventForm,
  managedKindLabel,
  parseManagedEventDescription,
  parseManagedEventUid,
  reviewManagedEventChange,
  taskStatusTransitions,
  type DesiredManagedEvent,
  type ManagedEventSource,
  type StoredManagedEvent,
} from "./mapping.js";

/**
 * Fehler der verwalteten Aufgabenabbildung. Sie werden entweder von der
 * HTTP-Schicht in einen verständlichen API-Fehler übersetzt oder als
 * Auslöser eines vollständigen Transaktionsrücklaufs verwendet.
 */
export class MissingPrimaryCalendarError extends Error {}
export class ManagedEventEtagConflictError extends Error {}
export class ManagedEventNotFoundError extends Error {}
export class ManagedBindingNotFoundError extends Error {}
export class UnsupportedManagedEventChangeError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = "UnsupportedManagedEventChangeError";
  }
}
/**
 * Der synchrone Abbildungsdienst wird in eine bereits laufende Transaktion
 * eines anderen Fachmoduls eingehängt. Eine Verletzung der Eindeutigkeitsregel
 * (je Aufgabe höchstens eine Frist und ein Arbeitsblock, je Ereignis höchstens
 * eine Abbildung) bricht diesen Lauf bewusst ab, statt still zu duplizieren.
 */
export class ManagedBindingConflictError extends Error {}

type Transaction = Prisma.TransactionClient;

const newEtag = (): string => `"${randomUUID()}"`;

const isoDate = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;

const iso = (value: Date | null): string | null =>
  value ? value.toISOString() : null;

const taskSource = (task: {
  id: string;
  title: string;
  status: TaskStatus;
  description: string | null;
  dueDate: Date | null;
  scheduledStartAt: Date | null;
  scheduledStartTimezone: string | null;
  estimatedDurationMinutes: number | null;
  archivedAt: Date | null;
  deletedAt: Date | null;
}): ManagedEventSource => ({
  id: task.id,
  title: task.title,
  status: task.status,
  description: task.description,
  dueDate: isoDate(task.dueDate),
  scheduledStartAt: iso(task.scheduledStartAt),
  scheduledStartTimezone: task.scheduledStartTimezone,
  estimatedDurationMinutes: task.estimatedDurationMinutes,
  archivedAt: iso(task.archivedAt),
  deletedAt: iso(task.deletedAt),
});

const storedEvent = (event: {
  uid: string;
  title: string;
  description: string | null;
  timezone: string;
  isAllDay: boolean;
  isStartMarker: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  startDate: Date | null;
  endDate: Date | null;
  recurrenceRule: string | null;
}): StoredManagedEvent => ({
  uid: event.uid,
  title: event.title,
  description: event.description,
  timezone: event.timezone,
  isAllDay: event.isAllDay,
  isStartMarker: event.isStartMarker,
  startsAt: iso(event.startsAt),
  endsAt: iso(event.endsAt),
  startDate: isoDate(event.startDate),
  endDate: isoDate(event.endDate),
  recurrenceRule: event.recurrenceRule,
});

const desiredValues = (desired: DesiredManagedEvent) => ({
  title: desired.title,
  description: desired.description,
  timezone: desired.timezone,
  isAllDay: desired.isAllDay,
  isStartMarker: desired.startMarker,
  startsAt: desired.startsAt === null ? null : new Date(desired.startsAt),
  endsAt: desired.endsAt === null ? null : new Date(desired.endsAt),
  startDate:
    desired.startDate === null
      ? null
      : new Date(`${desired.startDate}T00:00:00.000Z`),
  endDate:
    desired.endDate === null
      ? null
      : new Date(`${desired.endDate}T00:00:00.000Z`),
  recurrenceRule: null,
});

export type ManagedEventValues = ReturnType<typeof desiredValues>;

const managedValuesOf = (event: {
  title: string;
  description: string | null;
  timezone: string;
  isAllDay: boolean;
  isStartMarker: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  startDate: Date | null;
  endDate: Date | null;
  recurrenceRule: string | null;
}): ManagedEventValues => ({
  title: event.title,
  description: event.description ?? "",
  timezone: event.timezone,
  isAllDay: event.isAllDay,
  isStartMarker: event.isStartMarker,
  startsAt: event.startsAt,
  endsAt: event.endsAt,
  startDate: event.startDate,
  endDate: event.endDate,
  /**
   * Verwaltete Ereignisse tragen nie eine Wiederholungsregel; eine
   * zurückgebliebene Regel wird beim nächsten Schreiben bewusst entfernt.
   */
  recurrenceRule: null,
});

/**
 * Legt den aktiven Datensatz eines verwalteten Ereignisses im Zielkalender an,
 * belebt ihn wieder oder übernimmt ihn. Es entsteht dabei nie ein zweiter
 * aktiver Datensatz derselben UID im selben Kalender: ein vorhandener Datensatz
 * wird verwendet, ein gelöschter wird innerhalb derselben Transaktion
 * wiederbelebt. Der Sync-Token des Zielkalenders wird fortgeschrieben.
 */
const activateEventInCalendar = async (
  transaction: Transaction,
  input: {
    userId: string;
    calendarId: string;
    uid: string;
    values: ManagedEventValues;
    /** Erinnerungen des überführten Ereignisses; `undefined` = unberührt. */
    reminders?: number[];
  },
): Promise<{
  eventId: string;
  etag: string;
  sequence: number;
  syncVersion: number;
}> => {
  const target = await transaction.calendarEvent.findFirst({
    where: {
      userId: input.userId,
      calendarId: input.calendarId,
      uid: input.uid,
    },
    select: { id: true, etag: true, deletedAt: true },
  });
  const calendar = await transaction.calendar.update({
    where: { id: input.calendarId },
    data: { syncToken: { increment: 1 } },
    select: { syncToken: true },
  });
  const etag = newEtag();
  if (!target) {
    const created = await transaction.calendarEvent.create({
      data: {
        ...input.values,
        userId: input.userId,
        calendarId: input.calendarId,
        uid: input.uid,
        etag,
        sequence: 0,
        syncVersion: calendar.syncToken,
        reminderMinutes: input.reminders ?? [],
      },
      select: { id: true },
    });
    return {
      eventId: created.id,
      etag,
      sequence: 0,
      syncVersion: calendar.syncToken,
    };
  }
  const written = await transaction.calendarEvent.updateMany({
    where: {
      id: target.id,
      etag: target.etag,
      ...(target.deletedAt === null ? { deletedAt: null } : {}),
    },
    data: {
      ...input.values,
      etag,
      deletedAt: null,
      sequence: { increment: 1 },
      syncVersion: calendar.syncToken,
      ...(input.reminders === undefined
        ? {}
        : { reminderMinutes: input.reminders }),
    },
  });
  if (written.count !== 1) throw new ManagedEventEtagConflictError();
  const event = await transaction.calendarEvent.findUniqueOrThrow({
    where: { id: target.id },
    select: { sequence: true, syncVersion: true },
  });
  return { eventId: target.id, etag, ...event };
};

/**
 * Überführt ein verwaltetes Ereignis atomar in einen anderen Kalender.
 *
 * Die stabile UID bleibt erhalten. Der bisherige Datensatz bleibt im alten
 * Kalender als nachvollziehbare Löschmarkierung stehen – mit neuem ETag,
 * fortgeschrittenem `sequence` und dem fortgeschriebenen Sync-Token des alten
 * Kalenders –, damit CalDAV-Clients die alte Ressource entfernen. Im
 * Zielkalender entsteht genau ein aktiver Datensatz derselben UID. Die
 * Erinnerungen des überführten Ereignisses bleiben erhalten. Schlägt irgendein
 * Schritt fehl, wird die gesamte Transaktion zurückgerollt; es bleibt weder eine
 * halbe Verschiebung noch ein doppeltes aktives Ereignis zurück.
 */
const moveManagedEvent = async (
  transaction: Transaction,
  input: {
    userId: string;
    eventId: string;
    calendarId: string;
    expectedEtag: string;
    uid: string;
    values: ManagedEventValues;
    reminders: number[];
  },
): Promise<{
  eventId: string;
  etag: string;
  sequence: number;
  syncVersion: number;
}> => {
  const source = await transaction.calendarEvent.findFirst({
    where: { id: input.eventId, userId: input.userId },
    select: { id: true, calendarId: true, etag: true, deletedAt: true },
  });
  if (!source || source.etag !== input.expectedEtag)
    throw new ManagedEventEtagConflictError();
  if (source.deletedAt === null) {
    const sourceCalendar = await transaction.calendar.update({
      where: { id: source.calendarId },
      data: { syncToken: { increment: 1 } },
      select: { syncToken: true },
    });
    const removed = await transaction.calendarEvent.updateMany({
      where: {
        id: source.id,
        etag: input.expectedEtag,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
        etag: newEtag(),
        sequence: { increment: 1 },
        syncVersion: sourceCalendar.syncToken,
      },
    });
    if (removed.count !== 1) throw new ManagedEventEtagConflictError();
  }
  return activateEventInCalendar(transaction, {
    userId: input.userId,
    calendarId: input.calendarId,
    uid: input.uid,
    values: input.values,
    reminders: input.reminders,
  });
};

/**
 * Schreibt ein verwaltetes Ereignis innerhalb der laufenden Transaktion und
 * hebt dabei den Sync-Token seines Kalenders sowie `syncVersion` und
 * `sequence` des Ereignisses an. Erwartet wird die zuletzt bestätigte Version:
 * passt sie nicht, wird nichts geschrieben und die gesamte Transaktion
 * zurückgerollt. Gehört das Ereignis noch einem anderen Kalender, wird es
 * zuvor atomar in den Zielkalender überführt.
 */
const writeManagedEvent = async (
  transaction: Transaction,
  input: {
    userId: string;
    eventId: string;
    calendarId: string;
    expectedEtag: string;
    data: Partial<ManagedEventValues>;
    /** Erinnerungen des Ereignisses; `undefined` = unberührt. */
    reminders?: number[];
  },
): Promise<{
  eventId: string;
  etag: string;
  sequence: number;
  syncVersion: number;
}> => {
  const current = await transaction.calendarEvent.findFirst({
    where: { id: input.eventId, userId: input.userId },
    select: {
      id: true,
      uid: true,
      calendarId: true,
      etag: true,
      deletedAt: true,
      reminderMinutes: true,
      title: true,
      description: true,
      timezone: true,
      isAllDay: true,
      isStartMarker: true,
      startsAt: true,
      endsAt: true,
      startDate: true,
      endDate: true,
      recurrenceRule: true,
    },
  });
  if (!current) throw new ManagedEventNotFoundError();
  if (current.etag !== input.expectedEtag)
    throw new ManagedEventEtagConflictError();
  if (current.calendarId !== input.calendarId) {
    return moveManagedEvent(transaction, {
      userId: input.userId,
      eventId: current.id,
      calendarId: input.calendarId,
      expectedEtag: input.expectedEtag,
      uid: current.uid,
      values: { ...managedValuesOf(current), ...input.data },
      reminders: current.reminderMinutes,
    });
  }
  const calendar = await transaction.calendar.update({
    where: { id: input.calendarId },
    data: { syncToken: { increment: 1 } },
    select: { syncToken: true },
  });
  const etag = newEtag();
  const written = await transaction.calendarEvent.updateMany({
    where: {
      id: input.eventId,
      etag: input.expectedEtag,
      deletedAt: null,
    },
    data: {
      ...input.data,
      ...(input.reminders === undefined
        ? {}
        : { reminderMinutes: input.reminders }),
      etag,
      sequence: { increment: 1 },
      syncVersion: calendar.syncToken,
    },
  });
  if (written.count !== 1) throw new ManagedEventEtagConflictError();
  const event = await transaction.calendarEvent.findUniqueOrThrow({
    where: { id: input.eventId },
    select: { sequence: true, syncVersion: true },
  });
  return { eventId: input.eventId, etag, ...event };
};

/**
 * Belebt ein entferntes verwaltetes Ereignis innerhalb der laufenden
 * Transaktion wieder. Liegt es in einem anderen Kalender, wird es stattdessen
 * atomar in den Zielkalender überführt; der alte Datensatz bleibt gelöscht.
 */
const reviveManagedEvent = async (
  transaction: Transaction,
  input: {
    userId: string;
    eventId: string;
    calendarId: string;
    expectedEtag: string;
    data: ManagedEventValues;
  },
): Promise<{
  eventId: string;
  etag: string;
  sequence: number;
  syncVersion: number;
}> => {
  const current = await transaction.calendarEvent.findFirst({
    where: { id: input.eventId, userId: input.userId },
    select: {
      id: true,
      uid: true,
      calendarId: true,
      etag: true,
      reminderMinutes: true,
    },
  });
  if (!current || current.etag !== input.expectedEtag)
    throw new ManagedEventEtagConflictError();
  if (current.calendarId !== input.calendarId) {
    return activateEventInCalendar(transaction, {
      userId: input.userId,
      calendarId: input.calendarId,
      uid: current.uid,
      values: input.data,
      reminders: current.reminderMinutes,
    });
  }
  const calendar = await transaction.calendar.update({
    where: { id: input.calendarId },
    data: { syncToken: { increment: 1 } },
    select: { syncToken: true },
  });
  const etag = newEtag();
  const revived = await transaction.calendarEvent.updateMany({
    where: { id: input.eventId, etag: input.expectedEtag },
    data: {
      ...input.data,
      etag,
      deletedAt: null,
      sequence: { increment: 1 },
      syncVersion: calendar.syncToken,
    },
  });
  if (revived.count !== 1) throw new ManagedEventEtagConflictError();
  const event = await transaction.calendarEvent.findUniqueOrThrow({
    where: { id: input.eventId },
    select: { sequence: true, syncVersion: true },
  });
  return { eventId: input.eventId, etag, ...event };
};

export interface ManagedBindingEventRecord {
  id: string;
  uid: string;
  calendarId: string;
  etag: string;
  title: string;
  deletedAt: Date | null;
}

export interface ManagedBindingRecord {
  id: string;
  userId: string;
  taskId: string;
  kind: TaskCalendarBindingKind;
  lastKnownEtag: string;
  createdAt: Date;
  updatedAt: Date;
  calendarEvent: {
    id: string;
    uid: string;
    calendarId: string;
    etag: string;
    title: string;
    description: string | null;
    timezone: string;
    isAllDay: boolean;
    isStartMarker: boolean;
    startsAt: Date | null;
    endsAt: Date | null;
    startDate: Date | null;
    endDate: Date | null;
    recurrenceRule: string | null;
    reminderMinutes: number[];
    deletedAt: Date | null;
    calendar: { id: string; externalId: string; deletedAt: Date | null };
  };
  task: {
    id: string;
    title: string;
    status: TaskStatus;
    description: string | null;
    dueDate: Date | null;
    scheduledStartAt: Date | null;
    scheduledStartTimezone: string | null;
    estimatedDurationMinutes: number | null;
    archivedAt: Date | null;
    deletedAt: Date | null;
  };
}

const bindingInclude = {
  calendarEvent: {
    select: {
      id: true,
      uid: true,
      calendarId: true,
      etag: true,
      title: true,
      description: true,
      timezone: true,
      isAllDay: true,
      isStartMarker: true,
      startsAt: true,
      endsAt: true,
      startDate: true,
      endDate: true,
      recurrenceRule: true,
      reminderMinutes: true,
      deletedAt: true,
      calendar: {
        select: { id: true, externalId: true, deletedAt: true },
      },
    },
  },
  task: {
    select: {
      id: true,
      title: true,
      status: true,
      description: true,
      dueDate: true,
      scheduledStartAt: true,
      scheduledStartTimezone: true,
      estimatedDurationMinutes: true,
      archivedAt: true,
      deletedAt: true,
    },
  },
} as const;

const bindingStatus = (
  binding: ManagedBindingRecord,
): TaskCalendarBindingStatus =>
  binding.calendarEvent.calendar.deletedAt !== null
    ? "calendar_missing"
    : binding.calendarEvent.deletedAt !== null
      ? "event_missing"
      : "active";

export const mapBinding = (
  binding: ManagedBindingRecord,
): TaskCalendarBindingResponse => {
  const status = bindingStatus(binding);
  const archived = binding.task.archivedAt !== null;
  const form =
    binding.calendarEvent.deletedAt === null
      ? managedEventForm(storedEvent(binding.calendarEvent))
      : null;
  return {
    id: binding.id,
    task: {
      id: binding.task.id,
      title: binding.task.deletedAt === null ? binding.task.title : null,
      available: binding.task.deletedAt === null && !archived,
    },
    kind: binding.kind,
    label: archived
      ? `${managedKindLabel(binding.kind, form ?? "timed")} (Aufgabe archiviert)`
      : managedKindLabel(binding.kind, form ?? "timed"),
    event: {
      calendarId:
        binding.calendarEvent.calendar.deletedAt === null
          ? binding.calendarEvent.calendar.externalId
          : null,
      uid:
        binding.calendarEvent.deletedAt === null
          ? binding.calendarEvent.uid
          : null,
      title:
        binding.calendarEvent.deletedAt === null
          ? binding.calendarEvent.title
          : null,
      etag:
        binding.calendarEvent.deletedAt === null
          ? binding.calendarEvent.etag
          : null,
      available: status === "active",
    },
    status,
    eventKind:
      binding.calendarEvent.deletedAt === null
        ? managedEventForm(storedEvent(binding.calendarEvent))
        : null,
    lastKnownEtag: binding.lastKnownEtag,
    createdAt: binding.createdAt.toISOString(),
    updatedAt: binding.updatedAt.toISOString(),
  };
};

export class PrismaTaskCalendarBindingRepository {
  constructor(private readonly database: DatabaseClient) {}

  /**
   * Synchronisiert die verwalteten Abbildungen einer Aufgabe. Läuft
   * ausschließlich innerhalb der Transaktion des Aufrufers, damit Aufgabe,
   * Ereignis, Beziehung, Sync-Token und Audit gemeinsam committen oder
   * gemeinsam verworfen werden.
   */
  async synchronizeTask(
    transaction: Transaction,
    userId: string,
    taskId: string,
  ): Promise<void> {
    const task = await transaction.task.findFirst({
      where: { id: taskId, userId },
      select: {
        id: true,
        title: true,
        status: true,
        description: true,
        dueDate: true,
        scheduledStartAt: true,
        scheduledStartTimezone: true,
        estimatedDurationMinutes: true,
        archivedAt: true,
        deletedAt: true,
      },
    });
    if (!task) return;
    const settings = await transaction.userSettings.findUnique({
      where: { userId },
      select: { timezone: true },
    });
    const profileTimezone = settings?.timezone ?? "Europe/Berlin";
    const existing = await transaction.taskCalendarBinding.findMany({
      where: { userId, taskId },
      include: {
        calendarEvent: {
          select: {
            id: true,
            uid: true,
            calendarId: true,
            etag: true,
            title: true,
            description: true,
            timezone: true,
            isAllDay: true,
            isStartMarker: true,
            startsAt: true,
            endsAt: true,
            startDate: true,
            endDate: true,
            recurrenceRule: true,
            reminderMinutes: true,
            deletedAt: true,
          },
        },
      },
    });
    const source = taskSource(task);
    for (const kind of ["due", "work_block"] as const) {
      const desired = desiredManagedEvent(source, kind, profileTimezone);
      const binding = existing.find((entry) => entry.kind === kind);
      if (!desired) {
        if (binding) await this.removeBinding(transaction, userId, binding);
        continue;
      }
      if (binding) {
        /**
         * Eine verwaltete Abbildung gehört immer in den persönlichen
         * Primärkalender. Fehlt er, wird nichts nachgeführt (klare Ablehnung
         * statt stillschweigender Wahl eines anderen Kalenders). Liegt das
         * Ereignis ausnahmsweise in einem anderen Kalender – etwa weil sein
         * Kalender gelöscht oder ein anderer als primär bestimmt wurde –, wird
         * es in den aktuellen Primärkalender überführt.
         */
        const primary = await this.primaryCalendar(transaction, userId);
        await this.alignBinding(
          transaction,
          userId,
          binding,
          kind,
          desired,
          primary.id,
        );
        continue;
      }
      await this.createBinding(transaction, userId, taskId, kind, desired);
    }
  }

  private async primaryCalendar(
    transaction: Transaction,
    userId: string,
  ): Promise<{ id: string }> {
    const calendar = await transaction.calendar.findFirst({
      where: { userId, isPrimary: true, deletedAt: null },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    /**
     * Es wird bewusst kein anderer Kalender gewählt: eine verwaltete Abbildung
     * ohne persönlichen Primärkalender wird klar abgelehnt.
     */
    if (!calendar) throw new MissingPrimaryCalendarError();
    return calendar;
  }

  private async createBinding(
    transaction: Transaction,
    userId: string,
    taskId: string,
    kind: TaskCalendarBindingKind,
    desired: DesiredManagedEvent,
  ): Promise<void> {
    const calendar = await this.primaryCalendar(transaction, userId);
    const values = desiredValues(desired);
    /**
     * Die deterministische UID hält die Ressource stabil: existiert sie bereits
     * (etwa nach einem verlorenen Beziehungsdatensatz), wird sie wiederbelebt
     * oder übernommen statt ein zweites Ereignis anzulegen.
     */
    const existing = await transaction.calendarEvent.findFirst({
      where: { userId, calendarId: calendar.id, uid: desired.uid },
      select: { id: true, etag: true, deletedAt: true },
    });
    let eventId: string;
    let etag: string;
    if (!existing) {
      const calendarChange = await transaction.calendar.update({
        where: { id: calendar.id },
        data: { syncToken: { increment: 1 } },
        select: { syncToken: true },
      });
      etag = newEtag();
      const created = await transaction.calendarEvent.create({
        data: {
          ...values,
          userId,
          calendarId: calendar.id,
          uid: desired.uid,
          etag,
          sequence: 0,
          syncVersion: calendarChange.syncToken,
          reminderMinutes: [],
        },
        select: { id: true },
      });
      eventId = created.id;
    } else if (existing.deletedAt === null) {
      const written = await writeManagedEvent(transaction, {
        userId,
        eventId: existing.id,
        calendarId: calendar.id,
        expectedEtag: existing.etag,
        data: values,
      });
      eventId = written.eventId;
      etag = written.etag;
    } else {
      const revived = await reviveManagedEvent(transaction, {
        userId,
        eventId: existing.id,
        calendarId: calendar.id,
        expectedEtag: existing.etag,
        data: values,
      });
      eventId = revived.eventId;
      etag = revived.etag;
    }
    try {
      await transaction.taskCalendarBinding.create({
        data: {
          userId,
          taskId,
          calendarEventId: eventId,
          kind,
          lastKnownEtag: etag,
        },
      });
    } catch (error) {
      throw new ManagedBindingConflictError("create", { cause: error });
    }
    await transaction.auditEvent.create({
      data: {
        userId,
        action: "task.calendar_binding.created",
        entityType: "TaskCalendarBinding",
        entityId: eventId,
        metadata: {
          taskId,
          kind,
          calendarEventUid: desired.uid,
          calendarId: calendar.id,
          etag,
        },
      },
    });
  }

  /**
   * Eine verwaltete Abbildung wird innerhalb derselben Transaktion vollständig
   * ausgerichtet: ein fehlendes Ereignis wird wiederhergestellt, ein abweichendes
   * nachgeführt und ein Ereignis in einem anderen Kalender atomar in den
   * aktuellen Primärkalender überführt. Nach jeder Änderung verweist die
   * Beziehung auf den tatsächlich aktiven Datensatz.
   */
  private async alignBinding(
    transaction: Transaction,
    userId: string,
    binding: {
      id: string;
      kind: TaskCalendarBindingKind;
      lastKnownEtag: string;
      calendarEvent: {
        id: string;
        uid: string;
        calendarId: string;
        title: string;
        description: string | null;
        timezone: string;
        isAllDay: boolean;
        isStartMarker: boolean;
        startsAt: Date | null;
        endsAt: Date | null;
        startDate: Date | null;
        endDate: Date | null;
        recurrenceRule: string | null;
        deletedAt: Date | null;
      };
    },
    kind: TaskCalendarBindingKind,
    desired: DesiredManagedEvent,
    calendarId: string,
  ): Promise<void> {
    const values = desiredValues(desired);
    /** Ein Ereignis in einem anderen Kalender wird immer überführt. */
    const calendarChanged = binding.calendarEvent.calendarId !== calendarId;
    if (binding.calendarEvent.deletedAt !== null) {
      const revived = await reviveManagedEvent(transaction, {
        userId,
        eventId: binding.calendarEvent.id,
        calendarId,
        expectedEtag: binding.lastKnownEtag,
        data: values,
      });
      await transaction.taskCalendarBinding.update({
        where: { id: binding.id },
        data: {
          lastKnownEtag: revived.etag,
          calendarEventId: revived.eventId,
        },
      });
      await transaction.auditEvent.create({
        data: {
          userId,
          action: "task.calendar_binding.restored",
          entityType: "TaskCalendarBinding",
          entityId: binding.id,
          metadata: {
            taskId: desired.uid,
            kind,
            calendarId,
            etag: revived.etag,
          },
        },
      });
      return;
    }
    if (
      !calendarChanged &&
      !managedEventDiffers(desired, storedEvent(binding.calendarEvent))
    )
      return;
    const written = await writeManagedEvent(transaction, {
      userId,
      eventId: binding.calendarEvent.id,
      calendarId,
      expectedEtag: binding.lastKnownEtag,
      data: values,
    });
    await transaction.taskCalendarBinding.update({
      where: { id: binding.id },
      data: {
        lastKnownEtag: written.etag,
        calendarEventId: written.eventId,
      },
    });
    await transaction.auditEvent.create({
      data: {
        userId,
        action: calendarChanged
          ? "task.calendar_binding.moved"
          : "task.calendar_binding.updated",
        entityType: "TaskCalendarBinding",
        entityId: binding.id,
        metadata: {
          kind,
          calendarEventUid: binding.calendarEvent.uid,
          calendarId,
          previousCalendarId: calendarChanged
            ? binding.calendarEvent.calendarId
            : undefined,
          etag: written.etag,
          previousEtag: binding.lastKnownEtag,
        },
      },
    });
  }

  private async removeBinding(
    transaction: Transaction,
    userId: string,
    binding: {
      id: string;
      kind: TaskCalendarBindingKind;
      calendarEvent: {
        id: string;
        uid: string;
        etag: string;
        deletedAt: Date | null;
      };
      taskId: string;
    },
  ): Promise<void> {
    if (binding.calendarEvent.deletedAt === null) {
      const calendarId = await this.eventCalendarId(
        transaction,
        binding.calendarEvent.id,
      );
      if (calendarId) {
        /**
         * Beim Entfernen ist die Aufgabe führend: auch eine zwischenzeitlich
         * abweichende Ereignisversion darf das Entfernen nicht blockieren. Der
         * vorherige ETag wird im Audit festgehalten, damit nichts still
         * verschwindet.
         */
        const calendar = await transaction.calendar.update({
          where: { id: calendarId },
          data: { syncToken: { increment: 1 } },
          select: { syncToken: true },
        });
        await transaction.calendarEvent.updateMany({
          where: { id: binding.calendarEvent.id, deletedAt: null },
          data: {
            deletedAt: new Date(),
            etag: newEtag(),
            sequence: { increment: 1 },
            syncVersion: calendar.syncToken,
          },
        });
      }
    }
    await transaction.taskCalendarBinding.delete({ where: { id: binding.id } });
    await transaction.auditEvent.create({
      data: {
        userId,
        action: "task.calendar_binding.removed",
        entityType: "TaskCalendarBinding",
        entityId: binding.id,
        metadata: {
          taskId: binding.taskId,
          kind: binding.kind,
          calendarEventUid: binding.calendarEvent.uid,
          previousEtag: binding.calendarEvent.etag,
        },
      },
    });
  }

  private async eventCalendarId(
    transaction: Transaction,
    eventId: string,
  ): Promise<string | null> {
    const event = await transaction.calendarEvent.findUnique({
      where: { id: eventId },
      select: { calendarId: true },
    });
    return event ? event.calendarId : null;
  }

  async listBindings(userId: string): Promise<TaskCalendarBindingResponse[]> {
    const bindings = await this.database.taskCalendarBinding.findMany({
      where: { userId },
      include: bindingInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return bindings.map((binding) =>
      mapBinding(binding as unknown as ManagedBindingRecord),
    );
  }

  /**
   * Änderung an einem verwalteten Ereignis über einen der beiden Schreibpfade
   * (CalDAV oder Web-API). Es wird ausschließlich die freigegebene Teilmenge
   * übernommen; die Prüfung läuft vollständig vor der ersten Schreiboperation.
   */
  async applyEventChange(
    userId: string,
    input: {
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
    },
  ): Promise<CalendarEventResponse> {
    return this.database.$transaction(async (transaction) => {
      const binding = await this.loadBindingForEvent(
        transaction,
        userId,
        input.calendarExternalId,
        input.uid,
      );
      if (!binding) throw new ManagedBindingNotFoundError();
      if (binding.calendarEvent.etag !== input.expectedEtag)
        throw new ManagedEventEtagConflictError();
      const review = reviewManagedEventChange({
        kind: binding.kind,
        current: storedEvent(binding.calendarEvent),
        currentStatus: binding.task.status,
        incoming: {
          uid: input.uid,
          title: input.title,
          isAllDay: input.isAllDay,
          timezone: input.timezone,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          startDate: input.startDate,
          endDate: input.endDate,
          description: input.description,
          location: input.location,
          recurrenceRule: input.recurrenceRule,
          reminderMinutes: input.reminderMinutes,
        },
      });
      if (!review.accepted)
        throw new UnsupportedManagedEventChangeError(
          review.field,
          review.message,
        );

      /**
       * Zuerst werden die führenden Aufgabenfelder übernommen, danach wird die
       * ganze Aufgabe innerhalb derselben Transaktion synchronisiert. Dadurch
       * erhält jede verwaltete Abbildung denselben Stand: eine Änderung an Titel
       * oder Status über das CalDAV-Ereignis aktualisiert immer auch das zweite
       * verwaltete Ereignis derselben Aufgabe. Es entstehen keine Duplikate, die
       * UID beider Abbildungen bleibt stabil, und ein Fehler bei einer Abbildung
       * rollt die komplette Änderung zurück.
       */
      const taskChanges: {
        title?: string;
        status?: TaskStatus;
        completedAt?: Date | null;
        dueDate?: Date;
        scheduledStartAt?: Date;
        scheduledStartTimezone?: string;
        estimatedDurationMinutes?: number | null;
      } = {};
      if (review.taskTitle !== binding.task.title)
        taskChanges.title = review.taskTitle;
      if (review.status !== null && review.status !== binding.task.status) {
        if (
          !taskStatusTransitions[binding.task.status].includes(review.status)
        ) {
          throw new UnsupportedManagedEventChangeError(
            "SUMMARY",
            `Der Aufgabenstatus kann nicht von „${binding.task.status}“ zu „${review.status}“ wechseln.`,
          );
        }
        taskChanges.status = review.status;
        taskChanges.completedAt = review.status === "done" ? new Date() : null;
      }
      /**
       * Nur die Felder der eigenen Abbildungsart werden gesetzt: eine
       * verschobene Frist ändert `Task.dueDate`, ein verschobener oder
       * verlängerter Arbeitsblock ändert Start, Zeitzone und Dauer. Die jeweils
       * andere Fachangabe bleibt unverändert.
       */
      if (review.taskChanges.dueDate)
        taskChanges.dueDate = new Date(
          `${review.taskChanges.dueDate}T00:00:00.000Z`,
        );
      if (review.taskChanges.scheduledStartAt)
        taskChanges.scheduledStartAt = new Date(
          review.taskChanges.scheduledStartAt,
        );
      if (review.taskChanges.scheduledStartTimezone)
        taskChanges.scheduledStartTimezone =
          review.taskChanges.scheduledStartTimezone;
      if (review.taskChanges.estimatedDurationMinutes !== undefined)
        taskChanges.estimatedDurationMinutes =
          review.taskChanges.estimatedDurationMinutes;
      if (Object.keys(taskChanges).length > 0) {
        await transaction.task.update({
          where: { id: binding.task.id },
          data: taskChanges,
        });
        await transaction.auditEvent.create({
          data: {
            userId,
            action: "task.updated",
            entityType: "Task",
            entityId: binding.task.id,
            metadata: {
              source: "caldav",
              changedFields: Object.keys(taskChanges).sort(),
            },
          },
        });
      }

      /**
       * Erinnerungen gehören allein zum Ereignis. Sie werden genau hier
       * übernommen und bleiben bei der anschließenden Synchronisation der
       * Aufgabe erhalten.
       */
      const reminders = [...new Set(review.reminderMinutes)].sort(
        (left, right) => left - right,
      );
      const previousReminders = [...binding.calendarEvent.reminderMinutes].sort(
        (left, right) => left - right,
      );
      if (reminders.join("\u0000") !== previousReminders.join("\u0000")) {
        const written = await writeManagedEvent(transaction, {
          userId,
          eventId: binding.calendarEvent.id,
          calendarId: binding.calendarEvent.calendar.id,
          expectedEtag: binding.lastKnownEtag,
          data: {},
          reminders,
        });
        await transaction.taskCalendarBinding.update({
          where: { id: binding.id },
          data: { lastKnownEtag: written.etag },
        });
      }

      await this.synchronizeTask(transaction, userId, binding.task.id);
      /**
       * Nach der vollständigen Ausrichtung wird der tatsächlich aktive
       * Datensatz gelesen: er kann durch einen Kalenderwechsel ein anderer sein
       * als der ursprünglich geladene, während die UID stabil bleibt.
       */
      const current = await transaction.taskCalendarBinding.findFirst({
        where: { userId, taskId: binding.task.id, kind: binding.kind },
        select: { calendarEventId: true, lastKnownEtag: true },
      });
      const eventId = current?.calendarEventId ?? binding.calendarEvent.id;
      await transaction.auditEvent.create({
        data: {
          userId,
          action: "calendar.event.updated",
          entityType: "CalendarEvent",
          entityId: binding.calendarEvent.uid,
          metadata: {
            managed: true,
            taskId: binding.task.id,
            kind: binding.kind,
            calendarId: binding.calendarEvent.calendar.id,
          },
        },
      });
      await transaction.auditEvent.create({
        data: {
          userId,
          action: "task.calendar_binding.updated",
          entityType: "TaskCalendarBinding",
          entityId: binding.id,
          metadata: {
            source: "caldav",
            kind: binding.kind,
            etag: current?.lastKnownEtag ?? binding.lastKnownEtag,
            previousEtag: binding.lastKnownEtag,
          },
        },
      });
      const event = await transaction.calendarEvent.findUniqueOrThrow({
        where: { id: eventId },
      });
      return mapEvent(event);
    });
  }

  /**
   * Löscht ein verwaltetes Ereignis über einen der beiden Schreibpfade: die
   * zugehörige Fachangabe der Aufgabe wird entfernt, die Aufgabe selbst bleibt
   * bestehen.
   */
  async removeEvent(
    userId: string,
    input: {
      calendarExternalId: string;
      uid: string;
      expectedEtag: string;
    },
  ): Promise<{ taskId: string; kind: TaskCalendarBindingKind }> {
    return this.database.$transaction(async (transaction) => {
      const binding = await this.loadBindingForEvent(
        transaction,
        userId,
        input.calendarExternalId,
        input.uid,
      );
      if (!binding) throw new ManagedBindingNotFoundError();
      if (binding.calendarEvent.etag !== input.expectedEtag)
        throw new ManagedEventEtagConflictError();
      const calendar = await transaction.calendar.update({
        where: { id: binding.calendarEvent.calendar.id },
        data: { syncToken: { increment: 1 } },
        select: { syncToken: true },
      });
      /**
       * Das Entfernen ist atomar: der zuvor geprüfte ETag wird in derselben
       * Schreiboperation nochmals verlangt. Eine zwischenzeitliche Änderung
       * führt deshalb zu einem ETag-Konflikt und rollt die gesamte Transaktion
       * zurück; es bleiben keine Änderungen an Aufgabe, Beziehung, Sync-Token
       * oder Audit bestehen.
       */
      const removed = await transaction.calendarEvent.updateMany({
        where: {
          id: binding.calendarEvent.id,
          etag: input.expectedEtag,
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
          etag: newEtag(),
          sequence: { increment: 1 },
          syncVersion: calendar.syncToken,
        },
      });
      if (removed.count !== 1) throw new ManagedEventEtagConflictError();
      const taskChanges =
        binding.kind === "due"
          ? { dueDate: null }
          : /**
             * Beim Löschen einer Startmarkierung wird ausschließlich der
             * geplante Start entfernt; eine Aufwandsschätzung gehört nicht zu
             * dieser Abbildung und bleibt deshalb unberührt.
             */
            binding.calendarEvent.isStartMarker
            ? { scheduledStartAt: null, scheduledStartTimezone: null }
            : {
                scheduledStartAt: null,
                scheduledStartTimezone: null,
                estimatedDurationMinutes: null,
              };
      await transaction.task.update({
        where: { id: binding.task.id },
        data: taskChanges,
      });
      await transaction.taskCalendarBinding.delete({
        where: { id: binding.id },
      });
      await transaction.auditEvent.create({
        data: {
          userId,
          action: "calendar.event.deleted",
          entityType: "CalendarEvent",
          entityId: binding.calendarEvent.uid,
          metadata: { managed: true, taskId: binding.task.id },
        },
      });
      await transaction.auditEvent.create({
        data: {
          userId,
          action: "task.updated",
          entityType: "Task",
          entityId: binding.task.id,
          metadata: {
            source: "caldav",
            changedFields: Object.keys(taskChanges).sort(),
          },
        },
      });
      await transaction.auditEvent.create({
        data: {
          userId,
          action: "task.calendar_binding.removed",
          entityType: "TaskCalendarBinding",
          entityId: binding.id,
          metadata: {
            taskId: binding.task.id,
            kind: binding.kind,
            calendarEventUid: binding.calendarEvent.uid,
            previousEtag: binding.calendarEvent.etag,
          },
        },
      });
      return { taskId: binding.task.id, kind: binding.kind };
    });
  }

  private async loadBindingForEvent(
    transaction: Transaction,
    userId: string,
    calendarExternalId: string,
    uid: string,
  ): Promise<ManagedBindingRecord | null> {
    const binding = await transaction.taskCalendarBinding.findFirst({
      where: {
        userId,
        calendarEvent: { uid, calendar: { externalId: calendarExternalId } },
      },
      include: bindingInclude,
    });
    return binding ? (binding as unknown as ManagedBindingRecord) : null;
  }

  async findBindingForEvent(
    userId: string,
    calendarExternalId: string,
    uid: string,
  ): Promise<ManagedBindingRecord | null> {
    return this.loadBindingForEvent(
      this.database as unknown as Transaction,
      userId,
      calendarExternalId,
      uid,
    );
  }

  /**
   * Idempotente Bestands- und Wiederverbindungsprüfung. Es werden
   * ausschließlich eindeutig erkennbare verwaltete Ereignisse erneut verbunden;
   * mehrdeutige Fälle werden nur gemeldet. Es entsteht nie ein zweites Ereignis
   * und es wird nie eine freie Verknüpfung umgedeutet.
   */
  async reconcile(userId: string): Promise<{
    checkedEvents: number;
    reconnected: number;
    repaired: number;
    alreadyLinked: number;
    skippedUnrelated: number;
    ambiguous: Array<{
      eventUid: string | null;
      calendarId: string | null;
      taskId: string | null;
      kind: TaskCalendarBindingKind | null;
      reason: string;
    }>;
  }> {
    return this.database.$transaction(async (transaction) => {
      /**
       * Der persönliche Primärkalender wird einmal ermittelt. Ohne ihn wird die
       * Bestands- und Wiederverbindungsprüfung vollständig abgelehnt: es wird
       * nichts verbunden, nichts verschoben, nichts gelöscht und nichts
       * umgedeutet. Es wird bewusst weder ein sekundärer noch ein beliebiger
       * anderer Kalender als Ersatz gewählt.
       *
       * Bei vorhandenem Primärkalender entscheidet er außerdem mit, welcher
       * Bestand bei mehreren Ereignissen derselben UID erneut verbunden wird:
       * Ereignisse des Primärkalenders liegen zuerst, damit die Ausrichtung
       * ohne Umzug geschieht und der Befund reproduzierbar bleibt.
       */
      const primary = await transaction.calendar.findFirst({
        where: { userId, isPrimary: true, deletedAt: null },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });
      if (!primary) throw new MissingPrimaryCalendarError();
      const events = await transaction.calendarEvent.findMany({
        where: { userId, deletedAt: null },
        orderBy: [{ uid: "asc" }, { id: "asc" }],
        include: {
          calendar: { select: { externalId: true, deletedAt: true } },
          taskBindings: { select: { id: true, kind: true, taskId: true } },
        },
      });
      const orderedEvents = [...events].sort(
        (left, right) =>
          Number(left.calendarId !== primary.id) -
          Number(right.calendarId !== primary.id),
      );
      const ambiguous: Array<{
        eventUid: string | null;
        calendarId: string | null;
        taskId: string | null;
        kind: TaskCalendarBindingKind | null;
        reason: string;
      }> = [];
      let reconnected = 0;
      let alreadyLinked = 0;
      let skippedUnrelated = 0;
      const claimed = new Set<string>(
        (
          await transaction.taskCalendarBinding.findMany({
            where: { userId },
            select: { taskId: true, kind: true },
          })
        ).map((binding) => `${binding.taskId}\u0000${binding.kind}`),
      );
      for (const event of orderedEvents) {
        if (event.taskBindings.length > 0) {
          alreadyLinked += 1;
          continue;
        }
        const marker = parseManagedEventDescription(event.description);
        const uidMarker = parseManagedEventUid(event.uid);
        if (!marker || !uidMarker) {
          skippedUnrelated += 1;
          continue;
        }
        if (
          marker.taskId !== uidMarker.taskId ||
          marker.kind !== uidMarker.kind
        ) {
          ambiguous.push({
            eventUid: event.uid,
            calendarId:
              event.calendar.deletedAt === null
                ? event.calendar.externalId
                : null,
            taskId: marker.taskId,
            kind: marker.kind,
            reason:
              "Markierungsblock und stabile UID nennen unterschiedliche Zuordnungen.",
          });
          continue;
        }
        const task = await transaction.task.findFirst({
          where: {
            id: marker.taskId,
            userId,
            deletedAt: null,
            archivedAt: null,
          },
          select: {
            id: true,
            title: true,
            status: true,
            description: true,
            dueDate: true,
            scheduledStartAt: true,
            scheduledStartTimezone: true,
            estimatedDurationMinutes: true,
            archivedAt: true,
            deletedAt: true,
          },
        });
        if (!task) {
          ambiguous.push({
            eventUid: event.uid,
            calendarId:
              event.calendar.deletedAt === null
                ? event.calendar.externalId
                : null,
            taskId: marker.taskId,
            kind: marker.kind,
            reason:
              "Zur Abbildung gehört keine aktive, eigene Aufgabe; es wird nichts erzeugt.",
          });
          continue;
        }
        const settings = await transaction.userSettings.findUnique({
          where: { userId },
          select: { timezone: true },
        });
        const desired = desiredManagedEvent(
          taskSource(task),
          marker.kind,
          settings?.timezone ?? "Europe/Berlin",
        );
        if (!desired || desired.uid !== event.uid) {
          ambiguous.push({
            eventUid: event.uid,
            calendarId:
              event.calendar.deletedAt === null
                ? event.calendar.externalId
                : null,
            taskId: marker.taskId,
            kind: marker.kind,
            reason:
              "Die Aufgabe braucht diese Abbildung derzeit nicht; es wird nichts erzeugt.",
          });
          continue;
        }
        const claimKey = `${marker.taskId}\u0000${marker.kind}`;
        if (claimed.has(claimKey)) {
          ambiguous.push({
            eventUid: event.uid,
            calendarId:
              event.calendar.deletedAt === null
                ? event.calendar.externalId
                : null,
            taskId: marker.taskId,
            kind: marker.kind,
            reason:
              "Für dieselbe Aufgabe und Art besteht bereits eine verwaltete Abbildung; es entsteht kein Duplikat.",
          });
          continue;
        }
        if (event.calendar.deletedAt !== null) {
          ambiguous.push({
            eventUid: event.uid,
            calendarId: null,
            taskId: marker.taskId,
            kind: marker.kind,
            reason: "Der Kalender des Ereignisses ist gelöscht.",
          });
          continue;
        }
        /**
         * Verwaltete Ereignisse liegen im persönlichen Primärkalender. Ein
         * markiertes Ereignis ausschließlich in einem anderen Kalender wird
         * deshalb nicht automatisch verbunden: der Fall wird als mehrdeutig
         * gemeldet und bleibt vollständig unangetastet – kein Binding, keine
         * Verschiebung, keine Löschung, keine Wieder-Verbindungs-Auditspur und
         * keine erfundene Bindung an einen beliebigen Kalender.
         */
        if (event.calendarId !== primary.id) {
          ambiguous.push({
            eventUid: event.uid,
            calendarId: event.calendar.externalId,
            taskId: marker.taskId,
            kind: marker.kind,
            reason:
              "Das markierte Ereignis liegt nicht im persönlichen Primärkalender; es wird nicht automatisch verbunden.",
          });
          continue;
        }
        await transaction.taskCalendarBinding.create({
          data: {
            userId,
            taskId: task.id,
            calendarEventId: event.id,
            kind: marker.kind,
            lastKnownEtag: event.etag,
          },
        });
        claimed.add(claimKey);
        reconnected += 1;
        await transaction.auditEvent.create({
          data: {
            userId,
            action: "task.calendar_binding.reconnected",
            entityType: "TaskCalendarBinding",
            entityId: event.id,
            metadata: {
              taskId: task.id,
              kind: marker.kind,
              calendarEventUid: event.uid,
              etag: event.etag,
            },
          },
        });
      }
      /**
       * Bestehende Abbildungen, deren Ereignis oder Kalender fehlt, werden nur
       * dann nachgeführt, wenn sie über die Beziehung selbst eindeutig
       * derselben Aufgabe zugeordnet sind – nie über Vermutungen aus
       * Ereignisdaten. Fehlt der Primärkalender, kommt es hier gar nicht erst
       * dazu: die Prüfung wurde oben bereits vollständig abgelehnt.
       */
      const broken = await transaction.taskCalendarBinding.findMany({
        where: {
          userId,
          OR: [
            { calendarEvent: { deletedAt: { not: null } } },
            { calendarEvent: { calendar: { deletedAt: { not: null } } } },
          ],
        },
        select: { taskId: true },
        distinct: ["taskId"],
        orderBy: { taskId: "asc" },
      });
      /**
       * Ebenso werden bestehende Abbildungen ausgerichtet, deren aktives
       * Ereignis in einem anderen Kalender als dem aktuellen persönlichen
       * Primärkalender liegt – etwa nach einem Kalenderwechsel. Der Umzug
       * geschieht atomar und ohne Duplikat; fehlt der Primärkalender, bleibt
       * die bisherige klare Ablehnung bestehen.
       */
      const misplaced = await transaction.taskCalendarBinding.findMany({
        where: {
          userId,
          calendarEvent: {
            deletedAt: null,
            calendarId: { not: primary.id },
          },
        },
        select: { taskId: true },
        distinct: ["taskId"],
        orderBy: { taskId: "asc" },
      });
      let repaired = 0;
      const repairTaskIds = [
        ...new Set([
          ...broken.map((binding) => binding.taskId),
          ...misplaced.map((binding) => binding.taskId),
        ]),
      ].sort();
      for (const taskId of repairTaskIds) {
        try {
          await this.synchronizeTask(transaction, userId, taskId);
          repaired += 1;
        } catch (error) {
          ambiguous.push({
            eventUid: null,
            calendarId: null,
            taskId,
            kind: null,
            reason:
              error instanceof MissingPrimaryCalendarError
                ? "Die vorhandene verwaltete Abbildung kann ohne aktiven persönlichen Primärkalender nicht wiederhergestellt oder ausgerichtet werden."
                : "Die vorhandene verwaltete Abbildung ließ sich nicht ohne Vermutung wiederherstellen oder ausrichten.",
          });
        }
      }
      return {
        checkedEvents: events.length,
        reconnected,
        repaired,
        alreadyLinked,
        skippedUnrelated,
        ambiguous,
      };
    });
  }
}
