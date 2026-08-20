import type {
  CreateFinanceBudgetRequest,
  CreateFinanceCategoryRequest,
  CreateFinanceTransactionRequest,
  FinanceExportResponse,
  UpdateFinanceBudgetRequest,
  UpdateFinanceCategoryRequest,
  UpdateFinanceTransactionRequest,
} from "@lifeos/contracts";
import { ApiError } from "../../errors.js";
import {
  FinanceDuplicateCategoryError,
  FinanceRecordNotFoundError,
  FinanceReferenceNotFoundError,
  type FinanceBudgetValues,
  type FinanceCategoryValues,
  type FinanceChanges,
  type FinanceFilters,
  type FinanceRepository,
  type FinanceTransactionValues,
} from "./repository.js";

const day = (value: string | null | undefined) =>
  value ? new Date(`${value}T00:00:00.000Z`) : null;
const own = <T extends object>(value: T, key: PropertyKey) =>
  Object.hasOwn(value, key);

export class FinanceService {
  constructor(
    private readonly repository: FinanceRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  getOverview(
    userId: string,
    filters: Omit<FinanceFilters, "from" | "to"> & { from: string; to: string },
  ) {
    this.assertRange(filters.from, filters.to);
    return this.repository.getOverview(userId, {
      ...filters,
      from: day(filters.from)!,
      to: day(filters.to)!,
    });
  }
  createCategory(userId: string, input: CreateFinanceCategoryRequest) {
    return this.handle(() => this.repository.createCategory(userId, input));
  }
  updateCategory(
    userId: string,
    id: string,
    input: UpdateFinanceCategoryRequest,
  ) {
    const { archived, ...values } = input;
    const changes: FinanceChanges<FinanceCategoryValues> = { ...values };
    if (archived !== undefined)
      changes.archivedAt = archived ? this.now() : null;
    return this.handle(() =>
      this.repository.updateCategory(userId, id, changes),
    );
  }
  createTransaction(userId: string, input: CreateFinanceTransactionRequest) {
    this.assertRecurrence(input);
    return this.handle(() =>
      this.repository.createTransaction(userId, this.transactionValues(input)),
    );
  }
  async updateTransaction(
    userId: string,
    id: string,
    input: UpdateFinanceTransactionRequest,
  ) {
    const { archived } = input;
    const changes: FinanceChanges<FinanceTransactionValues> = {};
    if (own(input, "categoryId")) changes.categoryId = input.categoryId!;
    if (own(input, "kind")) changes.kind = input.kind!;
    if (own(input, "bookingDate"))
      changes.bookingDate = day(input.bookingDate)!;
    if (own(input, "amountMinor")) changes.amountMinor = input.amountMinor!;
    if (own(input, "currencyCode")) changes.currencyCode = input.currencyCode!;
    if (own(input, "note")) changes.note = input.note ?? null;
    if (own(input, "recurrenceFrequency"))
      changes.recurrenceFrequency = input.recurrenceFrequency ?? null;
    if (own(input, "recurrenceInterval"))
      changes.recurrenceInterval = input.recurrenceInterval ?? null;
    if (own(input, "recurrenceEndDate"))
      changes.recurrenceEndDate = day(input.recurrenceEndDate);
    if (archived !== undefined)
      changes.archivedAt = archived ? this.now() : null;
    return this.handle(() =>
      this.repository.updateTransaction(userId, id, changes),
    );
  }
  createBudget(userId: string, input: CreateFinanceBudgetRequest) {
    this.assertBudgetStart(input.period, input.periodStart);
    return this.handle(() =>
      this.repository.createBudget(userId, this.budgetValues(input)),
    );
  }
  updateBudget(userId: string, id: string, input: UpdateFinanceBudgetRequest) {
    if (input.period && input.periodStart)
      this.assertBudgetStart(input.period, input.periodStart);
    const { archived } = input;
    const changes: FinanceChanges<FinanceBudgetValues> = {};
    if (own(input, "categoryId")) changes.categoryId = input.categoryId ?? null;
    if (own(input, "period")) changes.period = input.period!;
    if (own(input, "periodStart"))
      changes.periodStart = day(input.periodStart)!;
    if (own(input, "amountMinor")) changes.amountMinor = input.amountMinor!;
    if (own(input, "currencyCode")) changes.currencyCode = input.currencyCode!;
    if (own(input, "warningThresholdPercent"))
      changes.warningThresholdPercent = input.warningThresholdPercent!;
    if (archived !== undefined)
      changes.archivedAt = archived ? this.now() : null;
    return this.handle(() => this.repository.updateBudget(userId, id, changes));
  }
  async exportData(
    userId: string,
    filters: Omit<FinanceFilters, "from" | "to"> & { from: string; to: string },
  ): Promise<FinanceExportResponse> {
    const overview = await this.getOverview(userId, {
      ...filters,
      includeArchived: true,
    });
    return {
      formatVersion: 1,
      exportedAt: this.now().toISOString(),
      range: overview.range,
      categories: overview.categories,
      transactions: overview.transactions,
      budgets: overview.budgets,
    };
  }

  private transactionValues(
    input: CreateFinanceTransactionRequest,
  ): FinanceTransactionValues {
    return {
      ...input,
      bookingDate: day(input.bookingDate)!,
      note: input.note ?? null,
      recurrenceFrequency: input.recurrenceFrequency ?? null,
      recurrenceInterval: input.recurrenceInterval ?? null,
      recurrenceEndDate: day(input.recurrenceEndDate),
    };
  }
  private budgetValues(input: CreateFinanceBudgetRequest): FinanceBudgetValues {
    return {
      ...input,
      categoryId: input.categoryId ?? null,
      periodStart: day(input.periodStart)!,
      warningThresholdPercent: input.warningThresholdPercent ?? 80,
    };
  }
  private assertRange(from: string, to: string) {
    const start = day(from)!;
    const end = day(to)!;
    const max = new Date(start);
    max.setUTCFullYear(max.getUTCFullYear() + 10);
    if (end < start || end > max)
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Der Finanzzeitraum muss chronologisch sein und darf höchstens zehn Jahre umfassen.",
      );
  }
  private assertRecurrence(input: CreateFinanceTransactionRequest) {
    const any =
      input.recurrenceFrequency != null ||
      input.recurrenceInterval != null ||
      input.recurrenceEndDate != null;
    const complete =
      input.recurrenceFrequency != null && input.recurrenceInterval != null;
    if (
      (any && !complete) ||
      (input.recurrenceEndDate && input.recurrenceEndDate < input.bookingDate)
    )
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Wiederkehrende Buchungen benötigen Häufigkeit, Intervall und ein gültiges optionales Enddatum.",
      );
  }
  private assertBudgetStart(period: string, periodStart: string) {
    if (
      (period === "month" && !periodStart.endsWith("-01")) ||
      (period === "year" && !periodStart.endsWith("-01-01"))
    )
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Budgetzeiträume beginnen am ersten Tag des Monats beziehungsweise Jahres.",
      );
  }
  private async handle<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof FinanceRecordNotFoundError)
        throw new ApiError(
          404,
          "NOT_FOUND",
          "Der Finanzdatensatz wurde nicht gefunden.",
        );
      if (error instanceof FinanceReferenceNotFoundError)
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          "Die Kategorie fehlt, ist archiviert oder passt nicht zur Buchungsart.",
        );
      if (error instanceof FinanceDuplicateCategoryError)
        throw new ApiError(
          409,
          "CONFLICT",
          "Diese Finanzkategorie ist bereits vorhanden.",
        );
      throw error;
    }
  }
}
