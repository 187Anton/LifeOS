import type { CreateTaskEventLinkRequest } from "@lifeos/contracts";
import { Router } from "express";
import { z } from "zod";

import { validateRequest } from "../../middleware/validate-request.js";
import { createRequireAuthentication } from "../profile/router.js";
import type { AuthenticationService } from "../profile/service.js";
import type { TaskEventLinkService } from "./service.js";

const linkInput = z.strictObject({
  taskId: z.uuid(),
  calendarId: z.string().trim().min(1).max(100),
  eventUid: z.string().trim().min(1).max(255),
});

const linkParams = z.strictObject({ linkId: z.uuid() });

export const createTaskEventLinkRouter = ({
  authentication,
  links,
}: {
  authentication: AuthenticationService;
  links: TaskEventLinkService;
}): Router => {
  const router = Router();
  router.use(createRequireAuthentication(authentication));

  router.get("/task-event-links", async (_request, response) => {
    response.json(await links.listLinks(String(response.locals.userId)));
  });

  router.post(
    "/task-event-links",
    validateRequest({ body: linkInput }),
    async (_request, response) => {
      const result = await links.createLink(
        String(response.locals.userId),
        response.locals.validated.body as CreateTaskEventLinkRequest,
      );
      response.status(result.created ? 201 : 200).json(result.link);
    },
  );

  router.delete(
    "/task-event-links/:linkId",
    validateRequest({ params: linkParams }),
    async (_request, response) => {
      await links.deleteLink(
        String(response.locals.userId),
        response.locals.validated.params.linkId,
      );
      response.status(204).end();
    },
  );

  return router;
};
