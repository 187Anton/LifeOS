import { createHash } from "node:crypto";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import BetterSqlite3 from "better-sqlite3";

import { SQLITE_BUSY_TIMEOUT_MS } from "../../src/sqlite-settings.js";

const sqliteDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultDatabasePath = path.resolve(
  sqliteDirectory,
  "../../../../data/sqlite-development.sqlite",
);
export const sqliteMigrationsDirectory = path.join(
  sqliteDirectory,
  "migrations",
);
const migrationNamePattern = /^\d{14}_[a-z0-9_]+$/;

interface AppliedMigration {
  name: string;
  checksum: string;
}

const resolveDatabasePath = (databaseUrl: string | undefined) => {
  const url = databaseUrl?.trim();
  if (!url?.startsWith("file:")) {
    throw new Error(
      "SQLITE_DATABASE_URL muss für Migrationen mit file: beginnen.",
    );
  }

  const configuredPath = decodeURIComponent(url.slice("file:".length));
  if (!configuredPath) {
    throw new Error("SQLITE_DATABASE_URL enthält keinen Dateipfad.");
  }

  if (!path.isAbsolute(configuredPath)) {
    throw new Error(
      "SQLITE_DATABASE_URL muss einen absoluten Dateipfad verwenden.",
    );
  }

  return configuredPath;
};

const checksum = (sql: string) =>
  createHash("sha256").update(sql, "utf8").digest("hex");

const readMigrations = async (migrationDirectory: string) => {
  const entries = await readdir(migrationDirectory, { withFileTypes: true });
  const names = entries
    .filter(
      (entry) => entry.isDirectory() && migrationNamePattern.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort();

  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(
        path.join(migrationDirectory, name, "migration.sql"),
        "utf8",
      );
      return { name, sql, checksum: checksum(sql) };
    }),
  );
};

export const migrateSqliteDatabase = async (
  databaseUrl = process.env.SQLITE_DATABASE_URL ||
    `file:${defaultDatabasePath}`,
  migrationDirectory = sqliteMigrationsDirectory,
) => {
  const databasePath = resolveDatabasePath(databaseUrl);
  await mkdir(path.dirname(databasePath), { recursive: true });

  const database = new BetterSqlite3(databasePath);
  try {
    database.pragma(`busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
    database.pragma("foreign_keys = ON");
    const journalMode = database.pragma("journal_mode = WAL", {
      simple: true,
    }) as string;
    if (journalMode.toLowerCase() !== "wal") {
      throw new Error("SQLite konnte nicht in den WAL-Modus wechseln.");
    }
    database.exec(`
      CREATE TABLE IF NOT EXISTS "_lifeos_migrations" (
        "name" TEXT NOT NULL PRIMARY KEY,
        "checksum" TEXT NOT NULL,
        "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const applied = new Map(
      database
        .prepare<[], AppliedMigration>(
          'SELECT "name", "checksum" FROM "_lifeos_migrations" ORDER BY "name"',
        )
        .all()
        .map((migration) => [migration.name, migration.checksum]),
    );
    const migrations = await readMigrations(migrationDirectory);
    const appliedNow: string[] = [];

    for (const migration of migrations) {
      const existingChecksum = applied.get(migration.name);
      if (existingChecksum && existingChecksum !== migration.checksum) {
        throw new Error(
          `Die bereits angewendete SQLite-Migration ${migration.name} wurde verändert.`,
        );
      }
      if (existingChecksum) continue;

      database.transaction(() => {
        database.exec(migration.sql);
        database
          .prepare(
            'INSERT INTO "_lifeos_migrations" ("name", "checksum") VALUES (?, ?)',
          )
          .run(migration.name, migration.checksum);
      })();
      appliedNow.push(migration.name);
    }

    const foreignKeyViolations = database.pragma(
      "foreign_key_check",
    ) as unknown[];
    if (foreignKeyViolations.length > 0) {
      throw new Error(
        "Die SQLite-Migration hinterließ ungültige Fremdschlüssel.",
      );
    }
    const integrity = database.pragma("integrity_check", {
      simple: true,
    }) as string;
    if (integrity !== "ok") {
      throw new Error(`SQLite integrity_check fehlgeschlagen: ${integrity}`);
    }

    return { databasePath, appliedNow };
  } finally {
    database.close();
  }
};

const invokedAsScript = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (invokedAsScript) {
  const result = await migrateSqliteDatabase();
  console.info(
    result.appliedNow.length > 0
      ? `SQLite-Migrationen angewendet: ${result.appliedNow.join(", ")}`
      : "SQLite-Schema ist bereits aktuell.",
  );
}
