import type { DatabaseClient } from "@lifeos/database";
import type {
  SearchContentType,
  SearchSourceResponse,
} from "@lifeos/contracts";

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
}

export interface SearchRepository {
  listReleasedCandidates(userId: string): Promise<SearchCandidate[]>;
}

const text = (...values: Array<string | null | undefined>) =>
  values.filter((value): value is string => Boolean(value)).join("\n");

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
      });
    }
    for (const document of documents) {
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
        content: document.extractedText ?? "",
        metadata: text(
          document.mimeType,
          document.project?.title,
          document.studyModule?.title,
        ),
        updatedAt: document.updatedAt,
        detailPath: `/knowledge/documents/${document.id}`,
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
      });
    }
    return candidates;
  }
}
