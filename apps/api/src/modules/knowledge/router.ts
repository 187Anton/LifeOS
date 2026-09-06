import type {
  CreateNoteRequest,
  UpdateDocumentRequest,
  UpdateNoteRequest,
} from "@lifeos/contracts";
import express, { Router, type Response } from "express";
import { z } from "zod";

import { ApiError } from "../../errors.js";
import { validateRequest } from "../../middleware/validate-request.js";
import { createRequireAuthentication } from "../profile/router.js";
import type { AuthenticationService } from "../profile/service.js";
import type { KnowledgeService } from "./service.js";
import { MAX_DOCUMENT_BYTES } from "./storage.js";

const id = z.uuid();
const nullableId = id.nullable().optional();
const tags = z.array(z.string().trim().min(1).max(100)).max(20).optional();
const noteCreate = z.strictObject({
  title: z.string().trim().min(1).max(500),
  content: z.string().max(1_000_000),
  format: z.literal("markdown").optional(),
  category: z.string().trim().min(1).max(200).nullable().optional(),
  tags,
  projectId: nullableId,
  studyModuleId: nullableId,
  searchEnabled: z.boolean().optional(),
});
const noteUpdate = noteCreate
  .partial()
  .extend({ archived: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0);
const documentUpdate = z
  .strictObject({
    projectId: nullableId,
    studyModuleId: nullableId,
    searchEnabled: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
const params = z.strictObject({ id });
const listQuery = z.strictObject({
  includeArchived: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});
const uploadQuery = z.strictObject({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine((value) =>
      [...value].every((character) => {
        const code = character.charCodeAt(0);
        return code > 31 && code !== 127;
      }),
    ),
  projectId: nullableId,
  studyModuleId: nullableId,
  searchEnabled: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});
const mediaType = z
  .string()
  .trim()
  .toLowerCase()
  .max(200)
  .regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/);

export const createKnowledgeRouter = ({
  authentication,
  knowledge,
}: {
  authentication: AuthenticationService;
  knowledge: KnowledgeService;
}): Router => {
  const router = Router();
  const requireAuthentication = createRequireAuthentication(authentication);
  const owner = (response: Response) => String(response.locals.userId);
  router.use(requireAuthentication);
  router.get(
    "/knowledge",
    validateRequest({ query: listQuery }),
    async (_request, response) =>
      response.json(
        await knowledge.getOverview(
          owner(response),
          response.locals.validated.query.includeArchived,
        ),
      ),
  );
  router.post(
    "/notes",
    validateRequest({ body: noteCreate }),
    async (_request, response) =>
      response
        .status(201)
        .json(
          await knowledge.createNote(
            owner(response),
            response.locals.validated.body as CreateNoteRequest,
          ),
        ),
  );
  router.get(
    "/notes/:id",
    validateRequest({ params }),
    async (_request, response) =>
      response.json(
        await knowledge.getNote(
          owner(response),
          response.locals.validated.params.id,
        ),
      ),
  );
  router.patch(
    "/notes/:id",
    validateRequest({ params, body: noteUpdate }),
    async (_request, response) =>
      response.json(
        await knowledge.updateNote(
          owner(response),
          response.locals.validated.params.id,
          response.locals.validated.body as UpdateNoteRequest,
        ),
      ),
  );
  router.delete(
    "/notes/:id",
    validateRequest({ params }),
    async (_request, response) => {
      await knowledge.deleteNote(
        owner(response),
        response.locals.validated.params.id,
      );
      response.status(204).end();
    },
  );
  router.get(
    "/documents/:id/content",
    validateRequest({ params }),
    async (_request, response) => {
      const { record, bytes } = await knowledge.downloadDocument(
        owner(response),
        response.locals.validated.params.id,
      );
      response.setHeader("Content-Type", record.mimeType);
      response.setHeader("Content-Length", String(bytes.byteLength));
      response.setHeader(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(record.fileName)}`,
      );
      response.setHeader("Cache-Control", "private, no-store");
      response.send(bytes);
    },
  );
  router.patch(
    "/documents/:id",
    validateRequest({ params, body: documentUpdate }),
    async (_request, response) =>
      response.json(
        await knowledge.updateDocument(
          owner(response),
          response.locals.validated.params.id,
          response.locals.validated.body as UpdateDocumentRequest,
        ),
      ),
  );
  router.delete(
    "/documents/:id",
    validateRequest({ params }),
    async (_request, response) => {
      await knowledge.deleteDocument(
        owner(response),
        response.locals.validated.params.id,
      );
      response.status(204).end();
    },
  );
  return router;
};

export const createDocumentUploadRouter = ({
  authentication,
  knowledge,
}: {
  authentication: AuthenticationService;
  knowledge: KnowledgeService;
}): Router => {
  const router = Router();
  router.post(
    "/documents",
    createRequireAuthentication(authentication),
    validateRequest({ query: uploadQuery }),
    express.raw({ type: () => true, limit: MAX_DOCUMENT_BYTES }),
    async (request, response) => {
      const body = Buffer.isBuffer(request.body)
        ? request.body
        : Buffer.alloc(0);
      const query = response.locals.validated.query;
      const parsedMediaType = mediaType.safeParse(
        request.get("content-type")?.split(";", 1)[0]?.trim() ||
          "application/octet-stream",
      );
      if (!parsedMediaType.success) {
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          "Der Dokument-MIME-Typ ist ungültig.",
        );
      }
      response.status(201).json(
        await knowledge.uploadDocument(String(response.locals.userId), {
          fileName: query.fileName,
          mimeType: parsedMediaType.data,
          bytes: body,
          projectId: query.projectId ?? null,
          studyModuleId: query.studyModuleId ?? null,
          searchEnabled: query.searchEnabled,
        }),
      );
    },
  );
  return router;
};
