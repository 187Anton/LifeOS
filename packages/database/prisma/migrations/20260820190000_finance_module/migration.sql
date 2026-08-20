BEGIN;

CREATE TYPE "FinanceCategoryKind" AS ENUM ('income', 'expense');
CREATE TYPE "FinanceTransactionKind" AS ENUM ('income', 'expense');
CREATE TYPE "FinanceRecurrenceFrequency" AS ENUM ('weekly', 'monthly', 'yearly');
CREATE TYPE "FinanceBudgetPeriod" AS ENUM ('month', 'year');

CREATE TABLE "FinanceCategory" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "kind" "FinanceCategoryKind" NOT NULL,
  "archivedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "FinanceCategory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceCategory_name_check" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "FinanceCategory_archive_check" CHECK ("archivedAt" IS NULL OR "archivedAt" >= "createdAt"),
  CONSTRAINT "FinanceCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FinanceCategory_id_userId_key" ON "FinanceCategory"("id", "userId");
CREATE UNIQUE INDEX "FinanceCategory_userId_kind_name_key" ON "FinanceCategory"("userId", "kind", "name");

CREATE TABLE "FinanceTransaction" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "categoryId" UUID NOT NULL,
  "kind" "FinanceTransactionKind" NOT NULL,
  "bookingDate" DATE NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currencyCode" CHAR(3) NOT NULL,
  "note" TEXT,
  "recurrenceFrequency" "FinanceRecurrenceFrequency",
  "recurrenceInterval" INTEGER,
  "recurrenceEndDate" DATE,
  "archivedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "FinanceTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceTransaction_amount_check" CHECK ("amountMinor" > 0 AND "amountMinor" <= 2000000000),
  CONSTRAINT "FinanceTransaction_currency_check" CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
  CONSTRAINT "FinanceTransaction_recurrence_check" CHECK (("recurrenceFrequency" IS NULL AND "recurrenceInterval" IS NULL AND "recurrenceEndDate" IS NULL) OR ("recurrenceFrequency" IS NOT NULL AND "recurrenceInterval" BETWEEN 1 AND 365 AND ("recurrenceEndDate" IS NULL OR "recurrenceEndDate" >= "bookingDate"))),
  CONSTRAINT "FinanceTransaction_archive_check" CHECK ("archivedAt" IS NULL OR "archivedAt" >= "createdAt"),
  CONSTRAINT "FinanceTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FinanceTransaction_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "FinanceCategory"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "FinanceBudget" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "categoryId" UUID,
  "period" "FinanceBudgetPeriod" NOT NULL,
  "periodStart" DATE NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currencyCode" CHAR(3) NOT NULL,
  "warningThresholdPercent" INTEGER NOT NULL DEFAULT 80,
  "archivedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "FinanceBudget_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceBudget_amount_check" CHECK ("amountMinor" > 0 AND "amountMinor" <= 2000000000),
  CONSTRAINT "FinanceBudget_currency_check" CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
  CONSTRAINT "FinanceBudget_threshold_check" CHECK ("warningThresholdPercent" BETWEEN 1 AND 100),
  CONSTRAINT "FinanceBudget_period_start_check" CHECK (("period" = 'month' AND EXTRACT(DAY FROM "periodStart") = 1) OR ("period" = 'year' AND EXTRACT(MONTH FROM "periodStart") = 1 AND EXTRACT(DAY FROM "periodStart") = 1)),
  CONSTRAINT "FinanceBudget_archive_check" CHECK ("archivedAt" IS NULL OR "archivedAt" >= "createdAt"),
  CONSTRAINT "FinanceBudget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FinanceBudget_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "FinanceCategory"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "FinanceCategory_userId_archivedAt_idx" ON "FinanceCategory"("userId", "archivedAt");
CREATE UNIQUE INDEX "FinanceTransaction_id_userId_key" ON "FinanceTransaction"("id", "userId");
CREATE INDEX "FinanceTransaction_userId_archivedAt_bookingDate_idx" ON "FinanceTransaction"("userId", "archivedAt", "bookingDate");
CREATE INDEX "FinanceTransaction_userId_categoryId_bookingDate_idx" ON "FinanceTransaction"("userId", "categoryId", "bookingDate");
CREATE INDEX "FinanceTransaction_userId_kind_bookingDate_idx" ON "FinanceTransaction"("userId", "kind", "bookingDate");
CREATE UNIQUE INDEX "FinanceBudget_id_userId_key" ON "FinanceBudget"("id", "userId");
CREATE INDEX "FinanceBudget_userId_archivedAt_periodStart_idx" ON "FinanceBudget"("userId", "archivedAt", "periodStart");
CREATE INDEX "FinanceBudget_userId_categoryId_periodStart_idx" ON "FinanceBudget"("userId", "categoryId", "periodStart");

COMMIT;
