import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

import type { Logger } from "../logger.js";

export const requestContext =
  (logger: Logger): RequestHandler =>
  (request, response, next) => {
    const startedAt = performance.now();
    const requestId = randomUUID();

    response.locals.requestId = requestId;
    response.setHeader("X-Request-Id", requestId);

    response.on("finish", () => {
      const routePattern =
        request.route && typeof request.route.path === "string"
          ? request.route.path
          : "unmatched";
      logger.info("http.request.completed", {
        requestId,
        method: request.method,
        route: routePattern,
        status: response.statusCode,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      });
    });

    next();
  };
