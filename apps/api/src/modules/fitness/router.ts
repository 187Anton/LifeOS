import type {
  CreateBodyWeightEntryRequest,
  CreateFitnessExerciseRequest,
  CreateFitnessPlanRequest,
  CreateFitnessSessionRequest,
  CreateFitnessSetRequest,
  UpdateBodyWeightEntryRequest,
  UpdateFitnessExerciseRequest,
  UpdateFitnessPlanRequest,
  UpdateFitnessSessionRequest,
  UpdateFitnessSetRequest,
  UpsertFitnessPlanExerciseRequest,
} from "@lifeos/contracts";
import { Router, type Response } from "express";
import { z } from "zod";
import { validateRequest } from "../../middleware/validate-request.js";
import { createRequireAuthentication } from "../profile/router.js";
import type { AuthenticationService } from "../profile/service.js";
import type { FitnessService } from "./service.js";

const id = z.uuid();
const text = z.string().trim().min(1).max(200);
const note = z.string().max(2_000).nullable().optional();
const nullableMetric = (maximum: number) =>
  z.number().int().min(1).max(maximum).nullable().optional();
const timezone = z.string().trim().min(1).max(100).nullable().optional();
const planCreate = z.strictObject({ name: text, notes: note });
const planUpdate = planCreate
  .partial()
  .extend({ archived: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0);
const exerciseCreate = z.strictObject({ name: text, notes: note });
const exerciseUpdate = exerciseCreate
  .partial()
  .extend({ archived: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0);
const planExercise = z.strictObject({
  exerciseId: id,
  position: z.number().int().min(0).max(500),
  targetSets: nullableMetric(100),
  targetRepetitions: nullableMetric(10_000),
  targetWeightGrams: nullableMetric(1_000_000),
  targetDurationSeconds: nullableMetric(604_800),
  targetDistanceMeters: nullableMetric(1_000_000),
});
const planExerciseUpdate = planExercise
  .partial()
  .refine((value) => Object.keys(value).length > 0);
const sessionBase = z.strictObject({
  planId: id.nullable().optional(),
  title: text,
  status: z.enum(["planned", "completed", "cancelled"]).optional(),
  performedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  timezone,
  notes: note,
  calendarId: id.nullable().optional(),
  eventUid: z.string().trim().min(1).max(255).nullable().optional(),
});
const pairedCalendar = <T extends { calendarId?: unknown; eventUid?: unknown }>(
  value: T,
) => Boolean(value.calendarId) === Boolean(value.eventUid);
const sessionCreate = sessionBase
  .refine(pairedCalendar, {
    message: "Kalender-ID und Ereignis-UID müssen gemeinsam angegeben werden.",
  })
  .superRefine((value, context) => {
    const status = value.status ?? "planned";
    const completed = status === "completed";
    if (
      completed !== Boolean(value.performedAt) ||
      completed !== Boolean(value.timezone)
    )
      context.addIssue({
        code: "custom",
        message:
          "Abgeschlossene Einheiten benötigen Zeitpunkt und Zeitzone; andere Einheiten dürfen beides nicht enthalten.",
      });
  });
const sessionUpdate = sessionBase
  .partial()
  .extend({ archived: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0)
  .superRefine((value, context) => {
    const calendarChanged =
      Object.hasOwn(value, "calendarId") || Object.hasOwn(value, "eventUid");
    if (calendarChanged && !pairedCalendar(value))
      context.addIssue({
        code: "custom",
        message:
          "Kalender-ID und Ereignis-UID müssen gemeinsam geändert werden.",
      });
    const completionChanged = ["status", "performedAt", "timezone"].some(
      (key) => Object.hasOwn(value, key),
    );
    if (
      completionChanged &&
      !["status", "performedAt", "timezone"].every((key) =>
        Object.hasOwn(value, key),
      )
    )
      context.addIssue({
        code: "custom",
        message:
          "Status, Zeitpunkt und Zeitzone müssen gemeinsam geändert werden.",
      });
  });
const setShape = {
  sessionId: id,
  exerciseId: id,
  setNumber: z.number().int().min(1).max(100),
  repetitions: nullableMetric(10_000),
  weightGrams: nullableMetric(1_000_000),
  durationSeconds: nullableMetric(604_800),
  distanceMeters: nullableMetric(1_000_000),
  completedAt: z.iso.datetime({ offset: true }).nullable().optional(),
};
const setCreate = z
  .strictObject(setShape)
  .refine(
    (value) =>
      value.repetitions != null ||
      value.weightGrams != null ||
      value.durationSeconds != null ||
      value.distanceMeters != null,
    { message: "Mindestens ein Leistungswert ist erforderlich." },
  );
const setUpdate = z
  .strictObject(setShape)
  .partial()
  .refine((value) => Object.keys(value).length > 0);
const bodyWeightCreate = z.strictObject({
  measuredDate: z.iso.date(),
  weightGrams: z.number().int().min(20_000).max(500_000),
  note,
});
const bodyWeightUpdate = bodyWeightCreate
  .partial()
  .extend({ archived: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0);
const params = z.strictObject({ id });
const planParams = z.strictObject({ planId: id });
const overviewQuery = z.strictObject({
  includeArchived: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export const createFitnessRouter = ({
  authentication,
  fitness,
}: {
  authentication: AuthenticationService;
  fitness: FitnessService;
}): Router => {
  const router = Router();
  router.use(createRequireAuthentication(authentication));
  const owner = (response: Response) => String(response.locals.userId);
  router.get(
    "/fitness",
    validateRequest({ query: overviewQuery }),
    async (_request, response) =>
      response.json(
        await fitness.getOverview(
          owner(response),
          response.locals.validated.query.includeArchived,
        ),
      ),
  );
  router.post(
    "/fitness/plans",
    validateRequest({ body: planCreate }),
    async (_request, response) =>
      response
        .status(201)
        .json(
          await fitness.createPlan(
            owner(response),
            response.locals.validated.body as CreateFitnessPlanRequest,
          ),
        ),
  );
  router.patch(
    "/fitness/plans/:id",
    validateRequest({ params, body: planUpdate }),
    async (_request, response) =>
      response.json(
        await fitness.updatePlan(
          owner(response),
          response.locals.validated.params.id,
          response.locals.validated.body as UpdateFitnessPlanRequest,
        ),
      ),
  );
  router.post(
    "/fitness/exercises",
    validateRequest({ body: exerciseCreate }),
    async (_request, response) =>
      response
        .status(201)
        .json(
          await fitness.createExercise(
            owner(response),
            response.locals.validated.body as CreateFitnessExerciseRequest,
          ),
        ),
  );
  router.patch(
    "/fitness/exercises/:id",
    validateRequest({ params, body: exerciseUpdate }),
    async (_request, response) =>
      response.json(
        await fitness.updateExercise(
          owner(response),
          response.locals.validated.params.id,
          response.locals.validated.body as UpdateFitnessExerciseRequest,
        ),
      ),
  );
  router.post(
    "/fitness/plans/:planId/exercises",
    validateRequest({ params: planParams, body: planExercise }),
    async (_request, response) =>
      response
        .status(201)
        .json(
          await fitness.addPlanExercise(
            owner(response),
            response.locals.validated.params.planId,
            response.locals.validated.body as UpsertFitnessPlanExerciseRequest,
          ),
        ),
  );
  router.patch(
    "/fitness/plan-exercises/:id",
    validateRequest({ params, body: planExerciseUpdate }),
    async (_request, response) =>
      response.json(
        await fitness.updatePlanExercise(
          owner(response),
          response.locals.validated.params.id,
          response.locals.validated.body,
        ),
      ),
  );
  router.post(
    "/fitness/sessions",
    validateRequest({ body: sessionCreate }),
    async (_request, response) =>
      response
        .status(201)
        .json(
          await fitness.createSession(
            owner(response),
            response.locals.validated.body as CreateFitnessSessionRequest,
          ),
        ),
  );
  router.patch(
    "/fitness/sessions/:id",
    validateRequest({ params, body: sessionUpdate }),
    async (_request, response) =>
      response.json(
        await fitness.updateSession(
          owner(response),
          response.locals.validated.params.id,
          response.locals.validated.body as UpdateFitnessSessionRequest,
        ),
      ),
  );
  router.post(
    "/fitness/sets",
    validateRequest({ body: setCreate }),
    async (_request, response) =>
      response
        .status(201)
        .json(
          await fitness.createSet(
            owner(response),
            response.locals.validated.body as CreateFitnessSetRequest,
          ),
        ),
  );
  router.patch(
    "/fitness/sets/:id",
    validateRequest({ params, body: setUpdate }),
    async (_request, response) =>
      response.json(
        await fitness.updateSet(
          owner(response),
          response.locals.validated.params.id,
          response.locals.validated.body as UpdateFitnessSetRequest,
        ),
      ),
  );
  router.post(
    "/fitness/body-weights",
    validateRequest({ body: bodyWeightCreate }),
    async (_request, response) =>
      response
        .status(201)
        .json(
          await fitness.createBodyWeight(
            owner(response),
            response.locals.validated.body as CreateBodyWeightEntryRequest,
          ),
        ),
  );
  router.patch(
    "/fitness/body-weights/:id",
    validateRequest({ params, body: bodyWeightUpdate }),
    async (_request, response) =>
      response.json(
        await fitness.updateBodyWeight(
          owner(response),
          response.locals.validated.params.id,
          response.locals.validated.body as UpdateBodyWeightEntryRequest,
        ),
      ),
  );
  return router;
};
