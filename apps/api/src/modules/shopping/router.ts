import type {
  ConfirmShoppingItemsRequest,
  CreateShoppingListRequest,
  ShoppingParsePreviewRequest,
  UpdateShoppingItemRequest,
  UpdateShoppingListRequest,
} from "@lifeos/contracts";
import { Router } from "express";
import { z } from "zod";

import { validateRequest } from "../../middleware/validate-request.js";
import { createRequireAuthentication } from "../profile/router.js";
import type { AuthenticationService } from "../profile/service.js";
import type { ShoppingService } from "./service.js";

const source = z.enum(["manual", "dictation", "voice"]);
const unit = z.enum([
  "piece",
  "pack",
  "gram",
  "kilogram",
  "milliliter",
  "liter",
]);
const status = z.enum(["open", "completed"]);
const listParams = z.strictObject({ listId: z.uuid() });
const itemParams = z.strictObject({ listId: z.uuid(), itemId: z.uuid() });
const listCreate = z.strictObject({
  title: z.string().trim().min(1).max(200).optional(),
});
const listUpdate = z
  .strictObject({
    title: z.string().trim().min(1).max(200).optional(),
    archived: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
const preview = z.strictObject({
  text: z.string().max(10_000),
  source: source.optional(),
});
const confirmedItem = z.strictObject({
  clientId: z.string().trim().min(1).max(100).optional(),
  productName: z.string().trim().min(1).max(500),
  quantity: z.number().finite().positive().nullable().optional(),
  quantityText: z.string().trim().min(1).max(200).nullable().optional(),
  unit: unit.nullable().optional(),
  categoryId: z.string().trim().min(1).max(100),
  categoryName: z.string().trim().min(1).max(200).optional(),
  uncertain: z.boolean().optional(),
  source: source.optional(),
  rememberCategory: z.boolean().optional(),
});
const batch = z.strictObject({
  parserVersion: z.number().int().positive(),
  previewVersion: z.number().int().positive(),
  items: z.array(confirmedItem).min(1).max(100),
});
const itemUpdate = z
  .strictObject({
    productName: z.string().trim().min(1).max(500).optional(),
    quantity: z.number().finite().positive().nullable().optional(),
    quantityText: z.string().trim().min(1).max(200).nullable().optional(),
    unit: unit.nullable().optional(),
    categoryId: z.string().trim().min(1).max(100).optional(),
    status: status.optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

export const createShoppingRouter = ({
  authentication,
  shopping,
}: {
  authentication: AuthenticationService;
  shopping: ShoppingService;
}): Router => {
  const router = Router();
  router.use(createRequireAuthentication(authentication));

  router.get("/shopping-lists", async (_request, response) => {
    response.json(await shopping.listLists(String(response.locals.userId)));
  });
  router.post(
    "/shopping-lists",
    validateRequest({ body: listCreate }),
    async (_request, response) => {
      response
        .status(201)
        .json(
          await shopping.createList(
            String(response.locals.userId),
            response.locals.validated.body as CreateShoppingListRequest,
          ),
        );
    },
  );
  router.get(
    "/shopping-lists/:listId",
    validateRequest({ params: listParams }),
    async (_request, response) => {
      response.json(
        await shopping.getList(
          String(response.locals.userId),
          response.locals.validated.params.listId,
        ),
      );
    },
  );
  router.post(
    "/shopping-lists/:listId/archive-and-create",
    validateRequest({ params: listParams, body: listCreate }),
    async (_request, response) => {
      response
        .status(201)
        .json(
          await shopping.archiveAndCreateList(
            String(response.locals.userId),
            response.locals.validated.params.listId,
            response.locals.validated.body as CreateShoppingListRequest,
          ),
        );
    },
  );
  router.patch(
    "/shopping-lists/:listId",
    validateRequest({ params: listParams, body: listUpdate }),
    async (_request, response) => {
      response.json(
        await shopping.updateList(
          String(response.locals.userId),
          response.locals.validated.params.listId,
          response.locals.validated.body as UpdateShoppingListRequest,
        ),
      );
    },
  );
  router.delete(
    "/shopping-lists/:listId",
    validateRequest({ params: listParams }),
    async (_request, response) => {
      await shopping.deleteList(
        String(response.locals.userId),
        response.locals.validated.params.listId,
      );
      response.status(204).end();
    },
  );
  router.get("/shopping-categories", async (_request, response) => {
    response.json(await shopping.getCategories(String(response.locals.userId)));
  });
  router.post(
    "/shopping-lists/parse-preview",
    validateRequest({ body: preview }),
    async (_request, response) => {
      response.json(
        await shopping.parsePreview(
          String(response.locals.userId),
          response.locals.validated.body as ShoppingParsePreviewRequest,
        ),
      );
    },
  );
  router.post(
    "/shopping-lists/:listId/items/batch",
    validateRequest({ params: listParams, body: batch }),
    async (_request, response) => {
      const items = await shopping.confirmBatch(
        String(response.locals.userId),
        response.locals.validated.params.listId,
        response.locals.validated.body as ConfirmShoppingItemsRequest,
      );
      response.status(201).json({ items });
    },
  );
  router.patch(
    "/shopping-lists/:listId/items/:itemId",
    validateRequest({ params: itemParams, body: itemUpdate }),
    async (_request, response) => {
      response.json(
        await shopping.updateItem(
          String(response.locals.userId),
          response.locals.validated.params.listId,
          response.locals.validated.params.itemId,
          response.locals.validated.body as UpdateShoppingItemRequest,
        ),
      );
    },
  );
  router.delete(
    "/shopping-lists/:listId/items/:itemId",
    validateRequest({ params: itemParams }),
    async (_request, response) => {
      await shopping.deleteItem(
        String(response.locals.userId),
        response.locals.validated.params.listId,
        response.locals.validated.params.itemId,
      );
      response.status(204).end();
    },
  );

  return router;
};
