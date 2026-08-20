import type { CreateGitHubConnectionRequest } from "@lifeos/contracts";
import { Router } from "express";
import { z } from "zod";

import { validateRequest } from "../../middleware/validate-request.js";
import { createRequireAuthentication } from "../profile/router.js";
import type { AuthenticationService } from "../profile/service.js";
import type { GitHubIntegrationService } from "./service.js";

const idParams = z.strictObject({ connectionId: z.uuid() });
const repositoryParams = idParams.extend({
  owner: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9_.-]+$/),
  repository: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9_.-]+$/),
});
const createBody = z.strictObject({
  name: z.string().trim().min(1).max(100),
  token: z.string().trim().min(20).max(500),
});
const enabledBody = z.strictObject({ enabled: z.boolean() });

export const createGitHubIntegrationRouter = ({
  authentication,
  github,
}: {
  authentication: AuthenticationService;
  github: GitHubIntegrationService;
}) => {
  const router = Router();
  router.use(createRequireAuthentication(authentication));
  router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "private, no-store");
    next();
  });
  router.get("/integrations/github", async (_request, response) =>
    response.json(await github.overview(String(response.locals.userId))),
  );
  router.post(
    "/integrations/github",
    validateRequest({ body: createBody }),
    async (_request, response) =>
      response
        .status(201)
        .json(
          await github.create(
            String(response.locals.userId),
            response.locals.validated.body as CreateGitHubConnectionRequest,
          ),
        ),
  );
  router.patch(
    "/integrations/github/:connectionId",
    validateRequest({ params: idParams, body: enabledBody }),
    async (_request, response) =>
      response.json(
        await github.setEnabled(
          String(response.locals.userId),
          response.locals.validated.params.connectionId,
          response.locals.validated.body.enabled,
        ),
      ),
  );
  router.post(
    "/integrations/github/:connectionId/test",
    validateRequest({ params: idParams }),
    async (_request, response) =>
      response.json(
        await github.test(
          String(response.locals.userId),
          response.locals.validated.params.connectionId,
        ),
      ),
  );
  router.get(
    "/integrations/github/:connectionId/repositories",
    validateRequest({ params: idParams }),
    async (_request, response) =>
      response.json(
        await github.repositories(
          String(response.locals.userId),
          response.locals.validated.params.connectionId,
        ),
      ),
  );
  router.get(
    "/integrations/github/:connectionId/repositories/:owner/:repository",
    validateRequest({ params: repositoryParams }),
    async (_request, response) =>
      response.json(
        await github.repositorySnapshot(
          String(response.locals.userId),
          response.locals.validated.params.connectionId,
          response.locals.validated.params.owner,
          response.locals.validated.params.repository,
        ),
      ),
  );
  router.delete(
    "/integrations/github/:connectionId",
    validateRequest({ params: idParams }),
    async (_request, response) => {
      await github.revoke(
        String(response.locals.userId),
        response.locals.validated.params.connectionId,
      );
      response.status(204).end();
    },
  );
  return router;
};
