import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type {
  ApiErrorResponse,
  StudyEntryResponse,
  TaskResponse,
} from "@lifeos/contracts";
import { createDatabaseClient } from "@lifeos/database";
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

/**
 * Paket 4: Der optionale Studienmodulbezug ist besitzgebunden, höchstens einer
 * je Aufgabe und verändert bestehende Studieneinträge nicht.
 */
test("verwaltet den optionalen Studienmodulbezug der Aufgabe besitzgebunden", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalId = `task-module-owner-${suffix}`;
  const otherExternalId = `task-module-other-${suffix}`;
  const password = `synthetisches-modulpasswort-${suffix}`;
  const user = await database.user.create({
    data: {
      externalId,
      displayName: "Synthetische Modulperson",
      settings: { create: {} },
      credential: { create: { passwordHash: await hashPassword(password) } },
    },
  });
  const otherUser = await database.user.create({
    data: {
      externalId: otherExternalId,
      displayName: "Andere synthetische Modulperson",
      settings: { create: {} },
    },
  });
  const program = await database.studyProgram.create({
    data: {
      userId: user.id,
      title: "Synthetischer Studienabschnitt",
      institution: "Testhochschule",
      periodLabel: "Wintersemester 2032",
      status: "active",
    },
  });
  const module = await database.studyModule.create({
    data: {
      userId: user.id,
      programId: program.id,
      title: "Synthetisches Pflichtmodul",
      code: "PFL-1",
      status: "active",
    },
  });
  const archivedModule = await database.studyModule.create({
    data: {
      userId: user.id,
      programId: program.id,
      title: "Archiviertes Modul",
      status: "completed",
      archivedAt: new Date("2032-01-01T00:00:00.000Z"),
    },
  });
  const otherProgram = await database.studyProgram.create({
    data: {
      userId: otherUser.id,
      title: "Fremder Studienabschnitt",
      institution: "Fremde Hochschule",
      periodLabel: "Sommersemester 2032",
      status: "active",
    },
  });
  const foreignModule = await database.studyModule.create({
    data: {
      userId: otherUser.id,
      programId: otherProgram.id,
      title: "Fremdes Modul",
      status: "active",
    },
  });
  const project = await database.project.create({
    data: { userId: user.id, title: "Synthetisches Projekt" },
  });

  const profileRepository = new PrismaProfileRepository(database, externalId);
  const authentication = new AuthenticationService(profileRepository, 1);
  const tasks = new TaskService(new PrismaTaskRepository(database));
  const study = new StudyService(new PrismaStudyRepository(database));
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
      createTaskRouter({ authentication, tasks }),
      createStudyRouter({ authentication, study }),
    ],
  });
  const server = createServer(application);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
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

  // Fremde, archivierte und unbekannte Module sind keine gültige Neuzuordnung.
  for (const studyModuleId of [
    foreignModule.id,
    archivedModule.id,
    randomUUID(),
  ]) {
    const rejected = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        title: "Unzulässige Modulzuordnung",
        studyModuleId,
      }),
    });
    assert.equal(rejected.status, 400);
    const body = (await rejected.json()) as ApiErrorResponse;
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.equal(body.error.details?.[0]?.field, "body.studyModuleId");
  }

  // Projekt und Modul dürfen gleichzeitig bestehen.
  const createdResponse = await fetch(`${baseUrl}/tasks`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      title: "Aufgabe mit Projekt und Modul",
      area: "study",
      projectId: project.id,
      studyModuleId: module.id,
    }),
  });
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()) as TaskResponse;
  assert.equal(created.studyModuleId, module.id);
  assert.equal(created.projectId, project.id);

  // Ohne Angabe bleibt der Bezug leer.
  const plainResponse = await fetch(`${baseUrl}/tasks`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ title: "Aufgabe ohne Modul" }),
  });
  assert.equal(plainResponse.status, 201);
  const plain = (await plainResponse.json()) as TaskResponse;
  assert.equal(plain.studyModuleId, null);

  // Serverseitiger Modulfilter: eigenes Modul und „Ohne Modul“.
  const byModule = (await (
    await fetch(`${baseUrl}/tasks?studyModuleId=${module.id}`, {
      headers: { cookie },
    })
  ).json()) as TaskResponse[];
  assert.deepEqual(
    byModule.map((task) => task.id),
    [created.id],
  );
  const withoutModule = (await (
    await fetch(`${baseUrl}/tasks?studyModuleId=none`, { headers: { cookie } })
  ).json()) as TaskResponse[];
  assert.deepEqual(
    withoutModule.map((task) => task.id),
    [plain.id],
  );
  // Ein fremdes Modul liefert keine fremden Aufgaben.
  const foreignFilter = (await (
    await fetch(`${baseUrl}/tasks?studyModuleId=${foreignModule.id}`, {
      headers: { cookie },
    })
  ).json()) as TaskResponse[];
  assert.deepEqual(foreignFilter, []);
  const invalidFilter = await fetch(
    `${baseUrl}/tasks?studyModuleId=unbekannt`,
    {
      headers: { cookie },
    },
  );
  assert.equal(invalidFilter.status, 400);

  // Ein Studieneintrag bleibt beim Modulwechsel der Aufgabe unverändert.
  const entryResponse = await fetch(`${baseUrl}/study/entries`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      moduleId: module.id,
      kind: "submission",
      title: "Synthetische Abgabe",
      dueDate: "2032-02-10",
      taskId: created.id,
    }),
  });
  assert.equal(entryResponse.status, 201);
  const entry = (await entryResponse.json()) as StudyEntryResponse;
  assert.equal(entry.taskId, created.id);
  assert.equal(entry.moduleId, module.id);

  const linkedToArchivedModule = await fetch(`${baseUrl}/tasks/${created.id}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify({ studyModuleId: archivedModule.id }),
  });
  assert.equal(linkedToArchivedModule.status, 400);

  // Der Studieneintrag bleibt nach fachfremden Aufgabenänderungen unverändert.
  const renamed = await fetch(`${baseUrl}/tasks/${created.id}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify({ title: "Umbenannte Aufgabe" }),
  });
  assert.equal(renamed.status, 200);
  assert.equal(
    ((await renamed.json()) as TaskResponse).studyModuleId,
    module.id,
  );
  const entryAfterRename = await database.studyEntry.findUniqueOrThrow({
    where: { id: entry.id },
  });
  assert.equal(entryAfterRename.taskId, created.id);
  assert.equal(entryAfterRename.moduleId, module.id);
  assert.equal(entryAfterRename.title, "Synthetische Abgabe");

  // Ein archiviertes Modul bleibt am bestehenden Bezug erhalten.
  await database.studyModule.update({
    where: { id: module.id },
    data: { archivedAt: new Date("2032-03-01T00:00:00.000Z") },
  });
  const unrelatedUpdate = await fetch(`${baseUrl}/tasks/${created.id}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify({ priority: "low" }),
  });
  assert.equal(unrelatedUpdate.status, 200);
  assert.equal(
    ((await unrelatedUpdate.json()) as TaskResponse).studyModuleId,
    module.id,
  );
  const unchanged = await fetch(`${baseUrl}/tasks/${created.id}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify({ studyModuleId: module.id }),
  });
  assert.equal(unchanged.status, 200);
  assert.equal(
    ((await unchanged.json()) as TaskResponse).studyModuleId,
    module.id,
  );

  // Der archivierte Altbezug darf ausdrücklich entfernt werden.
  const removed = await fetch(`${baseUrl}/tasks/${created.id}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify({ studyModuleId: null }),
  });
  assert.equal(removed.status, 200);
  assert.equal(((await removed.json()) as TaskResponse).studyModuleId, null);

  // Ein fremdes Modul bleibt für die Zuordnung ausgeschlossen.
  const foreignAssignment = await fetch(`${baseUrl}/tasks/${plain.id}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify({ studyModuleId: foreignModule.id }),
  });
  assert.equal(foreignAssignment.status, 400);

  // Fremde Aufgaben bleiben unsichtbar, auch über den Modulfilter.
  const foreignTask = await database.task.create({
    data: {
      userId: otherUser.id,
      title: "Fremde Modulaufgabe",
      studyModuleId: foreignModule.id,
    },
  });
  const ownTasks = (await (
    await fetch(`${baseUrl}/tasks?includeArchived=true`, {
      headers: { cookie },
    })
  ).json()) as TaskResponse[];
  assert.equal(
    ownTasks.some((task) => task.id === foreignTask.id),
    false,
  );

  // Die Datenbank erzwingt denselben Besitzer über den zusammengesetzten Schlüssel.
  await assert.rejects(() =>
    database.task.create({
      data: {
        userId: user.id,
        title: "Fremder Modulbezug",
        studyModuleId: foreignModule.id,
      },
    }),
  );
});
