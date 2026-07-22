import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";

import type { ProfileResponse, UpdateSettingsRequest } from "@lifeos/contracts";
import type { Express } from "express";

import { createApplication } from "../src/application.js";
import type { Logger } from "../src/logger.js";
import type {
  AuthenticationRepository,
  ProfileRepository,
  StoredCredential,
} from "../src/modules/profile/repository.js";
import { createProfileRouter } from "../src/modules/profile/router.js";
import {
  AuthenticationService,
  ProfileService,
} from "../src/modules/profile/service.js";
import { hashPassword } from "../src/modules/profile/security.js";

class SilentLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

class InMemoryProfileRepository
  implements AuthenticationRepository, ProfileRepository
{
  credential: StoredCredential | null = null;
  readonly sessions = new Map<
    string,
    { userId: string; revision: number; expiresAt: Date; revokedAt?: Date }
  >();
  auditCount = 0;
  profile: ProfileResponse = {
    id: "synthetic-user",
    displayName: "Lokale Testperson",
    settings: {
      timezone: "Europe/Berlin",
      locale: "de-DE",
      currencyCode: "EUR",
      weekStartsOn: 1,
      defaultCalendarView: "week",
      showWeekends: true,
    },
  };

  async findLocalCredential(): Promise<StoredCredential | null> {
    return this.credential;
  }

  async createSession(input: {
    userId: string;
    tokenHash: string;
    credentialRevision: number;
    expiresAt: Date;
  }): Promise<void> {
    this.sessions.set(input.tokenHash, {
      userId: input.userId,
      revision: input.credentialRevision,
      expiresAt: input.expiresAt,
    });
  }

  async findAuthenticatedUser(
    tokenHash: string,
    now: Date,
  ): Promise<string | null> {
    const session = this.sessions.get(tokenHash);
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.revision !== this.credential?.revision
    ) {
      return null;
    }
    return session.userId;
  }

  async revokeSession(tokenHash: string, now: Date): Promise<void> {
    const session = this.sessions.get(tokenHash);
    if (session) session.revokedAt = now;
  }

  async getProfile(userId: string): Promise<ProfileResponse | null> {
    return userId === this.profile.id ? structuredClone(this.profile) : null;
  }

  async updateSettings(
    userId: string,
    changes: UpdateSettingsRequest,
  ): Promise<ProfileResponse> {
    assert.equal(userId, this.profile.id);
    this.profile.settings = { ...this.profile.settings, ...changes };
    this.auditCount += 1;
    return structuredClone(this.profile);
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
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
};

test("schützt Profil und Einstellungen mit widerrufbarer lokaler Sitzung", async (t) => {
  const repository = new InMemoryProfileRepository();
  repository.credential = {
    userId: repository.profile.id,
    passwordHash: await hashPassword("synthetisches-testpasswort"),
    revision: 1,
  };
  const authentication = new AuthenticationService(repository, 1);
  const application = createApplication({
    logger: new SilentLogger(),
    readinessProbe: { check: async () => undefined },
    webOrigin: "http://localhost:5173",
    moduleRouters: [
      createProfileRouter({
        authentication,
        profile: new ProfileService(repository),
        secureCookies: false,
      }),
    ],
  });
  const { server, baseUrl } = await listen(application);
  t.after(() => close(server));

  const unauthorized = await fetch(`${baseUrl}/api/v1/profile`);
  assert.equal(unauthorized.status, 401);

  const wrongPassword = await fetch(`${baseUrl}/api/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "falsch" }),
  });
  assert.equal(wrongPassword.status, 401);

  const login = await fetch(`${baseUrl}/api/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "synthetisches-testpasswort" }),
  });
  assert.equal(login.status, 201);
  const setCookie = login.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";", 1)[0] ?? "";
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.doesNotMatch(await login.text(), /lifeos_session/);
  const rawToken = cookie.split("=", 2)[1] ?? "";
  assert.ok(rawToken);
  assert.ok([...repository.sessions.keys()].every((hash) => hash !== rawToken));

  const profile = await fetch(`${baseUrl}/api/v1/profile`, {
    headers: { cookie },
  });
  assert.equal(profile.status, 200);
  assert.equal(
    ((await profile.json()) as ProfileResponse).settings.timezone,
    "Europe/Berlin",
  );

  const invalidUpdate = await fetch(`${baseUrl}/api/v1/settings`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ timezone: "Mars/Olympus", weekStartsOn: 9 }),
  });
  assert.equal(invalidUpdate.status, 400);

  const validUpdate = await fetch(`${baseUrl}/api/v1/settings`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      timezone: "UTC",
      locale: "en-US",
      currencyCode: "USD",
      weekStartsOn: 0,
      defaultCalendarView: "month",
      showWeekends: false,
    }),
  });
  assert.equal(validUpdate.status, 200);
  const updated = (await validUpdate.json()) as ProfileResponse;
  assert.equal(updated.settings.defaultCalendarView, "month");
  assert.equal(updated.settings.showWeekends, false);
  assert.equal(repository.auditCount, 1);

  const logout = await fetch(`${baseUrl}/api/v1/session`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(logout.status, 204);
  assert.match(
    logout.headers.get("set-cookie") ?? "",
    /Expires=Thu, 01 Jan 1970/,
  );
  assert.equal(
    (await fetch(`${baseUrl}/api/v1/profile`, { headers: { cookie } })).status,
    401,
  );
});
