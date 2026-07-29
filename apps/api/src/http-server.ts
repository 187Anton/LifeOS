import { createServer, type Server } from "node:http";

import type { Express } from "express";

import type { ApiConfig } from "./config.js";
import type { Logger } from "./logger.js";

interface ServerDependencies {
  application: Express;
  config: ApiConfig;
  disconnect: () => Promise<void>;
  logger: Logger;
}

export interface RunningApiServer {
  server: Server;
  shutdown(reason: string): Promise<void>;
}

export const startApiServer = async ({
  application,
  config,
  disconnect,
  logger,
}: ServerDependencies): Promise<RunningApiServer> => {
  const server = createServer(application);

  await new Promise<void>((resolve, reject) => {
    const handleError = (error: Error) => reject(error);
    server.once("error", handleError);
    server.listen(config.port, config.host, () => {
      server.off("error", handleError);
      resolve();
    });
  });

  logger.info("server.started", {
    host: config.host,
    port: config.port,
    nodeEnv: config.nodeEnv,
  });

  let shutdownPromise: Promise<void> | undefined;
  const shutdown = (reason: string): Promise<void> => {
    shutdownPromise ??= (async () => {
      logger.info("server.shutdown.started", { reason });

      const timeout = setTimeout(() => {
        server.closeAllConnections();
      }, config.shutdownTimeoutMs);
      timeout.unref();

      try {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
        await disconnect();
        logger.info("server.shutdown.completed", { reason });
      } finally {
        clearTimeout(timeout);
      }
    })();

    return shutdownPromise;
  };

  return { server, shutdown };
};
