import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createDocumentBackup,
  restoreDocumentBackup,
} from "../src/document-backup.js";

const updateManifestChecksum = async (backupDirectory: string) => {
  const manifestPath = path.join(backupDirectory, "manifest.json");
  const bytes = await readFile(manifestPath);
  await writeFile(
    path.join(backupDirectory, "manifest.sha256"),
    `${createHash("sha256").update(bytes).digest("hex")}\n`,
  );
};

test("sichert Dokumente privat und restauriert ausschließlich in ein neues Ziel", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lifeos-documents-"));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, "source");
  const backup = path.join(directory, "backup");
  const target = path.join(directory, "target");
  await mkdir(path.join(source, "owner"), { recursive: true });
  await writeFile(path.join(source, "owner", "opaque-key"), "synthetisch\n");

  const created = await createDocumentBackup({
    documentsDirectory: source,
    destinationDirectory: backup,
  });
  assert.equal(created.manifest.documents.length, 1);
  assert.equal((await lstat(backup)).mode & 0o777, 0o700);
  assert.equal(
    (await lstat(path.join(backup, "documents", "owner", "opaque-key"))).mode &
      0o777,
    0o600,
  );

  const restored = await restoreDocumentBackup({
    backupDirectory: backup,
    targetDocumentsDirectory: target,
  });
  assert.equal(restored.documentCount, 1);
  assert.equal(
    await readFile(path.join(target, "owner", "opaque-key"), "utf8"),
    "synthetisch\n",
  );
  assert.equal((await lstat(target)).mode & 0o777, 0o700);

  await assert.rejects(
    () =>
      restoreDocumentBackup({
        backupDirectory: backup,
        targetDocumentsDirectory: target,
      }),
    /existiert bereits/,
  );
  await assert.rejects(
    () =>
      createDocumentBackup({
        documentsDirectory: source,
        destinationDirectory: backup,
      }),
    /existiert bereits/,
  );
});

test("weist fehlende, manipulierte und pfadfremde Backup-Inhalte zurück", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lifeos-documents-"));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, "source");
  const backup = path.join(directory, "backup");
  await mkdir(source);
  await writeFile(path.join(source, "document"), "synthetisch\n");
  await createDocumentBackup({
    documentsDirectory: source,
    destinationDirectory: backup,
  });

  const missingChecksum = path.join(directory, "missing-checksum");
  await cp(backup, missingChecksum, { recursive: true });
  await unlink(path.join(missingChecksum, "manifest.sha256"));
  await assert.rejects(
    () =>
      restoreDocumentBackup({
        backupDirectory: missingChecksum,
        targetDocumentsDirectory: path.join(directory, "missing-target"),
      }),
    /Manifest oder Prüfsumme fehlt/,
  );

  const missingDocument = path.join(directory, "missing-document");
  await cp(backup, missingDocument, { recursive: true });
  await unlink(path.join(missingDocument, "documents", "document"));
  await assert.rejects(
    () =>
      restoreDocumentBackup({
        backupDirectory: missingDocument,
        targetDocumentsDirectory: path.join(directory, "document-target"),
      }),
    /Datei fehlt/,
  );

  const traversal = path.join(directory, "traversal");
  await cp(backup, traversal, { recursive: true });
  const manifestPath = path.join(traversal, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    documents: Array<{ path: string }>;
  };
  manifest.documents[0]!.path = "../fremd";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await updateManifestChecksum(traversal);
  await assert.rejects(
    () =>
      restoreDocumentBackup({
        backupDirectory: traversal,
        targetDocumentsDirectory: path.join(directory, "traversal-target"),
      }),
    /unsicheren Pfad/,
  );
});

test("folgt beim Dokumentenbackup keinen symbolischen Links", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lifeos-documents-"));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, "source");
  const outside = path.join(directory, "outside");
  await mkdir(source);
  await writeFile(outside, "nicht sichern\n");
  await symlink(outside, path.join(source, "link"));
  await assert.rejects(
    () =>
      createDocumentBackup({
        documentsDirectory: source,
        destinationDirectory: path.join(directory, "backup"),
      }),
    /Symbolische Links/,
  );
});

test("weist verschachtelte Backup- und Restore-Ziele vor jedem Schreiben zurück", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lifeos-documents-"));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, "source");
  await mkdir(source);
  await writeFile(path.join(source, "document"), "synthetisch\n");

  await assert.rejects(
    () =>
      createDocumentBackup({
        documentsDirectory: source,
        destinationDirectory: path.join(source, "backup"),
      }),
    /nicht im zu sichernden Dokumentenverzeichnis/,
  );
  assert.equal(
    await lstat(path.join(source, "backup")).catch(() => null),
    null,
  );

  const backup = path.join(directory, "backup");
  await createDocumentBackup({
    documentsDirectory: source,
    destinationDirectory: backup,
  });
  await assert.rejects(
    () =>
      restoreDocumentBackup({
        backupDirectory: backup,
        targetDocumentsDirectory: path.join(backup, "restored"),
      }),
    /nicht innerhalb des Backups/,
  );
});
