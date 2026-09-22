BEGIN;

CREATE TYPE "ShoppingListStatus" AS ENUM ('active', 'archived');
CREATE TYPE "ShoppingCategoryOrigin" AS ENUM ('system', 'custom');
CREATE TYPE "ShoppingItemStatus" AS ENUM ('open', 'completed');
CREATE TYPE "ShoppingItemSource" AS ENUM ('manual', 'dictation', 'voice');
CREATE TYPE "ShoppingUnit" AS ENUM ('piece', 'pack', 'gram', 'kilogram', 'milliliter', 'liter');

CREATE TABLE "ShoppingList" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "status" "ShoppingListStatus" NOT NULL DEFAULT 'active',
  "archivedAt" TIMESTAMPTZ(3),
  "deletedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ShoppingList_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShoppingList_values_check" CHECK (length(btrim("title")) BETWEEN 1 AND 200),
  CONSTRAINT "ShoppingList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ShoppingList_id_userId_key" ON "ShoppingList"("id", "userId");
CREATE INDEX "ShoppingList_userId_status_deletedAt_idx" ON "ShoppingList"("userId", "status", "deletedAt");
CREATE INDEX "ShoppingList_userId_archivedAt_idx" ON "ShoppingList"("userId", "archivedAt");
CREATE UNIQUE INDEX "ShoppingList_one_active_per_user_key" ON "ShoppingList"("userId") WHERE "status" = 'active' AND "deletedAt" IS NULL;

CREATE TABLE "ShoppingCategory" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "key" VARCHAR(100) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "origin" "ShoppingCategoryOrigin" NOT NULL DEFAULT 'system',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ShoppingCategory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShoppingCategory_values_check" CHECK (length(btrim("key")) BETWEEN 1 AND 100 AND length(btrim("name")) BETWEEN 1 AND 100),
  CONSTRAINT "ShoppingCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ShoppingCategory_id_userId_key" ON "ShoppingCategory"("id", "userId");
CREATE UNIQUE INDEX "ShoppingCategory_userId_key_key" ON "ShoppingCategory"("userId", "key");
CREATE INDEX "ShoppingCategory_userId_sortOrder_idx" ON "ShoppingCategory"("userId", "sortOrder");

CREATE TABLE "ShoppingCategoryRule" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "normalizedTerm" VARCHAR(200) NOT NULL,
  "categoryId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ShoppingCategoryRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShoppingCategoryRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ShoppingCategoryRule_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "ShoppingCategory"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ShoppingCategoryRule_userId_normalizedTerm_key" ON "ShoppingCategoryRule"("userId", "normalizedTerm");
CREATE INDEX "ShoppingCategoryRule_userId_categoryId_idx" ON "ShoppingCategoryRule"("userId", "categoryId");

CREATE TABLE "ShoppingItem" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "shoppingListId" UUID NOT NULL,
  "productName" VARCHAR(500) NOT NULL,
  "quantity" DOUBLE PRECISION,
  "quantityText" VARCHAR(200),
  "unit" "ShoppingUnit",
  "categoryId" UUID NOT NULL,
  "status" "ShoppingItemStatus" NOT NULL DEFAULT 'open',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "source" "ShoppingItemSource" NOT NULL DEFAULT 'manual',
  "deletedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ShoppingItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShoppingItem_values_check" CHECK (length(btrim("productName")) BETWEEN 1 AND 500 AND ("quantity" IS NULL OR "quantity" > 0) AND ("quantity" IS NOT NULL OR "quantityText" IS NOT NULL OR "unit" IS NULL)),
  CONSTRAINT "ShoppingItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ShoppingItem_shoppingListId_userId_fkey" FOREIGN KEY ("shoppingListId", "userId") REFERENCES "ShoppingList"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ShoppingItem_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "ShoppingCategory"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ShoppingItem_id_userId_key" ON "ShoppingItem"("id", "userId");
CREATE INDEX "ShoppingItem_userId_shoppingListId_deletedAt_status_idx" ON "ShoppingItem"("userId", "shoppingListId", "deletedAt", "status");
CREATE INDEX "ShoppingItem_userId_categoryId_deletedAt_idx" ON "ShoppingItem"("userId", "categoryId", "deletedAt");

COMMIT;
