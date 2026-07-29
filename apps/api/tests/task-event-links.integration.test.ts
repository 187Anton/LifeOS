import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createDatabaseClient } from "@lifeos/database";
import type { TaskEventLinkResponse, TaskResponse } from "@lifeos/contracts";
import { config as loadEnvironment } from "dotenv";

import { createApplication } from "../src/application.js";
import type { Logger } from "../src/logger.js";
import { PrismaCalendarRepository } from "../src/modules/calendar/repository.js";
import { createCalendarRouter } from "../src/modules/calendar/router.js";
import { CalendarService } from "../src/modules/calendar/service.js";
import { PrismaProfileRepository } from "../src/modules/profile/repository.js";
import { createProfileRouter } from "../src/modules/profile/router.js";
import { hashPassword } from "../src/modules/profile/security.js";
import {
  AuthenticationService,
  ProfileService,
} from "../src/modules/profile/service.js";
import { PrismaTaskEventLinkRepository } from "../src/modules/task-event-links/repository.js";
import { createTaskEventLinkRouter } from "../src/modules/task-event-links/router.js";
import { TaskEventLinkService } from "../src/modules/task-event-links/service.js";
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

test("verknüpft Aufgaben und Termine besitzgebunden und ohne Seiteneffekte", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalIds = [`link-owner-${suffix}`, `link-other-${suffix}`];
  const password = `synthetisches-link-passwort-${suffix}`;
  const owner = await database.user.create({
    data: {
      externalId: externalIds[0]!,
      displayName: "Synthetische Link-Person",
      settings: { create: {} },
      credential: { create: { passwordHash: await hashPassword(password) } },
    },
  });
  const other = await database.user.create({
    data: {
      externalId: externalIds[1]!,
      displayName: "Andere synthetische Person",
      settings: { create: {} },
    },
  });
  const calendar = await database.calendar.create({
    data: {
      userId: owner.id,
      externalId: `link-calendar-${suffix}`,
      name: "Synthetischer Kalender",
      isPrimary: true,
    },
  });
  const foreignCalendar = await database.calendar.create({
    data: {
      userId: other.id,
      externalId: `link-foreign-calendar-${suffix}`,
      name: "Fremder synthetischer Kalender",
      isPrimary: true,
    },
  });
  const event = await database.calendarEvent.create({
    data: {
      userId: owner.id,
      calendarId: calendar.id,
      uid: `link-event-${suffix}@lifeos.local`,
      title: "Synthetischer Zeitblock",
      startsAt: new Date("2032-05-01T08:00:00.000Z"),
      endsAt: new Date("2032-05-01T09:00:00.000Z"),
      timezone: "Europe/Berlin",
      etag: '"link-etag-v1"',
    },
  });
  const foreignEvent = await database.calendarEvent.create({
    data: {
      userId: other.id,
      calendarId: foreignCalendar.id,
      uid: `link-foreign-event-${suffix}@lifeos.local`,
      title: "Fremder synthetischer Termin",
      startsAt: new Date("2032-05-02T08:00:00.000Z"),
      endsAt: new Date("2032-05-02T09:00:00.000Z"),
      timezone: "Europe/Berlin",
      etag: '"link-foreign-etag-v1"',
    },
  });
  const task = await database.task.create({
    data: {
      userId: owner.id,
      title: "Synthetische verknüpfte Aufgabe",
    },
  });
  const foreignTask = await database.task.create({
    data: {
      userId: other.id,
      title: "Fremde synthetische Aufgabe",
    },
  });
  const profileRepository = new PrismaProfileRepository(
    database,
    externalIds[0],
  );
  const authentication = new AuthenticationService(profileRepository, 1);
  const calendars = new CalendarService(new PrismaCalendarRepository(database));
  const tasks = new TaskService(new PrismaTaskRepository(database));
  const links = new TaskEventLinkService(
    new PrismaTaskEventLinkRepository(database),
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
      createCalendarRouter({ authentication, calendars }),
      createTaskRouter({ authentication, tasks }),
      createTaskEventLinkRouter({ authentication, links }),
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
      where: { externalId: { in: externalIds } },
    });
    await database.$disconnect();
  });

  assert.equal((await fetch(`${baseUrl}/task-event-links`)).status, 401);
  const login = await fetch(`${baseUrl}/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  assert.equal(login.status, 201);
  const cookie = (login.headers.get("set-cookie") ?? "").split(";", 1)[0] ?? "";
  const jsonHeaders = { cookie, "content-type": "application/json" };
  const payload = {
    taskId: task.id,
    calendarId: calendar.externalId,
    eventUid: event.uid,
  };

  const createdResponse = await fetch(`${baseUrl}/task-event-links`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()) as TaskEventLinkResponse;
  assert.equal(created.task.id, task.id);
  assert.equal(created.event.uid, event.uid);
  assert.equal(created.task.available, true);
  assert.equal(created.event.available, true);

  const repeatedResponse = await fetch(`${baseUrl}/task-event-links`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
  assert.equal(repeatedResponse.status, 200);
  assert.equal(
    ((await repeatedResponse.json()) as TaskEventLinkResponse).id,
    created.id,
  );
  assert.equal(
    await database.taskEventLink.count({ where: { userId: owner.id } }),
    1,
  );

  const foreignTaskResponse = await fetch(`${baseUrl}/task-event-links`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ ...payload, taskId: foreignTask.id }),
  });
  assert.equal(foreignTaskResponse.status, 404);

  const foreignEventResponse = await fetch(`${baseUrl}/task-event-links`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      ...payload,
      calendarId: foreignCalendar.externalId,
      eventUid: foreignEvent.uid,
    }),
  });
  assert.equal(foreignEventResponse.status, 404);

  const completedResponse = await fetch(`${baseUrl}/tasks/${task.id}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify({ status: "done" }),
  });
  assert.equal(completedResponse.status, 200);
  assert.equal(
    ((await completedResponse.json()) as TaskResponse).status,
    "done",
  );
  assert.equal(
    (
      await database.calendarEvent.findUniqueOrThrow({
        where: { id: event.id },
      })
    ).etag,
    '"link-etag-v1"',
  );

  const deletedEventResponse = await fetch(
    `${baseUrl}/calendars/${calendar.externalId}/events/${encodeURIComponent(event.uid)}`,
    {
      method: "DELETE",
      headers: { cookie, "if-match": '"link-etag-v1"' },
    },
  );
  assert.equal(deletedEventResponse.status, 204);
  assert.equal(
    (
      await database.task.findUniqueOrThrow({
        where: { id: task.id },
      })
    ).deletedAt,
    null,
  );

  const listed = (await (
    await fetch(`${baseUrl}/task-event-links`, { headers: { cookie } })
  ).json()) as TaskEventLinkResponse[];
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.task.available, true);
  assert.equal(listed[0]?.event.available, false);
  assert.equal(listed[0]?.event.title, null);

  assert.equal(
    (
      await fetch(`${baseUrl}/task-event-links/${created.id}`, {
        method: "DELETE",
        headers: { cookie },
      })
    ).status,
    204,
  );
  assert.equal(
    (
      await fetch(`${baseUrl}/task-event-links/${created.id}`, {
        method: "DELETE",
        headers: { cookie },
      })
    ).status,
    404,
  );

  const auditActions = await database.auditEvent.findMany({
    where: { userId: owner.id, entityType: "TaskEventLink" },
    select: { action: true },
  });
  assert.deepEqual(auditActions.map((item) => item.action).sort(), [
    "task.calendar_event.linked",
    "task.calendar_event.unlinked",
  ]);
});
