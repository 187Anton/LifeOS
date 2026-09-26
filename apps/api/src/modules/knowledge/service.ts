import { createHash } from "node:crypto";

import type {
  CreateNoteRequest,
  UpdateDocumentRequest,
  UpdateNoteRequest,
} from "@lifeos/contracts";

import { ApiError } from "../../errors.js";
import {
  pdfExtractionLimiter,
  type PdfExtractionLimiter,
} from "./pdf-extraction-concurrency.js";
import { extractPdfDocumentText } from "./pdf-extractor.js";
import {
  LOCAL_TEXT_EXTRACTION_VERSION,
  PDF_EXTRACTION_VERSION,
} from "./pdf-extraction-limits.js";
import {
  KnowledgeRecordNotFoundError,
  KnowledgeReferenceNotFoundError,
  type DocumentChanges,
  type DocumentExtractionValues,
  type KnowledgeRepository,
  type NoteChanges,
} from "./repository.js";
import {
  extractLocalDocumentText,
  isLocalTextMimeType,
  MAX_EXTRACTED_TEXT_BYTES,
  StoredDocumentNotFoundError,
  UnsafeStoragePathError,
} from "./storage.js";
import type { LocalDocumentStorage } from "./storage.js";

const PDF_MIME_TYPE = "application/pdf";

const normalizedTags = (tags: string[] = []) => [
  ...new Set(tags.map((tag) => tag.trim()).filter(Boolean)),
];

/**
 * Ein gespeichertes Dokument bleibt auch dann auffindbar und herunterladbar,
 * wenn die Extraktion scheitert. Ein Parserfehler führt deshalb zu einem
 * klaren Fehlerzustand am Dokument und nie zum Verlust der Datei.
 */
export class KnowledgeService {
  constructor(
    private readonly repository: KnowledgeRepository,
    private readonly storage: LocalDocumentStorage,
    private readonly now: () => Date = () => new Date(),
    /**
     * Prozessweite Begrenzung der PDF-Verarbeitung. Im Betrieb ist das die
     * gemeinsame Instanz aller Anfragen; Tests können eine eigene, engere
     * Begrenzung übergeben.
     */
    private readonly pdfExtraction: PdfExtractionLimiter = pdfExtractionLimiter,
  ) {}

  getOverview(userId: string, includeArchived = false) {
    return this.handle(() =>
      this.repository.getOverview(userId, includeArchived),
    );
  }
  getNote(userId: string, noteId: string) {
    return this.handle(() => this.repository.getNote(userId, noteId));
  }
  createNote(userId: string, input: CreateNoteRequest) {
    return this.handle(() =>
      this.repository.createNote(userId, {
        title: input.title,
        content: input.content,
        format: "markdown",
        category: input.category ?? null,
        tags: normalizedTags(input.tags),
        projectId: input.projectId ?? null,
        studyModuleId: input.studyModuleId ?? null,
        searchEnabled: input.searchEnabled ?? false,
      }),
    );
  }
  updateNote(userId: string, noteId: string, input: UpdateNoteRequest) {
    const { archived, ...values } = input;
    const changes = { ...values } as NoteChanges;
    if (Object.hasOwn(input, "category"))
      changes.category = input.category ?? null;
    if (Object.hasOwn(input, "projectId"))
      changes.projectId = input.projectId ?? null;
    if (Object.hasOwn(input, "studyModuleId"))
      changes.studyModuleId = input.studyModuleId ?? null;
    if (Object.hasOwn(input, "tags")) changes.tags = normalizedTags(input.tags);
    if (archived !== undefined)
      changes.archivedAt = archived ? this.now() : null;
    return this.handle(() =>
      this.repository.updateNote(userId, noteId, changes),
    );
  }
  deleteNote(userId: string, noteId: string) {
    return this.handle(() =>
      this.repository.deleteNote(userId, noteId, this.now()),
    );
  }

  async uploadDocument(
    userId: string,
    input: {
      fileName: string;
      mimeType: string;
      bytes: Buffer;
      projectId?: string | null;
      studyModuleId?: string | null;
      searchEnabled?: boolean;
    },
  ) {
    const stored = await this.handle(() =>
      this.storage.store(userId, input.fileName, input.bytes),
    );
    try {
      const extraction = await this.extractDocumentText(
        input.mimeType,
        input.bytes,
        stored.sha256,
      );
      return await this.handle(() =>
        this.repository.createDocument(userId, {
          ...stored,
          fileName: input.fileName,
          mimeType: input.mimeType,
          projectId: input.projectId ?? null,
          studyModuleId: input.studyModuleId ?? null,
          searchEnabled: input.searchEnabled ?? false,
          extraction,
        }),
      );
    } catch (error) {
      await this.storage
        .delete(userId, stored.storageKey)
        .catch(() => undefined);
      throw error;
    }
  }

  async downloadDocument(userId: string, documentId: string) {
    const record = await this.handle(() =>
      this.repository.getDocumentRecord(userId, documentId),
    );
    const bytes = await this.handle(() =>
      this.storage.read(userId, record.storageKey),
    );
    this.verifyIntegrity(record, bytes);
    return { record, bytes };
  }

  /**
   * Verarbeitet ein bereits abgelegtes, freigegebenes Dokument erneut. Der
   * Besitzer wird über den Repository-Zugriff erzwungen; vor dem Speichern
   * läuft dieselbe SHA-256-Prüfung wie beim Herunterladen.
   */
  async reprocessDocument(userId: string, documentId: string) {
    const record = await this.handle(() =>
      this.repository.getDocumentRecord(userId, documentId),
    );
    const bytes = await this.handle(() =>
      this.storage.read(userId, record.storageKey),
    );
    this.verifyIntegrity(record, bytes);
    const extraction = await this.extractDocumentText(
      record.mimeType,
      bytes,
      record.sha256,
    );
    return this.handle(() =>
      this.repository.replaceDocumentExtraction(userId, documentId, extraction),
    );
  }

  updateDocument(
    userId: string,
    documentId: string,
    input: UpdateDocumentRequest,
  ) {
    const { archived, ...values } = input;
    const changes = { ...values } as DocumentChanges;
    if (Object.hasOwn(input, "projectId"))
      changes.projectId = input.projectId ?? null;
    if (Object.hasOwn(input, "studyModuleId"))
      changes.studyModuleId = input.studyModuleId ?? null;
    if (archived !== undefined)
      changes.archivedAt = archived ? this.now() : null;
    return this.handle(() =>
      this.repository.updateDocument(userId, documentId, changes),
    );
  }

  async deleteDocument(userId: string, documentId: string) {
    const record = await this.handle(() =>
      this.repository.getDocumentRecord(userId, documentId),
    );
    await this.handle(() =>
      this.repository.markDocumentDeleted(userId, documentId, this.now()),
    );
    await this.handle(() => this.storage.delete(userId, record.storageKey));
  }

  private verifyIntegrity(
    record: { byteSize: number; sha256: string },
    bytes: Buffer,
  ) {
    const checksum = createHash("sha256").update(bytes).digest("hex");
    if (bytes.byteLength !== record.byteSize || checksum !== record.sha256) {
      throw new ApiError(
        409,
        "CONFLICT",
        "Das lokale Dokument hat die Integritätsprüfung nicht bestanden.",
      );
    }
  }

  /**
   * Führt die lokale Extraktion aus und beschreibt ihr Ergebnis als
   * dokumentgebundene Werte. Die Prüfsumme bindet das Ergebnis an genau die
   * Datei, aus der es entstanden ist. Es wird nie Dokumentklartext
   * protokolliert.
   */
  private async extractDocumentText(
    mimeType: string,
    bytes: Buffer,
    sourceSha256: string,
  ): Promise<DocumentExtractionValues> {
    const extractedAt = this.now();
    const base = {
      sourceSha256,
      extractedAt,
      pageCount: null,
      truncated: false,
      pages: null,
    } satisfies Partial<DocumentExtractionValues>;

    if (mimeType === PDF_MIME_TYPE) {
      /**
       * Der Parserlauf ist der einzige Pfad, der einen Worker-Thread mit eigener
       * Speichergrenze startet, und läuft deshalb innerhalb der prozessweiten
       * Begrenzung. Eine abgewiesene Anfrage wird vor dem Start abgewiesen; sie
       * hinterlässt weder einen Worker noch eine Wartemarke.
       */
      const outcome = await this.pdfExtraction.run(() =>
        extractPdfDocumentText(bytes),
      );
      const available = outcome.status === "available";
      return {
        ...base,
        status: outcome.status,
        version: PDF_EXTRACTION_VERSION,
        errorCode: outcome.errorCode,
        pageCount: outcome.pageCount,
        truncated: outcome.truncated,
        pages: available ? outcome.pages : null,
        /**
         * Der zusammengeführte Text bleibt als einheitliche Grundlage für
         * bestehende Verbraucher erhalten; die seitenbezogenen Fundstellen
         * kommen zusätzlich aus denselben Seiten und bilden keinen eigenen
         * Index.
         */
        extractedText: available
          ? outcome.pages.map((page) => page.text).join("\n")
          : null,
      };
    }

    if (isLocalTextMimeType(mimeType)) {
      if (bytes.byteLength > MAX_EXTRACTED_TEXT_BYTES)
        return {
          ...base,
          status: "failed",
          version: LOCAL_TEXT_EXTRACTION_VERSION,
          errorCode: "text_limit_exceeded",
          extractedText: null,
        };
      const text = extractLocalDocumentText(mimeType, bytes);
      if (text === null)
        return {
          ...base,
          status: "failed",
          version: LOCAL_TEXT_EXTRACTION_VERSION,
          errorCode: "text_decode_failed",
          extractedText: null,
        };
      return {
        ...base,
        status: "available",
        version: LOCAL_TEXT_EXTRACTION_VERSION,
        errorCode: null,
        extractedText: text,
      };
    }

    /**
     * Für Formate ohne lokalen Extraktor bleibt allein die Datei erhalten. Das
     * Dokument bleibt auffindbar und herunterladbar, liefert aber bewusst
     * keinen Inhalt für Suche oder KI-Grundlage.
     */
    return {
      ...base,
      status: "unsupported",
      version: null,
      errorCode: null,
      extractedText: null,
    };
  }

  private async handle<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (
        error instanceof KnowledgeRecordNotFoundError ||
        error instanceof StoredDocumentNotFoundError
      )
        throw new ApiError(
          404,
          "NOT_FOUND",
          "Der Wissenseintrag wurde nicht gefunden.",
        );
      if (error instanceof KnowledgeReferenceNotFoundError)
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          "Das verknüpfte Projekt oder Studienmodul ist nicht verfügbar.",
        );
      if (error instanceof UnsafeStoragePathError)
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          "Der lokale Dokumentpfad ist nicht sicher.",
        );
      if (error instanceof RangeError)
        throw new ApiError(413, "PAYLOAD_TOO_LARGE", error.message);
      throw error;
    }
  }
}
