import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";

import { createDatabaseClient } from "@lifeos/database";

import { hashPassword } from "../apps/api/src/modules/profile/security.js";
import { migrateSqliteDatabase } from "../packages/database/prisma/sqlite/migrate.js";

const repositoryRoot = process.cwd();
const builtServer = path.join(repositoryRoot, "apps/api/dist/server.js");
const password = "synthetisches-sqlite-neustartpasswort";
const taskTitle = "SQLite-Neustartnachweis";
const eventUid = "sqlite-neustartnachweis@lifeos.local";

const reservePort = async (): Promise<number> => {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
};

const waitForReady = async (baseUrl: string, child: ChildProcess) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(
        `Die gebaute API wurde vorzeitig mit ${child.exitCode} beendet.`,
      );
    }
    try {
      const response = await fetch(`${baseUrl}/api/v1/readiness`);
      if (response.status === 200) return;
    } catch {
      // Der lokale Server befindet sich noch im Startvorgang.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Die gebaute API wurde nicht rechtzeitig bereit.");
};

const startServer = async (databaseUrl: string, port: number) => {
  const child = spawn(process.execPath, [builtServer], {
    cwd: repositoryRoot,
    env: {
      ...globalThis.process.env,
      NODE_ENV: "test",
      API_HOST: "127.0.0.1",
      API_PORT: String(port),
      DATABASE_URL: databaseUrl,
      WEB_ORIGIN: `http://127.0.0.1:${port}`,
      LOG_LEVEL: "error",
      SHUTDOWN_TIMEOUT_MS: "1000",
      SESSION_TTL_HOURS: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForReady(baseUrl, child);
  return { process: child, baseUrl };
};

const stopServer = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null) {
    assert.equal(child.exitCode, 0);
    return;
  }
  child.kill("SIGTERM");
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  assert.equal(exitCode, 0);
};

const login = async (baseUrl: string): Promise<string> => {
  const response = await fetch(`${baseUrl}/api/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  assert.equal(response.status, 201);
  const cookie = (response.headers.get("set-cookie") ?? "").split(";", 1)[0];
  assert.ok(cookie);
  return cookie;
};

const main = async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "lifeos-sqlite-runtime-"),
  );
  const databaseUrl = `file:${path.join(directory, "lifeos.sqlite")}`;
  let running: ChildProcess | undefined;

  try {
    await migrateSqliteDatabase(databaseUrl);
    const database = createDatabaseClient(databaseUrl);
    await database.user.create({
      data: {
        externalId: "local-personal-user",
        displayName: "Synthetische lokale Person",
        settings: { create: {} },
        credential: { create: { passwordHash: await hashPassword(password) } },
      },
    });
    await database.$disconnect();

    const port = await reservePort();
    const first = await startServer(databaseUrl, port);
    running = first.process;
    const firstCookie = await login(first.baseUrl);
    const jsonHeaders = {
      cookie: firstCookie,
      "content-type": "application/json",
    };
    const settingsResponse = await fetch(`${first.baseUrl}/api/v1/settings`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({
        timezone: "UTC",
        defaultCalendarView: "month",
        showWeekends: false,
      }),
    });
    assert.equal(settingsResponse.status, 200);

    const calendarResponse = await fetch(`${first.baseUrl}/api/v1/calendars`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ name: "Neustartprüfung", timezone: "UTC" }),
    });
    assert.equal(calendarResponse.status, 201);
    const calendar = (await calendarResponse.json()) as { id: string };
    const eventResponse = await fetch(
      `${first.baseUrl}/api/v1/calendars/${calendar.id}/events`,
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          uid: eventUid,
          title: "Ganztägiger Neustartnachweis",
          timezone: "UTC",
          isAllDay: true,
          startDate: "2032-08-09",
          endDate: "2032-08-10",
          recurrenceRule: "FREQ=DAILY;COUNT=2",
          reminderMinutes: [60],
        }),
      },
    );
    assert.equal(eventResponse.status, 201);
    const createdEvent = (await eventResponse.json()) as {
      uid: string;
      etag: string;
      sequence: number;
      timezone: string;
      recurrenceRule: string;
      reminderMinutes: number[];
    };

    const createdResponse = await fetch(`${first.baseUrl}/api/v1/tasks`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ title: taskTitle, dueDate: "2032-08-09" }),
    });
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()) as {
      id: string;
      dueDate: string;
    };
    assert.equal(created.dueDate, "2032-08-09");

    await stopServer(running);
    running = undefined;

    const second = await startServer(databaseUrl, port);
    running = second.process;
    const secondCookie = await login(second.baseUrl);
    const profileResponse = await fetch(`${second.baseUrl}/api/v1/profile`, {
      headers: { cookie: secondCookie },
    });
    assert.equal(profileResponse.status, 200);
    const profile = (await profileResponse.json()) as {
      settings: {
        timezone: string;
        defaultCalendarView: string;
        showWeekends: boolean;
      };
    };
    assert.deepEqual(profile.settings, {
      timezone: "UTC",
      locale: "de-DE",
      currencyCode: "EUR",
      weekStartsOn: 1,
      defaultCalendarView: "month",
      showWeekends: false,
    });

    const calendarsResponse = await fetch(
      `${second.baseUrl}/api/v1/calendars`,
      { headers: { cookie: secondCookie } },
    );
    assert.equal(calendarsResponse.status, 200);
    const calendars = (await calendarsResponse.json()) as Array<{ id: string }>;
    assert.ok(calendars.some((entry) => entry.id === calendar.id));
    const eventsResponse = await fetch(
      `${second.baseUrl}/api/v1/calendars/${calendar.id}/events`,
      { headers: { cookie: secondCookie } },
    );
    assert.equal(eventsResponse.status, 200);
    const events = (await eventsResponse.json()) as Array<{
      uid: string;
      etag: string;
      sequence: number;
      startDate: string;
      endDate: string;
      timezone: string;
      recurrenceRule: string;
      reminderMinutes: number[];
    }>;
    assert.ok(
      events.some(
        (event) =>
          event.uid === eventUid &&
          event.etag === createdEvent.etag &&
          event.sequence === createdEvent.sequence &&
          event.startDate === "2032-08-09" &&
          event.endDate === "2032-08-10" &&
          event.timezone === createdEvent.timezone &&
          event.recurrenceRule === createdEvent.recurrenceRule &&
          JSON.stringify(event.reminderMinutes) ===
            JSON.stringify(createdEvent.reminderMinutes),
      ),
    );

    const listedResponse = await fetch(`${second.baseUrl}/api/v1/tasks`, {
      headers: { cookie: secondCookie },
    });
    assert.equal(listedResponse.status, 200);
    const tasks = (await listedResponse.json()) as Array<{
      id: string;
      title: string;
      dueDate: string;
    }>;
    assert.ok(
      tasks.some(
        (task) =>
          task.id === created.id &&
          task.title === taskTitle &&
          task.dueDate === "2032-08-09",
      ),
    );

    await stopServer(running);
    running = undefined;

    const verificationDatabase = createDatabaseClient(databaseUrl);
    const persistedCalendar =
      await verificationDatabase.calendar.findFirstOrThrow({
        where: { externalId: calendar.id },
      });
    const persistedEvent =
      await verificationDatabase.calendarEvent.findFirstOrThrow({
        where: { calendarId: persistedCalendar.id, uid: eventUid },
      });
    assert.equal(persistedEvent.etag, createdEvent.etag);
    assert.equal(persistedEvent.sequence, createdEvent.sequence);
    assert.equal(persistedEvent.syncVersion, persistedCalendar.syncToken);
    await verificationDatabase.$disconnect();
    console.info("SQLite-API-Neustartprüfung erfolgreich.");
  } finally {
    if (running && running.exitCode === null) {
      running.kill("SIGTERM");
    }
    await rm(directory, { recursive: true, force: true });
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unbekannter Fehler");
  process.exitCode = 1;
});
