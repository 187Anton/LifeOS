import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApplication } from "../src/application.js";
import type { ApiConfig } from "../src/config.js";
import { startApiServer } from "../src/http-server.js";
import type { Logger } from "../src/logger.js";

class SilentLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

test("startet und beendet HTTP-Server und Datenbankverbindung kontrolliert", async () => {
  const logger = new SilentLogger();
  let disconnected = 0;
  const application = createApplication({
    logger,
    readinessProbe: { check: async () => undefined },
    webOrigin: "http://localhost:5173",
  });
  const config: ApiConfig = {
    nodeEnv: "test",
    host: "127.0.0.1",
    port: 0,
    databaseUrl: "postgresql://unused:unused@127.0.0.1:5432/unused",
    webOrigin: "http://localhost:5173",
    logLevel: "error",
    shutdownTimeoutMs: 1000,
    sessionTtlHours: 24,
  };

  const running = await startApiServer({
    application,
    config,
    logger,
    disconnect: async () => {
      disconnected += 1;
    },
  });
  assert.ok(running.server.listening);

  await Promise.all([running.shutdown("test"), running.shutdown("test")]);
  assert.equal(running.server.listening, false);
  assert.equal(disconnected, 1);
});

test("meldet einen belegten Port als verständlichen Startfehler", async () => {
  const logger = new SilentLogger();
  const application = createApplication({
    logger,
    readinessProbe: { check: async () => undefined },
    webOrigin: "http://localhost:5173",
  });
  const baseConfig: ApiConfig = {
    nodeEnv: "test",
    host: "127.0.0.1",
    port: 0,
    databaseUrl: "postgresql://unused:unused@127.0.0.1:5432/unused",
    webOrigin: "http://localhost:5173",
    logLevel: "error",
    shutdownTimeoutMs: 1000,
    sessionTtlHours: 24,
  };
  const first = await startApiServer({
    application,
    config: baseConfig,
    logger,
    disconnect: async () => undefined,
  });

  try {
    const port = (first.server.address() as AddressInfo).port;
    await assert.rejects(
      () =>
        startApiServer({
          application,
          config: { ...baseConfig, port },
          logger,
          disconnect: async () => undefined,
        }),
      (error: unknown) => {
        assert.ok(error && typeof error === "object" && "code" in error);
        assert.equal(error.code, "EADDRINUSE");
        return true;
      },
    );
  } finally {
    await first.shutdown("test");
  }
});
