import type {
  CalendarEventResponse,
  PlanningArea,
  PlanningEditTarget,
  PlanningItemKind,
  PlanningItemObjectType,
  PlanningItemResponse,
  PlanningPriority,
  StudyEntryResponse,
  TaskResponse,
  TaskStatus,
} from "@lifeos/contracts";

import {
  dateKeyInTimezone,
  occurrencesInRange,
  todayInTimezone,
  type DateRange,
} from "./calendar-view";
import { dateTimeInputToIso } from "./date";

/**
 * Gemeinsame Kalender- und Planungsprojektion.
 *
 * Der Typ `PlanningItemResponse` aus `@lifeos/contracts` ist die eine
 * verbindliche Projektionsform: die Planungs-API erzeugt sie server- und
 * besitzgebunden, die Weboberfläche baut dieselbe Form für die vier
 * Kalenderansichten aus den bereits geladenen, ausschließlich eigenen Daten.
 * Beide Seiten benennen Quelle (`area`), Objektart (`objectType`), Besitzer
 * (`ownerId`), Titel, Status, Datum, Start, Ende, Zeitzone, führenden Kalender
 * (`calendarId`, `uid`) und Bearbeitbarkeit (`editable`). Diese Datei ist keine
 * zweite Datenquelle: sie erfindet keine Werte, sondern klassifiziert
 * vorhandene Fachobjekte.
 *
 * Regeln, die mit `apps/api/src/modules/planning/service.ts` übereinstimmen:
 * - Aufgabenfristen, Startmarkierungen und Studientermine ohne Dauer sind
 *   tagesbasiert und werden über die Profilzeitzone eingeordnet.
 * - Start plus Dauer ist ein geplanter Zeitblock. Zeitgebundene Blöcke werden
 *   bei echter Zeitüberlappung mit dem sichtbaren Zeitraum aufgenommen; ihr
 *   Anzeigetag ist max(eigener Starttag in Profilzeitzone, range.start). Je
 *   Block und Zeitraum entsteht genau ein Eintrag.
 * - Eine Startmarkierung ohne Dauer erhält kein erfundenes Ende.
 * - Ein verknüpfter Studieneintrag wird nur unterdrückt, wenn sein führender
 *   Termin in der tatsächlich gelieferten Projektion erscheint.
 * - Kalenderereignisse behalten ihre gespeicherte Zeitzone für die Anzeige und
 *   werden weiterhin im Kalender-Raster (Kalenderzeitzone) dargestellt.
 */

/** Projektionseintrag einer Kalenderansicht. */
export interface CalendarProjectionEntry {
  key: string;
  /** Gemeinsame Projektion des zugrunde liegenden Fachobjekts. */
  item: PlanningItemResponse;
  /** Kalendertag, an dem der Eintrag einsortiert wird. */
  dateKey: string;
  startsAt: string | null;
  endsAt: string | null;
  startDate: string | null;
  endDate: string | null;
  recurring: boolean;
  /**
   * Zeitgebundener Block beginnt vor seinem Anzeigetag: er läuft aus dem
   * vorherigen Tag oder von außerhalb des sichtbaren Zeitraums herein. Der
   * Eintrag selbst erscheint genau einmal an seinem Anzeigetag.
   */
  continuesBefore: boolean;
  /** Zeitgebundener Block läuft über seinen Anzeigetag hinaus. */
  continuesAfter: boolean;
  /**
   * Führendes Kalenderereignis aus dem gemeinsamen Kalenderkern. Es bleibt der
   * einzige Bearbeitungspfad für Termine: stabile UID, aktueller ETag und
   * unveränderte Serieninstanzen.
   */
  event: CalendarEventResponse | null;
}

export const areaLabels: Record<PlanningArea, string> = {
  calendar: "Kalender",
  study: "Studium",
  work: "Arbeit",
  tasks: "Aufgaben",
  availability: "Verfügbarkeit",
};

export const kindLabels: Record<PlanningItemKind, string> = {
  fixed_event: "Fester Termin",
  deadline: "Frist",
  planned_task: "Geplanter Zeitblock",
  start_marker: "Start ohne Dauer",
  actual_time: "Tatsächliche Zeit",
  availability: "Persönliche Verfügbarkeit",
};

/** Anzeigetexte für Blöcke, die den sichtbaren Tag überschreiten. */
export const continuationLabels = {
  before: "Fortsetzung vom Vortag",
  after: "Fortsetzung am Folgetag",
} as const;

const kindRank: Record<PlanningItemKind, number> = {
  deadline: 0,
  fixed_event: 1,
  planned_task: 2,
  start_marker: 3,
  actual_time: 4,
  availability: 5,
};

const priorityRank: Record<PlanningPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const activeTaskStatus = (status: TaskStatus): boolean =>
  status !== "done" && status !== "cancelled";

/**
 * Erledigte und abgebrochene Studieneinträge bleiben aus der Kalenderansicht
 * heraus; das entspricht dem bewahrten Altverhalten der Web-Schicht. Der
 * API-Statusfilter bleibt davon unabhängig und unverändert.
 */
const hiddenStudyStatus = (status: string): boolean =>
  status === "completed" || status === "cancelled";

const visibleStudyEntry = (entry: StudyEntryResponse): boolean =>
  entry.archivedAt === null && !hiddenStudyStatus(entry.status);

const durationMinutes = (startsAt: Date, endsAt: Date): number =>
  Math.max(0, Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000));

interface ProjectionItemInput {
  id: string;
  sourceId: string;
  area: PlanningArea;
  kind: PlanningItemKind;
  objectType: PlanningItemObjectType;
  ownerId: string;
  title: string;
  status: string;
  date: string;
  timezone: string;
  priority: PlanningPriority;
  uid?: string | null;
  calendarId?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  durationMinutes?: number | null;
  overdue?: boolean;
  editable?: PlanningEditTarget | null;
  sourceUpdatedAt?: string | null;
}

/**
 * Füllt ausschließlich neutrale Vorgaben. Fehlende Angaben bleiben `null`, es
 * werden keine Enden, Dauern, Besitzer oder Kalender erfunden.
 */
const projectionItem = (input: ProjectionItemInput): PlanningItemResponse => ({
  uid: null,
  calendarId: null,
  startsAt: null,
  endsAt: null,
  durationMinutes: null,
  overdue: false,
  editable: null,
  sourceUpdatedAt: null,
  ...input,
});

/** Fortsetzungskennzeichen eines Projektionseintrags. */
export interface ItemContinuation {
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/**
 * Leitet die Fortsetzungskennzeichen ausschließlich aus den gelieferten
 * Zeitpunkten ab: eigener Starttag < Anzeigetag bzw. eigener Endtag >
 * Anzeigetag. Ohne Start und Ende entsteht keine Fortsetzung. Die Planungs- und
 * die Kalenderansicht verwenden dieselbe Ableitung, damit beide dieselben
 * Kennzeichnungen zeigen.
 */
export const projectionContinuation = (
  item: Pick<PlanningItemResponse, "date" | "startsAt" | "endsAt">,
  profileTimezone: string,
): ItemContinuation => {
  if (!item.startsAt || !item.endsAt) {
    return { continuesBefore: false, continuesAfter: false };
  }
  return {
    continuesBefore:
      dateKeyInTimezone(new Date(item.startsAt), profileTimezone) < item.date,
    continuesAfter:
      dateKeyInTimezone(new Date(item.endsAt), profileTimezone) > item.date,
  };
};

export interface CalendarProjectionInput {
  events: CalendarEventResponse[];
  tasks: TaskResponse[];
  studyEntries: StudyEntryResponse[];
  /** Bereich der Kalenderansicht: `start` einschließlich, `end` ausschließlich. */
  range: DateRange;
  /**
   * Kalender-/Rasterzeitzone der Ansicht. Kalenderereignisse werden darin
   * gerastert und in ihrer gespeicherten Zeitzone beschriftet.
   */
  timezone: string;
  /** Profilzeitzone für Tagesgrenzen von Aufgaben und Studieneinträgen. */
  profileTimezone: string;
  /**
   * Ausgewählter Kalender der Ansicht. Die geladenen Ereignisse gehören genau
   * diesem Kalender; er wird deshalb als `calendarId` der Kalender-Items
   * geführt. Die UID allein ist nicht zwingend über Kalender hinweg eindeutig.
   */
  calendarId?: string | null;
  ownerId: string;
}

interface BlockPlacement {
  dateKey: string;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/**
 * Ordnet einen zeitgebundenen Block dem sichtbaren Zeitraum zu. Aufgenommen
 * wird nur bei echter Zeitüberlappung; der Anzeigetag ist
 * max(eigener Starttag in Profilzeitzone, range.start). Es entsteht genau ein
 * Eintrag pro Block und Zeitraum – auch dann, wenn der Block den sichtbaren Tag
 * oder die Wochengrenze überschreitet.
 */
const placeBlock = (
  startsAt: Date,
  endsAt: Date,
  range: DateRange,
  profileTimezone: string,
): BlockPlacement | null => {
  const rangeFrom = new Date(
    dateTimeInputToIso(`${range.start}T00:00`, profileTimezone),
  );
  const rangeToExclusive = new Date(
    dateTimeInputToIso(`${range.end}T00:00`, profileTimezone),
  );
  if (!(startsAt < rangeToExclusive && endsAt > rangeFrom)) return null;
  const ownStartDay = dateKeyInTimezone(startsAt, profileTimezone);
  const dateKey = ownStartDay < range.start ? range.start : ownStartDay;
  if (dateKey >= range.end) return null;
  return {
    dateKey,
    continuesBefore: ownStartDay < dateKey,
    continuesAfter: dateKeyInTimezone(endsAt, profileTimezone) > dateKey,
  };
};

/**
 * Baut die gemeinsame Projektion für einen sichtbaren Kalenderbereich. Alle
 * Quellen stammen aus bereits besitzgebunden geladenen Antworten der API; die
 * Projektion liest nichts nach und schreibt nie.
 */
export const buildCalendarProjection = ({
  events,
  tasks,
  studyEntries,
  range,
  timezone,
  profileTimezone,
  calendarId = null,
  ownerId,
}: CalendarProjectionInput): CalendarProjectionEntry[] => {
  const entries: CalendarProjectionEntry[] = [];
  const inRange = (date: string): boolean =>
    date >= range.start && date < range.end;
  const today = todayInTimezone(profileTimezone);

  const occurrences = occurrencesInRange(events, range, timezone);
  /**
   * Nur die tatsächlich projizierten Ereignisse dürfen einen verknüpften
   * Studieneintrag unterdrücken. Die UID wird nie als kalenderübergreifend
   * eindeutiger Schlüssel verwendet, sondern ausschließlich gegen die UIDs der
   * tatsächlich gelieferten Projektion geprüft.
   */
  const projectedEventUids = new Set(
    occurrences.map((occurrence) => occurrence.event.uid),
  );

  for (const occurrence of occurrences) {
    const event = occurrence.event;
    entries.push({
      key: `calendar:${occurrence.key}`,
      item: projectionItem({
        id: `calendar:${occurrence.key}`,
        sourceId: event.uid,
        uid: event.uid,
        calendarId,
        area: "calendar",
        kind: "fixed_event",
        objectType: "calendar_event",
        ownerId,
        title: event.title,
        status: "confirmed",
        date: occurrence.dateKey,
        startsAt: occurrence.startsAt,
        endsAt: occurrence.endsAt,
        timezone: event.timezone,
        durationMinutes:
          occurrence.startsAt && occurrence.endsAt
            ? durationMinutes(
                new Date(occurrence.startsAt),
                new Date(occurrence.endsAt),
              )
            : null,
        priority: "medium",
        editable: "calendar_event",
        sourceUpdatedAt: event.updatedAt,
      }),
      dateKey: occurrence.dateKey,
      startsAt: occurrence.startsAt,
      endsAt: occurrence.endsAt,
      startDate: occurrence.startDate,
      endDate: occurrence.endDate,
      recurring: occurrence.recurring,
      /**
       * Kalenderereignisse werden weiterhin im Kalender-Raster der
       * Kalenderzeitzone geführt; die Fortsetzungskennzeichen gelten für
       * zeitgebundene Aufgaben- und Studienblöcke.
       */
      continuesBefore: false,
      continuesAfter: false,
      event,
    });
  }

  for (const task of tasks.filter((value) => activeTaskStatus(value.status))) {
    if (task.dueDate && inRange(task.dueDate)) {
      entries.push({
        key: `task:${task.id}:deadline`,
        item: projectionItem({
          id: `task:${task.id}:deadline`,
          sourceId: task.id,
          area: "tasks",
          kind: "deadline",
          objectType: "task",
          ownerId,
          title: task.title,
          status: task.status,
          date: task.dueDate,
          timezone: profileTimezone,
          priority: task.priority,
          overdue: task.dueDate < today,
          editable: "task",
          sourceUpdatedAt: task.updatedAt,
        }),
        dateKey: task.dueDate,
        startsAt: null,
        endsAt: null,
        startDate: task.dueDate,
        endDate: null,
        recurring: false,
        continuesBefore: false,
        continuesAfter: false,
        event: null,
      });
    }

    const scheduledStart = task.scheduledStartAt;
    if (!scheduledStart) continue;
    const startsAt = new Date(scheduledStart);
    const itemTimezone = task.scheduledStartTimezone ?? profileTimezone;
    if (task.estimatedDurationMinutes) {
      const endsAt = new Date(
        startsAt.getTime() + task.estimatedDurationMinutes * 60_000,
      );
      const placement = placeBlock(startsAt, endsAt, range, profileTimezone);
      if (!placement) continue;
      entries.push({
        key: `task:${task.id}:planned`,
        item: projectionItem({
          id: `task:${task.id}:planned`,
          sourceId: task.id,
          area: "tasks",
          kind: "planned_task",
          objectType: "task",
          ownerId,
          title: task.title,
          status: task.status,
          date: placement.dateKey,
          startsAt: scheduledStart,
          endsAt: endsAt.toISOString(),
          timezone: itemTimezone,
          durationMinutes: task.estimatedDurationMinutes,
          priority: task.priority,
          editable: "task",
          sourceUpdatedAt: task.updatedAt,
        }),
        dateKey: placement.dateKey,
        startsAt: scheduledStart,
        endsAt: endsAt.toISOString(),
        startDate: null,
        endDate: null,
        recurring: false,
        continuesBefore: placement.continuesBefore,
        continuesAfter: placement.continuesAfter,
        event: null,
      });
      continue;
    }

    const dateKey = dateKeyInTimezone(startsAt, profileTimezone);
    if (!inRange(dateKey)) continue;
    entries.push({
      key: `task:${task.id}:start`,
      item: projectionItem({
        id: `task:${task.id}:start`,
        sourceId: task.id,
        area: "tasks",
        kind: "start_marker",
        objectType: "task",
        ownerId,
        title: task.title,
        status: task.status,
        date: dateKey,
        startsAt: scheduledStart,
        timezone: itemTimezone,
        priority: task.priority,
        editable: "task",
        sourceUpdatedAt: task.updatedAt,
      }),
      dateKey,
      startsAt: scheduledStart,
      endsAt: null,
      startDate: null,
      endDate: null,
      recurring: false,
      continuesBefore: false,
      continuesAfter: false,
      event: null,
    });
  }

  for (const entry of studyEntries.filter(visibleStudyEntry)) {
    if (entry.dueDate && inRange(entry.dueDate)) {
      entries.push({
        key: `study:${entry.id}`,
        item: projectionItem({
          id: `study:${entry.id}`,
          sourceId: entry.id,
          area: "study",
          kind: "deadline",
          objectType: "study_entry",
          ownerId,
          title: entry.title,
          status: entry.status,
          date: entry.dueDate,
          timezone: entry.timezone ?? profileTimezone,
          priority: entry.kind === "exam" ? "high" : "medium",
          overdue: entry.dueDate < today && !hiddenStudyStatus(entry.status),
          sourceUpdatedAt: entry.updatedAt,
        }),
        dateKey: entry.dueDate,
        startsAt: null,
        endsAt: null,
        startDate: entry.dueDate,
        endDate: null,
        recurring: false,
        continuesBefore: false,
        continuesAfter: false,
        event: null,
      });
      continue;
    }
    if (!entry.startsAt || !entry.endsAt) continue;
    /**
     * Doppelte Darstellung vermeiden: Nur wenn das führende Kalenderereignis in
     * der aktuellen Projektion tatsächlich vertreten ist, zeigt die
     * Kalenderansicht ausschließlich den Termin aus dem Kalenderkern. Liegt der
     * Termin in einem anderen Kalender, außerhalb des Zeitraums oder wurde er
     * gelöscht, bleibt die eigene Studiumsprojektion sichtbar.
     */
    if (
      entry.calendarEventUid &&
      projectedEventUids.has(entry.calendarEventUid)
    )
      continue;
    const startsAt = new Date(entry.startsAt);
    const endsAt = new Date(entry.endsAt);
    const placement = placeBlock(startsAt, endsAt, range, profileTimezone);
    if (!placement) continue;
    entries.push({
      key: `study:${entry.id}`,
      item: projectionItem({
        id: `study:${entry.id}`,
        sourceId: entry.id,
        area: "study",
        kind: entry.kind === "learning" ? "planned_task" : "fixed_event",
        objectType: "study_entry",
        ownerId,
        title: entry.title,
        status: entry.status,
        date: placement.dateKey,
        startsAt: entry.startsAt,
        endsAt: entry.endsAt,
        timezone: entry.timezone ?? profileTimezone,
        durationMinutes: durationMinutes(startsAt, endsAt),
        priority: entry.kind === "exam" ? "high" : "medium",
        sourceUpdatedAt: entry.updatedAt,
      }),
      dateKey: placement.dateKey,
      startsAt: entry.startsAt,
      endsAt: entry.endsAt,
      startDate: null,
      endDate: null,
      recurring: false,
      continuesBefore: placement.continuesBefore,
      continuesAfter: placement.continuesAfter,
      event: null,
    });
  }

  return entries.sort(compareProjectionEntries);
};

const compareProjectionEntries = (
  first: CalendarProjectionEntry,
  second: CalendarProjectionEntry,
): number => {
  if (first.item.overdue !== second.item.overdue)
    return first.item.overdue ? -1 : 1;
  if (first.dateKey !== second.dateKey)
    return first.dateKey.localeCompare(second.dateKey);
  if (first.item.kind !== second.item.kind)
    return kindRank[first.item.kind] - kindRank[second.item.kind];
  if (first.item.priority !== second.item.priority)
    return (
      priorityRank[first.item.priority] - priorityRank[second.item.priority]
    );
  return (first.startsAt ?? "").localeCompare(second.startsAt ?? "");
};

/**
 * Ganztagsobjekte tragen weder Start noch Ende als Zeitpunkt: Fristen bleiben
 * reine Tage im Sinne der Datenmodellregeln.
 */
export const isAllDayProjectionItem = (item: PlanningItemResponse): boolean =>
  item.startsAt === null && item.endsAt === null;

/**
 * Zeigt einen Start ohne bekanntes Ende als einzelne Uhrzeit. Es wird bewusst
 * kein Endzeitpunkt ergänzt.
 */
export const formatProjectionTime = (
  item: PlanningItemResponse,
  timezone: string,
): string => {
  if (!item.startsAt) return "Ganztägig";
  const formatter = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
  if (!item.endsAt) return formatter.format(new Date(item.startsAt));
  return `${formatter.format(new Date(item.startsAt))}–${formatter.format(new Date(item.endsAt))}`;
};
