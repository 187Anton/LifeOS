import type { DatabaseClient } from "@lifeos/database";
import type {
  TaskArea,
  TaskPriority,
  TaskResponse,
  TaskStatus,
} from "@lifeos/contracts";

export interface TaskListFilters {
  status?: TaskStatus;
  priority?: TaskPriority;
  area?: TaskArea;
  /**
   * UUID eines eigenen Moduls oder `null` für Aufgaben ohne Modulbezug
   * (`none` in der Abfrage). Ohne Angabe wird nicht nach Modul gefiltert.
   */
  studyModuleId?: string | null;
  includeArchived: boolean;
}

export interface TaskValues {
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  scheduledStartAt: Date | null;
  scheduledStartTimezone: string | null;
  estimatedDurationMinutes: number | null;
  tags: string[];
  area: TaskArea;
  projectId: string | null;
  studyModuleId: string | null;
  parentTaskId: string | null;
  completedAt: Date | null;
}

export interface TaskChanges extends Partial<TaskValues> {
  archivedAt?: Date | null;
}

export interface TaskRepository {
  listTasks(userId: string, filters: TaskListFilters): Promise<TaskResponse[]>;
  getTask(userId: string, taskId: string): Promise<TaskResponse>;
  createTask(userId: string, values: TaskValues): Promise<TaskResponse>;
  updateTask(
    userId: string,
    taskId: string,
    changes: TaskChanges,
  ): Promise<TaskResponse>;
  deleteTask(userId: string, taskId: string): Promise<void>;
}

export class TaskNotFoundError extends Error {}
export class ProjectNotFoundError extends Error {}
export class ParentTaskNotFoundError extends Error {}
export class TaskHierarchyConflictError extends Error {}
/**
 * Das gewählte Studienmodul ist fremd, archiviert oder nicht vorhanden. Ein
 * bereits gesetzter, inzwischen archivierter Bezug wird dadurch nicht
 * ungültig; er darf unverändert bleiben oder ausdrücklich entfernt werden.
 */
export class StudyModuleNotFoundError extends Error {}

type TaskRecord = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  scheduledStartAt: Date | null;
  scheduledStartTimezone: string | null;
  estimatedDurationMinutes: number | null;
  tags: string[];
  area: TaskArea;
  projectId: string | null;
  studyModuleId: string | null;
  parentTaskId: string | null;
  completedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export const mapTask = (task: TaskRecord): TaskResponse => ({
  id: task.id,
  ownerId: task.userId,
  title: task.title,
  description: task.description,
  status: task.status,
  priority: task.priority,
  dueDate: task.dueDate?.toISOString().slice(0, 10) ?? null,
  scheduledStartAt: task.scheduledStartAt?.toISOString() ?? null,
  scheduledStartTimezone: task.scheduledStartTimezone,
  estimatedDurationMinutes: task.estimatedDurationMinutes,
  tags: task.tags,
  area: task.area,
  projectId: task.projectId,
  studyModuleId: task.studyModuleId,
  parentTaskId: task.parentTaskId,
  completedAt: task.completedAt?.toISOString() ?? null,
  archivedAt: task.archivedAt?.toISOString() ?? null,
  createdAt: task.createdAt.toISOString(),
  updatedAt: task.updatedAt.toISOString(),
});

type TaskTransaction = Pick<
  DatabaseClient,
  "task" | "project" | "studyModule" | "auditEvent"
>;

export class PrismaTaskRepository implements TaskRepository {
  constructor(private readonly database: DatabaseClient) {}

  async listTasks(
    userId: string,
    filters: TaskListFilters,
  ): Promise<TaskResponse[]> {
    const tasks = await this.database.task.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(filters.includeArchived ? {} : { archivedAt: null }),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.priority ? { priority: filters.priority } : {}),
        ...(filters.area ? { area: filters.area } : {}),
        ...(Object.hasOwn(filters, "studyModuleId")
          ? { studyModuleId: filters.studyModuleId ?? null }
          : {}),
      },
      orderBy: [
        { dueDate: { sort: "asc", nulls: "last" } },
        { priority: "desc" },
        { createdAt: "asc" },
      ],
    });
    return tasks.map((task) => mapTask(task as TaskRecord));
  }

  async getTask(userId: string, taskId: string): Promise<TaskResponse> {
    const task = await this.database.task.findFirst({
      where: { id: taskId, userId, deletedAt: null },
    });
    if (!task) throw new TaskNotFoundError();
    return mapTask(task as TaskRecord);
  }

  async createTask(userId: string, values: TaskValues): Promise<TaskResponse> {
    return this.database.$transaction(async (transaction) => {
      await this.validateParent(
        transaction,
        userId,
        undefined,
        values.parentTaskId,
      );
      await this.validateProject(transaction, userId, values.projectId);
      await this.validateStudyModule(transaction, userId, values.studyModuleId);
      const task = await transaction.task.create({
        data: { ...values, userId },
      });
      await transaction.auditEvent.create({
        data: {
          userId,
          action: "task.created",
          entityType: "Task",
          entityId: task.id,
        },
      });
      return mapTask(task as TaskRecord);
    });
  }

  async updateTask(
    userId: string,
    taskId: string,
    changes: TaskChanges,
  ): Promise<TaskResponse> {
    return this.database.$transaction(async (transaction) => {
      const current = await transaction.task.findFirst({
        where: { id: taskId, userId, deletedAt: null },
      });
      if (!current) throw new TaskNotFoundError();
      if (Object.hasOwn(changes, "parentTaskId")) {
        await this.validateParent(
          transaction,
          userId,
          taskId,
          changes.parentTaskId ?? null,
        );
      }
      if (Object.hasOwn(changes, "projectId")) {
        await this.validateProject(
          transaction,
          userId,
          changes.projectId ?? null,
        );
      }
      if (
        Object.hasOwn(changes, "studyModuleId") &&
        (changes.studyModuleId ?? null) !== current.studyModuleId
      ) {
        // Ein unveränderter Bezug bleibt auch bei archiviertem Modul gültig;
        // nur eine echte Neuzuordnung wird geprüft.
        await this.validateStudyModule(
          transaction,
          userId,
          changes.studyModuleId ?? null,
        );
      }
      const task = await transaction.task.update({
        where: { id: current.id },
        data: changes,
      });
      await transaction.auditEvent.create({
        data: {
          userId,
          action: "task.updated",
          entityType: "Task",
          entityId: task.id,
          metadata: { changedFields: Object.keys(changes).sort() },
        },
      });
      return mapTask(task as TaskRecord);
    });
  }

  async deleteTask(userId: string, taskId: string): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const current = await transaction.task.findFirst({
        where: { id: taskId, userId, deletedAt: null },
      });
      if (!current) throw new TaskNotFoundError();
      await transaction.task.update({
        where: { id: current.id },
        data: { deletedAt: new Date() },
      });
      await transaction.auditEvent.create({
        data: {
          userId,
          action: "task.deleted",
          entityType: "Task",
          entityId: current.id,
        },
      });
    });
  }

  private async validateParent(
    transaction: TaskTransaction,
    userId: string,
    taskId: string | undefined,
    parentTaskId: string | null,
  ): Promise<void> {
    if (!parentTaskId) return;

    let currentId: string | null = parentTaskId;
    for (let depth = 0; currentId && depth < 100; depth += 1) {
      if (currentId === taskId) throw new TaskHierarchyConflictError();
      const parent: { id: string; parentTaskId: string | null } | null =
        await transaction.task.findFirst({
          where: { id: currentId, userId, deletedAt: null },
          select: { id: true, parentTaskId: true },
        });
      if (!parent) throw new ParentTaskNotFoundError();
      currentId = parent.parentTaskId;
    }
    if (currentId) throw new TaskHierarchyConflictError();
  }

  private async validateProject(
    transaction: TaskTransaction,
    userId: string,
    projectId: string | null,
  ): Promise<void> {
    if (!projectId) return;
    const project = await transaction.project.findFirst({
      where: { id: projectId, userId, archivedAt: null, deletedAt: null },
      select: { id: true },
    });
    if (!project) throw new ProjectNotFoundError();
  }

  /**
   * Neue Zuordnungen dürfen ausschließlich auf ein vorhandenes, nicht
   * archiviertes Modul desselben Besitzers zeigen. Die Besitzergrenze wird
   * zusätzlich durch den zusammengesetzten Fremdschlüssel in der Datenbank
   * abgesichert.
   */
  private async validateStudyModule(
    transaction: TaskTransaction,
    userId: string,
    studyModuleId: string | null,
  ): Promise<void> {
    if (!studyModuleId) return;
    const module = await transaction.studyModule.findFirst({
      where: { id: studyModuleId, userId, archivedAt: null },
      select: { id: true },
    });
    if (!module) throw new StudyModuleNotFoundError();
  }
}
