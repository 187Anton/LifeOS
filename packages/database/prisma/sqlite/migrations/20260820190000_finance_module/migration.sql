CREATE TABLE "FinanceCategory" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('income', 'expense')),
  "archivedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "FinanceCategory_name_check" CHECK (length(trim("name")) > 0 AND length("name") <= 200),
  CONSTRAINT "FinanceCategory_archive_check" CHECK ("archivedAt" IS NULL OR "archivedAt" >= "createdAt"),
  CONSTRAINT "FinanceCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "FinanceTransaction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('income', 'expense')),
  "bookingDate" TEXT NOT NULL CHECK (length("bookingDate") = 10 AND "bookingDate" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  "amountMinor" INTEGER NOT NULL CHECK (typeof("amountMinor") = 'integer' AND "amountMinor" > 0 AND "amountMinor" <= 2000000000),
  "currencyCode" TEXT NOT NULL CHECK (length("currencyCode") = 3 AND "currencyCode" NOT GLOB '*[^A-Z]*'),
  "note" TEXT,
  "recurrenceFrequency" TEXT CHECK ("recurrenceFrequency" IS NULL OR "recurrenceFrequency" IN ('weekly', 'monthly', 'yearly')),
  "recurrenceInterval" INTEGER,
  "recurrenceEndDate" TEXT CHECK ("recurrenceEndDate" IS NULL OR (length("recurrenceEndDate") = 10 AND "recurrenceEndDate" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
  "archivedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "FinanceTransaction_recurrence_check" CHECK (("recurrenceFrequency" IS NULL AND "recurrenceInterval" IS NULL AND "recurrenceEndDate" IS NULL) OR ("recurrenceFrequency" IS NOT NULL AND typeof("recurrenceInterval") = 'integer' AND "recurrenceInterval" BETWEEN 1 AND 365 AND ("recurrenceEndDate" IS NULL OR "recurrenceEndDate" >= "bookingDate"))),
  CONSTRAINT "FinanceTransaction_archive_check" CHECK ("archivedAt" IS NULL OR "archivedAt" >= "createdAt"),
  CONSTRAINT "FinanceTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FinanceTransaction_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "FinanceCategory"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE
);

CREATE TABLE "FinanceBudget" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "categoryId" TEXT,
  "period" TEXT NOT NULL CHECK ("period" IN ('month', 'year')),
  "periodStart" TEXT NOT NULL CHECK (length("periodStart") = 10 AND "periodStart" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  "amountMinor" INTEGER NOT NULL CHECK (typeof("amountMinor") = 'integer' AND "amountMinor" > 0 AND "amountMinor" <= 2000000000),
  "currencyCode" TEXT NOT NULL CHECK (length("currencyCode") = 3 AND "currencyCode" NOT GLOB '*[^A-Z]*'),
  "warningThresholdPercent" INTEGER NOT NULL DEFAULT 80 CHECK (typeof("warningThresholdPercent") = 'integer' AND "warningThresholdPercent" BETWEEN 1 AND 100),
  "archivedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "FinanceBudget_period_start_check" CHECK (("period" = 'month' AND substr("periodStart", 9, 2) = '01') OR ("period" = 'year' AND substr("periodStart", 6, 5) = '01-01')),
  CONSTRAINT "FinanceBudget_archive_check" CHECK ("archivedAt" IS NULL OR "archivedAt" >= "createdAt"),
  CONSTRAINT "FinanceBudget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FinanceBudget_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "FinanceCategory"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FinanceCategory_id_userId_key" ON "FinanceCategory"("id", "userId");
CREATE UNIQUE INDEX "FinanceCategory_userId_kind_name_key" ON "FinanceCategory"("userId", "kind", "name");
CREATE INDEX "FinanceCategory_userId_archivedAt_idx" ON "FinanceCategory"("userId", "archivedAt");
CREATE UNIQUE INDEX "FinanceTransaction_id_userId_key" ON "FinanceTransaction"("id", "userId");
CREATE INDEX "FinanceTransaction_userId_archivedAt_bookingDate_idx" ON "FinanceTransaction"("userId", "archivedAt", "bookingDate");
CREATE INDEX "FinanceTransaction_userId_categoryId_bookingDate_idx" ON "FinanceTransaction"("userId", "categoryId", "bookingDate");
CREATE INDEX "FinanceTransaction_userId_kind_bookingDate_idx" ON "FinanceTransaction"("userId", "kind", "bookingDate");
CREATE UNIQUE INDEX "FinanceBudget_id_userId_key" ON "FinanceBudget"("id", "userId");
CREATE INDEX "FinanceBudget_userId_archivedAt_periodStart_idx" ON "FinanceBudget"("userId", "archivedAt", "periodStart");
CREATE INDEX "FinanceBudget_userId_categoryId_periodStart_idx" ON "FinanceBudget"("userId", "categoryId", "periodStart");
