import assert from "node:assert/strict";
import test from "node:test";

import { ApiError } from "../src/errors.js";
import {
  MAX_PDF_CONCURRENT_EXTRACTIONS,
  MAX_PDF_QUEUED_EXTRACTIONS,
} from "../src/modules/knowledge/pdf-extraction-limits.js";
import {
  PdfExtractionLimiter,
  pdfExtractionLimiter,
} from "../src/modules/knowledge/pdf-extraction-concurrency.js";
import { extractPdfDocumentText } from "../src/modules/knowledge/pdf-extractor.js";
import { hugeTextPdf, textPdf } from "./pdf-fixtures.js";

/**
 * Nachweise der prozessweiten Begrenzung gleichzeitiger PDF-Verarbeitungen.
 *
 * Die Tests prüfen die Begrenzung selbst (gleichzeitige Läufe, feste
 * Warteschlange, Überlaufabweisung, Freigabe in jedem Ausgang) und zusätzlich
 * den echten Zeitüberschreitungspfad der Parserbibliothek innerhalb der
 * Begrenzung.
 */

/** Wartet auf die nächste Makroaufgabe, damit Warteschlangen abgearbeitet sind. */
const flush = () =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

/** Ein Vorgang, der erst auf ausdrückliche Freigabe antwortet. */
const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((succeed, fail) => {
    resolve = succeed;
    reject = fail;
  });
  return { promise, resolve, reject };
};

test("dokumentiert die festen Grenzen der PDF-Verarbeitung", () => {
  assert.equal(MAX_PDF_CONCURRENT_EXTRACTIONS, 2);
  assert.equal(MAX_PDF_QUEUED_EXTRACTIONS, 4);
  assert.equal(
    pdfExtractionLimiter.concurrencyLimit,
    MAX_PDF_CONCURRENT_EXTRACTIONS,
  );
  assert.equal(pdfExtractionLimiter.queueLimit, MAX_PDF_QUEUED_EXTRACTIONS);
  /** Im Betrieb teilen sich alle Anfragen genau diese Instanz. */
  assert.equal(pdfExtractionLimiter.activeCount, 0);
  assert.equal(pdfExtractionLimiter.queuedCount, 0);
});

test("weist ungültige Grenzen ab", () => {
  assert.throws(
    () => new PdfExtractionLimiter({ maxConcurrent: 0 }),
    RangeError,
  );
  assert.throws(() => new PdfExtractionLimiter({ maxQueued: -1 }), RangeError);
  assert.throws(
    () => new PdfExtractionLimiter({ maxConcurrent: 1.5 }),
    RangeError,
  );
});

test("begrenzt gleichzeitige Verarbeitungen und weist Überlauf sofort ab", async () => {
  const limiter = new PdfExtractionLimiter({ maxConcurrent: 2, maxQueued: 1 });
  const gates = [deferred(), deferred(), deferred()];
  const started: number[] = [];
  let peak = 0;

  const runs = gates.map((gate, index) =>
    limiter.run(async () => {
      started.push(index);
      peak = Math.max(peak, limiter.activeCount);
      await gate.promise;
      return index;
    }),
  );
  await flush();

  /** Zwei Läufe arbeiten, der dritte wartet in der festen Warteschlange. */
  assert.deepEqual(started, [0, 1]);
  assert.equal(limiter.activeCount, 2);
  assert.equal(limiter.queuedCount, 1);

  /**
   * Weder ein weiterer Lauf noch ein weiterer Warteplatz entsteht: der
   * Überlauf wird sofort und sichtbar abgewiesen.
   */
  for (const attempt of [0, 1]) {
    await assert.rejects(
      limiter.run(async () => "nicht erlaubt"),
      (error: unknown) => {
        assert.equal(error instanceof ApiError, true);
        const apiError = error as ApiError;
        assert.equal(apiError.status, 429);
        assert.equal(apiError.code, "RATE_LIMITED");
        assert.match(apiError.message, /ausgelastet/);
        return true;
      },
      `Überlauf ${attempt} muss abgewiesen werden`,
    );
  }
  assert.equal(limiter.activeCount, 2);
  assert.equal(limiter.queuedCount, 1);
  assert.deepEqual(started, [0, 1]);

  for (const gate of gates) gate.resolve();
  assert.deepEqual(await Promise.all(runs), [0, 1, 2]);
  assert.equal(peak, 2);
  assert.equal(limiter.activeCount, 0);
  assert.equal(limiter.queuedCount, 0);
});

test("gibt den Platz nach Erfolg und nach Fehler wieder frei", async () => {
  const limiter = new PdfExtractionLimiter({ maxConcurrent: 1, maxQueued: 1 });

  assert.equal(await limiter.run(async () => "fertig"), "fertig");
  assert.equal(limiter.activeCount, 0);
  assert.equal(limiter.queuedCount, 0);

  await assert.rejects(
    limiter.run(async () => {
      throw new Error("Synthetischer Verarbeitungsfehler.");
    }),
    /Synthetischer Verarbeitungsfehler/,
  );
  assert.equal(limiter.activeCount, 0);
  assert.equal(limiter.queuedCount, 0);

  /** Ein synchroner Fehler vor dem ersten `await` belegt ebenfalls keinen Platz. */
  await assert.rejects(
    limiter.run(() => {
      throw new RangeError("Synthetischer Sofortfehler.");
    }),
    RangeError,
  );
  assert.equal(limiter.activeCount, 0);
  assert.equal(limiter.queuedCount, 0);

  /** Der freie Platz ist tatsächlich nutzbar. */
  assert.equal(await limiter.run(async () => "danach"), "danach");
});

test("gibt den Platz nach einer Zeitüberschreitung wieder frei", async () => {
  const limiter = new PdfExtractionLimiter({ maxConcurrent: 1, maxQueued: 1 });

  /**
   * Der echte Abbruchpfad: Die Laufzeitgrenze beendet den Worker, der Lauf
   * endet als `failed` mit `timeout` – und der Platz wird danach frei.
   */
  const timedOut = await limiter.run(() =>
    extractPdfDocumentText(hugeTextPdf(2_000_000), { timeoutMs: 1 }),
  );
  assert.equal(timedOut.status, "failed");
  assert.equal(timedOut.errorCode, "timeout");
  assert.deepEqual(timedOut.pages, []);
  assert.equal(limiter.activeCount, 0);
  assert.equal(limiter.queuedCount, 0);

  /** Eine echte Verarbeitung läuft danach wieder ohne Warteplatz. */
  const after = await limiter.run(() =>
    extractPdfDocumentText(textPdf("Text nach dem Abbruch")),
  );
  assert.equal(after.status, "available");
  assert.equal(after.pages[0]?.text, "Text nach dem Abbruch");
  assert.equal(limiter.activeCount, 0);
  assert.equal(limiter.queuedCount, 0);
});

test("arbeitet die Warteschlange in Eingangsreihenfolge und ohne Überschreitung ab", async () => {
  const limiter = new PdfExtractionLimiter({ maxConcurrent: 1, maxQueued: 2 });
  const gates = [deferred(), deferred(), deferred()];
  const order: number[] = [];
  let peak = 0;

  const runs = gates.map((gate, index) =>
    limiter.run(async () => {
      order.push(index);
      peak = Math.max(peak, limiter.activeCount);
      await gate.promise;
      return index;
    }),
  );
  await flush();
  assert.deepEqual(order, [0]);
  assert.equal(limiter.activeCount, 1);
  assert.equal(limiter.queuedCount, 2);

  gates[0]!.resolve();
  await flush();
  assert.deepEqual(order, [0, 1]);
  assert.equal(limiter.activeCount, 1);
  assert.equal(limiter.queuedCount, 1);

  gates[1]!.resolve();
  await flush();
  assert.deepEqual(order, [0, 1, 2]);
  assert.equal(limiter.activeCount, 1);
  assert.equal(limiter.queuedCount, 0);

  gates[2]!.resolve();
  assert.deepEqual(await Promise.all(runs), [0, 1, 2]);
  assert.equal(peak, 1);
  assert.equal(limiter.activeCount, 0);
});

test("belegt auch nach mehrfach abgewiesenen Anfragen keinen Platz", async () => {
  const limiter = new PdfExtractionLimiter({ maxConcurrent: 1, maxQueued: 0 });
  const gate = deferred();
  const running = limiter.run(async () => {
    await gate.promise;
    return "laufend";
  });
  await flush();
  assert.equal(limiter.activeCount, 1);
  assert.equal(limiter.queuedCount, 0);

  /** Ohne Warteschlange wird jeder weitere Lauf sofort abgewiesen. */
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await assert.rejects(
      limiter.run(async () => attempt),
      ApiError,
    );
  }
  assert.equal(limiter.activeCount, 1);
  assert.equal(limiter.queuedCount, 0);

  gate.resolve();
  assert.equal(await running, "laufend");
  assert.equal(limiter.activeCount, 0);
  assert.equal(limiter.queuedCount, 0);
});
