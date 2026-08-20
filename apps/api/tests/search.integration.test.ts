import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import test from "node:test";

import { createDatabaseClient } from "@lifeos/database";
import type { SearchResponse } from "@lifeos/contracts";

import { createApplication } from "../src/application.js";
import type { Logger } from "../src/logger.js";
import { PrismaProfileRepository } from "../src/modules/profile/repository.js";
import { createProfileRouter } from "../src/modules/profile/router.js";
import { hashPassword } from "../src/modules/profile/security.js";
import {
  AuthenticationService,
  ProfileService,
} from "../src/modules/profile/service.js";
import { PrismaSearchRepository } from "../src/modules/search/repository.js";
import { createSearchRouter } from "../src/modules/search/router.js";
import { LocalSearchService } from "../src/modules/search/service.js";

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

test("sucht auf PostgreSQL und SQLite nur in eigenen aktiven Freigaben", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalId = `search-owner-${suffix}`;
  const otherExternalId = `search-other-${suffix}`;
  const password = `synthetisches-suchpasswort-${suffix}`;
  const owner = await database.user.create({
    data: {
      externalId,
      displayName: "Synthetische Suchperson",
      settings: { create: {} },
      credential: { create: { passwordHash: await hashPassword(password) } },
    },
  });
  const other = await database.user.create({
    data: {
      externalId: otherExternalId,
      displayName: "Andere Suchperson",
      settings: { create: {} },
    },
  });
  const project = await database.project.create({
    data: {
      userId: owner.id,
      title: "Quanten Projekt",
      description: "Synthetische Prüfungsplanung",
      searchEnabled: true,
      goals: {
        create: {
          title: "Quanten Ziel",
          description: "Lokale Suche prüfen",
        },
      },
      milestones: {
        create: {
          title: "Quanten Meilenstein",
          description: "Nachweisbare Quelle",
        },
      },
    },
  });
  await database.project.createMany({
    data: [
      {
        userId: owner.id,
        title: "Quanten ohne Freigabe",
        searchEnabled: false,
      },
      {
        userId: owner.id,
        title: "Quanten gelöscht",
        searchEnabled: true,
        deletedAt: new Date("2033-01-02T12:00:00.000Z"),
      },
      {
        userId: owner.id,
        title: "Quanten archiviert",
        searchEnabled: true,
        archivedAt: new Date("2033-01-02T12:00:00.000Z"),
      },
      {
        userId: owner.id,
        title: "Quanten abgebrochen",
        status: "cancelled",
        searchEnabled: true,
      },
    ],
  });
  const note = await database.note.create({
    data: {
      userId: owner.id,
      title: "Quanten Notiz",
      content: "Prüfungsplanung mit Sonderzeichen äöü",
      searchEnabled: true,
    },
  });
  await database.note.createMany({
    data: [
      {
        userId: owner.id,
        title: "Quanten private Notiz",
        content: "nicht freigegeben",
      },
      {
        userId: owner.id,
        title: "Quanten archivierte Notiz",
        content: "archiviert",
        searchEnabled: true,
        archivedAt: new Date("2033-01-02T12:00:00.000Z"),
      },
      {
        userId: owner.id,
        title: "Quanten gelöschte Notiz",
        content: "gelöscht",
        searchEnabled: true,
        deletedAt: new Date("2033-01-02T12:00:00.000Z"),
      },
      {
        userId: other.id,
        title: "Quanten fremde Notiz",
        content: "fremd",
        searchEnabled: true,
      },
    ],
  });
  const document = await database.document.create({
    data: {
      userId: owner.id,
      projectId: project.id,
      storageKey: `${randomUUID()}.md`,
      fileName: "quanten-plan.md",
      mimeType: "text/markdown",
      byteSize: 32,
      sha256: "a".repeat(64),
      modifiedAt: new Date("2033-01-03T12:00:00.000Z"),
      extractedText: "Quanten Dokumenttext zur Prüfungsplanung",
      searchEnabled: true,
    },
  });
  const program = await database.studyProgram.create({
    data: {
      userId: owner.id,
      title: "Synthetischer Studiengang",
      institution: "Lokale Hochschule",
      periodLabel: "Testsemester",
    },
  });
  const module = await database.studyModule.create({
    data: {
      userId: owner.id,
      programId: program.id,
      title: "Quanten Studienmodul",
      notes: "Prüfungsplanung",
      searchEnabled: true,
      entries: {
        create: {
          kind: "exam",
          title: "Quanten Prüfung",
          dueDate: new Date("2033-06-01T00:00:00.000Z"),
        },
      },
    },
  });
  const context = await database.workContext.create({
    data: {
      userId: owner.id,
      title: "Synthetische Arbeit",
      role: "Testrolle",
    },
  });
  const workProject = await database.workProject.create({
    data: {
      userId: owner.id,
      contextId: context.id,
      title: "Quanten Arbeitsprojekt",
      goal: "Prüfungsplanung nachvollziehen",
      searchEnabled: true,
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
      createSearchRouter({
        authentication,
        search: new LocalSearchService(new PrismaSearchRepository(database)),
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

  assert.equal((await fetch(`${base}/search?q=Quanten`)).status, 401);
  const login = await fetch(`${base}/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";", 1)[0] ?? "";
  const response = await fetch(`${base}/search?q=Quanten`, {
    headers: { cookie },
  });
  assert.equal(response.status, 200);
  const search = (await response.json()) as SearchResponse;
  assert.deepEqual(
    new Set(search.results.map((result) => result.contentType)),
    new Set([
      "project",
      "project_goal",
      "project_milestone",
      "note",
      "document",
      "study_module",
      "study_entry",
      "work_project",
    ]),
  );
  assert.ok(search.results.every((result) => result.ownerId === owner.id));
  assert.ok(search.results.every((result) => result.searchEnabled));
  assert.ok(
    search.results.every((result) => result.detailPath.startsWith("/")),
  );
  assert.ok(
    !search.results.some((result) =>
      /fremd|privat|gelösch|archiviert|abgebrochen/i.test(result.title),
    ),
  );
  assert.equal(
    search.results.find((result) => result.id === note.id)?.source.id,
    note.id,
  );
  assert.equal(
    search.results.find((result) => result.id === document.id)?.matchReason,
    "title",
  );
  assert.equal(
    search.results.find((result) => result.id === module.id)?.source.id,
    module.id,
  );
  assert.equal(
    search.results.find((result) => result.id === workProject.id)?.source.id,
    workProject.id,
  );

  const accented = (await (
    await fetch(`${base}/search?q=prufungsplanung`, { headers: { cookie } })
  ).json()) as SearchResponse;
  assert.ok(accented.results.some((result) => result.id === note.id));
  assert.deepEqual(
    (await (
      await fetch(`${base}/search?q=***`, { headers: { cookie } })
    ).json()) as SearchResponse,
    { query: "***", results: [] },
  );
  assert.deepEqual(
    (await (
      await fetch(`${base}/search`, { headers: { cookie } })
    ).json()) as SearchResponse,
    { query: "", results: [] },
  );
  assert.equal(
    (
      await fetch(`${base}/search?q=${"x".repeat(201)}`, {
        headers: { cookie },
      })
    ).status,
    400,
  );
});
