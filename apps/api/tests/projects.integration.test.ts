import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createDatabaseClient } from "@lifeos/database";
import type { ProjectDetailResponse, ProjectResponse } from "@lifeos/contracts";
import { config as loadEnvironment } from "dotenv";
import { createApplication } from "../src/application.js";
import type { Logger } from "../src/logger.js";
import { PrismaProfileRepository } from "../src/modules/profile/repository.js";
import { createProfileRouter } from "../src/modules/profile/router.js";
import { hashPassword } from "../src/modules/profile/security.js";
import {
  AuthenticationService,
  ProfileService,
} from "../src/modules/profile/service.js";
import { PrismaProjectRepository } from "../src/modules/projects/repository.js";
import { createProjectRouter } from "../src/modules/projects/router.js";
import { ProjectService } from "../src/modules/projects/service.js";

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

test("verwaltet Projekte mit Besitzprüfung, reversibler Archivierung und unveränderten Verknüpfungsquellen", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalId = `project-owner-${suffix}`;
  const otherExternalId = `project-other-${suffix}`;
  const password = `synthetisches-projektpasswort-${suffix}`;
  const owner = await database.user.create({
    data: {
      externalId,
      displayName: "Synthetische Projektperson",
      settings: { create: {} },
      credential: { create: { passwordHash: await hashPassword(password) } },
    },
  });
  const other = await database.user.create({
    data: {
      externalId: otherExternalId,
      displayName: "Andere Projektperson",
      settings: { create: {} },
    },
  });
  const foreignProject = await database.project.create({
    data: { userId: other.id, title: "Fremdes Projekt" },
  });
  const foreignGoal = await database.projectGoal.create({
    data: {
      userId: other.id,
      projectId: foreignProject.id,
      title: "Fremdes Projektziel",
    },
  });
  const calendar = await database.calendar.create({
    data: {
      userId: owner.id,
      externalId: `project-calendar-${suffix}`,
      name: "Synthetischer Projektkalender",
      isPrimary: true,
    },
  });
  const event = await database.calendarEvent.create({
    data: {
      userId: owner.id,
      calendarId: calendar.id,
      uid: `project-event-${suffix}@lifeos.local`,
      title: "Unveränderter Projekttermin",
      startsAt: new Date("2032-05-01T08:00:00.000Z"),
      endsAt: new Date("2032-05-01T09:00:00.000Z"),
      etag: '"project-v1"',
    },
  });
  const task = await database.task.create({
    data: {
      userId: owner.id,
      title: "Synthetische Projektaufgabe",
      status: "done",
      completedAt: new Date("2032-04-01T00:00:00.000Z"),
    },
  });
  const foreignTask = await database.task.create({
    data: { userId: other.id, title: "Fremde Aufgabe" },
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
      createProjectRouter({
        authentication,
        projects: new ProjectService(new PrismaProjectRepository(database)),
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
  assert.equal((await fetch(`${base}/projects`)).status, 401);
  const login = await fetch(`${base}/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";", 1)[0] ?? "";
  const headers = { cookie, "content-type": "application/json" };
  assert.equal(
    (
      await fetch(`${base}/projects/${foreignProject.id}`, {
        headers: { cookie },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await fetch(
        `${base}/projects/${foreignProject.id}/goals/${foreignGoal.id}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({ status: "completed" }),
        },
      )
    ).status,
    404,
  );
  const createdResponse = await fetch(`${base}/projects`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: "Synthetisches Gesamtprojekt",
      description: "Keine echten Daten",
      status: "active",
      risk: "Synthetisches Risiko",
      dueDate: "2032-06-30",
    }),
  });
  assert.equal(createdResponse.status, 201);
  const project = (await createdResponse.json()) as ProjectResponse;
  assert.equal(project.ownerId, owner.id);
  assert.equal(project.dueDate, "2032-06-30");
  const goal = await fetch(`${base}/projects/${project.id}/goals`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: "Projektziel",
      status: "completed",
      dueDate: "2032-05-15",
    }),
  });
  const milestone = await fetch(`${base}/projects/${project.id}/milestones`, {
    method: "POST",
    headers,
    body: JSON.stringify({ title: "Projektmeilenstein", status: "open" }),
  });
  assert.equal(goal.status, 201);
  assert.equal(milestone.status, 201);
  const goalRecord = (await goal.json()) as { id: string };
  const milestoneRecord = (await milestone.json()) as { id: string };
  assert.equal(
    (
      await fetch(`${base}/projects/${project.id}/task-links`, {
        method: "POST",
        headers,
        body: JSON.stringify({ taskId: task.id }),
      })
    ).status,
    204,
  );
  assert.equal(
    (
      await fetch(`${base}/projects/${project.id}/task-links`, {
        method: "POST",
        headers,
        body: JSON.stringify({ taskId: foreignTask.id }),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(`${base}/projects/${project.id}/event-links`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          calendarId: calendar.externalId,
          eventUid: event.uid,
        }),
      })
    ).status,
    201,
  );
  const detail = (await (
    await fetch(`${base}/projects/${project.id}`, { headers: { cookie } })
  ).json()) as ProjectDetailResponse;
  assert.equal(detail.progress.percent, 67);
  assert.deepEqual(detail.progress.breakdown, {
    goals: { completed: 1, total: 1 },
    milestones: { completed: 0, total: 1 },
    tasks: { completed: 1, total: 1 },
  });
  assert.equal(detail.calendarEvents[0]?.etag, '"project-v1"');
  const unchangedEvent = await database.calendarEvent.findUniqueOrThrow({
    where: { id: event.id },
  });
  assert.equal(unchangedEvent.etag, '"project-v1"');
  assert.equal(unchangedEvent.title, "Unveränderter Projekttermin");
  const archivedGoal = await fetch(
    `${base}/projects/${project.id}/goals/${goalRecord.id}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({ archived: true }),
    },
  );
  assert.ok(
    ((await archivedGoal.json()) as { archivedAt: string | null }).archivedAt,
  );
  const restoredGoal = await fetch(
    `${base}/projects/${project.id}/goals/${goalRecord.id}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({ archived: false }),
    },
  );
  assert.equal(
    ((await restoredGoal.json()) as { archivedAt: string | null }).archivedAt,
    null,
  );
  assert.equal(
    (
      await fetch(
        `${base}/projects/${project.id}/milestones/${milestoneRecord.id}`,
        { method: "DELETE", headers },
      )
    ).status,
    204,
  );
  assert.equal(
    (
      await fetch(`${base}/projects/${project.id}/task-links/${task.id}`, {
        method: "DELETE",
        headers,
      })
    ).status,
    204,
  );
  assert.equal(
    (
      await fetch(
        `${base}/projects/${project.id}/event-links/${calendar.externalId}/${encodeURIComponent(event.uid)}`,
        { method: "DELETE", headers },
      )
    ).status,
    204,
  );
  assert.equal(
    (await database.task.findUniqueOrThrow({ where: { id: task.id } }))
      .projectId,
    null,
  );
  assert.equal(
    await database.projectEventLink.count({ where: { projectId: project.id } }),
    0,
  );
  const archived = await fetch(`${base}/projects/${project.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ archived: true }),
  });
  assert.ok(((await archived.json()) as ProjectResponse).archivedAt);
  const restored = await fetch(`${base}/projects/${project.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ archived: false }),
  });
  assert.equal(((await restored.json()) as ProjectResponse).archivedAt, null);
  assert.equal(
    (
      await fetch(`${base}/projects/${project.id}`, {
        method: "DELETE",
        headers,
      })
    ).status,
    204,
  );
  assert.equal(
    (await fetch(`${base}/projects/${project.id}`, { headers: { cookie } }))
      .status,
    404,
  );
});
