import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFinance: vi.fn(),
}));

vi.mock("../../src/api", () => ({
  ApiClientError: class ApiClientError extends Error {},
  api: {
    getFinance: mocks.getFinance,
    createFinanceCategory: vi.fn(),
    updateFinanceCategory: vi.fn(),
    createFinanceTransaction: vi.fn(),
    updateFinanceTransaction: vi.fn(),
    createFinanceBudget: vi.fn(),
    updateFinanceBudget: vi.fn(),
    exportFinance: vi.fn(),
  },
}));

import { FinanceWorkspace } from "../../src/components/FinanceWorkspace";

describe("Finanzoberfläche", () => {
  beforeEach(() => mocks.getFinance.mockReset());

  it("zeigt lokale Kennzahlen, Budgets und vorbereitete Wiederholungen verständlich", async () => {
    mocks.getFinance.mockResolvedValue({
      range: { from: "2032-01-01", to: "2032-12-31" },
      categories: [
        {
          id: "category-1",
          ownerId: "owner-1",
          name: "Synthetische Lebensmittel",
          kind: "expense",
          archivedAt: null,
          createdAt: "2032-01-01T00:00:00.000Z",
          updatedAt: "2032-01-01T00:00:00.000Z",
        },
      ],
      transactions: [
        {
          id: "transaction-1",
          ownerId: "owner-1",
          categoryId: "category-1",
          kind: "expense",
          bookingDate: "2032-01-10",
          amountMinor: 12_345,
          currencyCode: "EUR",
          note: "Nur synthetisch",
          recurrenceFrequency: "monthly",
          recurrenceInterval: 1,
          recurrenceEndDate: "2032-12-31",
          archivedAt: null,
          createdAt: "2032-01-01T00:00:00.000Z",
          updatedAt: "2032-01-01T00:00:00.000Z",
        },
      ],
      budgets: [
        {
          id: "budget-1",
          ownerId: "owner-1",
          categoryId: "category-1",
          period: "month",
          periodStart: "2032-01-01",
          amountMinor: 20_000,
          currencyCode: "EUR",
          warningThresholdPercent: 50,
          archivedAt: null,
          createdAt: "2032-01-01T00:00:00.000Z",
          updatedAt: "2032-01-01T00:00:00.000Z",
        },
      ],
      analytics: {
        incomeMinor: 50_000,
        expenseMinor: 12_345,
        balanceMinor: 37_655,
        savingsRateBasisPoints: 7_531,
        months: [
          {
            month: "2032-01",
            incomeMinor: 50_000,
            expenseMinor: 12_345,
            balanceMinor: 37_655,
          },
        ],
        budgetWarnings: [
          {
            budgetId: "budget-1",
            spentMinor: 12_345,
            limitMinor: 20_000,
            utilizationBasisPoints: 6_173,
            thresholdReached: true,
            exceeded: false,
          },
        ],
      },
    });

    render(<FinanceWorkspace currencyCode="EUR" />);

    expect(
      await screen.findByRole("heading", { name: "Finanzen" }),
    ).toBeVisible();
    expect(screen.getAllByText(/123,45\s*€/)[0]).toBeVisible();
    expect(screen.getByText("75,31 %")).toBeVisible();
    expect(
      screen.getByText("wiederkehrend vorbereitet", { exact: false }),
    ).toBeVisible();
    expect(screen.getByText("61,73 % genutzt")).toBeVisible();
  });

  it("zeigt einen verständlichen Leerzustand", async () => {
    mocks.getFinance.mockResolvedValue({
      range: { from: "2032-01-01", to: "2032-12-31" },
      categories: [],
      transactions: [],
      budgets: [],
      analytics: {
        incomeMinor: 0,
        expenseMinor: 0,
        balanceMinor: 0,
        savingsRateBasisPoints: null,
        months: [],
        budgetWarnings: [],
      },
    });

    render(<FinanceWorkspace />);

    expect(
      await screen.findByText("Keine Buchungen im gewählten Zeitraum"),
    ).toBeVisible();
    expect(screen.getByText("Noch keine Kategorien vorhanden.")).toBeVisible();
    expect(
      screen.getByText("Für einen Monatsvergleich fehlen Buchungen."),
    ).toBeVisible();
  });
});
