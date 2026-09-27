import { parentPort, workerData } from "node:worker_threads";

import {
  getDocument,
  InvalidPDFException,
  PasswordException,
  VerbosityLevel,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import { WorkerMessageHandler } from "pdfjs-dist/legacy/build/pdf.worker.mjs";

import type {
  PdfExtractionOutcome,
  PdfExtractionOutcomeStatus,
  PdfPageText,
} from "./pdf-extraction-limits.js";

/**
 * Begrenzter PDF-Worker.
 *
 * Der Lauf findet in einem eigenen Thread mit harten Grenzen statt (siehe
 * `pdf-extraction-limits.ts`). Innerhalb dieses Threads werden bewusst
 * deaktiviert:
 *
 * - **Netzwerk:** Der Parser erhält ausschließlich `data`; es wird nie eine
 *   URL übergeben. Zusätzlich sind `disableAutoFetch`, `disableRange`,
 *   `disableStream` und `useWorkerFetch: false` gesetzt, damit auch bei
 *   unerwarteten Strukturen keine Bereichs- oder Folgeanfragen entstehen.
 * - **JavaScript:** Dokument-JavaScript wird nie ausgeführt. Die geprüfte
 *   Bibliotheksversion enthält dafür weder einen `eval`-Pfad noch eine
 *   Skript-Engine; Aktionen werden ausschließlich über ausdrücklich
 *   aufgerufene Getter sichtbar, die hier nie berührt werden.
 * - **Anhänge:** Eingebettete Dateien werden nie gelesen; `getAttachments`,
 *   `getAttachmentContent` und `getData` werden nicht aufgerufen.
 * - **Rendering:** Es wird nie gerendert. `disableFontFace: true`,
 *   `useSystemFonts: false`, `isOffscreenCanvasSupported: false` und
 *   `isImageDecoderSupported: false` schließen Schrift-, Bild- und
 *   Zeichenpfade aus; eine Canvas- oder native Abhängigkeit wird nicht
 *   benötigt. `page.getTextContent()` liefert ausschließlich Textseiten.
 *
 * Die Bibliothek läuft ohne eigenen Worker-Dateipfad: im Main-Thread-Handler
 * wird `WorkerMessageHandler` direkt bereitgestellt, sodass kein dynamischer
 * Import einer separaten Worker-Datei nötig ist.
 */

type WorkerScope = typeof globalThis & {
  pdfjsWorker?: {
    WorkerMessageHandler: { setup(handler: unknown, port: unknown): void };
  };
};

const scope = globalThis as WorkerScope;
scope.pdfjsWorker ??= { WorkerMessageHandler };

const asTextItem = (value: unknown) => {
  if (typeof value !== "object" || value === null) return null;
  const item = value as { str?: unknown; hasEOL?: unknown };
  return typeof item.str === "string"
    ? { str: item.str, hasEOL: item.hasEOL === true }
    : null;
};

/**
 * Verbindet die Textstücke einer Seite unverändert. Zwischen Stücken wird kein
 * Leerzeichen eingefügt, weil die Bibliothek Wörter an Kerngrenzen aufteilt;
 * ein eingefügtes Leerzeichen würde Wörter zerschneiden und die Suche brechen.
 * Ein Zeilenumbruch entsteht nur, wenn die Bibliothek ihn meldet.
 */
const joinTextItems = (items: readonly unknown[]) => {
  const parts: string[] = [];
  for (const value of items) {
    const item = asTextItem(value);
    if (!item || !item.str) continue;
    parts.push(item.str);
    if (item.hasEOL) parts.push("\n");
  }
  return parts.join("");
};

const normalizePageText = (value: string) =>
  value
    .replace(/\0/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const truncateToBytes = (value: string, maxBytes: number) => {
  if (maxBytes <= 0) return "";
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  const encoded = Buffer.from(value, "utf8").subarray(0, maxBytes);
  return new TextDecoder("utf-8").decode(encoded).replace(/\uFFFD+$/u, "");
};

const outcome = (
  status: PdfExtractionOutcomeStatus,
  values: Partial<PdfExtractionOutcome> = {},
): PdfExtractionOutcome => ({
  status,
  pageCount: values.pageCount ?? null,
  pages: values.pages ?? [],
  truncated: values.truncated ?? false,
  errorCode: values.errorCode ?? null,
});

const extract = async (
  bytes: Uint8Array,
  maxPages: number,
  maxTextBytes: number,
): Promise<PdfExtractionOutcome> => {
  const loadingTask = getDocument({
    data: bytes,
    disableFontFace: true,
    useSystemFonts: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    useWorkerFetch: false,
    disableAutoFetch: true,
    disableRange: true,
    disableStream: true,
    stopAtErrors: false,
    verbosity: VerbosityLevel.ERRORS,
  });
  try {
    const document = await loadingTask.promise;
    const pageCount = document.numPages;
    const pageLimit = Math.min(pageCount, maxPages);
    const pages: PdfPageText[] = [];
    let truncated = pageCount > maxPages;
    let totalBytes = 0;
    for (let index = 1; index <= pageLimit; index += 1) {
      const page = await document.getPage(index);
      let pageText: string;
      try {
        const content = await page.getTextContent();
        pageText = normalizePageText(joinTextItems(content.items));
      } finally {
        page.cleanup();
      }
      if (!pageText) continue;
      const pageBytes = Buffer.byteLength(pageText, "utf8");
      if (totalBytes + pageBytes > maxTextBytes) {
        const remainder = truncateToBytes(pageText, maxTextBytes - totalBytes);
        truncated = true;
        if (remainder) pages.push({ page: index, text: remainder });
        break;
      }
      totalBytes += pageBytes;
      pages.push({ page: index, text: pageText });
    }
    return pages.length
      ? outcome("available", { pageCount, pages, truncated })
      : outcome("no_text", { pageCount, truncated });
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
};

const run = async () => {
  const payload = workerData as {
    bytes?: unknown;
    maxPages?: unknown;
    maxTextBytes?: unknown;
  } | null;
  const bytes = payload?.bytes;
  const maxPages = payload?.maxPages;
  const maxTextBytes = payload?.maxTextBytes;
  /**
   * Die Grenzen kommen ausschließlich vom begrenzenden Elternprozess. Fehlt
   * eine gültige Grenze, wird nichts verarbeitet: es gibt bewusst keinen
   * stillen Standardwert, der die Obergrenze umgehen könnte.
   */
  if (
    !(bytes instanceof Uint8Array) ||
    typeof maxPages !== "number" ||
    !Number.isInteger(maxPages) ||
    maxPages < 1 ||
    typeof maxTextBytes !== "number" ||
    !Number.isInteger(maxTextBytes) ||
    maxTextBytes < 1
  ) {
    return outcome("failed", { errorCode: "parser_error" });
  }
  try {
    return await extract(bytes, maxPages, maxTextBytes);
  } catch (error) {
    if (error instanceof PasswordException) return outcome("protected");
    if (error instanceof InvalidPDFException)
      return outcome("failed", { errorCode: "invalid_pdf" });
    return outcome("failed", { errorCode: "parser_error" });
  }
};

parentPort?.postMessage(await run());
