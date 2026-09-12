import type {
  AvailabilityWindowModel,
  CalendarEventModel,
  DatabaseClient,
  FitnessSessionModel,
  ProjectGoalModel,
  ProjectMilestoneModel,
  ProjectModel,
  StudyEntryModel,
  TaskModel,
  UserSettingsModel,
  WorkProjectModel,
  WorkTaskLinkModel,
  WorkTimeEntryModel,
} from "@lifeos/database";
import type {
  AvailabilityWindowResponse,
  CreateAvailabilityWindowRequest,
  UpdateAvailabilityWindowRequest,
  PlanningSourceType,
} from "@lifeos/contracts";

export class AvailabilityNotFoundError extends Error {}
export class AvailabilityConflictError extends Error {}

export interface PlanningSourceData {
  settings: UserSettingsModel | null;
  events: CalendarEventModel[];
  tasks: TaskModel[];
  studyEntries: StudyEntryModel[];
  workProjects: WorkProjectModel[];
  workTaskLinks: WorkTaskLinkModel[];
  workTimeEntries: WorkTimeEntryModel[];
  projects: ProjectModel[];
  projectGoals: ProjectGoalModel[];
  projectMilestones: ProjectMilestoneModel[];
  fitnessSessions: FitnessSessionModel[];
  availabilityWindows: AvailabilityWindowModel[];
  sourceLimitsExceeded?: PlanningSourceType[];
}

export interface PlanningRepository {
  getSources(userId: string): Promise<PlanningSourceData>;
  createAvailability(
    userId: string,
    input: CreateAvailabilityWindowRequest,
  ): Promise<AvailabilityWindowResponse>;
  updateAvailability(
    userId: string,
    id: string,
    input: UpdateAvailabilityWindowRequest,
  ): Promise<AvailabilityWindowResponse>;
  deleteAvailability(userId: string, id: string): Promise<void>;
}

const mapAvailability = (
  value: AvailabilityWindowModel,
): AvailabilityWindowResponse => ({
  id: value.id,
  ownerId: value.userId,
  weekday: value.weekday,
  startMinute: value.startMinute,
  endMinute: value.endMinute,
  timezone: value.timezone,
  label: value.label,
  createdAt: value.createdAt.toISOString(),
  updatedAt: value.updatedAt.toISOString(),
});

export class PrismaPlanningRepository implements PlanningRepository {
  constructor(private readonly database: DatabaseClient) {}

  async getSources(userId: string): Promise<PlanningSourceData> {
    const [
      settings,
      events,
      tasks,
      studyEntries,
      workProjects,
      workTaskLinks,
      workTimeEntries,
      projects,
      projectGoals,
      projectMilestones,
      fitnessSessions,
      availabilityWindows,
    ] = await Promise.all([
      this.database.userSettings.findUnique({ where: { userId } }),
      this.database.calendarEvent.findMany({
        where: { userId, deletedAt: null, calendar: { deletedAt: null } },
        orderBy: [
          { startDate: { sort: "asc", nulls: "last" } },
          { startsAt: { sort: "asc", nulls: "last" } },
        ],
        take: 501,
      }),
      this.database.task.findMany({
        where: {
          userId,
          deletedAt: null,
          archivedAt: null,
          status: { notIn: ["done", "cancelled"] },
        },
        orderBy: { dueDate: { sort: "asc", nulls: "last" } },
        take: 501,
      }),
      this.database.studyEntry.findMany({
        where: {
          userId,
          archivedAt: null,
          status: { notIn: ["completed", "cancelled"] },
          module: {
            archivedAt: null,
            status: { notIn: ["completed", "cancelled"] },
            program: {
              archivedAt: null,
              status: { notIn: ["completed", "cancelled"] },
            },
          },
        },
        orderBy: [
          { dueDate: { sort: "asc", nulls: "last" } },
          { startsAt: { sort: "asc", nulls: "last" } },
        ],
        take: 501,
      }),
      this.database.workProject.findMany({
        where: {
          userId,
          archivedAt: null,
          status: { notIn: ["completed", "cancelled"] },
          context: {
            archivedAt: null,
            status: { notIn: ["completed", "cancelled"] },
          },
        },
        orderBy: { deadlineDate: { sort: "asc", nulls: "last" } },
        take: 501,
      }),
      this.database.workTaskLink.findMany({
        where: {
          userId,
          task: {
            archivedAt: null,
            deletedAt: null,
            status: { notIn: ["done", "cancelled"] },
          },
          context: {
            archivedAt: null,
            status: { notIn: ["completed", "cancelled"] },
          },
        },
        orderBy: { createdAt: "asc" },
        take: 501,
      }),
      this.database.workTimeEntry.findMany({
        where: {
          userId,
          archivedAt: null,
          context: {
            archivedAt: null,
            status: { notIn: ["completed", "cancelled"] },
          },
        },
        orderBy: { startsAt: "asc" },
        take: 501,
      }),
      this.database.project.findMany({
        where: {
          userId,
          archivedAt: null,
          deletedAt: null,
          status: { notIn: ["completed", "cancelled"] },
        },
        orderBy: { dueDate: { sort: "asc", nulls: "last" } },
        take: 501,
      }),
      this.database.projectGoal.findMany({
        where: {
          userId,
          archivedAt: null,
          deletedAt: null,
          status: { notIn: ["completed", "cancelled"] },
          project: {
            archivedAt: null,
            deletedAt: null,
            status: { notIn: ["completed", "cancelled"] },
          },
        },
        orderBy: { dueDate: { sort: "asc", nulls: "last" } },
        take: 501,
      }),
      this.database.projectMilestone.findMany({
        where: {
          userId,
          archivedAt: null,
          deletedAt: null,
          status: { notIn: ["completed", "cancelled"] },
          project: {
            archivedAt: null,
            deletedAt: null,
            status: { notIn: ["completed", "cancelled"] },
          },
        },
        orderBy: { dueDate: { sort: "asc", nulls: "last" } },
        take: 501,
      }),
      this.database.fitnessSession.findMany({
        where: {
          userId,
          archivedAt: null,
          status: "planned",
          OR: [{ planId: null }, { plan: { archivedAt: null } }],
        },
        orderBy: { performedAt: { sort: "asc", nulls: "last" } },
        take: 501,
      }),
      this.database.availabilityWindow.findMany({
        where: { userId },
        orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
        take: 501,
      }),
    ]);
    const limited = <T>(values: T[]) => values.slice(0, 500);
    const sourceLimitsExceeded: PlanningSourceType[] = [];
    const check = (type: PlanningSourceType, values: unknown[]) => {
      if (values.length > 500) sourceLimitsExceeded.push(type);
    };
    check("calendar_event", events);
    check("task", tasks);
    check("study_entry", studyEntries);
    check("work_project", workProjects);
    check("work_project", workTaskLinks);
    check("work_time", workTimeEntries);
    check("project", projects);
    check("project_goal", projectGoals);
    check("project_milestone", projectMilestones);
    check("fitness_session", fitnessSessions);
    check("availability", availabilityWindows);
    return {
      settings,
      events: limited(events),
      tasks: limited(tasks),
      studyEntries: limited(studyEntries),
      workProjects: limited(workProjects),
      workTaskLinks: limited(workTaskLinks),
      workTimeEntries: limited(workTimeEntries),
      projects: limited(projects),
      projectGoals: limited(projectGoals),
      projectMilestones: limited(projectMilestones),
      fitnessSessions: limited(fitnessSessions),
      availabilityWindows: limited(availabilityWindows),
      sourceLimitsExceeded: [...new Set(sourceLimitsExceeded)],
    };
  }

  async createAvailability(
    userId: string,
    input: CreateAvailabilityWindowRequest,
  ) {
    return this.database.$transaction(async (tx) => {
      try {
        const value = await tx.availabilityWindow.create({
          data: { userId, ...input, label: input.label ?? null },
        });
        await tx.auditEvent.create({
          data: {
            userId,
            action: "planning.availability.created",
            entityType: "AvailabilityWindow",
            entityId: value.id,
          },
        });
        return mapAvailability(value);
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "P2002"
        )
          throw new AvailabilityConflictError();
        throw error;
      }
    });
  }

  async updateAvailability(
    userId: string,
    id: string,
    input: UpdateAvailabilityWindowRequest,
  ) {
    return this.database.$transaction(async (tx) => {
      if (!(await tx.availabilityWindow.findFirst({ where: { id, userId } })))
        throw new AvailabilityNotFoundError();
      try {
        const value = await tx.availabilityWindow.update({
          where: { id },
          data: input,
        });
        await tx.auditEvent.create({
          data: {
            userId,
            action: "planning.availability.updated",
            entityType: "AvailabilityWindow",
            entityId: id,
            metadata: { changedFields: Object.keys(input).sort() },
          },
        });
        return mapAvailability(value);
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "P2002"
        )
          throw new AvailabilityConflictError();
        throw error;
      }
    });
  }

  async deleteAvailability(userId: string, id: string) {
    await this.database.$transaction(async (tx) => {
      if (!(await tx.availabilityWindow.findFirst({ where: { id, userId } })))
        throw new AvailabilityNotFoundError();
      await tx.availabilityWindow.delete({ where: { id } });
      await tx.auditEvent.create({
        data: {
          userId,
          action: "planning.availability.deleted",
          entityType: "AvailabilityWindow",
          entityId: id,
        },
      });
    });
  }
}
