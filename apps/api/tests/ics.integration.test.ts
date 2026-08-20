import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createDatabaseClient } from "@lifeos/database";
import type {
  CalendarEventResponse,
  IcsImportPreviewResponse,
} from "@lifeos/contracts";
import { config as loadEnvironment } from "dotenv";

import { createApplication } from "../src/application.js";
import type { Logger } from "../src/logger.js";
import { serializeCalendarEvents } from "../src/modules/caldav/icalendar.js";
import { PrismaCalendarRepository } from "../src/modules/calendar/repository.js";
import { CalendarService } from "../src/modules/calendar/service.js";
import {
  createIcsPreviewRouter,
  createIcsRouter,
} from "../src/modules/ics/router.js";
import { IcsImportService } from "../src/modules/ics/service.js";
import { PrismaProfileRepository } from "../src/modules/profile/repository.js";
import { createProfileRouter } from "../src/modules/profile/router.js";
import { hashPassword } from "../src/modules/profile/security.js";
import {
  AuthenticationService,
  ProfileService,
} from "../src/modules/profile/service.js";

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
const timed = (
  overrides: Partial<CalendarEventResponse> = {},
): CalendarEventResponse => ({
  uid: "timed-ics@lifeos.local",
  title: "Synthetischer ICS-Termin",
  description: "Nicht vertrauenswürdiger Text wird nur als Text behandelt.",
  location: "Lokaler Testraum",
  isAllDay: false,
  startsAt: "2034-03-20T08:00:00.000Z",
  endsAt: "2034-03-20T09:00:00.000Z",
  startDate: null,
  endDate: null,
  timezone: "Europe/Berlin",
  recurrenceRule: "FREQ=WEEKLY;COUNT=4",
  reminderMinutes: [10],
  etag: '"source-etag"',
  sequence: 0,
  updatedAt: "2034-03-01T00:00:00.000Z",
  ...overrides,
});
const allDay = (): CalendarEventResponse => ({
  uid: "all-day-ics@lifeos.local",
  title: "Synthetischer Ganztag",
  description: null,
  location: null,
  isAllDay: true,
  startsAt: null,
  endsAt: null,
  startDate: "2034-03-22",
  endDate: "2034-03-23",
  timezone: "Europe/Berlin",
  recurrenceRule: null,
  reminderMinutes: [60],
  etag: '"all-day-source"',
  sequence: 0,
  updatedAt: "2034-03-01T00:00:00.000Z",
});

test("zeigt ICS-Importe vorab, schützt Konflikte und exportiert verlustarm", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalId = `ics-owner-${suffix}`;
  const otherExternalId = `ics-other-${suffix}`;
  const password = `synthetisches-ics-passwort-${suffix}`;
  const owner = await database.user.create({
    data: {
      externalId,
      displayName: "Synthetische ICS-Person",
      settings: { create: { timezone: "Europe/Berlin" } },
      credential: { create: { passwordHash: await hashPassword(password) } },
    },
  });
  const calendar = await database.calendar.create({
    data: {
      userId: owner.id,
      externalId: `ics-calendar-${suffix}`,
      name: "Synthetischer Importkalender",
      timezone: "Europe/Berlin",
      isPrimary: true,
    },
  });
  const other = await database.user.create({
    data: {
      externalId: otherExternalId,
      displayName: "Andere ICS-Person",
      settings: { create: {} },
      calendars: {
        create: {
          externalId: `foreign-ics-calendar-${suffix}`,
          name: "Fremder Kalender",
          timezone: "UTC",
          isPrimary: true,
        },
      },
    },
    include: { calendars: true },
  });
  const profileRepository = new PrismaProfileRepository(database, externalId);
  const authentication = new AuthenticationService(profileRepository, 1);
  const calendars = new CalendarService(new PrismaCalendarRepository(database));
  let now = new Date("2034-03-01T10:00:00.000Z");
  const ics = new IcsImportService(calendars, () => now);
  const application = createApplication({
    logger: new SilentLogger(),
    readinessProbe: { check: async () => undefined },
    webOrigin: "http://127.0.0.1:5173",
    rawModuleRouters: [createIcsPreviewRouter({ authentication, ics })],
    moduleRouters: [
      createProfileRouter({
        authentication,
        profile: new ProfileService(profileRepository),
        secureCookies: false,
      }),
      createIcsRouter({ authentication, ics }),
    ],
  });
  const server = createServer(application);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api/v1/calendars`;
  t.after(async () => {
    await close(server);
    await database.user.deleteMany({
      where: { externalId: { in: [externalId, otherExternalId] } },
    });
    await database.$disconnect();
  });
  const source = serializeCalendarEvents([timed(), allDay()]);
  const previewUrl = `${base}/${calendar.externalId}/ics/preview`;
  assert.equal(
    (
      await fetch(previewUrl, {
        method: "POST",
        headers: { "content-type": "text/calendar" },
        body: source,
      })
    ).status,
    401,
  );
  const login = await fetch(`http://127.0.0.1:${address.port}/api/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";", 1)[0] ?? "";
  const preview = async (body: string) => {
    const response = await fetch(previewUrl, {
      method: "POST",
      headers: { cookie, "content-type": "text/calendar" },
      body,
    });
    return {
      response,
      body: (await response.json()) as IcsImportPreviewResponse,
    };
  };
  assert.equal((await preview("keine ICS-Datei")).response.status, 400);
  assert.equal(
    (
      await fetch(previewUrl, {
        method: "POST",
        headers: { cookie, "content-type": "text/calendar" },
        body: " ".repeat(2 * 1024 * 1024 + 1),
      })
    ).status,
    413,
  );
  assert.equal(
    (
      await fetch(`${base}/${other.calendars[0]!.externalId}/ics/preview`, {
        method: "POST",
        headers: { cookie, "content-type": "text/calendar" },
        body: source,
      })
    ).status,
    404,
  );

  const first = await preview(source);
  assert.equal(first.response.status, 200);
  assert.equal(first.body.canCommit, true);
  assert.equal(first.body.creatableEvents, 2);
  assert.match(source, /BEGIN:VTIMEZONE\r\n/);
  assert.match(source, /RRULE:FREQ=WEEKLY;COUNT=4\r\n/);
  assert.match(source, /BEGIN:VALARM\r\n/);
  assert.match(source, /DTSTART;VALUE=DATE:20340322\r\n/);
  const commit = await fetch(`${base}/${calendar.externalId}/ics/commit`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ previewId: first.body.previewId }),
  });
  assert.equal(commit.status, 200);
  assert.deepEqual(await commit.json(), {
    createdEvents: 2,
    unchangedEvents: 0,
    createdUids: ["all-day-ics@lifeos.local", "timed-ics@lifeos.local"],
  });

  const repeated = await preview(source);
  assert.equal(repeated.body.canCommit, true);
  assert.equal(repeated.body.unchangedEvents, 2);
  const repeatCommit = await fetch(
    `${base}/${calendar.externalId}/ics/commit`,
    {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ previewId: repeated.body.previewId }),
    },
  );
  assert.deepEqual(await repeatCommit.json(), {
    createdEvents: 0,
    unchangedEvents: 2,
    createdUids: [],
  });
  assert.equal(
    await database.calendarEvent.count({
      where: { userId: owner.id, calendarId: calendar.id, deletedAt: null },
    }),
    2,
  );

  const conflict = await preview(
    serializeCalendarEvents([timed({ title: "Abweichender Titel" })]),
  );
  assert.equal(conflict.body.canCommit, false);
  assert.equal(conflict.body.conflictingEvents, 1);
  assert.equal(conflict.body.items[0]?.existingEtag !== null, true);
  const conflictCommit = await fetch(
    `${base}/${calendar.externalId}/ics/commit`,
    {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ previewId: conflict.body.previewId }),
    },
  );
  assert.equal(conflictCommit.status, 409);

  const duplicate = await preview(serializeCalendarEvents([timed(), timed()]));
  assert.equal(duplicate.body.invalidEvents, 2);
  assert.ok(duplicate.body.items.every((item) => item.action === "invalid"));
  const unbounded = await preview(
    serializeCalendarEvents([
      timed({ uid: "unbounded@lifeos.local", recurrenceRule: "FREQ=DAILY" }),
    ]),
  );
  assert.equal(unbounded.body.invalidEvents, 1);
  assert.match(unbounded.body.items[0]?.message ?? "", /COUNT oder UNTIL/);

  const exported = await fetch(`${base}/${calendar.externalId}/ics/export`, {
    headers: { cookie },
  });
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get("content-type") ?? "", /text\/calendar/);
  assert.equal(exported.headers.get("cache-control"), "private, no-store");
  const exportedSource = await exported.text();
  assert.match(exportedSource, /UID:timed-ics@lifeos\.local\r\n/);
  assert.match(exportedSource, /TZID:Europe\/Berlin\r\n/);
  const exportedPreview = await preview(exportedSource);
  assert.equal(exportedPreview.body.unchangedEvents, 2);
  assert.equal(exportedPreview.body.canCommit, true);

  const tooManyEvents = serializeCalendarEvents(
    Array.from({ length: 501 }, (_, index) =>
      timed({ uid: `ics-limit-${index}@lifeos.local`, recurrenceRule: null }),
    ),
  );
  await assert.rejects(
    ics.preview(owner.id, calendar.externalId, tooManyEvents),
    (error: unknown) =>
      error instanceof Error && /höchstens 500 Ereignisse/.test(error.message),
  );

  const expiring = await preview(
    serializeCalendarEvents([
      timed({ uid: "expiring-preview@lifeos.local", recurrenceRule: null }),
    ]),
  );
  await assert.rejects(
    ics.commit(other.id, calendar.externalId, expiring.body.previewId),
    (error: unknown) =>
      error instanceof Error && /gehört nicht/.test(error.message),
  );
  now = new Date(now.valueOf() + 16 * 60 * 1_000);
  const expiredCommit = await fetch(
    `${base}/${calendar.externalId}/ics/commit`,
    {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ previewId: expiring.body.previewId }),
    },
  );
  assert.equal(expiredCommit.status, 404);
});
