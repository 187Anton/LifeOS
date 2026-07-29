import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createDatabaseClient } from "@lifeos/database";
import type { ApiErrorResponse, TaskResponse } from "@lifeos/contracts";
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
import { PrismaTaskRepository } from "../src/modules/tasks/repository.js";
import { createTaskRouter } from "../src/modules/tasks/router.js";
import { TaskService } from "../src/modules/tasks/service.js";

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

test("verwaltet Aufgaben über /api/v1 mit Besitzprüfung und Audit", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalId = `task-owner-${suffix}`;
  const otherExternalId = `other-task-owner-${suffix}`;
  const password = `synthetisches-aufgabenpasswort-${suffix}`;
  const user = await database.user.create({
    data: {
      externalId,
      displayName: "Synthetische Aufgabenperson",
      settings: { create: {} },
      credential: { create: { passwordHash: await hashPassword(password) } },
    },
  });
  const otherUser = await database.user.create({
    data: {
      externalId: otherExternalId,
      displayName: "Andere synthetische Person",
      settings: { create: {} },
    },
  });
  const project = await database.project.create({
    data: {
      userId: user.id,
      title: "Synthetisches Aufgabenprojekt",
    },
  });
  const foreignProject = await database.project.create({
    data: {
      userId: otherUser.id,
      title: "Fremdes synthetisches Projekt",
    },
  });
  const foreignParent = await database.task.create({
    data: {
      userId: otherUser.id,
      title: "Fremde Aufgabe",
    },
  });
  const profileRepository = new PrismaProfileRepository(database, externalId);
  const authentication = new AuthenticationService(profileRepository, 1);
  const tasks = new TaskService(new PrismaTaskRepository(database));
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
      createTaskRouter({ authentication, tasks }),
    ],
  });
  const server = createServer(application);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
  t.after(async () => {
    await close(server);
    await database.user.deleteMany({
      where: { externalId: { in: [externalId, otherExternalId] } },
    });
    await database.$disconnect();
  });

  assert.equal((await fetch(`${baseUrl}/tasks`)).status, 401);

  const login = await fetch(`${baseUrl}/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  assert.equal(login.status, 201);
  const cookie = (login.headers.get("set-cookie") ?? "").split(";", 1)[0] ?? "";
  const jsonHeaders = { cookie, "content-type": "application/json" };

  const invalid = await fetch(`${baseUrl}/tasks`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      title: "Ungültige Aufgabe",
      scheduledStartAt: "2032-02-03T09:00:00+01:00",
      estimatedDurationMinutes: 0,
    }),
  });
  assert.equal(invalid.status, 400);
  const invalidBody = (await invalid.json()) as ApiErrorResponse;
  assert.equal(invalidBody.error.code, "VALIDATION_ERROR");

  const foreignParentResponse = await fetch(`${baseUrl}/tasks`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      title: "Unzulässige Unteraufgabe",
      parentTaskId: foreignParent.id,
    }),
  });
  assert.equal(foreignParentResponse.status, 400);

  const foreignProjectResponse = await fetch(`${baseUrl}/tasks`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      title: "Unzulässige Projektaufgabe",
      projectId: foreignProject.id,
    }),
  });
  assert.equal(foreignProjectResponse.status, 400);

  const createResponse = await fetch(`${baseUrl}/tasks`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      title: "Roadmap prüfen",
      description: "Synthetischer Integrationstest",
      priority: "high",
      dueDate: "2032-02-05",
      scheduledStartAt: "2032-02-03T09:00:00+01:00",
      scheduledStartTimezone: "Europe/Berlin",
      estimatedDurationMinutes: 75,
      tags: ["organisation", "test"],
      area: "projects",
      projectId: project.id,
    }),
  });
  assert.equal(createResponse.status, 201);
  const created = (await createResponse.json()) as TaskResponse;
  assert.equal(created.ownerId, user.id);
  assert.equal(created.dueDate, "2032-02-05");
  assert.equal(created.scheduledStartAt, "2032-02-03T08:00:00.000Z");
  assert.equal(created.projectId, project.id);

  const selfParent = await fetch(`${baseUrl}/tasks/${created.id}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify({ parentTaskId: created.id }),
  });
  assert.equal(selfParent.status, 409);

  const complete = await fetch(`${baseUrl}/tasks/${created.id}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify({ status: "done" }),
  });
  assert.equal(complete.status, 200);
  const completed = (await complete.json()) as TaskResponse;
  assert.equal(completed.status, "done");
  assert.ok(completed.completedAt);

  const filtered = (await (
    await fetch(`${baseUrl}/tasks?status=done&priority=high&area=projects`, {
      headers: { cookie },
    })
  ).json()) as TaskResponse[];
  assert.deepEqual(
    filtered.map((task) => task.id),
    [created.id],
  );

  const archive = await fetch(`${baseUrl}/tasks/${created.id}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify({ archived: true }),
  });
  assert.equal(archive.status, 200);
  assert.equal(
    ((await archive.json()) as TaskResponse).archivedAt === null,
    false,
  );
  assert.deepEqual(
    (await (
      await fetch(`${baseUrl}/tasks`, { headers: { cookie } })
    ).json()) as TaskResponse[],
    [],
  );
  assert.equal(
    (
      (await (
        await fetch(`${baseUrl}/tasks?includeArchived=true`, {
          headers: { cookie },
        })
      ).json()) as TaskResponse[]
    ).length,
    1,
  );

  assert.equal(
    (
      await fetch(`${baseUrl}/tasks/${created.id}`, {
        method: "DELETE",
        headers: { cookie },
      })
    ).status,
    204,
  );
  assert.equal(
    (
      await fetch(`${baseUrl}/tasks/${created.id}`, {
        headers: { cookie },
      })
    ).status,
    404,
  );

  const auditActions = await database.auditEvent.findMany({
    where: { userId: user.id, entityType: "Task" },
    select: { action: true },
  });
  assert.deepEqual(
    new Set(auditActions.map((event) => event.action)),
    new Set(["task.created", "task.updated", "task.deleted"]),
  );
});
