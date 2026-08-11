import type {
  CompleteSetupRequest,
  CompleteSetupResponse,
  SetupStatusResponse,
} from "@lifeos/contracts";
import { Router, type RequestHandler } from "express";
import { z } from "zod";

import { ApiError } from "../../errors.js";
import { validateRequest } from "../../middleware/validate-request.js";
import type { SetupService } from "./service.js";

const isSupportedTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat("de-DE", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
};

const setupSchema = z
  .strictObject({
    displayName: z.string().trim().min(1).max(200),
    password: z.string().min(12).max(200),
    calDavPassword: z.string().min(12).max(200),
    timezone: z.string().trim().min(1).max(100).refine(isSupportedTimeZone),
  })
  .refine((value) => value.password !== value.calDavPassword, {
    path: ["calDavPassword"],
    message: "App- und CalDAV-Passwort müssen unterschiedlich sein.",
  });

const requireLoopback: RequestHandler = (request, _response, next) => {
  const address = request.socket.remoteAddress;
  if (
    address !== "127.0.0.1" &&
    address !== "::1" &&
    address !== "::ffff:127.0.0.1"
  ) {
    next(ApiError.notFound());
    return;
  }
  next();
};

export const createSetupRouter = (setup: SetupService): Router => {
  const router = Router();
  router.use("/setup", requireLoopback);

  router.get("/setup", async (_request, response) => {
    const payload: SetupStatusResponse = await setup.status();
    response.json(payload);
  });

  router.post(
    "/setup",
    validateRequest({ body: setupSchema }),
    async (_request, response) => {
      await setup.complete(
        response.locals.validated.body as CompleteSetupRequest,
      );
      const payload: CompleteSetupResponse = { status: "configured" };
      response.status(201).json(payload);
    },
  );

  return router;
};
