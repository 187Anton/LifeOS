import type {
  CreateNoteRequest,
  UpdateDocumentRequest,
  UpdateNoteRequest,
} from "@lifeos/contracts";

import { ApiError } from "../../errors.js";
import {
  KnowledgeRecordNotFoundError,
  KnowledgeReferenceNotFoundError,
  type DocumentChanges,
  type KnowledgeRepository,
  type NoteChanges,
} from "./repository.js";
import {
  StoredDocumentNotFoundError,
  UnsafeStoragePathError,
} from "./storage.js";
import type { LocalDocumentStorage } from "./storage.js";
import { extractLocalDocumentText } from "./storage.js";

const normalizedTags = (tags: string[] = []) => [
  ...new Set(tags.map((tag) => tag.trim()).filter(Boolean)),
];

export class KnowledgeService {
  constructor(
    private readonly repository: KnowledgeRepository,
    private readonly storage: LocalDocumentStorage,
    private readonly now: () => Date = () => new Date(),
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
      return await this.handle(() =>
        this.repository.createDocument(userId, {
          ...stored,
          fileName: input.fileName,
          mimeType: input.mimeType,
          projectId: input.projectId ?? null,
          studyModuleId: input.studyModuleId ?? null,
          searchEnabled: input.searchEnabled ?? false,
          extractedText: extractLocalDocumentText(input.mimeType, input.bytes),
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
    return { record, bytes };
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
