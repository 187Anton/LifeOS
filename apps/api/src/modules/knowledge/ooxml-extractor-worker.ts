import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import type { DocumentLocator } from "@lifeos/contracts";

import {
  MAX_OOXML_LOCATORS,
  OOXML_EXTRACTION_MEMORY_LIMIT_MB,
  OOXML_EXTRACTION_TIMEOUT_MS,
  defaultOoxmlExtractionLimits,
  type OoxmlDocumentKind,
  type OoxmlExtractionLimits,
  type OoxmlExtractionOutcome,
  type OoxmlExtractionOutcomeStatus,
} from "./ooxml-extraction-limits.js";
import { hasZipSignature } from "./ooxml-zip.js";

/**
 * Begrenzende Schicht vor dem OOXML-Worker.
 *
 * Diese Datei entpackt und parst im aufrufenden Prozess nichts: Sie prüft nur
 * die ZIP-Kennung der Eingabe (billige Vorabprüfung, die einen Threadstart für
 * offensichtlich fremde Daten spart) und ist sonst ausschließlich dafür
 * zuständig, dass die Verarbeitung den API-Prozess nicht blockieren kann:
 *
 * - Sie startet den begrenzten Worker (`ooxml-extractor-thread.ts`) mit harter
 *   V8-Speichergrenze und ohne Netzwerk-, Makro- oder Renderpfad.
 * - Sie erzwingt die Laufzeitgrenze **hart** im aufrufenden Prozess: Bei Ablauf
 *   wird der Thread beendet, und erst danach wird `timeout` gemeldet. Ein
 *   blockierender Entpack- oder Parsevorgang kann sich dieser Frist nicht
 *   entziehen.
 * - Sie beendet den Thread in jedem Ausgang (Ergebnis, Fehler, Abbruch,
 *   Zeitüberschreitung) und gibt den Begrenzungsplatz damit verlässlich frei.
 * - Sie übernimmt ausschließlich die erwartete Ergebnisform und setzt Folien-,
 *   Absatz- und Textgrenze zusätzlich auf der veröffentlichenden Seite durch,
 *   damit ein unerwartetes Worker-Ergebnis nie ungeprüft an die Suche gelangt.
 */

/** Fehlercodes dieser Schicht. */
const ERROR_CODES = {
  invalidZip: "invalid_zip",
  parserError: "parser_error",
  timeout: "timeout",
  memoryLimit: "memory_limit",
  workerUnavailable: "worker_unavailable",
} as const;

export class OoxmlExtractorUnavailableError extends Error {}

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
  "ooxml-extractor-thread.ts",
  "modules/knowledge/ooxml-extractor-thread.js",
  "ooxml-extractor-thread.js",
] as const;

export const resolveOoxmlExtractorWorkerFile = (
  base: URL = new URL(".", import.meta.url),
): string => {
  for (const candidate of WORKER_FILE_CANDIDATES) {
    const target = fileURLToPath(new URL(candidate, base));
    if (existsSync(target)) return target;
  }
  throw new OoxmlExtractorUnavailableError(
    "Die gebündelte OOXML-Workerdatei fehlt im lokalen Laufzeitpaket.",
  );
};

/**
 * Zahl der gerade laufenden OOXML-Worker-Threads dieses Prozesses.
 *
 * Der Zähler macht die Zusage „ein Thread wird in jedem Ausgang beendet“
 * beobachtbar: Er steigt genau beim Start und fällt beim tatsächlichen Ende des
 * Threads (`exit`), nicht schon beim Absetzen von `terminate()`.
 */
let liveThreads = 0;

export const ooxmlExtractorThreadsInUse = (): number => liveThreads;

const failure = (errorCode: string): OoxmlExtractionOutcome => ({
  status: "failed",
  locatorCount: null,
  locators: [],
  truncated: false,
  errorCode,
});

const outcomeStatuses = new Set<string>([
  "available",
  "no_text",
  "protected",
  "unsupported",
  "failed",
] satisfies OoxmlExtractionOutcomeStatus[]);

const isUnit = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1;

const isText = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

/** Übernimmt ausschließlich die drei bekannten Fundstellenformen. */
const isLocator = (value: unknown): value is DocumentLocator => {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  if (!isText(entry.text)) return false;
  if ("page" in entry && isUnit(entry.page))
    return entry.slide === undefined && entry.paragraph === undefined;
  if ("slide" in entry && isUnit(entry.slide))
    return entry.page === undefined && entry.paragraph === undefined;
  return (
    "paragraph" in entry &&
    isUnit(entry.paragraph) &&
    entry.page === undefined &&
    entry.slide === undefined &&
    (entry.section === null || typeof entry.section === "string")
  );
};

/**
 * Übernimmt ausschließlich die erwartete Form aus dem Worker. Alles andere
 * wird zu einem klaren Fehlerzustand, damit ein unerwartetes Worker-Ergebnis
 * nie ungeprüft an die Suche gelangt.
 */
const sanitizeOutcome = (value: unknown): OoxmlExtractionOutcome => {
  if (typeof value !== "object" || value === null)
    return failure(ERROR_CODES.parserError);
  const record = value as Record<string, unknown>;
  if (typeof record.status !== "string" || !outcomeStatuses.has(record.status))
    return failure(ERROR_CODES.parserError);
  const locators = Array.isArray(record.locators)
    ? record.locators.filter(isLocator).slice(0, MAX_OOXML_LOCATORS)
    : [];
  return {
    status: record.status as OoxmlExtractionOutcomeStatus,
    locatorCount:
      typeof record.locatorCount === "number" &&
      Number.isInteger(record.locatorCount) &&
      record.locatorCount >= 0
        ? record.locatorCount
        : null,
    locators,
    truncated: record.truncated === true,
    errorCode:
      typeof record.errorCode === "string" &&
      /^[a-z0-9_]{1,50}$/.test(record.errorCode)
        ? record.errorCode
        : null,
  };
};

/**
 * Setzt Fundstellen- und Textgrenze auf der Seite durch, die die Daten
 * weitergibt. Damit greifen beide Grenzen auch dann reproduzierbar, wenn der
 * Worker sie nicht einhielte.
 */
const boundOutcome = (
  value: OoxmlExtractionOutcome,
  limits: OoxmlExtractionLimits,
): OoxmlExtractionOutcome => {
  if (value.status !== "available") return value;
  const locators: DocumentLocator[] = [];
  let totalBytes = 0;
  let truncated = value.truncated;
  for (const locator of value.locators) {
    if (locators.length >= limits.maxLocators) {
      truncated = true;
      break;
    }
    const locatorBytes = Buffer.byteLength(locator.text, "utf8");
    if (totalBytes + locatorBytes > limits.maxTextBytes) {
      truncated = true;
      break;
    }
    totalBytes += locatorBytes;
    locators.push(locator);
  }
  return locators.length
    ? { ...value, locators, truncated }
    : { ...value, status: "no_text", locators, truncated };
};

const workerFailureCode = (error: unknown) => {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  if (code === "ERR_WORKER_OUT_OF_MEMORY") return ERROR_CODES.memoryLimit;
  /**
   * Ein Ladefehler des Workers ist eine Umgebungsfrage und kein defektes
   * Dokument. Er wird deshalb sichtbar als nicht verfügbarer Extractor
   * gemeldet, statt als Parserfehler zu erscheinen.
   */
  if (
    code === "ERR_MODULE_NOT_FOUND" ||
    code === "ERR_UNKNOWN_FILE_EXTENSION" ||
    code === "ERR_UNSUPPORTED_ESM_URL_SCHEME"
  )
    return ERROR_CODES.workerUnavailable;
  return ERROR_CODES.parserError;
};

/**
 * Wartet auf das Worker-Ergebnis und erzwingt dabei die harte Frist.
 *
 * Bei Ablauf wird der Thread zuerst beendet und die Beendigung abgewartet;
 * erst danach wird `timeout` gemeldet. Dadurch ist der Thread tatsächlich weg,
 * wenn der Aufrufer den Begrenzungsplatz freigibt. Ein danach eintreffendes
 * `exit`-Ereignis kann das gemeldete Ergebnis nicht mehr verändern.
 */
const collectOutcome = (worker: Worker, timeoutMs: number) =>
  new Promise<OoxmlExtractionOutcome>((resolve) => {
    let settled = false;
    let timedOut = false;
    const finish = (value: OoxmlExtractionOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      void worker
        .terminate()
        .catch(() => undefined)
        .then(() => finish(failure(ERROR_CODES.timeout)));
    }, timeoutMs);
    worker.once("message", (message) => finish(sanitizeOutcome(message)));
    worker.once("error", (error) => finish(failure(workerFailureCode(error))));
    worker.once("exit", () =>
      /**
       * Ein Ende ohne Ergebnis ist ein Abbruch: Nach einer Zeitüberschreitung
       * ist das die erwartete Beendigung, sonst ein Parserfehler.
       */
      finish(failure(timedOut ? ERROR_CODES.timeout : ERROR_CODES.parserError)),
    );
  });

/**
 * Startargumente des Worker-Threads.
 *
 * Im gebündelten Laufzeitpaket liegen fertige `.js`-Dateien vor; dort ist
 * nichts weiter nötig. Im Quellbetrieb ist die Workerdatei eine `.ts`-Datei, und
 * dafür fehlt Worker-Threads genau das, was der Entwicklungs-Starter im
 * Hauptthread bereitstellt:
 *
 * - Sie erben dessen Auflösung nicht, und Node leitet aus einem
 *   `.js`-Spezifizierer keine `.ts`-Datei ab (`ooxml-source-loader.mjs`).
 * - Node entfernt Typen nur; nicht löschbare Syntax wie Parameter-Eigenschaften
 *   wird ausschließlich mit `--experimental-transform-types` übersetzt.
 *
 * Beides betrifft nur den Quellbetrieb und wird deshalb an die Dateiendung
 * gebunden statt an eine Umgebungsvariable.
 */
const workerExecArgv = (workerFile: string): string[] | undefined =>
  workerFile.endsWith(".ts")
    ? [
        "--experimental-transform-types",
        "--import",
        fileURLToPath(new URL("./ooxml-source-loader.mjs", import.meta.url)),
      ]
    : undefined;

export interface OoxmlWorkerExtractionOptions {
  limits?: Partial<OoxmlExtractionLimits>;
  timeoutMs?: number;
  memoryLimitMb?: number;
}

/**
 * Liest ausschließlich Text aus PPTX und DOCX – in einem begrenzten Worker mit
 * harter Frist, ohne Netzwerk-, Makro- oder Renderpfade. Es wird kein Klartext
 * protokolliert; Worker-Ausgaben werden nicht in die Serverlogs gespiegelt.
 */
export const extractOoxmlDocumentTextInWorker = async (
  kind: OoxmlDocumentKind,
  bytes: Buffer,
  options: OoxmlWorkerExtractionOptions = {},
): Promise<OoxmlExtractionOutcome> => {
  if (!hasZipSignature(bytes)) return failure(ERROR_CODES.invalidZip);
  const limits: OoxmlExtractionLimits = {
    ...defaultOoxmlExtractionLimits(),
    ...options.limits,
  };
  const timeoutMs = options.timeoutMs ?? OOXML_EXTRACTION_TIMEOUT_MS;
  const memoryLimitMb =
    options.memoryLimitMb ?? OOXML_EXTRACTION_MEMORY_LIMIT_MB;

  let worker: Worker;
  try {
    const workerFile = resolveOoxmlExtractorWorkerFile();
    const execArgv = workerExecArgv(workerFile);
    worker = new Worker(workerFile, {
      workerData: {
        kind,
        bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
        limits,
      },
      resourceLimits: { maxOldGenerationSizeMb: memoryLimitMb },
      ...(execArgv ? { execArgv } : {}),
      name: "lifeos-ooxml-extractor",
      stdout: true,
      stderr: true,
    });
  } catch {
    return failure(ERROR_CODES.workerUnavailable);
  }
  liveThreads += 1;
  /** Wird beim tatsächlichen Ende des Threads erfüllt, nicht beim Absetzen. */
  const exited = new Promise<void>((resolve) => {
    worker.once("exit", () => {
      liveThreads -= 1;
      resolve();
    });
  });
  try {
    return boundOutcome(await collectOutcome(worker, timeoutMs), limits);
  } finally {
    /**
     * In jedem Ausgang – Ergebnis, Fehler, Abbruch oder Zeitüberschreitung –
     * wird der Thread beendet und sein tatsächliches Ende abgewartet. Erst
     * danach gibt der Aufrufer den Begrenzungsplatz frei; ein beendeter Thread
     * kann deshalb weder einen Platz noch Speicher länger belegen.
     */
    await worker.terminate().catch(() => undefined);
    await exited;
  }
};
