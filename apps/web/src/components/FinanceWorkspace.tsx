import type {
  FinanceOverviewResponse,
  FinanceTransactionResponse,
} from "@lifeos/contracts";
import { useCallback, useEffect, useState } from "react";

import { api, ApiClientError } from "../api";

const today = () => new Date().toISOString().slice(0, 10);
const currentYearRange = () => ({
  from: `${today().slice(0, 4)}-01-01`,
  to: `${today().slice(0, 4)}-12-31`,
});
const message = (error: unknown) =>
  error instanceof ApiClientError
    ? error.message
    : "Die Finanzdaten konnten nicht verarbeitet werden.";
const money = (minor: number, currency: string) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(
    minor / 100,
  );
const percent = (basisPoints: number | null) =>
  basisPoints === null
    ? "nicht berechenbar"
    : `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(basisPoints / 100)} %`;
const field = (data: FormData, name: string) => {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
};

export const FinanceWorkspace = ({
  currencyCode = "EUR",
}: {
  currencyCode?: string;
}) => {
  const [range, setRange] = useState(currentYearRange);
  const [categoryId, setCategoryId] = useState("");
  const [data, setData] = useState<FinanceOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState<FinanceTransactionResponse | null>(
    null,
  );

  const load = useCallback(
    async (nextRange: { from: string; to: string }, nextCategory: string) => {
      setLoading(true);
      setError(null);
      try {
        setData(
          await api.getFinance(
            nextRange.from,
            nextRange.to,
            currencyCode,
            nextCategory || undefined,
          ),
        );
      } catch (caught) {
        setError(message(caught));
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [currencyCode],
  );
  useEffect(() => {
    let active = true;
    const initialRange = currentYearRange();
    void api
      .getFinance(initialRange.from, initialRange.to, currencyCode)
      .then((overview) => {
        if (active) setData(overview);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(message(caught));
          setData(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [currencyCode]);

  const run = async (
    operation: () => Promise<unknown>,
    successMessage: string,
  ) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await operation();
      setSuccess(successMessage);
      setEditing(null);
      await load(range, categoryId);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setSaving(false);
    }
  };

  const exportData = async () => {
    try {
      const exported = await api.exportFinance(
        range.from,
        range.to,
        currencyCode,
      );
      const blob = new Blob([JSON.stringify(exported, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `lifeos-finance-${range.from}-${range.to}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setSuccess("Der lokale Finanzexport wurde erstellt.");
    } catch (caught) {
      setError(message(caught));
    }
  };

  const submitTransaction = (form: HTMLFormElement) => {
    const values = new FormData(form);
    const frequency = field(values, "recurrenceFrequency");
    const payload = {
      categoryId: field(values, "categoryId"),
      kind: field(values, "kind") as "income" | "expense",
      bookingDate: field(values, "bookingDate"),
      amountMinor: Math.round(Number(values.get("amount")) * 100),
      currencyCode,
      note: field(values, "note").trim() || null,
      recurrenceFrequency: frequency
        ? (frequency as "weekly" | "monthly" | "yearly")
        : null,
      recurrenceInterval: frequency
        ? Number(values.get("recurrenceInterval") || 1)
        : null,
      recurrenceEndDate: frequency
        ? field(values, "recurrenceEndDate") || null
        : null,
    };
    return editing
      ? run(
          () => api.updateFinanceTransaction(editing.id, payload),
          "Die Buchung wurde aktualisiert.",
        )
      : run(
          () => api.createFinanceTransaction(payload),
          "Die Buchung wurde angelegt.",
        );
  };

  const expenseCategories =
    data?.categories.filter(
      (value) => value.kind === "expense" && !value.archivedAt,
    ) ?? [];
  const activeCategories =
    data?.categories.filter((value) => !value.archivedAt) ?? [];

  return (
    <main className="page-content finance-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">Lokal & privat</span>
          <h1>Finanzen</h1>
          <p>
            Einnahmen, Ausgaben und Budgets ohne Bankanbindung, Steuerbewertung
            oder externe Übertragung.
          </p>
        </div>
        <button
          className="secondary-button"
          onClick={() => void exportData()}
          disabled={!data || loading}
        >
          Eigene Daten exportieren
        </button>
      </header>

      {error ? (
        <p className="status-message error" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="status-message success" role="status">
          {success}
        </p>
      ) : null}

      <form
        className="filter-bar finance-filters"
        onSubmit={(event) => {
          event.preventDefault();
          void load(range, categoryId);
        }}
      >
        <label>
          Von
          <input
            type="date"
            value={range.from}
            onChange={(event) =>
              setRange({ ...range, from: event.target.value })
            }
            required
          />
        </label>
        <label>
          Bis
          <input
            type="date"
            value={range.to}
            onChange={(event) => setRange({ ...range, to: event.target.value })}
            required
          />
        </label>
        <label>
          Kategorie
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">Alle Kategorien</option>
            {activeCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <button className="primary-button" disabled={loading}>
          Auswerten
        </button>
      </form>

      {loading ? (
        <section className="empty-state" aria-live="polite">
          <h2>Finanzübersicht wird geladen …</h2>
        </section>
      ) : data ? (
        <>
          <section className="finance-metrics" aria-label="Finanzkennzahlen">
            <article>
              <span>Einnahmen</span>
              <strong>{money(data.analytics.incomeMinor, currencyCode)}</strong>
            </article>
            <article>
              <span>Ausgaben</span>
              <strong>
                {money(data.analytics.expenseMinor, currencyCode)}
              </strong>
            </article>
            <article>
              <span>Saldo</span>
              <strong>
                {money(data.analytics.balanceMinor, currencyCode)}
              </strong>
            </article>
            <article>
              <span>Sparquote</span>
              <strong>{percent(data.analytics.savingsRateBasisPoints)}</strong>
            </article>
          </section>

          <div className="finance-grid">
            <section className="study-section">
              <h2>{editing ? "Buchung bearbeiten" : "Buchung anlegen"}</h2>
              <form
                key={editing?.id ?? "new-transaction"}
                className="knowledge-editor"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitTransaction(event.currentTarget);
                }}
              >
                <label>
                  Art
                  <select
                    name="kind"
                    defaultValue={editing?.kind ?? "expense"}
                    required
                  >
                    <option value="expense">Ausgabe</option>
                    <option value="income">Einnahme</option>
                  </select>
                </label>
                <label>
                  Kategorie
                  <select
                    name="categoryId"
                    defaultValue={editing?.categoryId ?? ""}
                    required
                  >
                    <option value="" disabled>
                      Auswählen
                    </option>
                    {activeCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name} (
                        {category.kind === "income" ? "Einnahme" : "Ausgabe"})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Buchungsdatum
                  <input
                    name="bookingDate"
                    type="date"
                    defaultValue={editing?.bookingDate ?? today()}
                    required
                  />
                </label>
                <label>
                  Betrag in {currencyCode}
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    max="20000000"
                    step="0.01"
                    defaultValue={
                      editing ? (editing.amountMinor / 100).toFixed(2) : ""
                    }
                    required
                  />
                </label>
                <label>
                  Notiz
                  <textarea
                    name="note"
                    maxLength={2000}
                    defaultValue={editing?.note ?? ""}
                  />
                </label>
                <label>
                  Wiederholung
                  <select
                    name="recurrenceFrequency"
                    defaultValue={editing?.recurrenceFrequency ?? ""}
                  >
                    <option value="">Keine automatische Erzeugung</option>
                    <option value="weekly">Wöchentlich vorbereitet</option>
                    <option value="monthly">Monatlich vorbereitet</option>
                    <option value="yearly">Jährlich vorbereitet</option>
                  </select>
                </label>
                <label>
                  Intervall
                  <input
                    name="recurrenceInterval"
                    type="number"
                    min="1"
                    max="365"
                    defaultValue={editing?.recurrenceInterval ?? 1}
                  />
                </label>
                <label>
                  Wiederholung bis
                  <input
                    name="recurrenceEndDate"
                    type="date"
                    defaultValue={editing?.recurrenceEndDate ?? ""}
                  />
                </label>
                <div className="form-actions">
                  <button className="primary-button" disabled={saving}>
                    {saving
                      ? "Speichert …"
                      : editing
                        ? "Änderungen speichern"
                        : "Buchung anlegen"}
                  </button>
                  {editing ? (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setEditing(null)}
                    >
                      Abbrechen
                    </button>
                  ) : null}
                </div>
              </form>
            </section>

            <section className="study-section">
              <h2>Kategorien</h2>
              <form
                className="inline-create"
                onSubmit={(event) => {
                  event.preventDefault();
                  const values = new FormData(event.currentTarget);
                  void run(
                    () =>
                      api.createFinanceCategory({
                        name: field(values, "name"),
                        kind: field(values, "kind") as "income" | "expense",
                      }),
                    "Die Kategorie wurde angelegt.",
                  );
                  event.currentTarget.reset();
                }}
              >
                <input
                  name="name"
                  aria-label="Kategoriename"
                  maxLength={200}
                  required
                  placeholder="z. B. Lebensmittel"
                />
                <select name="kind" aria-label="Kategorieart">
                  <option value="expense">Ausgabe</option>
                  <option value="income">Einnahme</option>
                </select>
                <button className="secondary-button" disabled={saving}>
                  Hinzufügen
                </button>
              </form>
              <div className="finance-list">
                {activeCategories.length ? (
                  activeCategories.map((category) => (
                    <article key={category.id}>
                      <div>
                        <strong>{category.name}</strong>
                        <small>
                          {category.kind === "income" ? "Einnahme" : "Ausgabe"}
                        </small>
                      </div>
                      <button
                        className="text-button"
                        onClick={() =>
                          void run(
                            () =>
                              api.updateFinanceCategory(category.id, {
                                archived: true,
                              }),
                            "Die Kategorie wurde archiviert.",
                          )
                        }
                      >
                        Archivieren
                      </button>
                    </article>
                  ))
                ) : (
                  <p>Noch keine Kategorien vorhanden.</p>
                )}
              </div>
            </section>
          </div>

          <section className="study-section">
            <h2>Buchungen im Zeitraum</h2>
            {data.transactions.length ? (
              <div className="finance-list">
                {data.transactions.map((transaction) => (
                  <article key={transaction.id}>
                    <div>
                      <strong>
                        {transaction.kind === "income" ? "+" : "−"}
                        {money(
                          transaction.amountMinor,
                          transaction.currencyCode,
                        )}
                      </strong>
                      <span>
                        {activeCategories.find(
                          (value) => value.id === transaction.categoryId,
                        )?.name ?? "Archivierte Kategorie"}
                      </span>
                      <small>
                        {transaction.bookingDate}
                        {transaction.recurrenceFrequency
                          ? " · wiederkehrend vorbereitet"
                          : ""}
                      </small>
                    </div>
                    <div className="form-actions">
                      <button
                        className="text-button"
                        onClick={() => setEditing(transaction)}
                      >
                        Bearbeiten
                      </button>
                      <button
                        className="text-button"
                        onClick={() =>
                          void run(
                            () =>
                              api.updateFinanceTransaction(transaction.id, {
                                archived: true,
                              }),
                            "Die Buchung wurde archiviert.",
                          )
                        }
                      >
                        Archivieren
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state compact">
                <h3>Keine Buchungen im gewählten Zeitraum</h3>
                <p>Lege oben die erste Einnahme oder Ausgabe an.</p>
              </div>
            )}
          </section>

          <div className="finance-grid">
            <section className="study-section">
              <h2>Budget anlegen</h2>
              <BudgetForm
                categories={expenseCategories}
                currencyCode={currencyCode}
                saving={saving}
                onSubmit={(payload) =>
                  run(
                    () => api.createFinanceBudget(payload),
                    "Das Budget wurde angelegt.",
                  )
                }
              />
            </section>
            <section className="study-section">
              <h2>Budgetwarnungen</h2>
              {data.analytics.budgetWarnings.length ? (
                <div className="finance-list">
                  {data.analytics.budgetWarnings.map((warning) => {
                    const budget = data.budgets.find(
                      (value) => value.id === warning.budgetId,
                    );
                    return (
                      <article
                        className={
                          warning.exceeded
                            ? "budget-warning exceeded"
                            : warning.thresholdReached
                              ? "budget-warning reached"
                              : "budget-warning"
                        }
                        key={warning.budgetId}
                      >
                        <div>
                          <strong>
                            {budget?.period === "year"
                              ? "Jahresbudget"
                              : "Monatsbudget"}
                          </strong>
                          <span>
                            {money(warning.spentMinor, currencyCode)} von{" "}
                            {money(warning.limitMinor, currencyCode)}
                          </span>
                          <small>
                            {percent(warning.utilizationBasisPoints)} genutzt
                          </small>
                        </div>
                        {budget ? (
                          <button
                            className="text-button"
                            onClick={() =>
                              void run(
                                () =>
                                  api.updateFinanceBudget(budget.id, {
                                    archived: true,
                                  }),
                                "Das Budget wurde archiviert.",
                              )
                            }
                          >
                            Archivieren
                          </button>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p>Noch keine Budgets für den Zeitraum vorhanden.</p>
              )}
            </section>
          </div>

          <section className="study-section">
            <h2>Monatsvergleich</h2>
            {data.analytics.months.length ? (
              <div className="month-comparison">
                {data.analytics.months.map((month) => (
                  <article key={month.month}>
                    <strong>{month.month}</strong>
                    <span>
                      Einnahmen {money(month.incomeMinor, currencyCode)}
                    </span>
                    <span>
                      Ausgaben {money(month.expenseMinor, currencyCode)}
                    </span>
                    <span>Saldo {money(month.balanceMinor, currencyCode)}</span>
                  </article>
                ))}
              </div>
            ) : (
              <p>Für einen Monatsvergleich fehlen Buchungen.</p>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
};

const BudgetForm = ({
  categories,
  currencyCode,
  saving,
  onSubmit,
}: {
  categories: FinanceOverviewResponse["categories"];
  currencyCode: string;
  saving: boolean;
  onSubmit: (payload: {
    categoryId: string | null;
    period: "month" | "year";
    periodStart: string;
    amountMinor: number;
    currencyCode: string;
    warningThresholdPercent: number;
  }) => Promise<void>;
}) => (
  <form
    className="knowledge-editor"
    onSubmit={(event) => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      const period = field(values, "period") as "month" | "year";
      const rawStart = field(values, "periodStart");
      void onSubmit({
        categoryId: field(values, "categoryId") || null,
        period,
        periodStart:
          period === "month"
            ? `${rawStart}-01`
            : `${rawStart.slice(0, 4)}-01-01`,
        amountMinor: Math.round(Number(values.get("amount")) * 100),
        currencyCode,
        warningThresholdPercent: Number(values.get("warningThresholdPercent")),
      });
    }}
  >
    <label>
      Zeitraum
      <select name="period">
        <option value="month">Monat</option>
        <option value="year">Jahr</option>
      </select>
    </label>
    <label>
      Beginn
      <input name="periodStart" type="month" required />
    </label>
    <label>
      Kategorie
      <select name="categoryId">
        <option value="">Gesamte Ausgaben</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
    </label>
    <label>
      Limit in {currencyCode}
      <input
        name="amount"
        type="number"
        min="0.01"
        max="20000000"
        step="0.01"
        required
      />
    </label>
    <label>
      Warnung ab Prozent
      <input
        name="warningThresholdPercent"
        type="number"
        min="1"
        max="100"
        defaultValue="80"
        required
      />
    </label>
    <button className="primary-button" disabled={saving}>
      Budget anlegen
    </button>
  </form>
);
