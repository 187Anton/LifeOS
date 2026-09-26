import { Router, type Response } from "express";
import { z } from "zod";

import { validateRequest } from "../../middleware/validate-request.js";
import { createRequireAuthentication } from "../profile/router.js";
import type { AuthenticationService } from "../profile/service.js";
import type { LocalSearchService } from "./service.js";

const query = z.strictObject({
  q: z.string().max(200).default(""),
  /**
   * Optionaler Modulfilter der Modulsuche. Er beschränkt die Suche auf Objekte
   * mit diesem Studienmodulbezug; ohne Angabe bleibt die Suche unverändert
   * bereichsübergreifend.
   */
  studyModuleId: z.uuid().optional(),
});

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
    async (_request, response: Response) => {
      const { q, studyModuleId } = response.locals.validated.query;
      return response.json(
        await search.search(String(response.locals.userId), q, {
          studyModuleId: studyModuleId ?? null,
        }),
      );
    },
  );
  return router;
};
