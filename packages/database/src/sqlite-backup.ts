import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import BetterSqlite3 from "better-sqlite3";

import { migrateSqliteDatabase } from "../prisma/sqlite/migrate.js";

interface BackupFile {
  path: string;
  size: number;
  sha256: string;
}

interface SqliteBackupManifest {
  formatVersion: 1;
  createdAt: string;
  database: BackupFile;
  documents: BackupFile[];
}

const databaseBackupName = "lifeos.sqlite";
const documentsBackupDirectory = "documents";
const manifestName = "manifest.json";
const manifestChecksumName = "manifest.sha256";

const sha256 = async (filePath: string) =>
  createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");

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

const resolveDatabasePath = (databaseUrl: string) => {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("Die SQLite-Datenbank-URL muss mit file: beginnen.");
  }
  const filePath = decodeURIComponent(databaseUrl.slice("file:".length));
  if (!path.isAbsolute(filePath)) {
    throw new Error(
      "Die SQLite-Datenbank-URL muss einen absoluten Pfad enthalten.",
    );
  }
  return filePath;
};

const safeRelativePath = (relativePath: string) => {
  const normalized = relativePath.split(path.sep).join("/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.split("/").some((segment) => segment === ".." || segment === "")
  ) {
    throw new Error("Das Backup enthält einen unsicheren Dokumentpfad.");
  }
  return normalized;
};

const listDocumentFiles = async (
  root: string,
  current = root,
): Promise<string[]> => {
  if (!(await exists(root))) return [];
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error("Das Dokumentenziel muss ein reguläres Verzeichnis sein.");
  }
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const absolute = path.join(current, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(
        "Symbolische Links sind im Dokumentenbackup nicht erlaubt.",
      );
    }
    if (entry.isDirectory()) {
      files.push(...(await listDocumentFiles(root, absolute)));
    } else if (entry.isFile()) {
      files.push(safeRelativePath(path.relative(root, absolute)));
    } else {
      throw new Error("Das Dokumentenbackup unterstützt nur reguläre Dateien.");
    }
  }
  return files;
};

const describeFile = async (
  filePath: string,
  relativePath: string,
): Promise<BackupFile> => {
  const info = await stat(filePath);
  return {
    path: safeRelativePath(relativePath),
    size: info.size,
    sha256: await sha256(filePath),
  };
};

const verifyIntegrity = (databasePath: string) => {
  const database = new BetterSqlite3(databasePath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const result = database.pragma("integrity_check", {
      simple: true,
    }) as string;
    if (result !== "ok") {
      throw new Error(
        "Die SQLite-Datei hat die Integritätsprüfung nicht bestanden.",
      );
    }
  } finally {
    database.close();
  }
};

const checkpointDatabase = (databasePath: string) => {
  const database = new BetterSqlite3(databasePath, { fileMustExist: true });
  try {
    database.pragma("wal_checkpoint(TRUNCATE)");
  } finally {
    database.close();
  }
};

const verifyFile = async (root: string, expected: BackupFile) => {
  const relativePath = safeRelativePath(expected.path);
  const filePath = path.join(root, ...relativePath.split("/"));
  const info = await lstat(filePath);
  if (!info.isFile() || info.isSymbolicLink() || info.size !== expected.size) {
    throw new Error(`Backup-Datei ist ungültig: ${relativePath}`);
  }
  const actual = await sha256(filePath);
  const expectedChecksum = expected.sha256;
  if (
    actual.length !== expectedChecksum.length ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from(expectedChecksum))
  ) {
    throw new Error(`Prüfsumme stimmt nicht: ${relativePath}`);
  }
  return filePath;
};

const readAndVerifyManifest = async (backupDirectory: string) => {
  const manifestPath = path.join(backupDirectory, manifestName);
  const checksumPath = path.join(backupDirectory, manifestChecksumName);
  const manifestBytes = await readFile(manifestPath);
  const expectedChecksum = (await readFile(checksumPath, "utf8")).trim();
  const actualChecksum = createHash("sha256")
    .update(manifestBytes)
    .digest("hex");
  if (
    expectedChecksum.length !== actualChecksum.length ||
    !timingSafeEqual(Buffer.from(expectedChecksum), Buffer.from(actualChecksum))
  ) {
    throw new Error("Die Manifest-Prüfsumme stimmt nicht.");
  }
  const manifest = JSON.parse(
    manifestBytes.toString("utf8"),
  ) as SqliteBackupManifest;
  if (
    manifest.formatVersion !== 1 ||
    manifest.database.path !== databaseBackupName ||
    !Array.isArray(manifest.documents)
  ) {
    throw new Error("Das SQLite-Backup-Manifest ist nicht kompatibel.");
  }
  const documentPaths = new Set<string>();
  for (const document of manifest.documents) {
    const normalized = safeRelativePath(document.path);
    if (!normalized.startsWith(`${documentsBackupDirectory}/`)) {
      throw new Error(
        "Das SQLite-Backup-Manifest enthält einen ungültigen Dokumentpfad.",
      );
    }
    if (documentPaths.has(normalized)) {
      throw new Error(
        "Das SQLite-Backup-Manifest enthält doppelte Dokumentpfade.",
      );
    }
    documentPaths.add(normalized);
  }
  return manifest;
};

export const createSqliteBackup = async (options: {
  databaseUrl: string;
  documentsDirectory: string;
  destinationDirectory: string;
}) => {
  const databasePath = resolveDatabasePath(options.databaseUrl);
  if (
    !path.isAbsolute(options.documentsDirectory) ||
    !path.isAbsolute(options.destinationDirectory)
  ) {
    throw new Error("Dokumenten- und Backup-Pfade müssen absolut sein.");
  }
  if (!(await exists(databasePath)))
    throw new Error("Die SQLite-Quelldatei fehlt.");
  if (await exists(options.destinationDirectory)) {
    throw new Error(
      "Das Backup-Ziel existiert bereits und wird nicht überschrieben.",
    );
  }
  await mkdir(path.dirname(options.destinationDirectory), { recursive: true });
  const stagingDirectory = `${options.destinationDirectory}.creating-${randomUUID()}`;

  try {
    await mkdir(path.join(stagingDirectory, documentsBackupDirectory), {
      recursive: true,
      mode: 0o700,
    });
    const backupDatabasePath = path.join(stagingDirectory, databaseBackupName);
    const source = new BetterSqlite3(databasePath, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      await source.backup(backupDatabasePath);
    } finally {
      source.close();
    }
    verifyIntegrity(backupDatabasePath);
    await chmod(backupDatabasePath, 0o600);

    const documents: BackupFile[] = [];
    for (const relativePath of await listDocumentFiles(
      options.documentsDirectory,
    )) {
      const sourcePath = path.join(
        options.documentsDirectory,
        ...relativePath.split("/"),
      );
      const targetPath = path.join(
        stagingDirectory,
        documentsBackupDirectory,
        ...relativePath.split("/"),
      );
      await mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
      await copyFile(sourcePath, targetPath);
      await chmod(targetPath, 0o600);
      documents.push(
        await describeFile(
          targetPath,
          `${documentsBackupDirectory}/${relativePath}`,
        ),
      );
    }

    const manifest: SqliteBackupManifest = {
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      database: await describeFile(backupDatabasePath, databaseBackupName),
      documents,
    };
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(path.join(stagingDirectory, manifestName), manifestBytes, {
      mode: 0o600,
    });
    await writeFile(
      path.join(stagingDirectory, manifestChecksumName),
      `${createHash("sha256").update(manifestBytes).digest("hex")}\n`,
      { mode: 0o600 },
    );
    await rename(stagingDirectory, options.destinationDirectory);
    return { destinationDirectory: options.destinationDirectory, manifest };
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
};

export const restoreSqliteBackup = async (options: {
  backupDirectory: string;
  targetDatabaseUrl: string;
  targetDocumentsDirectory: string;
}) => {
  const targetDatabasePath = resolveDatabasePath(options.targetDatabaseUrl);
  if (
    !path.isAbsolute(options.backupDirectory) ||
    !path.isAbsolute(options.targetDocumentsDirectory)
  ) {
    throw new Error("Backup- und Dokumentenpfade müssen absolut sein.");
  }
  if (
    (await exists(targetDatabasePath)) ||
    (await exists(options.targetDocumentsDirectory))
  ) {
    throw new Error(
      "Restore-Ziele existieren bereits und werden nicht überschrieben.",
    );
  }
  const manifest = await readAndVerifyManifest(options.backupDirectory);
  const backupDatabasePath = await verifyFile(
    options.backupDirectory,
    manifest.database,
  );
  for (const document of manifest.documents) {
    await verifyFile(options.backupDirectory, document);
  }
  verifyIntegrity(backupDatabasePath);

  await mkdir(path.dirname(targetDatabasePath), { recursive: true });
  await mkdir(path.dirname(options.targetDocumentsDirectory), {
    recursive: true,
  });
  const stagingDatabase = `${targetDatabasePath}.restoring-${randomUUID()}`;
  const stagingDocuments = `${options.targetDocumentsDirectory}.restoring-${randomUUID()}`;
  let documentsPublished = false;

  try {
    await copyFile(backupDatabasePath, stagingDatabase);
    await chmod(stagingDatabase, 0o600);
    await mkdir(stagingDocuments, { recursive: true, mode: 0o700 });
    for (const document of manifest.documents) {
      const relativeDocument = document.path.slice(
        `${documentsBackupDirectory}/`.length,
      );
      const sourcePath = path.join(
        options.backupDirectory,
        ...document.path.split("/"),
      );
      const targetPath = path.join(
        stagingDocuments,
        ...relativeDocument.split("/"),
      );
      await mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
      await copyFile(sourcePath, targetPath);
      await chmod(targetPath, 0o600);
    }

    await migrateSqliteDatabase(`file:${stagingDatabase}`);
    checkpointDatabase(stagingDatabase);
    verifyIntegrity(stagingDatabase);
    await rename(stagingDocuments, options.targetDocumentsDirectory);
    documentsPublished = true;
    await rename(stagingDatabase, targetDatabasePath);
    return {
      targetDatabasePath,
      targetDocumentsDirectory: options.targetDocumentsDirectory,
    };
  } catch (error) {
    if (documentsPublished) {
      await rm(options.targetDocumentsDirectory, {
        recursive: true,
        force: true,
      });
    }
    await rm(stagingDatabase, { force: true });
    await rm(`${stagingDatabase}-wal`, { force: true });
    await rm(`${stagingDatabase}-shm`, { force: true });
    await rm(stagingDocuments, { recursive: true, force: true });
    throw error;
  }
};
