import assert from "node:assert/strict";
import {
  appendFile,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import BetterSqlite3 from "better-sqlite3";

import {
  migrateSqliteDatabase,
  sqliteMigrationsDirectory,
} from "../prisma/sqlite/migrate.js";
import {
  createSqliteBackup,
  verifySqliteBackupDirectory,
} from "../src/sqlite-backup.js";

const destructiveMigration = "20260925120000_remove_finance_module";
const taskStudyModuleMigration = "20260925121600_task_study_module";
const paketSevenMigration = "20260926120500_document_pdf_extraction";
const legacyUserId = "00000000-0000-4000-8000-000000000601";
const legacyTextDocumentId = "00000000-0000-4000-8000-000000000608";
const legacyPdfDocumentId = "00000000-0000-4000-8000-000000000609";
const legacyTextStorageKey = "synthetischer-paket-3-text.txt";
const legacyPdfStorageKey = "synthetischer-paket-3-skript.pdf";
const legacyProjectId = "00000000-0000-4000-8000-000000000602";
const financeTaskId = "00000000-0000-4000-8000-000000000603";
const workTaskId = "00000000-0000-4000-8000-000000000604";
const financeCategoryId = "00000000-0000-4000-8000-000000000605";
const financeTransactionId = "00000000-0000-4000-8000-000000000606";
const financeBudgetId = "00000000-0000-4000-8000-000000000607";
const documentsStorageKey = "synthetischer-paket-3-nachweis.txt";
const documentContent =
  "Synthetischer Dokumentinhalt vor der destruktiven Migration.\n";

const pathExists = async (target: string) =>
  stat(target)
    .then(() => true)
    .catch(() => false);

const createIsolatedDirectory = async (t: test.TestContext, prefix: string) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  return directory;
};

const readValue = <Result>(
  databasePath: string,
  sql: string,
  ...parameters: Array<string | number>
): Result => {
  const database = new BetterSqlite3(databasePath, { readonly: true });
  try {
    return database.prepare(sql).get(...parameters) as Result;
  } finally {
    database.close();
  }
};

const tableCount = (databasePath: string, name: string) =>
  readValue<{ count: number }>(
    databasePath,
    `SELECT count(*) AS "count" FROM "sqlite_master" WHERE "type" = 'table' AND "name" = ?`,
    name,
  ).count;

/** Stellt einen synthetischen Vor-Paket-3-Stand über die echten Migrationen her. */
const prepareLegacyDatabase = async (
  directory: string,
  additionalExclusions: readonly string[] = [],
) => {
  const legacyMigrations = path.join(directory, "legacy-migrations");
  await mkdir(legacyMigrations, { recursive: true });
  for (const entry of await readdir(sqliteMigrationsDirectory, {
    withFileTypes: true,
  })) {
    if (
      !entry.isDirectory() ||
      entry.name === destructiveMigration ||
      entry.name === taskStudyModuleMigration ||
      additionalExclusions.includes(entry.name)
    )
      continue;
    await cp(
      path.join(sqliteMigrationsDirectory, entry.name),
      path.join(legacyMigrations, entry.name),
      { recursive: true },
    );
  }

  const databasePath = path.join(directory, "lifeos.sqlite");
  const legacyRun = await migrateSqliteDatabase(
    `file:${databasePath}`,
    legacyMigrations,
  );
  assert.equal(legacyRun.appliedNow.includes(destructiveMigration), false);
  assert.equal(legacyRun.appliedNow.includes(taskStudyModuleMigration), false);
  assert.ok(legacyRun.appliedNow.length > 0);

  const database = new BetterSqlite3(databasePath);
  try {
    database.exec(`
      INSERT INTO "User" ("id", "externalId", "displayName", "updatedAt") VALUES ('${legacyUserId}', 'synthetic-paket-3', 'Synthetische Paketperson', CURRENT_TIMESTAMP);
      INSERT INTO "UserSettings" ("userId", "timezone", "currencyCode", "locale", "weekStartsOn", "defaultCalendarView", "showWeekends", "updatedAt")
        VALUES ('${legacyUserId}', 'Europe/Berlin', 'CHF', 'de-DE', 0, 'month', false, CURRENT_TIMESTAMP);
      INSERT INTO "Project" ("id", "userId", "title", "updatedAt") VALUES ('${legacyProjectId}', '${legacyUserId}', 'Synthetisches Projekt', CURRENT_TIMESTAMP);
      INSERT INTO "Task" ("id", "userId", "title", "status", "priority", "dueDate", "area", "projectId", "tags", "updatedAt")
        VALUES ('${financeTaskId}', '${legacyUserId}', 'Synthetische Finanzaufgabe', 'in_progress', 'high', '2032-10-01', 'finance', '${legacyProjectId}', '["synthetisch","finanz"]', CURRENT_TIMESTAMP);
      INSERT INTO "Task" ("id", "userId", "title", "status", "priority", "area", "tags", "updatedAt")
        VALUES ('${workTaskId}', '${legacyUserId}', 'Synthetische Arbeitsaufgabe', 'open', 'medium', 'work', '[]', CURRENT_TIMESTAMP);
      INSERT INTO "FinanceCategory" ("id", "userId", "name", "kind", "updatedAt") VALUES ('${financeCategoryId}', '${legacyUserId}', 'Synthetische Kategorie', 'expense', CURRENT_TIMESTAMP);
      INSERT INTO "FinanceTransaction" ("id", "userId", "categoryId", "kind", "bookingDate", "amountMinor", "currencyCode", "updatedAt")
        VALUES ('${financeTransactionId}', '${legacyUserId}', '${financeCategoryId}', 'expense', '2032-09-30', 4321, 'CHF', CURRENT_TIMESTAMP);
      INSERT INTO "FinanceBudget" ("id", "userId", "categoryId", "period", "periodStart", "amountMinor", "currencyCode", "warningThresholdPercent", "updatedAt")
        VALUES ('${financeBudgetId}', '${legacyUserId}', '${financeCategoryId}', 'month', '2032-09-01', 50000, 'CHF', 80, CURRENT_TIMESTAMP);
    `);
  } finally {
    database.close();
  }

  const documentsDirectory = path.join(directory, "documents");
  await mkdir(path.join(documentsDirectory, legacyUserId), {
    recursive: true,
    mode: 0o700,
  });
  await writeFile(
    path.join(documentsDirectory, legacyUserId, documentsStorageKey),
    documentContent,
    { mode: 0o600 },
  );

  return {
    databasePath,
    databaseUrl: `file:${databasePath}`,
    documentsDirectory,
  };
};

test("migriert eine frische SQLite-Installation ohne unnötiges Vor-Migrationsbackup", async (t) => {
  const directory = await createIsolatedDirectory(t, "lifeos-p3-fresh-");
  const backupDirectory = path.join(directory, "backups");

  const result = await migrateSqliteDatabase(
    `file:${path.join(directory, "lifeos.sqlite")}`,
    sqliteMigrationsDirectory,
    { backupDirectory, documentsDirectory: path.join(directory, "documents") },
  );

  assert.equal(result.preMigrationBackup, null);
  assert.equal(await pathExists(backupDirectory), false);
  assert.ok(result.appliedNow.includes(destructiveMigration));
  assert.ok(result.appliedNow.includes(taskStudyModuleMigration));
});

test("erzeugt vor der destruktiven Migration ein vollständiges und geprüftes Backup", async (t) => {
  const directory = await createIsolatedDirectory(t, "lifeos-p3-backup-");
  const legacy = await prepareLegacyDatabase(directory);
  const backupDirectory = path.join(directory, "backups");
  const taskBefore = readValue<Record<string, unknown>>(
    legacy.databasePath,
    'SELECT * FROM "Task" WHERE "id" = ?',
    financeTaskId,
  );
  const settingsBefore = readValue<Record<string, unknown>>(
    legacy.databasePath,
    'SELECT * FROM "UserSettings" WHERE "userId" = ?',
    legacyUserId,
  );
  assert.equal(taskBefore.area, "finance");
  assert.equal(settingsBefore.currencyCode, "CHF");

  const result = await migrateSqliteDatabase(
    legacy.databaseUrl,
    sqliteMigrationsDirectory,
    { backupDirectory, documentsDirectory: legacy.documentsDirectory },
  );

  // Beide destruktiven Migrationen werden nach dem geprüften Backup in
  // sortierter Reihenfolge angewendet.
  assert.deepEqual(result.appliedNow, [
    destructiveMigration,
    taskStudyModuleMigration,
  ]);
  assert.ok(result.preMigrationBackup);
  assert.equal(path.dirname(result.preMigrationBackup), backupDirectory);
  assert.deepEqual(await readdir(backupDirectory), [
    path.basename(result.preMigrationBackup),
  ]);

  const manifest = await verifySqliteBackupDirectory(result.preMigrationBackup);
  assert.equal(manifest.documents.length, 1);
  assert.ok(
    manifest.documents[0]?.path.endsWith(
      `${legacyUserId}/${documentsStorageKey}`,
    ),
  );
  assert.equal(
    await readFile(
      path.join(
        result.preMigrationBackup,
        ...(manifest.documents[0]?.path ?? "").split("/"),
      ),
      "utf8",
    ),
    documentContent,
  );

  const backupDatabasePath = path.join(
    result.preMigrationBackup,
    manifest.database.path,
  );
  assert.equal(tableCount(backupDatabasePath, "FinanceCategory"), 1);
  assert.equal(
    readValue<{ area: string }>(
      backupDatabasePath,
      'SELECT "area" FROM "Task" WHERE "id" = ?',
      financeTaskId,
    ).area,
    "finance",
  );
  assert.equal(
    readValue<{ currencyCode: string }>(
      backupDatabasePath,
      'SELECT "currencyCode" FROM "UserSettings" WHERE "userId" = ?',
      legacyUserId,
    ).currencyCode,
    "CHF",
  );

  const taskAfter = readValue<Record<string, unknown>>(
    legacy.databasePath,
    'SELECT * FROM "Task" WHERE "id" = ?',
    financeTaskId,
  );
  assert.equal(taskAfter.area, "personal");
  // Paket 4 ergänzt ausschließlich den optionalen Studienmodulbezug mit NULL.
  assert.deepEqual(taskAfter, {
    ...taskBefore,
    area: "personal",
    studyModuleId: null,
  });

  const workTaskAfter = readValue<Record<string, unknown>>(
    legacy.databasePath,
    'SELECT * FROM "Task" WHERE "id" = ?',
    workTaskId,
  );
  assert.equal(workTaskAfter.area, "work");
  assert.equal(workTaskAfter.title, "Synthetische Arbeitsaufgabe");

  const settingsAfter = readValue<Record<string, unknown>>(
    legacy.databasePath,
    'SELECT * FROM "UserSettings" WHERE "userId" = ?',
    legacyUserId,
  );
  const { currencyCode: removedCurrency, ...expectedSettings } = settingsBefore;
  assert.equal(removedCurrency, "CHF");
  assert.deepEqual(settingsAfter, expectedSettings);

  const projectAfter = readValue<Record<string, unknown>>(
    legacy.databasePath,
    'SELECT * FROM "Project" WHERE "id" = ?',
    legacyProjectId,
  );
  assert.equal(projectAfter.title, "Synthetisches Projekt");
  assert.equal(projectAfter.userId, legacyUserId);

  for (const table of [
    "FinanceTransaction",
    "FinanceBudget",
    "FinanceCategory",
  ]) {
    assert.equal(tableCount(legacy.databasePath, table), 0);
  }
  assert.equal(
    readValue<{ count: number }>(
      legacy.databasePath,
      `SELECT count(*) AS "count" FROM pragma_table_info('UserSettings') WHERE "name" = 'currencyCode'`,
    ).count,
    0,
  );
  assert.equal(
    readValue<{ count: number }>(
      legacy.databasePath,
      `SELECT count(*) AS "count" FROM pragma_foreign_key_check`,
    ).count,
    0,
  );
  assert.equal(
    readValue<{ count: number }>(
      legacy.databasePath,
      `SELECT count(*) AS "count" FROM pragma_table_info('Task')`,
    ).count,
    // Paket 4 ergänzt genau eine Spalte für den optionalen Modulbezug.
    Object.keys(taskBefore).length + 1,
  );

  assert.equal(
    await readFile(
      path.join(legacy.documentsDirectory, legacyUserId, documentsStorageKey),
      "utf8",
    ),
    documentContent,
  );
});

test("verweigert die destruktive Migration ohne Backup-Nachweis", async (t) => {
  const directory = await createIsolatedDirectory(t, "lifeos-p3-refusal-");
  const legacy = await prepareLegacyDatabase(directory);

  await assert.rejects(
    () => migrateSqliteDatabase(legacy.databaseUrl, sqliteMigrationsDirectory),
    /kein Backup-Ziel ist konfiguriert/,
  );

  assert.equal(
    readValue<{ count: number }>(
      legacy.databasePath,
      `SELECT count(*) AS "count" FROM "_lifeos_migrations" WHERE "name" = ?`,
      destructiveMigration,
    ).count,
    0,
  );
  assert.equal(tableCount(legacy.databasePath, "FinanceCategory"), 1);
  assert.equal(
    readValue<{ area: string }>(
      legacy.databasePath,
      'SELECT "area" FROM "Task" WHERE "id" = ?',
      financeTaskId,
    ).area,
    "finance",
  );
});

test("übernimmt einen ausdrücklich übergebenen, geprüften Backup-Kontext ohne neues Backup", async (t) => {
  const directory = await createIsolatedDirectory(t, "lifeos-p3-context-");
  const legacy = await prepareLegacyDatabase(directory);
  const backupRoot = path.join(directory, "backups");
  const existingBackup = path.join(backupRoot, "vor-paket-3");
  await createSqliteBackup({
    databaseUrl: legacy.databaseUrl,
    documentsDirectory: legacy.documentsDirectory,
    destinationDirectory: existingBackup,
  });

  const result = await migrateSqliteDatabase(
    legacy.databaseUrl,
    sqliteMigrationsDirectory,
    { verifiedBackupDirectory: existingBackup },
  );

  assert.equal(result.preMigrationBackup, existingBackup);
  assert.deepEqual(await readdir(backupRoot), ["vor-paket-3"]);
  assert.equal(
    readValue<{ area: string }>(
      legacy.databasePath,
      'SELECT "area" FROM "Task" WHERE "id" = ?',
      financeTaskId,
    ).area,
    "personal",
  );
});

test("weist einen fehlenden oder manipulierten Backup-Kontext ab", async (t) => {
  const directory = await createIsolatedDirectory(t, "lifeos-p3-tamper-");
  const legacy = await prepareLegacyDatabase(directory);

  await assert.rejects(() =>
    migrateSqliteDatabase(legacy.databaseUrl, sqliteMigrationsDirectory, {
      verifiedBackupDirectory: path.join(directory, "nicht-vorhanden"),
    }),
  );

  const backupDirectory = path.join(directory, "backups", "manipuliert");
  const manifest = await createSqliteBackup({
    databaseUrl: legacy.databaseUrl,
    documentsDirectory: legacy.documentsDirectory,
    destinationDirectory: backupDirectory,
  });
  await appendFile(
    path.join(backupDirectory, ...manifest.manifest.database.path.split("/")),
    "manipuliert",
  );

  await assert.rejects(
    () =>
      migrateSqliteDatabase(legacy.databaseUrl, sqliteMigrationsDirectory, {
        verifiedBackupDirectory: backupDirectory,
      }),
    /Backup-Datei ist ungültig|Prüfsumme/,
  );

  assert.equal(
    readValue<{ area: string }>(
      legacy.databasePath,
      'SELECT "area" FROM "Task" WHERE "id" = ?',
      financeTaskId,
    ).area,
    "finance",
  );
  assert.equal(tableCount(legacy.databasePath, "FinanceCategory"), 1);
});

test("übernimmt Bestandsdokumente datenerhaltend in den Extraktionszustand", async (t) => {
  const directory = await createIsolatedDirectory(t, "lifeos-p7-legacy-");
  const legacy = await prepareLegacyDatabase(directory, [paketSevenMigration]);
  const backupDirectory = path.join(directory, "backups");

  /** Bestand vor Paket 7: eine Textdatei mit Altextraktion, ein PDF ohne Text. */
  const database = new BetterSqlite3(legacy.databasePath);
  try {
    database.exec(`
      INSERT INTO "Document" ("id", "userId", "storageKey", "fileName", "mimeType", "byteSize", "sha256", "modifiedAt", "searchEnabled", "extractedText", "updatedAt")
        VALUES ('${legacyTextDocumentId}', '${legacyUserId}', '${legacyTextStorageKey}', 'altext.txt', 'text/plain', 46, '${"1".repeat(64)}', CURRENT_TIMESTAMP, 1, 'Übernommener Text aus der Altextraktion.', '2032-09-05 10:00:00');
      INSERT INTO "Document" ("id", "userId", "storageKey", "fileName", "mimeType", "byteSize", "sha256", "modifiedAt", "searchEnabled", "updatedAt")
        VALUES ('${legacyPdfDocumentId}', '${legacyUserId}', '${legacyPdfStorageKey}', 'altskript.pdf', 'application/pdf', 1024, '${"2".repeat(64)}', CURRENT_TIMESTAMP, 1, '2032-09-06 10:00:00');
    `);
  } finally {
    database.close();
  }
  await writeFile(
    path.join(legacy.documentsDirectory, legacyUserId, legacyTextStorageKey),
    "Übernommener Text aus der Altextraktion.\n",
    { mode: 0o600 },
  );
  await writeFile(
    path.join(legacy.documentsDirectory, legacyUserId, legacyPdfStorageKey),
    "%PDF-1.4 synthetischer Altbestand\n",
    { mode: 0o600 },
  );

  const result = await migrateSqliteDatabase(
    legacy.databaseUrl,
    sqliteMigrationsDirectory,
    {
      backupDirectory,
      documentsDirectory: legacy.documentsDirectory,
    },
  );
  assert.ok(result.appliedNow.includes(paketSevenMigration));

  /** Altextraktionen bleiben erhalten und gelten als hashaktuelle Legacy-Extraktion. */
  const textRow = readValue<Record<string, unknown>>(
    legacy.databasePath,
    'SELECT * FROM "Document" WHERE "id" = ?',
    legacyTextDocumentId,
  );
  assert.equal(
    textRow.extractedText,
    "Übernommener Text aus der Altextraktion.",
  );
  assert.equal(textRow.extractionStatus, "available");
  assert.equal(textRow.extractionVersion, "legacy-text-v1");
  assert.equal(textRow.extractionSha256, "1".repeat(64));
  assert.equal(textRow.extractedAt, "2032-09-05 10:00:00");
  assert.equal(textRow.extractionPages, "[]");
  assert.equal(textRow.extractionPageCount, null);
  assert.equal(textRow.extractionTruncated, 0);

  /** Ein Bestands-PDF bleibt bis zur Verarbeitung ausstehend und ohne Seite. */
  const pdfRow = readValue<Record<string, unknown>>(
    legacy.databasePath,
    'SELECT * FROM "Document" WHERE "id" = ?',
    legacyPdfDocumentId,
  );
  assert.equal(pdfRow.extractedText, null);
  assert.equal(pdfRow.extractionStatus, "pending");
  assert.equal(pdfRow.extractionVersion, null);
  assert.equal(pdfRow.extractionSha256, null);
  assert.equal(pdfRow.extractionErrorCode, null);
  assert.equal(pdfRow.extractionPageCount, null);
  assert.equal(pdfRow.extractionPages, "[]");
  assert.equal(pdfRow.fileName, "altskript.pdf");
  assert.equal(pdfRow.sha256, "2".repeat(64));

  /** Die Datensätze sind nach der Migration weiter nutzbar und prüfbar. */
  const migrated = new BetterSqlite3(legacy.databasePath);
  try {
    assert.throws(() =>
      migrated
        .prepare('UPDATE "Document" SET "extractionPages" = ? WHERE "id" = ?')
        .run('{"page":1}', legacyPdfDocumentId),
    );
    assert.throws(() =>
      migrated
        .prepare('UPDATE "Document" SET "extractionStatus" = ? WHERE "id" = ?')
        .run("unbekannt", legacyPdfDocumentId),
    );
    migrated
      .prepare(
        'UPDATE "Document" SET "extractionStatus" = ?, "extractionPages" = ?, "extractionPageCount" = ? WHERE "id" = ?',
      )
      .run(
        "available",
        '[{"page":3,"text":"Neu verarbeitet."}]',
        1,
        legacyPdfDocumentId,
      );
  } finally {
    migrated.close();
  }
  const reprocessed = readValue<Record<string, unknown>>(
    legacy.databasePath,
    'SELECT * FROM "Document" WHERE "id" = ?',
    legacyPdfDocumentId,
  );
  assert.equal(reprocessed.extractionStatus, "available");
  assert.equal(reprocessed.extractionPageCount, 1);
  assert.equal(
    reprocessed.extractionPages,
    '[{"page":3,"text":"Neu verarbeitet."}]',
  );
});
