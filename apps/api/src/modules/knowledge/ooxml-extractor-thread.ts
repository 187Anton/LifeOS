import { parentPort, workerData } from "node:worker_threads";

import {
  defaultOoxmlExtractionLimits,
  type OoxmlDocumentKind,
  type OoxmlExtractionLimits,
  type OoxmlExtractionOutcome,
} from "./ooxml-extraction-limits.js";
import { extractOoxmlDocumentText } from "./ooxml-extractor.js";

/**
 * Begrenzter OOXML-Worker (PPTX/DOCX).
 *
 * Der eigentliche Lauf findet in einem eigenen Thread mit harter Speicher- und
 * Laufzeitgrenze statt. Der Thread ist dafür verantwortlich, dass ZIP-Entpacken
 * und XML-Parsing niemals den Event-Loop des API-Prozesses blockieren: Der
 * Aufrufer kann den Thread jederzeit beenden und behält dadurch die Kontrolle
 * über die Frist.
 *
 * Innerhalb dieses Threads bleibt die Verarbeitung strikt lokal:
 *
 * - **Kein Netzwerk:** es gibt keinen Abruf-, Auflösungs- oder Folgepfad;
 *   externe Beziehungen werden erkannt und nie aufgelöst.
 * - **Keine Makroausführung:** ein Makroprojekt oder ein als makrofähig
 *   deklarierter Inhaltstyp führt zum Abbruch, ohne etwas zu laden.
 * - **Keine DTD/Entities:** jede Deklaration wird vor dem Parsen abgelehnt.
 *
 * Die Grenzen kommen ausschließlich vom begrenzenden Elternprozess. Fehlt eine
 * gültige Angabe, wird nichts verarbeitet: es gibt bewusst keinen stillen
 * Standardwert, der eine Obergrenze umgehen könnte.
 */

const failure = (errorCode: string): OoxmlExtractionOutcome => ({
  status: "failed",
  locatorCount: null,
  locators: [],
  truncated: false,
  errorCode,
});

/** Akzeptiert ausschließlich die zwei bekannten OOXML-Formate. */
const asKind = (value: unknown): OoxmlDocumentKind | null =>
  value === "pptx" || value === "docx" ? value : null;

/**
 * Übernimmt ausschließlich bekannte, positive ganzzahlige Grenzen. Ein
 * unbekannter Schlüssel oder ein ungültiger Wert lässt den Lauf scheitern,
 * statt still auf einen Standardwert zurückzufallen.
 */
const asLimits = (value: unknown): Partial<OoxmlExtractionLimits> | null => {
  if (typeof value !== "object" || value === null) return null;
  const defaults = defaultOoxmlExtractionLimits();
  const record = value as Record<string, unknown>;
  const limits: Partial<OoxmlExtractionLimits> = {};
  for (const key of Object.keys(defaults) as Array<
    keyof OoxmlExtractionLimits
  >) {
    const candidate = record[key];
    if (candidate === undefined) continue;
    if (
      typeof candidate !== "number" ||
      !Number.isInteger(candidate) ||
      candidate < 1
    ) {
      return null;
    }
    limits[key] = candidate;
  }
  return limits;
};

const run = (): OoxmlExtractionOutcome => {
  const payload = workerData as {
    kind?: unknown;
    bytes?: unknown;
    limits?: unknown;
  } | null;
  const kind = asKind(payload?.kind);
  const bytes = payload?.bytes;
  const limits = asLimits(payload?.limits);
  if (kind === null || !(bytes instanceof Uint8Array) || limits === null) {
    return failure("parser_error");
  }
  try {
    return extractOoxmlDocumentText(kind, Buffer.from(bytes), { limits });
  } catch {
    /**
     * Ein unerwarteter Fehler wird zu einem klaren Fehlerzustand. Der
     * Stacktrace bleibt im Worker und wird nicht an den Aufrufer übertragen,
     * weil er Ausschnitte aus dem Dokument enthalten kann.
     */
    return failure("parser_error");
  }
};

parentPort?.postMessage(run());
