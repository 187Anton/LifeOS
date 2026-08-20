import type {
  CreateProjectEventLinkRequest,
  CreateProjectItemRequest,
  CreateProjectRequest,
  CreateProjectTaskLinkRequest,
  UpdateProjectItemRequest,
  UpdateProjectRequest,
} from "@lifeos/contracts";
import { Router, type Response } from "express";
import { z } from "zod";

import { validateRequest } from "../../middleware/validate-request.js";
import { createRequireAuthentication } from "../profile/router.js";
import type { AuthenticationService } from "../profile/service.js";
import type { ProjectService } from "./service.js";

const id = z.uuid();
const projectStatus = z.enum([
  "planned",
  "active",
  "paused",
  "completed",
  "cancelled",
]);
const itemStatus = z.enum(["open", "in_progress", "completed", "cancelled"]);
const nullableText = z.string().max(20_000).nullable().optional();
const projectCreate = z.strictObject({
  title: z.string().trim().min(1).max(500),
  description: nullableText,
  status: projectStatus.optional(),
  risk: nullableText,
  dueDate: z.iso.date().nullable().optional(),
  searchEnabled: z.boolean().optional(),
});
const projectUpdate = projectCreate
  .partial()
  .extend({ archived: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0);
const itemCreate = z.strictObject({
  title: z.string().trim().min(1).max(500),
  description: nullableText,
  status: itemStatus.optional(),
  risk: nullableText,
  dueDate: z.iso.date().nullable().optional(),
});
const itemUpdate = itemCreate
  .partial()
  .extend({ archived: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0);
const projectParams = z.strictObject({ projectId: id });
const itemParams = z.strictObject({ projectId: id, itemId: id });
const taskParams = z.strictObject({ projectId: id, taskId: id });
const eventParams = z.strictObject({
  projectId: id,
  calendarId: z.string().trim().min(1).max(100),
  eventUid: z.string().trim().min(1).max(255),
});
const listQuery = z.strictObject({
  includeArchived: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export const createProjectRouter = ({
  authentication,
  projects,
}: {
  authentication: AuthenticationService;
  projects: ProjectService;
}): Router => {
  const router = Router();
  router.use(createRequireAuthentication(authentication));
  const owner = (response: Response) => String(response.locals.userId);
  router.get(
    "/projects",
    validateRequest({ query: listQuery }),
    async (_request, response) =>
      response.json(
        await projects.listProjects(
          owner(response),
          response.locals.validated.query.includeArchived,
        ),
      ),
  );
  router.post(
    "/projects",
    validateRequest({ body: projectCreate }),
    async (_request, response) =>
      response
        .status(201)
        .json(
          await projects.createProject(
            owner(response),
            response.locals.validated.body as CreateProjectRequest,
          ),
        ),
  );
  router.get(
    "/projects/:projectId",
    validateRequest({ params: projectParams }),
    async (_request, response) =>
      response.json(
        await projects.getProject(
          owner(response),
          response.locals.validated.params.projectId,
        ),
      ),
  );
  router.patch(
    "/projects/:projectId",
    validateRequest({ params: projectParams, body: projectUpdate }),
    async (_request, response) =>
      response.json(
        await projects.updateProject(
          owner(response),
          response.locals.validated.params.projectId,
          response.locals.validated.body as UpdateProjectRequest,
        ),
      ),
  );
  router.delete(
    "/projects/:projectId",
    validateRequest({ params: projectParams }),
    async (_request, response) => {
      await projects.deleteProject(
        owner(response),
        response.locals.validated.params.projectId,
      );
      response.status(204).end();
    },
  );
  for (const [path, kind] of [
    ["goals", "goal"],
    ["milestones", "milestone"],
  ] as const) {
    router.post(
      `/projects/:projectId/${path}`,
      validateRequest({ params: projectParams, body: itemCreate }),
      async (_request, response) =>
        response
          .status(201)
          .json(
            await projects.createItem(
              owner(response),
              response.locals.validated.params.projectId,
              kind,
              response.locals.validated.body as CreateProjectItemRequest,
            ),
          ),
    );
    router.patch(
      `/projects/:projectId/${path}/:itemId`,
      validateRequest({ params: itemParams, body: itemUpdate }),
      async (_request, response) =>
        response.json(
          await projects.updateItem(
            owner(response),
            response.locals.validated.params.projectId,
            response.locals.validated.params.itemId,
            kind,
            response.locals.validated.body as UpdateProjectItemRequest,
          ),
        ),
    );
    router.delete(
      `/projects/:projectId/${path}/:itemId`,
      validateRequest({ params: itemParams }),
      async (_request, response) => {
        await projects.deleteItem(
          owner(response),
          response.locals.validated.params.projectId,
          response.locals.validated.params.itemId,
          kind,
        );
        response.status(204).end();
      },
    );
  }
  router.post(
    "/projects/:projectId/task-links",
    validateRequest({
      params: projectParams,
      body: z.strictObject({ taskId: id }),
    }),
    async (_request, response) => {
      await projects.linkTask(
        owner(response),
        response.locals.validated.params.projectId,
        response.locals.validated.body as CreateProjectTaskLinkRequest,
      );
      response.status(204).end();
    },
  );
  router.delete(
    "/projects/:projectId/task-links/:taskId",
    validateRequest({ params: taskParams }),
    async (_request, response) => {
      await projects.unlinkTask(
        owner(response),
        response.locals.validated.params.projectId,
        response.locals.validated.params.taskId,
      );
      response.status(204).end();
    },
  );
  router.post(
    "/projects/:projectId/event-links",
    validateRequest({
      params: projectParams,
      body: z.strictObject({
        calendarId: z.string().trim().min(1).max(100),
        eventUid: z.string().trim().min(1).max(255),
      }),
    }),
    async (_request, response) =>
      response
        .status(201)
        .json(
          await projects.linkEvent(
            owner(response),
            response.locals.validated.params.projectId,
            response.locals.validated.body as CreateProjectEventLinkRequest,
          ),
        ),
  );
  router.delete(
    "/projects/:projectId/event-links/:calendarId/:eventUid",
    validateRequest({ params: eventParams }),
    async (_request, response) => {
      await projects.unlinkEvent(
        owner(response),
        response.locals.validated.params.projectId,
        response.locals.validated.params.calendarId,
        response.locals.validated.params.eventUid,
      );
      response.status(204).end();
    },
  );
  return router;
};
