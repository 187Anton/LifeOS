import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { config as loadEnvironment } from "dotenv";

import { createDatabaseClient } from "../src/client.js";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));

loadEnvironment({
  path: path.resolve(testDirectory, "../../../.env"),
  quiet: true,
});

test("speichert und liest ein Kalenderereignis mit stabilem Besitzerbezug", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalUserId = `integration-user-${suffix}`;

  t.after(async () => {
    await database.user.deleteMany({ where: { externalId: externalUserId } });
    await database.$disconnect();
  });

  const user = await database.user.create({
    data: {
      externalId: externalUserId,
      displayName: "Synthetische Integrationstest-Person",
      settings: { create: {} },
    },
  });
  const calendar = await database.calendar.create({
    data: {
      userId: user.id,
      externalId: `integration-calendar-${suffix}`,
      name: "Synthetischer Testkalender",
      isPrimary: true,
    },
  });
  const uid = `integration-event-${suffix}@lifeos.local`;
  const etag = '"integration-v1"';

  await database.calendarEvent.create({
    data: {
      userId: user.id,
      calendarId: calendar.id,
      uid,
      title: "Synthetischer Integrationstest-Termin",
      startsAt: new Date("2031-02-03T08:00:00.000Z"),
      endsAt: new Date("2031-02-03T09:00:00.000Z"),
      etag,
    },
  });

  const persisted = await database.calendarEvent.findUnique({
    where: { calendarId_uid: { calendarId: calendar.id, uid } },
    include: { calendar: true },
  });

  assert.ok(persisted);
  assert.equal(persisted.uid, uid);
  assert.equal(persisted.etag, etag);
  assert.equal(persisted.userId, user.id);
  assert.equal(persisted.calendar.userId, user.id);
  assert.equal(persisted.startsAt?.toISOString(), "2031-02-03T08:00:00.000Z");

  const allDay = await database.calendarEvent.create({
    data: {
      userId: user.id,
      calendarId: calendar.id,
      uid: `integration-all-day-${suffix}@lifeos.local`,
      title: "Synthetischer ganztägiger Termin",
      isAllDay: true,
      startDate: new Date("2031-02-04T00:00:00.000Z"),
      endDate: new Date("2031-02-05T00:00:00.000Z"),
      etag: '"integration-all-day-v1"',
    },
  });

  assert.equal(allDay.startsAt, null);
  assert.equal(allDay.startDate?.toISOString(), "2031-02-04T00:00:00.000Z");

  await assert.rejects(() =>
    database.calendarEvent.create({
      data: {
        userId: user.id,
        calendarId: calendar.id,
        uid: `integration-invalid-time-${suffix}@lifeos.local`,
        title: "Ungültige gemischte Zeitform",
        isAllDay: true,
        startDate: new Date("2031-02-06T00:00:00.000Z"),
        endDate: new Date("2031-02-07T00:00:00.000Z"),
        startsAt: new Date("2031-02-06T08:00:00.000Z"),
        endsAt: new Date("2031-02-06T09:00:00.000Z"),
        etag: '"integration-invalid-v1"',
      },
    }),
  );
});

test("erzwingt Besitz, Zeitform und Dauer des Aufgabenmodells", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalIds = [
    `task-database-owner-${suffix}`,
    `task-database-other-${suffix}`,
  ];

  t.after(async () => {
    await database.user.deleteMany({
      where: { externalId: { in: externalIds } },
    });
    await database.$disconnect();
  });

  const [owner, other] = await Promise.all(
    externalIds.map((externalId) =>
      database.user.create({
        data: {
          externalId,
          displayName: "Synthetische Aufgabenperson",
          settings: { create: {} },
        },
      }),
    ),
  );
  assert.ok(owner && other);

  const project = await database.project.create({
    data: {
      userId: owner.id,
      title: "Synthetischer Projektanker",
    },
  });
  const parent = await database.task.create({
    data: {
      userId: owner.id,
      title: "Synthetische Elternaufgabe",
      priority: "high",
      dueDate: new Date("2032-06-15T00:00:00.000Z"),
      scheduledStartAt: new Date("2032-06-14T08:00:00.000Z"),
      scheduledStartTimezone: "Europe/Berlin",
      estimatedDurationMinutes: 60,
      tags: ["integration"],
      area: "projects",
      projectId: project.id,
    },
  });
  const child = await database.task.create({
    data: {
      userId: owner.id,
      title: "Synthetische Unteraufgabe",
      parentTaskId: parent.id,
    },
  });

  const persisted = await database.task.findUnique({
    where: { id: child.id },
    include: { parentTask: true },
  });
  assert.equal(persisted?.userId, owner.id);
  assert.equal(persisted?.parentTask?.id, parent.id);
  assert.equal(parent.dueDate?.toISOString(), "2032-06-15T00:00:00.000Z");

  await assert.rejects(() =>
    database.task.create({
      data: {
        userId: owner.id,
        title: "Ungültige Dauer",
        estimatedDurationMinutes: 0,
      },
    }),
  );
  await assert.rejects(() =>
    database.task.create({
      data: {
        userId: owner.id,
        title: "Unvollständige Zeitplanung",
        scheduledStartAt: new Date("2032-06-14T08:00:00.000Z"),
      },
    }),
  );
  await assert.rejects(() =>
    database.task.create({
      data: {
        userId: other.id,
        title: "Unzulässige fremde Unteraufgabe",
        parentTaskId: parent.id,
      },
    }),
  );
  const foreignProject = await database.project.create({
    data: {
      userId: other.id,
      title: "Fremder Projektanker",
    },
  });
  await assert.rejects(() =>
    database.task.create({
      data: {
        userId: owner.id,
        title: "Unzulässige fremde Projektaufgabe",
        projectId: foreignProject.id,
      },
    }),
  );
});
