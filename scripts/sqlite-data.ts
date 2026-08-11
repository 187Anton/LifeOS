import path from "node:path";

import {
  createSqliteBackup,
  restoreSqliteBackup,
} from "../packages/database/src/sqlite-backup.js";
import { importPostgresToSqlite } from "../packages/database/src/sqlite-import.js";

const requireEnvironment = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} fehlt.`);
  return value;
};

const requireAbsolutePath = (value: string, label: string) => {
  if (!path.isAbsolute(value)) {
    throw new Error(`${label} muss ein absoluter Pfad sein.`);
  }
  return value;
};

const main = async () => {
  const [operation, argument] = process.argv.slice(2);
  if (operation === "import") {
    const result = await importPostgresToSqlite(
      requireEnvironment("DATABASE_URL"),
      requireEnvironment("SQLITE_DATABASE_URL"),
    );
    console.info(
      `PostgreSQL-Daten wurden geprüft in eine neue SQLite-Datei übertragen (${Object.values(result.counts).reduce((sum, count) => sum + count, 0)} Datensätze).`,
    );
    return;
  }

  if (operation === "backup") {
    if (!argument) throw new Error("Der absolute Backup-Zielpfad fehlt.");
    const result = await createSqliteBackup({
      databaseUrl: requireEnvironment("SQLITE_DATABASE_URL"),
      documentsDirectory: requireAbsolutePath(
        requireEnvironment("STORAGE_PATH"),
        "STORAGE_PATH",
      ),
      destinationDirectory: requireAbsolutePath(argument, "Backup-Ziel"),
    });
    console.info(`SQLite-Backup erstellt: ${result.destinationDirectory}`);
    return;
  }

  if (operation === "restore") {
    if (!argument) throw new Error("Der absolute Backup-Quellpfad fehlt.");
    const result = await restoreSqliteBackup({
      backupDirectory: requireAbsolutePath(argument, "Backup-Quelle"),
      targetDatabaseUrl: requireEnvironment("SQLITE_DATABASE_URL"),
      targetDocumentsDirectory: requireAbsolutePath(
        requireEnvironment("STORAGE_PATH"),
        "STORAGE_PATH",
      ),
    });
    console.info(
      `SQLite-Backup wurde geprüft in neue Ziele restauriert: ${result.targetDatabasePath}`,
    );
    return;
  }

  throw new Error("Erwartet wird import, backup oder restore.");
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unbekannter Fehler");
  process.exitCode = 1;
});
