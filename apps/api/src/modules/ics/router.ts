import type { CommitIcsImportRequest } from "@lifeos/contracts";
import express, { Router } from "express";
import { z } from "zod";

import { ApiError } from "../../errors.js";
import { validateRequest } from "../../middleware/validate-request.js";
import { createRequireAuthentication } from "../profile/router.js";
import type { AuthenticationService } from "../profile/service.js";
import { MAX_ICS_BYTES, type IcsImportService } from "./service.js";

const calendarId = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._~-]+$/);
const params = z.strictObject({ calendarId });
const commitBody = z.strictObject({ previewId: z.uuid() });

export const createIcsPreviewRouter = ({
  authentication,
  ics,
}: {
  authentication: AuthenticationService;
  ics: IcsImportService;
}): Router => {
  const router = Router();
  router.post(
    "/calendars/:calendarId/ics/preview",
    createRequireAuthentication(authentication),
    validateRequest({ params }),
    express.text({
      type: ["text/calendar", "application/octet-stream", "text/plain"],
      limit: MAX_ICS_BYTES,
      defaultCharset: "utf-8",
    }),
    async (request, response) => {
      if (typeof request.body !== "string")
        throw new ApiError(
          415,
          "VALIDATION_ERROR",
          "Für die Importvorschau wird eine UTF-8-iCalendar-Datei erwartet.",
        );
      response
        .setHeader("Cache-Control", "private, no-store")
        .json(
          await ics.preview(
            String(response.locals.userId),
            response.locals.validated.params.calendarId,
            request.body,
          ),
        );
    },
  );
  return router;
};

export const createIcsRouter = ({
  authentication,
  ics,
}: {
  authentication: AuthenticationService;
  ics: IcsImportService;
}): Router => {
  const router = Router();
  router.use(createRequireAuthentication(authentication));
  router.get(
    "/calendars/:calendarId/ics/export",
    validateRequest({ params }),
    async (_request, response) => {
      const selected = response.locals.validated.params.calendarId;
      const source = await ics.exportCalendar(
        String(response.locals.userId),
        selected,
      );
      response
        .setHeader("Cache-Control", "private, no-store")
        .setHeader("Content-Type", "text/calendar; charset=utf-8")
        .setHeader(
          "Content-Disposition",
          `attachment; filename="lifeos-calendar-${selected}.ics"`,
        )
        .send(source);
    },
  );
  router.post(
    "/calendars/:calendarId/ics/commit",
    validateRequest({ params, body: commitBody }),
    async (_request, response) =>
      response.json(
        await ics.commit(
          String(response.locals.userId),
          response.locals.validated.params.calendarId,
          (response.locals.validated.body as CommitIcsImportRequest).previewId,
        ),
      ),
  );
  return router;
};
