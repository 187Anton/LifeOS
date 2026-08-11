import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "prisma/config";

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultDatabasePath = path.resolve(
  packageDirectory,
  "../../data/sqlite-development.sqlite",
);
const configuredDatabaseUrl = process.env.SQLITE_DATABASE_URL?.trim();

export default defineConfig({
  schema: "prisma/sqlite/schema.prisma",
  migrations: {
    path: "prisma/sqlite/migrations",
    seed: "node --import tsx prisma/sqlite/seed.ts",
  },
  datasource: {
    url: configuredDatabaseUrl || `file:${defaultDatabasePath}`,
  },
});
