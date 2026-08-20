import type {
  CreateWorkContextRequest,
  CreateWorkProjectRequest,
  CreateWorkTaskLinkRequest,
  CreateWorkTimeEntryRequest,
  UpdateWorkContextRequest,
  UpdateWorkProjectRequest,
  UpdateWorkTimeEntryRequest,
} from "@lifeos/contracts";
import { Router, type Response } from "express";
import { z } from "zod";
import { validateRequest } from "../../middleware/validate-request.js";
import { createRequireAuthentication } from "../profile/router.js";
import type { AuthenticationService } from "../profile/service.js";
import type { WorkService } from "./service.js";

const id = z.uuid();
const status = z.enum([
  "planned",
  "active",
  "completed",
  "paused",
  "cancelled",
]);
const optionalText = z.string().max(20_000).nullable().optional();
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
const contextCreate = z.strictObject({
  title: z.string().trim().min(1).max(500),
  role: z.string().trim().min(1).max(500),
  organization: z.string().trim().min(1).max(500).nullable().optional(),
  startsOn: z.iso.date().nullable().optional(),
  endsOn: z.iso.date().nullable().optional(),
  timezone,
  status: status.optional(),
  notes: optionalText,
});
const contextUpdate = contextCreate
  .partial()
  .extend({ archived: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0);
const projectCreate = z.strictObject({
  contextId: id,
  title: z.string().trim().min(1).max(500),
  status: status.optional(),
  goal: optionalText,
  deadlineDate: z.iso.date().nullable().optional(),
  calendarEventId: id.nullable().optional(),
  notes: optionalText,
  searchEnabled: z.boolean().optional(),
});
const projectUpdate = projectCreate
  .partial()
  .extend({ archived: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0);
const taskLinkCreate = z.strictObject({
  contextId: id,
  projectId: id.nullable().optional(),
  taskId: id,
});
const timeCreate = z.strictObject({
  contextId: id,
  projectId: id.nullable().optional(),
  taskId: id.nullable().optional(),
  kind: z.enum(["planned", "actual"]),
  title: z.string().trim().min(1).max(500),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  timezone,
  notes: optionalText,
});
const timeUpdate = timeCreate
  .partial()
  .extend({ archived: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0);
const params = z.strictObject({ id });
const query = z.strictObject({
  includeArchived: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  contextId: id.optional(),
  status: status.optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

export const createWorkRouter = ({
  authentication,
  work,
}: {
  authentication: AuthenticationService;
  work: WorkService;
}): Router => {
  const router = Router();
  router.use(createRequireAuthentication(authentication));
  const owner = (response: Response) => String(response.locals.userId);
  router.get(
    "/work",
    validateRequest({ query }),
    async (_request, response) => {
      response.json(
        await work.getOverview(
          owner(response),
          response.locals.validated.query,
        ),
      );
    },
  );
  router.post(
    "/work/contexts",
    validateRequest({ body: contextCreate }),
    async (_request, response) => {
      response
        .status(201)
        .json(
          await work.createContext(
            owner(response),
            response.locals.validated.body as CreateWorkContextRequest,
          ),
        );
    },
  );
  router.patch(
    "/work/contexts/:id",
    validateRequest({ params, body: contextUpdate }),
    async (_request, response) => {
      response.json(
        await work.updateContext(
          owner(response),
          response.locals.validated.params.id,
          response.locals.validated.body as UpdateWorkContextRequest,
        ),
      );
    },
  );
  router.post(
    "/work/projects",
    validateRequest({ body: projectCreate }),
    async (_request, response) => {
      response
        .status(201)
        .json(
          await work.createProject(
            owner(response),
            response.locals.validated.body as CreateWorkProjectRequest,
          ),
        );
    },
  );
  router.patch(
    "/work/projects/:id",
    validateRequest({ params, body: projectUpdate }),
    async (_request, response) => {
      response.json(
        await work.updateProject(
          owner(response),
          response.locals.validated.params.id,
          response.locals.validated.body as UpdateWorkProjectRequest,
        ),
      );
    },
  );
  router.post(
    "/work/task-links",
    validateRequest({ body: taskLinkCreate }),
    async (_request, response) => {
      response
        .status(201)
        .json(
          await work.createTaskLink(
            owner(response),
            response.locals.validated.body as CreateWorkTaskLinkRequest,
          ),
        );
    },
  );
  router.delete(
    "/work/task-links/:id",
    validateRequest({ params }),
    async (_request, response) => {
      await work.deleteTaskLink(
        owner(response),
        response.locals.validated.params.id,
      );
      response.status(204).end();
    },
  );
  router.post(
    "/work/time-entries",
    validateRequest({ body: timeCreate }),
    async (_request, response) => {
      response
        .status(201)
        .json(
          await work.createTimeEntry(
            owner(response),
            response.locals.validated.body as CreateWorkTimeEntryRequest,
          ),
        );
    },
  );
  router.patch(
    "/work/time-entries/:id",
    validateRequest({ params, body: timeUpdate }),
    async (_request, response) => {
      response.json(
        await work.updateTimeEntry(
          owner(response),
          response.locals.validated.params.id,
          response.locals.validated.body as UpdateWorkTimeEntryRequest,
        ),
      );
    },
  );
  return router;
};
