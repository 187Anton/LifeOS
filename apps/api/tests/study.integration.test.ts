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

test("liefert Moduldetail, Zeitformwechsel und Archivzustände besitzgebunden", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalId = `study-detail-owner-${suffix}`;
  const otherExternalId = `study-detail-other-${suffix}`;
  const password = `synthetisches-detailpasswort-${suffix}`;
  const user = await database.user.create({
    data: {
      externalId,
      displayName: "Synthetische Detailperson",
      settings: { create: {} },
      credential: { create: { passwordHash: await hashPassword(password) } },
    },
  });
  const other = await database.user.create({
    data: {
      externalId: otherExternalId,
      displayName: "Andere Detailperson",
      settings: { create: {} },
    },
  });
  const foreignProgram = await database.studyProgram.create({
    data: {
      userId: other.id,
      title: "Fremder Detailstudiengang",
      institution: "Fremde Einrichtung",
      periodLabel: "Fremdabschnitt",
    },
  });
  const foreignModule = await database.studyModule.create({
    data: {
      userId: other.id,
      programId: foreignProgram.id,
      title: "Fremdes Detailmodul",
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
  const login = await fetch(`${base}/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";", 1)[0] ?? "";
  const headers = { cookie, "content-type": "application/json" };
  const program = (await (
    await fetch(`${base}/study/programs`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "Synthetische Detailinformatik",
        institution: "Lokale Testhochschule",
        periodLabel: "Sommersemester 2033",
        status: "active",
      }),
    })
  ).json()) as StudyProgramResponse;
  const module = (await (
    await fetch(`${base}/study/modules`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        programId: program.id,
        title: "Synthetisches Detailmodul",
        code: "DET-101",
        credits: 5,
      }),
    })
  ).json()) as StudyModuleResponse;

  const detailed = await fetch(`${base}/study/modules/${module.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      status: "completed",
      credits: 6,
      grade: "1,7",
      notes: "Synthetische Modulnotiz.",
      documentReferences: ["Skript Kapitel 1", "https://example.invalid/lokal"],
      searchEnabled: true,
    }),
  });
  assert.equal(detailed.status, 200);
  const detailedModule = (await detailed.json()) as StudyModuleResponse;
  assert.equal(detailedModule.status, "completed");
  assert.equal(detailedModule.credits, 6);
  assert.equal(detailedModule.grade, "1,7");
  assert.equal(detailedModule.notes, "Synthetische Modulnotiz.");
  assert.equal(detailedModule.searchEnabled, true);
  /* Freie Verweise bleiben Zeichenketten und werden nicht als IDs aufgelöst. */
  assert.deepEqual(detailedModule.documentReferences, [
    "Skript Kapitel 1",
    "https://example.invalid/lokal",
  ]);
  assert.equal(
    (
      await fetch(`${base}/study/modules/${module.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ programId: foreignProgram.id }),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(`${base}/study/modules/${foreignModule.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ title: "Übernommenes Fremdmodul" }),
      })
    ).status,
    404,
  );

  const task = await database.task.create({
    data: {
      userId: user.id,
      title: "Synthetische Detailaufgabe",
      area: "study",
      studyModuleId: module.id,
    },
  });
  const entry = (await (
    await fetch(`${base}/study/entries`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        moduleId: module.id,
        kind: "exam",
        title: "Synthetische Detailprüfung",
        dueDate: "2033-04-11",
        taskId: task.id,
      }),
    })
  ).json()) as StudyEntryResponse;
  assert.equal(entry.dueDate, "2033-04-11");
  assert.equal(entry.startsAt, null);
  assert.equal(entry.timezone, null);

  /* Wechsel von einem reinen Kalendertag auf einen vollständigen Zeitblock. */
  const timedResponse = await fetch(`${base}/study/entries/${entry.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      dueDate: null,
      startsAt: "2033-04-12T08:00:00.000Z",
      endsAt: "2033-04-12T09:30:00.000Z",
      timezone: "Europe/Berlin",
    }),
  });
  assert.equal(timedResponse.status, 200);
  const timed = (await timedResponse.json()) as StudyEntryResponse;
  assert.equal(timed.dueDate, null);
  assert.equal(timed.startsAt, "2033-04-12T08:00:00.000Z");
  assert.equal(timed.endsAt, "2033-04-12T09:30:00.000Z");
  assert.equal(timed.timezone, "Europe/Berlin");
  /* Ausgelassene Bezüge bleiben unverändert erhalten. */
  assert.equal(timed.taskId, task.id);
  assert.equal(timed.calendarEventId, null);

  /* Und zurück auf einen reinen Kalendertag. */
  const allDay = (await (
    await fetch(`${base}/study/entries/${entry.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        dueDate: "2033-04-13",
        startsAt: null,
        endsAt: null,
        timezone: null,
      }),
    })
  ).json()) as StudyEntryResponse;
  assert.equal(allDay.dueDate, "2033-04-13");
  assert.equal(allDay.startsAt, null);
  assert.equal(allDay.endsAt, null);
  assert.equal(allDay.timezone, null);
  assert.equal(allDay.taskId, task.id);

  /* Eine Lehrveranstaltung bleibt verpflichtend ein vollständiger Zeitblock. */
  assert.equal(
    (
      await fetch(`${base}/study/entries/${entry.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          kind: "lecture",
          dueDate: "2033-04-14",
          startsAt: null,
          endsAt: null,
          timezone: null,
        }),
      })
    ).status,
    400,
  );

  const foreignTask = await database.task.create({
    data: {
      userId: other.id,
      title: "Fremde Detailaufgabe",
      area: "study",
    },
  });
  assert.equal(
    (
      await fetch(`${base}/study/entries/${entry.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ taskId: foreignTask.id }),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(`${base}/study/entries/${entry.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ archived: true }),
      })
    ).status,
    200,
  );
  const activeOverview = (await (
    await fetch(`${base}/study`, { headers: { cookie } })
  ).json()) as StudyOverviewResponse;
  assert.equal(
    activeOverview.entries.some((candidate) => candidate.id === entry.id),
    false,
  );
  assert.equal(
    activeOverview.modules.filter((candidate) => candidate.id === module.id)
      .length,
    1,
  );
  const archivedOverview = (await (
    await fetch(`${base}/study?includeArchived=true`, { headers: { cookie } })
  ).json()) as StudyOverviewResponse;
  const archivedEntry = archivedOverview.entries.find(
    (candidate) => candidate.id === entry.id,
  );
  assert.ok(archivedEntry?.archivedAt);
  assert.equal(archivedEntry?.moduleId, module.id);

  /* Ein archiviertes Modul bleibt lesbar, blockiert aber neue Bezugnahmen. */
  assert.equal(
    (
      await fetch(`${base}/study/modules/${module.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ archived: true }),
      })
    ).status,
    200,
  );
  const moduleArchivedOverview = (await (
    await fetch(`${base}/study?includeArchived=true`, { headers: { cookie } })
  ).json()) as StudyOverviewResponse;
  const archivedModule = moduleArchivedOverview.modules.find(
    (candidate) => candidate.id === module.id,
  );
  assert.ok(archivedModule?.archivedAt);
  assert.equal(
    moduleArchivedOverview.entries.filter(
      (candidate) => candidate.moduleId === module.id,
    ).length,
    1,
  );
  assert.equal(
    (
      await fetch(`${base}/study/entries/${entry.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ title: "Bearbeitung im archivierten Modul" }),
      })
    ).status,
    400,
  );
});
