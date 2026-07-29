import type {
  CreateTaskRequest,
  TaskResponse,
  TaskStatus,
  UpdateTaskRequest,
} from "@lifeos/contracts";

import { ApiError } from "../../errors.js";
import {
  ParentTaskNotFoundError,
  ProjectNotFoundError,
  TaskHierarchyConflictError,
  TaskNotFoundError,
  type TaskChanges,
  type TaskListFilters,
  type TaskRepository,
  type TaskValues,
} from "./repository.js";

const transitions: Record<TaskStatus, ReadonlySet<TaskStatus>> = {
  open: new Set(["in_progress", "blocked", "done", "cancelled"]),
  in_progress: new Set(["open", "blocked", "done", "cancelled"]),
  blocked: new Set(["open", "in_progress", "done", "cancelled"]),
  done: new Set(["open"]),
  cancelled: new Set(["open"]),
};

const parseDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`);
};

const parseTimestamp = (value: string | null | undefined): Date | null =>
  value ? new Date(value) : null;

const normalizeTags = (values: string[] | undefined): string[] => [
  ...new Set((values ?? []).map((value) => value.trim())),
];

const createValues = (input: CreateTaskRequest, now: Date): TaskValues => {
  const status = input.status ?? "open";
  return {
    title: input.title,
    description: input.description ?? null,
    status,
    priority: input.priority ?? "medium",
    dueDate: parseDate(input.dueDate),
    scheduledStartAt: parseTimestamp(input.scheduledStartAt),
    scheduledStartTimezone: input.scheduledStartTimezone ?? null,
    estimatedDurationMinutes: input.estimatedDurationMinutes ?? null,
    tags: normalizeTags(input.tags),
    area: input.area ?? "personal",
    projectId: input.projectId ?? null,
    parentTaskId: input.parentTaskId ?? null,
    completedAt: status === "done" ? now : null,
  };
};

const hasOwn = <Key extends keyof UpdateTaskRequest>(
  value: UpdateTaskRequest,
  key: Key,
): value is UpdateTaskRequest & Required<Pick<UpdateTaskRequest, Key>> =>
  Object.hasOwn(value, key);

export class TaskService {
  constructor(
    private readonly repository: TaskRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  listTasks(userId: string, filters: TaskListFilters) {
    return this.repository.listTasks(userId, filters);
  }

  async getTask(userId: string, taskId: string) {
    try {
      return await this.repository.getTask(userId, taskId);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async createTask(userId: string, input: CreateTaskRequest) {
    try {
      return await this.repository.createTask(
        userId,
        createValues(input, this.now()),
      );
    } catch (error) {
      this.rethrow(error);
    }
  }

  async updateTask(userId: string, taskId: string, input: UpdateTaskRequest) {
    try {
      const current = await this.repository.getTask(userId, taskId);
      const changes = this.updateValues(current, input);
      return await this.repository.updateTask(userId, taskId, changes);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async deleteTask(userId: string, taskId: string) {
    try {
      await this.repository.deleteTask(userId, taskId);
    } catch (error) {
      this.rethrow(error);
    }
  }

  private updateValues(
    current: TaskResponse,
    input: UpdateTaskRequest,
  ): TaskChanges {
    const changes: TaskChanges = {};
    if (hasOwn(input, "title")) changes.title = input.title;
    if (hasOwn(input, "description"))
      changes.description = input.description ?? null;
    if (hasOwn(input, "priority")) changes.priority = input.priority;
    if (hasOwn(input, "dueDate")) changes.dueDate = parseDate(input.dueDate);
    if (hasOwn(input, "scheduledStartAt"))
      changes.scheduledStartAt = parseTimestamp(input.scheduledStartAt);
    if (hasOwn(input, "scheduledStartTimezone"))
      changes.scheduledStartTimezone = input.scheduledStartTimezone ?? null;
    if (hasOwn(input, "estimatedDurationMinutes"))
      changes.estimatedDurationMinutes = input.estimatedDurationMinutes ?? null;
    if (hasOwn(input, "tags")) changes.tags = normalizeTags(input.tags);
    if (hasOwn(input, "area")) changes.area = input.area;
    if (hasOwn(input, "projectId")) changes.projectId = input.projectId ?? null;
    if (hasOwn(input, "parentTaskId"))
      changes.parentTaskId = input.parentTaskId ?? null;
    if (hasOwn(input, "archived"))
      changes.archivedAt = input.archived ? this.now() : null;

    if (hasOwn(input, "status") && input.status !== current.status) {
      if (!transitions[current.status].has(input.status)) {
        throw new ApiError(
          409,
          "CONFLICT",
          "Dieser Aufgabenstatus kann nicht direkt gesetzt werden.",
        );
      }
      changes.status = input.status;
      changes.completedAt = input.status === "done" ? this.now() : null;
    }
    return changes;
  }

  private rethrow(error: unknown): never {
    if (error instanceof ApiError) throw error;
    if (error instanceof TaskNotFoundError) {
      throw new ApiError(404, "NOT_FOUND", "Die Aufgabe wurde nicht gefunden.");
    }
    if (error instanceof ParentTaskNotFoundError) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Die übergeordnete Aufgabe ist nicht verfügbar.",
        [
          {
            field: "body.parentTaskId",
            message: "Ungültiger Wert.",
          },
        ],
      );
    }
    if (error instanceof ProjectNotFoundError) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Das Projekt ist nicht verfügbar.",
        [
          {
            field: "body.projectId",
            message: "Ungültiger Wert.",
          },
        ],
      );
    }
    if (error instanceof TaskHierarchyConflictError) {
      throw new ApiError(
        409,
        "CONFLICT",
        "Die Aufgabenhierarchie würde einen Zyklus erzeugen.",
      );
    }
    throw error;
  }
}
