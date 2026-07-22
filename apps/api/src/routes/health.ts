import {
  API_VERSION,
  type HealthResponse,
  type ReadinessResponse,
} from "@lifeos/contracts";
import { Router } from "express";
import { z } from "zod";

import { ApiError } from "../errors.js";
import { validateRequest } from "../middleware/validate-request.js";
import type { ReadinessProbe } from "../readiness.js";

const emptyQuery = z.strictObject({});

export const createHealthRouter = (readinessProbe: ReadinessProbe): Router => {
  const router = Router();

  router.get(
    "/health",
    validateRequest({ query: emptyQuery }),
    (_request, response) => {
      const payload: HealthResponse = { apiVersion: API_VERSION, status: "ok" };
      response.json(payload);
    },
  );

  router.get(
    "/readiness",
    validateRequest({ query: emptyQuery }),
    async (_request, response, next) => {
      try {
        await readinessProbe.check();
      } catch {
        next(
          new ApiError(
            503,
            "SERVICE_NOT_READY",
            "Die API ist erreichbar, aber die Datenbank ist noch nicht bereit.",
          ),
        );
        return;
      }

      const payload: ReadinessResponse = {
        apiVersion: API_VERSION,
        status: "ready",
        checks: { database: "up" },
      };
      response.json(payload);
    },
  );

  return router;
};
