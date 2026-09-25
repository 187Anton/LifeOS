BEGIN;

-- Paket 3: Finanzschema, gespeicherte Währungseinstellung und TaskArea=finance
-- entfernen. Bestehende Aufgaben bleiben vollständig erhalten; ausschließlich
-- ihr Bereich wird datenerhaltend zu 'personal' überführt.

UPDATE "Task" SET "area" = 'personal' WHERE "area" = 'finance';

ALTER TYPE "TaskArea" RENAME TO "TaskArea_retired";
CREATE TYPE "TaskArea" AS ENUM ('study', 'work', 'projects', 'fitness', 'personal');
ALTER TABLE "Task" ALTER COLUMN "area" DROP DEFAULT;
ALTER TABLE "Task" ALTER COLUMN "area" TYPE "TaskArea" USING ("area"::text::"TaskArea");
ALTER TABLE "Task" ALTER COLUMN "area" SET DEFAULT 'personal';
DROP TYPE "TaskArea_retired";

ALTER TABLE "UserSettings" DROP CONSTRAINT "UserSettings_currencyCode_check";
ALTER TABLE "UserSettings" DROP COLUMN "currencyCode";

DROP TABLE "FinanceTransaction";
DROP TABLE "FinanceBudget";
DROP TABLE "FinanceCategory";
DROP TYPE "FinanceTransactionKind";
DROP TYPE "FinanceBudgetPeriod";
DROP TYPE "FinanceCategoryKind";
DROP TYPE "FinanceRecurrenceFrequency";

COMMIT;
