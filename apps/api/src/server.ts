import { createDatabaseClient } from "@lifeos/database";

import { createApplication } from "./application.js";
import { loadLocalEnvironment, parseConfig } from "./config.js";
import { startApiServer } from "./http-server.js";
import { JsonLogger } from "./logger.js";
import { CalDavAuthenticationService } from "./modules/caldav/authentication.js";
import { PrismaCalDavRepository } from "./modules/caldav/repository.js";
import { createCalDavRouter } from "./modules/caldav/router.js";
import { PrismaCalendarRepository } from "./modules/calendar/repository.js";
import { createCalendarRouter } from "./modules/calendar/router.js";
import { CalendarService } from "./modules/calendar/service.js";
import { PrismaProfileRepository } from "./modules/profile/repository.js";
import { createProfileRouter } from "./modules/profile/router.js";
import {
  AuthenticationService,
  ProfileService,
} from "./modules/profile/service.js";
import { createDatabaseReadinessProbe } from "./readiness.js";

const main = async (): Promise<void> => {
  loadLocalEnvironment();
  const config = parseConfig();
  const logger = new JsonLogger(config.logLevel);
  const database = createDatabaseClient(config.databaseUrl);
  const profileRepository = new PrismaProfileRepository(database);
  const calendarRepository = new PrismaCalendarRepository(database);
  const calendars = new CalendarService(calendarRepository);
  const calDavRepository = new PrismaCalDavRepository(database);
  const authentication = new AuthenticationService(
    profileRepository,
    config.sessionTtlHours,
  );
  const application = createApplication({
    logger,
    readinessProbe: createDatabaseReadinessProbe(database),
    webOrigin: config.webOrigin,
    rootRouters: [
      createCalDavRouter({
        authentication: new CalDavAuthenticationService(calDavRepository),
        repository: calDavRepository,
        calendars,
      }),
    ],
    moduleRouters: [
      createProfileRouter({
        authentication,
        profile: new ProfileService(profileRepository),
        secureCookies: config.nodeEnv === "production",
      }),
      createCalendarRouter({
        authentication,
        calendars,
      }),
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

await main().catch((error: unknown) => {
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
