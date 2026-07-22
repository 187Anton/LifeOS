import { config as loadEnvironment } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, env } from "prisma/config";

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));

loadEnvironment({
  path: path.resolve(packageDirectory, "../../.env"),
  quiet: true,
});

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
