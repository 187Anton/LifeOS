import path from "node:path";

import {
  createDocumentBackup,
  restoreDocumentBackup,
} from "../packages/database/src/document-backup.js";

const requireAbsolutePath = (value: string | undefined, label: string) => {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${label} fehlt.`);
  if (!path.isAbsolute(normalized)) {
    throw new Error(`${label} muss ein absoluter Pfad sein.`);
  }
  return normalized;
};

const main = async () => {
  const [operation, argument] = process.argv.slice(2);
  const documentsDirectory = requireAbsolutePath(
    process.env.STORAGE_PATH,
    "STORAGE_PATH",
  );
  if (operation === "backup") {
    const result = await createDocumentBackup({
      documentsDirectory,
      destinationDirectory: requireAbsolutePath(argument, "Backup-Ziel"),
    });
    console.info(
      `Dokumentenbackup mit ${result.manifest.documents.length} Dateien erstellt: ${result.destinationDirectory}`,
    );
    return;
  }
  if (operation === "restore") {
    const result = await restoreDocumentBackup({
      backupDirectory: requireAbsolutePath(argument, "Backup-Quelle"),
      targetDocumentsDirectory: documentsDirectory,
    });
    console.info(
      `Dokumentenbackup mit ${result.documentCount} Dateien in ein neues Ziel restauriert: ${result.targetDocumentsDirectory}`,
    );
    return;
  }
  throw new Error("Erwartet wird backup oder restore.");
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unbekannter Fehler");
  process.exitCode = 1;
});
