import type {
  DatabaseClient,
  FinanceBudgetModel,
  FinanceCategoryModel,
  FinanceTransactionModel,
} from "@lifeos/database";
import type {
  FinanceBudgetPeriod,
  FinanceBudgetResponse,
  FinanceCategoryKind,
  FinanceCategoryResponse,
  FinanceOverviewResponse,
  FinanceRecurrenceFrequency,
  FinanceTransactionKind,
  FinanceTransactionResponse,
} from "@lifeos/contracts";

export class FinanceRecordNotFoundError extends Error {}
export class FinanceReferenceNotFoundError extends Error {}
export class FinanceDuplicateCategoryError extends Error {}

export interface FinanceFilters {
  from: Date;
  to: Date;
  currencyCode: string;
  categoryId?: string;
  includeArchived: boolean;
}

export interface FinanceCategoryValues {
  name: string;
  kind: FinanceCategoryKind;
}
export interface FinanceTransactionValues {
  categoryId: string;
  kind: FinanceTransactionKind;
  bookingDate: Date;
  amountMinor: number;
  currencyCode: string;
  note: string | null;
  recurrenceFrequency: FinanceRecurrenceFrequency | null;
  recurrenceInterval: number | null;
  recurrenceEndDate: Date | null;
}
export interface FinanceBudgetValues {
  categoryId: string | null;
  period: FinanceBudgetPeriod;
  periodStart: Date;
  amountMinor: number;
  currencyCode: string;
  warningThresholdPercent: number;
}
export type FinanceChanges<T> = Partial<T> & { archivedAt?: Date | null };

export interface FinanceRepository {
  getOverview(
    userId: string,
    filters: FinanceFilters,
  ): Promise<FinanceOverviewResponse>;
  createCategory(
    userId: string,
    values: FinanceCategoryValues,
  ): Promise<FinanceCategoryResponse>;
  updateCategory(
    userId: string,
    id: string,
    changes: FinanceChanges<FinanceCategoryValues>,
  ): Promise<FinanceCategoryResponse>;
  createTransaction(
    userId: string,
    values: FinanceTransactionValues,
  ): Promise<FinanceTransactionResponse>;
  updateTransaction(
    userId: string,
    id: string,
    changes: FinanceChanges<FinanceTransactionValues>,
  ): Promise<FinanceTransactionResponse>;
  createBudget(
    userId: string,
    values: FinanceBudgetValues,
  ): Promise<FinanceBudgetResponse>;
  updateBudget(
    userId: string,
    id: string,
    changes: FinanceChanges<FinanceBudgetValues>,
  ): Promise<FinanceBudgetResponse>;
}

const day = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
const common = (record: {
  id: string;
  userId: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: record.id,
  ownerId: record.userId,
  archivedAt: record.archivedAt?.toISOString() ?? null,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});
const mapCategory = (
  record: FinanceCategoryModel,
): FinanceCategoryResponse => ({
  ...common(record),
  name: record.name,
  kind: record.kind,
});
const mapTransaction = (
  record: FinanceTransactionModel,
): FinanceTransactionResponse => ({
  ...common(record),
  categoryId: record.categoryId,
  kind: record.kind,
  bookingDate: day(record.bookingDate)!,
  amountMinor: record.amountMinor,
  currencyCode: record.currencyCode,
  note: record.note,
  recurrenceFrequency: record.recurrenceFrequency,
  recurrenceInterval: record.recurrenceInterval,
  recurrenceEndDate: day(record.recurrenceEndDate),
});
const mapBudget = (record: FinanceBudgetModel): FinanceBudgetResponse => ({
  ...common(record),
  categoryId: record.categoryId,
  period: record.period,
  periodStart: day(record.periodStart)!,
  amountMinor: record.amountMinor,
  currencyCode: record.currencyCode,
  warningThresholdPercent: record.warningThresholdPercent,
});

type FinanceTransactionClient = Pick<
  DatabaseClient,
  "financeCategory" | "financeTransaction" | "financeBudget" | "auditEvent"
>;

export class PrismaFinanceRepository implements FinanceRepository {
  constructor(private readonly database: DatabaseClient) {}

  async getOverview(
    userId: string,
    filters: FinanceFilters,
  ): Promise<FinanceOverviewResponse> {
    const active = filters.includeArchived ? {} : { archivedAt: null };
    const category = filters.categoryId
      ? { categoryId: filters.categoryId }
      : {};
    const earliestRelevantBudgetStart = new Date(filters.from);
    earliestRelevantBudgetStart.setUTCFullYear(
      earliestRelevantBudgetStart.getUTCFullYear() - 1,
    );
    const [categories, rawTransactions, rawBudgets] = await Promise.all([
      this.database.financeCategory.findMany({
        where: { userId, ...active },
        orderBy: [{ kind: "asc" }, { name: "asc" }],
      }),
      this.database.financeTransaction.findMany({
        where: {
          userId,
          ...active,
          ...category,
          currencyCode: filters.currencyCode,
          bookingDate: { gte: filters.from, lte: filters.to },
        },
        orderBy: [{ bookingDate: "desc" }, { createdAt: "desc" }],
        take: 10_000,
      }),
      this.database.financeBudget.findMany({
        where: {
          userId,
          ...active,
          ...category,
          currencyCode: filters.currencyCode,
          periodStart: {
            gte: earliestRelevantBudgetStart,
            lte: filters.to,
          },
        },
        orderBy: [{ periodStart: "desc" }, { createdAt: "asc" }],
        take: 2_000,
      }),
    ]);
    const transactions = rawTransactions.map(mapTransaction);
    const budgets = rawBudgets.map(mapBudget).filter((budget) => {
      const end = new Date(`${budget.periodStart}T00:00:00.000Z`);
      if (budget.period === "month") end.setUTCMonth(end.getUTCMonth() + 1);
      else end.setUTCFullYear(end.getUTCFullYear() + 1);
      return end > filters.from;
    });
    const incomeMinor = transactions
      .filter((value) => value.kind === "income")
      .reduce((sum, value) => sum + value.amountMinor, 0);
    const expenseMinor = transactions
      .filter((value) => value.kind === "expense")
      .reduce((sum, value) => sum + value.amountMinor, 0);
    const months = new Map<
      string,
      { incomeMinor: number; expenseMinor: number }
    >();
    for (const transaction of transactions) {
      const month = transaction.bookingDate.slice(0, 7);
      const current = months.get(month) ?? { incomeMinor: 0, expenseMinor: 0 };
      current[transaction.kind === "income" ? "incomeMinor" : "expenseMinor"] +=
        transaction.amountMinor;
      months.set(month, current);
    }
    const budgetWarnings = budgets.map((budget) => {
      const start = budget.periodStart;
      const startDate = new Date(`${start}T00:00:00.000Z`);
      const endDate = new Date(startDate);
      if (budget.period === "month")
        endDate.setUTCMonth(endDate.getUTCMonth() + 1);
      else endDate.setUTCFullYear(endDate.getUTCFullYear() + 1);
      const end = endDate.toISOString().slice(0, 10);
      const spentMinor = transactions
        .filter(
          (value) =>
            value.kind === "expense" &&
            value.bookingDate >= start &&
            value.bookingDate < end &&
            (!budget.categoryId || value.categoryId === budget.categoryId),
        )
        .reduce((sum, value) => sum + value.amountMinor, 0);
      const utilizationBasisPoints = Math.round(
        (spentMinor * 10_000) / budget.amountMinor,
      );
      return {
        budgetId: budget.id,
        categoryId: budget.categoryId,
        spentMinor,
        limitMinor: budget.amountMinor,
        utilizationBasisPoints,
        thresholdReached:
          utilizationBasisPoints >= budget.warningThresholdPercent * 100,
        exceeded: spentMinor > budget.amountMinor,
      };
    });
    return {
      range: { from: day(filters.from)!, to: day(filters.to)! },
      categories: categories.map(mapCategory),
      transactions,
      budgets,
      analytics: {
        currencyCode: filters.currencyCode,
        incomeMinor,
        expenseMinor,
        balanceMinor: incomeMinor - expenseMinor,
        savingsRateBasisPoints:
          incomeMinor === 0
            ? null
            : Math.round(((incomeMinor - expenseMinor) * 10_000) / incomeMinor),
        months: [...months.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([month, values]) => ({
            month,
            ...values,
            balanceMinor: values.incomeMinor - values.expenseMinor,
          })),
        budgetWarnings,
      },
    };
  }

  createCategory(userId: string, values: FinanceCategoryValues) {
    return this.database.$transaction(async (tx) => {
      try {
        const record = await tx.financeCategory.create({
          data: { userId, ...values },
        });
        await this.audit(
          tx,
          userId,
          "finance.category.created",
          "FinanceCategory",
          record.id,
        );
        return mapCategory(record);
      } catch (error) {
        if (this.isUniqueError(error))
          throw new FinanceDuplicateCategoryError();
        throw error;
      }
    });
  }
  updateCategory(
    userId: string,
    id: string,
    changes: FinanceChanges<FinanceCategoryValues>,
  ) {
    return this.database.$transaction(async (tx) => {
      if (!(await tx.financeCategory.findFirst({ where: { id, userId } })))
        throw new FinanceRecordNotFoundError();
      try {
        const record = await tx.financeCategory.update({
          where: { id },
          data: changes,
        });
        await this.audit(
          tx,
          userId,
          "finance.category.updated",
          "FinanceCategory",
          id,
          changes,
        );
        return mapCategory(record);
      } catch (error) {
        if (this.isUniqueError(error))
          throw new FinanceDuplicateCategoryError();
        throw error;
      }
    });
  }
  createTransaction(userId: string, values: FinanceTransactionValues) {
    return this.database.$transaction(async (tx) => {
      await this.requireCategory(tx, userId, values.categoryId, values.kind);
      const record = await tx.financeTransaction.create({
        data: { userId, ...values },
      });
      await this.audit(
        tx,
        userId,
        "finance.transaction.created",
        "FinanceTransaction",
        record.id,
      );
      return mapTransaction(record);
    });
  }
  updateTransaction(
    userId: string,
    id: string,
    changes: FinanceChanges<FinanceTransactionValues>,
  ) {
    return this.database.$transaction(async (tx) => {
      const current = await tx.financeTransaction.findFirst({
        where: { id, userId },
      });
      if (!current) throw new FinanceRecordNotFoundError();
      await this.requireCategory(
        tx,
        userId,
        changes.categoryId ?? current.categoryId,
        changes.kind ?? current.kind,
      );
      const record = await tx.financeTransaction.update({
        where: { id },
        data: changes,
      });
      await this.audit(
        tx,
        userId,
        "finance.transaction.updated",
        "FinanceTransaction",
        id,
        changes,
      );
      return mapTransaction(record);
    });
  }
  createBudget(userId: string, values: FinanceBudgetValues) {
    return this.database.$transaction(async (tx) => {
      if (values.categoryId)
        await this.requireCategory(tx, userId, values.categoryId, "expense");
      const record = await tx.financeBudget.create({
        data: { userId, ...values },
      });
      await this.audit(
        tx,
        userId,
        "finance.budget.created",
        "FinanceBudget",
        record.id,
      );
      return mapBudget(record);
    });
  }
  updateBudget(
    userId: string,
    id: string,
    changes: FinanceChanges<FinanceBudgetValues>,
  ) {
    return this.database.$transaction(async (tx) => {
      const current = await tx.financeBudget.findFirst({
        where: { id, userId },
      });
      if (!current) throw new FinanceRecordNotFoundError();
      const categoryId = Object.hasOwn(changes, "categoryId")
        ? (changes.categoryId ?? null)
        : current.categoryId;
      if (categoryId)
        await this.requireCategory(tx, userId, categoryId, "expense");
      const record = await tx.financeBudget.update({
        where: { id },
        data: changes,
      });
      await this.audit(
        tx,
        userId,
        "finance.budget.updated",
        "FinanceBudget",
        id,
        changes,
      );
      return mapBudget(record);
    });
  }

  private async requireCategory(
    tx: FinanceTransactionClient,
    userId: string,
    categoryId: string,
    kind: FinanceCategoryKind,
  ) {
    const category = await tx.financeCategory.findFirst({
      where: { id: categoryId, userId, archivedAt: null },
    });
    if (!category || category.kind !== kind)
      throw new FinanceReferenceNotFoundError();
  }
  private async audit(
    tx: FinanceTransactionClient,
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    changes?: object,
  ) {
    await tx.auditEvent.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
        ...(changes
          ? { metadata: { changedFields: Object.keys(changes).sort() } }
          : {}),
      },
    });
  }
  private isUniqueError(error: unknown) {
    return Boolean(
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002",
    );
  }
}
