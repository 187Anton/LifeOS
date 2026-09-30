import { Router } from "express";

import { createRequireAuthentication } from "../profile/router.js";
import type { AuthenticationService } from "../profile/service.js";
import type { TaskCalendarBindingService } from "./service.js";

/**
 * Sichtbare Schnittstelle der verwalteten Aufgaben-Kalender-Abbildung. Die
 * Abbildungen entstehen ausschließlich aus den Fachfeldern der Aufgabe und
 * werden hier nur gelesen beziehungsweise idempotent geprüft. Sie sind bewusst
 * von der freien `TaskEventLink`-Beziehung getrennt: es gibt keinen Endpunkt,
 * der eine freie Verknüpfung in eine verwaltete Abbildung umdeutet.
 */
export const createTaskCalendarBindingRouter = ({
  authentication,
  bindings,
}: {
  authentication: AuthenticationService;
  bindings: TaskCalendarBindingService;
}): Router => {
  const router = Router();
  router.use(createRequireAuthentication(authentication));

  router.get("/task-calendar-bindings", async (_request, response) => {
    response.json(await bindings.listBindings(String(response.locals.userId)));
  });

  /**
   * Idempotente Bestands- und Wiederverbindungsprüfung. Sie verbindet nur
   * eindeutig erkennbare verwaltete Ereignisse erneut und meldet mehrdeutige
   * Fälle, statt etwas zu erzeugen oder umzudeuten.
   */
  router.post(
    "/task-calendar-bindings/reconcile",
    async (_request, response) => {
      response.json(await bindings.reconcile(String(response.locals.userId)));
    },
  );

  return router;
};
