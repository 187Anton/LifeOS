import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createDatabaseClient } from "@lifeos/database";
import type {
  FinanceExportResponse,
  FinanceOverviewResponse,
} from "@lifeos/contracts";
import { config as loadEnvironment } from "dotenv";

import { createApplication } from "../src/application.js";
import type { Logger } from "../src/logger.js";
import { PrismaFinanceRepository } from "../src/modules/finance/repository.js";
import { createFinanceRouter } from "../src/modules/finance/router.js";
import { FinanceService } from "../src/modules/finance/service.js";
import { PrismaProfileRepository } from "../src/modules/profile/repository.js";
import { createProfileRouter } from "../src/modules/profile/router.js";
import { hashPassword } from "../src/modules/profile/security.js";
import {
  AuthenticationService,
  ProfileService,
} from "../src/modules/profile/service.js";

loadEnvironment({
  path: path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../.env",
  ),
  quiet: true,
});
class SilentLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}
const close = (server: Server) =>
  new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );

test("verwaltet eigene Finanzdaten ganzzahlig, filterbar, auswertbar und exportierbar", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalId = `finance-owner-${suffix}`;
  const otherExternalId = `finance-other-${suffix}`;
  const password = `synthetisches-finanzpasswort-${suffix}`;
  const owner = await database.user.create({
    data: {
      externalId,
      displayName: "Synthetische Finanzperson",
      settings: { create: { currencyCode: "EUR" } },
      credential: { create: { passwordHash: await hashPassword(password) } },
    },
  });
  const other = await database.user.create({
    data: {
      externalId: otherExternalId,
      displayName: "Andere Finanzperson",
      settings: { create: {} },
    },
  });
  const foreignCategory = await database.financeCategory.create({
    data: { userId: other.id, name: "Fremde Kategorie", kind: "expense" },
  });
  const profileRepository = new PrismaProfileRepository(database, externalId);
  const authentication = new AuthenticationService(profileRepository, 1);
  const application = createApplication({
    logger: new SilentLogger(),
    readinessProbe: { check: async () => undefined },
    webOrigin: "http://127.0.0.1:5173",
    moduleRouters: [
      createProfileRouter({
        authentication,
        profile: new ProfileService(profileRepository),
        secureCookies: false,
      }),
      createFinanceRouter({
        authentication,
        finance: new FinanceService(
          new PrismaFinanceRepository(database),
          () => new Date("2032-02-01T12:00:00.000Z"),
        ),
      }),
    ],
  });
  const server = createServer(application);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api/v1`;
  t.after(async () => {
    await close(server);
    await database.user.deleteMany({
      where: { externalId: { in: [externalId, otherExternalId] } },
    });
    await database.$disconnect();
  });

  assert.equal(
    (await fetch(`${base}/finance?from=2032-01-01&to=2032-12-31`)).status,
    401,
  );
  const login = await fetch(`${base}/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";", 1)[0] ?? "";
  const headers = { cookie, "content-type": "application/json" };
  const createCategory = async (name: string, kind: "income" | "expense") => {
    const response = await fetch(`${base}/finance/categories`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name, kind }),
    });
    assert.equal(response.status, 201);
    return (await response.json()) as { id: string };
  };
  const income = await createCategory("Synthetisches Gehalt", "income");
  const expense = await createCategory("Synthetische Lebensmittel", "expense");
  assert.equal(
    (
      await fetch(`${base}/finance/categories`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "Synthetische Lebensmittel",
          kind: "expense",
        }),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await fetch(`${base}/finance/categories/${foreignCategory.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ archived: true }),
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await fetch(`${base}/finance/transactions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          categoryId: foreignCategory.id,
          kind: "expense",
          bookingDate: "2032-01-02",
          amountMinor: 100,
          currencyCode: "EUR",
        }),
      })
    ).status,
    400,
  );
  const createTransaction = async (payload: object) => {
    const response = await fetch(`${base}/finance/transactions`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    assert.equal(response.status, 201);
    return (await response.json()) as { id: string; amountMinor: number };
  };
  await createTransaction({
    categoryId: income.id,
    kind: "income",
    bookingDate: "2032-01-01",
    amountMinor: 200000,
    currencyCode: "EUR",
    note: "Nur synthetisch",
  });
  const transaction = await createTransaction({
    categoryId: expense.id,
    kind: "expense",
    bookingDate: "2032-01-10",
    amountMinor: 50000,
    currencyCode: "EUR",
    recurrenceFrequency: "monthly",
    recurrenceInterval: 1,
    recurrenceEndDate: "2032-12-31",
  });
  assert.equal(transaction.amountMinor, 50000);
  const budgetResponse = await fetch(`${base}/finance/budgets`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      categoryId: expense.id,
      period: "month",
      periodStart: "2032-01-01",
      amountMinor: 60000,
      currencyCode: "EUR",
      warningThresholdPercent: 80,
    }),
  });
  assert.equal(budgetResponse.status, 201);
  const budget = (await budgetResponse.json()) as { id: string };
  assert.equal(
    (
      await fetch(`${base}/finance/budgets`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          period: "month",
          periodStart: "2030-01-01",
          amountMinor: 60_000,
          currencyCode: "EUR",
        }),
      })
    ).status,
    201,
  );
  const overviewResponse = await fetch(
    `${base}/finance?from=2032-01-01&to=2032-12-31&currencyCode=EUR`,
    { headers: { cookie } },
  );
  assert.equal(overviewResponse.status, 200);
  const overview = (await overviewResponse.json()) as FinanceOverviewResponse;
  assert.equal(overview.analytics.incomeMinor, 200000);
  assert.equal(overview.analytics.expenseMinor, 50000);
  assert.equal(overview.analytics.balanceMinor, 150000);
  assert.equal(overview.analytics.savingsRateBasisPoints, 7500);
  assert.equal(overview.budgets.length, 1);
  assert.equal(overview.analytics.budgetWarnings[0]?.thresholdReached, true);
  assert.equal(overview.analytics.budgetWarnings[0]?.exceeded, false);
  assert.deepEqual(overview.analytics.months[0], {
    month: "2032-01",
    incomeMinor: 200000,
    expenseMinor: 50000,
    balanceMinor: 150000,
  });
  const updated = await fetch(
    `${base}/finance/transactions/${transaction.id}`,
    { method: "PATCH", headers, body: JSON.stringify({ amountMinor: 65000 }) },
  );
  assert.equal(updated.status, 200);
  assert.equal(
    ((await updated.json()) as { amountMinor: number }).amountMinor,
    65000,
  );
  const warningOverview = (await (
    await fetch(`${base}/finance?from=2032-01-01&to=2032-01-31`, {
      headers: { cookie },
    })
  ).json()) as FinanceOverviewResponse;
  assert.equal(warningOverview.analytics.budgetWarnings[0]?.exceeded, true);
  const exportedResponse = await fetch(
    `${base}/finance/export?from=2032-01-01&to=2032-12-31`,
    { headers: { cookie } },
  );
  assert.equal(
    exportedResponse.headers.get("cache-control"),
    "private, no-store",
  );
  const exported = (await exportedResponse.json()) as FinanceExportResponse;
  assert.equal(exported.formatVersion, 1);
  assert.ok(exported.transactions.every((value) => value.ownerId === owner.id));
  assert.ok(exported.categories.every((value) => value.ownerId === owner.id));
  assert.equal(
    (
      await fetch(`${base}/finance/budgets/${budget.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ archived: true }),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(`${base}/finance/transactions/${transaction.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ archived: true }),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(`${base}/finance/transactions/${transaction.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ recurrenceEndDate: "2032-12-31" }),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(`${base}/finance?from=2032-01-01&to=2045-01-01`, {
        headers: { cookie },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(`${base}/finance/transactions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          categoryId: expense.id,
          kind: "expense",
          bookingDate: "2032-01-01",
          amountMinor: 2_000_000_001,
          currencyCode: "EUR",
        }),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(`${base}/finance/transactions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          categoryId: expense.id,
          kind: "expense",
          bookingDate: "2032-01-01",
          amountMinor: 100,
          currencyCode: "EUR",
          note: "x".repeat(2_001),
        }),
      })
    ).status,
    400,
  );
});
