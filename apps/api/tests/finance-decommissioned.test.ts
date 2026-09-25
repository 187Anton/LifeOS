import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Router } from "express";

import { createApplication } from "../src/application.js";
import type { Logger } from "../src/logger.js";

const sourceDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src",
);

const serverSourcePath = path.join(sourceDirectory, "server.ts");

class SilentLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

const listen = async (
  application: ReturnType<typeof createApplication>,
): Promise<{ server: Server; baseUrl: string }> => {
  const server = createServer(application);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

const close = (server: Server) =>
  new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );

// Paket 2b/1: Der Finanzbereich ist aus dem aktiven Produkt entfernt. Diese
// Prüfung ist bewusst synthetisch und ohne Datenbank lauffähig: sie liest die
// echte Serververdrahtung und prüft danach das tatsächliche HTTP-Verhalten der
// Anwendungsfabrik. Sie ersetzt den früheren Finanz-Integrationstest, der den
// damals noch aktiven Vertrag geprüft hat.
test("der stillgelegte Finanzbereich ist nicht mehr im API-Server verdrahtet", async () => {
  const serverSource = await readFile(serverSourcePath, "utf8");

  assert.doesNotMatch(serverSource, /finance/i);

  const routerModules = [
    ...serverSource.matchAll(/from "\.\/modules\/([^"/]+)\/router\.js"/g),
  ].map((match) => match[1] ?? "");
  assert.ok(
    routerModules.length > 0,
    "Der Server muss weiterhin Router registrieren",
  );
  assert.ok(!routerModules.includes("finance"));

  // Jeder registrierte Router muss weiterhin existieren: keine hängenden
  // Importe und keine stillschweigend entfernten Fremdmodule.
  for (const moduleName of routerModules) {
    await access(
      path.join(sourceDirectory, "modules", moduleName, "router.ts"),
    );
  }
  const registeredFactories =
    serverSource.match(/create[A-Za-z]+Router\(/g) ?? [];
  assert.ok(registeredFactories.length >= routerModules.length);

  await assert.rejects(
    access(path.join(sourceDirectory, "modules", "finance")),
    "Das Finanzmodul darf nicht mehr existieren",
  );
});

test("stillgelegte Finanzpfade liefern 404 und keine Schreibroute", async (t) => {
  const moduleRouter = Router();
  moduleRouter.get("/synthetic-ping", (_request, response) =>
    response.status(204).end(),
  );
  const application = createApplication({
    logger: new SilentLogger(),
    readinessProbe: { check: async () => undefined },
    webOrigin: "http://127.0.0.1:5173",
    moduleRouters: [moduleRouter],
  });
  const { server, baseUrl } = await listen(application);
  t.after(() => close(server));

  const requests: Array<{ method: string; route: string }> = [
    { method: "GET", route: "/finance?from=2032-01-01&to=2032-12-31" },
    { method: "GET", route: "/finance/export?from=2032-01-01&to=2032-12-31" },
    { method: "POST", route: "/finance/categories" },
    { method: "PATCH", route: "/finance/categories/synthetisch" },
    { method: "POST", route: "/finance/transactions" },
    { method: "PATCH", route: "/finance/transactions/synthetisch" },
    { method: "POST", route: "/finance/budgets" },
    { method: "PATCH", route: "/finance/budgets/synthetisch" },
  ];

  for (const request of requests) {
    const response = await fetch(`${baseUrl}/api/v1${request.route}`, {
      method: request.method,
      headers: {
        "content-type": "application/json",
        cookie: "lifeos_session=synthetisch",
      },
      ...(request.method === "GET"
        ? {}
        : {
            body: JSON.stringify({
              name: "synthetische-kategorie",
              amountMinor: 100,
            }),
          }),
    });
    const label = `${request.method} ${request.route}`;
    const body = (await response.json()) as {
      error?: { version?: string; code?: string };
    };
    assert.equal(response.status, 404, label);
    assert.equal(body.error?.code, "NOT_FOUND", label);
    assert.match(response.headers.get("content-type") ?? "", /json/, label);
  }

  // Gegenprobe: eine registrierte Route bleibt im selben Aufbau bedienbar.
  assert.equal((await fetch(`${baseUrl}/api/v1/synthetic-ping`)).status, 204);
  assert.equal((await fetch(`${baseUrl}/api/v1/health`)).status, 200);
});
