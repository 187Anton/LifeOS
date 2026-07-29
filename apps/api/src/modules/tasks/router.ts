import type { CreateTaskRequest, UpdateTaskRequest } from "@lifeos/contracts";
import { Router } from "express";
import { z } from "zod";

import { validateRequest } from "../../middleware/validate-request.js";
import { createRequireAuthentication } from "../profile/router.js";
import type { AuthenticationService } from "../profile/service.js";
import type { TaskListFilters } from "./repository.js";
import type { TaskService } from "./service.js";

const taskStatus = z.enum([
  "open",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
]);
const taskPriority = z.enum(["low", "medium", "high", "critical"]);
const taskArea = z.enum([
  "study",
  "work",
  "projects",
  "finance",
  "fitness",
  "personal",
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
  });
const taskIdParams = z.strictObject({ taskId: z.uuid() });
const tags = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .max(50)
      .regex(/^[^\r\n]+$/),
  )
  .max(20);

const optionalTaskFields = {
  description: z.string().max(20_000).nullable().optional(),
  status: taskStatus.optional(),
  priority: taskPriority.optional(),
  dueDate: z.iso.date().nullable().optional(),
  scheduledStartAt: z.iso.datetime({ offset: true }).nullable().optional(),
  scheduledStartTimezone: timezone.nullable().optional(),
  estimatedDurationMinutes: z
    .number()
    .int()
    .min(1)
    .max(525_600)
    .nullable()
    .optional(),
  tags: tags.optional(),
  area: taskArea.optional(),
  projectId: z.uuid().nullable().optional(),
  parentTaskId: z.uuid().nullable().optional(),
};

const scheduleIsConsistent = (value: {
  scheduledStartAt?: string | null | undefined;
  scheduledStartTimezone?: string | null | undefined;
}): boolean => {
  const hasStart = Object.hasOwn(value, "scheduledStartAt");
  const hasTimezone = Object.hasOwn(value, "scheduledStartTimezone");
  if (!hasStart && !hasTimezone) return true;
  if (hasStart !== hasTimezone) return false;
  return (
    (value.scheduledStartAt === null &&
      value.scheduledStartTimezone === null) ||
    (typeof value.scheduledStartAt === "string" &&
      typeof value.scheduledStartTimezone === "string")
  );
};

const taskCreate = z
  .strictObject({
    title: z.string().trim().min(1).max(500),
    ...optionalTaskFields,
  })
  .refine(scheduleIsConsistent, {
    path: ["scheduledStartTimezone"],
  });

const taskUpdate = z
  .strictObject({
    title: z.string().trim().min(1).max(500).optional(),
    ...optionalTaskFields,
    archived: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0)
  .refine(scheduleIsConsistent, {
    path: ["scheduledStartTimezone"],
  });

const taskListQuery = z.strictObject({
  status: taskStatus.optional(),
  priority: taskPriority.optional(),
  area: taskArea.optional(),
  includeArchived: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export const createTaskRouter = ({
  authentication,
  tasks,
}: {
  authentication: AuthenticationService;
  tasks: TaskService;
}): Router => {
  const router = Router();
  router.use(createRequireAuthentication(authentication));

  router.get(
    "/tasks",
    validateRequest({ query: taskListQuery }),
    async (_request, response) => {
      response.json(
        await tasks.listTasks(
          String(response.locals.userId),
          response.locals.validated.query as TaskListFilters,
        ),
      );
    },
  );

  router.post(
    "/tasks",
    validateRequest({ body: taskCreate }),
    async (_request, response) => {
      response
        .status(201)
        .json(
          await tasks.createTask(
            String(response.locals.userId),
            response.locals.validated.body as CreateTaskRequest,
          ),
        );
    },
  );

  router.get(
    "/tasks/:taskId",
    validateRequest({ params: taskIdParams }),
    async (_request, response) => {
      response.json(
        await tasks.getTask(
          String(response.locals.userId),
          response.locals.validated.params.taskId,
        ),
      );
    },
  );

  router.patch(
    "/tasks/:taskId",
    validateRequest({ params: taskIdParams, body: taskUpdate }),
    async (_request, response) => {
      response.json(
        await tasks.updateTask(
          String(response.locals.userId),
          response.locals.validated.params.taskId,
          response.locals.validated.body as UpdateTaskRequest,
        ),
      );
    },
  );

  router.delete(
    "/tasks/:taskId",
    validateRequest({ params: taskIdParams }),
    async (_request, response) => {
      await tasks.deleteTask(
        String(response.locals.userId),
        response.locals.validated.params.taskId,
      );
      response.status(204).end();
    },
  );

  return router;
};
