import { Router, type Response } from "express";
import { z } from "zod";

import { validateRequest } from "../../middleware/validate-request.js";
import { createRequireAuthentication } from "../profile/router.js";
import type { AuthenticationService } from "../profile/service.js";
import type { LocalSearchService } from "./service.js";

const query = z.strictObject({ q: z.string().max(200).default("") });

export const createSearchRouter = ({
  authentication,
  search,
}: {
  authentication: AuthenticationService;
  search: LocalSearchService;
}): Router => {
  const router = Router();
  router.use(createRequireAuthentication(authentication));
  router.get(
    "/search",
    validateRequest({ query }),
    async (_request, response: Response) =>
      response.json(
        await search.search(
          String(response.locals.userId),
          response.locals.validated.query.q,
        ),
      ),
  );
  return router;
};
