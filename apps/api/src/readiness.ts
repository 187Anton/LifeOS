import type { DatabaseClient } from "@lifeos/database";

export interface ReadinessProbe {
  check(): Promise<void>;
}

export const createDatabaseReadinessProbe = (
  database: DatabaseClient,
): ReadinessProbe => ({
  async check() {
    await database.$queryRaw`SELECT 1`;
  },
});
