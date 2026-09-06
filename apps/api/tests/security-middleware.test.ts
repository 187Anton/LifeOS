import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";

import type { Express } from "express";
import { Router } from "express";

import { createApplication } from "../src/application.js";
import type { Logger } from "../src/logger.js";

class SilentLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
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

const close = (server: Server) =>
  new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );

test("setzt Sicherheitsheader und blockiert fremde Browser-Ursprünge", async (t) => {
  let writes = 0;
  const router = Router();
  router.post("/synthetic-write", (_request, response) => {
    writes += 1;
    response.status(204).end();
  });
  const application = createApplication({
    logger: new SilentLogger(),
    readinessProbe: { check: async () => undefined },
    webOrigin: "http://127.0.0.1:5173",
    moduleRouters: [router],
  });
  const { server, baseUrl } = await listen(application);
  t.after(() => close(server));

  const health = await fetch(`${baseUrl}/api/v1/health`);
  assert.equal(health.headers.get("x-content-type-options"), "nosniff");
  assert.equal(health.headers.get("x-frame-options"), "DENY");
  assert.equal(health.headers.get("referrer-policy"), "no-referrer");
  assert.equal(
    health.headers.get("permissions-policy"),
    "camera=(), microphone=(), geolocation=()",
  );
  assert.match(
    health.headers.get("content-security-policy") ?? "",
    /default-src 'self'.*object-src 'none'.*script-src 'self'/,
  );
  assert.equal(health.headers.get("cache-control"), "private, no-store");

  const blocked = await fetch(`${baseUrl}/api/v1/synthetic-write`, {
    method: "POST",
    headers: { origin: "http://127.0.0.1:7331" },
  });
  assert.equal(blocked.status, 403);
  assert.equal(
    ((await blocked.json()) as { error: { code: string } }).error.code,
    "FORBIDDEN",
  );
  assert.equal(writes, 0);

  const trusted = await fetch(`${baseUrl}/api/v1/synthetic-write`, {
    method: "POST",
    headers: { origin: "http://127.0.0.1:5173" },
  });
  assert.equal(trusted.status, 204);
  const localClient = await fetch(`${baseUrl}/api/v1/synthetic-write`, {
    method: "POST",
  });
  assert.equal(localClient.status, 204);
  assert.equal(writes, 2);
});
