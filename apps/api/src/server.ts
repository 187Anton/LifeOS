import { createDatabaseClient } from "@lifeos/database";

import { createApplication } from "./application.js";
import { loadLocalEnvironment, parseConfig } from "./config.js";
import { startApiServer } from "./http-server.js";
import { JsonLogger } from "./logger.js";
import { createDatabaseReadinessProbe } from "./readiness.js";

const main = async (): Promise<void> => {
  loadLocalEnvironment();
  const config = parseConfig();
  const logger = new JsonLogger(config.logLevel);
  const database = createDatabaseClient(config.databaseUrl);
  const application = createApplication({
    logger,
    readinessProbe: createDatabaseReadinessProbe(database),
    webOrigin: config.webOrigin,
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
