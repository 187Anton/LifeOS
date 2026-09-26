import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import {
  MAX_PDF_PAGES,
  MAX_PDF_TEXT_BYTES,
  PDF_EXTRACTION_MEMORY_LIMIT_MB,
  PDF_EXTRACTION_TIMEOUT_MS,
  PDF_HEADER_SCAN_BYTES,
  type PdfExtractionOutcome,
  type PdfExtractionOutcomeStatus,
  type PdfPageText,
} from "./pdf-extraction-limits.js";

/**
 * Lokaler PDF-Extractor.
 *
 * Der eigentliche Parserlauf findet in `pdf-extractor-thread.ts` in einem
 * eigenen Thread mit festen Speicher- und Laufzeitgrenzen statt. Diese Datei
 * ist die begrenzende Schicht davor: Sie prüft die Eingabe, startet den
 * begrenzten Worker, erzwingt die Laufzeitgrenze durch Beenden des Workers und
 * begrenzt Seitenzahl und Textmenge zusätzlich auf der veröffentlichenden
 * Seite. Sie selbst liest kein PDF und importiert keine Parserbibliothek.
 */

/** Fehlercodes dieser Schicht. */
const ERROR_CODES = {
  invalidPdf: "invalid_pdf",
  parserError: "parser_error",
  timeout: "timeout",
  memoryLimit: "memory_limit",
  workerUnavailable: "worker_unavailable",
} as const;

export class PdfExtractorUnavailableError extends Error {}

/**
 * Mögliche Ablageorte der gebündelten Workerdatei, relativ zu dieser Datei.
 *
 * Die Reihenfolge ist absichtlich fest und wird nicht aus der Umgebung
 * abgeleitet: Im Quellbetrieb liegt die Workerdatei neben dieser Datei
 * (`*.ts`), im gebündelten Laufzeitpaket behält der Bundler die Verzeichnisse
 * bei und legt sie unter `modules/knowledge/` neben den Server (`*.js`). Genau
 * eine der beiden Varianten existiert je Laufzeitpaket.
 */
const WORKER_FILE_CANDIDATES = [
  "pdf-extractor-thread.ts",
  "modules/knowledge/pdf-extractor-thread.js",
  "pdf-extractor-thread.js",
] as const;

export const resolvePdfExtractorWorkerFile = (
  base: URL = new URL(".", import.meta.url),
): string => {
  for (const candidate of WORKER_FILE_CANDIDATES) {
    const target = fileURLToPath(new URL(candidate, base));
    if (existsSync(target)) return target;
  }
  throw new PdfExtractorUnavailableError(
    "Die gebündelte PDF-Workerdatei fehlt im lokalen Laufzeitpaket.",
  );
};

/** `true`, wenn der Inhalt mit der Dateikennung `%PDF-` beginnt. */
export const hasPdfSignature = (bytes: Uint8Array): boolean => {
  const window = bytes.subarray(
    0,
    Math.min(bytes.byteLength, PDF_HEADER_SCAN_BYTES),
  );
  for (let index = 0; index + 5 <= window.byteLength; index += 1) {
    if (
      window[index] === 0x25 &&
      window[index + 1] === 0x50 &&
      window[index + 2] === 0x44 &&
      window[index + 3] === 0x46 &&
      window[index + 4] === 0x2d
    ) {
      return true;
    }
  }
  return false;
};

const failure = (errorCode: string): PdfExtractionOutcome => ({
  status: "failed",
  pageCount: null,
  pages: [],
  truncated: false,
  errorCode,
});

const outcomeStatuses = new Set<string>([
  "available",
  "no_text",
  "protected",
  "unsupported",
  "failed",
] satisfies PdfExtractionOutcomeStatus[]);

const isPdfPageText = (value: unknown): value is PdfPageText => {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as { page?: unknown; text?: unknown };
  return (
    typeof entry.page === "number" &&
    Number.isInteger(entry.page) &&
    entry.page >= 1 &&
    typeof entry.text === "string" &&
    entry.text.length > 0
  );
};

/**
 * Übernimmt ausschließlich die erwartete Form aus dem Worker. Alles andere
 * wird zu einem klaren Fehlerzustand, damit ein unerwartetes Worker-Ergebnis
 * nie ungeprüft an die Suche gelangt.
 */
const sanitizeOutcome = (value: unknown): PdfExtractionOutcome => {
  if (typeof value !== "object" || value === null)
    return failure(ERROR_CODES.parserError);
  const record = value as Record<string, unknown>;
  if (typeof record.status !== "string" || !outcomeStatuses.has(record.status))
    return failure(ERROR_CODES.parserError);
  const pages = Array.isArray(record.pages)
    ? record.pages.filter(isPdfPageText).slice(0, MAX_PDF_PAGES)
    : [];
  return {
    status: record.status as PdfExtractionOutcomeStatus,
    pageCount:
      typeof record.pageCount === "number" &&
      Number.isInteger(record.pageCount) &&
      record.pageCount >= 0
        ? record.pageCount
        : null,
    pages,
    truncated: record.truncated === true,
    errorCode:
      typeof record.errorCode === "string" &&
      /^[a-z0-9_]{1,50}$/.test(record.errorCode)
        ? record.errorCode
        : null,
  };
};

/**
 * Setzt die veröffentlichten Grenzen auf der Seite durch, die die Daten
 * weitergibt. Damit greifen Seiten- und Textgrenze auch dann reproduzierbar,
 * wenn der Worker sie nicht einhielte.
 */
const boundOutcome = (
  value: PdfExtractionOutcome,
  maxPages: number,
  maxTextBytes: number,
): PdfExtractionOutcome => {
  if (value.status !== "available") return value;
  const pages: PdfPageText[] = [];
  let totalBytes = 0;
  let truncated = value.truncated;
  for (const page of value.pages) {
    if (pages.length >= maxPages) {
      truncated = true;
      break;
    }
    const pageBytes = Buffer.byteLength(page.text, "utf8");
    if (totalBytes + pageBytes > maxTextBytes) {
      truncated = true;
      break;
    }
    totalBytes += pageBytes;
    pages.push(page);
  }
  return pages.length
    ? { ...value, pages, truncated }
    : { ...value, status: "no_text", pages, truncated };
};

const workerFailureCode = (error: unknown) => {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  if (code === "ERR_WORKER_OUT_OF_MEMORY") return ERROR_CODES.memoryLimit;
  /**
   * Ein Ladefehler des Workers ist eine Umgebungsfrage und kein defektes PDF.
   * Er wird deshalb sichtbar als nicht verfügbarer Extractor gemeldet, statt
   * als Parserfehler zu erscheinen.
   */
  if (
    code === "ERR_MODULE_NOT_FOUND" ||
    code === "ERR_UNKNOWN_FILE_EXTENSION" ||
    code === "ERR_UNSUPPORTED_ESM_URL_SCHEME"
  )
    return ERROR_CODES.workerUnavailable;
  return ERROR_CODES.parserError;
};

export interface PdfExtractionOptions {
  timeoutMs?: number;
  maxPages?: number;
  maxTextBytes?: number;
  memoryLimitMb?: number;
}

const collectOutcome = (worker: Worker, timeoutMs: number) =>
  new Promise<PdfExtractionOutcome>((resolve) => {
    let settled = false;
    const finish = (value: PdfExtractionOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    /**
     * Die Laufzeitgrenze wird im Elternprozess erzwungen. Der Worker läuft in
     * einem eigenen Thread; ein blockierender Parserlauf kann deshalb auch
     * dann beendet werden, wenn er selbst nicht mehr kooperiert.
     */
    const timer = setTimeout(() => {
      void worker.terminate();
      finish(failure(ERROR_CODES.timeout));
    }, timeoutMs);
    worker.once("message", (message) => finish(sanitizeOutcome(message)));
    worker.once("error", (error) => finish(failure(workerFailureCode(error))));
    worker.once("exit", () => finish(failure(ERROR_CODES.parserError)));
  });

/**
 * Liest ausschließlich Textseiten aus einem PDF. Netzwerk-, JavaScript-,
 * Anhang- und Renderpfade sind im Worker deaktiviert; es wird kein Klartext
 * protokolliert.
 */
export const extractPdfDocumentText = async (
  bytes: Buffer,
  options: PdfExtractionOptions = {},
): Promise<PdfExtractionOutcome> => {
  if (!hasPdfSignature(bytes)) return failure(ERROR_CODES.invalidPdf);
  const timeoutMs = options.timeoutMs ?? PDF_EXTRACTION_TIMEOUT_MS;
  const maxPages = options.maxPages ?? MAX_PDF_PAGES;
  const maxTextBytes = options.maxTextBytes ?? MAX_PDF_TEXT_BYTES;
  const memoryLimitMb = options.memoryLimitMb ?? PDF_EXTRACTION_MEMORY_LIMIT_MB;

  let worker: Worker;
  try {
    worker = new Worker(resolvePdfExtractorWorkerFile(), {
      workerData: {
        bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
        maxPages,
        maxTextBytes,
      },
      resourceLimits: { maxOldGenerationSizeMb: memoryLimitMb },
      name: "lifeos-pdf-extractor",
      // Parserausgaben des Workers werden bewusst nicht in die Serverlogs
      // gespiegelt: sie können Ausschnitte aus Dokumenten enthalten.
      stdout: true,
      stderr: true,
    });
  } catch {
    return failure(ERROR_CODES.workerUnavailable);
  }
  try {
    return boundOutcome(
      await collectOutcome(worker, timeoutMs),
      maxPages,
      maxTextBytes,
    );
  } finally {
    await worker.terminate().catch(() => undefined);
  }
};
