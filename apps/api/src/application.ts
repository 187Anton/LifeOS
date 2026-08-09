import path from "node:path";

import express, { type Express, type Router } from "express";

import type { Logger } from "./logger.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { requestContext } from "./middleware/request-context.js";
import type { ReadinessProbe } from "./readiness.js";
import { createHealthRouter } from "./routes/health.js";

interface ApplicationDependencies {
  logger: Logger;
  readinessProbe: ReadinessProbe;
  webOrigin: string;
  webDistPath?: string | undefined;
  moduleRouters?: Router[];
  rootRouters?: Router[];
}

export const createApplication = ({
  logger,
  readinessProbe,
  webOrigin,
  webDistPath,
  moduleRouters = [],
  rootRouters = [],
}: ApplicationDependencies): Express => {
  const application = express();

  application.disable("x-powered-by");
  application.use(requestContext(logger));
  application.use((request, response, next) => {
    if (request.headers.origin === webOrigin) {
      response.setHeader("Access-Control-Allow-Origin", webOrigin);
      response.setHeader("Access-Control-Allow-Credentials", "true");
      response.setHeader("Vary", "Origin");
      response.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      );
      response.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type, If-Match, If-None-Match",
      );

      if (request.method === "OPTIONS") {
        response.status(204).end();
        return;
      }
    }
    next();
  });
  application.use(express.json({ limit: "64kb" }));
  for (const router of rootRouters) {
    application.use(router);
  }
  application.use("/api/v1", createHealthRouter(readinessProbe));

  for (const router of moduleRouters) {
    application.use("/api/v1", router);
  }

  if (webDistPath) {
    application.use(
      express.static(webDistPath, {
        dotfiles: "deny",
        fallthrough: true,
        index: false,
      }),
    );
    application.get(/.*/, (request, response, next) => {
      if (
        request.path.startsWith("/api/") ||
        request.path.startsWith("/caldav/") ||
        path.extname(request.path) !== "" ||
        !request.accepts("html")
      ) {
        next();
        return;
      }
      response.sendFile(path.join(webDistPath, "index.html"), (error) => {
        if (error) next(error);
      });
    });
  }

  application.use(notFoundHandler);
  application.use(errorHandler(logger));

  return application;
};
