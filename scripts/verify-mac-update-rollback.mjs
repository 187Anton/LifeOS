import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";

import BetterSqlite3 from "better-sqlite3";

import {
  createSqliteBackup,
  restoreSqliteBackup,
} from "../packages/database/src/sqlite-backup.js";

const requireAppPath = (name) => {
  const value = process.env[name]?.trim();
  if (!value || !path.isAbsolute(value)) {
    throw new Error(`${name} muss auf eine absolute App-Kopie zeigen.`);
  }
  return value;
};

const baselineApp = requireAppPath("LIFEOS_BASELINE_APP_PATH");
const updateApp = requireAppPath("LIFEOS_UPDATE_APP_PATH");

const reservePort = async () => {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
};

const waitForReady = async (baseUrl, child, output) => {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(
        `Sidecar endete vorzeitig (${child.exitCode}): ${output.join("")}`,
      );
    }
    try {
      if ((await fetch(`${baseUrl}/api/v1/readiness`)).status === 200) return;
    } catch {
      // Der lokale Sidecar startet noch.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Sidecar wurde nicht bereit: ${output.join("")}`);
};

const startAppSidecar = async (appPath, databasePath, documentsPath, port) => {
  const resources = path.join(appPath, "Contents/Resources");
  const manifest = JSON.parse(
    await readFile(path.join(resources, "runtime-manifest.json"), "utf8"),
  );
  const nodeBinary = path.join(appPath, "Contents/MacOS/lifeos-node");
  const baseUrl = `http://127.0.0.1:${port}`;
  const output = [];
  const child = spawn(nodeBinary, [path.join(resources, "server/server.js")], {
    cwd: resources,
    env: {
      NODE_ENV: "production",
      API_HOST: "127.0.0.1",
      API_PORT: String(port),
      DATABASE_URL: `file:${databasePath}`,
      WEB_ORIGIN: baseUrl,
      WEB_DIST_PATH: path.join(resources, "web"),
      SQLITE_MIGRATIONS_PATH: path.join(resources, "sqlite-migrations"),
      STORAGE_PATH: documentsPath,
      LOG_LEVEL: "error",
      SHUTDOWN_TIMEOUT_MS: "1000",
      SESSION_TTL_HOURS: "1",
      PATH: "/usr/bin:/bin",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk) => output.push(chunk.toString()));
  await waitForReady(baseUrl, child, output);
  return { child, baseUrl, output, version: manifest.nodeVersion };
};

const stopSidecar = async ({ child, output }) => {
  child.kill("SIGTERM");
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  assert.equal(code, 0, `Sidecar-Abbruch: ${output.join("")}`);
};

const login = async (baseUrl, password) => {
  const response = await fetch(`${baseUrl}/api/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  assert.equal(response.status, 201);
  return (response.headers.get("set-cookie") ?? "").split(";", 1)[0];
};

const snapshot = (databasePath, eventUid) => {
  const database = new BetterSqlite3(databasePath, { readonly: true });
  try {
    assert.equal(database.pragma("integrity_check", { simple: true }), "ok");
    const identity = database
      .prepare(
        'SELECT u."id" AS "userId", c."id" AS "calendarId", c."syncToken", e."uid", e."etag", e."syncVersion" FROM "User" u JOIN "Calendar" c ON c."userId" = u."id" JOIN "CalendarEvent" e ON e."calendarId" = c."id" WHERE e."uid" = ?',
      )
      .get(eventUid);
    assert.ok(identity);
    return {
      identity,
      taskCount: database.prepare('SELECT COUNT(*) AS count FROM "Task"').get()
        .count,
      documentCount: database
        .prepare('SELECT COUNT(*) AS count FROM "Document"')
        .get().count,
    };
  } finally {
    database.close();
  }
};

const verifyData = async (baseUrl, password, identifiers) => {
  const cookie = await login(baseUrl, password);
  const event = await fetch(
    `${baseUrl}/api/v1/calendars/${identifiers.calendarId}/events/${encodeURIComponent(identifiers.eventUid)}`,
    { headers: { cookie } },
  );
  assert.equal(event.status, 200);
  assert.equal((await event.json()).uid, identifiers.eventUid);
  const task = await fetch(`${baseUrl}/api/v1/tasks/${identifiers.taskId}`, {
    headers: { cookie },
  });
  assert.equal(task.status, 200);
  const document = await fetch(`${baseUrl}${identifiers.documentContentUrl}`, {
    headers: { cookie },
  });
  assert.equal(document.status, 200);
  assert.equal(
    createHash("sha256")
      .update(Buffer.from(await document.arrayBuffer()))
      .digest("hex"),
    identifiers.documentHash,
  );
};

const root = await mkdtemp(path.join(os.tmpdir(), "lifeos-update-rollback-"));
const activeDatabase = path.join(root, "active/data/lifeos.sqlite");
const activeDocuments = path.join(root, "active/documents");
const backupDirectory = path.join(root, "backup");
const restoredDatabase = path.join(root, "restored/data/lifeos.sqlite");
const restoredDocuments = path.join(root, "restored/documents");
const password = "synthetic-update-password-2034";
const eventUid = "synthetic-update-rollback@lifeos.local";
let running;

try {
  const port = await reservePort();
  running = await startAppSidecar(
    baselineApp,
    activeDatabase,
    activeDocuments,
    port,
  );
  const setup = await fetch(`${running.baseUrl}/api/v1/setup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      displayName: "Synthetisches Update-Profil",
      password,
      calDavPassword: "synthetic-update-caldav-2034",
      timezone: "Europe/Berlin",
    }),
  });
  assert.equal(setup.status, 201);
  const cookie = await login(running.baseUrl, password);
  const calendars = await (
    await fetch(`${running.baseUrl}/api/v1/calendars`, {
      headers: { cookie },
    })
  ).json();
  const calendar = calendars.find((candidate) => candidate.isPrimary);
  assert.ok(calendar);
  const createdEvent = await fetch(
    `${running.baseUrl}/api/v1/calendars/${calendar.id}/events`,
    {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        uid: eventUid,
        title: "Synthetischer Update-Termin",
        timezone: "Europe/Berlin",
        isAllDay: false,
        startsAt: "2034-10-01T09:00:00+02:00",
        endsAt: "2034-10-01T10:00:00+02:00",
        reminderMinutes: [15],
      }),
    },
  );
  assert.equal(createdEvent.status, 201);
  const taskResponse = await fetch(`${running.baseUrl}/api/v1/tasks`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ title: "Synthetische Update-Aufgabe" }),
  });
  assert.equal(taskResponse.status, 201);
  const task = await taskResponse.json();
  const documentBytes = Buffer.from(
    "Synthetischer Dokumentinhalt für Update und Rollback.\n",
  );
  const documentResponse = await fetch(
    `${running.baseUrl}/api/v1/documents?fileName=update-rollback.txt`,
    {
      method: "POST",
      headers: { cookie, "content-type": "text/plain" },
      body: documentBytes,
    },
  );
  assert.equal(documentResponse.status, 201);
  const document = await documentResponse.json();
  const identifiers = {
    calendarId: calendar.id,
    eventUid,
    taskId: task.id,
    documentContentUrl: document.contentUrl,
    documentHash: createHash("sha256").update(documentBytes).digest("hex"),
  };
  await stopSidecar(running);
  running = undefined;
  const baselineSnapshot = snapshot(activeDatabase, eventUid);

  running = await startAppSidecar(
    updateApp,
    activeDatabase,
    activeDocuments,
    port,
  );
  await verifyData(running.baseUrl, password, identifiers);
  const updateSnapshot = snapshot(activeDatabase, eventUid);
  assert.deepEqual(updateSnapshot, baselineSnapshot);
  await createSqliteBackup({
    databaseUrl: `file:${activeDatabase}`,
    documentsDirectory: activeDocuments,
    destinationDirectory: backupDirectory,
  });
  await stopSidecar(running);
  running = undefined;

  running = await startAppSidecar(
    baselineApp,
    activeDatabase,
    activeDocuments,
    port,
  );
  await verifyData(running.baseUrl, password, identifiers);
  assert.deepEqual(snapshot(activeDatabase, eventUid), baselineSnapshot);
  await stopSidecar(running);
  running = undefined;

  await restoreSqliteBackup({
    backupDirectory,
    targetDatabaseUrl: `file:${restoredDatabase}`,
    targetDocumentsDirectory: restoredDocuments,
  });
  running = await startAppSidecar(
    updateApp,
    restoredDatabase,
    restoredDocuments,
    port,
  );
  await verifyData(running.baseUrl, password, identifiers);
  assert.deepEqual(snapshot(restoredDatabase, eventUid), baselineSnapshot);
  await stopSidecar(running);
  running = undefined;

  console.info(
    "Update, Neustart, Rollback und Restore in neue Ziele erhielten Benutzer-, Kalender-, Ereignis-, Aufgaben- und Dokumentidentitäten.",
  );
} finally {
  if (running?.child?.exitCode === null) running.child.kill("SIGTERM");
  await rm(root, { recursive: true, force: true });
}
