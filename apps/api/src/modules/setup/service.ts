import { ApiError } from "../../errors.js";
import { hashPassword } from "../profile/security.js";
import type { SetupRecord, SetupRepository } from "./repository.js";

export class SetupService {
  constructor(private readonly repository: SetupRepository) {}

  async status(): Promise<{ required: boolean }> {
    return { required: await this.repository.isRequired() };
  }

  async complete(
    input: Pick<SetupRecord, "displayName" | "timezone"> & {
      password: string;
      calDavPassword: string;
    },
  ): Promise<void> {
    const [passwordHash, calDavPasswordHash] = await Promise.all([
      hashPassword(input.password),
      hashPassword(input.calDavPassword),
    ]);
    const initialized = await this.repository.initialize({
      displayName: input.displayName,
      timezone: input.timezone,
      passwordHash,
      calDavPasswordHash,
    });
    if (!initialized) {
      throw new ApiError(
        409,
        "CONFLICT",
        "Die lokale Ersteinrichtung wurde bereits abgeschlossen.",
      );
    }
  }
}
