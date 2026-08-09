import type {
  CreateAvailabilityWindowRequest,
  PlanningArea,
  UpdateAvailabilityWindowRequest,
} from "@lifeos/contracts";
import { Router, type Response } from "express";
import { z } from "zod";
import { validateRequest } from "../../middleware/validate-request.js";
import { createRequireAuthentication } from "../profile/router.js";
import type { AuthenticationService } from "../profile/service.js";
import type { PlanningService } from "./service.js";

const id = z.uuid();
const area = z.enum(["calendar", "study", "work", "tasks", "availability"]);
const timezone = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("de-DE", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, "Unbekannte IANA-Zeitzone.");
const query = z.strictObject({
  from: z.iso.date(),
  to: z.iso.date(),
  areas: z
    .string()
    .transform((value, context) => {
      const values = [...new Set(value.split(",").filter(Boolean))];
      const parsed = z.array(area).safeParse(values);
      if (!parsed.success) {
        context.addIssue({
          code: "custom",
          message: "Unbekannter Planungsbereich.",
        });
        return z.NEVER;
      }
      return parsed.data;
    })
    .optional(),
});
const availabilityFields = z.strictObject({
  weekday: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
  timezone,
  label: z.string().trim().min(1).max(200).nullable().optional(),
});
const availabilityCreate = availabilityFields.refine(
  (value) => value.endMinute > value.startMinute,
  {
    path: ["endMinute"],
    message: "Das Ende muss nach dem Beginn liegen.",
  },
);
const availabilityUpdate = availabilityFields
  .partial()
  .refine(
    (value) =>
      value.startMinute === undefined ||
      value.endMinute === undefined ||
      value.endMinute > value.startMinute,
    {
      path: ["endMinute"],
      message: "Das Ende muss nach dem Beginn liegen.",
    },
  )
  .refine((value) => Object.keys(value).length > 0);
const params = z.strictObject({ id });

export const createPlanningRouter = ({
  authentication,
  planning,
}: {
  authentication: AuthenticationService;
  planning: PlanningService;
}): Router => {
  const router = Router();
  router.use(createRequireAuthentication(authentication));
  const owner = (response: Response) => String(response.locals.userId);
  router.get(
    "/planning",
    validateRequest({ query }),
    async (_request, response) => {
      const values = response.locals.validated.query as {
        from: string;
        to: string;
        areas?: PlanningArea[];
      };
      response.json(await planning.getPlanning(owner(response), values));
    },
  );
  router.post(
    "/planning/availability",
    validateRequest({ body: availabilityCreate }),
    async (_request, response) => {
      response
        .status(201)
        .json(
          await planning.createAvailability(
            owner(response),
            response.locals.validated.body as CreateAvailabilityWindowRequest,
          ),
        );
    },
  );
  router.patch(
    "/planning/availability/:id",
    validateRequest({ params, body: availabilityUpdate }),
    async (_request, response) => {
      response.json(
        await planning.updateAvailability(
          owner(response),
          response.locals.validated.params.id,
          response.locals.validated.body as UpdateAvailabilityWindowRequest,
        ),
      );
    },
  );
  router.delete(
    "/planning/availability/:id",
    validateRequest({ params }),
    async (_request, response) => {
      await planning.deleteAvailability(
        owner(response),
        response.locals.validated.params.id,
      );
      response.status(204).end();
    },
  );
  return router;
};
