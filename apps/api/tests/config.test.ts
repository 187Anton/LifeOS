import assert from "node:assert/strict";
import test from "node:test";

import {
  ConfigurationError,
  parseConfig,
  useSecureCookies,
} from "../src/config.js";

const validEnvironment = {
  NODE_ENV: "test",
  API_HOST: "127.0.0.1",
  API_PORT: "3000",
  DATABASE_URL: "postgresql://lifeos:synthetic@127.0.0.1:5432/lifeos",
  WEB_ORIGIN: "http://localhost:5173",
  STORAGE_PATH: "/private/tmp/lifeos-synthetic-documents",
  LOG_LEVEL: "warn",
  SHUTDOWN_TIMEOUT_MS: "5000",
};

test("liest eine gültige lokale API-Konfiguration", () => {
  const config = parseConfig(validEnvironment);

  assert.deepEqual(config, {
    nodeEnv: "test",
    host: "127.0.0.1",
    port: 3000,
    databaseProvider: "postgresql",
    databaseUrl: validEnvironment.DATABASE_URL,
    webOrigin: validEnvironment.WEB_ORIGIN,
    storagePath: validEnvironment.STORAGE_PATH,
    logLevel: "warn",
    shutdownTimeoutMs: 5000,
    sessionTtlHours: 24,
  });
});

test("akzeptiert eine absolute lokale SQLite-Datei", () => {
  const databaseUrl = "file:/private/tmp/lifeos-api-test.sqlite";
  const config = parseConfig({
    ...validEnvironment,
    DATABASE_URL: databaseUrl,
  });

  assert.equal(config.databaseProvider, "sqlite");
  assert.equal(config.databaseUrl, databaseUrl);
});

test("akzeptiert absolute Ressourcenpfade der Desktop-App", () => {
  const config = parseConfig({
    ...validEnvironment,
    WEB_DIST_PATH: "/Applications/LifeOS.app/Contents/Resources/web",
    SQLITE_MIGRATIONS_PATH:
      "/Applications/LifeOS.app/Contents/Resources/sqlite-migrations",
  });

  assert.equal(
    config.webDistPath,
    "/Applications/LifeOS.app/Contents/Resources/web",
  );
  assert.equal(
    config.sqliteMigrationsPath,
    "/Applications/LifeOS.app/Contents/Resources/sqlite-migrations",
  );
});

test("weist relative Desktop-Ressourcenpfade zurück", () => {
  assert.throws(
    () =>
      parseConfig({
        ...validEnvironment,
        WEB_DIST_PATH: "apps/web/dist",
        SQLITE_MIGRATIONS_PATH: "packages/database/prisma/sqlite/migrations",
      }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigurationError);
      assert.deepEqual(error.fields, [
        "SQLITE_MIGRATIONS_PATH",
        "WEB_DIST_PATH",
      ]);
      return true;
    },
  );
});

test("weist ein relatives Dokumentenverzeichnis zurück", () => {
  assert.throws(
    () => parseConfig({ ...validEnvironment, STORAGE_PATH: "./documents" }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigurationError);
      assert.deepEqual(error.fields, ["STORAGE_PATH"]);
      return true;
    },
  );
});

test("weist relative SQLite-Pfade zurück", () => {
  assert.throws(
    () =>
      parseConfig({
        ...validEnvironment,
        DATABASE_URL: "file:./lifeos.sqlite",
      }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigurationError);
      assert.deepEqual(error.fields, ["DATABASE_URL"]);
      return true;
    },
  );
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
      assert.deepEqual(error.fields, ["DATABASE_URL", "STORAGE_PATH"]);
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

test("setzt sichere Cookies nur an einem HTTPS-Ursprung", () => {
  assert.equal(useSecureCookies("http://127.0.0.1:3000"), false);
  assert.equal(useSecureCookies("https://lifeos.example.test"), true);
});
