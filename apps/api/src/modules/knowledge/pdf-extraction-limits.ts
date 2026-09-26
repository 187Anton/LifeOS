import type { DocumentExtractionStatus } from "@lifeos/contracts";

import { MAX_EXTRACTED_TEXT_BYTES } from "./storage.js";

/**
 * Feste, reproduzierbare Grenzen der lokalen PDF-Textextraktion.
 *
 * Paket 7 verarbeitet ausschließlich lokal und ohne externen Dienst. Die
 * Grenzen greifen vor und während der Verarbeitung:
 *
 * - Eingabegröße: `MAX_DOCUMENT_BYTES` (25 MiB) aus `storage.ts`; größere
 *   Dateien erreichen den Extractor gar nicht erst.
 * - Seitenzahl: höchstens `MAX_PDF_PAGES` Seiten werden ausgewertet. Eine
 *   größere Datei wird gekürzt veröffentlicht (`truncated`).
 * - Extrahierter Text: höchstens `MAX_PDF_TEXT_BYTES` (identisch mit der
 *   bestehenden Textgrenze) über alle Seiten zusammen. Darüber hinaus wird
 *   gekürzt veröffentlicht (`truncated`).
 * - Laufzeit: `PDF_EXTRACTION_TIMEOUT_MS` je Verarbeitung. Der Lauf findet in
 *   einem eigenen begrenzten Worker statt; bei Überschreitung wird er beendet.
 * - Speicher: `PDF_EXTRACTION_MEMORY_LIMIT_MB` als harte V8-Obergrenze genau
 *   dieses Workers.
 * - Gleichzeitigkeit: höchstens `MAX_PDF_CONCURRENT_EXTRACTIONS` Verarbeitungen
 *   laufen je Prozess gleichzeitig; zusätzliche Anfragen warten in einer auf
 *   `MAX_PDF_QUEUED_EXTRACTIONS` begrenzten Warteschlange. Ist auch diese
 *   belegt, wird die Anfrage sofort mit `429 RATE_LIMITED` abgewiesen, statt
 *   weitere Worker oder Wartende aufzubauen. Die Begrenzung gilt prozessweit
 *   für alle Besitzer und beide Einstiegspfade (Upload und erneute
 *   Verarbeitung).
 */
export const MAX_PDF_PAGES = 1_000;
export const MAX_PDF_TEXT_BYTES = MAX_EXTRACTED_TEXT_BYTES;
export const PDF_EXTRACTION_TIMEOUT_MS = 20_000;
export const PDF_EXTRACTION_MEMORY_LIMIT_MB = 256;
export const MAX_PDF_CONCURRENT_EXTRACTIONS = 2;
export const MAX_PDF_QUEUED_EXTRACTIONS = 4;

/**
 * Extraktionsversionen. Sie sind bewusst als feste Zeichenketten hinterlegt und
 * werden durch Tests gegen die tatsächlich installierte Bibliotheksversion
 * beziehungsweise gegen die Migrationskennzeichnung geprüft, damit gespeicherte
 * Ergebnisse nachvollziehbar bleiben.
 */
export const PDF_EXTRACTION_VERSION = "pdfjs-6.3.289/text-v1";

/** Version der bestehenden Extraktion für die lokalen Textformate. */
export const LOCAL_TEXT_EXTRACTION_VERSION = "local-text-v1";

/** Kennzeichnung der datenerhaltend übernommenen Altextraktionen. */
export const LEGACY_TEXT_EXTRACTION_VERSION = "legacy-text-v1";

/** Prüfbereich für die Dateikennung `%PDF-` am Anfang des Inhalts. */
export const PDF_HEADER_SCAN_BYTES = 1_024;

/** Statuswerte, die eine abgeschlossene Extraktion annehmen kann. */
export type PdfExtractionOutcomeStatus = Exclude<
  DocumentExtractionStatus,
  "pending"
>;

export interface PdfPageText {
  readonly page: number;
  readonly text: string;
}

/**
 * Ergebnis einer lokalen Extraktion. `pages` enthält ausschließlich Seiten mit
 * Text und ist auf die oben genannten Grenzen begrenzt.
 */
export interface PdfExtractionOutcome {
  readonly status: PdfExtractionOutcomeStatus;
  /** Vom Parser gemeldete Gesamtseitenzahl; `null`, wenn nicht lesbar. */
  readonly pageCount: number | null;
  readonly pages: PdfPageText[];
  readonly truncated: boolean;
  readonly errorCode: string | null;
}

/** Fehlercodes, die an der Quelle auf einen abgebrochenen Lauf hinweisen. */
export const PDF_EXTRACTION_ERROR_CODES = [
  "invalid_pdf",
  "parser_error",
  "timeout",
  "memory_limit",
  "worker_unavailable",
] as const;

export type PdfExtractionErrorCode =
  (typeof PDF_EXTRACTION_ERROR_CODES)[number];
