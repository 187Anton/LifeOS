import type {
  CreateShoppingListRequest,
  ShoppingItemResponse,
  ShoppingListResponse,
  ShoppingParsePreviewRequest,
  ShoppingParsePreviewResponse,
  UpdateShoppingItemRequest,
  UpdateShoppingListRequest,
  ConfirmShoppingItemsRequest,
} from "@lifeos/contracts";

import { ApiError } from "../../errors.js";
import { SYSTEM_SHOPPING_CATEGORIES } from "./categories.js";
import {
  parseShoppingText,
  SHOPPING_PARSER_VERSION,
  SHOPPING_PREVIEW_VERSION,
  normalizeShoppingTerm,
  type ShoppingParserCategory,
} from "./parser.js";
import {
  ActiveShoppingListConflictError,
  ShoppingCategoryNotFoundError,
  ShoppingItemNotFoundError,
  ShoppingListNotFoundError,
  type ShoppingRepository,
} from "./repository.js";

const MAX_PREVIEW_CHARS = 10_000;
const MAX_PREVIEW_ITEMS = 100;

const fallbackCategories = (): ShoppingParserCategory[] =>
  SYSTEM_SHOPPING_CATEGORIES.map((category) => ({
    id: category.key,
    key: category.key,
    name: category.name,
  }));

export class ShoppingService {
  constructor(
    private readonly repository: ShoppingRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  listLists(userId: string): Promise<ShoppingListResponse[]> {
    return this.repository.listLists(userId);
  }

  getList(userId: string, listId: string): Promise<ShoppingListResponse> {
    return this.handle(() => this.repository.getList(userId, listId));
  }

  getCategories(userId: string) {
    return this.repository.getCategories(userId);
  }

  createList(userId: string, input: CreateShoppingListRequest) {
    return this.handle(() =>
      this.repository.createList(
        userId,
        input.title?.trim() || "Einkaufsliste",
      ),
    );
  }

  updateList(userId: string, listId: string, input: UpdateShoppingListRequest) {
    const changes: {
      title?: string;
      archivedAt?: Date | null;
      status?: "active" | "archived";
    } = {};
    if (Object.hasOwn(input, "title")) changes.title = input.title!.trim();
    if (Object.hasOwn(input, "archived")) {
      changes.status = input.archived ? "archived" : "active";
      changes.archivedAt = input.archived ? this.now() : null;
    }
    return this.handle(() =>
      this.repository.updateList(userId, listId, changes),
    );
  }

  deleteList(userId: string, listId: string) {
    return this.handle(() => this.repository.deleteList(userId, listId));
  }

  async parsePreview(
    userId: string,
    input: ShoppingParsePreviewRequest,
  ): Promise<ShoppingParsePreviewResponse> {
    if (input.text.length > MAX_PREVIEW_CHARS) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Die Eingabe darf höchstens 10.000 Zeichen enthalten.",
      );
    }
    const persistedCategories = await this.repository.readCategories(userId);
    const categories = persistedCategories.length
      ? persistedCategories
      : fallbackCategories();
    const categoryById = new Map(
      categories.map((category) => [category.id, category.key]),
    );
    const rules = await this.repository.getRules(userId);
    const personalRules = new Map(
      rules
        .map((rule) => [
          normalizeShoppingTerm(rule.normalizedTerm),
          categoryById.get(rule.categoryId),
        ])
        .filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
    const items = parseShoppingText(input.text, {
      categories,
      personalRules,
      source: input.source ?? "manual",
    });
    if (items.length > MAX_PREVIEW_ITEMS) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Die Eingabe darf höchstens 100 Positionen enthalten.",
      );
    }
    return {
      parserVersion: SHOPPING_PARSER_VERSION,
      previewVersion: SHOPPING_PREVIEW_VERSION,
      items,
    };
  }

  confirmBatch(
    userId: string,
    listId: string,
    input: ConfirmShoppingItemsRequest,
  ): Promise<ShoppingItemResponse[]> {
    if (
      input.parserVersion !== SHOPPING_PARSER_VERSION ||
      input.previewVersion !== SHOPPING_PREVIEW_VERSION
    ) {
      throw new ApiError(
        409,
        "CONFLICT",
        "Die Vorschauversion ist veraltet. Bitte analysiere die Eingabe erneut.",
      );
    }
    if (input.items.length === 0 || input.items.length > MAX_PREVIEW_ITEMS) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Es müssen zwischen 1 und 100 Positionen bestätigt werden.",
      );
    }
    return this.handle(() =>
      this.repository.createBatch(userId, listId, input.items),
    );
  }

  updateItem(
    userId: string,
    listId: string,
    itemId: string,
    input: UpdateShoppingItemRequest,
  ) {
    return this.handle(() =>
      this.repository.updateItem(userId, listId, itemId, input),
    );
  }

  deleteItem(userId: string, listId: string, itemId: string) {
    return this.handle(() =>
      this.repository.deleteItem(userId, listId, itemId),
    );
  }

  private async handle<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (
        error instanceof ShoppingListNotFoundError ||
        error instanceof ShoppingItemNotFoundError
      ) {
        throw new ApiError(
          404,
          "NOT_FOUND",
          "Die Einkaufsliste oder Position wurde nicht gefunden.",
        );
      }
      if (error instanceof ShoppingCategoryNotFoundError) {
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          "Die Kategorie gehört nicht zu diesem Besitzer oder ist nicht aktiv.",
        );
      }
      if (error instanceof ActiveShoppingListConflictError) {
        throw new ApiError(
          409,
          "CONFLICT",
          "Es gibt bereits eine aktive Einkaufsliste für diesen Besitzer.",
        );
      }
      throw error;
    }
  }
}
