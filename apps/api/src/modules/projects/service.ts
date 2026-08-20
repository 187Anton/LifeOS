import type {
  CreateProjectEventLinkRequest,
  CreateProjectItemRequest,
  CreateProjectRequest,
  CreateProjectTaskLinkRequest,
  UpdateProjectItemRequest,
  UpdateProjectRequest,
} from "@lifeos/contracts";

import { ApiError } from "../../errors.js";
import {
  ProjectLinkConflictError,
  ProjectRecordNotFoundError,
  ProjectReferenceNotFoundError,
  type ProjectChanges,
  type ProjectItemValues,
  type ProjectRepository,
  type ProjectValues,
} from "./repository.js";

const day = (value?: string | null) =>
  value ? new Date(`${value}T00:00:00.000Z`) : null;
const owns = <T extends object>(value: T, key: PropertyKey) =>
  Object.hasOwn(value, key);

export class ProjectService {
  constructor(
    private readonly repository: ProjectRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  listProjects(userId: string, includeArchived = false) {
    return this.repository.listProjects(userId, includeArchived);
  }
  getProject(userId: string, projectId: string) {
    return this.handle(() => this.repository.getProject(userId, projectId));
  }
  createProject(userId: string, input: CreateProjectRequest) {
    return this.handle(() =>
      this.repository.createProject(userId, {
        title: input.title,
        description: input.description ?? null,
        status: input.status ?? "planned",
        risk: input.risk ?? null,
        dueDate: day(input.dueDate),
        searchEnabled: input.searchEnabled ?? false,
      }),
    );
  }
  updateProject(
    userId: string,
    projectId: string,
    input: UpdateProjectRequest,
  ) {
    const { archived, ...inputChanges } = input;
    const changes = { ...inputChanges } as ProjectChanges<ProjectValues>;
    if (owns(input, "description"))
      changes.description = input.description ?? null;
    if (owns(input, "risk")) changes.risk = input.risk ?? null;
    if (owns(input, "dueDate")) changes.dueDate = day(input.dueDate);
    if (archived !== undefined)
      changes.archivedAt = archived ? this.now() : null;
    return this.handle(() =>
      this.repository.updateProject(userId, projectId, changes),
    );
  }
  deleteProject(userId: string, projectId: string) {
    return this.handle(() =>
      this.repository.deleteProject(userId, projectId, this.now()),
    );
  }
  createItem(
    userId: string,
    projectId: string,
    kind: "goal" | "milestone",
    input: CreateProjectItemRequest,
  ) {
    return this.handle(() =>
      this.repository.createItem(userId, projectId, kind, {
        title: input.title,
        description: input.description ?? null,
        status: input.status ?? "open",
        risk: input.risk ?? null,
        dueDate: day(input.dueDate),
      }),
    );
  }
  updateItem(
    userId: string,
    projectId: string,
    itemId: string,
    kind: "goal" | "milestone",
    input: UpdateProjectItemRequest,
  ) {
    const { archived, ...inputChanges } = input;
    const changes = { ...inputChanges } as ProjectChanges<ProjectItemValues>;
    if (owns(input, "description"))
      changes.description = input.description ?? null;
    if (owns(input, "risk")) changes.risk = input.risk ?? null;
    if (owns(input, "dueDate")) changes.dueDate = day(input.dueDate);
    if (archived !== undefined)
      changes.archivedAt = archived ? this.now() : null;
    return this.handle(() =>
      this.repository.updateItem(userId, projectId, itemId, kind, changes),
    );
  }
  deleteItem(
    userId: string,
    projectId: string,
    itemId: string,
    kind: "goal" | "milestone",
  ) {
    return this.handle(() =>
      this.repository.deleteItem(userId, projectId, itemId, kind, this.now()),
    );
  }
  linkTask(
    userId: string,
    projectId: string,
    input: CreateProjectTaskLinkRequest,
  ) {
    return this.handle(() =>
      this.repository.linkTask(userId, projectId, input.taskId),
    );
  }
  unlinkTask(userId: string, projectId: string, taskId: string) {
    return this.handle(() =>
      this.repository.unlinkTask(userId, projectId, taskId),
    );
  }
  linkEvent(
    userId: string,
    projectId: string,
    input: CreateProjectEventLinkRequest,
  ) {
    return this.handle(() =>
      this.repository.linkEvent(
        userId,
        projectId,
        input.calendarId,
        input.eventUid,
      ),
    );
  }
  unlinkEvent(
    userId: string,
    projectId: string,
    calendarId: string,
    eventUid: string,
  ) {
    return this.handle(() =>
      this.repository.unlinkEvent(userId, projectId, calendarId, eventUid),
    );
  }

  private async handle<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof ProjectRecordNotFoundError)
        throw new ApiError(
          404,
          "NOT_FOUND",
          "Das Projektobjekt wurde nicht gefunden.",
        );
      if (error instanceof ProjectReferenceNotFoundError)
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          "Die verknüpfte Aufgabe oder das Kalenderereignis ist nicht verfügbar.",
        );
      if (error instanceof ProjectLinkConflictError)
        throw new ApiError(
          409,
          "CONFLICT",
          "Die Verknüpfung besteht bereits oder widerspricht einer vorhandenen Projektzuordnung.",
        );
      throw error;
    }
  }
}
