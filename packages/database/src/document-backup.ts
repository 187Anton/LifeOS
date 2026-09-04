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
  writeFile,
} from "node:fs/promises";
import path from "node:path";

interface DocumentBackupEntry {
  path: string;
  size: number;
  sha256: string;
}

interface DocumentBackupManifest {
  formatVersion: 1;
  createdAt: string;
  documents: DocumentBackupEntry[];
}

const documentsDirectoryName = "documents";
const manifestName = "manifest.json";
const manifestChecksumName = "manifest.sha256";
const checksumPattern = /^[0-9a-f]{64}$/;

const exists = async (target: string) =>
  lstat(target)
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

const sha256 = async (filePath: string) =>
  createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");

const safeRelativePath = (relativePath: string) => {
  if (
    !relativePath ||
    relativePath.includes("\\") ||
    relativePath.includes("\0") ||
    relativePath.startsWith("/") ||
    relativePath
      .split("/")
      .some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error("Das Dokumentenbackup enthält einen unsicheren Pfad.");
  }
  return relativePath;
};

const listDocumentFiles = async (
  root: string,
  current = root,
): Promise<string[]> => {
  if (!(await exists(root))) return [];
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error(
      "Das Dokumentenverzeichnis muss ein reguläres Verzeichnis sein.",
    );
  }
  const files: string[] = [];
  for (const entry of (await readdir(current, { withFileTypes: true })).sort(
    (left, right) => left.name.localeCompare(right.name),
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isEntry = (value: unknown): value is DocumentBackupEntry =>
  isRecord(value) &&
  typeof value.path === "string" &&
  Number.isSafeInteger(value.size) &&
  (value.size as number) >= 0 &&
  typeof value.sha256 === "string" &&
  checksumPattern.test(value.sha256);

const readManifest = async (
  backupDirectory: string,
): Promise<DocumentBackupManifest> => {
  let manifestBytes: Buffer;
  let expectedChecksum: string;
  try {
    manifestBytes = await readFile(path.join(backupDirectory, manifestName));
    expectedChecksum = (
      await readFile(path.join(backupDirectory, manifestChecksumName), "utf8")
    ).trim();
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw new Error("Dokumentenbackup-Manifest oder Prüfsumme fehlt.");
    }
    throw error;
  }
  const actualChecksum = createHash("sha256")
    .update(manifestBytes)
    .digest("hex");
  if (
    !checksumPattern.test(expectedChecksum) ||
    !timingSafeEqual(Buffer.from(expectedChecksum), Buffer.from(actualChecksum))
  ) {
    throw new Error("Die Manifest-Prüfsumme stimmt nicht.");
  }

  let value: unknown;
  try {
    value = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw new Error("Das Dokumentenbackup-Manifest ist ungültig.");
  }
  if (
    !isRecord(value) ||
    value.formatVersion !== 1 ||
    typeof value.createdAt !== "string" ||
    !Array.isArray(value.documents) ||
    !value.documents.every(isEntry)
  ) {
    throw new Error("Das Dokumentenbackup-Manifest ist nicht kompatibel.");
  }
  const paths = new Set<string>();
  for (const document of value.documents) {
    const relativePath = safeRelativePath(document.path);
    if (paths.has(relativePath)) {
      throw new Error("Das Dokumentenbackup enthält doppelte Pfade.");
    }
    paths.add(relativePath);
  }
  return value as unknown as DocumentBackupManifest;
};

const verifyBackupFile = async (
  backupDirectory: string,
  document: DocumentBackupEntry,
) => {
  const relativePath = safeRelativePath(document.path);
  const filePath = path.join(
    backupDirectory,
    documentsDirectoryName,
    ...relativePath.split("/"),
  );
  let info;
  try {
    info = await lstat(filePath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw new Error(`Dokumentenbackup-Datei fehlt: ${relativePath}`);
    }
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink() || info.size !== document.size) {
    throw new Error(`Dokumentenbackup-Datei ist ungültig: ${relativePath}`);
  }
  const actualChecksum = await sha256(filePath);
  if (
    !timingSafeEqual(Buffer.from(document.sha256), Buffer.from(actualChecksum))
  ) {
    throw new Error(`Dokumenten-Prüfsumme stimmt nicht: ${relativePath}`);
  }
  return filePath;
};

export const createDocumentBackup = async (options: {
  documentsDirectory: string;
  destinationDirectory: string;
}) => {
  if (
    !path.isAbsolute(options.documentsDirectory) ||
    !path.isAbsolute(options.destinationDirectory)
  ) {
    throw new Error("Dokumenten- und Backup-Pfade müssen absolut sein.");
  }
  if (await exists(options.destinationDirectory)) {
    throw new Error(
      "Das Backup-Ziel existiert bereits und wird nicht überschrieben.",
    );
  }
  await mkdir(path.dirname(options.destinationDirectory), { recursive: true });
  const stagingDirectory = `${options.destinationDirectory}.creating-${randomUUID()}`;
  try {
    const stagingDocuments = path.join(
      stagingDirectory,
      documentsDirectoryName,
    );
    await mkdir(stagingDocuments, { recursive: true, mode: 0o700 });
    const documents: DocumentBackupEntry[] = [];
    for (const relativePath of await listDocumentFiles(
      options.documentsDirectory,
    )) {
      const sourcePath = path.join(
        options.documentsDirectory,
        ...relativePath.split("/"),
      );
      const targetPath = path.join(
        stagingDocuments,
        ...relativePath.split("/"),
      );
      await mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
      await copyFile(sourcePath, targetPath);
      await chmod(targetPath, 0o600);
      const info = await lstat(targetPath);
      documents.push({
        path: relativePath,
        size: info.size,
        sha256: await sha256(targetPath),
      });
    }
    const manifest: DocumentBackupManifest = {
      formatVersion: 1,
      createdAt: new Date().toISOString(),
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

export const restoreDocumentBackup = async (options: {
  backupDirectory: string;
  targetDocumentsDirectory: string;
}) => {
  if (
    !path.isAbsolute(options.backupDirectory) ||
    !path.isAbsolute(options.targetDocumentsDirectory)
  ) {
    throw new Error("Backup- und Dokumentenpfade müssen absolut sein.");
  }
  if (await exists(options.targetDocumentsDirectory)) {
    throw new Error(
      "Das Restore-Ziel existiert bereits und wird nicht überschrieben.",
    );
  }
  const manifest = await readManifest(options.backupDirectory);
  for (const document of manifest.documents) {
    await verifyBackupFile(options.backupDirectory, document);
  }
  await mkdir(path.dirname(options.targetDocumentsDirectory), {
    recursive: true,
  });
  const stagingDirectory = `${options.targetDocumentsDirectory}.restoring-${randomUUID()}`;
  try {
    await mkdir(stagingDirectory, { recursive: true, mode: 0o700 });
    for (const document of manifest.documents) {
      const sourcePath = path.join(
        options.backupDirectory,
        documentsDirectoryName,
        ...document.path.split("/"),
      );
      const targetPath = path.join(
        stagingDirectory,
        ...document.path.split("/"),
      );
      await mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
      await copyFile(sourcePath, targetPath);
      await chmod(targetPath, 0o600);
    }
    await rename(stagingDirectory, options.targetDocumentsDirectory);
    return {
      targetDocumentsDirectory: options.targetDocumentsDirectory,
      documentCount: manifest.documents.length,
    };
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
};
