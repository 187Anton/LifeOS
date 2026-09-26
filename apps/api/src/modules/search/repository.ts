import type { DatabaseClient } from "@lifeos/database";
import type {
  SearchContentType,
  SearchSourceResponse,
} from "@lifeos/contracts";

/** Eine seitenbezogene Fundstelle aus einer lokalen Extraktion. */
export interface SearchCandidatePage {
  page: number;
  text: string;
}

export interface SearchCandidate {
  id: string;
  ownerId: string;
  title: string;
  contentType: SearchContentType;
  source: SearchSourceResponse;
  content: string;
  metadata: string;
  updatedAt: Date;
  detailPath: string;
  /**
   * Studienmodulbezug des Objekts, sofern einer besteht. Nur darüber greift der
   * `studyModuleId`-Filter der Modulsuche.
   */
  studyModuleId: string | null;
  /**
   * Seitenbezogene Fundstellen. Außerhalb seitenbasierter Formate leer; es
   * entsteht kein eigener Index, die Seiten hängen am Dokument selbst.
   */
  pages: SearchCandidatePage[];
}

export interface SearchRepository {
  listReleasedCandidates(userId: string): Promise<SearchCandidate[]>;
}

const text = (...values: Array<string | null | undefined>) =>
  values.filter((value): value is string => Boolean(value)).join("\n");

/**
 * Liest die gespeicherten Seitenfundstellen aus dem JSON-Feld des Dokuments und
 * übernimmt nur wohlgeformte Einträge.
 */
const storedPages = (value: unknown): SearchCandidatePage[] => {
  if (!Array.isArray(value)) return [];
  const pages: SearchCandidatePage[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry))
      continue;
    const candidate = entry as { page?: unknown; text?: unknown };
    if (
      typeof candidate.page !== "number" ||
      !Number.isInteger(candidate.page) ||
      candidate.page < 1 ||
      typeof candidate.text !== "string" ||
      !candidate.text
    )
      continue;
    pages.push({ page: candidate.page, text: candidate.text });
  }
  return pages.sort((left, right) => left.page - right.page);
};

export class PrismaSearchRepository implements SearchRepository {
  constructor(private readonly database: DatabaseClient) {}

  async listReleasedCandidates(userId: string): Promise<SearchCandidate[]> {
    const [projects, notes, documents, studyModules, workProjects] =
      await Promise.all([
        this.database.project.findMany({
          where: {
            userId,
            searchEnabled: true,
            status: { not: "cancelled" },
            archivedAt: null,
            deletedAt: null,
          },
          include: {
            goals: {
              where: {
                status: { not: "cancelled" },
                archivedAt: null,
                deletedAt: null,
              },
            },
            milestones: {
              where: {
                status: { not: "cancelled" },
                archivedAt: null,
                deletedAt: null,
              },
            },
          },
        }),
        this.database.note.findMany({
          where: {
            userId,
            searchEnabled: true,
            archivedAt: null,
            deletedAt: null,
          },
        }),
        this.database.document.findMany({
          where: {
            userId,
            searchEnabled: true,
            archivedAt: null,
            deletedAt: null,
          },
          include: {
            project: { select: { title: true } },
            studyModule: { select: { title: true } },
          },
        }),
        this.database.studyModule.findMany({
          where: {
            userId,
            searchEnabled: true,
            status: { not: "cancelled" },
            archivedAt: null,
            program: { status: { not: "cancelled" }, archivedAt: null },
          },
          include: {
            program: { select: { title: true } },
            entries: {
              where: { status: { not: "cancelled" }, archivedAt: null },
            },
          },
        }),
        this.database.workProject.findMany({
          where: {
            userId,
            searchEnabled: true,
            status: { not: "cancelled" },
            archivedAt: null,
            context: { status: { not: "cancelled" }, archivedAt: null },
          },
          include: { context: { select: { title: true } } },
        }),
      ]);

    const candidates: SearchCandidate[] = [];
    for (const project of projects) {
      const source = {
        type: "project" as const,
        id: project.id,
        title: project.title,
      };
      candidates.push({
        id: project.id,
        ownerId: project.userId,
        title: project.title,
        contentType: "project",
        source,
        content: text(project.description, project.risk),
        metadata: text(
          project.status,
          project.dueDate?.toISOString().slice(0, 10),
        ),
        updatedAt: project.updatedAt,
        detailPath: `/projects/${project.id}`,
        studyModuleId: null,
        pages: [],
      });
      for (const goal of project.goals) {
        candidates.push({
          id: goal.id,
          ownerId: goal.userId,
          title: goal.title,
          contentType: "project_goal",
          source,
          content: text(goal.description, goal.risk),
          metadata: text(goal.status, goal.dueDate?.toISOString().slice(0, 10)),
          updatedAt: goal.updatedAt,
          detailPath: `/projects/${project.id}#goal-${goal.id}`,
          studyModuleId: null,
          pages: [],
        });
      }
      for (const milestone of project.milestones) {
        candidates.push({
          id: milestone.id,
          ownerId: milestone.userId,
          title: milestone.title,
          contentType: "project_milestone",
          source,
          content: text(milestone.description, milestone.risk),
          metadata: text(
            milestone.status,
            milestone.dueDate?.toISOString().slice(0, 10),
          ),
          updatedAt: milestone.updatedAt,
          detailPath: `/projects/${project.id}#milestone-${milestone.id}`,
          studyModuleId: null,
          pages: [],
        });
      }
    }
    for (const note of notes) {
      candidates.push({
        id: note.id,
        ownerId: note.userId,
        title: note.title,
        contentType: "note",
        source: { type: "note", id: note.id, title: note.title },
        content: note.content,
        metadata: text(note.category, ...note.tags),
        updatedAt: note.updatedAt,
        detailPath: `/knowledge/notes/${note.id}`,
        studyModuleId: note.studyModuleId,
        pages: [],
      });
    }
    for (const document of documents) {
      /**
       * Inhalte eines Dokuments werden ausschließlich aus einer eigenen,
       * aktiven, freigegebenen und zur aktuellen Dateiprüfsumme passenden
       * Extraktion verwendet. Eine ausstehende, fehlgeschlagene, geschützte,
       * textfreie, nicht unterstützte oder veraltete Extraktion liefert
       * bewusst keinen Inhalt; das Dokument bleibt über seine Metadaten
       * auffindbar, erscheint aber nie mit fremdem oder veraltetem Text.
       */
      const released =
        document.extractionStatus === "available" &&
        document.extractionSha256 !== null &&
        document.extractionSha256 === document.sha256;
      const pages = released ? storedPages(document.extractionPages) : [];
      candidates.push({
        id: document.id,
        ownerId: document.userId,
        title: document.fileName,
        contentType: "document",
        source: {
          type: "document",
          id: document.id,
          title: document.fileName,
        },
        content: released
          ? pages.length
            ? pages.map((page) => page.text).join("\n")
            : (document.extractedText ?? "")
          : "",
        metadata: text(
          document.mimeType,
          document.project?.title,
          document.studyModule?.title,
        ),
        updatedAt: document.updatedAt,
        detailPath: `/knowledge/documents/${document.id}`,
        studyModuleId: document.studyModuleId,
        pages,
      });
    }
    for (const module of studyModules) {
      const source = {
        type: "study_module" as const,
        id: module.id,
        title: module.title,
      };
      candidates.push({
        id: module.id,
        ownerId: module.userId,
        title: module.title,
        contentType: "study_module",
        source,
        content: module.notes ?? "",
        metadata: text(module.code, module.program.title, module.status),
        updatedAt: module.updatedAt,
        detailPath: `/study/modules/${module.id}`,
        studyModuleId: module.id,
        pages: [],
      });
      for (const entry of module.entries) {
        candidates.push({
          id: entry.id,
          ownerId: entry.userId,
          title: entry.title,
          contentType: "study_entry",
          source,
          content: entry.notes ?? "",
          metadata: text(entry.kind, entry.status),
          updatedAt: entry.updatedAt,
          detailPath: `/study/modules/${module.id}#entry-${entry.id}`,
          studyModuleId: module.id,
          pages: [],
        });
      }
    }
    for (const project of workProjects) {
      candidates.push({
        id: project.id,
        ownerId: project.userId,
        title: project.title,
        contentType: "work_project",
        source: {
          type: "work_project",
          id: project.id,
          title: project.title,
        },
        content: text(project.goal, project.notes),
        metadata: text(project.context.title, project.status),
        updatedAt: project.updatedAt,
        detailPath: `/work/projects/${project.id}`,
        studyModuleId: null,
        pages: [],
      });
    }
    return candidates;
  }
}
