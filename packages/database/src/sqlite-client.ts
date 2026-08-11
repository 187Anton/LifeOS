import path from "node:path";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { PrismaClient } from "./generated/sqlite/client.js";
import { SQLITE_BUSY_TIMEOUT_MS } from "./sqlite-settings.js";

export { SQLITE_BUSY_TIMEOUT_MS } from "./sqlite-settings.js";

export const createSqliteDatabaseClient = (
  databaseUrl = process.env.SQLITE_DATABASE_URL,
): PrismaClient => {
  const url = databaseUrl?.trim();

  if (!url?.startsWith("file:") && url !== ":memory:") {
    throw new Error(
      "SQLITE_DATABASE_URL muss mit file: beginnen oder :memory: sein.",
    );
  }
  if (
    url !== ":memory:" &&
    !path.isAbsolute(decodeURIComponent(url.slice("file:".length)))
  ) {
    throw new Error(
      "SQLITE_DATABASE_URL muss einen absoluten Dateipfad verwenden.",
    );
  }

  const adapter = new PrismaBetterSqlite3(
    { url, timeout: SQLITE_BUSY_TIMEOUT_MS },
    { timestampFormat: "iso8601" },
  );

  return new PrismaClient({ adapter });
};

export type SqliteDatabaseClient = PrismaClient;
