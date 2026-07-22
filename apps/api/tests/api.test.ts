import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";

import { Router, type Express } from "express";
import { z } from "zod";

import { createApplication } from "../src/application.js";
import type { LogFields, Logger } from "../src/logger.js";
import { validateRequest } from "../src/middleware/validate-request.js";

interface CapturedLog {
  level: string;
  event: string;
  fields: LogFields;
}

class CapturingLogger implements Logger {
  readonly records: CapturedLog[] = [];

  debug(event: string, fields: LogFields = {}): void {
    this.records.push({ level: "debug", event, fields });
  }

  info(event: string, fields: LogFields = {}): void {
    this.records.push({ level: "info", event, fields });
  }

  warn(event: string, fields: LogFields = {}): void {
    this.records.push({ level: "warn", event, fields });
  }

  error(event: string, fields: LogFields = {}): void {
    this.records.push({ level: "error", event, fields });
  }
}

const listen = async (
  application: Express,
): Promise<{ server: Server; baseUrl: string }> => {
  const server = createServer(application);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

const close = async (server: Server): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
};

test("liefert Health und eine erfolgreiche Datenbank-Readiness", async (t) => {
  const logger = new CapturingLogger();
  let checks = 0;
  const application = createApplication({
    logger,
    readinessProbe: {
      async check() {
        checks += 1;
      },
    },
    webOrigin: "http://localhost:5173",
  });
  const { server, baseUrl } = await listen(application);
  t.after(() => close(server));

  const health = await fetch(`${baseUrl}/api/v1/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { apiVersion: "v1", status: "ok" });
  assert.match(health.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/);

  const preflight = await fetch(`${baseUrl}/api/v1/health`, {
    method: "OPTIONS",
    headers: { origin: "http://localhost:5173" },
  });
  assert.equal(preflight.status, 204);
  assert.equal(
    preflight.headers.get("access-control-allow-origin"),
    "http://localhost:5173",
  );
  assert.equal(
    preflight.headers.get("access-control-allow-credentials"),
    "true",
  );

  const readiness = await fetch(`${baseUrl}/api/v1/readiness`);
  assert.equal(readiness.status, 200);
  assert.deepEqual(await readiness.json(), {
    apiVersion: "v1",
    status: "ready",
    checks: { database: "up" },
  });
  assert.equal(checks, 1);
});

test("meldet eine nicht erreichbare Datenbank als 503", async (t) => {
  const application = createApplication({
    logger: new CapturingLogger(),
    readinessProbe: {
      async check() {
        throw new Error("synthetisch nicht erreichbar");
      },
    },
    webOrigin: "http://localhost:5173",
  });
  const { server, baseUrl } = await listen(application);
  t.after(() => close(server));

  const response = await fetch(`${baseUrl}/api/v1/readiness`);
  const body = (await response.json()) as {
    error: { version: string; code: string; requestId: string };
  };

  assert.equal(response.status, 503);
  assert.equal(body.error.version, "1");
  assert.equal(body.error.code, "SERVICE_NOT_READY");
  assert.ok(body.error.requestId);
});

test("liefert für unbekannte Routen, Eingaben und JSON das versionierte Fehlerformat", async (t) => {
  const logger = new CapturingLogger();
  const moduleRouter = Router();
  moduleRouter.post(
    "/synthetic-input",
    validateRequest({
      body: z.strictObject({ title: z.string().trim().min(1) }),
    }),
    (_request, response) => response.status(204).end(),
  );
  const application = createApplication({
    logger,
    readinessProbe: { check: async () => undefined },
    webOrigin: "http://localhost:5173",
    moduleRouters: [moduleRouter],
  });
  const { server, baseUrl } = await listen(application);
  t.after(() => close(server));

  const notFound = await fetch(`${baseUrl}/api/v1/persoenlicher-inhalt`);
  const notFoundBody = (await notFound.json()) as { error: { code: string } };
  assert.equal(notFound.status, 404);
  assert.equal(notFoundBody.error.code, "NOT_FOUND");
  assert.doesNotMatch(JSON.stringify(logger.records), /persoenlicher-inhalt/);

  const invalidQuery = await fetch(`${baseUrl}/api/v1/health?unerwartet=1`);
  const invalidQueryBody = (await invalidQuery.json()) as {
    error: { code: string; details: Array<{ field: string }> };
  };
  assert.equal(invalidQuery.status, 400);
  assert.equal(invalidQueryBody.error.code, "VALIDATION_ERROR");
  assert.equal(invalidQueryBody.error.details[0]?.field, "query");

  const invalidBody = await fetch(`${baseUrl}/api/v1/synthetic-input`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "", extra: true }),
  });
  assert.equal(invalidBody.status, 400);

  const invalidJson = await fetch(`${baseUrl}/api/v1/synthetic-input`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{ungültig",
  });
  const invalidJsonBody = (await invalidJson.json()) as {
    error: { code: string };
  };
  assert.equal(invalidJson.status, 400);
  assert.equal(invalidJsonBody.error.code, "INVALID_JSON");
});

test("verbirgt unerwartete Fehler und protokolliert weder Body noch Header", async (t) => {
  const logger = new CapturingLogger();
  const moduleRouter = Router();
  moduleRouter.post("/synthetic-error", () => {
    throw new Error("privater-fehlerinhalt");
  });
  const application = createApplication({
    logger,
    readinessProbe: { check: async () => undefined },
    webOrigin: "http://localhost:5173",
    moduleRouters: [moduleRouter],
  });
  const { server, baseUrl } = await listen(application);
  t.after(() => close(server));

  const response = await fetch(`${baseUrl}/api/v1/synthetic-error`, {
    method: "POST",
    headers: {
      authorization: "Bearer synthetisches-secret",
      "content-type": "application/json",
    },
    body: JSON.stringify({ password: "synthetisches-passwort" }),
  });
  const responseText = await response.text();
  const serializedLogs = JSON.stringify(logger.records);

  assert.equal(response.status, 500);
  assert.match(responseText, /INTERNAL_ERROR/);
  assert.doesNotMatch(responseText, /privater-fehlerinhalt/);
  assert.doesNotMatch(serializedLogs, /synthetisches-secret/);
  assert.doesNotMatch(serializedLogs, /synthetisches-passwort/);
  assert.doesNotMatch(serializedLogs, /privater-fehlerinhalt/);
  assert.ok(
    logger.records.some((record) => record.event === "http.request.failed"),
  );
});
