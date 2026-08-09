import type {
  AvailabilityWindowModel,
  CalendarEventModel,
  DatabaseClient,
  StudyEntryModel,
  TaskModel,
  UserSettingsModel,
  WorkProjectModel,
  WorkTimeEntryModel,
} from "@lifeos/database";
import type {
  AvailabilityWindowResponse,
  CreateAvailabilityWindowRequest,
  UpdateAvailabilityWindowRequest,
} from "@lifeos/contracts";

export class AvailabilityNotFoundError extends Error {}
export class AvailabilityConflictError extends Error {}

export interface PlanningSourceData {
  settings: UserSettingsModel | null;
  events: CalendarEventModel[];
  tasks: TaskModel[];
  studyEntries: StudyEntryModel[];
  workProjects: WorkProjectModel[];
  workTimeEntries: WorkTimeEntryModel[];
  availabilityWindows: AvailabilityWindowModel[];
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
      workTimeEntries,
      availabilityWindows,
    ] = await Promise.all([
      this.database.userSettings.findUnique({ where: { userId } }),
      this.database.calendarEvent.findMany({
        where: { userId, deletedAt: null },
        orderBy: [
          { startDate: { sort: "asc", nulls: "last" } },
          { startsAt: { sort: "asc", nulls: "last" } },
        ],
      }),
      this.database.task.findMany({
        where: { userId, deletedAt: null, archivedAt: null },
        orderBy: { dueDate: { sort: "asc", nulls: "last" } },
      }),
      this.database.studyEntry.findMany({
        where: { userId, archivedAt: null },
        orderBy: [
          { dueDate: { sort: "asc", nulls: "last" } },
          { startsAt: { sort: "asc", nulls: "last" } },
        ],
      }),
      this.database.workProject.findMany({
        where: { userId, archivedAt: null },
        orderBy: { deadlineDate: { sort: "asc", nulls: "last" } },
      }),
      this.database.workTimeEntry.findMany({
        where: { userId, archivedAt: null },
        orderBy: { startsAt: "asc" },
      }),
      this.database.availabilityWindow.findMany({
        where: { userId },
        orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
      }),
    ]);
    return {
      settings,
      events,
      tasks,
      studyEntries,
      workProjects,
      workTimeEntries,
      availabilityWindows,
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
