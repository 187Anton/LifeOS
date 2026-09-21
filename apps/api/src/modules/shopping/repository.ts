import type {
  DatabaseClient,
  ShoppingCategoryModel,
  ShoppingCategoryRuleModel,
  ShoppingItemModel,
  ShoppingListModel,
} from "@lifeos/database";
import type {
  ConfirmShoppingItemRequest,
  ShoppingCategoryResponse,
  ShoppingItemResponse,
  ShoppingListResponse,
  ShoppingUnit,
  UpdateShoppingItemRequest,
} from "@lifeos/contracts";

import { SYSTEM_SHOPPING_CATEGORIES } from "./categories.js";
import { normalizeShoppingTerm } from "./parser.js";

export class ShoppingListNotFoundError extends Error {}
export class ShoppingItemNotFoundError extends Error {}
export class ShoppingCategoryNotFoundError extends Error {}
export class ActiveShoppingListConflictError extends Error {}

type ShoppingCategoryRecord = ShoppingCategoryModel;
type ShoppingItemRecord = ShoppingItemModel & {
  category: ShoppingCategoryRecord;
};
type ShoppingListRecord = ShoppingListModel & { items: ShoppingItemRecord[] };

const mapCategory = (
  category: ShoppingCategoryRecord,
): ShoppingCategoryResponse => ({
  id: category.id,
  ownerId: category.userId,
  key: category.key,
  name: category.name,
  sortOrder: category.sortOrder,
  origin: category.origin,
  isActive: category.isActive,
});

const mapItem = (item: ShoppingItemRecord): ShoppingItemResponse => ({
  id: item.id,
  ownerId: item.userId,
  shoppingListId: item.shoppingListId,
  productName: item.productName,
  quantity: item.quantity,
  quantityText: item.quantityText,
  unit: item.unit as ShoppingUnit | null,
  categoryId: item.categoryId,
  status: item.status,
  sortOrder: item.sortOrder,
  source: item.source,
  deletedAt: item.deletedAt?.toISOString() ?? null,
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString(),
  category: mapCategory(item.category),
});

const mapList = (list: ShoppingListRecord): ShoppingListResponse => ({
  id: list.id,
  ownerId: list.userId,
  title: list.title,
  status: list.status,
  archivedAt: list.archivedAt?.toISOString() ?? null,
  deletedAt: list.deletedAt?.toISOString() ?? null,
  createdAt: list.createdAt.toISOString(),
  updatedAt: list.updatedAt.toISOString(),
  items: list.items.filter((item) => !item.deletedAt).map(mapItem),
});

const isUniqueViolation = (error: unknown): boolean =>
  Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "P2002",
  );

export interface ShoppingRepository {
  listLists(userId: string): Promise<ShoppingListResponse[]>;
  getList(userId: string, listId: string): Promise<ShoppingListResponse>;
  getCategories(userId: string): Promise<ShoppingCategoryResponse[]>;
  readCategories(userId: string): Promise<ShoppingCategoryResponse[]>;
  getRules(userId: string): Promise<ShoppingCategoryRuleModel[]>;
  createList(userId: string, title: string): Promise<ShoppingListResponse>;
  updateList(
    userId: string,
    listId: string,
    changes: {
      title?: string;
      archivedAt?: Date | null;
      status?: "active" | "archived";
    },
  ): Promise<ShoppingListResponse>;
  deleteList(userId: string, listId: string): Promise<void>;
  createBatch(
    userId: string,
    listId: string,
    items: ConfirmShoppingItemRequest[],
  ): Promise<ShoppingItemResponse[]>;
  updateItem(
    userId: string,
    listId: string,
    itemId: string,
    changes: UpdateShoppingItemRequest,
  ): Promise<ShoppingItemResponse>;
  deleteItem(userId: string, listId: string, itemId: string): Promise<void>;
}

export class PrismaShoppingRepository implements ShoppingRepository {
  constructor(private readonly database: DatabaseClient) {}

  async listLists(userId: string): Promise<ShoppingListResponse[]> {
    await this.ensureSystemCategories(userId);
    const lists = await this.database.shoppingList.findMany({
      where: { userId, deletedAt: null },
      include: {
        items: {
          where: { deletedAt: null },
          include: { category: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    });
    return (lists as ShoppingListRecord[]).map(mapList);
  }

  async getList(userId: string, listId: string): Promise<ShoppingListResponse> {
    await this.ensureSystemCategories(userId);
    const list = await this.database.shoppingList.findFirst({
      where: { id: listId, userId, deletedAt: null },
      include: {
        items: {
          where: { deletedAt: null },
          include: { category: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    });
    if (!list) throw new ShoppingListNotFoundError();
    return mapList(list as ShoppingListRecord);
  }

  async getCategories(userId: string): Promise<ShoppingCategoryResponse[]> {
    await this.ensureSystemCategories(userId);
    return this.readCategories(userId);
  }

  async readCategories(userId: string): Promise<ShoppingCategoryResponse[]> {
    const categories = await this.database.shoppingCategory.findMany({
      where: { userId, isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    return categories.map(mapCategory);
  }

  getRules(userId: string) {
    return this.database.shoppingCategoryRule.findMany({ where: { userId } });
  }

  async createList(
    userId: string,
    title: string,
  ): Promise<ShoppingListResponse> {
    await this.ensureSystemCategories(userId);
    try {
      const list = await this.database.$transaction(async (transaction) => {
        const created = await transaction.shoppingList.create({
          data: { userId, title, status: "active" },
        });
        await transaction.auditEvent.create({
          data: {
            userId,
            action: "shopping_list.created",
            entityType: "ShoppingList",
            entityId: created.id,
          },
        });
        return created;
      });
      return this.getList(userId, list.id);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ActiveShoppingListConflictError();
      throw error;
    }
  }

  async updateList(
    userId: string,
    listId: string,
    changes: {
      title?: string;
      archivedAt?: Date | null;
      status?: "active" | "archived";
    },
  ): Promise<ShoppingListResponse> {
    try {
      const list = await this.database.$transaction(async (transaction) => {
        const current = await transaction.shoppingList.findFirst({
          where: { id: listId, userId, deletedAt: null },
        });
        if (!current) throw new ShoppingListNotFoundError();
        const updated = await transaction.shoppingList.update({
          where: { id: current.id },
          data: changes,
        });
        await transaction.auditEvent.create({
          data: {
            userId,
            action: "shopping_list.updated",
            entityType: "ShoppingList",
            entityId: updated.id,
            metadata: { changedFields: Object.keys(changes).sort() },
          },
        });
        return updated;
      });
      return this.getList(userId, list.id);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ActiveShoppingListConflictError();
      throw error;
    }
  }

  async deleteList(userId: string, listId: string): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const current = await transaction.shoppingList.findFirst({
        where: { id: listId, userId, deletedAt: null },
      });
      if (!current) throw new ShoppingListNotFoundError();
      await transaction.shoppingList.update({
        where: { id: current.id },
        data: {
          deletedAt: new Date(),
          status: "archived",
          archivedAt: new Date(),
        },
      });
      await transaction.auditEvent.create({
        data: {
          userId,
          action: "shopping_list.deleted",
          entityType: "ShoppingList",
          entityId: current.id,
        },
      });
    });
  }

  async createBatch(
    userId: string,
    listId: string,
    items: ConfirmShoppingItemRequest[],
  ) {
    return this.database.$transaction(async (transaction) => {
      const list = await transaction.shoppingList.findFirst({
        where: { id: listId, userId, status: "active", deletedAt: null },
      });
      if (!list) throw new ShoppingListNotFoundError();
      const requestedCategoryIds = [
        ...new Set(items.map((item) => item.categoryId)),
      ];
      const categories = await transaction.shoppingCategory.findMany({
        where: {
          userId,
          isActive: true,
          OR: [
            { id: { in: requestedCategoryIds } },
            { key: { in: requestedCategoryIds } },
          ],
        },
      });
      const categoryByRequestedValue = new Map(
        categories.flatMap((category) => [
          [category.id, category],
          [category.key, category],
        ]),
      );
      if (
        requestedCategoryIds.some(
          (categoryId) => !categoryByRequestedValue.has(categoryId),
        )
      )
        throw new ShoppingCategoryNotFoundError();
      const start = await transaction.shoppingItem.count({
        where: { userId, shoppingListId: listId, deletedAt: null },
      });
      const created: ShoppingItemResponse[] = [];
      for (const [index, item] of items.entries()) {
        const record = await transaction.shoppingItem.create({
          data: {
            userId,
            shoppingListId: listId,
            productName: item.productName,
            quantity: item.quantity ?? null,
            quantityText: item.quantityText ?? null,
            unit: item.unit ?? null,
            categoryId: categoryByRequestedValue.get(item.categoryId)!.id,
            source: item.source ?? "manual",
            sortOrder: start + index,
          },
          include: { category: true },
        });
        if (item.rememberCategory) {
          await transaction.shoppingCategoryRule.upsert({
            where: {
              userId_normalizedTerm: {
                userId,
                normalizedTerm: normalizeShoppingTerm(item.productName),
              },
            },
            create: {
              userId,
              normalizedTerm: normalizeShoppingTerm(item.productName),
              categoryId: categoryByRequestedValue.get(item.categoryId)!.id,
            },
            update: {
              categoryId: categoryByRequestedValue.get(item.categoryId)!.id,
            },
          });
        }
        created.push(mapItem(record as ShoppingItemRecord));
      }
      await transaction.auditEvent.create({
        data: {
          userId,
          action: "shopping_items.batch_created",
          entityType: "ShoppingList",
          entityId: listId,
          metadata: { count: created.length },
        },
      });
      return created;
    });
  }

  async updateItem(
    userId: string,
    listId: string,
    itemId: string,
    changes: UpdateShoppingItemRequest,
  ) {
    return this.database.$transaction(async (transaction) => {
      const current = await transaction.shoppingItem.findFirst({
        where: { id: itemId, userId, shoppingListId: listId, deletedAt: null },
        include: { category: true },
      });
      if (!current) throw new ShoppingItemNotFoundError();
      if (changes.categoryId) {
        const category = await transaction.shoppingCategory.findFirst({
          where: { id: changes.categoryId, userId, isActive: true },
        });
        if (!category) throw new ShoppingCategoryNotFoundError();
      }
      const updated = await transaction.shoppingItem.update({
        where: { id: current.id },
        data: changes,
        include: { category: true },
      });
      await transaction.auditEvent.create({
        data: {
          userId,
          action: "shopping_item.updated",
          entityType: "ShoppingItem",
          entityId: updated.id,
          metadata: { changedFields: Object.keys(changes).sort() },
        },
      });
      return mapItem(updated as ShoppingItemRecord);
    });
  }

  async deleteItem(
    userId: string,
    listId: string,
    itemId: string,
  ): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const current = await transaction.shoppingItem.findFirst({
        where: { id: itemId, userId, shoppingListId: listId, deletedAt: null },
      });
      if (!current) throw new ShoppingItemNotFoundError();
      await transaction.shoppingItem.update({
        where: { id: current.id },
        data: { deletedAt: new Date() },
      });
      await transaction.auditEvent.create({
        data: {
          userId,
          action: "shopping_item.deleted",
          entityType: "ShoppingItem",
          entityId: current.id,
        },
      });
    });
  }

  private async ensureSystemCategories(userId: string): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      for (const category of SYSTEM_SHOPPING_CATEGORIES) {
        await transaction.shoppingCategory.upsert({
          where: { userId_key: { userId, key: category.key } },
          create: { userId, ...category, origin: "system" },
          update: {
            name: category.name,
            sortOrder: category.sortOrder,
            isActive: true,
          },
        });
      }
    });
  }
}
