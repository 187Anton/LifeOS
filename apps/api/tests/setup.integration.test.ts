import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createDatabaseClient } from "@lifeos/database";
import { config as loadEnvironment } from "dotenv";

import { createApplication } from "../src/application.js";
import type { Logger } from "../src/logger.js";
import { verifyPassword } from "../src/modules/profile/security.js";
import { PrismaSetupRepository } from "../src/modules/setup/repository.js";
import { createSetupRouter } from "../src/modules/setup/router.js";
import { SetupService } from "../src/modules/setup/service.js";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
loadEnvironment({
  path: path.resolve(testDirectory, "../../../.env"),
  quiet: true,
});

class SilentLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

const close = (server: Server): Promise<void> =>
  new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );

test("richtet ein leeres lokales Profil genau einmal ohne Klartextzugang ein", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalId = `setup-user-${suffix}`;
  const calendarExternalId = `setup-calendar-${suffix}`;
  const calDavUsername = `setup-caldav-${suffix}`;
  const repository = new PrismaSetupRepository(
    database,
    externalId,
    calendarExternalId,
    calDavUsername,
  );
  const application = createApplication({
    logger: new SilentLogger(),
    readinessProbe: { check: async () => undefined },
    webOrigin: "http://127.0.0.1:5173",
    moduleRouters: [createSetupRouter(new SetupService(repository))],
  });
  const server = createServer(application);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1/setup`;
  t.after(async () => {
    await close(server);
    await database.user.deleteMany({ where: { externalId } });
    await database.$disconnect();
  });

  const initial = await fetch(baseUrl);
  assert.equal(initial.status, 200);
  assert.deepEqual(await initial.json(), { required: true });

  const invalid = await fetch(baseUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      displayName: "Lokale Person",
      password: "zu-kurz",
      calDavPassword: "auch-kurz",
      timezone: "Europe/Berlin",
    }),
  });
  assert.equal(invalid.status, 400);

  const sharedPassword = `gemeinsam-${suffix}`;
  const reused = await fetch(baseUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      displayName: "Lokale Person",
      password: sharedPassword,
      calDavPassword: sharedPassword,
      timezone: "Europe/Berlin",
    }),
  });
  assert.equal(reused.status, 400);

  const password = `app-${suffix}`;
  const calDavPassword = `caldav-${suffix}`;
  const configured = await fetch(baseUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      displayName: "Lokale Person",
      password,
      calDavPassword,
      timezone: "Europe/Berlin",
    }),
  });
  assert.equal(configured.status, 201);
  assert.deepEqual(await configured.json(), { status: "configured" });

  const user = await database.user.findUniqueOrThrow({
    where: { externalId },
    include: {
      settings: true,
      credential: true,
      calDavCredential: true,
      calendars: true,
      auditEvents: true,
    },
  });
  assert.equal(user.displayName, "Lokale Person");
  assert.equal(user.settings?.timezone, "Europe/Berlin");
  assert.equal(user.calendars.length, 1);
  assert.equal(user.calendars[0]?.externalId, calendarExternalId);
  assert.equal(user.calendars[0]?.isPrimary, true);
  assert.equal(user.calDavCredential?.username, calDavUsername);
  assert.ok(user.credential);
  assert.ok(user.calDavCredential);
  assert.equal(
    await verifyPassword(password, user.credential.passwordHash),
    true,
  );
  assert.equal(
    await verifyPassword(calDavPassword, user.calDavCredential.passwordHash),
    true,
  );
  assert.notEqual(user.credential.passwordHash, password);
  assert.notEqual(user.calDavCredential.passwordHash, calDavPassword);
  assert.deepEqual(user.auditEvents[0]?.metadata, {
    source: "local-first-run",
    version: 1,
  });

  const completed = await fetch(baseUrl);
  assert.deepEqual(await completed.json(), { required: false });
  const repeated = await fetch(baseUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      displayName: "Andere Person",
      password: `anderes-${suffix}`,
      calDavPassword: `anderes-caldav-${suffix}`,
      timezone: "UTC",
    }),
  });
  assert.equal(repeated.status, 409);
  assert.equal(
    (await database.user.findUniqueOrThrow({ where: { externalId } }))
      .displayName,
    "Lokale Person",
  );
});
