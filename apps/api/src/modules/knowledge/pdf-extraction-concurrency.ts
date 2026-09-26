import { ApiError } from "../../errors.js";
import {
  MAX_PDF_CONCURRENT_EXTRACTIONS,
  MAX_PDF_QUEUED_EXTRACTIONS,
} from "./pdf-extraction-limits.js";

/**
 * Prozessweite Begrenzung gleichzeitiger PDF-Verarbeitungen.
 *
 * Jede Verarbeitung startet einen eigenen Worker-Thread mit eigener
 * Speichergrenze. Ohne Begrenzung könnten parallele Uploads oder erneute
 * Verarbeitungen beliebig viele dieser Threads erzeugen. Diese Klasse hält die
 * Zahl gleichzeitig laufender Verarbeitungen hart fest und lässt zusätzliche
 * Anfragen nur in eine kleine, feste Warteschlange. Ist auch die Warteschlange
 * belegt, wird die Anfrage sofort mit einem klaren API-Fehler abgewiesen, statt
 * unbegrenzt zu warten – der Aufrufer entscheidet dann selbst über einen
 * erneuten Versuch.
 *
 * Die Begrenzung sitzt in derselben Anwendungsschicht wie die Verarbeitung und
 * gilt für alle Besitzer sowie für beide Einstiegspfade (Upload und erneute
 * Verarbeitung). Sie ersetzt keine der bestehenden Grenzen: Seiten-, Text-,
 * Laufzeit- und Speichergrenze bleiben unverändert wirksam.
 *
 * Ein Platz wird in jedem Ausgang freigegeben – nach Erfolg, nach einem Fehler
 * und nach einem abgebrochenen Lauf (Zeit- oder Speichergrenze). Deshalb kann
 * eine abgewiesene oder abgebrochene Verarbeitung die Warteschlange nicht
 * dauerhaft belegen.
 */
export interface PdfExtractionLimiterOptions {
  /** Gleichzeitig laufende Verarbeitungen; Standard aus den festen Grenzen. */
  maxConcurrent?: number;
  /** Wartende Verarbeitungen; Standard aus den festen Grenzen. */
  maxQueued?: number;
}

const requirePositiveInteger = (value: number, name: string): number => {
  if (!Number.isInteger(value) || value < 1)
    throw new RangeError(`${name} muss eine ganze Zahl ab 1 sein.`);
  return value;
};

const requireNonNegativeInteger = (value: number, name: string): number => {
  if (!Number.isInteger(value) || value < 0)
    throw new RangeError(`${name} muss eine ganze Zahl ab 0 sein.`);
  return value;
};

export class PdfExtractionLimiter {
  private readonly maxConcurrent: number;
  private readonly maxQueued: number;
  private running = 0;
  /** Wartende Aufrufe in Eingangsreihenfolge; nie länger als `maxQueued`. */
  private readonly waiting: Array<() => void> = [];

  constructor(options: PdfExtractionLimiterOptions = {}) {
    this.maxConcurrent = requirePositiveInteger(
      options.maxConcurrent ?? MAX_PDF_CONCURRENT_EXTRACTIONS,
      "maxConcurrent",
    );
    this.maxQueued = requireNonNegativeInteger(
      options.maxQueued ?? MAX_PDF_QUEUED_EXTRACTIONS,
      "maxQueued",
    );
  }

  /** Zahl der gerade laufenden Verarbeitungen. */
  get activeCount(): number {
    return this.running;
  }

  /** Zahl der wartenden Verarbeitungen. */
  get queuedCount(): number {
    return this.waiting.length;
  }

  /** Feste Obergrenze gleichzeitig laufender Verarbeitungen. */
  get concurrencyLimit(): number {
    return this.maxConcurrent;
  }

  /** Feste Obergrenze wartender Verarbeitungen. */
  get queueLimit(): number {
    return this.maxQueued;
  }

  /**
   * Führt eine Verarbeitung innerhalb der Begrenzung aus. Ist weder ein Platz
   * frei noch ein Warteplatz vorhanden, wird sofort abgewiesen.
   */
  async run<T>(operation: () => Promise<T>): Promise<T> {
    /** Die Freigabe erfolgt ausschließlich nach einem erworbenen Platz. */
    await this.acquire();
    try {
      return await operation();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running += 1;
      return Promise.resolve();
    }
    if (this.waiting.length >= this.maxQueued) {
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "Die lokale PDF-Verarbeitung ist ausgelastet. Bitte versuche es in wenigen Sekunden erneut.",
      );
    }
    return new Promise<void>((resolve) => {
      this.waiting.push(() => {
        this.running += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.running -= 1;
    const next = this.waiting.shift();
    /**
     * Ein wartender Aufruf übernimmt den frei gewordenen Platz unmittelbar;
     * seine Verarbeitung beginnt erst nach dem Zurücksetzen des Zählers.
     */
    if (next) next();
  }
}

/**
 * Genau eine Instanz je Prozess. Alle Anfragen – unabhängig vom Besitzer und
 * unabhängig davon, ob sie über den Upload oder die erneute Verarbeitung
 * kommen – teilen sich diese Begrenzung. Der lokale API-Server und das
 * gebündelte Laufzeitpaket sind getrennte Prozesse mit jeweils eigener
 * Begrenzung.
 */
export const pdfExtractionLimiter = new PdfExtractionLimiter();
