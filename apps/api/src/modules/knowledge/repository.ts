import type { DatabaseClient } from "@lifeos/database";
import type {
  DocumentResponse,
  KnowledgeOverviewResponse,
  NoteDetailResponse,
  NoteResponse,
  UpdateDocumentRequest,
} from "@lifeos/contracts";

export class KnowledgeRecordNotFoundError extends Error {}
export class KnowledgeReferenceNotFoundError extends Error {}

export interface NoteValues {
  title: string;
  content: string;
  format: "markdown";
  category: string | null;
  tags: string[];
  projectId: string | null;
  studyModuleId: string | null;
  searchEnabled: boolean;
}
export type NoteChanges = Partial<NoteValues> & {
  archivedAt?: Date | null;
};
export interface DocumentValues {
  storageKey: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  modifiedAt: Date;
  projectId: string | null;
  studyModuleId: string | null;
  searchEnabled: boolean;
  extractedText: string | null;
}
export type DocumentChanges = Pick<
  UpdateDocumentRequest,
  "projectId" | "studyModuleId" | "searchEnabled"
> & { archivedAt?: Date | null };

type Link = { id: string; title: string } | null;
type NoteRecord = NoteValues & {
  id: string;
  userId: string;
  version: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  project: Link;
  studyModule: Link;
};
type DocumentRecord = DocumentValues & {
  id: string;
  userId: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  project: Link;
  studyModule: Link;
};

const includeLinks = {
  project: { select: { id: true, title: true } },
  studyModule: { select: { id: true, title: true } },
} as const;
const common = (record: {
  id: string;
  userId: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: record.id,
  ownerId: record.userId,
  archivedAt: record.archivedAt?.toISOString() ?? null,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});
const mapNote = (record: NoteRecord): NoteResponse => ({
  ...common(record),
  title: record.title,
  content: record.content,
  format: record.format,
  category: record.category,
  tags: record.tags,
  version: record.version,
  searchEnabled: record.searchEnabled,
  project: record.project,
  studyModule: record.studyModule,
});
const mapDocument = (record: DocumentRecord): DocumentResponse => ({
  ...common(record),
  fileName: record.fileName,
  mimeType: record.mimeType,
  byteSize: record.byteSize,
  sha256: record.sha256,
  modifiedAt: record.modifiedAt.toISOString(),
  searchEnabled: record.searchEnabled,
  project: record.project,
  studyModule: record.studyModule,
  contentUrl: `/api/v1/documents/${record.id}/content`,
});

export interface KnowledgeRepository {
  getOverview(
    userId: string,
    includeArchived: boolean,
  ): Promise<KnowledgeOverviewResponse>;
  getNote(userId: string, noteId: string): Promise<NoteDetailResponse>;
  createNote(userId: string, values: NoteValues): Promise<NoteResponse>;
  updateNote(
    userId: string,
    noteId: string,
    changes: NoteChanges,
  ): Promise<NoteResponse>;
  deleteNote(userId: string, noteId: string, deletedAt: Date): Promise<void>;
  createDocument(
    userId: string,
    values: DocumentValues,
  ): Promise<DocumentResponse>;
  getDocumentRecord(
    userId: string,
    documentId: string,
  ): Promise<DocumentRecord>;
  updateDocument(
    userId: string,
    documentId: string,
    changes: DocumentChanges,
  ): Promise<DocumentResponse>;
  markDocumentDeleted(
    userId: string,
    documentId: string,
    deletedAt: Date,
  ): Promise<DocumentRecord>;
}

type Transaction = Pick<
  DatabaseClient,
  "project" | "studyModule" | "note" | "noteVersion" | "document" | "auditEvent"
>;

export class PrismaKnowledgeRepository implements KnowledgeRepository {
  constructor(private readonly database: DatabaseClient) {}

  async getOverview(userId: string, includeArchived: boolean) {
    const where = {
      userId,
      deletedAt: null,
      ...(includeArchived ? {} : { archivedAt: null }),
    };
    const [notes, documents] = await Promise.all([
      this.database.note.findMany({
        where,
        include: includeLinks,
        orderBy: { updatedAt: "desc" },
      }),
      this.database.document.findMany({
        where,
        include: includeLinks,
        orderBy: { updatedAt: "desc" },
      }),
    ]);
    return {
      notes: notes.map((record) => mapNote(record as NoteRecord)),
      documents: documents.map((record) =>
        mapDocument(record as DocumentRecord),
      ),
    };
  }

  async getNote(userId: string, noteId: string) {
    const record = await this.database.note.findFirst({
      where: { id: noteId, userId, deletedAt: null },
      include: { ...includeLinks, versions: { orderBy: { version: "desc" } } },
    });
    if (!record) throw new KnowledgeRecordNotFoundError();
    return {
      ...mapNote(record as NoteRecord),
      versions: record.versions.map((version) => ({
        version: version.version,
        title: version.title,
        content: version.content,
        category: version.category,
        tags: version.tags,
        createdAt: version.createdAt.toISOString(),
      })),
    };
  }

  async createNote(userId: string, values: NoteValues) {
    return this.database.$transaction(async (tx) => {
      await this.references(tx, userId, values.projectId, values.studyModuleId);
      const record = await tx.note.create({
        data: {
          userId,
          ...values,
          versions: {
            create: {
              user: { connect: { id: userId } },
              version: 1,
              title: values.title,
              content: values.content,
              category: values.category,
              tags: values.tags,
            },
          },
        },
        include: includeLinks,
      });
      await this.audit(
        tx,
        userId,
        "knowledge.note.created",
        "Note",
        record.id,
        Object.keys(values),
      );
      return mapNote(record as unknown as NoteRecord);
    });
  }

  async updateNote(userId: string, noteId: string, changes: NoteChanges) {
    return this.database.$transaction(async (tx) => {
      const current = await tx.note.findFirst({
        where: { id: noteId, userId, deletedAt: null },
      });
      if (!current) throw new KnowledgeRecordNotFoundError();
      await this.references(
        tx,
        userId,
        Object.hasOwn(changes, "projectId")
          ? (changes.projectId ?? null)
          : current.projectId,
        Object.hasOwn(changes, "studyModuleId")
          ? (changes.studyModuleId ?? null)
          : current.studyModuleId,
      );
      const nextVersion = current.version + 1;
      const versioned = ["title", "content", "category", "tags"].some((key) =>
        Object.hasOwn(changes, key),
      );
      const record = await tx.note.update({
        where: { id: noteId },
        data: { ...changes, ...(versioned ? { version: nextVersion } : {}) },
        include: includeLinks,
      });
      if (versioned) {
        await tx.noteVersion.create({
          data: {
            userId,
            noteId,
            version: nextVersion,
            title: record.title,
            content: record.content,
            category: record.category,
            tags: record.tags,
          },
        });
      }
      await this.audit(
        tx,
        userId,
        "knowledge.note.updated",
        "Note",
        noteId,
        Object.keys(changes),
      );
      return mapNote(record as NoteRecord);
    });
  }

  async deleteNote(userId: string, noteId: string, deletedAt: Date) {
    await this.database.$transaction(async (tx) => {
      if (
        !(await tx.note.findFirst({
          where: { id: noteId, userId, deletedAt: null },
        }))
      )
        throw new KnowledgeRecordNotFoundError();
      await tx.note.update({ where: { id: noteId }, data: { deletedAt } });
      await this.audit(tx, userId, "knowledge.note.deleted", "Note", noteId, [
        "deletedAt",
      ]);
    });
  }

  async createDocument(userId: string, values: DocumentValues) {
    return this.database.$transaction(async (tx) => {
      await this.references(tx, userId, values.projectId, values.studyModuleId);
      const record = await tx.document.create({
        data: { userId, ...values },
        include: includeLinks,
      });
      await this.audit(
        tx,
        userId,
        "knowledge.document.created",
        "Document",
        record.id,
        [
          "fileName",
          "mimeType",
          "byteSize",
          "projectId",
          "studyModuleId",
          "searchEnabled",
        ],
      );
      return mapDocument(record as DocumentRecord);
    });
  }

  async getDocumentRecord(userId: string, documentId: string) {
    const record = await this.database.document.findFirst({
      where: { id: documentId, userId, deletedAt: null },
      include: includeLinks,
    });
    if (!record) throw new KnowledgeRecordNotFoundError();
    return record as DocumentRecord;
  }

  async updateDocument(
    userId: string,
    documentId: string,
    changes: DocumentChanges,
  ) {
    return this.database.$transaction(async (tx) => {
      const current = await tx.document.findFirst({
        where: { id: documentId, userId, deletedAt: null },
      });
      if (!current) throw new KnowledgeRecordNotFoundError();
      await this.references(
        tx,
        userId,
        Object.hasOwn(changes, "projectId")
          ? (changes.projectId ?? null)
          : current.projectId,
        Object.hasOwn(changes, "studyModuleId")
          ? (changes.studyModuleId ?? null)
          : current.studyModuleId,
      );
      const record = await tx.document.update({
        where: { id: documentId },
        data: changes,
        include: includeLinks,
      });
      await this.audit(
        tx,
        userId,
        "knowledge.document.updated",
        "Document",
        documentId,
        Object.keys(changes),
      );
      return mapDocument(record as DocumentRecord);
    });
  }

  async markDocumentDeleted(
    userId: string,
    documentId: string,
    deletedAt: Date,
  ) {
    return this.database.$transaction(async (tx) => {
      const current = await tx.document.findFirst({
        where: { id: documentId, userId, deletedAt: null },
        include: includeLinks,
      });
      if (!current) throw new KnowledgeRecordNotFoundError();
      const record = await tx.document.update({
        where: { id: documentId },
        data: { deletedAt },
        include: includeLinks,
      });
      await this.audit(
        tx,
        userId,
        "knowledge.document.deleted",
        "Document",
        documentId,
        ["deletedAt"],
      );
      return record as DocumentRecord;
    });
  }

  private async references(
    tx: Transaction,
    userId: string,
    projectId: string | null,
    studyModuleId: string | null,
  ) {
    const [project, studyModule] = await Promise.all([
      projectId
        ? tx.project.findFirst({
            where: { id: projectId, userId, deletedAt: null },
          })
        : null,
      studyModuleId
        ? tx.studyModule.findFirst({ where: { id: studyModuleId, userId } })
        : null,
    ]);
    if ((projectId && !project) || (studyModuleId && !studyModule))
      throw new KnowledgeReferenceNotFoundError();
  }

  private async audit(
    tx: Transaction,
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    changedFields: string[],
  ) {
    await tx.auditEvent.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
        metadata: { changedFields },
      },
    });
  }
}
