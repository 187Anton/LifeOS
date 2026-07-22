import assert from "node:assert/strict";
import test from "node:test";

import { ConfigurationError, parseConfig } from "../src/config.js";

const validEnvironment = {
  NODE_ENV: "test",
  API_HOST: "127.0.0.1",
  API_PORT: "3000",
  DATABASE_URL: "postgresql://lifeos:synthetic@127.0.0.1:5432/lifeos",
  WEB_ORIGIN: "http://localhost:5173",
  LOG_LEVEL: "warn",
  SHUTDOWN_TIMEOUT_MS: "5000",
};

test("liest eine gültige lokale API-Konfiguration", () => {
  const config = parseConfig(validEnvironment);

  assert.deepEqual(config, {
    nodeEnv: "test",
    host: "127.0.0.1",
    port: 3000,
    databaseUrl: validEnvironment.DATABASE_URL,
    webOrigin: validEnvironment.WEB_ORIGIN,
    logLevel: "warn",
    shutdownTimeoutMs: 5000,
    sessionTtlHours: 24,
  });
});

test("meldet fehlende Pflichtwerte ohne deren Inhalte auszugeben", () => {
  assert.throws(
    () =>
      parseConfig({
        API_PORT: "3000",
        WEB_ORIGIN: validEnvironment.WEB_ORIGIN,
      }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigurationError);
      assert.deepEqual(error.fields, ["DATABASE_URL"]);
      assert.doesNotMatch(error.message, /synthetic/);
      return true;
    },
  );
});

test("weist ungültige Ports und Origins verständlich zurück", () => {
  assert.throws(
    () =>
      parseConfig({
        ...validEnvironment,
        API_PORT: "70000",
        WEB_ORIGIN: "kein-url-wert",
      }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigurationError);
      assert.deepEqual(error.fields, ["API_PORT", "WEB_ORIGIN"]);
      return true;
    },
  );
});
