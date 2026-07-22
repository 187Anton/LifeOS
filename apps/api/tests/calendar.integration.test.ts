import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createDatabaseClient } from "@lifeos/database";
import type {
  CalendarEventResponse,
  CalendarResponse,
} from "@lifeos/contracts";
import { config as loadEnvironment } from "dotenv";

import { createApplication } from "../src/application.js";
import type { Logger } from "../src/logger.js";
import { PrismaCalendarRepository } from "../src/modules/calendar/repository.js";
import { createCalendarRouter } from "../src/modules/calendar/router.js";
import { CalendarService } from "../src/modules/calendar/service.js";
import { PrismaProfileRepository } from "../src/modules/profile/repository.js";
import { createProfileRouter } from "../src/modules/profile/router.js";
import {
  AuthenticationService,
  ProfileService,
} from "../src/modules/profile/service.js";
import { hashPassword } from "../src/modules/profile/security.js";

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

test("verwaltet Kalender und Ereignisse mit stabiler UID, ETag und Sync-Token", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalId = `calendar-owner-${suffix}`;
  const password = `synthetisches-kalenderpasswort-${suffix}`;
  const user = await database.user.create({
    data: {
      externalId,
      displayName: "Synthetische Kalenderperson",
      settings: { create: {} },
      credential: { create: { passwordHash: await hashPassword(password) } },
    },
  });
  const profileRepository = new PrismaProfileRepository(database, externalId);
  const authentication = new AuthenticationService(profileRepository, 1);
  const calendars = new CalendarService(new PrismaCalendarRepository(database));
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
    ],
  });
  const server = createServer(application);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
  t.after(async () => {
    await close(server);
    await database.user.delete({ where: { id: user.id } });
    await database.$disconnect();
  });

  const login = await fetch(`${baseUrl}/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  assert.equal(login.status, 201);
  const cookie = (login.headers.get("set-cookie") ?? "").split(";", 1)[0] ?? "";
  const jsonHeaders = { cookie, "content-type": "application/json" };

  const firstResponse = await fetch(`${baseUrl}/calendars`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ name: "Privat", timezone: "Europe/Berlin" }),
  });
  assert.equal(firstResponse.status, 201);
  const first = (await firstResponse.json()) as CalendarResponse;
  assert.equal(first.isPrimary, true);

  const secondResponse = await fetch(`${baseUrl}/calendars`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      name: "Studium",
      timezone: "Europe/Berlin",
      isPrimary: true,
    }),
  });
  const second = (await secondResponse.json()) as CalendarResponse;
  const listed = (await (
    await fetch(`${baseUrl}/calendars`, { headers: { cookie } })
  ).json()) as CalendarResponse[];
  assert.equal(listed.filter((calendar) => calendar.isPrimary).length, 1);
  assert.equal(
    listed.find((calendar) => calendar.id === second.id)?.isPrimary,
    true,
  );

  const uid = `${randomUUID()}@lifeos.local`;
  const timedCreate = await fetch(`${baseUrl}/calendars/${second.id}/events`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      uid,
      title: "Vorlesung",
      description: "Synthetischer Termin",
      location: "Raum 1",
      timezone: "Europe/Berlin",
      isAllDay: false,
      startsAt: "2032-03-10T09:00:00+01:00",
      endsAt: "2032-03-10T10:30:00+01:00",
      recurrenceRule: "FREQ=WEEKLY;COUNT=4",
      reminderMinutes: [30, 10],
    }),
  });
  assert.equal(timedCreate.status, 201);
  const created = (await timedCreate.json()) as CalendarEventResponse;
  assert.equal(created.uid, uid);
  assert.deepEqual(created.reminderMinutes, [10, 30]);
  assert.equal(created.recurrenceRule, "FREQ=WEEKLY;COUNT=4");
  const firstEtag = timedCreate.headers.get("etag") ?? "";
  assert.equal(firstEtag, created.etag);

  const duplicateUid = await fetch(`${baseUrl}/calendars/${second.id}/events`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      uid,
      title: "Doppelte UID",
      timezone: "Europe/Berlin",
      isAllDay: false,
      startsAt: "2032-03-11T09:00:00+01:00",
      endsAt: "2032-03-11T10:00:00+01:00",
    }),
  });
  assert.equal(duplicateUid.status, 409);

  const missingPrecondition = await fetch(
    `${baseUrl}/calendars/${second.id}/events/${encodeURIComponent(uid)}`,
    {
      method: "PUT",
      headers: jsonHeaders,
      body: JSON.stringify({
        title: "Vorlesung neu",
        timezone: "Europe/Berlin",
        isAllDay: false,
        startsAt: "2032-03-10T09:00:00+01:00",
        endsAt: "2032-03-10T10:30:00+01:00",
      }),
    },
  );
  assert.equal(missingPrecondition.status, 428);

  const replace = await fetch(
    `${baseUrl}/calendars/${second.id}/events/${encodeURIComponent(uid)}`,
    {
      method: "PUT",
      headers: { ...jsonHeaders, "if-match": firstEtag },
      body: JSON.stringify({
        title: "Vorlesung aktualisiert",
        description: "Synthetischer Termin",
        location: "Raum 2",
        timezone: "Europe/Berlin",
        isAllDay: false,
        startsAt: "2032-03-10T09:00:00+01:00",
        endsAt: "2032-03-10T10:30:00+01:00",
        recurrenceRule: "FREQ=WEEKLY;COUNT=4",
        reminderMinutes: [10],
      }),
    },
  );
  assert.equal(replace.status, 200);
  const replaced = (await replace.json()) as CalendarEventResponse;
  assert.equal(replaced.uid, uid);
  assert.equal(replaced.sequence, 1);
  assert.notEqual(replaced.etag, firstEtag);

  const stale = await fetch(
    `${baseUrl}/calendars/${second.id}/events/${encodeURIComponent(uid)}`,
    {
      method: "DELETE",
      headers: { cookie, "if-match": firstEtag },
    },
  );
  assert.equal(stale.status, 412);

  const allDay = await fetch(`${baseUrl}/calendars/${second.id}/events`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      title: "Prüfungstag",
      timezone: "Europe/Berlin",
      isAllDay: true,
      startDate: "2032-04-02",
      endDate: "2032-04-03",
    }),
  });
  const allDayEvent = (await allDay.json()) as CalendarEventResponse;
  assert.equal(allDayEvent.startDate, "2032-04-02");
  assert.equal(allDayEvent.startsAt, null);

  const validDelete = await fetch(
    `${baseUrl}/calendars/${second.id}/events/${encodeURIComponent(uid)}`,
    {
      method: "DELETE",
      headers: { cookie, "if-match": replaced.etag },
    },
  );
  assert.equal(validDelete.status, 204);
  assert.equal(
    (
      await fetch(
        `${baseUrl}/calendars/${second.id}/events/${encodeURIComponent(uid)}`,
        { headers: { cookie } },
      )
    ).status,
    404,
  );

  const afterEvents = (await (
    await fetch(`${baseUrl}/calendars`, { headers: { cookie } })
  ).json()) as CalendarResponse[];
  const changedCalendar = afterEvents.find(
    (calendar) => calendar.id === second.id,
  );
  assert.ok(changedCalendar && changedCalendar.syncToken >= 4);

  assert.equal(
    (
      await fetch(`${baseUrl}/calendars/${second.id}`, {
        method: "DELETE",
        headers: { cookie },
      })
    ).status,
    204,
  );
  const remaining = (await (
    await fetch(`${baseUrl}/calendars`, { headers: { cookie } })
  ).json()) as CalendarResponse[];
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0]?.id, first.id);
  assert.equal(remaining[0]?.isPrimary, true);

  const auditActions = (
    await database.auditEvent.findMany({
      where: { userId: user.id },
      select: { action: true },
    })
  ).map((entry) => entry.action);
  assert.ok(auditActions.includes("calendar.event.updated"));
  assert.ok(auditActions.includes("calendar.event.deleted"));
});
