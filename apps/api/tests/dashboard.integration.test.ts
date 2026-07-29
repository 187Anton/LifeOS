import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { createDatabaseClient } from "@lifeos/database";

import { PrismaDashboardRepository } from "../src/modules/dashboard/repository.js";

test("lädt nur eigene aktive Dashboard-Daten aus der Datenbank", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const owner = await database.user.create({
    data: {
      externalId: `dashboard-owner-${suffix}`,
      displayName: "Synthetische Dashboard-Person",
      settings: { create: { timezone: "Pacific/Kiritimati" } },
    },
  });
  const other = await database.user.create({
    data: {
      externalId: `dashboard-other-${suffix}`,
      displayName: "Andere synthetische Person",
      settings: { create: {} },
    },
  });
  t.after(async () => {
    await database.user.deleteMany({
      where: { id: { in: [owner.id, other.id] } },
    });
    await database.$disconnect();
  });

  const project = await database.project.create({
    data: { userId: owner.id, title: "Synthetisches Dashboard-Projekt" },
  });
  const ownTask = await database.task.create({
    data: {
      userId: owner.id,
      projectId: project.id,
      title: "Eigene offene Aufgabe",
      priority: "high",
      dueDate: new Date("2032-04-30T00:00:00.000Z"),
    },
  });
  await database.task.createMany({
    data: [
      {
        userId: owner.id,
        title: "Erledigte Aufgabe",
        status: "done",
        completedAt: new Date("2032-04-29T10:00:00.000Z"),
      },
      {
        userId: other.id,
        title: "Fremde offene Aufgabe",
      },
    ],
  });
  const ownerCalendar = await database.calendar.create({
    data: {
      userId: owner.id,
      externalId: `dashboard-calendar-${suffix}`,
      name: "Eigener Kalender",
      isPrimary: true,
    },
  });
  const otherCalendar = await database.calendar.create({
    data: {
      userId: other.id,
      externalId: `dashboard-other-calendar-${suffix}`,
      name: "Fremder Kalender",
      isPrimary: true,
    },
  });
  await database.calendarEvent.createMany({
    data: [
      {
        userId: owner.id,
        calendarId: ownerCalendar.id,
        uid: `dashboard-event-${suffix}@lifeos.local`,
        title: "Eigener Termin",
        startsAt: new Date("2032-05-01T08:00:00.000Z"),
        endsAt: new Date("2032-05-01T09:00:00.000Z"),
        timezone: "Pacific/Kiritimati",
        etag: '"dashboard-etag"',
      },
      {
        userId: other.id,
        calendarId: otherCalendar.id,
        uid: `dashboard-other-event-${suffix}@lifeos.local`,
        title: "Fremder Termin",
        startsAt: new Date("2032-05-01T08:00:00.000Z"),
        endsAt: new Date("2032-05-01T09:00:00.000Z"),
        timezone: "UTC",
        etag: '"dashboard-other-etag"',
      },
      {
        userId: owner.id,
        calendarId: ownerCalendar.id,
        uid: `dashboard-far-event-${suffix}@lifeos.local`,
        title: "Zu weit entfernter Termin",
        startsAt: new Date("2033-05-01T08:00:00.000Z"),
        endsAt: new Date("2033-05-01T09:00:00.000Z"),
        timezone: "Pacific/Kiritimati",
        etag: '"dashboard-far-etag"',
      },
    ],
  });

  const snapshot = await new PrismaDashboardRepository(database).getSnapshot(
    owner.id,
    new Date("2032-05-01T00:00:00.000Z"),
  );

  assert.equal(snapshot.timezone, "Pacific/Kiritimati");
  assert.equal(snapshot.generatedAt, "2032-05-01T00:00:00.000Z");
  assert.deepEqual(
    snapshot.tasks.map((task) => task.id),
    [ownTask.id],
  );
  assert.deepEqual(
    snapshot.events.map((event) => event.title),
    ["Eigener Termin"],
  );
  assert.equal(snapshot.events[0]?.calendarId, ownerCalendar.externalId);
  assert.deepEqual(snapshot.projects, [
    {
      id: project.id,
      title: "Synthetisches Dashboard-Projekt",
      openTaskCount: 1,
    },
  ]);
});
