import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createDatabaseClient } from "@lifeos/database";
import type {
  WorkContextResponse,
  WorkOverviewResponse,
  WorkProjectResponse,
  WorkTaskLinkResponse,
  WorkTimeEntryResponse,
} from "@lifeos/contracts";
import { config as loadEnvironment } from "dotenv";
import { createApplication } from "../src/application.js";
import type { Logger } from "../src/logger.js";
import { PrismaProfileRepository } from "../src/modules/profile/repository.js";
import { createProfileRouter } from "../src/modules/profile/router.js";
import {
  AuthenticationService,
  ProfileService,
} from "../src/modules/profile/service.js";
import { hashPassword } from "../src/modules/profile/security.js";
import { PrismaWorkRepository } from "../src/modules/work/repository.js";
import { createWorkRouter } from "../src/modules/work/router.js";
import { WorkService } from "../src/modules/work/service.js";

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
const close = (server: Server) =>
  new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );

test("verwaltet mehrere Arbeitsbereiche mit Besitzprüfung und getrennten Zeitarten", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalId = `work-owner-${suffix}`;
  const otherExternalId = `work-other-${suffix}`;
  const password = `synthetisches-arbeitspasswort-${suffix}`;
  const owner = await database.user.create({
    data: {
      externalId,
      displayName: "Synthetische Arbeitsperson",
      settings: { create: {} },
      credential: { create: { passwordHash: await hashPassword(password) } },
    },
  });
  const other = await database.user.create({
    data: {
      externalId: otherExternalId,
      displayName: "Andere synthetische Person",
      settings: { create: {} },
    },
  });
  const foreignTask = await database.task.create({
    data: { userId: other.id, title: "Fremde Arbeitsaufgabe", area: "work" },
  });
  const profileRepository = new PrismaProfileRepository(database, externalId);
  const authentication = new AuthenticationService(profileRepository, 1);
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
      createWorkRouter({
        authentication,
        work: new WorkService(new PrismaWorkRepository(database)),
      }),
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
  assert.equal((await fetch(`${base}/work`)).status, 401);
  const login = await fetch(`${base}/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";", 1)[0] ?? "";
  const headers = { cookie, "content-type": "application/json" };
  const createContext = async (title: string) => {
    const response = await fetch(`${base}/work/contexts`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title,
        role: "Synthetische Rolle",
        startsOn: "2032-01-01",
        timezone: "Europe/Berlin",
        status: "active",
      }),
    });
    assert.equal(response.status, 201);
    return response.json() as Promise<WorkContextResponse>;
  };
  const practice = await createContext("Synthetische Praxisphase");
  const volunteering = await createContext("Synthetisches Ehrenamt");
  assert.equal(practice.ownerId, owner.id);
  assert.notEqual(practice.id, volunteering.id);

  const projectResponse = await fetch(`${base}/work/projects`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      contextId: practice.id,
      title: "Synthetisches Verbesserungsprojekt",
      goal: "Nachvollziehbarer Testfortschritt",
      deadlineDate: "2032-06-30",
    }),
  });
  assert.equal(projectResponse.status, 201);
  const project = (await projectResponse.json()) as WorkProjectResponse;
  assert.equal(project.deadlineDate, "2032-06-30");

  const task = await database.task.create({
    data: {
      userId: owner.id,
      title: "Synthetische Praxisaufgabe",
      area: "work",
    },
  });
  const linked = await fetch(`${base}/work/task-links`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      contextId: practice.id,
      projectId: project.id,
      taskId: task.id,
    }),
  });
  assert.equal(linked.status, 201);
  assert.equal(((await linked.json()) as WorkTaskLinkResponse).taskId, task.id);
  const foreignLink = await fetch(`${base}/work/task-links`, {
    method: "POST",
    headers,
    body: JSON.stringify({ contextId: practice.id, taskId: foreignTask.id }),
  });
  assert.equal(foreignLink.status, 400);

  const createTime = async (
    kind: "planned" | "actual",
    title: string,
    startsAt: string,
    endsAt: string,
  ) => {
    const response = await fetch(`${base}/work/time-entries`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        contextId: practice.id,
        projectId: project.id,
        taskId: task.id,
        kind,
        title,
        startsAt,
        endsAt,
        timezone: "Europe/Berlin",
      }),
    });
    assert.equal(response.status, 201);
    return response.json() as Promise<WorkTimeEntryResponse>;
  };
  const planned = await createTime(
    "planned",
    "Synthetisch geplant",
    "2032-10-31T01:30:00+02:00",
    "2032-10-31T02:30:00+01:00",
  );
  const actual = await createTime(
    "actual",
    "Synthetisch tatsächlich",
    "2032-11-01T09:00:00+01:00",
    "2032-11-01T10:00:00+01:00",
  );
  assert.equal(planned.durationMinutes, 120);
  assert.equal(actual.durationMinutes, 60);
  assert.notEqual(planned.kind, actual.kind);

  const filtered = await fetch(
    `${base}/work?contextId=${practice.id}&status=active&from=2032-10-01T00:00:00%2B02:00&to=2032-11-02T00:00:00%2B01:00`,
    { headers: { cookie } },
  );
  assert.equal(filtered.status, 200);
  const overview = (await filtered.json()) as WorkOverviewResponse;
  assert.equal(overview.contexts.length, 1);
  assert.equal(overview.timeEntries.length, 2);
  assert.ok(
    overview.history.some((event) => event.action === "work.task-linked"),
  );
  assert.equal(
    JSON.stringify(overview.history).includes("Synthetisch tatsächlich"),
    false,
  );

  const archived = await fetch(`${base}/work/contexts/${practice.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ archived: true }),
  });
  assert.equal(archived.status, 200);
  assert.ok(((await archived.json()) as WorkContextResponse).archivedAt);
});
