import { createDatabaseClient, migrateSqliteDatabase } from "@lifeos/database";

import { createApplication } from "./application.js";
import {
  loadLocalEnvironment,
  parseConfig,
  useSecureCookies,
} from "./config.js";
import { startApiServer } from "./http-server.js";
import { JsonLogger } from "./logger.js";
import { CalDavAuthenticationService } from "./modules/caldav/authentication.js";
import { PrismaCalDavRepository } from "./modules/caldav/repository.js";
import { createCalDavRouter } from "./modules/caldav/router.js";
import { PrismaCalendarRepository } from "./modules/calendar/repository.js";
import { createCalendarRouter } from "./modules/calendar/router.js";
import { CalendarService } from "./modules/calendar/service.js";
import { PrismaDashboardRepository } from "./modules/dashboard/repository.js";
import { createDashboardRouter } from "./modules/dashboard/router.js";
import { DashboardService } from "./modules/dashboard/service.js";
import { PrismaKnowledgeRepository } from "./modules/knowledge/repository.js";
import {
  createDocumentUploadRouter,
  createKnowledgeRouter,
} from "./modules/knowledge/router.js";
import { KnowledgeService } from "./modules/knowledge/service.js";
import { LocalDocumentStorage } from "./modules/knowledge/storage.js";
import { PrismaPlanningRepository } from "./modules/planning/repository.js";
import { createPlanningRouter } from "./modules/planning/router.js";
import { PlanningService } from "./modules/planning/service.js";
import { PrismaProjectRepository } from "./modules/projects/repository.js";
import { createProjectRouter } from "./modules/projects/router.js";
import { ProjectService } from "./modules/projects/service.js";
import { PrismaProfileRepository } from "./modules/profile/repository.js";
import { createProfileRouter } from "./modules/profile/router.js";
import {
  AuthenticationService,
  ProfileService,
} from "./modules/profile/service.js";
import { PrismaTaskRepository } from "./modules/tasks/repository.js";
import { createTaskRouter } from "./modules/tasks/router.js";
import { TaskService } from "./modules/tasks/service.js";
import { PrismaStudyRepository } from "./modules/study/repository.js";
import { createStudyRouter } from "./modules/study/router.js";
import { StudyService } from "./modules/study/service.js";
import { PrismaWorkRepository } from "./modules/work/repository.js";
import { createWorkRouter } from "./modules/work/router.js";
import { WorkService } from "./modules/work/service.js";
import { PrismaTaskEventLinkRepository } from "./modules/task-event-links/repository.js";
import { createTaskEventLinkRouter } from "./modules/task-event-links/router.js";
import { TaskEventLinkService } from "./modules/task-event-links/service.js";
import { createDatabaseReadinessProbe } from "./readiness.js";
import { PrismaSetupRepository } from "./modules/setup/repository.js";
import { createSetupRouter } from "./modules/setup/router.js";
import { SetupService } from "./modules/setup/service.js";
import { PrismaSearchRepository } from "./modules/search/repository.js";
import { createSearchRouter } from "./modules/search/router.js";
import { LocalSearchService } from "./modules/search/service.js";
import { PrismaAiInteractionRepository } from "./modules/ai/repository.js";
import { createAiRouter } from "./modules/ai/router.js";
import {
  DisabledAiProviderAdapter,
  SourceGroundedAiService,
} from "./modules/ai/service.js";
import { PrismaFinanceRepository } from "./modules/finance/repository.js";
import { createFinanceRouter } from "./modules/finance/router.js";
import { FinanceService } from "./modules/finance/service.js";
import { PrismaFitnessRepository } from "./modules/fitness/repository.js";
import { createFitnessRouter } from "./modules/fitness/router.js";
import { FitnessService } from "./modules/fitness/service.js";
import {
  createIcsPreviewRouter,
  createIcsRouter,
} from "./modules/ics/router.js";
import { IcsImportService } from "./modules/ics/service.js";
import { HttpExternalCalDavClient } from "./modules/external-caldav/client.js";
import { PrismaExternalCalDavRepository } from "./modules/external-caldav/repository.js";
import { createExternalCalDavRouter } from "./modules/external-caldav/router.js";
import { ExternalCalDavService } from "./modules/external-caldav/service.js";

const main = async (): Promise<void> => {
  loadLocalEnvironment();
  const config = parseConfig();
  const logger = new JsonLogger(config.logLevel);
  if (config.databaseProvider === "sqlite") {
    await migrateSqliteDatabase(
      config.databaseUrl,
      config.sqliteMigrationsPath,
    );
  }
  const database = createDatabaseClient(config.databaseUrl);
  const profileRepository = new PrismaProfileRepository(database);
  const calendarRepository = new PrismaCalendarRepository(database);
  const calendars = new CalendarService(calendarRepository);
  const tasks = new TaskService(new PrismaTaskRepository(database));
  const study = new StudyService(new PrismaStudyRepository(database));
  const work = new WorkService(new PrismaWorkRepository(database));
  const planning = new PlanningService(new PrismaPlanningRepository(database));
  const projects = new ProjectService(new PrismaProjectRepository(database));
  const finance = new FinanceService(new PrismaFinanceRepository(database));
  const fitness = new FitnessService(new PrismaFitnessRepository(database));
  const ics = new IcsImportService(calendars);
  const externalCalDav = new ExternalCalDavService(
    new PrismaExternalCalDavRepository(database),
    new HttpExternalCalDavClient(),
    ics,
    config.integrationSecretKey,
  );
  const documentStorage = new LocalDocumentStorage(config.storagePath);
  await documentStorage.initialize();
  const knowledge = new KnowledgeService(
    new PrismaKnowledgeRepository(database),
    documentStorage,
  );
  const search = new LocalSearchService(new PrismaSearchRepository(database));
  const ai = new SourceGroundedAiService(
    search,
    new PrismaAiInteractionRepository(database),
    { enabled: false, adapter: new DisabledAiProviderAdapter() },
  );
  const taskEventLinks = new TaskEventLinkService(
    new PrismaTaskEventLinkRepository(database),
  );
  const dashboard = new DashboardService(
    new PrismaDashboardRepository(database),
  );
  const calDavRepository = new PrismaCalDavRepository(database);
  const authentication = new AuthenticationService(
    profileRepository,
    config.sessionTtlHours,
  );
  const application = createApplication({
    logger,
    readinessProbe: createDatabaseReadinessProbe(database),
    webOrigin: config.webOrigin,
    ...(config.webDistPath ? { webDistPath: config.webDistPath } : {}),
    rootRouters: [
      createCalDavRouter({
        authentication: new CalDavAuthenticationService(calDavRepository),
        repository: calDavRepository,
        calendars,
      }),
    ],
    rawModuleRouters: [
      createDocumentUploadRouter({ authentication, knowledge }),
      createIcsPreviewRouter({ authentication, ics }),
    ],
    moduleRouters: [
      createProfileRouter({
        authentication,
        profile: new ProfileService(profileRepository),
        secureCookies: useSecureCookies(config.webOrigin),
      }),
      createSetupRouter(new SetupService(new PrismaSetupRepository(database))),
      createCalendarRouter({
        authentication,
        calendars,
      }),
      createTaskRouter({
        authentication,
        tasks,
      }),
      createTaskEventLinkRouter({
        authentication,
        links: taskEventLinks,
      }),
      createDashboardRouter({
        authentication,
        dashboard,
      }),
      createStudyRouter({ authentication, study }),
      createWorkRouter({ authentication, work }),
      createPlanningRouter({ authentication, planning }),
      createProjectRouter({ authentication, projects }),
      createFinanceRouter({ authentication, finance }),
      createFitnessRouter({ authentication, fitness }),
      createIcsRouter({ authentication, ics }),
      createExternalCalDavRouter({ authentication, externalCalDav }),
      createKnowledgeRouter({ authentication, knowledge }),
      createSearchRouter({ authentication, search }),
      createAiRouter({ authentication, ai }),
    ],
  });
  let runningServer: Awaited<ReturnType<typeof startApiServer>>;
  try {
    runningServer = await startApiServer({
      application,
      config,
      logger,
      disconnect: () => database.$disconnect(),
    });
  } catch (error) {
    await database.$disconnect();
    throw error;
  }

  const handleSignal = (signal: "SIGINT" | "SIGTERM") => {
    void runningServer.shutdown(signal).catch(() => {
      process.exitCode = 1;
    });
  };

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);
};

void main().catch((error: unknown) => {
  const logger = new JsonLogger("error", process.stderr);
  const errorCode =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : undefined;
  logger.error("server.start.failed", {
    errorName: error instanceof Error ? error.name : "UnknownError",
    errorCode,
  });
  process.exitCode = 1;
});
