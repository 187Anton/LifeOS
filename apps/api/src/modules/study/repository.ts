import type {
  AuditEventModel,
  DatabaseClient,
  StudyEntryModel,
  StudyModuleModel,
  StudyProgramModel,
} from "@lifeos/database";
import type {
  StudyEntryKind,
  StudyEntryResponse,
  StudyAuditResponse,
  StudyModuleResponse,
  StudyOverviewResponse,
  StudyProgramResponse,
  StudyStatus,
} from "@lifeos/contracts";

export class StudyRecordNotFoundError extends Error {}
export class StudyReferenceNotFoundError extends Error {}

export interface ProgramValues {
  title: string;
  institution: string;
  periodLabel: string;
  status: StudyStatus;
  notes: string | null;
}
export interface ModuleValues {
  programId: string;
  code: string | null;
  title: string;
  status: StudyStatus;
  credits: number | null;
  grade: string | null;
  notes: string | null;
  documentReferences: string[];
  searchEnabled: boolean;
}
export interface EntryValues {
  moduleId: string;
  kind: StudyEntryKind;
  title: string;
  status: StudyStatus;
  dueDate: Date | null;
  startsAt: Date | null;
  endsAt: Date | null;
  timezone: string | null;
  credits: number | null;
  grade: string | null;
  notes: string | null;
  taskId: string | null;
  calendarEventId: string | null;
}
export type StudyChanges<T> = Partial<T> & { archivedAt?: Date | null };

export interface StudyRepository {
  getOverview(
    userId: string,
    includeArchived: boolean,
  ): Promise<StudyOverviewResponse>;
  createProgram(
    userId: string,
    values: ProgramValues,
  ): Promise<StudyProgramResponse>;
  updateProgram(
    userId: string,
    id: string,
    changes: StudyChanges<ProgramValues>,
  ): Promise<StudyProgramResponse>;
  createModule(
    userId: string,
    values: ModuleValues,
  ): Promise<StudyModuleResponse>;
  updateModule(
    userId: string,
    id: string,
    changes: StudyChanges<ModuleValues>,
  ): Promise<StudyModuleResponse>;
  createEntry(userId: string, values: EntryValues): Promise<StudyEntryResponse>;
  updateEntry(
    userId: string,
    id: string,
    changes: StudyChanges<EntryValues>,
  ): Promise<StudyEntryResponse>;
}

type CommonRecord = {
  id: string;
  userId: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
const common = (record: CommonRecord) => ({
  id: record.id,
  ownerId: record.userId,
  archivedAt: record.archivedAt?.toISOString() ?? null,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});
const mapProgram = (record: StudyProgramModel): StudyProgramResponse => ({
  ...common(record),
  title: record.title,
  institution: record.institution,
  periodLabel: record.periodLabel,
  status: record.status,
  notes: record.notes,
});
const mapModule = (record: StudyModuleModel): StudyModuleResponse => ({
  ...common(record),
  programId: record.programId,
  code: record.code,
  title: record.title,
  status: record.status,
  credits: record.credits === null ? null : Number(record.credits),
  grade: record.grade,
  notes: record.notes,
  documentReferences: record.documentReferences,
  searchEnabled: record.searchEnabled,
});
const mapEntry = (record: StudyEntryModel): StudyEntryResponse => ({
  ...common(record),
  moduleId: record.moduleId,
  kind: record.kind,
  title: record.title,
  status: record.status,
  dueDate: record.dueDate?.toISOString().slice(0, 10) ?? null,
  startsAt: record.startsAt?.toISOString() ?? null,
  endsAt: record.endsAt?.toISOString() ?? null,
  timezone: record.timezone,
  credits: record.credits === null ? null : Number(record.credits),
  grade: record.grade,
  notes: record.notes,
  taskId: record.taskId,
  calendarEventId: record.calendarEventId,
});

const changedFields = (metadata: unknown): string[] => {
  if (
    !metadata ||
    typeof metadata !== "object" ||
    !("changedFields" in metadata)
  )
    return [];
  const value = metadata.changedFields;
  return Array.isArray(value)
    ? value.filter((field): field is string => typeof field === "string")
    : [];
};

const mapAudit = (event: AuditEventModel): StudyAuditResponse => ({
  id: event.id,
  action: event.action as StudyAuditResponse["action"],
  entityType: event.entityType as StudyAuditResponse["entityType"],
  entityId: event.entityId,
  changedFields: changedFields(event.metadata),
  occurredAt: event.occurredAt.toISOString(),
});

type StudyTransaction = Pick<
  DatabaseClient,
  | "studyProgram"
  | "studyModule"
  | "studyEntry"
  | "task"
  | "calendarEvent"
  | "auditEvent"
>;

export class PrismaStudyRepository implements StudyRepository {
  constructor(private readonly database: DatabaseClient) {}

  async getOverview(
    userId: string,
    includeArchived: boolean,
  ): Promise<StudyOverviewResponse> {
    const where = includeArchived ? { userId } : { userId, archivedAt: null };
    const [programs, modules, entries, auditEvents] = await Promise.all([
      this.database.studyProgram.findMany({
        where,
        orderBy: { createdAt: "asc" },
      }),
      this.database.studyModule.findMany({
        where,
        orderBy: { createdAt: "asc" },
      }),
      this.database.studyEntry.findMany({
        where,
        orderBy: [
          { dueDate: { sort: "asc", nulls: "last" } },
          { startsAt: { sort: "asc", nulls: "last" } },
          { createdAt: "asc" },
        ],
      }),
      this.database.auditEvent.findMany({
        where: {
          userId,
          entityType: { in: ["StudyProgram", "StudyModule", "StudyEntry"] },
        },
        orderBy: { occurredAt: "desc" },
        take: 50,
      }),
    ]);
    return {
      programs: programs.map(mapProgram),
      modules: modules.map(mapModule),
      entries: entries.map(mapEntry),
      history: auditEvents.map((event) => mapAudit(event)),
    };
  }

  async createProgram(userId: string, values: ProgramValues) {
    return this.database.$transaction(async (tx) => {
      const record = await tx.studyProgram.create({
        data: { userId, ...values },
      });
      await this.audit(
        tx,
        userId,
        "study.program.created",
        "StudyProgram",
        record.id,
      );
      return mapProgram(record);
    });
  }
  async updateProgram(
    userId: string,
    id: string,
    changes: StudyChanges<ProgramValues>,
  ) {
    return this.database.$transaction(async (tx) => {
      if (!(await tx.studyProgram.findFirst({ where: { id, userId } })))
        throw new StudyRecordNotFoundError();
      const record = await tx.studyProgram.update({
        where: { id },
        data: changes,
      });
      await this.audit(
        tx,
        userId,
        "study.program.updated",
        "StudyProgram",
        id,
        changes,
      );
      return mapProgram(record);
    });
  }
  async createModule(userId: string, values: ModuleValues) {
    return this.database.$transaction(async (tx) => {
      await this.requireProgram(tx, userId, values.programId);
      const record = await tx.studyModule.create({
        data: { userId, ...values },
      });
      await this.audit(
        tx,
        userId,
        "study.module.created",
        "StudyModule",
        record.id,
      );
      return mapModule(record);
    });
  }
  async updateModule(
    userId: string,
    id: string,
    changes: StudyChanges<ModuleValues>,
  ) {
    return this.database.$transaction(async (tx) => {
      if (!(await tx.studyModule.findFirst({ where: { id, userId } })))
        throw new StudyRecordNotFoundError();
      if (changes.programId)
        await this.requireProgram(tx, userId, changes.programId);
      const record = await tx.studyModule.update({
        where: { id },
        data: changes,
      });
      await this.audit(
        tx,
        userId,
        "study.module.updated",
        "StudyModule",
        id,
        changes,
      );
      return mapModule(record);
    });
  }
  async createEntry(userId: string, values: EntryValues) {
    return this.database.$transaction(async (tx) => {
      await this.requireEntryReferences(tx, userId, values);
      const record = await tx.studyEntry.create({
        data: { userId, ...values },
      });
      await this.audit(
        tx,
        userId,
        "study.entry.created",
        "StudyEntry",
        record.id,
      );
      return mapEntry(record);
    });
  }
  async updateEntry(
    userId: string,
    id: string,
    changes: StudyChanges<EntryValues>,
  ) {
    return this.database.$transaction(async (tx) => {
      const current = await tx.studyEntry.findFirst({ where: { id, userId } });
      if (!current) throw new StudyRecordNotFoundError();
      await this.requireEntryReferences(tx, userId, {
        moduleId: changes.moduleId ?? current.moduleId,
        taskId: Object.hasOwn(changes, "taskId")
          ? (changes.taskId ?? null)
          : current.taskId,
        calendarEventId: Object.hasOwn(changes, "calendarEventId")
          ? (changes.calendarEventId ?? null)
          : current.calendarEventId,
      });
      const record = await tx.studyEntry.update({
        where: { id },
        data: changes,
      });
      await this.audit(
        tx,
        userId,
        "study.entry.updated",
        "StudyEntry",
        id,
        changes,
      );
      return mapEntry(record);
    });
  }

  private async requireProgram(
    tx: StudyTransaction,
    userId: string,
    id: string,
  ) {
    if (
      !(await tx.studyProgram.findFirst({
        where: { id, userId, archivedAt: null },
      }))
    )
      throw new StudyReferenceNotFoundError();
  }
  private async requireEntryReferences(
    tx: StudyTransaction,
    userId: string,
    values: Pick<EntryValues, "moduleId" | "taskId" | "calendarEventId">,
  ) {
    const checks = [
      tx.studyModule.findFirst({
        where: { id: values.moduleId, userId, archivedAt: null },
      }),
      values.taskId
        ? tx.task.findFirst({
            where: {
              id: values.taskId,
              userId,
              archivedAt: null,
              deletedAt: null,
            },
          })
        : Promise.resolve(true),
      values.calendarEventId
        ? tx.calendarEvent.findFirst({
            where: { id: values.calendarEventId, userId, deletedAt: null },
          })
        : Promise.resolve(true),
    ];
    if ((await Promise.all(checks)).some((value) => !value))
      throw new StudyReferenceNotFoundError();
  }
  private audit(
    tx: StudyTransaction,
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    changes?: object,
  ) {
    return tx.auditEvent.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
        ...(changes
          ? { metadata: { changedFields: Object.keys(changes).sort() } }
          : {}),
      },
    });
  }
}
