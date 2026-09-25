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
/**
 * Gemeinsame Statusregel der Projektion für Studieneinträge: erledigte und
 * abgebrochene Einträge bleiben unsichtbar, aktive einschließlich `paused`
 * bleiben sichtbar. Archivierte Einträge liefert die Datenbankabfrage bereits
 * nicht aus. Die Kalenderansicht wendet dieselbe Regel an, damit Kalender und
 * Planung dieselben Statusfälle zeigen.
 */
const hiddenStudyStatus = (status: string) =>
  status === "completed" || status === "cancelled";
/**
 * Kalenderübergreifend eindeutige öffentliche Identität eines Kalendertermins.
 * Die UID allein genügt nicht, weil dieselbe UID in mehreren Kalendern
 * vorkommen darf.
 */
const eventKey = (calendarId: string, uid: string) =>
  `${calendarId}\u0000${uid}`;
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
    /**
     * Die sichtbaren Bereiche werden VOR der Projektion bestimmt. Ein
     * verknüpfter Studieneintrag wird nur unterdrückt, wenn sein führender
     * Termin in der TATSÄCHLICH gelieferten Projektion erscheint. Ist der
     * Bereich „Kalender" abgewählt, erscheint der Termin nicht und der
     * Studieneintrag muss sichtbar bleiben.
     */
    const visibleAreas = new Set<PlanningArea>(
      query.areas?.length
        ? query.areas
        : ["calendar", "study", "work", "tasks", "availability"],
    );
    const allItems = this.mapItems(
      source,
      userId,
      query.from,
      query.to,
      timezone,
      today,
      visibleAreas,
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
      timezone,
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
    userId: string,
    from: string,
    to: string,
    timezone: string,
    today: string,
    visibleAreas: Set<PlanningArea>,
  ): PlanningItemResponse[] {
    const items: PlanningItemResponse[] = [];
    const range = dayRange(from, to, timezone);
    /**
     * Verteidigende Besitzergrenze: die Projektion liest ausschließlich
     * Datensätze desselben Besitzers und öffnet nie fremde Objekte über
     * interne IDs. Die Repository-Abfragen filtern bereits, diese Prüfung
     * bleibt als zweite, unabhängige Grenze bestehen.
     */
    const owned = <Value extends { userId: string }>(
      values: Value[],
    ): Value[] => values.filter((value) => value.userId === userId);
    /**
     * Öffentliche Identität der Ereignisse, die die Projektion tatsächlich
     * anzeigt. Verglichen wird über `(calendarId, uid)`, nie über die UID
     * allein: dieselbe UID kann in mehreren Kalendern vorkommen.
     */
    const displayedEventKeys = new Set<string>();

    for (const event of owned(source.events)) {
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
      /**
       * Unterdrückt wird nur gegen die tatsächlich gelieferte Projektion. Ist
       * der Bereich „Kalender" ausgeblendet, erscheint das Ereignis nicht und
       * sein verknüpfter Studieneintrag darf deshalb nicht verschwinden.
       */
      if (visibleAreas.has("calendar"))
        displayedEventKeys.add(eventKey(event.calendarId, event.uid));
      items.push({
        id: `calendar:${event.id}`,
        sourceId: event.id,
        uid: event.uid,
        calendarId: event.calendarId,
        area: "calendar",
        kind: "fixed_event",
        objectType: "calendar_event",
        ownerId: event.userId,
        title: event.title,
        status: "confirmed",
        date,
        startsAt: event.startsAt?.toISOString() ?? null,
        endsAt: event.endsAt?.toISOString() ?? null,
        /** Anzeige in der gespeicherten Zeitzone des Ereignisses. */
        timezone: event.timezone,
        durationMinutes:
          event.startsAt && event.endsAt
            ? duration(event.startsAt, event.endsAt)
            : null,
        priority: "medium",
        overdue: false,
        editable: "calendar_event",
        sourceUpdatedAt: event.updatedAt.toISOString(),
      });
    }

    for (const task of owned(source.tasks).filter((value) =>
      activeStatus(value.status),
    )) {
      if (task.dueDate) {
        const date = task.dueDate.toISOString().slice(0, 10);
        if (inRange(date, from, to)) {
          items.push({
            id: `task:${task.id}:deadline`,
            sourceId: task.id,
            uid: null,
            calendarId: null,
            area: "tasks",
            kind: "deadline",
            objectType: "task",
            ownerId: task.userId,
            title: task.title,
            status: task.status,
            date,
            startsAt: null,
            endsAt: null,
            timezone,
            durationMinutes: null,
            priority: task.priority,
            overdue: date < today,
            editable: "task",
            sourceUpdatedAt: task.updatedAt.toISOString(),
          });
        }
      }
      const scheduledStart = task.scheduledStartAt;
      if (scheduledStart && task.estimatedDurationMinutes) {
        const end = new Date(
          scheduledStart.getTime() + task.estimatedDurationMinutes * 60_000,
        );
        const ownDay = dateInTimezone(scheduledStart, timezone);
        /**
         * Ein Block, der in den Zeitraum hineinläuft, erscheint genau einmal am
         * ersten sichtbaren Tag als Fortsetzung und nicht auf seinem
         * außerhalb liegenden Starttag.
         */
        const date = ownDay < from ? from : ownDay;
        if (scheduledStart < range.toExclusive && end > range.from) {
          items.push({
            id: `task:${task.id}:planned`,
            sourceId: task.id,
            uid: null,
            calendarId: null,
            area: "tasks",
            kind: "planned_task",
            objectType: "task",
            ownerId: task.userId,
            title: task.title,
            status: task.status,
            date,
            startsAt: scheduledStart.toISOString(),
            endsAt: end.toISOString(),
            timezone,
            durationMinutes: task.estimatedDurationMinutes,
            priority: task.priority,
            overdue: false,
            editable: "task",
            sourceUpdatedAt: task.updatedAt.toISOString(),
          });
        }
      } else if (scheduledStart) {
        /**
         * Reine Startmarkierung: Der geplante Beginn ist bekannt, die Dauer
         * nicht. Es wird bewusst kein Ende erfunden und keine Dauer in die
         * Kapazität gerechnet.
         */
        const date = dateInTimezone(scheduledStart, timezone);
        if (inRange(date, from, to)) {
          items.push({
            id: `task:${task.id}:start`,
            sourceId: task.id,
            uid: null,
            calendarId: null,
            area: "tasks",
            kind: "start_marker",
            objectType: "task",
            ownerId: task.userId,
            title: task.title,
            status: task.status,
            date,
            startsAt: scheduledStart.toISOString(),
            endsAt: null,
            timezone,
            durationMinutes: null,
            priority: task.priority,
            overdue: false,
            editable: "task",
            sourceUpdatedAt: task.updatedAt.toISOString(),
          });
        }
      }
    }

    for (const entry of owned(source.studyEntries).filter(
      (value) => !hiddenStudyStatus(value.status),
    )) {
      if (entry.dueDate) {
        const date = entry.dueDate.toISOString().slice(0, 10);
        if (inRange(date, from, to)) {
          items.push({
            id: `study:${entry.id}`,
            sourceId: entry.id,
            uid: null,
            calendarId: null,
            area: "study",
            kind: "deadline",
            objectType: "study_entry",
            ownerId: entry.userId,
            title: entry.title,
            status: entry.status,
            date,
            startsAt: null,
            endsAt: null,
            timezone,
            durationMinutes: null,
            priority: entry.kind === "exam" ? "high" : "medium",
            overdue: date < today && !hiddenStudyStatus(entry.status),
            editable: null,
            sourceUpdatedAt: entry.updatedAt.toISOString(),
          });
        }
      } else if (entry.startsAt && entry.endsAt) {
        /**
         * Doppelte Darstellung vermeiden: Ist ein führendes Kalenderereignis
         * vorhanden und wird es in diesem Zeitraum gezeigt, ersetzt es die
         * zeitgebundene Studienprojektion. Reine Fristen bleiben unabhängig
         * davon eine eigene, bewusst beschriftete Projektion. Verglichen wird
         * die öffentliche Identität `(calendarId, uid)`; eine UID, die nur in
         * einem anderen Kalender vorkommt, unterdrückt hier nichts.
         */
        if (
          entry.calendarEvent &&
          displayedEventKeys.has(
            eventKey(entry.calendarEvent.calendarId, entry.calendarEvent.uid),
          )
        )
          continue;
        if (entry.startsAt >= range.toExclusive || entry.endsAt <= range.from)
          continue;
        /**
         * Anzeigetag = eigener Starttag in der Profilzeitzone, angehoben auf
         * den Zeitraumbeginn, wenn der Block in den Zeitraum hineinläuft. So
         * erscheint ein Mitternachtsblock genau einmal, am ersten sichtbaren
         * Tag, und nie zusätzlich auf seinem außerhalb liegenden Starttag.
         */
        const entryDay = dateInTimezone(entry.startsAt, timezone);
        const date = entryDay < from ? from : entryDay;
        items.push({
          id: `study:${entry.id}`,
          sourceId: entry.id,
          uid: null,
          calendarId: null,
          area: "study",
          kind: entry.kind === "learning" ? "planned_task" : "fixed_event",
          objectType: "study_entry",
          ownerId: entry.userId,
          title: entry.title,
          status: entry.status,
          date,
          startsAt: entry.startsAt.toISOString(),
          endsAt: entry.endsAt.toISOString(),
          timezone,
          durationMinutes: duration(entry.startsAt, entry.endsAt),
          priority: entry.kind === "exam" ? "high" : "medium",
          overdue: false,
          editable: null,
          sourceUpdatedAt: entry.updatedAt.toISOString(),
        });
      }
    }

    for (const project of owned(source.workProjects).filter(
      (value) => value.status !== "cancelled",
    )) {
      if (!project.deadlineDate) continue;
      const date = project.deadlineDate.toISOString().slice(0, 10);
      if (!inRange(date, from, to)) continue;
      items.push({
        id: `work-project:${project.id}`,
        sourceId: project.id,
        uid: null,
        calendarId: null,
        area: "work",
        kind: "deadline",
        objectType: "work_project",
        ownerId: project.userId,
        title: project.title,
        status: project.status,
        date,
        startsAt: null,
        endsAt: null,
        timezone,
        durationMinutes: null,
        priority: "high",
        overdue: date < today && !completedStatus(project.status),
        editable: null,
        sourceUpdatedAt: project.updatedAt.toISOString(),
      });
    }

    for (const value of owned(source.workTimeEntries)) {
      if (value.startsAt >= range.toExclusive || value.endsAt <= range.from)
        continue;
      /**
       * Wie bei Aufgabenblöcken und zeitgebundenen Studieneinträgen:
       * Anzeigetag = eigener Starttag in der Profilzeitzone, angehoben auf den
       * Zeitraumbeginn, wenn der Block in den Zeitraum hineinläuft. Ein
       * Mitternachtsblock erscheint damit genau einmal am ersten sichtbaren
       * Tag.
       */
      const ownDay = dateInTimezone(value.startsAt, timezone);
      const date = ownDay < from ? from : ownDay;
      items.push({
        id: `work-time:${value.id}`,
        sourceId: value.id,
        uid: null,
        calendarId: null,
        area: "work",
        kind: value.kind === "planned" ? "planned_task" : "actual_time",
        objectType: "work_time_entry",
        ownerId: value.userId,
        title: value.title,
        status: value.kind,
        date,
        startsAt: value.startsAt.toISOString(),
        endsAt: value.endsAt.toISOString(),
        timezone,
        durationMinutes: duration(value.startsAt, value.endsAt),
        priority: "medium",
        overdue: false,
        editable: null,
        sourceUpdatedAt: value.updatedAt.toISOString(),
      });
    }

    for (const date of eachDate(from, to)) {
      for (const window of owned(source.availabilityWindows).filter(
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
          uid: null,
          calendarId: null,
          area: "availability",
          kind: "availability",
          objectType: "availability_window",
          ownerId: window.userId,
          title: window.label ?? "Persönliche Verfügbarkeit",
          status: "available",
          date,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          timezone,
          durationMinutes: duration(startsAt, endsAt),
          priority: "low",
          overdue: false,
          editable: null,
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
    timezone: string,
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
      /**
       * Kapazität und fehlende Verfügbarkeit rechnen ausschließlich geplante
       * Zeitblöcke mit geprüfter Dauer. Fristen und reine Startmarkierungen
       * erzeugen bewusst keine belegte Arbeitszeit.
       *
       * Ein geplanter Block zählt genau einmal, und zwar nur an dem Tag, der
       * seinem EIGENEN Starttag in der Profilzeitzone entspricht. Eine in den
       * Zeitraum hineinreichende Fortsetzung (Starttag vor dem Zeitraum)
       * trägt 0 Minuten bei, damit sie die Kapazität nicht doppelt belastet
       * und für den Fortsetzungstag allein weder `capacity` noch
       * `missing_data` entsteht.
       */
      const planned = items.filter(
        (item) =>
          item.kind === "planned_task" &&
          item.date === date &&
          item.startsAt !== null &&
          dateInTimezone(new Date(item.startsAt), timezone) === date,
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
        start_marker: 3,
        actual_time: 4,
        availability: 5,
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
