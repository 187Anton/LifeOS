CREATE TABLE "ShoppingList" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "archivedAt" DATETIME,
  "deletedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ShoppingList_values_check" CHECK (length(trim("title")) BETWEEN 1 AND 200 AND "status" IN ('active', 'archived')),
  CONSTRAINT "ShoppingList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "ShoppingList_id_userId_key" ON "ShoppingList"("id", "userId");
CREATE INDEX "ShoppingList_userId_status_deletedAt_idx" ON "ShoppingList"("userId", "status", "deletedAt");
CREATE INDEX "ShoppingList_userId_archivedAt_idx" ON "ShoppingList"("userId", "archivedAt");
CREATE UNIQUE INDEX "ShoppingList_one_active_per_user_key" ON "ShoppingList"("userId") WHERE "status" = 'active' AND "deletedAt" IS NULL;

CREATE TABLE "ShoppingCategory" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "origin" TEXT NOT NULL DEFAULT 'system',
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ShoppingCategory_values_check" CHECK (length(trim("key")) BETWEEN 1 AND 100 AND length(trim("name")) BETWEEN 1 AND 100 AND "origin" IN ('system', 'custom') AND "isActive" IN (0, 1)),
  CONSTRAINT "ShoppingCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "ShoppingCategory_id_userId_key" ON "ShoppingCategory"("id", "userId");
CREATE UNIQUE INDEX "ShoppingCategory_userId_key_key" ON "ShoppingCategory"("userId", "key");
CREATE INDEX "ShoppingCategory_userId_sortOrder_idx" ON "ShoppingCategory"("userId", "sortOrder");

CREATE TABLE "ShoppingCategoryRule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "normalizedTerm" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ShoppingCategoryRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "ShoppingCategoryRule_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "ShoppingCategory"("id", "userId") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "ShoppingCategoryRule_userId_normalizedTerm_key" ON "ShoppingCategoryRule"("userId", "normalizedTerm");
CREATE INDEX "ShoppingCategoryRule_userId_categoryId_idx" ON "ShoppingCategoryRule"("userId", "categoryId");

CREATE TABLE "ShoppingItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "shoppingListId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "quantity" REAL,
  "quantityText" TEXT,
  "unit" TEXT,
  "categoryId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "deletedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ShoppingItem_values_check" CHECK (length(trim("productName")) BETWEEN 1 AND 500 AND ("quantity" IS NULL OR "quantity" > 0) AND ("quantity" IS NOT NULL OR "quantityText" IS NOT NULL OR "unit" IS NULL) AND ("unit" IS NULL OR "unit" IN ('piece', 'pack', 'gram', 'kilogram', 'milliliter', 'liter')) AND "status" IN ('open', 'completed') AND "source" IN ('manual', 'dictation', 'voice')),
  CONSTRAINT "ShoppingItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "ShoppingItem_shoppingListId_userId_fkey" FOREIGN KEY ("shoppingListId", "userId") REFERENCES "ShoppingList"("id", "userId") ON DELETE CASCADE,
  CONSTRAINT "ShoppingItem_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "ShoppingCategory"("id", "userId") ON DELETE NO ACTION
);
CREATE UNIQUE INDEX "ShoppingItem_id_userId_key" ON "ShoppingItem"("id", "userId");
CREATE INDEX "ShoppingItem_userId_shoppingListId_deletedAt_status_idx" ON "ShoppingItem"("userId", "shoppingListId", "deletedAt", "status");
CREATE INDEX "ShoppingItem_userId_categoryId_deletedAt_idx" ON "ShoppingItem"("userId", "categoryId", "deletedAt");
