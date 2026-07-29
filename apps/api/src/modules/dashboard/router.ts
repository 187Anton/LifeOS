import { Router } from "express";

import { createRequireAuthentication } from "../profile/router.js";
import type { AuthenticationService } from "../profile/service.js";
import type { DashboardService } from "./service.js";

export const createDashboardRouter = ({
  authentication,
  dashboard,
}: {
  authentication: AuthenticationService;
  dashboard: DashboardService;
}): Router => {
  const router = Router();
  router.use(createRequireAuthentication(authentication));
  router.get("/dashboard", async (_request, response) => {
    response.json(await dashboard.getSnapshot(String(response.locals.userId)));
  });
  return router;
};
