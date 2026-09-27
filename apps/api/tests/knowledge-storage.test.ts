import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { version as pdfjsVersion } from "pdfjs-dist/legacy/build/pdf.mjs";

import {
  extractPdfDocumentText,
  hasPdfSignature,
  resolvePdfExtractorWorkerFile,
} from "../src/modules/knowledge/pdf-extractor.js";
import {
  LEGACY_TEXT_EXTRACTION_VERSION,
  MAX_PDF_PAGES,
  MAX_PDF_TEXT_BYTES,
  PDF_EXTRACTION_VERSION,
} from "../src/modules/knowledge/pdf-extraction-limits.js";
import {
  extractLocalDocumentText,
  isLocalTextMimeType,
  LocalDocumentStorage,
  MAX_DOCUMENT_BYTES,
  MAX_EXTRACTED_TEXT_BYTES,
  StoredDocumentNotFoundError,
  UnsafeStoragePathError,
} from "../src/modules/knowledge/storage.js";
import {
  attachmentPdf,
  brokenStructurePdf,
  encryptedPdf,
  hugeTextPdf,
  imageOnlyPdf,
  javascriptPdf,
  manyPagePdf,
  multiPagePdf,
  notAPdf,
  textPdf,
  truncatedPdf,
} from "./pdf-fixtures.js";

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

test("benennt die lokal lesbaren Textformate unabhängig von der Parserbibliothek", () => {
  assert.equal(isLocalTextMimeType("text/plain"), true);
  assert.equal(isLocalTextMimeType("application/json"), true);
  assert.equal(isLocalTextMimeType("application/pdf"), false);
  assert.equal(isLocalTextMimeType("text/rtf"), false);
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

// ---------------------------------------------------------------------------
// Paket 7: lokale PDF-Textextraktion
// ---------------------------------------------------------------------------

test("erkennt nur Inhalte mit PDF-Kennung", () => {
  assert.equal(hasPdfSignature(textPdf("Inhalt")), true);
  assert.equal(hasPdfSignature(notAPdf()), false);
  assert.equal(hasPdfSignature(Buffer.alloc(0)), false);
});

test("bindet die Extraktionsversion an die installierte Parserbibliothek", () => {
  assert.match(pdfjsVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(PDF_EXTRACTION_VERSION.includes(pdfjsVersion), true);
});

test("rechnet mit genau einer gemeinsamen Textgrenze", () => {
  assert.equal(MAX_PDF_TEXT_BYTES, MAX_EXTRACTED_TEXT_BYTES);
});

test("extrahiert Text einseitiger und mehrseitiger Dokumente mit Seitenzuordnung", async () => {
  const single = await extractPdfDocumentText(
    textPdf("Synthetische Vorlesung", "Zweite Zeile"),
  );
  assert.equal(single.status, "available");
  assert.equal(single.pageCount, 1);
  assert.deepEqual(single.pages, [
    { page: 1, text: "Synthetische Vorlesung\nZweite Zeile" },
  ]);
  assert.equal(single.errorCode, null);
  assert.equal(single.truncated, false);

  const multiple = await extractPdfDocumentText(
    multiPagePdf(["Erste Seite", "", "Dritte Seite"]),
  );
  assert.equal(multiple.status, "available");
  assert.equal(multiple.pageCount, 3);
  assert.deepEqual(
    multiple.pages.map((page) => page.page),
    [1, 3],
  );
  assert.match(multiple.pages[1]!.text, /Dritte Seite/);
});

test("meldet Seiten ohne Text als kein Text, statt Text zu erfinden", async () => {
  const outcome = await extractPdfDocumentText(imageOnlyPdf(3));
  assert.equal(outcome.status, "no_text");
  assert.equal(outcome.pageCount, 3);
  assert.deepEqual(outcome.pages, []);
  assert.equal(outcome.errorCode, null);

  const empty = await extractPdfDocumentText(multiPagePdf(["", ""]));
  assert.equal(empty.status, "no_text");
  assert.equal(empty.pageCount, 2);
});

test("meldet geschützte Dokumente als geschützt und ohne Inhalt", async () => {
  const outcome = await extractPdfDocumentText(
    encryptedPdf("Streng vertraulich", "nutzerpasswort", "besitzerpasswort"),
  );
  assert.equal(outcome.status, "protected");
  assert.deepEqual(outcome.pages, []);
  assert.equal(outcome.errorCode, null);
  assert.equal(outcome.pageCount, null);
});

test("meldet defekte und abgeschnittene Dokumente als ungültiges PDF", async () => {
  const truncated = await extractPdfDocumentText(truncatedPdf());
  assert.equal(truncated.status, "failed");
  assert.equal(truncated.errorCode, "invalid_pdf");
  assert.deepEqual(truncated.pages, []);

  const foreign = await extractPdfDocumentText(notAPdf());
  assert.equal(foreign.status, "failed");
  assert.equal(foreign.errorCode, "invalid_pdf");

  const withoutXref = await extractPdfDocumentText(brokenStructurePdf());
  assert.equal(withoutXref.status, "failed");
  assert.equal(withoutXref.errorCode, "invalid_pdf");
});

test("begrenzt die Seitenzahl reproduzierbar", async () => {
  const outcome = await extractPdfDocumentText(manyPagePdf(12), {
    maxPages: 4,
  });
  assert.equal(outcome.status, "no_text");
  assert.equal(outcome.truncated, true);
  assert.equal(outcome.pageCount, 12);

  const withText = await extractPdfDocumentText(
    multiPagePdf(["Eins", "Zwei", "Drei"]),
    { maxPages: 2 },
  );
  assert.equal(withText.truncated, true);
  assert.deepEqual(
    withText.pages.map((page) => page.page),
    [1, 2],
  );

  assert.equal(MAX_PDF_PAGES, 1_000);
});

test("begrenzt die extrahierte Textmenge reproduzierbar", async () => {
  const outcome = await extractPdfDocumentText(hugeTextPdf(50_000), {
    maxTextBytes: 5_000,
  });
  assert.equal(outcome.status, "available");
  assert.equal(outcome.truncated, true);
  const total = outcome.pages.reduce(
    (sum, page) => sum + Buffer.byteLength(page.text, "utf8"),
    0,
  );
  assert.equal(total <= 5_000, true);
  assert.equal(outcome.pages.length >= 1, true);
});

test("begrenzt die Laufzeit und bricht blockierte Läufe ab", async () => {
  const outcome = await extractPdfDocumentText(hugeTextPdf(2_000_000), {
    timeoutMs: 1,
  });
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.errorCode, "timeout");
  assert.deepEqual(outcome.pages, []);
});

test("weist zu große Eingaben ab, bevor sie verarbeitet werden", () => {
  assert.equal(MAX_DOCUMENT_BYTES, 26_214_400);
  const oversized = Buffer.alloc(MAX_DOCUMENT_BYTES + 1, 0x41);
  return assert.rejects(
    new LocalDocumentStorage(
      path.join(os.tmpdir(), "lifeos-p7-oversized"),
    ).store(USER_ID, "zu-gross.pdf", oversized),
    RangeError,
  );
});

test("verarbeitet Dokumente ohne Netzzugriff, JavaScript und Anhänge", async () => {
  const originalFetch = globalThis.fetch;
  const fetchCalls: string[] = [];
  const evalCalls: string[] = [];
  const originalEval = globalThis.eval;
  globalThis.fetch = ((input: unknown) => {
    fetchCalls.push(String(input));
    throw new Error("Netzzugriff ist im PDF-Worker nicht erlaubt.");
  }) as typeof globalThis.fetch;
  globalThis.eval = ((source: string) => {
    evalCalls.push(source);
    throw new Error("eval ist im PDF-Worker nicht erlaubt.");
  }) as typeof globalThis.eval;
  const marker = "lifeosPaket7SkriptMarker";
  const globalScope = globalThis as Record<string, unknown>;
  try {
    const attachment = await extractPdfDocumentText(
      attachmentPdf("Seitentext vor Anhang"),
    );
    assert.equal(attachment.status, "available");
    assert.deepEqual(attachment.pages, [
      { page: 1, text: "Seitentext vor Anhang" },
    ]);
    /* Der eingebettete Anhang bleibt ungelesen und taucht nirgends auf. */
    assert.equal(
      attachment.pages.some((page) =>
        page.text.includes("Eingebetteter Anhangsinhalt"),
      ),
      false,
    );

    const scripted = await extractPdfDocumentText(
      javascriptPdf("Seitentext mit Aktion", marker),
    );
    assert.equal(scripted.status, "available");
    assert.deepEqual(scripted.pages, [
      { page: 1, text: "Seitentext mit Aktion" },
    ]);
    assert.equal(globalScope[marker], undefined);
    assert.deepEqual(evalCalls, []);
    assert.deepEqual(fetchCalls, []);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.eval = originalEval;
    delete globalScope[marker];
  }
});

test("liest den Text unverändert aus dem gebündelten Workerpfad", async () => {
  const workerFile = resolvePdfExtractorWorkerFile();
  const source = await readFile(workerFile, "utf8");
  /** Kommentare werden ausgenommen, damit Erklärungen nicht als Nutzung gelten. */
  const code = source
    .split("\n")
    .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
    .join("\n");
  /**
   * Der Worker darf keine Anhang-, Render-, Skript- oder Schriftpfade öffnen
   * und keine zweite Worker- oder native Laufzeit erwarten.
   */
  for (const forbidden of [
    "getAttachments",
    "getAttachmentContent",
    "getJSActions",
    "getFieldObjects",
    "render(",
    "workerSrc",
    "standard_fonts",
    "cMapUrl",
    "napi-rs",
  ]) {
    assert.equal(
      code.includes(forbidden),
      false,
      `Der PDF-Worker darf ${forbidden} nicht verwenden.`,
    );
  }
  assert.equal(code.includes('from "pdfjs-dist'), true);
  assert.match(code, /disableAutoFetch: true/);
  assert.match(code, /disableRange: true/);
  assert.match(code, /disableStream: true/);
  assert.match(code, /useWorkerFetch: false/);
  assert.match(code, /disableFontFace: true/);
  assert.match(code, /isOffscreenCanvasSupported: false/);
});

test("kennzeichnet die datenerhaltende Übernahme der Altextraktionen", async () => {
  const migration = await readFile(
    fileURLToPath(
      new URL(
        "../../../packages/database/prisma/migrations/20260926120000_document_pdf_extraction/migration.sql",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  assert.equal(migration.includes(LEGACY_TEXT_EXTRACTION_VERSION), true);
  assert.match(migration, /WHERE "extractedText" IS NOT NULL/);
  assert.match(migration, /"extractionStatus" = 'available'/);
});
