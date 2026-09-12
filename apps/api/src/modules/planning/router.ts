import type {
  ConfirmPlanningProposalGroupRequest,
  CreateAvailabilityWindowRequest,
  CreatePlanningProposalsRequest,
  PlanningAutomationKind,
  PlanningArea,
  UpdatePlanningAutomationRequest,
  UpdateAvailabilityWindowRequest,
} from "@lifeos/contracts";
import { Router, type Response } from "express";
import { z } from "zod";
import { validateRequest } from "../../middleware/validate-request.js";
import { createRequireAuthentication } from "../profile/router.js";
import type { AuthenticationService } from "../profile/service.js";
import type { PlanningService } from "./service.js";
import type {
  PlanningAutomationService,
  PlanningProposalService,
} from "./proposal-service.js";
import {
  PlanningAutomationDisabledError,
  PlanningAutomationNotFoundError,
  PlanningProposalNotFoundError,
  PlanningProposalStateError,
} from "./proposal-repository.js";
import { ApiError } from "../../errors.js";

const id = z.uuid();
const area = z.enum([
  "calendar",
  "study",
  "work",
  "tasks",
  "projects",
  "fitness",
  "availability",
]);
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
const proposalQuery = z.strictObject({ from: z.iso.date(), to: z.iso.date() });
const proposalCreate = z.strictObject({
  view: z.enum(["day", "week"]),
  from: z.iso.date(),
  to: z.iso.date(),
  maxSuggestions: z.number().int().min(1).max(20).optional(),
});
const proposalGroup = z.strictObject({
  proposalIds: z
    .array(id)
    .min(1)
    .max(20)
    .refine((values) => new Set(values).size === values.length),
});
const automationKind = z.enum(["daily_preview", "weekly_preview"]);
const automationParams = z.strictObject({ kind: automationKind });
const automationBody = z.strictObject({
  enabled: z.boolean(),
  localMinute: z.number().int().min(0).max(1439),
  weekday: z.number().int().min(0).max(6).nullable().optional(),
  timezone,
  maxSuggestions: z.number().int().min(1).max(20).optional(),
});

const translatePlanningError = (error: unknown): never => {
  if (error instanceof ApiError) throw error;
  if (error instanceof PlanningProposalNotFoundError)
    throw new ApiError(
      404,
      "NOT_FOUND",
      "Der Planungsvorschlag wurde nicht gefunden.",
    );
  if (error instanceof PlanningProposalStateError)
    throw new ApiError(
      409,
      "CONFLICT",
      "Der Planungsvorschlag ist in diesem Status nicht ausführbar.",
    );
  if (error instanceof PlanningAutomationNotFoundError)
    throw new ApiError(
      404,
      "NOT_FOUND",
      "Die lokale Planungsautomation wurde nicht gefunden.",
    );
  if (error instanceof PlanningAutomationDisabledError)
    throw new ApiError(
      409,
      "CONFLICT",
      "Die lokale Planungsautomation ist deaktiviert.",
    );
  throw error;
};

export const createPlanningRouter = ({
  authentication,
  planning,
  proposals,
  automations,
}: {
  authentication: AuthenticationService;
  planning: PlanningService;
  proposals?: PlanningProposalService;
  automations?: PlanningAutomationService;
}): Router => {
  const router = Router();
  router.use(createRequireAuthentication(authentication));
  const owner = (response: Response) => String(response.locals.userId);
  if (proposals) {
    router.get(
      "/planning/proposals",
      validateRequest({ query: proposalQuery }),
      async (_request, response) => {
        try {
          response.json(
            await proposals.list(
              owner(response),
              response.locals.validated.query.from,
              response.locals.validated.query.to,
            ),
          );
        } catch (error) {
          translatePlanningError(error);
        }
      },
    );
    router.post(
      "/planning/proposals",
      validateRequest({ body: proposalCreate }),
      async (_request, response) => {
        try {
          response
            .status(201)
            .json(
              await proposals.generate(
                owner(response),
                response.locals.validated
                  .body as CreatePlanningProposalsRequest,
              ),
            );
        } catch (error) {
          translatePlanningError(error);
        }
      },
    );
    router.post(
      "/planning/proposals/confirm",
      validateRequest({ body: proposalGroup }),
      async (_request, response) => {
        try {
          response.json(
            await proposals.confirmGroup(
              owner(response),
              (
                response.locals.validated
                  .body as ConfirmPlanningProposalGroupRequest
              ).proposalIds,
            ),
          );
        } catch (error) {
          translatePlanningError(error);
        }
      },
    );
    for (const [suffix, operation] of [
      [
        "confirm",
        (userId: string, proposalId: string) =>
          proposals.confirm(userId, proposalId),
      ],
      [
        "reject",
        (userId: string, proposalId: string) =>
          proposals.reject(userId, proposalId),
      ],
      [
        "discard",
        (userId: string, proposalId: string) =>
          proposals.discard(userId, proposalId),
      ],
      [
        "reopen",
        (userId: string, proposalId: string) =>
          proposals.reopen(userId, proposalId),
      ],
    ] as const) {
      router.post(
        `/planning/proposals/:id/${suffix}`,
        validateRequest({ params }),
        async (_request, response) => {
          try {
            response.json(
              await operation(
                owner(response),
                response.locals.validated.params.id,
              ),
            );
          } catch (error) {
            translatePlanningError(error);
          }
        },
      );
    }
  }
  if (automations) {
    router.get("/planning/automations", async (_request, response) =>
      response.json(await automations.overview(owner(response))),
    );
    router.put(
      "/planning/automations/:kind",
      validateRequest({ params: automationParams, body: automationBody }),
      async (_request, response) => {
        try {
          response.json(
            await automations.update(
              owner(response),
              response.locals.validated.params.kind as PlanningAutomationKind,
              response.locals.validated.body as UpdatePlanningAutomationRequest,
            ),
          );
        } catch (error) {
          translatePlanningError(error);
        }
      },
    );
    router.post(
      "/planning/automations/:id/run",
      validateRequest({ params }),
      async (_request, response) => {
        try {
          response.json(
            await automations.run(
              owner(response),
              response.locals.validated.params.id,
              "manual",
            ),
          );
        } catch (error) {
          translatePlanningError(error);
        }
      },
    );
  }
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
