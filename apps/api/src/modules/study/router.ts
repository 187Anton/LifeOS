import type {
  CreateStudyEntryRequest,
  CreateStudyModuleRequest,
  CreateStudyProgramRequest,
  UpdateStudyEntryRequest,
  UpdateStudyModuleRequest,
  UpdateStudyProgramRequest,
} from "@lifeos/contracts";
import { Router, type Response } from "express";
import { z } from "zod";
import { validateRequest } from "../../middleware/validate-request.js";
import { createRequireAuthentication } from "../profile/router.js";
import type { AuthenticationService } from "../profile/service.js";
import type { StudyService } from "./service.js";

const status = z.enum([
  "planned",
  "active",
  "completed",
  "paused",
  "cancelled",
]);
const kind = z.enum(["lecture", "exam", "submission", "learning"]);
const id = z.uuid();
const nullableText = z.string().max(20_000).nullable().optional();
const timezone = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .nullable()
  .optional()
  .refine((value) => {
    if (!value) return true;
    try {
      new Intl.DateTimeFormat("de-DE", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  });
const common = { status: status.optional(), notes: nullableText };
const programCreate = z.strictObject({
  title: z.string().trim().min(1).max(500),
  institution: z.string().trim().min(1).max(500),
  periodLabel: z.string().trim().min(1).max(200),
  ...common,
});
const programUpdate = programCreate
  .partial()
  .extend({ archived: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0);
const moduleCreate = z.strictObject({
  programId: id,
  code: z.string().trim().min(1).max(100).nullable().optional(),
  title: z.string().trim().min(1).max(500),
  credits: z.number().min(0).max(9999).nullable().optional(),
  grade: z.string().trim().min(1).max(100).nullable().optional(),
  documentReferences: z
    .array(z.string().trim().min(1).max(1000))
    .max(20)
    .optional(),
  searchEnabled: z.boolean().optional(),
  ...common,
});
const moduleUpdate = moduleCreate
  .partial()
  .extend({ archived: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0);
const entryCreate = z.strictObject({
  moduleId: id,
  kind,
  title: z.string().trim().min(1).max(500),
  dueDate: z.iso.date().nullable().optional(),
  startsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  endsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  timezone,
  credits: z.number().min(0).max(9999).nullable().optional(),
  grade: z.string().trim().min(1).max(100).nullable().optional(),
  taskId: id.nullable().optional(),
  calendarEventId: id.nullable().optional(),
  ...common,
});
const entryUpdate = entryCreate
  .partial()
  .extend({ archived: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0);
const params = z.strictObject({ id });
const query = z.strictObject({
  includeArchived: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export const createStudyRouter = ({
  authentication,
  study,
}: {
  authentication: AuthenticationService;
  study: StudyService;
}): Router => {
  const router = Router();
  router.use(createRequireAuthentication(authentication));
  const owner = (response: Response) => String(response.locals.userId);
  router.get(
    "/study",
    validateRequest({ query }),
    async (_request, response) => {
      response.json(
        await study.getOverview(
          owner(response),
          response.locals.validated.query.includeArchived,
        ),
      );
    },
  );
  router.post(
    "/study/programs",
    validateRequest({ body: programCreate }),
    async (_request, response) => {
      response
        .status(201)
        .json(
          await study.createProgram(
            owner(response),
            response.locals.validated.body as CreateStudyProgramRequest,
          ),
        );
    },
  );
  router.patch(
    "/study/programs/:id",
    validateRequest({ params, body: programUpdate }),
    async (_request, response) => {
      response.json(
        await study.updateProgram(
          owner(response),
          response.locals.validated.params.id,
          response.locals.validated.body as UpdateStudyProgramRequest,
        ),
      );
    },
  );
  router.post(
    "/study/modules",
    validateRequest({ body: moduleCreate }),
    async (_request, response) => {
      response
        .status(201)
        .json(
          await study.createModule(
            owner(response),
            response.locals.validated.body as CreateStudyModuleRequest,
          ),
        );
    },
  );
  router.patch(
    "/study/modules/:id",
    validateRequest({ params, body: moduleUpdate }),
    async (_request, response) => {
      response.json(
        await study.updateModule(
          owner(response),
          response.locals.validated.params.id,
          response.locals.validated.body as UpdateStudyModuleRequest,
        ),
      );
    },
  );
  router.post(
    "/study/entries",
    validateRequest({ body: entryCreate }),
    async (_request, response) => {
      response
        .status(201)
        .json(
          await study.createEntry(
            owner(response),
            response.locals.validated.body as CreateStudyEntryRequest,
          ),
        );
    },
  );
  router.patch(
    "/study/entries/:id",
    validateRequest({ params, body: entryUpdate }),
    async (_request, response) => {
      response.json(
        await study.updateEntry(
          owner(response),
          response.locals.validated.params.id,
          response.locals.validated.body as UpdateStudyEntryRequest,
        ),
      );
    },
  );
  return router;
};
