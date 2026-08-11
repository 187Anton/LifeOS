import { migrateSqliteDatabase } from "./migrate.js";

void migrateSqliteDatabase()
  .then((result) => {
    console.info(
      result.appliedNow.length > 0
        ? `SQLite-Migrationen angewendet: ${result.appliedNow.join(", ")}`
        : "SQLite-Schema ist bereits aktuell.",
    );
  })
  .catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : "SQLite-Migration fehlgeschlagen.",
    );
    process.exitCode = 1;
  });
