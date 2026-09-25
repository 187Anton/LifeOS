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
  const [linkedEvent] = await Promise.all([
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
  await database.task.create({
    data: {
      userId: owner.id,
      title: "Synthetischer Start ohne Dauer",
      area: "personal",
      scheduledStartAt: new Date("2032-06-14T13:00:00.000Z"),
      scheduledStartTimezone: "Europe/Berlin",
    },
  });
  await database.task.create({
    data: {
      userId: other.id,
      title: "Fremde synthetische Aufgabe",
      area: "personal",
      dueDate: new Date("2032-06-14T00:00:00.000Z"),
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
  const linkedEntry = await database.studyEntry.create({
    data: {
      userId: owner.id,
      moduleId: module.id,
      kind: "lecture",
      title: "Synthetische Vorlesung mit Terminbezug",
      startsAt: new Date("2032-06-14T07:00:00.000Z"),
      endsAt: new Date("2032-06-14T08:00:00.000Z"),
      timezone: "Europe/Berlin",
      calendarEventId: linkedEvent.id,
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
  assert.equal(
    planning.items.every((item) => item.ownerId === owner.id),
    true,
  );
  assert.equal(
    planning.items.some((item) => item.title === "Fremde synthetische Aufgabe"),
    false,
  );
  const startMarker = planning.items.find(
    (item) => item.kind === "start_marker",
  );
  assert.ok(startMarker);
  assert.equal(startMarker.endsAt, null);
  assert.equal(startMarker.durationMinutes, null);
  assert.equal(startMarker.objectType, "task");
  assert.equal(startMarker.editable, "task");
  assert.equal(startMarker.status, "open");
  const linkedEventItem = planning.items.find(
    (item) => item.uid === `planning-a-${suffix}@lifeos.local`,
  );
  assert.ok(linkedEventItem);
  assert.equal(linkedEventItem.objectType, "calendar_event");
  assert.equal(linkedEventItem.editable, "calendar_event");
  assert.equal(linkedEventItem.sourceId, linkedEvent.id);
  assert.equal(
    planning.items.some((item) => item.sourceId === linkedEntry.id),
    false,
  );

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

test("projiziert Mitternachtsblock und führenden Termin aus der realen Datenbank", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalId = `planning-midnight-${suffix}`;
  const otherExternalId = `planning-midnight-other-${suffix}`;
  const owner = await database.user.create({
    data: {
      externalId,
      displayName: "Synthetische Mitternachtsperson",
      settings: { create: { timezone: "Europe/Berlin" } },
    },
  });
  const foreign = await database.user.create({
    data: {
      externalId: otherExternalId,
      displayName: "Andere synthetische Mitternachtsperson",
      settings: { create: {} },
    },
  });
  const calendar = await database.calendar.create({
    data: {
      userId: owner.id,
      externalId: `planning-midnight-calendar-${suffix}`,
      name: "Synthetischer Mitternachtskalender",
    },
  });
  const otherCalendar = await database.calendar.create({
    data: {
      userId: owner.id,
      externalId: `planning-midnight-other-calendar-${suffix}`,
      name: "Synthetischer Zweitkalender",
    },
  });
  t.after(async () => {
    await database.user.deleteMany({
      where: { externalId: { in: [externalId, otherExternalId] } },
    });
    await database.$disconnect();
  });

  /** Mitternachtsblock Sonntag 20.06.2032 23:00 bis Montag 21.06. 01:00. */
  const midnightTask = await database.task.create({
    data: {
      userId: owner.id,
      title: "Synthetischer Mitternachtsblock",
      area: "work",
      scheduledStartAt: new Date("2032-06-20T21:00:00.000Z"),
      scheduledStartTimezone: "Europe/Berlin",
      estimatedDurationMinutes: 120,
    },
  });
  await database.task.create({
    data: {
      userId: foreign.id,
      title: "Fremder synthetischer Mitternachtsblock",
      area: "work",
      scheduledStartAt: new Date("2032-06-20T21:00:00.000Z"),
      scheduledStartTimezone: "Europe/Berlin",
      estimatedDurationMinutes: 120,
    },
  });
  const program = await database.studyProgram.create({
    data: {
      userId: owner.id,
      title: "Synthetisches Mitternachtsstudium",
      institution: "Lokale Testeinrichtung",
      periodLabel: "Testabschnitt",
    },
  });
  const module = await database.studyModule.create({
    data: { userId: owner.id, programId: program.id, title: "Testmodul" },
  });
  /**
   * Führender Termin in einem anderen Kalender und außerhalb beider
   * Wochenzeiträume: Die Projektion zeigt ihn nicht, der verknüpfte
   * Studieneintrag muss deshalb sichtbar bleiben.
   */
  const otherCalendarEvent = await database.calendarEvent.create({
    data: {
      userId: owner.id,
      calendarId: otherCalendar.id,
      uid: `planning-midnight-a-${suffix}@lifeos.local`,
      title: "Synthetischer Termin im Zweitkalender",
      startsAt: new Date("2032-07-05T07:00:00.000Z"),
      endsAt: new Date("2032-07-05T08:00:00.000Z"),
      timezone: "Europe/Berlin",
      etag: '"planning-midnight-a"',
    },
  });
  const linkedEntry = await database.studyEntry.create({
    data: {
      userId: owner.id,
      moduleId: module.id,
      kind: "lecture",
      title: "Synthetische Vorlesung im Zweitkalender",
      startsAt: new Date("2032-06-21T07:00:00.000Z"),
      endsAt: new Date("2032-06-21T08:00:00.000Z"),
      timezone: "Europe/Berlin",
      calendarEventId: otherCalendarEvent.id,
    },
  });
  /** Gegenprobe: gelieferter Termin unterdrückt den verknüpften Eintrag. */
  const deliveredEvent = await database.calendarEvent.create({
    data: {
      userId: owner.id,
      calendarId: calendar.id,
      uid: `planning-midnight-b-${suffix}@lifeos.local`,
      title: "Synthetischer Termin im Hauptkalender",
      startsAt: new Date("2032-06-22T07:00:00.000Z"),
      endsAt: new Date("2032-06-22T08:00:00.000Z"),
      timezone: "Europe/Berlin",
      etag: '"planning-midnight-b"',
    },
  });
  const suppressedEntry = await database.studyEntry.create({
    data: {
      userId: owner.id,
      moduleId: module.id,
      kind: "lecture",
      title: "Synthetische Vorlesung im Hauptkalender",
      startsAt: new Date("2032-06-22T07:00:00.000Z"),
      endsAt: new Date("2032-06-22T08:00:00.000Z"),
      timezone: "Europe/Berlin",
      calendarEventId: deliveredEvent.id,
    },
  });

  const service = new PlanningService(new PrismaPlanningRepository(database));

  /** Woche 1: Montag 14.06. bis Sonntag 20.06.2032. */
  const firstWeek = await service.getPlanning(owner.id, {
    from: "2032-06-14",
    to: "2032-06-20",
  });
  const firstBlock = firstWeek.items.filter(
    (item) => item.sourceId === midnightTask.id,
  );
  assert.equal(firstBlock.length, 1);
  assert.equal(firstBlock[0]?.date, "2032-06-20");
  assert.equal(firstBlock[0]?.calendarId, null);
  assert.equal(
    firstWeek.items.every((item) => item.ownerId === owner.id),
    true,
  );
  assert.equal(
    firstWeek.items.some(
      (item) => item.title === "Fremder synthetischer Mitternachtsblock",
    ),
    false,
  );
  assert.deepEqual(
    firstWeek.warnings
      .filter(
        (warning) =>
          warning.kind === "capacity" || warning.kind === "missing_data",
      )
      .map((warning) => warning.date),
    ["2032-06-20"],
  );

  /** Woche 2: Montag 21.06. bis Sonntag 27.06.2032. */
  const secondWeek = await service.getPlanning(owner.id, {
    from: "2032-06-21",
    to: "2032-06-27",
  });
  const secondBlock = secondWeek.items.filter(
    (item) => item.sourceId === midnightTask.id,
  );
  assert.equal(secondBlock.length, 1);
  assert.equal(secondBlock[0]?.date, "2032-06-21");
  assert.equal(secondBlock[0]?.startsAt, "2032-06-20T21:00:00.000Z");
  /** Kapazität genau einmal: die Fortsetzungswoche trägt keine Warnung. */
  assert.deepEqual(
    secondWeek.warnings.filter(
      (warning) =>
        warning.kind === "capacity" || warning.kind === "missing_data",
    ),
    [],
  );
  /** Nicht gelieferter führender Termin: Eintrag bleibt sichtbar. */
  assert.ok(secondWeek.items.some((item) => item.sourceId === linkedEntry.id));
  assert.equal(
    secondWeek.items.some((item) => item.sourceId === otherCalendarEvent.id),
    false,
  );
  /** Gelieferter führender Termin: Eintrag wird unterdrückt. */
  const deliveredItem = secondWeek.items.find(
    (item) => item.sourceId === deliveredEvent.id,
  );
  assert.ok(deliveredItem);
  assert.equal(deliveredItem.calendarId, calendar.id);
  assert.equal(deliveredItem.timezone, "Europe/Berlin");
  assert.equal(
    secondWeek.items.some((item) => item.sourceId === suppressedEntry.id),
    false,
  );
});
