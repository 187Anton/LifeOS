import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createDatabaseClient } from "@lifeos/database";
import type {
  StudyEntryResponse,
  StudyModuleResponse,
  StudyOverviewResponse,
  StudyProgramResponse,
} from "@lifeos/contracts";
import { config as loadEnvironment } from "dotenv";
import { createApplication } from "../src/application.js";
import type { Logger } from "../src/logger.js";
import { PrismaProfileRepository } from "../src/modules/profile/repository.js";
import { createProfileRouter } from "../src/modules/profile/router.js";
import {
  AuthenticationService,
  ProfileService,
} from "../src/modules/profile/service.js";
import { hashPassword } from "../src/modules/profile/security.js";
import { PrismaStudyRepository } from "../src/modules/study/repository.js";
import { createStudyRouter } from "../src/modules/study/router.js";
import { StudyService } from "../src/modules/study/service.js";

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

test("verwaltet Studienobjekte unter /api/v1 mit Besitzprüfung und Audit", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalId = `study-owner-${suffix}`;
  const otherExternalId = `study-other-${suffix}`;
  const password = `synthetisches-studienpasswort-${suffix}`;
  const user = await database.user.create({
    data: {
      externalId,
      displayName: "Synthetische Studienperson",
      settings: { create: {} },
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
  const foreignProgram = await database.studyProgram.create({
    data: {
      userId: other.id,
      title: "Fremder Studiengang",
      institution: "Fremde Einrichtung",
      periodLabel: "Abschnitt 1",
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
      createStudyRouter({
        authentication,
        study: new StudyService(new PrismaStudyRepository(database)),
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
  assert.equal((await fetch(`${base}/study`)).status, 401);
  const login = await fetch(`${base}/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";", 1)[0] ?? "";
  const headers = { cookie, "content-type": "application/json" };
  const programResponse = await fetch(`${base}/study/programs`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: "Synthetische Informatik",
      institution: "Lokale Testhochschule",
      periodLabel: "Sommersemester 2032",
      status: "active",
    }),
  });
  assert.equal(programResponse.status, 201);
  const program = (await programResponse.json()) as StudyProgramResponse;
  assert.equal(program.ownerId, user.id);
  const foreignModule = await fetch(`${base}/study/modules`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      programId: foreignProgram.id,
      title: "Unzulässiges Modul",
    }),
  });
  assert.equal(foreignModule.status, 400);
  const moduleResponse = await fetch(`${base}/study/modules`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      programId: program.id,
      title: "Nachvollziehbare Systeme",
      credits: 6.5,
    }),
  });
  assert.equal(moduleResponse.status, 201);
  const module = (await moduleResponse.json()) as StudyModuleResponse;
  assert.equal(module.credits, 6.5);
  const foreignTask = await database.task.create({
    data: { userId: other.id, title: "Fremde Lernaufgabe", area: "study" },
  });
  const foreignReference = await fetch(`${base}/study/entries`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      moduleId: module.id,
      kind: "submission",
      title: "Unzulässige fremde Referenz",
      dueDate: "2032-07-14",
      taskId: foreignTask.id,
    }),
  });
  assert.equal(foreignReference.status, 400);
  const task = await database.task.create({
    data: { userId: user.id, title: "Synthetische Lernaufgabe", area: "study" },
  });
  const calendar = await database.calendar.create({
    data: {
      userId: user.id,
      externalId: `study-calendar-${suffix}`,
      name: "Synthetischer Studienkalender",
    },
  });
  const calendarEvent = await database.calendarEvent.create({
    data: {
      userId: user.id,
      calendarId: calendar.id,
      uid: `study-event-${suffix}@lifeos.local`,
      title: "Synthetischer Prüfungstag",
      isAllDay: true,
      startDate: new Date("2032-07-15T00:00:00.000Z"),
      endDate: new Date("2032-07-16T00:00:00.000Z"),
      etag: '"study-v1"',
    },
  });
  const entryResponse = await fetch(`${base}/study/entries`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      moduleId: module.id,
      kind: "exam",
      title: "Synthetische Prüfung",
      dueDate: "2032-07-15",
      taskId: task.id,
      calendarEventId: calendarEvent.id,
    }),
  });
  assert.equal(entryResponse.status, 201);
  const entry = (await entryResponse.json()) as StudyEntryResponse;
  assert.equal(entry.dueDate, "2032-07-15");
  assert.equal(entry.taskId, task.id);
  assert.equal(entry.calendarEventId, calendarEvent.id);
  const updated = await fetch(`${base}/study/entries/${entry.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ dueDate: "2032-07-16" }),
  });
  assert.equal(updated.status, 200);
  assert.equal(
    ((await updated.json()) as StudyEntryResponse).dueDate,
    "2032-07-16",
  );
  const overview = await fetch(`${base}/study`, { headers: { cookie } });
  assert.equal(overview.status, 200);
  const overviewBody = (await overview.json()) as StudyOverviewResponse;
  assert.equal(overviewBody.entries.length, 1);
  assert.ok(
    overviewBody.history.some(
      (event) =>
        event.action === "study.entry.updated" &&
        event.changedFields.includes("dueDate"),
    ),
  );
  assert.equal(
    JSON.stringify(overviewBody.history).includes("2032-07-16"),
    false,
  );
  const audits = await database.auditEvent.findMany({
    where: { userId: user.id, entityType: { startsWith: "Study" } },
    select: { action: true, metadata: true },
  });
  assert.deepEqual(
    new Set(audits.map((value) => value.action)),
    new Set([
      "study.program.created",
      "study.module.created",
      "study.entry.created",
      "study.entry.updated",
    ]),
  );
  assert.ok(
    audits.some(
      (value) =>
        value.action === "study.entry.updated" &&
        JSON.stringify(value.metadata).includes("dueDate"),
    ),
  );
});
