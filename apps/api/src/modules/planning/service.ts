import type {
  CreateAvailabilityWindowRequest,
  PlanningArea,
  PlanningItemResponse,
  PlanningPriority,
  PlanningResponse,
  PlanningWarningResponse,
  UpdateAvailabilityWindowRequest,
} from "@lifeos/contracts";
import { ApiError } from "../../errors.js";
import {
  AvailabilityConflictError,
  AvailabilityNotFoundError,
  type PlanningRepository,
  type PlanningSourceData,
} from "./repository.js";
import {
  addDays,
  dateInTimezone,
  dayRange,
  eachDate,
  weekday,
  zonedDateTime,
} from "./time.js";

export interface PlanningQuery {
  from: string;
  to: string;
  areas?: PlanningArea[];
}

const duration = (startsAt: Date, endsAt: Date) =>
  Math.max(0, Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000));
const activeStatus = (status: string) =>
  status !== "cancelled" && status !== "done";
const completedStatus = (status: string) =>
  status === "completed" || status === "done" || status === "cancelled";
const inRange = (date: string, from: string, to: string) =>
  date >= from && date <= to;
const priorityRank: Record<PlanningPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export class PlanningService {
  constructor(
    private readonly repository: PlanningRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getPlanning(
    userId: string,
    query: PlanningQuery,
  ): Promise<PlanningResponse> {
    this.assertRange(query.from, query.to);
    const source = await this.repository.getSources(userId);
    const timezone = source.settings?.timezone ?? "Europe/Berlin";
    const today = dateInTimezone(this.now(), timezone);
    const allItems = this.mapItems(
      source,
      query.from,
      query.to,
      timezone,
      today,
    );
    const visibleAreas = new Set<PlanningArea>(
      query.areas?.length
        ? query.areas
        : ["calendar", "study", "work", "tasks", "availability"],
    );
    const items = allItems
      .filter((item) => visibleAreas.has(item.area))
      .sort(this.compareItems);
    const availability = allItems.filter(
      (item) => item.kind === "availability",
    );
    const warnings = this.detectWarnings(
      items.filter((item) => item.kind !== "availability"),
      availability,
      query.from,
      query.to,
    );
    return {
      generatedAt: this.now().toISOString(),
      timezone,
      range: { from: query.from, to: query.to },
      items,
      warnings,
      availabilityWindows: source.availabilityWindows.map((value) => ({
        id: value.id,
        ownerId: value.userId,
        weekday: value.weekday,
        startMinute: value.startMinute,
        endMinute: value.endMinute,
        timezone: value.timezone,
        label: value.label,
        createdAt: value.createdAt.toISOString(),
        updatedAt: value.updatedAt.toISOString(),
      })),
    };
  }

  async createAvailability(
    userId: string,
    input: CreateAvailabilityWindowRequest,
  ) {
    await this.assertAvailability(userId, input);
    return this.handle(() => this.repository.createAvailability(userId, input));
  }
  async updateAvailability(
    userId: string,
    id: string,
    input: UpdateAvailabilityWindowRequest,
  ) {
    const sources = await this.repository.getSources(userId);
    const current = sources.availabilityWindows.find(
      (value) => value.id === id,
    );
    if (!current) return this.rethrow(new AvailabilityNotFoundError());
    await this.assertAvailability(
      userId,
      {
        weekday: input.weekday ?? current.weekday,
        startMinute: input.startMinute ?? current.startMinute,
        endMinute: input.endMinute ?? current.endMinute,
        timezone: input.timezone ?? current.timezone,
        label: Object.hasOwn(input, "label")
          ? (input.label ?? null)
          : current.label,
      },
      id,
      sources.availabilityWindows,
    );
    return this.handle(() =>
      this.repository.updateAvailability(userId, id, input),
    );
  }
  deleteAvailability(userId: string, id: string) {
    return this.handle(() => this.repository.deleteAvailability(userId, id));
  }

  private mapItems(
    source: PlanningSourceData,
    from: string,
    to: string,
    timezone: string,
    today: string,
  ): PlanningItemResponse[] {
    const items: PlanningItemResponse[] = [];
    const range = dayRange(from, to, timezone);
    const linkedStudyEvents = new Set(
      source.studyEntries
        .filter((entry) => entry.calendarEventId)
        .map((entry) => entry.calendarEventId),
    );

    for (const event of source.events) {
      if (linkedStudyEvents.has(event.id)) continue;
      const date = event.isAllDay
        ? event.startDate?.toISOString().slice(0, 10)
        : event.startsAt
          ? dateInTimezone(event.startsAt, timezone)
          : null;
      const overlaps = event.isAllDay
        ? Boolean(
            date &&
            event.endDate &&
            date <= to &&
            event.endDate.toISOString().slice(0, 10) > from,
          )
        : Boolean(
            event.startsAt &&
            event.endsAt &&
            event.startsAt < range.toExclusive &&
            event.endsAt > range.from,
          );
      if (!date || !overlaps) continue;
      items.push({
        id: `calendar:${event.id}`,
        sourceId: event.id,
        area: "calendar",
        kind: "fixed_event",
        title: event.title,
        date,
        startsAt: event.startsAt?.toISOString() ?? null,
        endsAt: event.endsAt?.toISOString() ?? null,
        timezone,
        durationMinutes:
          event.startsAt && event.endsAt
            ? duration(event.startsAt, event.endsAt)
            : null,
        priority: "medium",
        overdue: false,
        sourceUpdatedAt: event.updatedAt.toISOString(),
      });
    }

    for (const task of source.tasks.filter((value) =>
      activeStatus(value.status),
    )) {
      if (task.dueDate) {
        const date = task.dueDate.toISOString().slice(0, 10);
        if (inRange(date, from, to)) {
          items.push({
            id: `task:${task.id}:deadline`,
            sourceId: task.id,
            area: "tasks",
            kind: "deadline",
            title: task.title,
            date,
            startsAt: null,
            endsAt: null,
            timezone,
            durationMinutes: null,
            priority: task.priority,
            overdue: date < today,
            sourceUpdatedAt: task.updatedAt.toISOString(),
          });
        }
      }
      if (task.scheduledStartAt && task.estimatedDurationMinutes) {
        const end = new Date(
          task.scheduledStartAt.getTime() +
            task.estimatedDurationMinutes * 60_000,
        );
        const date = dateInTimezone(task.scheduledStartAt, timezone);
        if (task.scheduledStartAt < range.toExclusive && end > range.from) {
          items.push({
            id: `task:${task.id}:planned`,
            sourceId: task.id,
            area: "tasks",
            kind: "planned_task",
            title: task.title,
            date,
            startsAt: task.scheduledStartAt.toISOString(),
            endsAt: end.toISOString(),
            timezone,
            durationMinutes: task.estimatedDurationMinutes,
            priority: task.priority,
            overdue: false,
            sourceUpdatedAt: task.updatedAt.toISOString(),
          });
        }
      }
    }

    for (const entry of source.studyEntries.filter(
      (value) => value.status !== "cancelled",
    )) {
      if (entry.dueDate) {
        const date = entry.dueDate.toISOString().slice(0, 10);
        if (inRange(date, from, to)) {
          items.push({
            id: `study:${entry.id}`,
            sourceId: entry.id,
            area: "study",
            kind: "deadline",
            title: entry.title,
            date,
            startsAt: null,
            endsAt: null,
            timezone,
            durationMinutes: null,
            priority: entry.kind === "exam" ? "high" : "medium",
            overdue: date < today && !completedStatus(entry.status),
            sourceUpdatedAt: entry.updatedAt.toISOString(),
          });
        }
      } else if (entry.startsAt && entry.endsAt) {
        if (entry.startsAt >= range.toExclusive || entry.endsAt <= range.from)
          continue;
        items.push({
          id: `study:${entry.id}`,
          sourceId: entry.id,
          area: "study",
          kind: entry.kind === "learning" ? "planned_task" : "fixed_event",
          title: entry.title,
          date: dateInTimezone(entry.startsAt, timezone),
          startsAt: entry.startsAt.toISOString(),
          endsAt: entry.endsAt.toISOString(),
          timezone,
          durationMinutes: duration(entry.startsAt, entry.endsAt),
          priority: entry.kind === "exam" ? "high" : "medium",
          overdue: false,
          sourceUpdatedAt: entry.updatedAt.toISOString(),
        });
      }
    }

    for (const project of source.workProjects.filter(
      (value) => value.status !== "cancelled",
    )) {
      if (!project.deadlineDate) continue;
      const date = project.deadlineDate.toISOString().slice(0, 10);
      if (!inRange(date, from, to)) continue;
      items.push({
        id: `work-project:${project.id}`,
        sourceId: project.id,
        area: "work",
        kind: "deadline",
        title: project.title,
        date,
        startsAt: null,
        endsAt: null,
        timezone,
        durationMinutes: null,
        priority: "high",
        overdue: date < today && !completedStatus(project.status),
        sourceUpdatedAt: project.updatedAt.toISOString(),
      });
    }

    for (const value of source.workTimeEntries) {
      if (value.startsAt >= range.toExclusive || value.endsAt <= range.from)
        continue;
      items.push({
        id: `work-time:${value.id}`,
        sourceId: value.id,
        area: "work",
        kind: value.kind === "planned" ? "planned_task" : "actual_time",
        title: value.title,
        date: dateInTimezone(value.startsAt, timezone),
        startsAt: value.startsAt.toISOString(),
        endsAt: value.endsAt.toISOString(),
        timezone,
        durationMinutes: duration(value.startsAt, value.endsAt),
        priority: "medium",
        overdue: false,
        sourceUpdatedAt: value.updatedAt.toISOString(),
      });
    }

    for (const date of eachDate(from, to)) {
      for (const window of source.availabilityWindows.filter(
        (value) => value.weekday === weekday(date),
      )) {
        const startsAt = zonedDateTime(
          date,
          window.startMinute,
          window.timezone,
        );
        const endsAt = zonedDateTime(date, window.endMinute, window.timezone);
        items.push({
          id: `availability:${window.id}:${date}`,
          sourceId: window.id,
          area: "availability",
          kind: "availability",
          title: window.label ?? "Persönliche Verfügbarkeit",
          date,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          timezone,
          durationMinutes: duration(startsAt, endsAt),
          priority: "low",
          overdue: false,
          sourceUpdatedAt: window.updatedAt.toISOString(),
        });
      }
    }
    return items;
  }

  private detectWarnings(
    items: PlanningItemResponse[],
    availability: PlanningItemResponse[],
    from: string,
    to: string,
  ): PlanningWarningResponse[] {
    const warnings: PlanningWarningResponse[] = [];
    for (const item of items.filter((value) => value.overdue)) {
      warnings.push({
        id: `overdue:${item.id}`,
        kind: "overdue",
        severity: item.priority === "critical" ? "critical" : "warning",
        date: item.date,
        itemIds: [item.id],
        message: "Eine noch offene Frist liegt in der Vergangenheit.",
      });
    }
    const fixed = items.filter(
      (value) => value.kind === "fixed_event" && value.startsAt && value.endsAt,
    );
    for (let firstIndex = 0; firstIndex < fixed.length; firstIndex += 1) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < fixed.length;
        secondIndex += 1
      ) {
        const first = fixed[firstIndex]!;
        const second = fixed[secondIndex]!;
        if (
          new Date(first.startsAt!).getTime() <
            new Date(second.endsAt!).getTime() &&
          new Date(second.startsAt!).getTime() <
            new Date(first.endsAt!).getTime()
        ) {
          warnings.push({
            id: `overlap:${first.id}:${second.id}`,
            kind: "overlap",
            severity: "critical",
            date: first.date < second.date ? first.date : second.date,
            itemIds: [first.id, second.id],
            message:
              "Zwei feste Termine überschneiden sich. Es wurde nichts automatisch verschoben.",
          });
        }
      }
    }
    for (const date of eachDate(from, to)) {
      const planned = items.filter(
        (item) => item.date === date && item.kind === "planned_task",
      );
      const plannedMinutes = planned.reduce(
        (sum, item) => sum + (item.durationMinutes ?? 0),
        0,
      );
      const available = availability
        .filter((item) => item.date === date)
        .reduce((sum, item) => sum + (item.durationMinutes ?? 0), 0);
      if (plannedMinutes > 0 && available === 0) {
        warnings.push({
          id: `missing-availability:${date}`,
          kind: "missing_data",
          severity: "info",
          date,
          itemIds: planned.map((item) => item.id),
          message:
            "Geplante Zeit ist vorhanden, aber für diesen Tag fehlt eine persönliche Verfügbarkeit.",
        });
      } else if (plannedMinutes > available) {
        warnings.push({
          id: `capacity:${date}`,
          kind: "capacity",
          severity: "warning",
          date,
          itemIds: planned.map((item) => item.id),
          message: `Die geplante Zeit überschreitet die Verfügbarkeit um ${plannedMinutes - available} Minuten.`,
        });
      }
      const urgent = items.filter(
        (item) =>
          item.date === date &&
          ["deadline", "planned_task"].includes(item.kind) &&
          ["high", "critical"].includes(item.priority),
      );
      const distinctUrgent = new Map(
        urgent.map((item) => [item.sourceId, item]),
      );
      if (distinctUrgent.size >= 2) {
        warnings.push({
          id: `priority:${date}`,
          kind: "high_priority_cluster",
          severity: "warning",
          date,
          itemIds: [...distinctUrgent.values()].map((item) => item.id),
          message: `${distinctUrgent.size} hohe Prioritäten liegen im gleichen Zeitraum.`,
        });
      }
    }
    return warnings.sort((first, second) =>
      first.date.localeCompare(second.date),
    );
  }

  private compareItems(
    first: PlanningItemResponse,
    second: PlanningItemResponse,
  ) {
    if (first.overdue !== second.overdue) return first.overdue ? -1 : 1;
    if (first.date !== second.date)
      return first.date.localeCompare(second.date);
    if (first.kind !== second.kind) {
      const rank = {
        deadline: 0,
        fixed_event: 1,
        planned_task: 2,
        actual_time: 3,
        availability: 4,
      };
      return rank[first.kind] - rank[second.kind];
    }
    if (first.priority !== second.priority)
      return priorityRank[first.priority] - priorityRank[second.priority];
    return (first.startsAt ?? "").localeCompare(second.startsAt ?? "");
  }

  private assertRange(from: string, to: string) {
    if (to < from || addDays(from, 62) < to) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Der Planungszeitraum muss aufsteigend und höchstens 63 Tage lang sein.",
      );
    }
  }
  private async assertAvailability(
    userId: string,
    input: CreateAvailabilityWindowRequest,
    ignoredId?: string,
    existing?: PlanningSourceData["availabilityWindows"],
  ) {
    const windows =
      existing ??
      (await this.repository.getSources(userId)).availabilityWindows;
    if (
      windows.some(
        (value) =>
          value.id !== ignoredId &&
          value.weekday === input.weekday &&
          input.startMinute < value.endMinute &&
          value.startMinute < input.endMinute,
      )
    ) {
      throw new ApiError(
        409,
        "CONFLICT",
        "Das Verfügbarkeitsfenster überschneidet sich mit einem vorhandenen Fenster.",
      );
    }
  }
  private async handle<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      return this.rethrow(error);
    }
  }
  private rethrow(error: unknown): never {
    if (error instanceof ApiError) throw error;
    if (error instanceof AvailabilityNotFoundError)
      throw new ApiError(
        404,
        "NOT_FOUND",
        "Die persönliche Verfügbarkeit wurde nicht gefunden.",
      );
    if (error instanceof AvailabilityConflictError)
      throw new ApiError(
        409,
        "CONFLICT",
        "Dieses Verfügbarkeitsfenster ist bereits vorhanden.",
      );
    throw error;
  }
}
