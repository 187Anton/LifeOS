import type {
  CreateFinanceBudgetRequest,
  CreateFinanceCategoryRequest,
  CreateFinanceTransactionRequest,
  UpdateFinanceBudgetRequest,
  UpdateFinanceCategoryRequest,
  UpdateFinanceTransactionRequest,
} from "@lifeos/contracts";
import { Router, type Response } from "express";
import { z } from "zod";
import { validateRequest } from "../../middleware/validate-request.js";
import { createRequireAuthentication } from "../profile/router.js";
import type { AuthenticationService } from "../profile/service.js";
import type { FinanceService } from "./service.js";

const id = z.uuid();
const currency = z.string().regex(/^[A-Z]{3}$/);
const amount = z.number().int().min(1).max(2_000_000_000);
const date = z.iso.date();
const categoryKind = z.enum(["income", "expense"]);
const recurrenceFrequency = z.enum(["weekly", "monthly", "yearly"]);
const categoryCreate = z.strictObject({
  name: z.string().trim().min(1).max(200),
  kind: categoryKind,
});
const categoryUpdate = categoryCreate
  .partial()
  .extend({ archived: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0);
const transactionCreate = z.strictObject({
  categoryId: id,
  kind: categoryKind,
  bookingDate: date,
  amountMinor: amount,
  currencyCode: currency,
  note: z.string().max(2_000).nullable().optional(),
  recurrenceFrequency: recurrenceFrequency.nullable().optional(),
  recurrenceInterval: z.number().int().min(1).max(365).nullable().optional(),
  recurrenceEndDate: date.nullable().optional(),
});
const transactionUpdate = transactionCreate
  .partial()
  .extend({ archived: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0)
  .superRefine((value, context) => {
    const recurrenceKeys = [
      "recurrenceFrequency",
      "recurrenceInterval",
      "recurrenceEndDate",
    ] as const;
    if (!recurrenceKeys.some((key) => Object.hasOwn(value, key))) return;
    if (
      !Object.hasOwn(value, "recurrenceFrequency") ||
      !Object.hasOwn(value, "recurrenceInterval")
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Änderungen an Wiederholungen benötigen Häufigkeit und Intervall gemeinsam.",
      });
    }
    if (
      value.recurrenceFrequency == null &&
      (value.recurrenceInterval != null || value.recurrenceEndDate != null)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Ohne Wiederholung müssen Intervall und Enddatum ebenfalls leer sein.",
      });
    }
  });
const budgetCreate = z.strictObject({
  categoryId: id.nullable().optional(),
  period: z.enum(["month", "year"]),
  periodStart: date,
  amountMinor: amount,
  currencyCode: currency,
  warningThresholdPercent: z.number().int().min(1).max(100).optional(),
});
const budgetUpdate = budgetCreate
  .partial()
  .extend({ archived: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0)
  .refine(
    (value) =>
      Object.hasOwn(value, "period") === Object.hasOwn(value, "periodStart"),
    {
      message:
        "Budgetzeitraum und Startdatum müssen gemeinsam geändert werden.",
    },
  );
const params = z.strictObject({ id });
const overviewQuery = z.strictObject({
  from: date,
  to: date,
  currencyCode: currency.default("EUR"),
  categoryId: id.optional(),
  includeArchived: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});
const exportQuery = overviewQuery.omit({ includeArchived: true });

export const createFinanceRouter = ({
  authentication,
  finance,
}: {
  authentication: AuthenticationService;
  finance: FinanceService;
}): Router => {
  const router = Router();
  router.use(createRequireAuthentication(authentication));
  const owner = (response: Response) => String(response.locals.userId);
  router.get(
    "/finance",
    validateRequest({ query: overviewQuery }),
    async (_request, response) =>
      response.json(
        await finance.getOverview(
          owner(response),
          response.locals.validated.query,
        ),
      ),
  );
  router.get(
    "/finance/export",
    validateRequest({ query: exportQuery }),
    async (_request, response) => {
      const result = await finance.exportData(owner(response), {
        ...response.locals.validated.query,
        includeArchived: true,
      });
      response.setHeader("Cache-Control", "private, no-store");
      response.setHeader(
        "Content-Disposition",
        `attachment; filename="lifeos-finance-${result.range.from}-${result.range.to}.json"`,
      );
      response.json(result);
    },
  );
  router.post(
    "/finance/categories",
    validateRequest({ body: categoryCreate }),
    async (_request, response) =>
      response
        .status(201)
        .json(
          await finance.createCategory(
            owner(response),
            response.locals.validated.body as CreateFinanceCategoryRequest,
          ),
        ),
  );
  router.patch(
    "/finance/categories/:id",
    validateRequest({ params, body: categoryUpdate }),
    async (_request, response) =>
      response.json(
        await finance.updateCategory(
          owner(response),
          response.locals.validated.params.id,
          response.locals.validated.body as UpdateFinanceCategoryRequest,
        ),
      ),
  );
  router.post(
    "/finance/transactions",
    validateRequest({ body: transactionCreate }),
    async (_request, response) =>
      response
        .status(201)
        .json(
          await finance.createTransaction(
            owner(response),
            response.locals.validated.body as CreateFinanceTransactionRequest,
          ),
        ),
  );
  router.patch(
    "/finance/transactions/:id",
    validateRequest({ params, body: transactionUpdate }),
    async (_request, response) =>
      response.json(
        await finance.updateTransaction(
          owner(response),
          response.locals.validated.params.id,
          response.locals.validated.body as UpdateFinanceTransactionRequest,
        ),
      ),
  );
  router.post(
    "/finance/budgets",
    validateRequest({ body: budgetCreate }),
    async (_request, response) =>
      response
        .status(201)
        .json(
          await finance.createBudget(
            owner(response),
            response.locals.validated.body as CreateFinanceBudgetRequest,
          ),
        ),
  );
  router.patch(
    "/finance/budgets/:id",
    validateRequest({ params, body: budgetUpdate }),
    async (_request, response) =>
      response.json(
        await finance.updateBudget(
          owner(response),
          response.locals.validated.params.id,
          response.locals.validated.body as UpdateFinanceBudgetRequest,
        ),
      ),
  );
  return router;
};
