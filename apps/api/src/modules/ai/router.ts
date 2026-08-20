import { Router, type Response } from "express";
import { z } from "zod";

import { ApiError } from "../../errors.js";
import { validateRequest } from "../../middleware/validate-request.js";
import { createRequireAuthentication } from "../profile/router.js";
import type { AuthenticationService } from "../profile/service.js";
import { AiSuggestionNotFoundError } from "./repository.js";
import type { SourceGroundedAiService } from "./service.js";

const queryBody = z.strictObject({
  query: z.string().trim().min(1).max(200),
  minimumSources: z.number().int().min(1).max(5).optional(),
});
const parameters = z.strictObject({
  interactionId: z.uuid(),
  suggestionId: z.uuid(),
});

export const createAiRouter = ({
  authentication,
  ai,
}: {
  authentication: AuthenticationService;
  ai: SourceGroundedAiService;
}): Router => {
  const router = Router();
  router.use(createRequireAuthentication(authentication));
  router.get("/ai/status", (_request, response) => response.json(ai.status()));
  router.post(
    "/ai/queries",
    validateRequest({ body: queryBody }),
    async (_request, response: Response) =>
      response
        .status(201)
        .json(
          await ai.query(
            String(response.locals.userId),
            response.locals.validated.body,
          ),
        ),
  );
  router.post(
    "/ai/interactions/:interactionId/suggestions/:suggestionId/confirm",
    validateRequest({ params: parameters }),
    async (_request, response: Response) => {
      try {
        return response.json(
          await ai.confirmSuggestion(
            String(response.locals.userId),
            response.locals.validated.params.interactionId,
            response.locals.validated.params.suggestionId,
          ),
        );
      } catch (error) {
        if (error instanceof AiSuggestionNotFoundError)
          throw new ApiError(
            404,
            "NOT_FOUND",
            "Der KI-Vorschlag wurde nicht gefunden.",
          );
        throw error;
      }
    },
  );
  return router;
};
