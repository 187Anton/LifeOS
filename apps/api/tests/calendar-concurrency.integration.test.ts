import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createDatabaseClient } from "@lifeos/database";
import { config as loadEnvironment } from "dotenv";

import {
  EtagConflictError,
  PrismaCalendarRepository,
} from "../src/modules/calendar/repository.js";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
loadEnvironment({
  path: path.resolve(testDirectory, "../../../.env"),
  quiet: true,
});

test("lässt bei zwei parallelen Änderungen mit altem ETag genau einen Gewinner zu", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalId = `calendar-concurrency-owner-${suffix}`;
  const user = await database.user.create({
    data: {
      externalId,
      displayName: "Synthetische ETag-Testperson",
      settings: { create: {} },
    },
  });
  t.after(async () => {
    await database.user.delete({ where: { id: user.id } });
    await database.$disconnect();
  });

  const repository = new PrismaCalendarRepository(database);
  const calendar = await repository.createCalendar(user.id, {
    externalId: `etag-${suffix}`,
    name: "ETag-Konkurrenz",
    timezone: "Europe/Berlin",
    isPrimary: true,
  });
  const uid = `etag-concurrency-${suffix}@lifeos.local`;
  const created = await repository.createEvent(user.id, calendar.id, {
    uid,
    etag: '"etag-concurrency-v1"',
    title: "Ausgangstermin",
    startsAt: new Date("2032-08-09T08:00:00.000Z"),
    endsAt: new Date("2032-08-09T09:00:00.000Z"),
    startDate: null,
    endDate: null,
    timezone: "Europe/Berlin",
    isAllDay: false,
    recurrenceRule: null,
    reminderMinutes: [10],
  });
  const before = await database.calendar.findFirstOrThrow({
    where: { userId: user.id, externalId: calendar.id },
    select: { syncToken: true },
  });

  const update = (title: string, etag: string) =>
    repository.updateEvent(user.id, calendar.id, uid, created.etag, {
      etag,
      title,
      startsAt: new Date("2032-08-09T08:30:00.000Z"),
      endsAt: new Date("2032-08-09T09:30:00.000Z"),
      startDate: null,
      endDate: null,
      timezone: "Europe/Berlin",
      isAllDay: false,
      recurrenceRule: "FREQ=DAILY;COUNT=2",
      reminderMinutes: [15],
    });

  const outcomes = await Promise.allSettled([
    update("Erster Kandidat", '"etag-concurrency-v2-a"'),
    update("Zweiter Kandidat", '"etag-concurrency-v2-b"'),
  ]);
  const fulfilled = outcomes.filter(
    (
      outcome,
    ): outcome is PromiseFulfilledResult<Awaited<ReturnType<typeof update>>> =>
      outcome.status === "fulfilled",
  );
  const rejected = outcomes.filter(
    (outcome): outcome is PromiseRejectedResult =>
      outcome.status === "rejected",
  );
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0]?.reason instanceof EtagConflictError);

  const persisted = await repository.getEvent(user.id, calendar.id, uid);
  assert.equal(persisted.etag, fulfilled[0]?.value.etag);
  assert.equal(persisted.sequence, 1);
  const after = await database.calendar.findFirstOrThrow({
    where: { userId: user.id, externalId: calendar.id },
    select: { syncToken: true },
  });
  assert.equal(after.syncToken, before.syncToken + 1);
  assert.equal(
    await database.auditEvent.count({
      where: { userId: user.id, action: "calendar.event.updated" },
    }),
    1,
  );
});
