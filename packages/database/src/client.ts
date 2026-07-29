import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/prisma/client.js";

export const createDatabaseClient = (
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

export type DatabaseClient = PrismaClient;
