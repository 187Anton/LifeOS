import type { DatabaseClient } from "@lifeos/database";
import type {
  ProjectDetailResponse,
  ProjectEventSummaryResponse,
  ProjectItemResponse,
  ProjectItemStatus,
  ProjectOverviewResponse,
  ProjectResponse,
  ProjectStatus,
} from "@lifeos/contracts";

import { calculateProjectProgress } from "./progress.js";

export class ProjectRecordNotFoundError extends Error {}
export class ProjectReferenceNotFoundError extends Error {}
export class ProjectLinkConflictError extends Error {}

export interface ProjectValues {
  title: string;
  description: string | null;
  status: ProjectStatus;
  risk: string | null;
  dueDate: Date | null;
}
export interface ProjectItemValues {
  title: string;
  description: string | null;
  status: ProjectItemStatus;
  risk: string | null;
  dueDate: Date | null;
}
export type ProjectChanges<T> = Partial<T> & { archivedAt?: Date | null };

type ProjectRecord = ProjectValues & {
  id: string;
  userId: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
type ProjectItemRecord = ProjectItemValues & {
  id: string;
  userId: string;
  projectId: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
type ProgressRecord = {
  status: string;
  archivedAt: Date | null;
  deletedAt: Date | null;
};

const day = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
const mapProject = (record: ProjectRecord): ProjectResponse => ({
  id: record.id,
  ownerId: record.userId,
  title: record.title,
  description: record.description,
  status: record.status,
  risk: record.risk,
  dueDate: day(record.dueDate),
  archivedAt: record.archivedAt?.toISOString() ?? null,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});
const mapItem = (record: ProjectItemRecord): ProjectItemResponse => ({
  id: record.id,
  ownerId: record.userId,
  projectId: record.projectId,
  title: record.title,
  description: record.description,
  status: record.status,
  risk: record.risk,
  dueDate: day(record.dueDate),
  archivedAt: record.archivedAt?.toISOString() ?? null,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export interface ProjectRepository {
  listProjects(
    userId: string,
    includeArchived: boolean,
  ): Promise<ProjectOverviewResponse>;
  getProject(userId: string, projectId: string): Promise<ProjectDetailResponse>;
  createProject(
    userId: string,
    values: ProjectValues,
  ): Promise<ProjectResponse>;
  updateProject(
    userId: string,
    projectId: string,
    changes: ProjectChanges<ProjectValues>,
  ): Promise<ProjectResponse>;
  deleteProject(
    userId: string,
    projectId: string,
    deletedAt: Date,
  ): Promise<void>;
  createItem(
    userId: string,
    projectId: string,
    kind: "goal" | "milestone",
    values: ProjectItemValues,
  ): Promise<ProjectItemResponse>;
  updateItem(
    userId: string,
    projectId: string,
    itemId: string,
    kind: "goal" | "milestone",
    changes: ProjectChanges<ProjectItemValues>,
  ): Promise<ProjectItemResponse>;
  deleteItem(
    userId: string,
    projectId: string,
    itemId: string,
    kind: "goal" | "milestone",
    deletedAt: Date,
  ): Promise<void>;
  linkTask(userId: string, projectId: string, taskId: string): Promise<void>;
  unlinkTask(userId: string, projectId: string, taskId: string): Promise<void>;
  linkEvent(
    userId: string,
    projectId: string,
    calendarId: string,
    eventUid: string,
  ): Promise<ProjectEventSummaryResponse>;
  unlinkEvent(
    userId: string,
    projectId: string,
    calendarId: string,
    eventUid: string,
  ): Promise<void>;
}

export class PrismaProjectRepository implements ProjectRepository {
  constructor(private readonly database: DatabaseClient) {}

  async listProjects(
    userId: string,
    includeArchived: boolean,
  ): Promise<ProjectOverviewResponse> {
    const records = await this.database.project.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      include: {
        goals: { select: { status: true, archivedAt: true, deletedAt: true } },
        milestones: {
          select: { status: true, archivedAt: true, deletedAt: true },
        },
        tasks: { select: { status: true, archivedAt: true, deletedAt: true } },
      },
      orderBy: [
        { dueDate: { sort: "asc", nulls: "last" } },
        { createdAt: "asc" },
      ],
    });
    return {
      projects: records.map((record) => ({
        ...mapProject(record as ProjectRecord),
        progress: calculateProjectProgress({
          goals: record.goals as ProgressRecord[],
          milestones: record.milestones as ProgressRecord[],
          tasks: record.tasks as ProgressRecord[],
        }),
      })),
    };
  }

  async getProject(
    userId: string,
    projectId: string,
  ): Promise<ProjectDetailResponse> {
    const record = await this.database.project.findFirst({
      where: { id: projectId, userId, deletedAt: null },
      include: {
        goals: {
          where: { deletedAt: null },
          orderBy: [
            { dueDate: { sort: "asc", nulls: "last" } },
            { createdAt: "asc" },
          ],
        },
        milestones: {
          where: { deletedAt: null },
          orderBy: [
            { dueDate: { sort: "asc", nulls: "last" } },
            { createdAt: "asc" },
          ],
        },
        tasks: {
          where: { deletedAt: null },
          orderBy: [
            { dueDate: { sort: "asc", nulls: "last" } },
            { createdAt: "asc" },
          ],
        },
        eventLinks: {
          include: {
            calendarEvent: {
              include: { calendar: { select: { externalId: true } } },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!record) throw new ProjectRecordNotFoundError();
    return {
      project: mapProject(record as ProjectRecord),
      goals: record.goals.map((item) => mapItem(item as ProjectItemRecord)),
      milestones: record.milestones.map((item) =>
        mapItem(item as ProjectItemRecord),
      ),
      tasks: record.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        dueDate: day(task.dueDate),
      })),
      calendarEvents: record.eventLinks
        .filter((link) => link.calendarEvent.deletedAt === null)
        .map((link) => ({
          calendarId: link.calendarEvent.calendar.externalId,
          uid: link.calendarEvent.uid,
          title: link.calendarEvent.title,
          startsAt: link.calendarEvent.startsAt?.toISOString() ?? null,
          startDate: day(link.calendarEvent.startDate),
          etag: link.calendarEvent.etag,
        })),
      progress: calculateProjectProgress({
        goals: record.goals as ProgressRecord[],
        milestones: record.milestones as ProgressRecord[],
        tasks: record.tasks as ProgressRecord[],
      }),
    };
  }

  async createProject(userId: string, values: ProjectValues) {
    return this.database.$transaction(async (tx) => {
      const record = await tx.project.create({ data: { userId, ...values } });
      await this.audit(tx, userId, "project.created", "Project", record.id);
      return mapProject(record as ProjectRecord);
    });
  }

  async updateProject(
    userId: string,
    projectId: string,
    changes: ProjectChanges<ProjectValues>,
  ) {
    return this.database.$transaction(async (tx) => {
      await this.requireProject(tx, userId, projectId);
      const record = await tx.project.update({
        where: { id: projectId },
        data: changes,
      });
      await this.audit(
        tx,
        userId,
        "project.updated",
        "Project",
        projectId,
        changes,
      );
      return mapProject(record as ProjectRecord);
    });
  }

  async deleteProject(userId: string, projectId: string, deletedAt: Date) {
    await this.database.$transaction(async (tx) => {
      await this.requireProject(tx, userId, projectId);
      await tx.project.update({
        where: { id: projectId },
        data: { deletedAt },
      });
      await this.audit(tx, userId, "project.deleted", "Project", projectId);
    });
  }

  async createItem(
    userId: string,
    projectId: string,
    kind: "goal" | "milestone",
    values: ProjectItemValues,
  ) {
    return this.database.$transaction(async (tx) => {
      await this.requireProject(tx, userId, projectId);
      const record =
        kind === "goal"
          ? await tx.projectGoal.create({
              data: { userId, projectId, ...values },
            })
          : await tx.projectMilestone.create({
              data: { userId, projectId, ...values },
            });
      await this.audit(
        tx,
        userId,
        `project.${kind}.created`,
        kind === "goal" ? "ProjectGoal" : "ProjectMilestone",
        record.id,
      );
      return mapItem(record as ProjectItemRecord);
    });
  }

  async updateItem(
    userId: string,
    projectId: string,
    itemId: string,
    kind: "goal" | "milestone",
    changes: ProjectChanges<ProjectItemValues>,
  ) {
    return this.database.$transaction(async (tx) => {
      await this.requireProject(tx, userId, projectId);
      const existing =
        kind === "goal"
          ? await tx.projectGoal.findFirst({
              where: { id: itemId, projectId, userId, deletedAt: null },
            })
          : await tx.projectMilestone.findFirst({
              where: { id: itemId, projectId, userId, deletedAt: null },
            });
      if (!existing) throw new ProjectRecordNotFoundError();
      const record =
        kind === "goal"
          ? await tx.projectGoal.update({
              where: { id: itemId },
              data: changes,
            })
          : await tx.projectMilestone.update({
              where: { id: itemId },
              data: changes,
            });
      await this.audit(
        tx,
        userId,
        `project.${kind}.updated`,
        kind === "goal" ? "ProjectGoal" : "ProjectMilestone",
        itemId,
        changes,
      );
      return mapItem(record as ProjectItemRecord);
    });
  }

  async deleteItem(
    userId: string,
    projectId: string,
    itemId: string,
    kind: "goal" | "milestone",
    deletedAt: Date,
  ) {
    await this.database.$transaction(async (tx) => {
      await this.requireProject(tx, userId, projectId);
      const result =
        kind === "goal"
          ? await tx.projectGoal.updateMany({
              where: { id: itemId, projectId, userId, deletedAt: null },
              data: { deletedAt },
            })
          : await tx.projectMilestone.updateMany({
              where: { id: itemId, projectId, userId, deletedAt: null },
              data: { deletedAt },
            });
      if (result.count !== 1) throw new ProjectRecordNotFoundError();
      await this.audit(
        tx,
        userId,
        `project.${kind}.deleted`,
        kind === "goal" ? "ProjectGoal" : "ProjectMilestone",
        itemId,
      );
    });
  }

  async linkTask(userId: string, projectId: string, taskId: string) {
    await this.database.$transaction(async (tx) => {
      await this.requireProject(tx, userId, projectId);
      const task = await tx.task.findFirst({
        where: { id: taskId, userId, deletedAt: null },
      });
      if (!task) throw new ProjectReferenceNotFoundError();
      if (task.projectId && task.projectId !== projectId)
        throw new ProjectLinkConflictError();
      await tx.task.update({ where: { id: taskId }, data: { projectId } });
      await this.audit(tx, userId, "project.task-linked", "Task", taskId, {
        projectId,
      });
    });
  }

  async unlinkTask(userId: string, projectId: string, taskId: string) {
    await this.database.$transaction(async (tx) => {
      await this.requireProject(tx, userId, projectId);
      const result = await tx.task.updateMany({
        where: { id: taskId, userId, projectId, deletedAt: null },
        data: { projectId: null },
      });
      if (result.count !== 1) throw new ProjectReferenceNotFoundError();
      await this.audit(tx, userId, "project.task-unlinked", "Task", taskId, {
        projectId,
      });
    });
  }

  async linkEvent(
    userId: string,
    projectId: string,
    calendarId: string,
    eventUid: string,
  ) {
    return this.database.$transaction(async (tx) => {
      await this.requireProject(tx, userId, projectId);
      const event = await tx.calendarEvent.findFirst({
        where: {
          userId,
          uid: eventUid,
          deletedAt: null,
          calendar: { externalId: calendarId, userId, deletedAt: null },
        },
        include: { calendar: { select: { externalId: true } } },
      });
      if (!event) throw new ProjectReferenceNotFoundError();
      try {
        await tx.projectEventLink.create({
          data: { userId, projectId, calendarEventId: event.id },
        });
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "P2002"
        )
          throw new ProjectLinkConflictError();
        throw error;
      }
      await this.audit(
        tx,
        userId,
        "project.event-linked",
        "CalendarEvent",
        event.id,
        { projectId },
      );
      return {
        calendarId: event.calendar.externalId,
        uid: event.uid,
        title: event.title,
        startsAt: event.startsAt?.toISOString() ?? null,
        startDate: day(event.startDate),
        etag: event.etag,
      };
    });
  }

  async unlinkEvent(
    userId: string,
    projectId: string,
    calendarId: string,
    eventUid: string,
  ) {
    await this.database.$transaction(async (tx) => {
      await this.requireProject(tx, userId, projectId);
      const event = await tx.calendarEvent.findFirst({
        where: {
          userId,
          uid: eventUid,
          calendar: { externalId: calendarId, userId },
        },
        select: { id: true },
      });
      if (!event) throw new ProjectReferenceNotFoundError();
      const result = await tx.projectEventLink.deleteMany({
        where: { userId, projectId, calendarEventId: event.id },
      });
      if (result.count !== 1) throw new ProjectReferenceNotFoundError();
      await this.audit(
        tx,
        userId,
        "project.event-unlinked",
        "CalendarEvent",
        event.id,
        { projectId },
      );
    });
  }

  private async requireProject(
    tx: Pick<DatabaseClient, "project">,
    userId: string,
    projectId: string,
  ) {
    const project = await tx.project.findFirst({
      where: { id: projectId, userId, deletedAt: null },
    });
    if (!project) throw new ProjectRecordNotFoundError();
    return project;
  }

  private audit(
    tx: Pick<DatabaseClient, "auditEvent">,
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
