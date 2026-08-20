import type {
  AuditEventModel,
  DatabaseClient,
  WorkContextModel,
  WorkProjectModel,
  WorkTaskLinkModel,
  WorkTimeEntryModel,
} from "@lifeos/database";
import type {
  WorkAuditResponse,
  WorkContextResponse,
  WorkOverviewResponse,
  WorkProjectResponse,
  WorkStatus,
  WorkTaskLinkResponse,
  WorkTimeEntryResponse,
  WorkTimeKind,
} from "@lifeos/contracts";

export class WorkRecordNotFoundError extends Error {}
export class WorkReferenceNotFoundError extends Error {}
export class WorkTaskAlreadyLinkedError extends Error {}

export interface WorkFilters {
  includeArchived: boolean;
  contextId?: string;
  status?: WorkStatus;
  from?: Date;
  to?: Date;
}
export interface ContextValues {
  title: string;
  role: string;
  organization: string | null;
  startsOn: Date | null;
  endsOn: Date | null;
  timezone: string;
  status: WorkStatus;
  notes: string | null;
}
export interface ProjectValues {
  contextId: string;
  title: string;
  status: WorkStatus;
  goal: string | null;
  deadlineDate: Date | null;
  calendarEventId: string | null;
  notes: string | null;
  searchEnabled: boolean;
}
export interface TaskLinkValues {
  contextId: string;
  projectId: string | null;
  taskId: string;
}
export interface TimeValues {
  contextId: string;
  projectId: string | null;
  taskId: string | null;
  kind: WorkTimeKind;
  title: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  notes: string | null;
}
export type WorkChanges<T> = Partial<T> & { archivedAt?: Date | null };

export interface WorkRepository {
  getOverview(
    userId: string,
    filters: WorkFilters,
  ): Promise<WorkOverviewResponse>;
  createContext(
    userId: string,
    values: ContextValues,
  ): Promise<WorkContextResponse>;
  updateContext(
    userId: string,
    id: string,
    changes: WorkChanges<ContextValues>,
  ): Promise<WorkContextResponse>;
  createProject(
    userId: string,
    values: ProjectValues,
  ): Promise<WorkProjectResponse>;
  updateProject(
    userId: string,
    id: string,
    changes: WorkChanges<ProjectValues>,
  ): Promise<WorkProjectResponse>;
  createTaskLink(
    userId: string,
    values: TaskLinkValues,
  ): Promise<WorkTaskLinkResponse>;
  deleteTaskLink(userId: string, id: string): Promise<void>;
  createTimeEntry(
    userId: string,
    values: TimeValues,
  ): Promise<WorkTimeEntryResponse>;
  updateTimeEntry(
    userId: string,
    id: string,
    changes: WorkChanges<TimeValues>,
  ): Promise<WorkTimeEntryResponse>;
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
const day = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
const mapContext = (record: WorkContextModel): WorkContextResponse => ({
  ...common(record),
  title: record.title,
  role: record.role,
  organization: record.organization,
  startsOn: day(record.startsOn),
  endsOn: day(record.endsOn),
  timezone: record.timezone,
  status: record.status,
  notes: record.notes,
});
const mapProject = (record: WorkProjectModel): WorkProjectResponse => ({
  ...common(record),
  contextId: record.contextId,
  title: record.title,
  status: record.status,
  goal: record.goal,
  deadlineDate: day(record.deadlineDate),
  calendarEventId: record.calendarEventId,
  notes: record.notes,
  searchEnabled: record.searchEnabled,
});
const mapTaskLink = (record: WorkTaskLinkModel): WorkTaskLinkResponse => ({
  id: record.id,
  ownerId: record.userId,
  contextId: record.contextId,
  projectId: record.projectId,
  taskId: record.taskId,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});
const mapTimeEntry = (record: WorkTimeEntryModel): WorkTimeEntryResponse => ({
  ...common(record),
  contextId: record.contextId,
  projectId: record.projectId,
  taskId: record.taskId,
  kind: record.kind,
  title: record.title,
  startsAt: record.startsAt.toISOString(),
  endsAt: record.endsAt.toISOString(),
  timezone: record.timezone,
  durationMinutes: Math.round(
    (record.endsAt.getTime() - record.startsAt.getTime()) / 60_000,
  ),
  notes: record.notes,
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
const mapAudit = (event: AuditEventModel): WorkAuditResponse => ({
  id: event.id,
  action: event.action as WorkAuditResponse["action"],
  entityType: event.entityType as WorkAuditResponse["entityType"],
  entityId: event.entityId,
  changedFields: changedFields(event.metadata),
  occurredAt: event.occurredAt.toISOString(),
});

type WorkTransaction = Pick<
  DatabaseClient,
  | "workContext"
  | "workProject"
  | "workTaskLink"
  | "workTimeEntry"
  | "task"
  | "calendarEvent"
  | "auditEvent"
>;

export class PrismaWorkRepository implements WorkRepository {
  constructor(private readonly database: DatabaseClient) {}

  async getOverview(
    userId: string,
    filters: WorkFilters,
  ): Promise<WorkOverviewResponse> {
    const active = filters.includeArchived ? {} : { archivedAt: null };
    const context = filters.contextId ? { contextId: filters.contextId } : {};
    const status = filters.status ? { status: filters.status } : {};
    const timeWindow = {
      ...(filters.from ? { endsAt: { gt: filters.from } } : {}),
      ...(filters.to ? { startsAt: { lt: filters.to } } : {}),
    };
    const [contexts, projects, taskLinks, timeEntries, history] =
      await Promise.all([
        this.database.workContext.findMany({
          where: {
            userId,
            ...active,
            ...status,
            ...(filters.contextId ? { id: filters.contextId } : {}),
          },
          orderBy: [
            { startsOn: { sort: "desc", nulls: "last" } },
            { createdAt: "asc" },
          ],
        }),
        this.database.workProject.findMany({
          where: { userId, ...active, ...context, ...status },
          orderBy: [
            { deadlineDate: { sort: "asc", nulls: "last" } },
            { createdAt: "asc" },
          ],
        }),
        this.database.workTaskLink.findMany({
          where: { userId, ...context },
          orderBy: { createdAt: "asc" },
        }),
        this.database.workTimeEntry.findMany({
          where: { userId, ...active, ...context, ...timeWindow },
          orderBy: { startsAt: "asc" },
        }),
        this.database.auditEvent.findMany({
          where: {
            userId,
            entityType: {
              in: [
                "WorkContext",
                "WorkProject",
                "WorkTaskLink",
                "WorkTimeEntry",
              ],
            },
          },
          orderBy: { occurredAt: "desc" },
          take: 50,
        }),
      ]);
    return {
      contexts: contexts.map(mapContext),
      projects: projects.map(mapProject),
      taskLinks: taskLinks.map(mapTaskLink),
      timeEntries: timeEntries.map(mapTimeEntry),
      history: history.map(mapAudit),
    };
  }

  async createContext(userId: string, values: ContextValues) {
    return this.database.$transaction(async (tx) => {
      const record = await tx.workContext.create({
        data: { userId, ...values },
      });
      await this.audit(
        tx,
        userId,
        "work.context.created",
        "WorkContext",
        record.id,
      );
      return mapContext(record);
    });
  }
  async updateContext(
    userId: string,
    id: string,
    changes: WorkChanges<ContextValues>,
  ) {
    return this.database.$transaction(async (tx) => {
      if (!(await tx.workContext.findFirst({ where: { id, userId } })))
        throw new WorkRecordNotFoundError();
      const record = await tx.workContext.update({
        where: { id },
        data: changes,
      });
      await this.audit(
        tx,
        userId,
        "work.context.updated",
        "WorkContext",
        id,
        changes,
      );
      return mapContext(record);
    });
  }
  async createProject(userId: string, values: ProjectValues) {
    return this.database.$transaction(async (tx) => {
      await this.requireProjectReferences(tx, userId, values);
      const record = await tx.workProject.create({
        data: { userId, ...values },
      });
      await this.audit(
        tx,
        userId,
        "work.project.created",
        "WorkProject",
        record.id,
      );
      return mapProject(record);
    });
  }
  async updateProject(
    userId: string,
    id: string,
    changes: WorkChanges<ProjectValues>,
  ) {
    return this.database.$transaction(async (tx) => {
      const current = await tx.workProject.findFirst({ where: { id, userId } });
      if (!current) throw new WorkRecordNotFoundError();
      await this.requireProjectReferences(tx, userId, {
        contextId: changes.contextId ?? current.contextId,
        calendarEventId: Object.hasOwn(changes, "calendarEventId")
          ? (changes.calendarEventId ?? null)
          : current.calendarEventId,
      });
      const record = await tx.workProject.update({
        where: { id },
        data: changes,
      });
      await this.audit(
        tx,
        userId,
        "work.project.updated",
        "WorkProject",
        id,
        changes,
      );
      return mapProject(record);
    });
  }
  async createTaskLink(userId: string, values: TaskLinkValues) {
    return this.database.$transaction(async (tx) => {
      await this.requireWorkReferences(tx, userId, values);
      try {
        const record = await tx.workTaskLink.create({
          data: { userId, ...values },
        });
        await this.audit(
          tx,
          userId,
          "work.task-linked",
          "WorkTaskLink",
          record.id,
        );
        return mapTaskLink(record);
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "P2002"
        )
          throw new WorkTaskAlreadyLinkedError();
        throw error;
      }
    });
  }
  async deleteTaskLink(userId: string, id: string) {
    await this.database.$transaction(async (tx) => {
      if (!(await tx.workTaskLink.findFirst({ where: { id, userId } })))
        throw new WorkRecordNotFoundError();
      await tx.workTaskLink.delete({ where: { id } });
      await this.audit(tx, userId, "work.task-unlinked", "WorkTaskLink", id);
    });
  }
  async createTimeEntry(userId: string, values: TimeValues) {
    return this.database.$transaction(async (tx) => {
      await this.requireWorkReferences(tx, userId, values);
      const record = await tx.workTimeEntry.create({
        data: { userId, ...values },
      });
      await this.audit(
        tx,
        userId,
        "work.time.created",
        "WorkTimeEntry",
        record.id,
      );
      return mapTimeEntry(record);
    });
  }
  async updateTimeEntry(
    userId: string,
    id: string,
    changes: WorkChanges<TimeValues>,
  ) {
    return this.database.$transaction(async (tx) => {
      const current = await tx.workTimeEntry.findFirst({
        where: { id, userId },
      });
      if (!current) throw new WorkRecordNotFoundError();
      await this.requireWorkReferences(tx, userId, {
        contextId: changes.contextId ?? current.contextId,
        projectId: Object.hasOwn(changes, "projectId")
          ? (changes.projectId ?? null)
          : current.projectId,
        taskId: Object.hasOwn(changes, "taskId")
          ? (changes.taskId ?? null)
          : current.taskId,
      });
      const record = await tx.workTimeEntry.update({
        where: { id },
        data: changes,
      });
      await this.audit(
        tx,
        userId,
        "work.time.updated",
        "WorkTimeEntry",
        id,
        changes,
      );
      return mapTimeEntry(record);
    });
  }

  private async requireProjectReferences(
    tx: WorkTransaction,
    userId: string,
    values: Pick<ProjectValues, "contextId" | "calendarEventId">,
  ) {
    const [context, event] = await Promise.all([
      tx.workContext.findFirst({
        where: { id: values.contextId, userId, archivedAt: null },
      }),
      values.calendarEventId
        ? tx.calendarEvent.findFirst({
            where: { id: values.calendarEventId, userId, deletedAt: null },
          })
        : Promise.resolve(true),
    ]);
    if (!context || !event) throw new WorkReferenceNotFoundError();
  }
  private async requireWorkReferences(
    tx: WorkTransaction,
    userId: string,
    values:
      | Pick<TaskLinkValues, "contextId" | "projectId" | "taskId">
      | Pick<TimeValues, "contextId" | "projectId" | "taskId">,
  ) {
    const [context, project, task] = await Promise.all([
      tx.workContext.findFirst({
        where: { id: values.contextId, userId, archivedAt: null },
      }),
      values.projectId
        ? tx.workProject.findFirst({
            where: {
              id: values.projectId,
              contextId: values.contextId,
              userId,
              archivedAt: null,
            },
          })
        : Promise.resolve(true),
      values.taskId
        ? tx.task.findFirst({
            where: {
              id: values.taskId,
              userId,
              area: "work",
              archivedAt: null,
              deletedAt: null,
            },
          })
        : Promise.resolve(true),
    ]);
    if (!context || !project || !task) throw new WorkReferenceNotFoundError();
  }
  private audit(
    tx: WorkTransaction,
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
