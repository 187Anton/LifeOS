import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createDatabaseClient } from "@lifeos/database";
import type {
  GitHubConnectionResponse,
  GitHubIntegrationOverviewResponse,
  GitHubRepositoryListResponse,
  GitHubRepositorySnapshotResponse,
} from "@lifeos/contracts";
import { config as loadEnvironment } from "dotenv";

import { createApplication } from "../src/application.js";
import type { Logger } from "../src/logger.js";
import {
  GitHubNetworkError,
  type GitHubClientResult,
  type GitHubReadClient,
} from "../src/modules/github-integration/client.js";
import { PrismaGitHubIntegrationRepository } from "../src/modules/github-integration/repository.js";
import { createGitHubIntegrationRouter } from "../src/modules/github-integration/router.js";
import { GitHubIntegrationService } from "../src/modules/github-integration/service.js";
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

const rateLimit = { remaining: 4_999, resetAt: "2034-03-01T11:00:00.000Z" };
const repository = {
  id: "1001",
  owner: "synthetic-owner",
  name: "synthetic-repository",
  fullName: "synthetic-owner/synthetic-repository",
  description: "Nur synthetische Metadaten",
  private: true,
  archived: false,
  defaultBranch: "main",
  updatedAt: "2034-03-01T10:00:00.000Z",
};
const snapshot: GitHubRepositorySnapshotResponse = {
  repository,
  issues: [
    {
      number: 11,
      title: "Synthetisches Issue",
      state: "open",
      updatedAt: "2034-03-01T10:00:00.000Z",
    },
  ],
  pullRequests: [
    {
      number: 12,
      title: "Synthetischer Pull Request",
      state: "open",
      draft: false,
      updatedAt: "2034-03-01T10:00:00.000Z",
    },
  ],
  commits: [
    {
      sha: "a".repeat(40),
      message: "Synthetischer Commit",
      authoredAt: "2034-03-01T09:00:00.000Z",
      authorLogin: "synthetic-owner",
    },
  ],
  releases: [
    {
      tagName: "v1.0.0-test",
      name: "Synthetisches Release",
      draft: false,
      prerelease: true,
      publishedAt: "2034-03-01T08:00:00.000Z",
    },
  ],
  ciRuns: [
    {
      id: "5001",
      name: "Repository checks",
      status: "completed",
      conclusion: "success",
      headBranch: "main",
      updatedAt: "2034-03-01T10:00:00.000Z",
    },
  ],
  rateLimit,
};

class SyntheticGitHubClient implements GitHubReadClient {
  tokens: string[] = [];
  failure: GitHubNetworkError | null = null;
  private result<T>(token: string, data: T): GitHubClientResult<T> {
    this.tokens.push(token);
    if (this.failure) throw this.failure;
    return { data, rateLimit };
  }
  async getViewer(token: string) {
    return this.result(token, { login: "synthetic-owner" });
  }
  async listRepositories(token: string) {
    return this.result(token, [repository]);
  }
  async getRepositorySnapshot(token: string) {
    return this.result(token, snapshot);
  }
}

const close = (server: Server) =>
  new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );

test("liest GitHub-Metadaten optional, verschlüsselt und ohne Schreibaktion", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalId = `github-owner-${suffix}`;
  const otherExternalId = `github-other-${suffix}`;
  const password = `synthetic-app-${suffix}`;
  const token = `synthetic-github-token-${suffix}`;
  const owner = await database.user.create({
    data: {
      externalId,
      displayName: "Synthetische GitHub-Person",
      settings: { create: {} },
      credential: { create: { passwordHash: await hashPassword(password) } },
    },
  });
  const other = await database.user.create({
    data: {
      externalId: otherExternalId,
      displayName: "Andere GitHub-Person",
      settings: { create: {} },
    },
  });
  const profileRepository = new PrismaProfileRepository(database, externalId);
  const authentication = new AuthenticationService(profileRepository, 1);
  const client = new SyntheticGitHubClient();
  const githubRepository = new PrismaGitHubIntegrationRepository(database);
  const service = new GitHubIntegrationService(
    githubRepository,
    client,
    Buffer.alloc(32, 9).toString("base64"),
  );
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
      createGitHubIntegrationRouter({ authentication, github: service }),
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

  assert.equal((await fetch(`${base}/integrations/github`)).status, 401);
  const login = await fetch(`${base}/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";", 1)[0] ?? "";
  const headers = { cookie, "content-type": "application/json" };
  const overviewResponse = await fetch(`${base}/integrations/github`, {
    headers: { cookie },
  });
  assert.equal(
    overviewResponse.headers.get("cache-control"),
    "private, no-store",
  );
  const overview =
    (await overviewResponse.json()) as GitHubIntegrationOverviewResponse;
  assert.deepEqual(overview, {
    available: true,
    networkDefault: "disabled",
    mode: "read_only",
    apiHost: "api.github.com",
    connections: [],
  });
  const oversized = await fetch(`${base}/integrations/github`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Zu groß", token: "x".repeat(501) }),
  });
  assert.equal(oversized.status, 400);

  const createdResponse = await fetch(`${base}/integrations/github`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Synthetischer GitHub-Zugang", token }),
  });
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()) as GitHubConnectionResponse;
  assert.equal(created.enabled, false);
  assert.equal(created.readOnly, true);
  assert.equal(created.tokenConfigured, true);
  assert.equal("token" in created, false);
  const stored = await database.gitHubConnection.findUniqueOrThrow({
    where: { id: created.id },
  });
  assert.doesNotMatch(stored.tokenEncrypted, new RegExp(token));
  assert.equal(
    (
      await fetch(`${base}/integrations/github/${created.id}/test`, {
        method: "POST",
        headers,
      })
    ).status,
    409,
  );
  assert.equal(client.tokens.length, 0);

  assert.equal(
    (
      await fetch(`${base}/integrations/github/${created.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ enabled: true }),
      })
    ).status,
    200,
  );
  const tested = await fetch(`${base}/integrations/github/${created.id}/test`, {
    method: "POST",
    headers,
  });
  assert.equal(tested.status, 200);
  assert.deepEqual(client.tokens.at(-1), token);

  const repositories = (await (
    await fetch(`${base}/integrations/github/${created.id}/repositories`, {
      headers: { cookie },
    })
  ).json()) as GitHubRepositoryListResponse;
  assert.equal(repositories.repositories[0]?.fullName, repository.fullName);
  const details = (await (
    await fetch(
      `${base}/integrations/github/${created.id}/repositories/synthetic-owner/synthetic-repository`,
      { headers: { cookie } },
    )
  ).json()) as GitHubRepositorySnapshotResponse;
  assert.equal(details.issues[0]?.title, "Synthetisches Issue");
  assert.equal(details.pullRequests[0]?.number, 12);
  assert.equal(details.commits[0]?.message, "Synthetischer Commit");
  assert.equal(details.releases[0]?.tagName, "v1.0.0-test");
  assert.equal(details.ciRuns[0]?.conclusion, "success");
  assert.equal(
    await database.gitHubConnection.count({ where: { userId: owner.id } }),
    1,
  );

  client.failure = new GitHubNetworkError("RATE_LIMITED", {
    remaining: 0,
    resetAt: "2034-03-01T12:00:00.000Z",
  });
  const limited = await fetch(
    `${base}/integrations/github/${created.id}/repositories`,
    { headers: { cookie } },
  );
  assert.equal(limited.status, 429);
  const limitedBody = await limited.text();
  assert.match(limitedBody, /2034-03-01T12:00:00.000Z/);
  assert.doesNotMatch(limitedBody, new RegExp(token));
  client.failure = new GitHubNetworkError("PERMISSION_DENIED");
  assert.equal(
    (
      await fetch(`${base}/integrations/github/${created.id}/repositories`, {
        headers: { cookie },
      })
    ).status,
    403,
  );
  client.failure = null;
  assert.equal(
    (
      await fetch(`${base}/integrations/github/${randomUUID()}/repositories`, {
        headers: { cookie },
      })
    ).status,
    404,
  );
  await assert.rejects(service.test(other.id, created.id));
  const persisted = JSON.stringify({
    connections: await database.gitHubConnection.findMany({
      where: { userId: owner.id },
    }),
    audit: await database.auditEvent.findMany({ where: { userId: owner.id } }),
  });
  assert.doesNotMatch(persisted, /Synthetisches Issue/);
  assert.doesNotMatch(persisted, /Synthetischer Commit/);
  assert.doesNotMatch(persisted, new RegExp(token));

  await database.gitHubConnection.createMany({
    data: Array.from({ length: 4 }, (_, index) => ({
      id: randomUUID(),
      userId: owner.id,
      name: `Synthetischer GitHub-Zugang ${index + 2}`,
      tokenEncrypted: "synthetic-encrypted-token",
      secretIv: "synthetic-iv",
      secretTag: "synthetic-tag",
    })),
  });
  const overLimit = await fetch(`${base}/integrations/github`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Einer zu viel", token }),
  });
  assert.equal(overLimit.status, 422);

  assert.equal(
    (
      await fetch(`${base}/integrations/github/${created.id}`, {
        method: "DELETE",
        headers,
      })
    ).status,
    204,
  );
  assert.equal(
    await database.gitHubConnection.count({ where: { id: created.id } }),
    0,
  );
  assert.equal(
    (
      await fetch(`${base}/integrations/github/${created.id}/test`, {
        method: "POST",
        headers,
      })
    ).status,
    404,
  );
});

test("bleibt ohne lokalen Integrationsschlüssel vollständig deaktiviert", async () => {
  const database = createDatabaseClient();
  const service = new GitHubIntegrationService(
    new PrismaGitHubIntegrationRepository(database),
    new SyntheticGitHubClient(),
    undefined,
  );
  const overview = await service.overview(randomUUID());
  assert.equal(overview.available, false);
  await assert.rejects(
    service.create(randomUUID(), {
      name: "Nicht verfügbar",
      token: "synthetic-not-used-token",
    }),
    (error: unknown) =>
      error instanceof Error && /nicht konfiguriert/.test(error.message),
  );
  await database.$disconnect();
});
