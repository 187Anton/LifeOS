import type {
  CommitExternalCalDavImportRequest,
  CreateExternalCalDavConnectionRequest,
} from "@lifeos/contracts";
import { Router } from "express";
import { z } from "zod";

import { validateRequest } from "../../middleware/validate-request.js";
import { createRequireAuthentication } from "../profile/router.js";
import type { AuthenticationService } from "../profile/service.js";
import type { ExternalCalDavService } from "./service.js";

const idParams = z.strictObject({ connectionId: z.uuid() });
const calendarId = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._~-]+$/);
const createBody = z.strictObject({
  name: z.string().trim().min(1).max(100),
  baseUrl: z.string().trim().min(1).max(2048),
  username: z.string().min(1).max(500),
  password: z.string().min(1).max(1024),
});
const enabledBody = z.strictObject({ enabled: z.boolean() });
const previewBody = z.strictObject({
  externalCalendarId: z.uuid(),
  localCalendarId: calendarId,
});
const commitBody = z.strictObject({ externalImportId: z.uuid() });

export const createExternalCalDavRouter = ({
  authentication,
  externalCalDav,
}: {
  authentication: AuthenticationService;
  externalCalDav: ExternalCalDavService;
}) => {
  const router = Router();
  router.use(createRequireAuthentication(authentication));
  router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "private, no-store");
    next();
  });

  router.get("/integrations/caldav", async (_request, response) =>
    response.json(
      await externalCalDav.overview(String(response.locals.userId)),
    ),
  );
  router.post(
    "/integrations/caldav",
    validateRequest({ body: createBody }),
    async (_request, response) =>
      response
        .status(201)
        .json(
          await externalCalDav.create(
            String(response.locals.userId),
            response.locals.validated
              .body as CreateExternalCalDavConnectionRequest,
          ),
        ),
  );
  router.patch(
    "/integrations/caldav/:connectionId",
    validateRequest({ params: idParams, body: enabledBody }),
    async (_request, response) =>
      response.json(
        await externalCalDav.setEnabled(
          String(response.locals.userId),
          response.locals.validated.params.connectionId,
          response.locals.validated.body.enabled,
        ),
      ),
  );
  router.post(
    "/integrations/caldav/:connectionId/test",
    validateRequest({ params: idParams }),
    async (_request, response) =>
      response.json(
        await externalCalDav.test(
          String(response.locals.userId),
          response.locals.validated.params.connectionId,
        ),
      ),
  );
  router.get(
    "/integrations/caldav/:connectionId/calendars",
    validateRequest({ params: idParams }),
    async (_request, response) =>
      response.json(
        await externalCalDav.listCalendars(
          String(response.locals.userId),
          response.locals.validated.params.connectionId,
        ),
      ),
  );
  router.post(
    "/integrations/caldav/:connectionId/imports/preview",
    validateRequest({ params: idParams, body: previewBody }),
    async (_request, response) =>
      response.json(
        await externalCalDav.previewImport(
          String(response.locals.userId),
          response.locals.validated.params.connectionId,
          response.locals.validated.body.externalCalendarId,
          response.locals.validated.body.localCalendarId,
        ),
      ),
  );
  router.post(
    "/integrations/caldav/:connectionId/imports/commit",
    validateRequest({ params: idParams, body: commitBody }),
    async (_request, response) =>
      response.json(
        await externalCalDav.commitImport(
          String(response.locals.userId),
          response.locals.validated.params.connectionId,
          (response.locals.validated.body as CommitExternalCalDavImportRequest)
            .externalImportId,
        ),
      ),
  );
  router.delete(
    "/integrations/caldav/:connectionId",
    validateRequest({ params: idParams }),
    async (_request, response) => {
      await externalCalDav.revoke(
        String(response.locals.userId),
        response.locals.validated.params.connectionId,
      );
      response.status(204).end();
    },
  );
  return router;
};
