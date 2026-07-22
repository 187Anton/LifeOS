import type { RequestHandler } from "express";
import type { ZodIssue, ZodType } from "zod";

import { ApiError } from "../errors.js";

interface RequestSchemas {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

export const validateRequest =
  (schemas: RequestSchemas): RequestHandler =>
  (request, response, next) => {
    const sources = {
      body: request.body,
      params: request.params,
      query: request.query,
    } as const;
    const validated: Record<string, unknown> = {};

    for (const [source, schema] of Object.entries(schemas)) {
      if (!schema) {
        continue;
      }

      const result = schema.safeParse(sources[source as keyof typeof sources]);
      if (!result.success) {
        const details = result.error.issues.map((issue: ZodIssue) => ({
          field: [source, ...issue.path.map(String)].join("."),
          message: "Ungültiger Wert.",
        }));
        next(ApiError.validation(details));
        return;
      }

      validated[source] = result.data;
    }

    response.locals.validated = validated;
    next();
  };
