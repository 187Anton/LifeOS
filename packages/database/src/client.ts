import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/prisma/client.js";
import { createSqliteDatabaseClient } from "./sqlite-client.js";
import { createSqliteCompatibilityClient } from "./sqlite-compatibility-client.js";

export type DatabaseProvider = "postgresql" | "sqlite";

export const databaseProviderFromUrl = (
  databaseUrl: string,
): DatabaseProvider =>
  databaseUrl.startsWith("file:") ? "sqlite" : "postgresql";

export const createPostgresDatabaseClient = (
  databaseUrl = process.env.DATABASE_URL,
): PrismaClient => {
  const connectionString = databaseUrl?.trim();

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL fehlt. Lege die lokale .env anhand von .env.example an.",
    );
  }

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
};

export const createDatabaseClient = (
  databaseUrl = process.env.DATABASE_URL,
): PrismaClient => {
  const connectionString = databaseUrl?.trim();
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL fehlt. Lege die lokale .env anhand von .env.example an.",
    );
  }

  return databaseProviderFromUrl(connectionString) === "sqlite"
    ? createSqliteCompatibilityClient(
        createSqliteDatabaseClient(connectionString),
      )
    : createPostgresDatabaseClient(connectionString);
};

export type DatabaseClient = PrismaClient;
