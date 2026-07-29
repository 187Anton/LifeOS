import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";

import { ApiError } from "../src/errors.js";
import { createApplication } from "../src/application.js";
import type { Logger } from "../src/logger.js";
import { createDashboardRouter } from "../src/modules/dashboard/router.js";
import type { DashboardService } from "../src/modules/dashboard/service.js";
import type { AuthenticationService } from "../src/modules/profile/service.js";

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

test("schützt den lesenden Dashboard-Endpunkt mit der lokalen Sitzung", async (t) => {
  const authentication = {
    authenticate: async (token: string | undefined) => {
      if (token === "synthetic-session") return "owner";
      throw new ApiError(
        401,
        "UNAUTHORIZED",
        "Eine lokale Anmeldung ist erforderlich.",
      );
    },
  } as AuthenticationService;
  const dashboard = {
    getSnapshot: async (userId: string) => ({
      generatedAt: "2032-05-01T00:00:00.000Z",
      timezone: "Europe/Berlin",
      tasks: [],
      events: [],
      projects: [{ id: userId, title: "Projekt", openTaskCount: 1 }],
    }),
  } as unknown as DashboardService;
  const application = createApplication({
    logger: new SilentLogger(),
    readinessProbe: { check: async () => undefined },
    webOrigin: "http://127.0.0.1:5173",
    moduleRouters: [createDashboardRouter({ authentication, dashboard })],
  });
  const server = createServer(application);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => close(server));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/api/v1/dashboard`;

  assert.equal((await fetch(url)).status, 401);
  const response = await fetch(url, {
    headers: { cookie: "lifeos_session=synthetic-session" },
  });
  assert.equal(response.status, 200);
  assert.equal(
    ((await response.json()) as { projects: Array<{ id: string }> }).projects[0]
      ?.id,
    "owner",
  );
});
