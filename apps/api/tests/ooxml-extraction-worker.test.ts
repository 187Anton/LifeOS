import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { performance } from "node:perf_hooks";
import { test } from "node:test";

import { PDF_EXTRACTION_MEMORY_LIMIT_MB } from "../src/modules/knowledge/pdf-extraction-limits.js";
import { PdfExtractionLimiter } from "../src/modules/knowledge/pdf-extraction-concurrency.js";
import {
  MAX_OOXML_COMPRESSION_RATIO,
  MAX_OOXML_COMPRESSED_BYTES,
  MAX_OOXML_ENTRIES,
  MAX_OOXML_ENTRY_BYTES,
  MAX_OOXML_LOCATORS,
  MAX_OOXML_PART_BYTES,
  MAX_OOXML_TEXT_BYTES,
  MAX_OOXML_TOTAL_UNCOMPRESSED_BYTES,
  MAX_OOXML_XML_BYTES,
  OOXML_EXTRACTION_MEMORY_LIMIT_MB,
  OOXML_EXTRACTION_TIMEOUT_MS,
} from "../src/modules/knowledge/ooxml-extraction-limits.js";
import { extractOoxmlDocumentText } from "../src/modules/knowledge/ooxml-extractor.js";
import {
  extractOoxmlDocumentTextInWorker,
  ooxmlExtractorThreadsInUse,
  resolveOoxmlExtractorWorkerFile,
} from "../src/modules/knowledge/ooxml-extractor-worker.js";
import { buildDocx, buildPptx } from "./ooxml-fixtures.js";

/**
 * Tests der begrenzenden Schicht vor dem OOXML-Worker.
 *
 * Geprüft wird die Zusage dieser Schicht, nicht die Textgewinnung selbst: Ein
 * Lauf findet in einem eigenen Thread mit harter Frist statt, ein Ablauf beendet
 * den Thread, und in jedem Ausgang werden Thread, Timer und Begrenzungsplatz
 * freigegeben. Der Nachweis erfolgt über echte Workerläufe, nicht über
 * Attrappen: Nur so ist belegt, dass ZIP-Entpacken und XML-Parsing den
 * Event-Loop des aufrufenden Prozesses tatsächlich nicht blockieren.
 */

/**
 * Bewusst große Vorlage: Das Entpacken und Parsen dauert lange genug, dass eine
 * kurze Frist mitten in der Arbeit greift und eine parallele Anfrage beantwortet
 * werden kann, während der Worker noch beschäftigt ist.
 */
const slowDocx = buildDocx({
  paragraphs: Array.from({ length: 120_000 }, (_, index) => ({
    text: `Absatz ${index + 1} mit ausreichend Textinhalt für eine echte Messung.`,
  })),
});

const smallDocx = buildDocx({
  paragraphs: [
    { text: "Methodik", style: "Heading1", outline: 0 },
    { text: "Ein kurzer Absatz für den Vergleich mit dem gemeinsamen Kern." },
  ],
});

const smallPptx = buildPptx({
  slides: [
    { fileName: "slide1.xml", paragraphs: ["Erste Folie"] },
    { fileName: "slide2.xml", paragraphs: ["Zweite Folie"] },
  ],
});

const measure = async <T>(operation: () => Promise<T> | T) => {
  const start = performance.now();
  const value = await operation();
  return { value, durationMs: performance.now() - start };
};

test("verarbeitet PPTX und DOCX im Worker wie der gemeinsame Kern", async () => {
  const workerFile = resolveOoxmlExtractorWorkerFile();
  assert.ok(
    existsSync(workerFile),
    "Die Workerdatei muss im laufenden Laufzeitpaket auffindbar sein.",
  );

  for (const [kind, bytes] of [
    ["docx", smallDocx],
    ["pptx", smallPptx],
  ] as const) {
    const expected = extractOoxmlDocumentText(kind, bytes);
    const outcome = await extractOoxmlDocumentTextInWorker(kind, bytes);
    assert.deepEqual(
      outcome,
      expected,
      `Der Workerlauf für ${kind} muss dieselben Fundstellen liefern wie der gemeinsame Kern.`,
    );
    assert.equal(outcome.status, "available");
  }

  /** Nach einem Lauf darf kein Thread dieses Prozesses übrig bleiben. */
  assert.equal(ooxmlExtractorThreadsInUse(), 0);
});

test("beendet den Worker bei Zeitüberschreitung und gibt den Platz frei", async () => {
  const limiter = new PdfExtractionLimiter({ maxConcurrent: 1, maxQueued: 1 });

  /**
   * Belegt, dass die Frist tatsächlich laufende Arbeit abbricht: Der gleiche
   * Inhalt braucht im Kern deutlich länger als die Frist des Workerlaufs. Die
   * Frist wird aus der gemessenen Dauer abgeleitet, damit die Prüfung nicht an
   * einer festen Millisekundenzahl hängt.
   */
  const { durationMs: uninterruptedMs } = await measure(() =>
    extractOoxmlDocumentText("docx", slowDocx),
  );
  const deadlineMs = Math.max(25, Math.floor(uninterruptedMs / 10));

  const outcome = await limiter.run(() =>
    extractOoxmlDocumentTextInWorker("docx", slowDocx, {
      timeoutMs: deadlineMs,
    }),
  );

  assert.equal(outcome.status, "failed");
  assert.equal(outcome.errorCode, "timeout");
  assert.deepEqual(outcome.locators, []);
  assert.equal(outcome.locatorCount, null);
  assert.equal(outcome.truncated, false);
  assert.ok(
    uninterruptedMs > deadlineMs,
    "Die Frist muss kürzer sein als die ununterbrochene Verarbeitung.",
  );

  /** Thread, Timer und Begrenzungsplatz sind danach vollständig frei. */
  assert.equal(ooxmlExtractorThreadsInUse(), 0);
  assert.equal(limiter.activeCount, 0);
  assert.equal(limiter.queuedCount, 0);

  /** Der freigegebene Platz ist sofort wieder nutzbar. */
  const next = await limiter.run(() =>
    extractOoxmlDocumentTextInWorker("docx", smallDocx),
  );
  assert.equal(next.status, "available");
  assert.equal(limiter.activeCount, 0);
  assert.equal(ooxmlExtractorThreadsInUse(), 0);
});

test("beantwortet eine parallele Anfrage während der Verarbeitung", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("erreichbar");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/`;

  try {
    const start = performance.now();
    let extractionOutcome: unknown;
    const extraction = extractOoxmlDocumentTextInWorker("docx", slowDocx).then(
      (outcome) => {
        extractionOutcome = outcome;
        return outcome;
      },
    );

    /** Solange der Worker arbeitet, muss der Event-Loop Anfragen bedienen. */
    const response = await fetch(url);
    const responseMs = performance.now() - start;
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "erreichbar");
    /**
     * Die Antwort ist eingetroffen, **bevor** der Workerlauf ein Ergebnis
     * geliefert hat. Würde im aufrufenden Prozess entpackt und geparst, könnte
     * die Anfrage erst nach dem Ende der Verarbeitung beantwortet werden und
     * dieses Feld wäre hier bereits gesetzt.
     */
    assert.equal(
      extractionOutcome,
      undefined,
      "Die parallele Anfrage muss vor dem Ergebnis beantwortet werden.",
    );

    const outcome = await extraction;
    const extractionMs = performance.now() - start;
    assert.equal(
      outcome.status,
      "available",
      "Der Workerlauf muss trotz paralleler Anfrage vollständig durchlaufen.",
    );
    assert.ok(
      outcome.locators.length > 0,
      "Der Workerlauf muss Fundstellen liefern.",
    );
    assert.ok(
      extractionMs > responseMs,
      "Der Arbeitsaufwand muss größer sein als die Antwortzeit.",
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("gibt den Platz nach Ablehnung, Parserfehler und Speichergrenze frei", async () => {
  const limiter = new PdfExtractionLimiter({ maxConcurrent: 1, maxQueued: 1 });

  /** Ohne ZIP-Kennung wird gar kein Thread gestartet. */
  const withoutSignature = await limiter.run(() =>
    extractOoxmlDocumentTextInWorker(
      "docx",
      Buffer.from("ganz sicher kein ZIP"),
    ),
  );
  assert.equal(withoutSignature.status, "failed");
  assert.equal(withoutSignature.errorCode, "invalid_zip");
  assert.equal(ooxmlExtractorThreadsInUse(), 0);

  /** Ein defektes Archiv endet im Worker als Parserfehler, nicht als Absturz. */
  const damaged = await limiter.run(() =>
    extractOoxmlDocumentTextInWorker(
      "docx",
      buildDocx({ paragraphs: [{ text: "Defekt" }], corruptDocument: true }),
    ),
  );
  assert.equal(damaged.status, "failed");
  assert.equal(damaged.errorCode, "damaged_zip");
  assert.equal(ooxmlExtractorThreadsInUse(), 0);

  /**
   * Erreicht der Lauf die Speichergrenze des Threads, endet genau dieser Lauf;
   * der aufrufende Prozess bleibt arbeitsfähig und der Platz wird frei.
   */
  const overLimit = await limiter.run(() =>
    extractOoxmlDocumentTextInWorker("docx", slowDocx, { memoryLimitMb: 16 }),
  );
  assert.equal(overLimit.status, "failed");
  assert.equal(overLimit.errorCode, "memory_limit");
  assert.deepEqual(overLimit.locators, []);
  assert.equal(ooxmlExtractorThreadsInUse(), 0);
  assert.equal(limiter.activeCount, 0);
  assert.equal(limiter.queuedCount, 0);

  /** Nach allen drei Ausgängen ist derselbe Platz weiterhin benutzbar. */
  const next = await limiter.run(() =>
    extractOoxmlDocumentTextInWorker("pptx", smallPptx),
  );
  assert.equal(next.status, "available");
  assert.equal(limiter.activeCount, 0);
  assert.equal(ooxmlExtractorThreadsInUse(), 0);
});

test("deckt die festen Grenzen die Arbeit des Workers ab", () => {
  assert.equal(OOXML_EXTRACTION_TIMEOUT_MS, 20_000);
  assert.ok(Number.isInteger(OOXML_EXTRACTION_MEMORY_LIMIT_MB));
  /**
   * OOXML hält im Worker zusätzlich zu den geparsten XML-Objekten die
   * entpackten Teile und einen Entpackpuffer. Die Speichergrenze ist deshalb
   * bewusst größer als die des PDF-Workers, der nur Textseiten hält.
   */
  assert.ok(OOXML_EXTRACTION_MEMORY_LIMIT_MB > PDF_EXTRACTION_MEMORY_LIMIT_MB);
  /** Gestaffelte Archivgrenzen: Teil, Gesamtmenge, Eintrag, Kompressionsverhältnis. */
  assert.ok(MAX_OOXML_PART_BYTES <= MAX_OOXML_XML_BYTES);
  assert.ok(MAX_OOXML_ENTRY_BYTES <= MAX_OOXML_TOTAL_UNCOMPRESSED_BYTES);
  assert.ok(MAX_OOXML_COMPRESSED_BYTES <= MAX_OOXML_TOTAL_UNCOMPRESSED_BYTES);
  assert.ok(MAX_OOXML_COMPRESSION_RATIO >= 1);
  assert.ok(MAX_OOXML_ENTRIES >= MAX_OOXML_LOCATORS);
  assert.ok(MAX_OOXML_TEXT_BYTES >= 1);
});
