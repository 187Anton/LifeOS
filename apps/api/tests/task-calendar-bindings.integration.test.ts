import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { DatabaseClient } from "@lifeos/database";
import { createDatabaseClient } from "@lifeos/database";
import { config as loadEnvironment } from "dotenv";

import { createApplication } from "../src/application.js";
import type { Logger } from "../src/logger.js";
import { CalDavAuthenticationService } from "../src/modules/caldav/authentication.js";
import { PrismaCalDavRepository } from "../src/modules/caldav/repository.js";
import { createCalDavRouter } from "../src/modules/caldav/router.js";
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
import {
  composeManagedEventDescription,
  managedEventUid,
} from "../src/modules/task-calendar-bindings/mapping.js";
import { PrismaTaskCalendarBindingRepository } from "../src/modules/task-calendar-bindings/repository.js";
import { createTaskCalendarBindingRouter } from "../src/modules/task-calendar-bindings/router.js";
import { TaskCalendarBindingService } from "../src/modules/task-calendar-bindings/service.js";
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

interface Harness {
  database: DatabaseClient;
  baseUrl: string;
  davBaseUrl: string;
  authorization: string;
  jsonHeaders: Record<string, string>;
  userId: string;
  externalId: string;
  calendarId: string;
  secondaryCalendarId: string;
  otherUserId: string;
  otherExternalId: string;
  otherCalendarId: string;
  /** Verwalteter Dienst und Repository für gezielte Zwischenzustände. */
  bindings: TaskCalendarBindingService;
  bindingsRepository: PrismaTaskCalendarBindingRepository;
  close(): Promise<void>;
  api(
    method: string,
    url: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<Response>;
  dav(method: string, url: string, init?: RequestInit): Promise<Response>;
}

const readJson = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
};

/**
 * Aufbau: eine synthetische Person mit persönlichem Primärkalender und
 * Zweitkalender sowie eine zweite Person mit eigenem Kalender, jeweils mit
 * Web-Anmeldung und CalDAV-Zugang.
 */
const createHarness = async (
  t: { after(callback: () => Promise<void>): void },
  options: { primaryCalendars?: number } = {},
): Promise<Harness> => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalId = `binding-owner-${suffix}`;
  const otherExternalId = `binding-other-${suffix}`;
  const password = `synthetisches-bindungspasswort-${suffix}`;
  const username = `binding-${suffix}`;
  const user = await database.user.create({
    data: {
      externalId,
      displayName: "Synthetische Bindungsperson",
      settings: { create: { timezone: "Europe/Berlin" } },
      credential: { create: { passwordHash: await hashPassword(password) } },
      calDavCredential: {
        create: { username, passwordHash: await hashPassword(password) },
      },
    },
  });
  const other = await database.user.create({
    data: {
      externalId: otherExternalId,
      displayName: "Andere synthetische Person",
      settings: { create: { timezone: "Europe/Berlin" } },
    },
  });
  const calendarId = `binding-primary-${suffix}`;
  const primaryCount = options.primaryCalendars ?? 1;
  for (let index = 0; index < primaryCount; index += 1) {
    await database.calendar.create({
      data: {
        userId: user.id,
        externalId:
          index === 0 ? calendarId : `binding-second-primary-${suffix}`,
        name: `Synthetischer Primärkalender ${index}`,
        timezone: "Europe/Berlin",
        isPrimary: true,
      },
    });
  }
  const secondaryCalendarId = `binding-secondary-${suffix}`;
  await database.calendar.create({
    data: {
      userId: user.id,
      externalId: secondaryCalendarId,
      name: "Synthetischer Zweitkalender",
      timezone: "Europe/Berlin",
    },
  });
  const otherCalendarId = `binding-other-calendar-${suffix}`;
  await database.calendar.create({
    data: {
      userId: other.id,
      externalId: otherCalendarId,
      name: "Fremder synthetischer Kalender",
      timezone: "Europe/Berlin",
      isPrimary: true,
    },
  });

  const profileRepository = new PrismaProfileRepository(database, externalId);
  const authentication = new AuthenticationService(profileRepository, 1);
  const bindingsRepository = new PrismaTaskCalendarBindingRepository(database);
  const bindings = new TaskCalendarBindingService(bindingsRepository);
  const calendars = new CalendarService(
    new PrismaCalendarRepository(database),
    bindings,
  );
  const tasks = new TaskService(
    new PrismaTaskRepository(database),
    undefined,
    bindings,
  );
  const links = new TaskEventLinkService(
    new PrismaTaskEventLinkRepository(database),
  );
  const caldavRepository = new PrismaCalDavRepository(database, externalId);
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
      createTaskCalendarBindingRouter({ authentication, bindings }),
    ],
    rootRouters: [
      createCalDavRouter({
        authentication: new CalDavAuthenticationService(caldavRepository),
        repository: caldavRepository,
        calendars,
      }),
    ],
  });
  const server = createServer(application);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const baseUrl = `${origin}/api/v1`;
  const authorization = `Basic ${Buffer.from(
    `${username}:${password}`,
  ).toString("base64")}`;
  t.after(async () => {
    await close(server);
    await database.user.deleteMany({
      where: { externalId: { in: [externalId, otherExternalId] } },
    });
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

  return {
    database,
    baseUrl,
    davBaseUrl: `${origin}/caldav/calendars/local`,
    authorization,
    jsonHeaders,
    userId: user.id,
    externalId,
    calendarId,
    secondaryCalendarId,
    otherUserId: other.id,
    otherExternalId,
    otherCalendarId,
    bindings,
    bindingsRepository,
    close: () => close(server),
    api: (method, url, body, headers) =>
      fetch(`${baseUrl}${url}`, {
        method,
        headers: { ...jsonHeaders, ...(headers ?? {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    dav: (method, url, init = {}) =>
      fetch(`${origin}${url}`, {
        method,
        ...init,
        headers: { authorization, ...(init.headers ?? {}) },
      }),
  };
};

const managedUid = (taskId: string, kind: "frist" | "zeitblock"): string =>
  `${taskId}.${kind}@tasks.lifeos.local`;

const createTask = async (
  harness: Harness,
  body: Record<string, unknown>,
): Promise<{ id: string }> => {
  const response = await harness.api("POST", "/tasks", body);
  if (response.status !== 201) {
    assert.fail(
      `Aufgabe wurde nicht angelegt (${response.status}): ${await response.text()}`,
    );
  }
  return readJson<{ id: string }>(response);
};

const listBindings = async (harness: Harness) => {
  const response = await harness.api("GET", "/task-calendar-bindings");
  assert.equal(response.status, 200);
  return readJson<
    Array<{
      id: string;
      kind: string;
      label: string;
      status: string;
      eventKind: string | null;
      lastKnownEtag: string;
      task: { id: string; title: string | null; available: boolean };
      event: {
        calendarId: string | null;
        uid: string | null;
        etag: string | null;
        title: string | null;
        available: boolean;
      };
    }>
  >(response);
};

const eventRow = (harness: Harness, uid: string) =>
  harness.database.calendarEvent.findFirst({
    where: { userId: harness.userId, uid },
  });

const calendarRow = (harness: Harness, externalId: string) =>
  harness.database.calendar.findFirst({
    where: { userId: harness.userId, externalId },
  });

const auditCount = (harness: Harness, action: string) =>
  harness.database.auditEvent.count({
    where: { userId: harness.userId, action },
  });

const ics = (lines: string[]): string =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "X-WR-TIMEZONE:Europe/Berlin",
    "BEGIN:VEVENT",
    ...lines,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");

/** iCalendar-Textwerte: Zeilenumbrüche sind als „\n“ zu maskieren. */
const icsText = (value: string | null | undefined): string =>
  (value ?? "").replace(/\r\n|\n|\r/g, "\\n");

test("führt Frist und Arbeitsblock einer Aufgabe atomar mit Kalender, Sync-Token und Audit", async (t) => {
  const harness = await createHarness(t);
  const task = await createTask(harness, {
    title: "Synthetische Aufgabe",
    dueDate: "2032-06-01",
  });

  const bindings = await listBindings(harness);
  assert.equal(bindings.length, 1);
  const [due] = bindings;
  assert.ok(due);
  assert.equal(due.kind, "due");
  assert.equal(due.status, "active");
  assert.equal(due.label, "Frist");
  assert.equal(due.eventKind, "all_day");
  assert.equal(due.event.calendarId, harness.calendarId);
  assert.equal(due.event.uid, managedUid(task.id, "frist"));
  assert.equal(due.event.title, "Frist: Synthetische Aufgabe");
  assert.equal(due.event.available, true);

  const event = await eventRow(harness, managedUid(task.id, "frist"));
  assert.ok(event);
  assert.equal(event.isAllDay, true);
  assert.equal(event.startDate?.toISOString(), "2032-06-01T00:00:00.000Z");
  assert.equal(event.endDate?.toISOString(), "2032-06-02T00:00:00.000Z");
  assert.equal(event.startsAt, null);
  assert.equal(event.endsAt, null);
  assert.equal(event.recurrenceRule, null);
  assert.equal(event.etag, due.lastKnownEtag);
  assert.equal(event.sequence, 0);
  assert.equal(event.deletedAt, null);
  assert.match(
    event.description ?? "",
    /LifeOS verwaltete Aufgabenabbildung[\s\S]*Aufgabe: /,
  );
  const calendar = await calendarRow(harness, harness.calendarId);
  assert.ok(calendar);
  assert.equal(event.syncVersion, calendar.syncToken);
  assert.ok(calendar.syncToken > 0);
  assert.equal(await auditCount(harness, "task.calendar_binding.created"), 1);

  // Die Aufgabe bleibt fachlich unverändert und nennt keine Kalenderfelder.
  const readTask = await readJson<Record<string, unknown>>(
    await harness.api("GET", `/tasks/${task.id}`),
  );
  assert.equal(readTask.dueDate, "2032-06-01");
  assert.equal(readTask.status, "open");
  assert.equal(readTask.title, "Synthetische Aufgabe");

  // CalDAV liest das verwaltete Ereignis wie ein normales ganztägiges Ereignis.
  const fetched = await harness.dav(
    "GET",
    `/caldav/calendars/local/${harness.calendarId}/${encodeURIComponent(
      managedUid(task.id, "frist"),
    )}.ics`,
  );
  assert.equal(fetched.status, 200);
  assert.equal(fetched.headers.get("etag"), event.etag);
  const body = await fetched.text();
  assert.match(body, /DTSTART;VALUE=DATE:20320601/);
  assert.match(body, /DTEND;VALUE=DATE:20320602/);
  assert.match(body, /SUMMARY:Frist: Synthetische Aufgabe/);

  // Geplanter Start mit Dauer ergänzt einen zweiten, eigenständigen Arbeitsblock.
  const scheduled = await readJson<Record<string, unknown>>(
    await harness.api("PATCH", `/tasks/${task.id}`, {
      scheduledStartAt: "2032-06-01T08:00:00.000Z",
      scheduledStartTimezone: "Europe/Berlin",
      estimatedDurationMinutes: 90,
    }),
  );
  assert.equal(scheduled.status, "open");
  const withBlock = await listBindings(harness);
  assert.equal(withBlock.length, 2);
  const block = withBlock.find((entry) => entry.kind === "work_block");
  assert.ok(block);
  assert.equal(block.label, "Geplanter Zeitblock");
  assert.equal(block.eventKind, "timed");
  assert.equal(block.event.uid, managedUid(task.id, "zeitblock"));
  assert.notEqual(block.event.uid, due.event.uid);
  const blockEvent = await eventRow(harness, managedUid(task.id, "zeitblock"));
  assert.ok(blockEvent);
  assert.equal(blockEvent.isAllDay, false);
  assert.equal(
    (blockEvent.endsAt?.getTime() ?? 0) - (blockEvent.startsAt?.getTime() ?? 0),
    90 * 60_000,
  );

  // Wiederholtes Setzen derselben Angaben erzeugt kein Duplikat und keine Änderung.
  const beforeRepeat = await eventRow(
    harness,
    managedUid(task.id, "zeitblock"),
  );
  const calendarBeforeRepeat = await calendarRow(harness, harness.calendarId);
  await harness.api("PATCH", `/tasks/${task.id}`, {
    priority: "high",
  });
  const afterRepeat = await eventRow(harness, managedUid(task.id, "zeitblock"));
  const calendarAfterRepeat = await calendarRow(harness, harness.calendarId);
  assert.equal(afterRepeat?.etag, beforeRepeat?.etag);
  assert.equal(afterRepeat?.sequence, beforeRepeat?.sequence);
  assert.equal(calendarAfterRepeat?.syncToken, calendarBeforeRepeat?.syncToken);
  assert.equal((await listBindings(harness)).length, 2);
});

test("hält die UID stabil und entfernt Abbildungen bei Löschung, Archivierung und geleertem Feld", async (t) => {
  const harness = await createHarness(t);
  const task = await createTask(harness, {
    title: "Synthetische Aufgabe",
    dueDate: "2032-06-01",
    scheduledStartAt: "2032-06-01T08:00:00.000Z",
    scheduledStartTimezone: "Europe/Berlin",
    estimatedDurationMinutes: undefined,
  });
  const first = await eventRow(harness, managedUid(task.id, "frist"));
  const firstUid = first?.uid ?? "";
  /**
   * Ohne geschätzte Dauer entsteht die Arbeitsblockabbildung als sichtbare
   * Startmarkierung: „Start ohne Dauer“ bleibt ohne erfundenes Ende sichtbar.
   */
  assert.equal((await listBindings(harness)).length, 2);
  const startMarker = await eventRow(harness, managedUid(task.id, "zeitblock"));
  assert.equal(startMarker?.isStartMarker, true);
  assert.equal(startMarker?.endsAt, null);

  // Frist verschieben: gleiche UID, neuer ETag, fortlaufende Sequenz.
  await harness.api("PATCH", `/tasks/${task.id}`, { dueDate: "2032-07-15" });
  const moved = await eventRow(harness, firstUid);
  assert.ok(moved);
  assert.equal(moved.uid, firstUid);
  assert.notEqual(moved.etag, first?.etag);
  assert.equal(moved.sequence, (first?.sequence ?? 0) + 1);
  assert.equal(moved.startDate?.toISOString(), "2032-07-15T00:00:00.000Z");
  const bindings = await listBindings(harness);
  assert.equal(bindings.length, 2, "Frist und Startmarkierung bestehen weiter");
  assert.equal(
    bindings.filter((entry) => entry.kind === "due").length,
    1,
    "Je Aufgabe entsteht höchstens eine Frist",
  );
  assert.equal(
    bindings.filter((entry) => entry.kind === "work_block").length,
    1,
    "Je Aufgabe entsteht höchstens ein Arbeitsblock",
  );

  // Erst mit einer Dauer entsteht der Arbeitsblock – in derselben Änderung.
  await harness.api("PATCH", `/tasks/${task.id}`, {
    estimatedDurationMinutes: 45,
  });
  const blockEvent = await eventRow(harness, managedUid(task.id, "zeitblock"));
  assert.ok(blockEvent);
  assert.equal(blockEvent.uid, managedUid(task.id, "zeitblock"));
  assert.equal(
    (blockEvent.endsAt?.getTime() ?? 0) - (blockEvent.startsAt?.getTime() ?? 0),
    45 * 60_000,
  );
  const blockBinding = (await listBindings(harness)).find(
    (entry) => entry.kind === "work_block",
  );
  assert.equal(blockBinding?.label, "Geplanter Zeitblock");
  assert.equal(blockBinding?.eventKind, "timed");

  // Eine geänderte Dauer bleibt dieselbe Abbildung, ohne neues Ereignis.
  await harness.api("PATCH", `/tasks/${task.id}`, {
    estimatedDurationMinutes: 90,
  });
  const resized = await eventRow(harness, managedUid(task.id, "zeitblock"));
  assert.equal(resized?.id, blockEvent.id);
  assert.equal(resized?.sequence, blockEvent.sequence + 1);
  assert.equal((await listBindings(harness)).length, 2);

  /**
   * Dauer entfernen lässt die Startmarkierung sichtbar: derselbe Datensatz mit
   * derselben UID, aber ohne Ende. Die Frist bleibt unberührt.
   */
  await harness.api("PATCH", `/tasks/${task.id}`, {
    estimatedDurationMinutes: null,
  });
  const afterDurationClear = await listBindings(harness);
  assert.equal(afterDurationClear.length, 2);
  const markerAfterClear = await eventRow(
    harness,
    managedUid(task.id, "zeitblock"),
  );
  assert.equal(markerAfterClear?.id, blockEvent.id);
  assert.equal(markerAfterClear?.isStartMarker, true);
  assert.equal(markerAfterClear?.endsAt, null);
  assert.equal(markerAfterClear?.deletedAt, null);
  assert.equal(
    afterDurationClear.find((entry) => entry.kind === "work_block")?.eventKind,
    "start_only",
  );

  // Frist leeren entfernt genau die Fristabbildung; die Startmarkierung bleibt.
  await harness.api("PATCH", `/tasks/${task.id}`, { dueDate: null });
  const afterClear = await listBindings(harness);
  assert.equal(afterClear.length, 1);
  assert.equal(afterClear[0]?.kind, "work_block");
  const cleared = await eventRow(harness, firstUid);
  assert.ok(cleared?.deletedAt);
  assert.equal(await auditCount(harness, "task.calendar_binding.removed"), 1);

  // Start leeren entfernt die Startmarkierung; damit sind beide Abbildungen weg.
  await harness.api("PATCH", `/tasks/${task.id}`, {
    scheduledStartAt: null,
    scheduledStartTimezone: null,
  });
  assert.equal((await listBindings(harness)).length, 0);
  assert.ok(
    (await eventRow(harness, managedUid(task.id, "zeitblock")))?.deletedAt,
  );
  assert.equal(await auditCount(harness, "task.calendar_binding.removed"), 2);

  // Mit neuem Datum, neuem Beginn und Dauer entstehen wieder zwei Abbildungen.
  await harness.api("PATCH", `/tasks/${task.id}`, {
    dueDate: "2032-08-20",
    scheduledStartAt: "2032-07-15T08:00:00.000Z",
    scheduledStartTimezone: "Europe/Berlin",
    estimatedDurationMinutes: 30,
  });
  assert.equal((await listBindings(harness)).length, 2);

  // Archivieren entfernt die verbliebenen Abbildungen, die Aufgabe bleibt bestehen.
  await harness.api("PATCH", `/tasks/${task.id}`, { archived: true });
  assert.equal((await listBindings(harness)).length, 0);
  const archivedBlock = await eventRow(
    harness,
    managedUid(task.id, "zeitblock"),
  );
  assert.ok(archivedBlock?.deletedAt);
  const archivedTask = await readJson<{ archivedAt: string | null }>(
    await harness.api("GET", `/tasks/${task.id}`),
  );
  assert.ok(archivedTask.archivedAt);

  // Löschen der Aufgabe entfernt Ereignisse, aber keine Daten anderer Aufgaben.
  const other = await createTask(harness, {
    title: "Andere synthetische Aufgabe",
    dueDate: "2032-08-01",
  });
  await harness.api("DELETE", `/tasks/${task.id}`);
  assert.equal((await listBindings(harness)).length, 1);
  assert.equal(
    (await listBindings(harness))[0]?.event.uid,
    managedUid(other.id, "frist"),
  );
});

test("rollt bei einem ETag-Konflikt alles vollständig zurück", async (t) => {
  const harness = await createHarness(t);
  const task = await createTask(harness, {
    title: "Synthetische Aufgabe",
    dueDate: "2032-06-01",
  });
  const uid = managedUid(task.id, "frist");
  const event = await eventRow(harness, uid);
  assert.ok(event);
  const calendarBefore = await calendarRow(harness, harness.calendarId);
  const auditsBefore = await auditCount(
    harness,
    "task.calendar_binding.updated",
  );
  const taskBefore = await readJson<Record<string, unknown>>(
    await harness.api("GET", `/tasks/${task.id}`),
  );

  // Zwischenzeitliche Fremdänderung: der bestätigte ETag ist nicht mehr gültig.
  await harness.database.calendarEvent.update({
    where: { id: event.id },
    data: { etag: '"fremde-zwischenaenderung"', title: "Zwischenstand" },
  });

  const conflict = await harness.api("PATCH", `/tasks/${task.id}`, {
    title: "Neu benannte Aufgabe",
    dueDate: "2032-09-09",
  });
  assert.equal(conflict.status, 412);
  const conflictBody = await readJson<{ error: { code: string } }>(conflict);
  assert.equal(conflictBody.error.code, "PRECONDITION_FAILED");

  // Nichts ist teilweise gespeichert: weder Aufgabe noch Ereignis noch Audit.
  const taskAfter = await readJson<Record<string, unknown>>(
    await harness.api("GET", `/tasks/${task.id}`),
  );
  assert.deepEqual(taskAfter, taskBefore);
  const eventAfter = await eventRow(harness, uid);
  assert.equal(eventAfter?.etag, '"fremde-zwischenaenderung"');
  assert.equal(eventAfter?.title, "Zwischenstand");
  assert.equal(eventAfter?.sequence, event.sequence);
  assert.equal(eventAfter?.syncVersion, event.syncVersion);
  const calendarAfter = await calendarRow(harness, harness.calendarId);
  assert.equal(calendarAfter?.syncToken, calendarBefore?.syncToken);
  assert.equal(
    await auditCount(harness, "task.calendar_binding.updated"),
    auditsBefore,
  );
  const binding = (await listBindings(harness))[0];
  assert.equal(binding?.lastKnownEtag, event.etag);
  assert.equal(binding?.event.etag, '"fremde-zwischenaenderung"');

  // Nach Übernahme der Fremdänderung ist die Aufgabe wieder führbar.
  await harness.database.calendarEvent.update({
    where: { id: event.id },
    data: { etag: binding?.lastKnownEtag },
  });
  const repaired = await harness.api("PATCH", `/tasks/${task.id}`, {
    title: "Neu benannte Aufgabe",
  });
  assert.equal(repaired.status, 200);
  const repairedEvent = await eventRow(harness, uid);
  assert.equal(repairedEvent?.title, "Frist: Neu benannte Aufgabe");
  assert.equal(repairedEvent?.sequence, event.sequence + 1);
});

test("nimmt aus Apple nur Titel, Statuskennzeichnung und Erinnerungen an", async (t) => {
  const harness = await createHarness(t);
  const project = await harness.database.project.create({
    data: { userId: harness.userId, title: "Synthetisches Projekt" },
  });
  const task = await createTask(harness, {
    title: "Synthetische Aufgabe",
    description: "Aufgabentext.",
    priority: "high",
    tags: ["fokus"],
    projectId: project.id,
    dueDate: "2032-06-01",
  });
  const uid = managedUid(task.id, "frist");
  const event = await eventRow(harness, uid);
  assert.ok(event);
  const url = `/caldav/calendars/local/${harness.calendarId}/${encodeURIComponent(
    uid,
  )}.ics`;

  // Titel ändern: die Aufgabe übernimmt genau den Aufgabentitel.
  const renamed = await harness.dav("PUT", url, {
    headers: { "if-match": event.etag, "content-type": "text/calendar" },
    body: ics([
      `UID:${uid}`,
      "SUMMARY:Frist: Aus Apple umbenannt (erledigt)",
      `DESCRIPTION:${icsText(event.description)}`,
      "DTSTART;VALUE=DATE:20320601",
      "DTEND;VALUE=DATE:20320602",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER:-PT15M",
      "DESCRIPTION:Erinnerung",
      "END:VALARM",
    ]),
  });
  assert.equal(renamed.status, 204, await renamed.text());
  const afterRename = await readJson<Record<string, unknown>>(
    await harness.api("GET", `/tasks/${task.id}`),
  );
  assert.equal(afterRename.title, "Aus Apple umbenannt");
  assert.equal(afterRename.status, "done");
  assert.ok(afterRename.completedAt);
  // Fachliche Felder bleiben unangetastet.
  assert.equal(afterRename.priority, "high");
  assert.equal(afterRename.projectId, project.id);
  assert.deepEqual(afterRename.tags, ["fokus"]);
  assert.equal(afterRename.dueDate, "2032-06-01");
  assert.equal(afterRename.description, "Aufgabentext.");
  // Erinnerungen liegen ausschließlich am Ereignis.
  const withReminder = await harness.database.calendarEvent.findFirst({
    where: { id: event.id },
    select: { reminderMinutes: true, etag: true, title: true },
  });
  assert.deepEqual(withReminder?.reminderMinutes, [15]);
  assert.equal(withReminder?.title, "Frist: Aus Apple umbenannt (erledigt)");

  // Wiederöffnen: die Statuskennzeichnung entfällt.
  const reopened = await harness.dav("PUT", url, {
    headers: {
      "if-match": withReminder?.etag ?? "",
      "content-type": "text/calendar",
    },
    body: ics([
      `UID:${uid}`,
      "SUMMARY:Frist: Aus Apple umbenannt",
      `DESCRIPTION:${icsText(event.description)}`,
      "DTSTART;VALUE=DATE:20320601",
      "DTEND;VALUE=DATE:20320602",
    ]),
  });
  assert.equal(reopened.status, 204, await reopened.text());
  const afterReopen = await readJson<Record<string, unknown>>(
    await harness.api("GET", `/tasks/${task.id}`),
  );
  assert.equal(afterReopen.status, "open");
  assert.equal(afterReopen.completedAt, null);

  // Eine verschobene Frist ist eine unterstützte Änderung: der neue Tag wird
  // zum Fälligkeitstag der Aufgabe, die andere Fachangabe bleibt unberührt.
  const beforeMove = await eventRow(harness, uid);
  assert.ok(beforeMove);
  const movedResponse = await harness.dav("PUT", url, {
    headers: {
      "if-match": beforeMove.etag,
      "content-type": "text/calendar",
    },
    body: ics([
      `UID:${uid}`,
      "SUMMARY:Frist: Aus Apple umbenannt",
      `DESCRIPTION:${icsText(beforeMove.description)}`,
      "DTSTART;VALUE=DATE:20320701",
      "DTEND;VALUE=DATE:20320702",
    ]),
  });
  assert.equal(movedResponse.status, 204, await movedResponse.text());
  const afterMove = await readJson<Record<string, unknown>>(
    await harness.api("GET", `/tasks/${task.id}`),
  );
  assert.equal(afterMove.dueDate, "2032-07-01");
  assert.equal(afterMove.scheduledStartAt, null);
  assert.equal(afterMove.estimatedDurationMinutes, null);
  const movedEvent = await eventRow(harness, uid);
  assert.ok(movedEvent?.startDate);
  assert.equal(movedEvent?.startDate.toISOString().slice(0, 10), "2032-07-01");

  // Nicht unterstützte Änderungen: Wiederholung, Beschreibung, Ort.
  const before = await eventRow(harness, uid);
  assert.ok(before);
  const unsupported = [
    {
      name: "Wiederholung",
      body: ics([
        `UID:${uid}`,
        "SUMMARY:Frist: Aus Apple umbenannt",
        `DESCRIPTION:${icsText(before.description)}`,
        "DTSTART;VALUE=DATE:20320701",
        "DTEND;VALUE=DATE:20320702",
        "RRULE:FREQ=DAILY",
      ]),
    },
    {
      name: "Beschreibung",
      body: ics([
        `UID:${uid}`,
        "SUMMARY:Frist: Aus Apple umbenannt",
        "DESCRIPTION:Von Apple überschriebener Text",
        "DTSTART;VALUE=DATE:20320701",
        "DTEND;VALUE=DATE:20320702",
      ]),
    },
    {
      name: "Ort",
      body: ics([
        `UID:${uid}`,
        "SUMMARY:Frist: Aus Apple umbenannt",
        `DESCRIPTION:${icsText(before.description)}`,
        "LOCATION:Berlin",
        "DTSTART;VALUE=DATE:20320701",
        "DTEND;VALUE=DATE:20320702",
      ]),
    },
  ];
  for (const variant of unsupported) {
    const response = await harness.dav("PUT", url, {
      headers: {
        "if-match": (await eventRow(harness, uid))?.etag ?? "",
        "content-type": "text/calendar",
      },
      body: variant.body,
    });
    assert.equal(response.status, 409, `Abgelehnt: ${variant.name}`);
    const after = await eventRow(harness, uid);
    assert.equal(after?.etag, before.etag, `Unverändert: ${variant.name}`);
    assert.equal(after?.sequence, before.sequence);
    assert.equal(
      after?.description,
      before.description,
      `Beschreibung unverändert: ${variant.name}`,
    );
  }
  // Auch danach bleibt genau eine Abbildung ohne Duplikat bestehen.
  assert.equal((await listBindings(harness)).length, 1);
  assert.equal(
    await harness.database.calendarEvent.count({
      where: { userId: harness.userId },
    }),
    1,
  );
});

test("bildet „Start ohne Dauer“ als sichtbare Startmarkierung ohne erfundenes Ende ab", async (t) => {
  const harness = await createHarness(t);
  const task = await createTask(harness, {
    title: "Synthetische Aufgabe",
    scheduledStartAt: "2032-06-01T08:00:00.000Z",
    scheduledStartTimezone: "Europe/Berlin",
  });
  const uid = managedUid(task.id, "zeitblock");
  const url = `/caldav/calendars/local/${harness.calendarId}/${encodeURIComponent(
    uid,
  )}.ics`;

  /**
   * Ohne Dauer entsteht eine sichtbare Startmarkierung: ein zeitgebundenes
   * Ereignis mit DTSTART und ohne DTEND. Es wird kein Ende und keine Dauer
   * erfunden, und die Aufgabe bleibt führend.
   */
  const marker = await eventRow(harness, uid);
  assert.ok(marker, "Die Startmarkierung entsteht als Ereignis");
  assert.equal(marker.isAllDay, false);
  assert.equal(marker.isStartMarker, true);
  assert.equal(marker.startsAt?.toISOString(), "2032-06-01T08:00:00.000Z");
  assert.equal(marker.endsAt, null, "Es wird kein Ende erfunden");
  assert.equal(marker.startDate, null);
  assert.equal(marker.endDate, null);
  assert.equal(marker.title, "Start: Synthetische Aufgabe");
  const bindings = await listBindings(harness);
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0]?.kind, "work_block");
  assert.equal(bindings[0]?.eventKind, "start_only");
  const readTask = await readJson<Record<string, unknown>>(
    await harness.api("GET", `/tasks/${task.id}`),
  );
  assert.equal(readTask.scheduledStartAt, "2032-06-01T08:00:00.000Z");
  assert.equal(readTask.estimatedDurationMinutes, null);

  /**
   * Apple-kompatible Darstellung: der abgerufene iCalendar-Text enthält genau
   * `DTSTART` und kein `DTEND` und keine `DURATION`.
   */
  const fetched = await harness.dav("GET", url, {
    headers: { accept: "text/calendar" },
  });
  assert.equal(fetched.status, 200);
  const body = await fetched.text();
  assert.match(body, /DTSTART(;[^:]*)?:20320601T100000/);
  assert.doesNotMatch(body, /DTEND/);
  assert.doesNotMatch(body, /DURATION/);

  /**
   * Eine Aufforderung mit `DTEND` (Apple verlängert den Block) ergänzt die
   * Dauer in der Aufgabe; das Ereignis bleibt dasselbe mit stabiler UID.
   */
  const extended = await harness.dav("PUT", url, {
    headers: { "if-match": marker.etag, "content-type": "text/calendar" },
    body: ics([
      `UID:${uid}`,
      "SUMMARY:Start: Synthetische Aufgabe",
      `DESCRIPTION:${icsText(marker.description)}`,
      "DTSTART;TZID=Europe/Berlin:20320601T100000",
      "DTEND;TZID=Europe/Berlin:20320601T110000",
    ]),
  });
  assert.equal(extended.status, 204, await extended.text());
  const timedEvent = await eventRow(harness, uid);
  assert.equal(timedEvent?.id, marker.id, "Die stabile UID bleibt erhalten");
  assert.equal(timedEvent?.isStartMarker, false);
  assert.equal(
    (timedEvent?.endsAt?.getTime() ?? 0) -
      (timedEvent?.startsAt?.getTime() ?? 0),
    60 * 60_000,
  );
  const withDuration = await readJson<Record<string, unknown>>(
    await harness.api("GET", `/tasks/${task.id}`),
  );
  assert.equal(withDuration.estimatedDurationMinutes, 60);
  assert.equal(
    (await listBindings(harness))[0]?.eventKind,
    "timed",
    "Die Abbildungsart bleibt dieselbe, nur die Form wechselt",
  );

  /** Eine Dauer von null bleibt ungültig: es wird kein Ende erfunden. */
  const withoutEnd = await harness.dav("PUT", url, {
    headers: {
      "if-match": (await eventRow(harness, uid))?.etag ?? "",
      "content-type": "text/calendar",
    },
    body: ics([
      `UID:${uid}`,
      "SUMMARY:Zeitblock: Synthetische Aufgabe",
      `DESCRIPTION:${icsText((await eventRow(harness, uid))?.description)}`,
      "DTSTART;TZID=Europe/Berlin:20320601T100000",
      "DURATION:PT0S",
    ]),
  });
  const withoutEndBody = await withoutEnd.text();
  assert.equal(withoutEnd.status, 400, withoutEndBody);
  assert.match(withoutEndBody, /DURATION/);
  const unchanged = await eventRow(harness, uid);
  assert.equal(unchanged?.startsAt?.toISOString(), "2032-06-01T08:00:00.000Z");
  assert.equal(unchanged?.endsAt?.toISOString(), "2032-06-01T09:00:00.000Z");

  /**
   * Ohne `If-Match` bleibt der Zustand unangetastet: die Vorbedingung fehlt.
   */
  const withoutPrecondition = await harness.dav("PUT", url, {
    headers: { "content-type": "text/calendar" },
    body: ics([
      `UID:${uid}`,
      "SUMMARY:Zeitblock: Synthetische Aufgabe",
      `DESCRIPTION:${icsText((await eventRow(harness, uid))?.description)}`,
      "DTSTART;TZID=Europe/Berlin:20320601T100000",
      "DTEND;TZID=Europe/Berlin:20320601T113000",
    ]),
  });
  assert.equal(withoutPrecondition.status, 428);
  const unchangedTask = await readJson<{ estimatedDurationMinutes: number }>(
    await harness.api("GET", `/tasks/${task.id}`),
  );
  assert.equal(unchangedTask.estimatedDurationMinutes, 60);

  /**
   * Löschen der Startmarkierung über CalDAV entfernt nur den geplanten Start;
   * die geschätzte Dauer der Aufgabe bleibt erhalten, das Ereignis verschwindet
   * und es bleibt keine aktive verwaltete Abbildung zurück.
   */
  await harness.database.task.update({
    where: { id: task.id },
    data: {
      estimatedDurationMinutes: 45,
      scheduledStartAt: new Date("2032-06-01T08:00:00.000Z"),
      scheduledStartTimezone: "Europe/Berlin",
    },
  });
  await harness.database.calendarEvent.update({
    where: { id: marker.id },
    data: { endsAt: null, isStartMarker: true },
  });
  const beforeDeletion = await eventRow(harness, uid);
  assert.ok(beforeDeletion);
  const deleted = await harness.dav("DELETE", url, {
    headers: { "if-match": beforeDeletion.etag },
  });
  assert.equal(deleted.status, 204, await deleted.text());
  const afterStartRemoval = await readJson<Record<string, unknown>>(
    await harness.api("GET", `/tasks/${task.id}`),
  );
  assert.equal(afterStartRemoval.scheduledStartAt, null);
  assert.equal(afterStartRemoval.scheduledStartTimezone, null);
  assert.equal(
    afterStartRemoval.estimatedDurationMinutes,
    45,
    "Beim Löschen der Startmarkierung wird nur der geplante Start entfernt",
  );
  assert.ok(
    (await eventRow(harness, uid))?.deletedAt,
    "Das Ereignis ist als entfernt markiert",
  );
  assert.equal(
    await harness.database.calendarEvent.count({
      where: { userId: harness.userId, deletedAt: null },
    }),
    0,
    "Ohne geplanten Start bleibt kein aktives Ereignis zurück",
  );
  assert.equal((await listBindings(harness)).length, 0);
});

test("führt nach einer Apple-Änderung beide verwalteten Abbildungen derselben Aufgabe nach", async (t) => {
  const harness = await createHarness(t);
  const task = await createTask(harness, {
    title: "Synthetische Aufgabe",
    dueDate: "2032-06-01",
    scheduledStartAt: "2032-06-01T08:00:00.000Z",
    scheduledStartTimezone: "Europe/Berlin",
    estimatedDurationMinutes: 60,
  });
  const dueUid = managedUid(task.id, "frist");
  const blockUid = managedUid(task.id, "zeitblock");
  const dueUrl = `/caldav/calendars/local/${harness.calendarId}/${encodeURIComponent(
    dueUid,
  )}.ics`;

  // Das Fristereignis trägt eine Erinnerung, der Arbeitsblock bleibt ohne.
  const dueBefore = await eventRow(harness, dueUid);
  const blockBefore = await eventRow(harness, blockUid);
  assert.ok(dueBefore && blockBefore);
  const withReminder = await harness.dav("PUT", dueUrl, {
    headers: { "if-match": dueBefore.etag, "content-type": "text/calendar" },
    body: ics([
      `UID:${dueUid}`,
      `SUMMARY:${icsText(dueBefore.title)}`,
      `DESCRIPTION:${icsText(dueBefore.description)}`,
      "DTSTART;VALUE=DATE:20320601",
      "DTEND;VALUE=DATE:20320602",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER:-PT15M",
      "DESCRIPTION:Erinnerung",
      "END:VALARM",
    ]),
  });
  assert.equal(withReminder.status, 204, await withReminder.text());

  /**
   * Titel und Status werden am Fristereignis geändert. Danach müssen beide
   * verwalteten Abbildungen derselben Aufgabe denselben führenden Feldern
   * folgen – sonst bliebe der Arbeitsblock mit dem alten Titel stehen.
   */
  const currentDue = await eventRow(harness, dueUid);
  assert.ok(currentDue);
  const renamed = await harness.dav("PUT", dueUrl, {
    headers: { "if-match": currentDue.etag, "content-type": "text/calendar" },
    body: ics([
      `UID:${dueUid}`,
      "SUMMARY:Frist: Aus Apple umbenannt (erledigt)",
      `DESCRIPTION:${icsText(currentDue.description)}`,
      "DTSTART;VALUE=DATE:20320601",
      "DTEND;VALUE=DATE:20320602",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER:-PT15M",
      "DESCRIPTION:Erinnerung",
      "END:VALARM",
    ]),
  });
  assert.equal(renamed.status, 204, await renamed.text());

  const dueAfter = await eventRow(harness, dueUid);
  const blockAfter = await eventRow(harness, blockUid);
  assert.equal(dueAfter?.title, "Frist: Aus Apple umbenannt (erledigt)");
  assert.equal(
    blockAfter?.title,
    "Zeitblock: Aus Apple umbenannt (erledigt)",
    "Die zweite Abbildung folgt demselben Aufgabentitel",
  );
  assert.deepEqual(
    dueAfter?.reminderMinutes,
    [15],
    "Erinnerungen des bearbeiteten Ereignisses bleiben erhalten",
  );
  assert.deepEqual(blockAfter?.reminderMinutes, []);
  assert.equal(
    (blockAfter?.endsAt?.getTime() ?? 0) -
      (blockAfter?.startsAt?.getTime() ?? 0),
    60 * 60_000,
    "Die Dauer des Arbeitsblocks bleibt unangetastet",
  );

  // Keine Duplikate, beide UIDs stabil, beide Abbildungen aktiv.
  const activeRows = await harness.database.calendarEvent.findMany({
    where: { userId: harness.userId, deletedAt: null },
    orderBy: { uid: "asc" },
  });
  assert.equal(activeRows.length, 2);
  assert.deepEqual(
    activeRows.map((row) => row.uid).sort(),
    [dueUid, blockUid].sort(),
  );
  assert.equal(activeRows.find((row) => row.uid === dueUid)?.id, dueBefore.id);
  assert.equal(
    activeRows.find((row) => row.uid === blockUid)?.id,
    blockBefore.id,
  );
  const bindings = await listBindings(harness);
  assert.equal(bindings.length, 2);
  assert.ok(bindings.every((entry) => entry.status === "active"));

  // Die Aufgabe führt Titel und Status; die Fachangaben bleiben unberührt.
  const readTask = await readJson<Record<string, unknown>>(
    await harness.api("GET", `/tasks/${task.id}`),
  );
  assert.equal(readTask.title, "Aus Apple umbenannt");
  assert.equal(readTask.status, "done");
  assert.equal(readTask.dueDate, "2032-06-01");
  assert.equal(readTask.scheduledStartAt, "2032-06-01T08:00:00.000Z");
  assert.equal(readTask.estimatedDurationMinutes, 60);

  // Beide Ereignisse sind über CalDAV im neuen Zustand abrufbar.
  for (const uid of [dueUid, blockUid]) {
    const fetched = await harness.dav(
      "GET",
      `/caldav/calendars/local/${harness.calendarId}/${encodeURIComponent(uid)}.ics`,
      { headers: { accept: "text/calendar" } },
    );
    assert.equal(fetched.status, 200);
    assert.match(await fetched.text(), /Aus Apple umbenannt \(erledigt\)/);
  }
});

/**
 * Simuliert eine konkurrierende Fremdänderung zwischen Lesen und Schreiben:
 * Die Fremdtransaktion ändert den ETag, hält die Sperre auf der Zeile und
 * gibt sie erst frei, wenn der geprüfte Schreibvorgang darauf wartet. Dadurch
 * liest der geprüfte Vorgang den alten Stand und schreibt gegen den neuen.
 */
const withCompetingEtagChange = async <T>(
  harness: Harness,
  eventId: string,
  run: () => Promise<T>,
  competingEtag: string,
): Promise<{ result: T | null; error: unknown }> => {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const competing = harness.database.$transaction(async (transaction) => {
    await transaction.calendarEvent.update({
      where: { id: eventId },
      data: { etag: competingEtag },
    });
    await held;
  });
  const wait = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));
  try {
    // Der Fremdschreibvorgang ist noch nicht bestätigt: der geprüfte Vorgang
    // liest deshalb weiterhin den alten Stand.
    await wait(150);
    const attempt = run().then(
      (result) => ({ result, error: null as unknown }),
      (error: unknown) => ({ result: null, error }),
    );
    // Der geprüfte Schreibvorgang wartet nun auf die Zeilensperre.
    await wait(250);
    release();
    await competing;
    const settled = await attempt;
    return { result: settled.result, error: settled.error };
  } finally {
    release();
    await competing;
  }
};

test("prüft beim Löschen den ETag atomar und rollt bei einer konkurrierenden Änderung alles zurück", async (t) => {
  const harness = await createHarness(t);
  const task = await createTask(harness, {
    title: "Synthetische Aufgabe",
    dueDate: "2032-06-01",
  });
  const uid = managedUid(task.id, "frist");
  const event = await eventRow(harness, uid);
  assert.ok(event);
  const calendarBefore = await calendarRow(harness, harness.calendarId);
  const bindingBefore = await harness.database.taskCalendarBinding.findFirst({
    where: { userId: harness.userId, taskId: task.id },
  });
  assert.ok(calendarBefore && bindingBefore);
  const auditBefore = await auditCount(
    harness,
    "task.calendar_binding.removed",
  );

  const competingEtag = '"fremd-konkurrierend"';
  const attempt = await withCompetingEtagChange(
    harness,
    event.id,
    () =>
      harness.bindings.removeManagedEvent(harness.userId, {
        calendarExternalId: harness.calendarId,
        uid,
        expectedEtag: event.etag,
      }),
    competingEtag,
  );

  /**
   * Die konkurrierende Änderung darf nicht überschrieben werden: es entsteht
   * ein ETag-Konflikt und die gesamte Transaktion wird zurückgerollt.
   */
  assert.ok(attempt.error, "Der Löschversuch muss abgelehnt werden");
  assert.equal(
    (attempt.error as { status?: number }).status,
    412,
    `Erwartet 412, erhalten: ${String(attempt.error)}`,
  );

  const after = await eventRow(harness, uid);
  assert.equal(after?.etag, competingEtag, "Der fremde Stand bleibt erhalten");
  assert.equal(after?.deletedAt, null, "Das Ereignis bleibt ungelöscht");
  assert.equal(
    after?.sequence,
    event.sequence,
    "Keine halb ausgeführte Änderung am Ereignis",
  );
  const readTask = await readJson<Record<string, unknown>>(
    await harness.api("GET", `/tasks/${task.id}`),
  );
  assert.equal(
    readTask.dueDate,
    "2032-06-01",
    "Die Aufgabe bleibt unverändert",
  );
  const calendarAfter = await calendarRow(harness, harness.calendarId);
  assert.equal(
    calendarAfter?.syncToken,
    calendarBefore.syncToken,
    "Der Sync-Token des Kalenders bleibt unverändert",
  );
  const bindingAfter = await harness.database.taskCalendarBinding.findFirst({
    where: { userId: harness.userId, taskId: task.id },
  });
  assert.equal(bindingAfter?.lastKnownEtag, bindingBefore.lastKnownEtag);
  assert.equal(
    await auditCount(harness, "task.calendar_binding.removed"),
    auditBefore,
    "Es entsteht kein Audit-Eintrag für eine abgebrochene Löschung",
  );
  assert.equal((await listBindings(harness))[0]?.status, "active");
});

test("überführt ein verwaltetes Ereignis beim Wechsel des Primärkalenders atomar", async (t) => {
  const harness = await createHarness(t);
  const task = await createTask(harness, {
    title: "Synthetische Aufgabe",
    dueDate: "2032-06-01",
  });
  const uid = managedUid(task.id, "frist");
  const before = await eventRow(harness, uid);
  const oldCalendar = await calendarRow(harness, harness.calendarId);
  const newCalendar = await calendarRow(harness, harness.secondaryCalendarId);
  assert.ok(before && oldCalendar && newCalendar);
  assert.equal(before.calendarId, oldCalendar.id);

  // Wechsel des persönlichen Primärkalenders: der Zweitkalender wird primär.
  await harness.database.calendar.updateMany({
    where: { userId: harness.userId, isPrimary: true },
    data: { isPrimary: false },
  });
  await harness.database.calendar.update({
    where: { id: newCalendar.id },
    data: { isPrimary: true },
  });

  // Eine Aufgabenänderung richtet die verwaltete Abbildung neu aus.
  await harness.api("PATCH", `/tasks/${task.id}`, {
    title: "Synthetische Aufgabe (neu)",
  });

  const rows = await harness.database.calendarEvent.findMany({
    where: { userId: harness.userId, uid },
  });
  const active = rows.filter((row) => row.deletedAt === null);
  assert.equal(active.length, 1, "Genau ein aktives verwaltetes Ereignis");
  assert.equal(active[0]?.calendarId, newCalendar.id);
  assert.equal(active[0]?.uid, uid, "Die stabile UID bleibt erhalten");
  assert.equal(active[0]?.title, "Frist: Synthetische Aufgabe (neu)");
  const removed = rows.find((row) => row.calendarId === oldCalendar.id);
  assert.ok(
    removed?.deletedAt,
    "Der alte Kalender behält eine nachvollziehbare Löschmarkierung",
  );
  assert.notEqual(removed?.etag, before.etag);

  // Das Binding verweist auf das Ereignis im neuen Primärkalender.
  const binding = (await listBindings(harness)).find(
    (entry) => entry.kind === "due",
  );
  assert.equal(binding?.event.calendarId, harness.secondaryCalendarId);
  assert.equal(binding?.event.uid, uid);
  assert.equal(binding?.status, "active");

  // Sync-Token beider Kalender werden fortgeschrieben.
  const oldAfter = await calendarRow(harness, harness.calendarId);
  const newAfter = await calendarRow(harness, harness.secondaryCalendarId);
  assert.ok((oldAfter?.syncToken ?? 0) > oldCalendar.syncToken);
  assert.ok((newAfter?.syncToken ?? 0) > newCalendar.syncToken);

  // CalDAV: im neuen Kalender ist die Ressource abrufbar, im alten nicht mehr.
  const movedUrl = `/caldav/calendars/local/${harness.secondaryCalendarId}/${encodeURIComponent(
    uid,
  )}.ics`;
  const fetched = await harness.dav("GET", movedUrl, {
    headers: { accept: "text/calendar" },
  });
  assert.equal(fetched.status, 200);
  assert.match(await fetched.text(), /Synthetische Aufgabe \(neu\)/);
  const stale = await harness.dav(
    "GET",
    `/caldav/calendars/local/${harness.calendarId}/${encodeURIComponent(uid)}.ics`,
  );
  assert.equal(stale.status, 404, "Die alte Ressource ist sichtbar entfernt");
  /** Der neue Kalender meldet die Ressource in seiner Sammlung. */
  const listing = await harness.dav(
    "PROPFIND",
    `/caldav/calendars/local/${harness.secondaryCalendarId}`,
    {
      headers: { depth: "1", "content-type": "application/xml" },
      body: `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:getetag/></d:prop></d:propfind>`,
    },
  );
  assert.equal(listing.status, 207);
  assert.match(await listing.text(), new RegExp(encodeURIComponent(uid)));
});

test("rollt einen Wechsel des Primärkalenders bei einer konkurrierenden Änderung vollständig zurück", async (t) => {
  const harness = await createHarness(t);
  const task = await createTask(harness, {
    title: "Synthetische Aufgabe",
    dueDate: "2032-06-01",
  });
  const uid = managedUid(task.id, "frist");
  const before = await eventRow(harness, uid);
  const oldCalendar = await calendarRow(harness, harness.calendarId);
  const newCalendar = await calendarRow(harness, harness.secondaryCalendarId);
  const bindingBefore = await harness.database.taskCalendarBinding.findFirst({
    where: { userId: harness.userId, taskId: task.id },
  });
  assert.ok(before && oldCalendar && newCalendar && bindingBefore);
  const auditBefore = await auditCount(
    harness,
    "task.calendar_binding.updated",
  );

  await harness.database.calendar.updateMany({
    where: { userId: harness.userId, isPrimary: true },
    data: { isPrimary: false },
  });
  await harness.database.calendar.update({
    where: { id: newCalendar.id },
    data: { isPrimary: true },
  });

  const competingEtag = '"fremd-konkurrierend"';
  const attempt = await withCompetingEtagChange(
    harness,
    before.id,
    async () => {
      await harness.database.$transaction((transaction) =>
        harness.bindings.synchronizeTask(transaction, harness.userId, task.id),
      );
    },
    competingEtag,
  );
  assert.ok(attempt.error, "Die Ausrichtung muss abgelehnt werden");

  /**
   * Keine halbe Verschiebung: weder ein aktives Ereignis im neuen Kalender
   * noch ein doppeltes aktives Ereignis, und beide Sync-Token bleiben stehen.
   */
  const rows = await harness.database.calendarEvent.findMany({
    where: { userId: harness.userId, uid },
  });
  const active = rows.filter((row) => row.deletedAt === null);
  assert.equal(active.length, 1);
  assert.equal(active[0]?.calendarId, oldCalendar.id);
  assert.equal(active[0]?.etag, competingEtag);
  assert.equal(
    rows.filter((row) => row.calendarId === newCalendar.id).length,
    0,
    "Im neuen Kalender bleibt kein Rest zurück",
  );
  const oldAfter = await calendarRow(harness, harness.calendarId);
  const newAfter = await calendarRow(harness, harness.secondaryCalendarId);
  assert.equal(oldAfter?.syncToken, oldCalendar.syncToken);
  assert.equal(newAfter?.syncToken, newCalendar.syncToken);
  const bindingAfter = await harness.database.taskCalendarBinding.findFirst({
    where: { userId: harness.userId, taskId: task.id },
  });
  assert.equal(bindingAfter?.calendarEventId, bindingBefore.calendarEventId);
  assert.equal(bindingAfter?.lastKnownEtag, bindingBefore.lastKnownEtag);
  assert.equal(
    await auditCount(harness, "task.calendar_binding.updated"),
    auditBefore,
  );

  /**
   * Der erneute Lauf rät nicht: Solange der fremde Stand nicht bestätigt ist,
   * bleibt die Abbildung im alten Kalender, das Ereignis unangetastet und der
   * Befund sichtbar.
   */
  const secondRun = await harness.bindings.reconcile(harness.userId);
  assert.equal(secondRun.repaired, 0);
  assert.equal(secondRun.ambiguous.length, 1);
  assert.match(secondRun.ambiguous[0]?.reason ?? "", /ausrichten/);
  const stillOne = await harness.database.calendarEvent.findMany({
    where: { userId: harness.userId, uid, deletedAt: null },
  });
  assert.equal(stillOne.length, 1);
  assert.equal(stillOne[0]?.calendarId, oldCalendar.id);
  assert.equal(stillOne[0]?.etag, competingEtag);

  /**
   * Nach Bestätigung des fremden Stands richtet derselbe Lauf die Abbildung
   * atomar aus: genau ein aktives Ereignis, stabile UID, im neuen Kalender.
   */
  await harness.database.taskCalendarBinding.update({
    where: { id: bindingBefore.id },
    data: { lastKnownEtag: competingEtag },
  });
  const thirdRun = await harness.bindings.reconcile(harness.userId);
  assert.equal(thirdRun.repaired, 1);
  const repaired = await harness.database.calendarEvent.findMany({
    where: { userId: harness.userId, uid, deletedAt: null },
  });
  assert.equal(repaired.length, 1);
  assert.equal(repaired[0]?.uid, uid, "Die stabile UID bleibt erhalten");
  assert.equal(
    repaired[0]?.calendarId,
    newCalendar.id,
    "Nach dem erneuten Lauf liegt das Ereignis im neuen Primärkalender",
  );
  const afterThirdRun =
    await harness.database.taskCalendarBinding.findFirstOrThrow({
      where: { userId: harness.userId, taskId: task.id },
    });
  assert.equal(afterThirdRun.calendarEventId, repaired[0]?.id);
  assert.equal(
    await harness.database.calendarEvent.count({
      where: { userId: harness.userId, uid },
    }),
    2,
    "Genau eine aktive Kopie und eine sichtbare Entfernung im alten Kalender",
  );
});

test("löscht verwaltete Ereignisse über beide Schreibpfade, ohne die Aufgabe zu löschen", async (t) => {
  const harness = await createHarness(t);
  const task = await createTask(harness, {
    title: "Synthetische Aufgabe",
    dueDate: "2032-06-01",
    scheduledStartAt: "2032-06-01T08:00:00.000Z",
    scheduledStartTimezone: "Europe/Berlin",
    estimatedDurationMinutes: 60,
  });

  // CalDAV-Löschung der Frist: Aufgabe bleibt, Fristbezug entfällt.
  const dueEvent = await eventRow(harness, managedUid(task.id, "frist"));
  assert.ok(dueEvent);
  const deleted = await harness.dav(
    "DELETE",
    `/caldav/calendars/local/${harness.calendarId}/${encodeURIComponent(
      managedUid(task.id, "frist"),
    )}.ics`,
    { headers: { "if-match": dueEvent.etag } },
  );
  assert.equal(deleted.status, 204, await deleted.text());
  const afterDav = await readJson<Record<string, unknown>>(
    await harness.api("GET", `/tasks/${task.id}`),
  );
  assert.equal(afterDav.dueDate, null);
  assert.equal(afterDav.title, "Synthetische Aufgabe");
  assert.ok((await eventRow(harness, managedUid(task.id, "frist")))?.deletedAt);
  const remaining = await listBindings(harness);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0]?.kind, "work_block");

  // REST-Löschung des Arbeitsblocks: Start und Dauer entfallen.
  const blockEvent = await eventRow(harness, managedUid(task.id, "zeitblock"));
  assert.ok(blockEvent);
  const restDeleted = await harness.api(
    "DELETE",
    `/calendars/${harness.calendarId}/events/${encodeURIComponent(
      managedUid(task.id, "zeitblock"),
    )}`,
    undefined,
    { "if-match": blockEvent.etag },
  );
  assert.equal(restDeleted.status, 204, await restDeleted.text());
  const afterRest = await readJson<Record<string, unknown>>(
    await harness.api("GET", `/tasks/${task.id}`),
  );
  assert.equal(afterRest.scheduledStartAt, null);
  assert.equal(afterRest.estimatedDurationMinutes, null);
  assert.equal(afterRest.title, "Synthetische Aufgabe");
  assert.equal(afterRest.status, "open");
  assert.equal((await listBindings(harness)).length, 0);
  assert.equal(await auditCount(harness, "task.calendar_binding.removed"), 2);

  // Ein erneutes Setzen derselben Angaben baut genau eine Abbildung wieder auf.
  await harness.api("PATCH", `/tasks/${task.id}`, { dueDate: "2032-06-01" });
  const rebuilt = await listBindings(harness);
  assert.equal(rebuilt.length, 1);
  assert.equal(rebuilt[0]?.event.uid, managedUid(task.id, "frist"));
  const repaired = await eventRow(harness, managedUid(task.id, "frist"));
  assert.equal(repaired?.deletedAt, null);
  assert.equal(
    await harness.database.calendarEvent.count({
      where: { userId: harness.userId, uid: managedUid(task.id, "frist") },
    }),
    1,
    "Es entsteht kein zweites Ereignis mit derselben UID",
  );
});

test("lehnt einen Kalenderwechsel atomar ab und lässt normale Ereignisse unverändert", async (t) => {
  const harness = await createHarness(t);
  const task = await createTask(harness, {
    title: "Synthetische Aufgabe",
    dueDate: "2032-06-01",
  });
  const uid = managedUid(task.id, "frist");
  const event = await eventRow(harness, uid);
  assert.ok(event);
  const managedMove = await harness.dav(
    "MOVE",
    `/caldav/calendars/local/${harness.calendarId}/${encodeURIComponent(
      uid,
    )}.ics`,
    {
      headers: {
        destination: `/caldav/calendars/local/${harness.secondaryCalendarId}/${encodeURIComponent(
          uid,
        )}.ics`,
      },
    },
  );
  assert.equal(managedMove.status, 403);
  assert.match(await managedMove.text(), /Kalenderwechsel/);
  const afterMove = await eventRow(harness, uid);
  assert.equal(afterMove?.etag, event.etag);
  assert.equal(afterMove?.sequence, event.sequence);

  // Ein normales Ereignis ohne verwaltete Abbildung behält sein Verhalten.
  const normalUid = `normal-${randomUUID()}@lifeos.local`;
  const normalUrl = `/caldav/calendars/local/${harness.calendarId}/${encodeURIComponent(
    normalUid,
  )}.ics`;
  const normal = await harness.dav("PUT", normalUrl, {
    headers: { "if-none-match": "*", "content-type": "text/calendar" },
    body: ics([
      `UID:${normalUid}`,
      "SUMMARY:Synthetischer Normalfall",
      "DTSTART;TZID=Europe/Berlin:20320602T100000",
      "DTEND;TZID=Europe/Berlin:20320602T110000",
      "RRULE:FREQ=WEEKLY;COUNT=2",
    ]),
  });
  assert.equal(normal.status, 201, await normal.text());
  const normalMove = await harness.dav("MOVE", normalUrl, {
    headers: {
      destination: `/caldav/calendars/local/${harness.secondaryCalendarId}/${encodeURIComponent(
        normalUid,
      )}.ics`,
    },
  });
  assert.equal(normalMove.status, 405);
  const normalRow = await eventRow(harness, normalUid);
  assert.equal(normalRow?.recurrenceRule, "FREQ=WEEKLY;COUNT=2");
  assert.equal(normalRow?.deletedAt, null);

  // Ein vollständiges Apple-PUT ohne Änderung bleibt auch für die Wiederholung gültig.
  const repeated = await harness.dav("PUT", normalUrl, {
    headers: {
      "if-match": normalRow?.etag ?? "",
      "content-type": "text/calendar",
    },
    body: ics([
      `UID:${normalUid}`,
      "SUMMARY:Synthetischer Normalfall",
      "DTSTART;TZID=Europe/Berlin:20320602T100000",
      "DTEND;TZID=Europe/Berlin:20320602T110000",
      "RRULE:FREQ=WEEKLY;COUNT=2",
    ]),
  });
  assert.equal(repeated.status, 204, await repeated.text());
  assert.equal((await listBindings(harness)).length, 1);
});

test("achtet Besitzergrenzen und macht fremde Aufgaben und Kalender nicht sichtbar", async (t) => {
  const harness = await createHarness(t);
  const foreignTask = await harness.database.task.create({
    data: {
      userId: harness.otherUserId,
      title: "Fremde Aufgabe",
      dueDate: new Date("2032-06-01T00:00:00.000Z"),
    },
  });
  // Fremde Aufgabe ohne verwaltete Abbildung: es entsteht nichts.
  assert.equal((await listBindings(harness)).length, 0);
  assert.equal(
    await harness.database.taskCalendarBinding.count({
      where: { userId: harness.otherUserId },
    }),
    0,
  );
  const foreignTaskRead = await harness.api("GET", `/tasks/${foreignTask.id}`);
  assert.equal(foreignTaskRead.status, 404);

  // Fremdes Ereignis über den eigenen Kalender ist nicht lesbar.
  const foreignEvent = await harness.database.calendarEvent.create({
    data: {
      userId: harness.otherUserId,
      calendarId: (
        await harness.database.calendar.findFirstOrThrow({
          where: { userId: harness.otherUserId, isPrimary: true },
        })
      ).id,
      uid: `fremd-${randomUUID()}@lifeos.local`,
      title: "Fremdes Ereignis",
      startsAt: new Date("2032-06-01T08:00:00.000Z"),
      endsAt: new Date("2032-06-01T09:00:00.000Z"),
      timezone: "Europe/Berlin",
      etag: '"fremd-v1"',
    },
  });
  const foreignDavRead = await harness.dav(
    "GET",
    `/caldav/calendars/local/${harness.calendarId}/${encodeURIComponent(
      foreignEvent.uid,
    )}.ics`,
  );
  assert.equal(foreignDavRead.status, 404);
  const foreignDelete = await harness.dav(
    "DELETE",
    `/caldav/calendars/local/${harness.calendarId}/${encodeURIComponent(
      foreignEvent.uid,
    )}.ics`,
  );
  assert.equal(foreignDelete.status, 404);
  assert.equal(
    await eventRow(harness, foreignEvent.uid),
    null,
    "Fremde Ereignisse gehören nicht zur eigenen Person",
  );

  // Ein Ereignis mit fremder UID im eigenen Kalender bleibt ein normales Ereignis.
  const ownTask = await createTask(harness, {
    title: "Eigene Aufgabe",
    dueDate: "2032-06-01",
  });
  const ownBinding = (await listBindings(harness))[0];
  assert.equal(ownBinding?.event.uid, managedUid(ownTask.id, "frist"));
  // Fremde Aufgabe mit gleicher Frist darf keine Abbildung erhalten.
  await harness.database.task.update({
    where: { id: foreignTask.id },
    data: { title: "Fremde Aufgabe mit Frist" },
  });
  assert.equal(
    await harness.database.taskCalendarBinding.count({
      where: { userId: harness.otherUserId },
    }),
    0,
  );
  assert.equal((await listBindings(harness)).length, 1);
});

test("weist Aufgaben mit Kalenderbezug ohne persönlichen Primärkalender klar ab", async (t) => {
  const harness = await createHarness(t, { primaryCalendars: 0 });
  const rejected = await harness.api("POST", "/tasks", {
    title: "Synthetische Aufgabe ohne Primärkalender",
    dueDate: "2032-06-01",
  });
  assert.equal(rejected.status, 409);
  const body = await readJson<{ error: { code: string; message: string } }>(
    rejected,
  );
  assert.equal(body.error.code, "CONFLICT");
  assert.match(body.error.message, /Primärkalender/);
  assert.equal(
    await harness.database.task.count({
      where: { userId: harness.userId, deletedAt: null },
    }),
    0,
    "Die Aufgabe wird ohne Primärkalender nicht angelegt",
  );
  assert.equal(
    await harness.database.calendarEvent.count({
      where: { userId: harness.userId },
    }),
    0,
    "Es wird bewusst kein anderer Kalender gewählt",
  );

  // Ohne Datumsbezug ist die Aufgabe weiterhin möglich.
  const plain = await createTask(harness, { title: "Aufgabe ohne Datum" });
  assert.ok(plain.id);
  assert.equal((await listBindings(harness)).length, 0);
  // Im Zweitkalender entsteht nichts.
  assert.equal(
    await harness.database.calendarEvent.count({
      where: { userId: harness.userId },
    }),
    0,
  );
});

/**
 * Ohne aktiven persönlichen Primärkalender darf die Bestandsprüfung eine
 * vorhandene markierte Abbildung nicht stillschweigend mit irgendeinem anderen
 * Kalender verbinden. Geprüft werden die klare Ablehnung, das Ausbleiben jeder
 * Schreibspur und die unveränderte Ablage des Ereignisses.
 */
test("lehnt die Bestandsprüfung ohne aktiven persönlichen Primärkalender vollständig ab", async (t) => {
  const harness = await createHarness(t, { primaryCalendars: 0 });
  /**
   * Die Aufgabe entsteht bewusst direkt in der Ablage: eine Aufgabe mit
   * Datumsbezug wird ohne Primärkalender bereits über die API klar abgelehnt.
   * Das Ereignis liegt in einem vorhandenen Zweitkalender – genau der Fall, in
   * dem früher stillschweigend ein beliebiger Kalender verwendet wurde.
   */
  const task = await harness.database.task.create({
    data: {
      userId: harness.userId,
      title: "Synthetische Aufgabe ohne Primärkalender",
      dueDate: new Date("2032-06-01T00:00:00.000Z"),
    },
  });
  const secondary = await calendarRow(harness, harness.secondaryCalendarId);
  assert.ok(secondary, "Der Zweitkalender besteht");
  const uid = managedEventUid(task.id, "due");
  const event = await harness.database.calendarEvent.create({
    data: {
      userId: harness.userId,
      calendarId: secondary.id,
      uid,
      title: "Frist: Synthetische Aufgabe ohne Primärkalender",
      description: composeManagedEventDescription({
        taskDescription: null,
        taskId: task.id,
        kind: "due",
      }),
      isAllDay: true,
      startDate: new Date("2032-06-01T00:00:00.000Z"),
      endDate: new Date("2032-06-02T00:00:00.000Z"),
      timezone: "Europe/Berlin",
      etag: '"ohne-primaerkalender-v1"',
    },
  });

  const rejected = await harness.api(
    "POST",
    "/task-calendar-bindings/reconcile",
  );
  assert.equal(rejected.status, 409, "Die Bestandsprüfung wird klar abgelehnt");
  const body = await readJson<{ error: { code: string; message: string } }>(
    rejected,
  );
  assert.equal(body.error.code, "CONFLICT");
  assert.match(body.error.message, /Primärkalender/);

  // Es entsteht keine Verbindung – weder sichtbar noch in der Ablage.
  assert.equal((await listBindings(harness)).length, 0);
  assert.equal(
    await harness.database.taskCalendarBinding.count({
      where: { userId: harness.userId },
    }),
    0,
    "Es wird kein Binding angelegt",
  );

  // Ereignis und Kalender bleiben unangetastet.
  const after = await harness.database.calendarEvent.findFirstOrThrow({
    where: { id: event.id },
  });
  assert.equal(after.uid, event.uid, "Die UID bleibt unverändert");
  assert.equal(after.etag, event.etag, "Der ETag bleibt unverändert");
  assert.equal(
    after.calendarId,
    secondary.id,
    "Es wird kein anderer Kalender gewählt",
  );
  assert.equal(after.sequence, event.sequence);
  assert.equal(after.syncVersion, event.syncVersion);
  assert.equal(after.deletedAt, null, "Das Ereignis wird nicht entfernt");
  assert.deepEqual(after.reminderMinutes, event.reminderMinutes);
  assert.equal(
    after.updatedAt.getTime(),
    event.updatedAt.getTime(),
    "Das Ereignis wird nicht angefasst",
  );
  assert.equal(
    (await calendarRow(harness, harness.secondaryCalendarId))?.syncToken,
    secondary.syncToken,
    "Der Sync-Token des Kalenders bleibt unverändert",
  );

  // Keine irreführende erfolgreiche Reconnect-Auditspur.
  assert.equal(
    await auditCount(harness, "task.calendar_binding.reconnected"),
    0,
  );
  assert.equal(
    await harness.database.auditEvent.count({
      where: {
        userId: harness.userId,
        action: { startsWith: "task.calendar_binding" },
      },
    }),
    0,
    "Es entsteht keine irreführende erfolgreiche Reconnect-Auditspur",
  );
});

/**
 * Ein markiertes Ereignis ausschließlich im Zweitkalender darf die
 * Bestandsprüfung nicht automatisch verbinden: verwaltete Ereignisse liegen im
 * persönlichen Primärkalender. Der Fall wird als mehrdeutig gemeldet, das
 * Ereignis bleibt unangetastet – es entsteht keine Bindung an einen beliebigen
 * Kalender.
 */
test("verbindet ein markiertes Ereignis im Zweitkalender nicht automatisch", async (t) => {
  const harness = await createHarness(t);
  /**
   * Aufgabe und Ereignis entstehen bewusst direkt in der Ablage: über den
   * Aufgabeneditor würde die Abbildung sofort im Primärkalender angelegt, und
   * genau dieser Bestand fehlt in diesem Fall.
   */
  const task = await harness.database.task.create({
    data: {
      userId: harness.userId,
      title: "Synthetische Aufgabe im Zweitkalender",
      dueDate: new Date("2032-06-01T00:00:00.000Z"),
    },
  });
  const secondary = await calendarRow(harness, harness.secondaryCalendarId);
  assert.ok(secondary, "Der Zweitkalender besteht");
  const uid = managedEventUid(task.id, "due");
  const event = await harness.database.calendarEvent.create({
    data: {
      userId: harness.userId,
      calendarId: secondary.id,
      uid,
      title: "Frist: Synthetische Aufgabe im Zweitkalender",
      description: composeManagedEventDescription({
        taskDescription: null,
        taskId: task.id,
        kind: "due",
      }),
      isAllDay: true,
      startDate: new Date("2032-06-01T00:00:00.000Z"),
      endDate: new Date("2032-06-02T00:00:00.000Z"),
      timezone: "Europe/Berlin",
      etag: '"zweitkalender-v1"',
    },
  });
  assert.equal((await listBindings(harness)).length, 0);

  const result = await readJson<{
    checkedEvents: number;
    reconnected: number;
    repaired: number;
    alreadyLinked: number;
    skippedUnrelated: number;
    ambiguous: Array<{
      eventUid: string | null;
      calendarId: string | null;
      taskId: string | null;
      kind: string | null;
      reason: string;
    }>;
  }>(await harness.api("POST", "/task-calendar-bindings/reconcile"));

  assert.equal(result.reconnected, 0, "Es wird nichts automatisch verbunden");
  const finding = result.ambiguous.find(
    (entry) => entry.eventUid === uid && entry.taskId === task.id,
  );
  assert.ok(finding, "Der Fall wird als mehrdeutig gemeldet");
  assert.equal(finding.calendarId, harness.secondaryCalendarId);
  assert.match(finding.reason, /Primärkalender/);
  assert.equal(
    await harness.database.taskCalendarBinding.count({
      where: { userId: harness.userId },
    }),
    0,
    "Es wird kein Binding angelegt",
  );

  // Ereignis, Kalender und Aufgabe bleiben unangetastet.
  const after = await harness.database.calendarEvent.findFirstOrThrow({
    where: { id: event.id },
  });
  assert.equal(after.uid, uid, "Die UID bleibt unverändert");
  assert.equal(after.etag, event.etag, "Der ETag bleibt unverändert");
  assert.equal(
    after.calendarId,
    secondary.id,
    "Der Kalender bleibt unverändert",
  );
  assert.equal(after.sequence, event.sequence);
  assert.equal(after.syncVersion, event.syncVersion);
  assert.equal(after.isAllDay, true);
  assert.equal(after.isStartMarker, false);
  assert.equal(after.deletedAt, null, "Das Ereignis wird nicht entfernt");
  assert.deepEqual(after.reminderMinutes, event.reminderMinutes);
  assert.equal(
    after.updatedAt.getTime(),
    event.updatedAt.getTime(),
    "Das Ereignis wird nicht angefasst",
  );
  assert.equal(
    (await calendarRow(harness, harness.secondaryCalendarId))?.syncToken,
    secondary.syncToken,
    "Der Sync-Token des Zweitkalenders bleibt unverändert",
  );
  assert.equal(
    await harness.database.calendarEvent.count({
      where: { userId: harness.userId, calendarId: { not: secondary.id } },
    }),
    0,
    "Es entsteht kein Ersatzereignis im Primärkalender",
  );
  const taskAfter = await readJson<{ dueDate: string | null }>(
    await harness.api("GET", `/tasks/${task.id}`),
  );
  assert.equal(
    taskAfter.dueDate,
    "2032-06-01",
    "Die Aufgabe bleibt unverändert",
  );
  assert.equal(
    await auditCount(harness, "task.calendar_binding.reconnected"),
    0,
  );
});

test("verbindet Bestand idempotent wieder, ohne Duplikate oder Umdeutungen", async (t) => {
  const harness = await createHarness(t);
  const task = await createTask(harness, {
    title: "Synthetische Aufgabe",
    dueDate: "2032-06-01",
  });
  const uid = managedUid(task.id, "frist");
  const event = await eventRow(harness, uid);
  assert.ok(event);
  const binding = (await listBindings(harness))[0];
  assert.ok(binding);

  // Verlorene Beziehung: nur das Ereignis kennt die Zuordnung noch.
  await harness.database.taskCalendarBinding.delete({
    where: { id: binding.id },
  });
  assert.equal((await listBindings(harness)).length, 0);
  const first = await readJson<Record<string, number>>(
    await harness.api("POST", "/task-calendar-bindings/reconcile"),
  );
  assert.equal(first.reconnected, 1);
  assert.equal(first.repaired, 0);
  assert.equal(first.skippedUnrelated, 0);
  const reconnected = await listBindings(harness);
  assert.equal(reconnected.length, 1);
  assert.equal(reconnected[0]?.event.uid, uid);
  assert.equal(reconnected[0]?.lastKnownEtag, event.etag);
  assert.equal(
    await auditCount(harness, "task.calendar_binding.reconnected"),
    1,
  );

  // Zweiter Lauf ist idempotent.
  const second = await readJson<Record<string, number>>(
    await harness.api("POST", "/task-calendar-bindings/reconcile"),
  );
  assert.equal(second.reconnected, 0);
  assert.equal(second.repaired, 0);
  assert.equal(second.alreadyLinked, 1);
  assert.equal((await listBindings(harness)).length, 1);
  assert.equal(
    await harness.database.calendarEvent.count({
      where: { userId: harness.userId, uid },
    }),
    1,
  );

  // Mehrdeutigkeit: zweites Ereignis mit gleicher Kennung im Zweitkalender.
  await harness.database.calendarEvent.create({
    data: {
      userId: harness.userId,
      calendarId: (
        await harness.database.calendar.findFirstOrThrow({
          where: {
            userId: harness.userId,
            externalId: harness.secondaryCalendarId,
          },
        })
      ).id,
      uid,
      title: event.title,
      description: event.description,
      isAllDay: true,
      startDate: event.startDate,
      endDate: event.endDate,
      timezone: event.timezone,
      etag: '"zweite-kopie"',
    },
  });
  await harness.database.taskCalendarBinding.delete({
    where: { id: (await listBindings(harness))[0]!.id },
  });
  const ambiguous = await readJson<{
    reconnected: number;
    ambiguous: Array<{ eventUid: string | null; reason: string }>;
  }>(await harness.api("POST", "/task-calendar-bindings/reconcile"));
  assert.equal(ambiguous.reconnected, 1);
  assert.equal(ambiguous.ambiguous.length, 1);
  assert.equal(ambiguous.ambiguous[0]?.eventUid, uid);
  assert.match(ambiguous.ambiguous[0]?.reason ?? "", /Duplikat/);
  assert.equal(
    await harness.database.taskCalendarBinding.count({
      where: { userId: harness.userId },
    }),
    1,
    "Es entsteht genau eine Beziehung",
  );

  // Ereignis einer nicht vorhandenen Aufgabe wird nur gemeldet.
  const orphanUid = managedUid(randomUUID(), "frist");
  const orphan = await harness.database.calendarEvent.create({
    data: {
      userId: harness.userId,
      calendarId: (
        await harness.database.calendar.findFirstOrThrow({
          where: { userId: harness.userId, externalId: harness.calendarId },
        })
      ).id,
      uid: orphanUid,
      title: "Frist: Verwaiste Abbildung",
      description: `\n\n---\nLifeOS verwaltete Aufgabenabbildung\nAufgabe: ${orphanUid.split(".")[0]}\nArt: Frist`,
      isAllDay: true,
      startDate: new Date("2032-06-01T00:00:00.000Z"),
      endDate: new Date("2032-06-02T00:00:00.000Z"),
      timezone: "Europe/Berlin",
      etag: '"verwaist"',
    },
  });
  const orphaned = await readJson<{
    checkedEvents: number;
    reconnected: number;
    repaired: number;
    alreadyLinked: number;
    skippedUnrelated: number;
    ambiguous: Array<{
      eventUid: string | null;
      calendarId: string | null;
      taskId: string | null;
      reason: string;
    }>;
  }>(await harness.api("POST", "/task-calendar-bindings/reconcile"));
  /**
   * Zwei Befunde, und keiner wird automatisch verbunden: die zweite Kopie
   * derselben Abbildung in einem anderen Kalender und das Ereignis einer nicht
   * vorhandenen Aufgabe. Der Bestandslauf verbindet zuerst den Bestand im
   * persönlichen Primärkalender; fremde Kopien werden nur gemeldet.
   */
  assert.equal(orphaned.ambiguous.length, 2);
  const duplicateRow = await harness.database.calendarEvent.findFirstOrThrow({
    where: {
      userId: harness.userId,
      uid,
      calendar: { externalId: harness.secondaryCalendarId },
    },
  });
  assert.equal(
    duplicateRow.deletedAt,
    null,
    "Gemeldete Fremdkopien bleiben unangetastet",
  );
  assert.equal(
    await harness.database.calendarEvent.count({
      where: { userId: harness.userId, uid, deletedAt: null },
    }),
    2,
    "Die gemeldete Kopie bleibt neben dem primären Ereignis bestehen",
  );
  assert.equal(
    (await listBindings(harness)).length,
    1,
    "Es entsteht keine zweite verwaltete Abbildung",
  );
  assert.deepEqual(
    {
      checkedEvents: orphaned.checkedEvents,
      reconnected: orphaned.reconnected,
      repaired: orphaned.repaired,
      alreadyLinked: orphaned.alreadyLinked,
      skippedUnrelated: orphaned.skippedUnrelated,
    },
    {
      checkedEvents: 3,
      reconnected: 0,
      repaired: 0,
      alreadyLinked: 1,
      skippedUnrelated: 0,
    },
  );
  const duplicateEntry = orphaned.ambiguous.find((entry) =>
    /Duplikat/.test(entry.reason),
  );
  const orphanEntry = orphaned.ambiguous.find(
    (entry) => entry.taskId === orphanUid.split(".")[0],
  );
  assert.equal(duplicateEntry?.eventUid, uid);
  assert.equal(duplicateEntry?.calendarId, harness.secondaryCalendarId);
  assert.match(orphanEntry?.reason ?? "", /keine aktive, eigene Aufgabe/);
  assert.equal(
    await harness.database.taskCalendarBinding.count({
      where: { userId: harness.userId, calendarEventId: orphan.id },
    }),
    0,
  );
});

test("zeigt fehlende Ereignisse und Kalender an und stellt sie über die Aufgabe wieder her", async (t) => {
  const harness = await createHarness(t);
  const task = await createTask(harness, {
    title: "Synthetische Aufgabe",
    dueDate: "2032-06-01",
  });
  const uid = managedUid(task.id, "frist");
  const event = await eventRow(harness, uid);
  assert.ok(event);

  // Ereignis fehlt: die Abbildung wird als solche ausgewiesen.
  await harness.database.calendarEvent.update({
    where: { id: event.id },
    data: { deletedAt: new Date() },
  });
  const missingEvent = (await listBindings(harness))[0];
  assert.equal(missingEvent?.status, "event_missing");
  assert.equal(missingEvent?.event.available, false);
  assert.equal(missingEvent?.event.uid, null);
  assert.equal(missingEvent?.event.calendarId, harness.calendarId);
  assert.equal(missingEvent?.lastKnownEtag, event.etag);
  // Die Beziehung selbst bleibt der einzige Anker der Zuordnung.
  assert.equal(missingEvent?.task.id, task.id);

  // Eine Aufgabenänderung baut dieselbe Abbildung wieder auf.
  await harness.api("PATCH", `/tasks/${task.id}`, {
    title: "Synthetische Aufgabe II",
  });
  const restored = (await listBindings(harness))[0];
  assert.equal(restored?.status, "active");
  const restoredEvent = await eventRow(harness, uid);
  assert.equal(restoredEvent?.id, event.id);
  assert.equal(restoredEvent?.deletedAt, null);
  assert.equal(restoredEvent?.title, "Frist: Synthetische Aufgabe II");
  assert.equal(await auditCount(harness, "task.calendar_binding.restored"), 1);

  // Kalender fehlt: Abbildung wird ausgewiesen und über die Aufgabe überführt.
  const calendar = await calendarRow(harness, harness.calendarId);
  assert.ok(calendar);
  await harness.database.calendar.update({
    where: { id: calendar.id },
    data: { deletedAt: new Date() },
  });
  const missingCalendar = (await listBindings(harness))[0];
  assert.equal(missingCalendar?.status, "calendar_missing");
  assert.equal(missingCalendar?.event.calendarId, null);
  await harness.database.calendar.update({
    where: { id: calendar.id },
    data: { deletedAt: null },
  });
  const recovered = (await listBindings(harness))[0];
  assert.equal(recovered?.status, "active");
});

test("repariert fehlende Abbildungen über die Bestandsprüfung, ohne zu erfinden", async (t) => {
  const harness = await createHarness(t);
  const task = await createTask(harness, {
    title: "Synthetische Aufgabe",
    dueDate: "2032-06-01",
  });
  const uid = managedUid(task.id, "frist");
  const event = await eventRow(harness, uid);
  assert.ok(event);
  await harness.database.calendarEvent.update({
    where: { id: event.id },
    data: { deletedAt: new Date() },
  });
  assert.equal((await listBindings(harness))[0]?.status, "event_missing");

  const repaired = await readJson<{ repaired: number; ambiguous: unknown[] }>(
    await harness.api("POST", "/task-calendar-bindings/reconcile"),
  );
  assert.equal(repaired.repaired, 1);
  assert.equal(repaired.ambiguous.length, 0);
  const after = (await listBindings(harness))[0];
  assert.equal(after?.status, "active");
  assert.equal(after?.event.uid, uid);
  const repairedEvent = await eventRow(harness, uid);
  assert.equal(repairedEvent?.id, event.id);
  assert.equal(
    await harness.database.calendarEvent.count({
      where: { userId: harness.userId },
    }),
    1,
  );

  // Ohne Primärkalender wird nichts vermutet.
  const naked = await createHarness(t, { primaryCalendars: 0 });
  const nakedTask = await naked.database.task.create({
    data: {
      userId: naked.userId,
      title: "Aufgabe ohne Primärkalender",
      dueDate: new Date("2032-06-01T00:00:00.000Z"),
    },
  });
  const nakedCalendar = await naked.database.calendar.create({
    data: {
      userId: naked.userId,
      externalId: `binding-naked-${randomUUID()}`,
      name: "Kalender ohne Primärrolle",
      timezone: "Europe/Berlin",
    },
  });
  const nakedEvent = await naked.database.calendarEvent.create({
    data: {
      userId: naked.userId,
      calendarId: nakedCalendar.id,
      uid: managedUid(nakedTask.id, "frist"),
      title: "Frist: Aufgabe ohne Primärkalender",
      isAllDay: true,
      startDate: new Date("2032-06-01T00:00:00.000Z"),
      endDate: new Date("2032-06-02T00:00:00.000Z"),
      timezone: "Europe/Berlin",
      etag: '"ohne-primaer"',
      deletedAt: new Date(),
    },
  });
  await naked.database.taskCalendarBinding.create({
    data: {
      userId: naked.userId,
      taskId: nakedTask.id,
      calendarEventId: nakedEvent.id,
      kind: "due",
      lastKnownEtag: '"ohne-primaer"',
    },
  });
  /**
   * Ohne Primärkalender wird die Bestandsprüfung vollständig abgelehnt: es wird
   * weder etwas verbunden noch eine vorhandene Abbildung nachgeführt. Ein
   * beliebiger anderer Kalender wird nie als Ersatz gewählt.
   */
  const nakedRejected = await naked.api(
    "POST",
    "/task-calendar-bindings/reconcile",
  );
  assert.equal(nakedRejected.status, 409, "Die Bestandsprüfung wird abgelehnt");
  const nakedBody = await readJson<{
    error: { code: string; message: string };
  }>(nakedRejected);
  assert.equal(nakedBody.error.code, "CONFLICT");
  assert.match(nakedBody.error.message, /Primärkalender/);
  const untouched = await naked.database.calendarEvent.findFirstOrThrow({
    where: { userId: naked.userId, uid: managedUid(nakedTask.id, "frist") },
  });
  assert.ok(untouched.deletedAt, "Das Ereignis bleibt unangetastet");
  assert.equal(
    untouched.calendarId,
    nakedCalendar.id,
    "Es wird kein anderer Kalender gewählt",
  );
  assert.equal(
    await naked.database.taskCalendarBinding.count({
      where: { userId: naked.userId },
    }),
    1,
    "Die vorhandene Abbildung bleibt unangetastet",
  );
  assert.equal(
    (await listBindings(naked))[0]?.status,
    "event_missing",
    "Es wird nichts ohne Primärkalender wiederhergestellt",
  );
});

test("lässt freie Verknüpfungen und Wiederholungsereignisse unverändert", async (t) => {
  const harness = await createHarness(t);
  const task = await createTask(harness, { title: "Synthetische Aufgabe" });
  const normalUid = `frei-${randomUUID()}@lifeos.local`;
  const event = await harness.database.calendarEvent.create({
    data: {
      userId: harness.userId,
      calendarId: (
        await harness.database.calendar.findFirstOrThrow({
          where: { userId: harness.userId, externalId: harness.calendarId },
        })
      ).id,
      uid: normalUid,
      title: "Freies Wiederholungsereignis",
      startsAt: new Date("2032-06-01T08:00:00.000Z"),
      endsAt: new Date("2032-06-01T09:00:00.000Z"),
      timezone: "Europe/Berlin",
      recurrenceRule: "FREQ=WEEKLY;COUNT=3",
      etag: '"frei-v1"',
    },
  });

  // Freie Verknüpfung anlegen: sie bleibt eine freie Verknüpfung.
  const linked = await harness.api("POST", "/task-event-links", {
    taskId: task.id,
    calendarId: harness.calendarId,
    eventUid: normalUid,
  });
  if (linked.status !== 201) {
    assert.fail(
      `Freie Verknüpfung wurde nicht angelegt (${linked.status}): ${await linked.text()}`,
    );
  }
  const link = await readJson<{ id: string }>(linked);
  const links = await readJson<Array<{ id: string; event: { uid: string } }>>(
    await harness.api("GET", "/task-event-links"),
  );
  assert.equal(links.length, 1);
  assert.equal(links[0]?.event.uid, normalUid);
  // Keine verwaltete Abbildung und keine Änderung am Ereignis.
  assert.equal((await listBindings(harness)).length, 0);
  const unchanged = await eventRow(harness, normalUid);
  assert.equal(unchanged?.etag, event.etag);
  assert.equal(unchanged?.recurrenceRule, "FREQ=WEEKLY;COUNT=3");

  // Bestandsprüfung deutet die freie Verknüpfung nicht um.
  const reconcile = await readJson<{
    reconnected: number;
    skippedUnrelated: number;
  }>(await harness.api("POST", "/task-calendar-bindings/reconcile"));
  assert.equal(reconcile.reconnected, 0);
  assert.equal(reconcile.skippedUnrelated, 1);
  assert.equal((await listBindings(harness)).length, 0);
  const stillLinked = await readJson<Array<{ id: string }>>(
    await harness.api("GET", "/task-event-links"),
  );
  assert.equal(stillLinked.length, 1);
  assert.equal(stillLinked[0]?.id, link.id);

  // Auch das Löschen der freien Verknüpfung bleibt möglich.
  const unlinked = await harness.api("DELETE", `/task-event-links/${link.id}`);
  assert.equal(unlinked.status, 204);
  const after = await eventRow(harness, normalUid);
  assert.equal(after?.etag, event.etag);
  assert.equal(after?.deletedAt, null);

  // Ein normales Ereignis ohne verwaltete Abbildung ist frei änderbar.
  const thirdUid = `normal-${randomUUID()}@lifeos.local`;
  const created = await harness.dav(
    "PUT",
    `/caldav/calendars/local/${harness.calendarId}/${encodeURIComponent(thirdUid)}.ics`,
    {
      headers: { "if-none-match": "*", "content-type": "text/calendar" },
      body: ics([
        `UID:${thirdUid}`,
        "SUMMARY:Frei ändern",
        "DTSTART;TZID=Europe/Berlin:20320603T090000",
        "DTEND;TZID=Europe/Berlin:20320603T100000",
      ]),
    },
  );
  assert.equal(created.status, 201);
  const changed = await harness.dav(
    "PUT",
    `/caldav/calendars/local/${harness.calendarId}/${encodeURIComponent(thirdUid)}.ics`,
    {
      headers: {
        "if-match": created.headers.get("etag") ?? "",
        "content-type": "text/calendar",
      },
      body: ics([
        `UID:${thirdUid}`,
        "SUMMARY:Frei geändert",
        "DESCRIPTION:freier Text",
        "DTSTART;TZID=Europe/Berlin:20320603T093000",
        "DTEND;TZID=Europe/Berlin:20320603T103000",
      ]),
    },
  );
  assert.equal(changed.status, 204, await changed.text());
  const free = await eventRow(harness, thirdUid);
  assert.equal(free?.title, "Frei geändert");
  assert.equal(free?.description, "freier Text");
  assert.equal(free?.startsAt?.toISOString(), "2032-06-03T07:30:00.000Z");
});

test("behandelt konkurrierende Task- und CalDAV-Änderungen ohne Datenverlust", async (t) => {
  const harness = await createHarness(t);
  const task = await createTask(harness, {
    title: "Synthetische Aufgabe",
    dueDate: "2032-06-01",
  });
  const uid = managedUid(task.id, "frist");
  const event = await eventRow(harness, uid);
  assert.ok(event);
  const url = `/caldav/calendars/local/${harness.calendarId}/${encodeURIComponent(
    uid,
  )}.ics`;

  // Apple ändert den Titel, unmittelbar danach ändert LifeOS die Aufgabe.
  const fromApple = await harness.dav("PUT", url, {
    headers: { "if-match": event.etag, "content-type": "text/calendar" },
    body: ics([
      `UID:${uid}`,
      "SUMMARY:Frist: Aus Apple",
      `DESCRIPTION:${icsText(event.description)}`,
      "DTSTART;VALUE=DATE:20320601",
      "DTEND;VALUE=DATE:20320602",
    ]),
  });
  assert.equal(fromApple.status, 204, await fromApple.text());

  // Ein veralteter Apple-Schreibversuch mit dem alten ETag scheitert sauber.
  const stale = await harness.dav("PUT", url, {
    headers: { "if-match": event.etag, "content-type": "text/calendar" },
    body: ics([
      `UID:${uid}`,
      "SUMMARY:Frist: Veralteter Stand",
      `DESCRIPTION:${icsText(event.description)}`,
      "DTSTART;VALUE=DATE:20320601",
      "DTEND;VALUE=DATE:20320602",
    ]),
  });
  assert.equal(stale.status, 412);
  const afterStale = await readJson<Record<string, unknown>>(
    await harness.api("GET", `/tasks/${task.id}`),
  );
  assert.equal(afterStale.title, "Aus Apple");

  // Der veraltete Web-Schreibversuch mit dem alten ETag scheitert ebenfalls.
  const staleWeb = await harness.api(
    "PUT",
    `/calendars/${harness.calendarId}/events/${encodeURIComponent(uid)}`,
    {
      title: "Frist: Veralteter Webstand",
      isAllDay: true,
      timezone: "Europe/Berlin",
      startDate: "2032-06-01",
      endDate: "2032-06-02",
    },
  );
  assert.equal(staleWeb.status, 428, "Ohne If-Match wird nichts überschrieben");

  // LifeOS ändert den Status; die Aufgabe bleibt führend für den Status.
  const statusChange = await harness.api("PATCH", `/tasks/${task.id}`, {
    status: "done",
  });
  assert.equal(statusChange.status, 200, await statusChange.text());
  const afterStatus = await eventRow(harness, uid);
  assert.equal(afterStatus?.title, "Frist: Aus Apple (erledigt)");
  assert.equal((await listBindings(harness))[0]?.event.etag, afterStatus?.etag);

  // Ein vollständiges PUT auf dem aktuellen Stand wird weiterhin angenommen.
  const accepted = await harness.dav("PUT", url, {
    headers: {
      "if-match": afterStatus?.etag ?? "",
      "content-type": "text/calendar",
    },
    body: ics([
      `UID:${uid}`,
      "SUMMARY:Frist: Aus Apple (erledigt)",
      `DESCRIPTION:${icsText(afterStatus?.description)}`,
      "DTSTART;VALUE=DATE:20320601",
      "DTEND;VALUE=DATE:20320602",
    ]),
  });
  assert.equal(accepted.status, 204, await accepted.text());
  assert.equal((await listBindings(harness)).length, 1);
  assert.equal(
    await harness.database.calendarEvent.count({
      where: { userId: harness.userId },
    }),
    1,
  );
});
