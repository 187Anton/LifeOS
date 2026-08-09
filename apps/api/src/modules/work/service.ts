import type {
  CreateWorkContextRequest,
  CreateWorkProjectRequest,
  CreateWorkTaskLinkRequest,
  CreateWorkTimeEntryRequest,
  UpdateWorkContextRequest,
  UpdateWorkProjectRequest,
  UpdateWorkTimeEntryRequest,
  WorkContextResponse,
  WorkStatus,
  WorkTimeEntryResponse,
} from "@lifeos/contracts";
import { ApiError } from "../../errors.js";
import {
  WorkRecordNotFoundError,
  WorkReferenceNotFoundError,
  WorkTaskAlreadyLinkedError,
  type ContextValues,
  type ProjectValues,
  type TimeValues,
  type WorkChanges,
  type WorkFilters,
  type WorkRepository,
} from "./repository.js";

const day = (value?: string | null) =>
  value ? new Date(`${value}T00:00:00.000Z`) : null;
const instant = (value: string) => new Date(value);
const own = <T extends object>(value: T, key: PropertyKey) =>
  Object.hasOwn(value, key);

export interface WorkOverviewFilters {
  includeArchived?: boolean;
  contextId?: string;
  status?: WorkStatus;
  from?: string;
  to?: string;
}

export class WorkService {
  constructor(
    private readonly repository: WorkRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  getOverview(userId: string, filters: WorkOverviewFilters = {}) {
    const values: WorkFilters = {
      includeArchived: filters.includeArchived ?? false,
      ...(filters.contextId ? { contextId: filters.contextId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.from ? { from: instant(filters.from) } : {}),
      ...(filters.to ? { to: instant(filters.to) } : {}),
    };
    return this.repository.getOverview(userId, values);
  }

  createContext(userId: string, input: CreateWorkContextRequest) {
    return this.handle(() => {
      this.assertPeriod(input);
      return this.repository.createContext(userId, {
        title: input.title,
        role: input.role,
        organization: input.organization ?? null,
        startsOn: day(input.startsOn),
        endsOn: day(input.endsOn),
        timezone: input.timezone,
        status: input.status ?? "planned",
        notes: input.notes ?? null,
      });
    });
  }

  async updateContext(
    userId: string,
    id: string,
    input: UpdateWorkContextRequest,
  ) {
    try {
      const current = (
        await this.repository.getOverview(userId, { includeArchived: true })
      ).contexts.find((value) => value.id === id);
      if (!current) throw new WorkRecordNotFoundError();
      this.assertPeriod({ ...current, ...input });
      const { archived, ...values } = input;
      const changes: WorkChanges<ContextValues> = {
        ...values,
      } as WorkChanges<ContextValues>;
      if (own(input, "organization"))
        changes.organization = input.organization ?? null;
      if (own(input, "startsOn")) changes.startsOn = day(input.startsOn);
      if (own(input, "endsOn")) changes.endsOn = day(input.endsOn);
      if (own(input, "notes")) changes.notes = input.notes ?? null;
      if (archived !== undefined)
        changes.archivedAt = archived ? this.now() : null;
      return await this.repository.updateContext(userId, id, changes);
    } catch (error) {
      return this.rethrow(error);
    }
  }

  createProject(userId: string, input: CreateWorkProjectRequest) {
    return this.handle(() =>
      this.repository.createProject(userId, {
        contextId: input.contextId,
        title: input.title,
        status: input.status ?? "planned",
        goal: input.goal ?? null,
        deadlineDate: day(input.deadlineDate),
        calendarEventId: input.calendarEventId ?? null,
        notes: input.notes ?? null,
      }),
    );
  }

  updateProject(userId: string, id: string, input: UpdateWorkProjectRequest) {
    const { archived, ...values } = input;
    const changes: WorkChanges<ProjectValues> = {
      ...values,
    } as WorkChanges<ProjectValues>;
    if (own(input, "goal")) changes.goal = input.goal ?? null;
    if (own(input, "deadlineDate"))
      changes.deadlineDate = day(input.deadlineDate);
    if (own(input, "calendarEventId"))
      changes.calendarEventId = input.calendarEventId ?? null;
    if (own(input, "notes")) changes.notes = input.notes ?? null;
    if (archived !== undefined)
      changes.archivedAt = archived ? this.now() : null;
    return this.handle(() =>
      this.repository.updateProject(userId, id, changes),
    );
  }

  createTaskLink(userId: string, input: CreateWorkTaskLinkRequest) {
    return this.handle(() =>
      this.repository.createTaskLink(userId, {
        contextId: input.contextId,
        projectId: input.projectId ?? null,
        taskId: input.taskId,
      }),
    );
  }
  deleteTaskLink(userId: string, id: string) {
    return this.handle(() => this.repository.deleteTaskLink(userId, id));
  }

  createTimeEntry(userId: string, input: CreateWorkTimeEntryRequest) {
    return this.handle(() => {
      this.assertTime(input);
      return this.repository.createTimeEntry(userId, this.timeValues(input));
    });
  }
  async updateTimeEntry(
    userId: string,
    id: string,
    input: UpdateWorkTimeEntryRequest,
  ) {
    try {
      const current = (
        await this.repository.getOverview(userId, { includeArchived: true })
      ).timeEntries.find((value) => value.id === id);
      if (!current) throw new WorkRecordNotFoundError();
      this.assertTime({ ...current, ...input });
      const { archived } = input;
      const changes: WorkChanges<TimeValues> = {};
      if (input.contextId !== undefined) changes.contextId = input.contextId;
      if (own(input, "projectId")) changes.projectId = input.projectId ?? null;
      if (own(input, "taskId")) changes.taskId = input.taskId ?? null;
      if (input.kind !== undefined) changes.kind = input.kind;
      if (input.title !== undefined) changes.title = input.title;
      if (own(input, "startsAt"))
        changes.startsAt = instant(String(input.startsAt));
      if (own(input, "endsAt")) changes.endsAt = instant(String(input.endsAt));
      if (input.timezone !== undefined) changes.timezone = input.timezone;
      if (own(input, "notes")) changes.notes = input.notes ?? null;
      if (archived !== undefined)
        changes.archivedAt = archived ? this.now() : null;
      return await this.repository.updateTimeEntry(userId, id, changes);
    } catch (error) {
      return this.rethrow(error);
    }
  }

  private timeValues(input: CreateWorkTimeEntryRequest): TimeValues {
    return {
      contextId: input.contextId,
      projectId: input.projectId ?? null,
      taskId: input.taskId ?? null,
      kind: input.kind,
      title: input.title,
      startsAt: instant(input.startsAt),
      endsAt: instant(input.endsAt),
      timezone: input.timezone,
      notes: input.notes ?? null,
    };
  }
  private assertPeriod(
    input:
      | Pick<WorkContextResponse, "startsOn" | "endsOn">
      | CreateWorkContextRequest,
  ) {
    if (input.startsOn && input.endsOn && input.endsOn < input.startsOn) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Das Ende des Arbeitszeitraums darf nicht vor dem Beginn liegen.",
        [
          {
            field: "body.endsOn",
            message: "Ein Datum am oder nach dem Beginn angeben.",
          },
        ],
      );
    }
  }
  private assertTime(
    input:
      | Pick<WorkTimeEntryResponse, "startsAt" | "endsAt" | "timezone">
      | CreateWorkTimeEntryRequest,
  ) {
    if (!input.timezone || instant(input.endsAt) <= instant(input.startsAt)) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Arbeitszeiten benötigen Beginn, Ende und eine eindeutige Zeitzone.",
        [
          {
            field: "body.endsAt",
            message: "Das Ende muss nach dem Beginn liegen.",
          },
        ],
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
    if (error instanceof WorkRecordNotFoundError)
      throw new ApiError(
        404,
        "NOT_FOUND",
        "Der berufliche Datensatz wurde nicht gefunden.",
      );
    if (error instanceof WorkReferenceNotFoundError)
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Die verknüpfte Arbeits-, Aufgaben- oder Kalenderreferenz ist nicht verfügbar.",
      );
    if (error instanceof WorkTaskAlreadyLinkedError)
      throw new ApiError(
        409,
        "CONFLICT",
        "Die Aufgabe ist bereits einem Arbeitsbereich zugeordnet.",
      );
    throw error;
  }
}
