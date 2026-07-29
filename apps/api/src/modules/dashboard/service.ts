import type { DashboardResponse } from "@lifeos/contracts";

import { ApiError } from "../../errors.js";
import {
  DashboardProfileNotFoundError,
  type DashboardRepository,
} from "./repository.js";

export class DashboardService {
  constructor(
    private readonly repository: DashboardRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getSnapshot(userId: string): Promise<DashboardResponse> {
    try {
      return await this.repository.getSnapshot(userId, this.now());
    } catch (error) {
      if (error instanceof DashboardProfileNotFoundError) {
        throw new ApiError(
          404,
          "NOT_FOUND",
          "Das lokale Profil wurde nicht gefunden.",
        );
      }
      throw error;
    }
  }
}
