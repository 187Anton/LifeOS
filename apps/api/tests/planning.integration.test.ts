import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createDatabaseClient } from "@lifeos/database";
import type {
  AvailabilityWindowResponse,
  PlanningResponse,
} from "@lifeos/contracts";
import { config as loadEnvironment } from "dotenv";
import { createApplication } from "../src/application.js";
import type { Logger } from "../src/logger.js";
import { PrismaPlanningRepository } from "../src/modules/planning/repository.js";
import { createPlanningRouter } from "../src/modules/planning/router.js";
import { PlanningService } from "../src/modules/planning/service.js";
import { PrismaProfileRepository } from "../src/modules/profile/repository.js";
import { createProfileRouter } from "../src/modules/profile/router.js";
import {
  AuthenticationService,
  ProfileService,
} from "../src/modules/profile/service.js";
import { hashPassword } from "../src/modules/profile/security.js";

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

test("führt Kalender, Aufgaben, Studium und Arbeit besitzgebunden zusammen", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalId = `planning-owner-${suffix}`;
  const otherExternalId = `planning-other-${suffix}`;
  const password = `synthetisches-planungspasswort-${suffix}`;
  const owner = await database.user.create({
    data: {
      externalId,
      displayName: "Synthetische Planungsperson",
      settings: { create: { timezone: "Europe/Berlin" } },
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
  const calendar = await database.calendar.create({
    data: {
      userId: owner.id,
      externalId: `planning-calendar-${suffix}`,
      name: "Synthetischer Planungskalender",
    },
  });
  await Promise.all([
    database.calendarEvent.create({
      data: {
        userId: owner.id,
        calendarId: calendar.id,
        uid: `planning-a-${suffix}@lifeos.local`,
        title: "Synthetischer fester Termin A",
        startsAt: new Date("2032-06-14T07:00:00.000Z"),
        endsAt: new Date("2032-06-14T08:00:00.000Z"),
        timezone: "Europe/Berlin",
        etag: '"planning-a"',
      },
    }),
    database.calendarEvent.create({
      data: {
        userId: owner.id,
        calendarId: calendar.id,
        uid: `planning-b-${suffix}@lifeos.local`,
        title: "Synthetischer fester Termin B",
        startsAt: new Date("2032-06-14T07:30:00.000Z"),
        endsAt: new Date("2032-06-14T08:30:00.000Z"),
        timezone: "Europe/Berlin",
        etag: '"planning-b"',
      },
    }),
  ]);
  await database.task.create({
    data: {
      userId: owner.id,
      title: "Synthetische dringende Aufgabe",
      area: "work",
      priority: "high",
      dueDate: new Date("2032-06-14T00:00:00.000Z"),
      scheduledStartAt: new Date("2032-06-14T10:00:00.000Z"),
      scheduledStartTimezone: "Europe/Berlin",
      estimatedDurationMinutes: 120,
    },
  });
  const program = await database.studyProgram.create({
    data: {
      userId: owner.id,
      title: "Synthetisches Studium",
      institution: "Lokale Testeinrichtung",
      periodLabel: "Testabschnitt",
    },
  });
  const module = await database.studyModule.create({
    data: { userId: owner.id, programId: program.id, title: "Testmodul" },
  });
  await database.studyEntry.create({
    data: {
      userId: owner.id,
      moduleId: module.id,
      kind: "exam",
      title: "Synthetische Prüfung",
      dueDate: new Date("2032-06-15T00:00:00.000Z"),
    },
  });
  const workContext = await database.workContext.create({
    data: {
      userId: owner.id,
      title: "Synthetische Praxis",
      role: "Praxisrolle",
      timezone: "Europe/Berlin",
    },
  });
  const workProject = await database.workProject.create({
    data: {
      userId: owner.id,
      contextId: workContext.id,
      title: "Synthetisches Arbeitsprojekt",
      deadlineDate: new Date("2032-06-16T00:00:00.000Z"),
    },
  });
  await database.workTimeEntry.create({
    data: {
      userId: owner.id,
      contextId: workContext.id,
      kind: "planned",
      title: "Synthetischer Praxisblock",
      startsAt: new Date("2032-06-14T12:00:00.000Z"),
      endsAt: new Date("2032-06-14T14:00:00.000Z"),
      timezone: "Europe/Berlin",
    },
  });
  const foreignAvailability = await database.availabilityWindow.create({
    data: {
      userId: other.id,
      weekday: 1,
      startMinute: 9 * 60,
      endMinute: 10 * 60,
      timezone: "Europe/Berlin",
    },
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
      createPlanningRouter({
        authentication,
        planning: new PlanningService(new PrismaPlanningRepository(database)),
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
  assert.equal(
    (await fetch(`${base}/planning?from=2032-06-14&to=2032-06-20`)).status,
    401,
  );
  const login = await fetch(`${base}/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";", 1)[0] ?? "";
  const headers = { cookie, "content-type": "application/json" };
  const availabilityResponse = await fetch(`${base}/planning/availability`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      weekday: 1,
      startMinute: 9 * 60,
      endMinute: 10 * 60,
      timezone: "Europe/Berlin",
      label: "Synthetische Fokuszeit",
    }),
  });
  assert.equal(availabilityResponse.status, 201);
  const availability =
    (await availabilityResponse.json()) as AvailabilityWindowResponse;
  assert.equal(availability.ownerId, owner.id);
  const foreignDelete = await fetch(
    `${base}/planning/availability/${foreignAvailability.id}`,
    { method: "DELETE", headers },
  );
  assert.equal(foreignDelete.status, 404);

  const response = await fetch(
    `${base}/planning?from=2032-06-14&to=2032-06-20`,
    { headers: { cookie } },
  );
  assert.equal(response.status, 200);
  const planning = (await response.json()) as PlanningResponse;
  assert.deepEqual(
    new Set(planning.items.map((item) => item.area)),
    new Set(["calendar", "tasks", "study", "work", "availability"]),
  );
  assert.ok(planning.warnings.some((warning) => warning.kind === "overlap"));
  assert.ok(planning.warnings.some((warning) => warning.kind === "capacity"));
  assert.ok(planning.items.some((item) => item.kind === "deadline"));
  assert.ok(planning.items.some((item) => item.kind === "planned_task"));

  await database.workProject.update({
    where: { id: workProject.id },
    data: { deadlineDate: new Date("2032-06-17T00:00:00.000Z") },
  });
  const refreshed = (await (
    await fetch(`${base}/planning?from=2032-06-14&to=2032-06-20`, {
      headers: { cookie },
    })
  ).json()) as PlanningResponse;
  assert.ok(
    refreshed.items.some(
      (item) => item.sourceId === workProject.id && item.date === "2032-06-17",
    ),
  );
  const updateResponse = await fetch(
    `${base}/planning/availability/${availability.id}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({ label: "Aktualisierte Fokuszeit" }),
    },
  );
  assert.equal(updateResponse.status, 200);
  assert.equal(
    ((await updateResponse.json()) as AvailabilityWindowResponse).label,
    "Aktualisierte Fokuszeit",
  );
  const overlapResponse = await fetch(`${base}/planning/availability`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      weekday: 1,
      startMinute: 9 * 60 + 30,
      endMinute: 10 * 60 + 30,
      timezone: "Europe/Berlin",
    }),
  });
  assert.equal(overlapResponse.status, 409);
  assert.equal(
    (
      await fetch(`${base}/planning/availability/${availability.id}`, {
        method: "DELETE",
        headers,
      })
    ).status,
    204,
  );
  const audit = await database.auditEvent.findFirst({
    where: {
      userId: owner.id,
      action: "planning.availability.created",
    },
  });
  assert.ok(audit);
  assert.equal(JSON.stringify(audit.metadata).includes("Synthetische"), false);
});
