import type {
  CreateStudyEntryRequest,
  CreateStudyModuleRequest,
  CreateStudyProgramRequest,
  StudyEntryResponse,
  UpdateStudyEntryRequest,
  UpdateStudyModuleRequest,
  UpdateStudyProgramRequest,
} from "@lifeos/contracts";
import { ApiError } from "../../errors.js";
import {
  StudyRecordNotFoundError,
  StudyReferenceNotFoundError,
  type EntryValues,
  type ModuleValues,
  type StudyChanges,
  type StudyRepository,
} from "./repository.js";

const date = (value?: string | null) =>
  value ? new Date(`${value}T00:00:00.000Z`) : null;
const timestamp = (value?: string | null) => (value ? new Date(value) : null);
const own = <T extends object>(value: T, key: PropertyKey) =>
  Object.hasOwn(value, key);

export class StudyService {
  constructor(
    private readonly repository: StudyRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}
  getOverview(userId: string, includeArchived = false) {
    return this.repository.getOverview(userId, includeArchived);
  }
  createProgram(userId: string, input: CreateStudyProgramRequest) {
    return this.handle(() =>
      this.repository.createProgram(userId, {
        ...input,
        status: input.status ?? "planned",
        notes: input.notes ?? null,
      }),
    );
  }
  updateProgram(userId: string, id: string, input: UpdateStudyProgramRequest) {
    const { archived, ...values } = input;
    return this.handle(() =>
      this.repository.updateProgram(userId, id, {
        ...values,
        ...(archived === undefined
          ? {}
          : { archivedAt: archived ? this.now() : null }),
      }),
    );
  }
  createModule(userId: string, input: CreateStudyModuleRequest) {
    return this.handle(() =>
      this.repository.createModule(userId, {
        programId: input.programId,
        code: input.code ?? null,
        title: input.title,
        status: input.status ?? "planned",
        credits: input.credits ?? null,
        grade: input.grade ?? null,
        notes: input.notes ?? null,
        documentReferences: input.documentReferences ?? [],
      }),
    );
  }
  updateModule(userId: string, id: string, input: UpdateStudyModuleRequest) {
    const { archived, ...values } = input;
    const changes: StudyChanges<ModuleValues> = { ...values };
    if (archived !== undefined)
      changes.archivedAt = archived ? this.now() : null;
    return this.handle(() => this.repository.updateModule(userId, id, changes));
  }
  createEntry(userId: string, input: CreateStudyEntryRequest) {
    return this.handle(() =>
      this.repository.createEntry(userId, this.entryValues(input)),
    );
  }
  async updateEntry(
    userId: string,
    id: string,
    input: UpdateStudyEntryRequest,
  ) {
    try {
      const current = (
        await this.repository.getOverview(userId, true)
      ).entries.find((entry) => entry.id === id);
      if (!current) throw new StudyRecordNotFoundError();
      this.assertSchedule({ ...current, ...input });
      const changes: StudyChanges<EntryValues> = {};
      if (input.moduleId !== undefined) changes.moduleId = input.moduleId;
      if (input.kind !== undefined) changes.kind = input.kind;
      if (input.title !== undefined) changes.title = input.title;
      if (input.status !== undefined) changes.status = input.status;
      if (own(input, "credits")) changes.credits = input.credits ?? null;
      if (own(input, "grade")) changes.grade = input.grade ?? null;
      if (own(input, "notes")) changes.notes = input.notes ?? null;
      if (own(input, "taskId")) changes.taskId = input.taskId ?? null;
      if (own(input, "calendarEventId"))
        changes.calendarEventId = input.calendarEventId ?? null;
      if (own(input, "dueDate")) changes.dueDate = date(input.dueDate);
      if (own(input, "startsAt")) changes.startsAt = timestamp(input.startsAt);
      if (own(input, "endsAt")) changes.endsAt = timestamp(input.endsAt);
      if (own(input, "timezone")) changes.timezone = input.timezone ?? null;
      if (input.archived !== undefined)
        changes.archivedAt = input.archived ? this.now() : null;
      return await this.repository.updateEntry(userId, id, changes);
    } catch (error) {
      return this.rethrow(error);
    }
  }
  private entryValues(input: CreateStudyEntryRequest): EntryValues {
    this.assertSchedule(input);
    return {
      moduleId: input.moduleId,
      kind: input.kind,
      title: input.title,
      status: input.status ?? "planned",
      dueDate: date(input.dueDate),
      startsAt: timestamp(input.startsAt),
      endsAt: timestamp(input.endsAt),
      timezone: input.timezone ?? null,
      credits: input.credits ?? null,
      grade: input.grade ?? null,
      notes: input.notes ?? null,
      taskId: input.taskId ?? null,
      calendarEventId: input.calendarEventId ?? null,
    };
  }
  private assertSchedule(
    input:
      | Pick<
          StudyEntryResponse,
          "kind" | "dueDate" | "startsAt" | "endsAt" | "timezone"
        >
      | CreateStudyEntryRequest,
  ) {
    const allDay =
      Boolean(input.dueDate) &&
      !input.startsAt &&
      !input.endsAt &&
      !input.timezone;
    const timed =
      !input.dueDate &&
      Boolean(input.startsAt) &&
      Boolean(input.endsAt) &&
      Boolean(input.timezone) &&
      new Date(String(input.endsAt)) > new Date(String(input.startsAt));
    const valid =
      input.kind === "exam" || input.kind === "submission"
        ? allDay || timed
        : timed;
    if (!valid)
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Datum, Uhrzeit und Zeitzone passen nicht zur Art des Studieneintrags.",
        [
          {
            field: "body.dueDate",
            message: "Ganztagsfrist oder vollständigen Zeitblock angeben.",
          },
        ],
      );
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
    if (error instanceof StudyRecordNotFoundError)
      throw new ApiError(
        404,
        "NOT_FOUND",
        "Der Studieneintrag wurde nicht gefunden.",
      );
    if (error instanceof StudyReferenceNotFoundError)
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Die verknüpfte Studien-, Aufgaben- oder Kalenderreferenz ist nicht verfügbar.",
      );
    throw error;
  }
}
