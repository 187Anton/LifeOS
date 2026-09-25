import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import BetterSqlite3 from "better-sqlite3";

import { SQLITE_BUSY_TIMEOUT_MS } from "../../src/sqlite-settings.js";
import {
  createSqliteBackup,
  verifySqliteBackupDirectory,
} from "../../src/sqlite-backup.js";

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
const backupMarkerName = "requires-backup";
const foreignKeysOffMarkerName = "foreign-keys-off";

interface AppliedMigration {
  name: string;
  checksum: string;
}

interface PendingMigration {
  name: string;
  sql: string;
  checksum: string;
  requiresBackup: boolean;
  foreignKeysOff: boolean;
}

export interface SqliteMigrationOptions {
  /**
   * Privates Verzeichnis für die automatischen Vor-Migrationsbackups. Ohne
   * Angabe wird eine Migration mit Backup-Pflicht abgelehnt, solange kein
   * geprüfter Backup-Kontext übergeben wurde.
   */
  backupDirectory?: string;
  /** Vollständig mitzusicherndes Dokumentverzeichnis des Besitzers. */
  documentsDirectory?: string;
  /**
   * Bereits geprüfter Backup-Kontext eines Restore- oder Stagingziels. Wird
   * ausdrücklich statt eines neuen Backups akzeptiert und erneut geprüft.
   */
  verifiedBackupDirectory?: string;
  logger?: (message: string) => void;
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

const exists = async (target: string) =>
  stat(target)
    .then(() => true)
    .catch((error: unknown) => {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return false;
      }
      throw error;
    });

const backupTimestamp = () => new Date().toISOString().replace(/[:.]/g, "-");

/**
 * Zahl der Anwendungstabellen. Eine frische, leere Installation enthält nur die
 * interne Migrationsverwaltung und benötigt kein Vor-Migrationsbackup.
 */
const applicationTableCount = (database: BetterSqlite3.Database): number => {
  const row = database
    .prepare(
      `SELECT COUNT(*) AS "count" FROM "sqlite_master"
       WHERE "type" = 'table'
         AND "name" NOT LIKE 'sqlite_%'
         AND "name" <> '_lifeos_migrations'`,
    )
    .get() as { count: number };
  return row.count;
};

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
      const directory = path.join(migrationDirectory, name);
      const sql = await readFile(path.join(directory, "migration.sql"), "utf8");
      return {
        name,
        sql,
        checksum: checksum(sql),
        requiresBackup: await exists(path.join(directory, backupMarkerName)),
        foreignKeysOff: await exists(
          path.join(directory, foreignKeysOffMarkerName),
        ),
      };
    }),
  );
};

/**
 * Vor einer Migration mit Backup-Pflicht muss ein vollständiges, geprüftes
 * Backup aus Datenbank und Dokumenten vorliegen. Entweder wurde ein solcher
 * Backup-Kontext ausdrücklich übergeben (Restore/Staging) oder es wird ein
 * neues privates Backupziel erzeugt. Ohne Nachweis wird nicht migriert.
 */
const ensurePreMigrationBackup = async (
  database: BetterSqlite3.Database,
  databaseUrl: string,
  pendingBackupMigrations: string[],
  options: SqliteMigrationOptions,
): Promise<string | null> => {
  const logger = options.logger ?? (() => {});
  const tableCount = applicationTableCount(database);
  if (tableCount === 0) {
    logger(
      `Frische SQLite-Installation: ${pendingBackupMigrations.join(", ")} startet ohne Backup.`,
    );
    return null;
  }

  if (options.verifiedBackupDirectory) {
    if (!path.isAbsolute(options.verifiedBackupDirectory)) {
      throw new Error(
        "Der übergebene Backup-Kontext muss ein absoluter Pfad sein.",
      );
    }
    await verifySqliteBackupDirectory(options.verifiedBackupDirectory);
    logger(
      `Geprüfter Backup-Kontext bestätigt: ${options.verifiedBackupDirectory}`,
    );
    return options.verifiedBackupDirectory;
  }

  if (!options.backupDirectory) {
    throw new Error(
      "Die SQLite-Migration ersetzt bestehende Tabellen, aber kein Backup-Ziel ist konfiguriert. Ohne geprüftes Backup wird nicht migriert.",
    );
  }
  if (!path.isAbsolute(options.backupDirectory)) {
    throw new Error("Das Backup-Ziel muss ein absoluter Pfad sein.");
  }
  if (!options.documentsDirectory) {
    throw new Error(
      "Für das Vor-Migrationsbackup fehlt das Dokumentenverzeichnis des Besitzers.",
    );
  }
  if (!path.isAbsolute(options.documentsDirectory)) {
    throw new Error("Das Dokumentenverzeichnis muss ein absoluter Pfad sein.");
  }

  await mkdir(options.backupDirectory, { recursive: true, mode: 0o700 });
  const destinationDirectory = path.join(
    options.backupDirectory,
    `pre-migration-${path.basename(resolveDatabasePath(databaseUrl))}-${backupTimestamp()}`,
  );
  await createSqliteBackup({
    databaseUrl,
    documentsDirectory: options.documentsDirectory,
    destinationDirectory,
  });
  await verifySqliteBackupDirectory(destinationDirectory);
  logger(
    `Vor-Migrationsbackup erstellt und geprüft: ${destinationDirectory} (${pendingBackupMigrations.join(", ")})`,
  );
  return destinationDirectory;
};

export const migrateSqliteDatabase = async (
  databaseUrl = process.env.SQLITE_DATABASE_URL ||
    `file:${defaultDatabasePath}`,
  migrationDirectory = sqliteMigrationsDirectory,
  options: SqliteMigrationOptions = {},
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
    const pending: PendingMigration[] = migrations.filter(
      (migration) => !applied.has(migration.name),
    );
    const pendingBackupMigrations = pending
      .filter((migration) => migration.requiresBackup)
      .map((migration) => migration.name);
    let preMigrationBackup: string | null = null;
    if (pendingBackupMigrations.length > 0) {
      preMigrationBackup = await ensurePreMigrationBackup(
        database,
        databaseUrl,
        pendingBackupMigrations,
        options,
      );
    }

    for (const migration of migrations) {
      const existingChecksum = applied.get(migration.name);
      if (existingChecksum && existingChecksum !== migration.checksum) {
        throw new Error(
          `Die bereits angewendete SQLite-Migration ${migration.name} wurde verändert.`,
        );
      }
      if (existingChecksum) continue;

      if (migration.foreignKeysOff) {
        database.pragma("foreign_keys = OFF");
      }
      try {
        database.transaction(() => {
          database.exec(migration.sql);
          database
            .prepare(
              'INSERT INTO "_lifeos_migrations" ("name", "checksum") VALUES (?, ?)',
            )
            .run(migration.name, migration.checksum);
        })();
      } finally {
        if (migration.foreignKeysOff) {
          database.pragma("foreign_keys = ON");
        }
      }
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
    await chmod(databasePath, 0o600);

    return { databasePath, appliedNow, preMigrationBackup };
  } finally {
    database.close();
  }
};
