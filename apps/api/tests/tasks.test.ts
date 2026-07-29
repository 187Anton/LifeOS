import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { TaskResponse } from "@lifeos/contracts";

import { ApiError } from "../src/errors.js";
import type {
  TaskChanges,
  TaskListFilters,
  TaskRepository,
  TaskValues,
} from "../src/modules/tasks/repository.js";
import { TaskNotFoundError } from "../src/modules/tasks/repository.js";
import { TaskService } from "../src/modules/tasks/service.js";

class InMemoryTaskRepository implements TaskRepository {
  readonly tasks = new Map<string, TaskResponse>();

  async listTasks(
    userId: string,
    filters: TaskListFilters,
  ): Promise<TaskResponse[]> {
    return [...this.tasks.values()].filter(
      (task) =>
        task.ownerId === userId &&
        (filters.includeArchived || task.archivedAt === null) &&
        (!filters.status || task.status === filters.status) &&
        (!filters.priority || task.priority === filters.priority) &&
        (!filters.area || task.area === filters.area),
    );
  }

  async getTask(userId: string, taskId: string): Promise<TaskResponse> {
    const task = this.tasks.get(taskId);
    if (!task || task.ownerId !== userId) throw new TaskNotFoundError();
    return structuredClone(task);
  }

  async createTask(userId: string, values: TaskValues): Promise<TaskResponse> {
    const timestamp = "2032-01-10T10:00:00.000Z";
    const task: TaskResponse = {
      id: randomUUID(),
      ownerId: userId,
      ...values,
      dueDate: values.dueDate?.toISOString().slice(0, 10) ?? null,
      scheduledStartAt: values.scheduledStartAt?.toISOString() ?? null,
      completedAt: values.completedAt?.toISOString() ?? null,
      archivedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.tasks.set(task.id, task);
    return structuredClone(task);
  }

  async updateTask(
    userId: string,
    taskId: string,
    changes: TaskChanges,
  ): Promise<TaskResponse> {
    const current = await this.getTask(userId, taskId);
    const task: TaskResponse = {
      ...current,
      ...changes,
      dueDate:
        changes.dueDate instanceof Date
          ? changes.dueDate.toISOString().slice(0, 10)
          : changes.dueDate === null
            ? null
            : current.dueDate,
      scheduledStartAt:
        changes.scheduledStartAt instanceof Date
          ? changes.scheduledStartAt.toISOString()
          : changes.scheduledStartAt === null
            ? null
            : current.scheduledStartAt,
      completedAt:
        changes.completedAt instanceof Date
          ? changes.completedAt.toISOString()
          : changes.completedAt === null
            ? null
            : current.completedAt,
      archivedAt:
        changes.archivedAt instanceof Date
          ? changes.archivedAt.toISOString()
          : changes.archivedAt === null
            ? null
            : current.archivedAt,
      updatedAt: "2032-01-10T11:00:00.000Z",
    };
    this.tasks.set(task.id, task);
    return structuredClone(task);
  }

  async deleteTask(userId: string, taskId: string): Promise<void> {
    await this.getTask(userId, taskId);
    this.tasks.delete(taskId);
  }
}

test("modelliert Status, Fälligkeit, Dauer und Tags nachvollziehbar", async () => {
  const repository = new InMemoryTaskRepository();
  const now = new Date("2032-01-10T12:00:00.000Z");
  const service = new TaskService(repository, () => now);

  const created = await service.createTask("owner-1", {
    title: "Synthetische Aufgabe",
    priority: "high",
    dueDate: "2032-01-15",
    scheduledStartAt: "2032-01-12T08:30:00+01:00",
    scheduledStartTimezone: "Europe/Berlin",
    estimatedDurationMinutes: 90,
    tags: [" studium ", "prüfung", "studium"],
    area: "study",
  });

  assert.equal(created.status, "open");
  assert.equal(created.dueDate, "2032-01-15");
  assert.equal(created.scheduledStartAt, "2032-01-12T07:30:00.000Z");
  assert.equal(created.estimatedDurationMinutes, 90);
  assert.deepEqual(created.tags, ["studium", "prüfung"]);
  assert.equal(created.completedAt, null);

  const done = await service.updateTask("owner-1", created.id, {
    status: "done",
  });
  assert.equal(done.status, "done");
  assert.equal(done.completedAt, now.toISOString());

  await assert.rejects(
    () =>
      service.updateTask("owner-1", created.id, {
        status: "cancelled",
      }),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 409 &&
      error.code === "CONFLICT",
  );

  const reopened = await service.updateTask("owner-1", created.id, {
    status: "open",
  });
  assert.equal(reopened.status, "open");
  assert.equal(reopened.completedAt, null);
});

test("gibt fremde Aufgaben nicht als vorhanden preis", async () => {
  const repository = new InMemoryTaskRepository();
  const service = new TaskService(repository);
  const created = await service.createTask("owner-1", {
    title: "Private Aufgabe",
  });

  await assert.rejects(
    () => service.getTask("owner-2", created.id),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 404 &&
      error.code === "NOT_FOUND",
  );
});
