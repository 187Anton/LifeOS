import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  extractLocalDocumentText,
  LocalDocumentStorage,
  MAX_EXTRACTED_TEXT_BYTES,
  StoredDocumentNotFoundError,
  UnsafeStoragePathError,
} from "../src/modules/knowledge/storage.js";

const USER_ID = "00000000-0000-4000-8000-000000000701";

test("extrahiert nur begrenzte erlaubte UTF-8-Textformate lokal", () => {
  assert.equal(
    extractLocalDocumentText(
      "text/markdown",
      Buffer.from("# Synthetisch\r\n\r\nLokaler Text."),
    ),
    "# Synthetisch\n\nLokaler Text.",
  );
  assert.equal(
    extractLocalDocumentText("application/pdf", Buffer.from("kein PDF")),
    null,
  );
  assert.equal(
    extractLocalDocumentText("text/plain", Buffer.from([0xc3, 0x28])),
    null,
  );
  assert.equal(
    extractLocalDocumentText("text/plain", Buffer.from("unsicher\0text")),
    null,
  );
  assert.equal(
    extractLocalDocumentText(
      "text/plain",
      Buffer.alloc(MAX_EXTRACTED_TEXT_BYTES + 1, 97),
    ),
    null,
  );
});

test("speichert lokale Dokumente privat, prüfsummengeschützt und löschbar", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "lifeos-storage-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, "documents");
  const storage = new LocalDocumentStorage(root);
  const bytes = Buffer.from("Synthetischer lokaler Dokumentinhalt.");

  const stored = await storage.store(USER_ID, "Beispiel.TXT", bytes);
  assert.match(stored.storageKey, /^[0-9a-f-]{36}\.txt$/);
  assert.equal(stored.byteSize, bytes.byteLength);
  assert.equal(stored.sha256.length, 64);
  assert.deepEqual(await storage.read(USER_ID, stored.storageKey), bytes);
  assert.equal((await stat(root)).mode & 0o777, 0o700);
  assert.equal(
    (await stat(path.join(root, USER_ID, stored.storageKey))).mode & 0o777,
    0o600,
  );

  await storage.delete(USER_ID, stored.storageKey);
  await assert.rejects(
    storage.read(USER_ID, stored.storageKey),
    StoredDocumentNotFoundError,
  );
});

test("weist relative, fremde und symbolisch verknüpfte Pfade ab", async (t) => {
  assert.throws(
    () => new LocalDocumentStorage("relative/documents"),
    UnsafeStoragePathError,
  );
  const temporary = await mkdtemp(path.join(os.tmpdir(), "lifeos-storage-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, "documents");
  const storage = new LocalDocumentStorage(root);
  await storage.initialize();
  await assert.rejects(
    storage.read(USER_ID, "../secret.txt"),
    UnsafeStoragePathError,
  );

  const ownerDirectory = path.join(root, USER_ID);
  await mkdir(ownerDirectory, { mode: 0o700 });
  const outside = path.join(temporary, "outside.txt");
  await writeFile(outside, "nicht freigegeben");
  const linked = "00000000-0000-4000-8000-000000000702.txt";
  await symlink(outside, path.join(ownerDirectory, linked));
  await assert.rejects(storage.read(USER_ID, linked), UnsafeStoragePathError);
  assert.equal(await readFile(outside, "utf8"), "nicht freigegeben");
});
