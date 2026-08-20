import { randomUUID } from "node:crypto";
import { chmod, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

import { Prisma, type PrismaClient } from "./generated/prisma/client.js";
import {
  createDatabaseClient,
  createPostgresDatabaseClient,
} from "./client.js";
import { migrateSqliteDatabase } from "../prisma/sqlite/migrate.js";

type ReadClient = Pick<
  PrismaClient,
  | "user"
  | "userSettings"
  | "userCredential"
  | "userSession"
  | "calDavCredential"
  | "externalCalDavConnection"
  | "externalCalDavCalendar"
  | "externalCalDavEventMapping"
  | "gitHubConnection"
  | "calendar"
  | "calendarEvent"
  | "project"
  | "projectGoal"
  | "projectMilestone"
  | "projectEventLink"
  | "note"
  | "noteVersion"
  | "document"
  | "task"
  | "taskEventLink"
  | "studyProgram"
  | "studyModule"
  | "studyEntry"
  | "workContext"
  | "workProject"
  | "workTaskLink"
  | "workTimeEntry"
  | "availabilityWindow"
  | "financeCategory"
  | "financeTransaction"
  | "financeBudget"
  | "fitnessPlan"
  | "fitnessExercise"
  | "fitnessPlanExercise"
  | "fitnessSession"
  | "fitnessSet"
  | "bodyWeightEntry"
  | "aiInteraction"
  | "auditEvent"
>;

const readDataset = async (database: ReadClient) => ({
  users: await database.user.findMany({ orderBy: { id: "asc" } }),
  userSettings: await database.userSettings.findMany({
    orderBy: { userId: "asc" },
  }),
  userCredentials: await database.userCredential.findMany({
    orderBy: { userId: "asc" },
  }),
  userSessions: await database.userSession.findMany({ orderBy: { id: "asc" } }),
  calDavCredentials: await database.calDavCredential.findMany({
    orderBy: { userId: "asc" },
  }),
  externalCalDavConnections: await database.externalCalDavConnection.findMany({
    orderBy: { id: "asc" },
  }),
  externalCalDavCalendars: await database.externalCalDavCalendar.findMany({
    orderBy: { id: "asc" },
  }),
  externalCalDavEventMappings:
    await database.externalCalDavEventMapping.findMany({
      orderBy: { id: "asc" },
    }),
  gitHubConnections: await database.gitHubConnection.findMany({
    orderBy: { id: "asc" },
  }),
  calendars: await database.calendar.findMany({ orderBy: { id: "asc" } }),
  calendarEvents: await database.calendarEvent.findMany({
    orderBy: { id: "asc" },
  }),
  projects: await database.project.findMany({ orderBy: { id: "asc" } }),
  projectGoals: await database.projectGoal.findMany({ orderBy: { id: "asc" } }),
  projectMilestones: await database.projectMilestone.findMany({
    orderBy: { id: "asc" },
  }),
  projectEventLinks: await database.projectEventLink.findMany({
    orderBy: { id: "asc" },
  }),
  notes: await database.note.findMany({ orderBy: { id: "asc" } }),
  noteVersions: await database.noteVersion.findMany({ orderBy: { id: "asc" } }),
  documents: await database.document.findMany({ orderBy: { id: "asc" } }),
  tasks: await database.task.findMany({ orderBy: { id: "asc" } }),
  taskEventLinks: await database.taskEventLink.findMany({
    orderBy: { id: "asc" },
  }),
  studyPrograms: await database.studyProgram.findMany({
    orderBy: { id: "asc" },
  }),
  studyModules: await database.studyModule.findMany({ orderBy: { id: "asc" } }),
  studyEntries: await database.studyEntry.findMany({ orderBy: { id: "asc" } }),
  workContexts: await database.workContext.findMany({ orderBy: { id: "asc" } }),
  workProjects: await database.workProject.findMany({ orderBy: { id: "asc" } }),
  workTaskLinks: await database.workTaskLink.findMany({
    orderBy: { id: "asc" },
  }),
  workTimeEntries: await database.workTimeEntry.findMany({
    orderBy: { id: "asc" },
  }),
  availabilityWindows: await database.availabilityWindow.findMany({
    orderBy: { id: "asc" },
  }),
  financeCategories: await database.financeCategory.findMany({
    orderBy: { id: "asc" },
  }),
  financeTransactions: await database.financeTransaction.findMany({
    orderBy: { id: "asc" },
  }),
  financeBudgets: await database.financeBudget.findMany({
    orderBy: { id: "asc" },
  }),
  fitnessPlans: await database.fitnessPlan.findMany({ orderBy: { id: "asc" } }),
  fitnessExercises: await database.fitnessExercise.findMany({
    orderBy: { id: "asc" },
  }),
  fitnessPlanExercises: await database.fitnessPlanExercise.findMany({
    orderBy: { id: "asc" },
  }),
  fitnessSessions: await database.fitnessSession.findMany({
    orderBy: { id: "asc" },
  }),
  fitnessSets: await database.fitnessSet.findMany({ orderBy: { id: "asc" } }),
  bodyWeightEntries: await database.bodyWeightEntry.findMany({
    orderBy: { id: "asc" },
  }),
  aiInteractions: await database.aiInteraction.findMany({
    orderBy: { id: "asc" },
  }),
  auditEvents: await database.auditEvent.findMany({ orderBy: { id: "asc" } }),
});

type MigrationDataset = Awaited<ReturnType<typeof readDataset>>;

const canonicalize = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    if ("toJSON" in value && typeof value.toJSON === "function") {
      return canonicalize(value.toJSON());
    }
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
};

const datasetSnapshot = (dataset: MigrationDataset) =>
  JSON.stringify(canonicalize(dataset));

const resolveSqlitePath = (databaseUrl: string) => {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("Die SQLite-Ziel-URL muss mit file: beginnen.");
  }
  const databasePath = decodeURIComponent(databaseUrl.slice("file:".length));
  if (!path.isAbsolute(databasePath)) {
    throw new Error("Die SQLite-Ziel-URL muss einen absoluten Pfad enthalten.");
  }
  return databasePath;
};

const pathExists = async (filePath: string) =>
  stat(filePath)
    .then(() => true)
    .catch((error: unknown) => {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return false;
      }
      throw error;
    });

const counts = (dataset: MigrationDataset) =>
  Object.fromEntries(
    Object.entries(dataset).map(([name, records]) => [name, records.length]),
  );

const insertDataset = async (
  database: PrismaClient,
  dataset: MigrationDataset,
) => {
  await database.$transaction(async (transaction) => {
    if (dataset.users.length)
      await transaction.user.createMany({ data: dataset.users });
    if (dataset.userSettings.length)
      await transaction.userSettings.createMany({ data: dataset.userSettings });
    if (dataset.userCredentials.length)
      await transaction.userCredential.createMany({
        data: dataset.userCredentials,
      });
    if (dataset.userSessions.length)
      await transaction.userSession.createMany({ data: dataset.userSessions });
    if (dataset.calDavCredentials.length)
      await transaction.calDavCredential.createMany({
        data: dataset.calDavCredentials,
      });
    if (dataset.externalCalDavConnections.length)
      await transaction.externalCalDavConnection.createMany({
        data: dataset.externalCalDavConnections,
      });
    if (dataset.externalCalDavCalendars.length)
      await transaction.externalCalDavCalendar.createMany({
        data: dataset.externalCalDavCalendars,
      });
    if (dataset.calendars.length)
      await transaction.calendar.createMany({ data: dataset.calendars });
    if (dataset.calendarEvents.length)
      await transaction.calendarEvent.createMany({
        data: dataset.calendarEvents,
      });
    if (dataset.externalCalDavEventMappings.length)
      await transaction.externalCalDavEventMapping.createMany({
        data: dataset.externalCalDavEventMappings,
      });
    if (dataset.gitHubConnections.length)
      await transaction.gitHubConnection.createMany({
        data: dataset.gitHubConnections,
      });
    if (dataset.projects.length)
      await transaction.project.createMany({ data: dataset.projects });
    if (dataset.projectGoals.length)
      await transaction.projectGoal.createMany({ data: dataset.projectGoals });
    if (dataset.projectMilestones.length)
      await transaction.projectMilestone.createMany({
        data: dataset.projectMilestones,
      });
    if (dataset.tasks.length)
      await transaction.task.createMany({ data: dataset.tasks });
    if (dataset.taskEventLinks.length)
      await transaction.taskEventLink.createMany({
        data: dataset.taskEventLinks,
      });
    if (dataset.projectEventLinks.length)
      await transaction.projectEventLink.createMany({
        data: dataset.projectEventLinks,
      });
    if (dataset.studyPrograms.length)
      await transaction.studyProgram.createMany({
        data: dataset.studyPrograms,
      });
    if (dataset.studyModules.length)
      await transaction.studyModule.createMany({ data: dataset.studyModules });
    if (dataset.notes.length)
      await transaction.note.createMany({ data: dataset.notes });
    if (dataset.noteVersions.length)
      await transaction.noteVersion.createMany({ data: dataset.noteVersions });
    if (dataset.documents.length)
      await transaction.document.createMany({ data: dataset.documents });
    if (dataset.studyEntries.length)
      await transaction.studyEntry.createMany({ data: dataset.studyEntries });
    if (dataset.workContexts.length)
      await transaction.workContext.createMany({ data: dataset.workContexts });
    if (dataset.workProjects.length)
      await transaction.workProject.createMany({ data: dataset.workProjects });
    if (dataset.workTaskLinks.length)
      await transaction.workTaskLink.createMany({
        data: dataset.workTaskLinks,
      });
    if (dataset.workTimeEntries.length)
      await transaction.workTimeEntry.createMany({
        data: dataset.workTimeEntries,
      });
    if (dataset.availabilityWindows.length)
      await transaction.availabilityWindow.createMany({
        data: dataset.availabilityWindows,
      });
    if (dataset.financeCategories.length)
      await transaction.financeCategory.createMany({
        data: dataset.financeCategories,
      });
    if (dataset.financeTransactions.length)
      await transaction.financeTransaction.createMany({
        data: dataset.financeTransactions,
      });
    if (dataset.financeBudgets.length)
      await transaction.financeBudget.createMany({
        data: dataset.financeBudgets,
      });
    if (dataset.fitnessPlans.length)
      await transaction.fitnessPlan.createMany({ data: dataset.fitnessPlans });
    if (dataset.fitnessExercises.length)
      await transaction.fitnessExercise.createMany({
        data: dataset.fitnessExercises,
      });
    if (dataset.fitnessPlanExercises.length)
      await transaction.fitnessPlanExercise.createMany({
        data: dataset.fitnessPlanExercises,
      });
    if (dataset.fitnessSessions.length)
      await transaction.fitnessSession.createMany({
        data: dataset.fitnessSessions,
      });
    if (dataset.fitnessSets.length)
      await transaction.fitnessSet.createMany({ data: dataset.fitnessSets });
    if (dataset.bodyWeightEntries.length)
      await transaction.bodyWeightEntry.createMany({
        data: dataset.bodyWeightEntries,
      });
    if (dataset.aiInteractions.length)
      await transaction.aiInteraction.createMany({
        data: dataset.aiInteractions.map((interaction) => ({
          ...interaction,
          sourceReferences:
            interaction.sourceReferences as Prisma.InputJsonValue,
          responseMetadata:
            interaction.responseMetadata as Prisma.InputJsonValue,
        })),
      });
    if (dataset.auditEvents.length)
      await transaction.auditEvent.createMany({
        data: dataset.auditEvents.map((event) => ({
          ...event,
          metadata: event.metadata === null ? Prisma.DbNull : event.metadata,
        })),
      });
  });
};

export const importPostgresToSqlite = async (
  postgresUrl: string,
  sqliteUrl: string,
) => {
  if (
    !postgresUrl.startsWith("postgresql://") &&
    !postgresUrl.startsWith("postgres://")
  ) {
    throw new Error("Die Importquelle muss eine PostgreSQL-URL sein.");
  }
  const targetPath = resolveSqlitePath(sqliteUrl);
  const targetFiles = [targetPath, `${targetPath}-wal`, `${targetPath}-shm`];
  if ((await Promise.all(targetFiles.map(pathExists))).some(Boolean)) {
    throw new Error(
      "Das SQLite-Ziel oder eine zugehörige WAL-Datei existiert bereits und wird nicht überschrieben.",
    );
  }
  await mkdir(path.dirname(targetPath), { recursive: true });
  const stagingPath = `${targetPath}.importing-${randomUUID()}`;
  const stagingUrl = `file:${stagingPath}`;
  const stagingFiles = [
    stagingPath,
    `${stagingPath}-wal`,
    `${stagingPath}-shm`,
  ];
  const source = createPostgresDatabaseClient(postgresUrl);

  try {
    const dataset = await source.$transaction(
      async (transaction) => {
        await transaction.$executeRawUnsafe("SET TRANSACTION READ ONLY");
        return readDataset(transaction);
      },
      { isolationLevel: "RepeatableRead" },
    );
    const sourceSnapshot = datasetSnapshot(dataset);

    await migrateSqliteDatabase(stagingUrl);
    const target = createDatabaseClient(stagingUrl);
    try {
      await insertDataset(target, dataset);
      const imported = await readDataset(target);
      if (datasetSnapshot(imported) !== sourceSnapshot) {
        throw new Error(
          "Der SQLite-Datenvergleich weicht von der PostgreSQL-Quelle ab.",
        );
      }
      const foreignKeyViolations = await target.$queryRawUnsafe<unknown[]>(
        "PRAGMA foreign_key_check",
      );
      if (foreignKeyViolations.length > 0) {
        throw new Error("Der SQLite-Import enthält ungültige Fremdschlüssel.");
      }
      const integrity = await target.$queryRawUnsafe<
        Array<{ integrity_check: string }>
      >("PRAGMA integrity_check");
      if (integrity[0]?.integrity_check !== "ok") {
        throw new Error(
          "Der SQLite-Import hat die Integritätsprüfung nicht bestanden.",
        );
      }
      await target.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
    } finally {
      await target.$disconnect();
    }

    const sourceAfter = await readDataset(source);
    if (datasetSnapshot(sourceAfter) !== sourceSnapshot) {
      throw new Error(
        "Die PostgreSQL-Quelle hat sich während des Imports geändert; das SQLite-Ziel wird nicht veröffentlicht.",
      );
    }

    await chmod(stagingPath, 0o600);
    await rename(stagingPath, targetPath);
    await rm(`${stagingPath}-wal`, { force: true });
    await rm(`${stagingPath}-shm`, { force: true });
    return { targetPath, counts: counts(dataset) };
  } catch (error) {
    await Promise.all(stagingFiles.map((file) => rm(file, { force: true })));
    throw error;
  } finally {
    await source.$disconnect();
  }
};
