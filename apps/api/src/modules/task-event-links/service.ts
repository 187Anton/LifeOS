import type {
  CreateTaskEventLinkRequest,
  TaskEventLinkResponse,
} from "@lifeos/contracts";

import { ApiError } from "../../errors.js";
import {
  EventLinkTargetNotFoundError,
  TaskEventLinkNotFoundError,
  TaskLinkTargetNotFoundError,
  type TaskEventLinkRepository,
} from "./repository.js";

export class TaskEventLinkService {
  constructor(private readonly repository: TaskEventLinkRepository) {}

  listLinks(userId: string): Promise<TaskEventLinkResponse[]> {
    return this.repository.listLinks(userId);
  }

  async createLink(userId: string, input: CreateTaskEventLinkRequest) {
    try {
      return await this.repository.createLink(userId, input);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async deleteLink(userId: string, linkId: string): Promise<void> {
    try {
      await this.repository.deleteLink(userId, linkId);
    } catch (error) {
      this.rethrow(error);
    }
  }

  private rethrow(error: unknown): never {
    if (error instanceof TaskLinkTargetNotFoundError) {
      throw new ApiError(
        404,
        "NOT_FOUND",
        "Die Aufgabe ist nicht verfügbar oder gehört nicht zum lokalen Profil.",
      );
    }
    if (error instanceof EventLinkTargetNotFoundError) {
      throw new ApiError(
        404,
        "NOT_FOUND",
        "Der Termin ist nicht verfügbar oder gehört nicht zum lokalen Profil.",
      );
    }
    if (error instanceof TaskEventLinkNotFoundError) {
      throw new ApiError(
        404,
        "NOT_FOUND",
        "Die Aufgaben-Termin-Verknüpfung wurde nicht gefunden.",
      );
    }
    throw error;
  }
}
