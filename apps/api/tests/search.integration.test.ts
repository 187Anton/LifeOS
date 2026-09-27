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

test("liefert für jedes Suchziel die öffentliche Identität zum Öffnen", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalId = `search-target-owner-${suffix}`;
  const otherExternalId = `search-target-other-${suffix}`;
  const password = `synthetisches-zielpasswort-${suffix}`;
  const owner = await database.user.create({
    data: {
      externalId,
      displayName: "Synthetische Zielperson",
      settings: { create: {} },
      credential: { create: { passwordHash: await hashPassword(password) } },
    },
  });
  const other = await database.user.create({
    data: {
      externalId: otherExternalId,
      displayName: "Andere Zielperson",
      settings: { create: {} },
    },
  });
  const program = await database.studyProgram.create({
    data: {
      userId: owner.id,
      title: "Synthetischer Navigationsstudiengang",
      institution: "Lokale Hochschule",
      periodLabel: "Navigationssemester",
    },
  });
  const module = await database.studyModule.create({
    data: {
      userId: owner.id,
      programId: program.id,
      title: "Navigation Quantenmodul",
      code: "NAV-201",
      notes: "Synopsis zur Navigation",
      searchEnabled: true,
      entries: {
        create: [
          {
            kind: "exam",
            title: "Navigation Quantenprüfung",
            dueDate: new Date("2033-06-01T00:00:00.000Z"),
          },
          {
            kind: "submission",
            title: "Navigation archivierte Abgabe",
            dueDate: new Date("2033-06-02T00:00:00.000Z"),
            archivedAt: new Date("2033-06-03T00:00:00.000Z"),
          },
        ],
      },
    },
  });
  const moduleEntry = await database.studyEntry.findFirstOrThrow({
    where: { moduleId: module.id, kind: "exam" },
  });
  /* Ein Modul ohne Suchfreigabe und ein fremdes Modul dürfen nie Ziel sein. */
  await database.studyModule.create({
    data: {
      userId: owner.id,
      programId: program.id,
      title: "Navigation Quantenmodul ohne Freigabe",
      searchEnabled: false,
    },
  });
  const foreignProgram = await database.studyProgram.create({
    data: {
      userId: other.id,
      title: "Fremder Navigationsstudiengang",
      institution: "Fremde Hochschule",
      periodLabel: "Fremdsemester",
    },
  });
  await database.studyModule.create({
    data: {
      userId: other.id,
      programId: foreignProgram.id,
      title: "Navigation fremdes Quantenmodul",
      searchEnabled: true,
    },
  });
  const note = await database.note.create({
    data: {
      userId: owner.id,
      title: "Navigation Quantennotiz",
      content: "Synthetischer Notizinhalt",
      searchEnabled: true,
      studyModuleId: module.id,
    },
  });
  const document = await database.document.create({
    data: {
      userId: owner.id,
      studyModuleId: module.id,
      storageKey: `${randomUUID()}.md`,
      fileName: "navigation-quanten.md",
      mimeType: "text/markdown",
      byteSize: 32,
      sha256: "c".repeat(64),
      modifiedAt: new Date("2033-06-04T12:00:00.000Z"),
      searchEnabled: true,
    },
  });
  await database.document.create({
    data: {
      userId: owner.id,
      storageKey: `${randomUUID()}.md`,
      fileName: "navigation-entfernt.md",
      mimeType: "text/markdown",
      byteSize: 32,
      sha256: "d".repeat(64),
      modifiedAt: new Date("2033-06-04T12:00:00.000Z"),
      searchEnabled: true,
      deletedAt: new Date("2033-06-05T12:00:00.000Z"),
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
  const login = await fetch(`${base}/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";", 1)[0] ?? "";
  const search = (await (
    await fetch(`${base}/search?q=Navigation`, { headers: { cookie } })
  ).json()) as SearchResponse;
  const byType = (contentType: string) =>
    search.results.filter((result) => result.contentType === contentType);

  const modules = byType("study_module");
  assert.equal(modules.length, 1);
  assert.equal(modules[0]?.id, module.id);
  assert.equal(modules[0]?.source.id, module.id);
  assert.equal(modules[0]?.detailPath, `/study/modules/${module.id}`);

  const entries = byType("study_entry");
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.id, moduleEntry.id);
  /* Der Eintrag wird über sein Modul geöffnet und dort markiert. */
  assert.equal(entries[0]?.source.id, module.id);
  assert.equal(entries[0]?.source.type, "study_module");
  assert.equal(
    entries[0]?.detailPath,
    `/study/modules/${module.id}#entry-${moduleEntry.id}`,
  );

  const notes = byType("note");
  assert.equal(notes.length, 1);
  assert.equal(notes[0]?.id, note.id);
  assert.equal(notes[0]?.source.id, note.id);
  assert.equal(notes[0]?.detailPath, `/knowledge/notes/${note.id}`);

  const documents = byType("document");
  assert.equal(documents.length, 1);
  assert.equal(documents[0]?.id, document.id);
  assert.equal(documents[0]?.source.id, document.id);
  assert.equal(documents[0]?.detailPath, `/knowledge/documents/${document.id}`);

  assert.ok(search.results.every((result) => result.ownerId === owner.id));
  assert.ok(
    !search.results.some((result) => result.title.includes("archiviert")),
  );
  assert.ok(!search.results.some((result) => result.title.includes("fremd")));
  assert.ok(
    !search.results.some((result) => result.title.includes("ohne Freigabe")),
  );
  assert.ok(
    !search.results.some((result) => result.title.includes("entfernt")),
  );
});

test("liefert Seitentreffer und Modulfilter nur aus eigenen, hashaktuellen Freigaben", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalId = `page-owner-${suffix}`;
  const otherExternalId = `page-other-${suffix}`;
  const password = `synthetisches-seitenpasswort-${suffix}`;
  const owner = await database.user.create({
    data: {
      externalId,
      displayName: "Synthetische Seitenperson",
      settings: { create: {} },
      credential: { create: { passwordHash: await hashPassword(password) } },
    },
  });
  const other = await database.user.create({
    data: {
      externalId: otherExternalId,
      displayName: "Andere Seitenperson",
      settings: { create: {} },
    },
  });
  const program = await database.studyProgram.create({
    data: {
      userId: owner.id,
      title: "Synthetisches Studienprogramm",
      institution: "Synthetische Hochschule",
      periodLabel: "2033",
    },
  });
  const module = await database.studyModule.create({
    data: {
      userId: owner.id,
      programId: program.id,
      title: "Quantenplanung Modul",
      searchEnabled: true,
    },
  });
  const otherModule = await database.studyModule.create({
    data: {
      userId: owner.id,
      programId: program.id,
      title: "Quantenplanung Zweitmodul",
      searchEnabled: true,
    },
  });
  const moduleEntry = await database.studyEntry.create({
    data: {
      userId: owner.id,
      moduleId: module.id,
      kind: "lecture",
      title: "Quantenplanung Eintrag",
      notes: "Quantenplanung im Eintrag",
      startsAt: new Date("2033-01-04T09:00:00.000Z"),
      endsAt: new Date("2033-01-04T11:00:00.000Z"),
      timezone: "Europe/Berlin",
    },
  });
  const moduleNote = await database.note.create({
    data: {
      userId: owner.id,
      title: "Quantenplanung Notiz",
      content: "Quantenplanung im Fließtext der Notiz",
      searchEnabled: true,
      studyModuleId: module.id,
    },
  });
  const moduleTask = await database.task.create({
    data: {
      userId: owner.id,
      title: "Quantenplanung Aufgabe",
      studyModuleId: module.id,
    },
  });

  const pageText = [
    { page: 1, text: "Einleitung ohne Suchbegriff." },
    { page: 2, text: "Quantenplanung im Skript auf Seite zwei." },
  ];
  const documentSource = "a".repeat(64);
  const scriptDocument = await database.document.create({
    data: {
      userId: owner.id,
      storageKey: `${randomUUID()}.pdf`,
      fileName: "quantenskript.pdf",
      mimeType: "application/pdf",
      byteSize: 1024,
      sha256: documentSource,
      modifiedAt: new Date("2033-01-03T12:00:00.000Z"),
      searchEnabled: true,
      studyModuleId: module.id,
      extractionStatus: "available",
      extractionSha256: documentSource,
      extractionVersion: "pdfjs-6.3.289/text-v1",
      extractedText: pageText.map((entry) => entry.text).join("\n"),
      extractionPages: pageText,
      extractionPageCount: 2,
      extractedAt: new Date("2033-01-03T12:00:00.000Z"),
    },
  });
  /** Veraltete Quellprüfsumme: Inhalt liegt vor, passt aber nicht zur Datei. */
  const staleDocument = await database.document.create({
    data: {
      userId: owner.id,
      storageKey: `${randomUUID()}.pdf`,
      fileName: "veraltet.pdf",
      mimeType: "application/pdf",
      byteSize: 1024,
      sha256: "b".repeat(64),
      modifiedAt: new Date("2033-01-03T12:00:00.000Z"),
      searchEnabled: true,
      studyModuleId: module.id,
      extractionStatus: "available",
      extractionSha256: "c".repeat(64),
      extractionVersion: "pdfjs-6.3.289/text-v1",
      extractedText: "Quantenplanung aus einer veralteten Prüfsumme.",
      extractionPages: [
        { page: 1, text: "Quantenplanung aus einer veralteten Prüfsumme." },
      ],
      extractionPageCount: 1,
      extractedAt: new Date("2033-01-03T12:00:00.000Z"),
    },
  });
  /** Noch nicht verarbeitet: kein Inhalt, aber das Dokument bleibt auffindbar. */
  const pendingDocument = await database.document.create({
    data: {
      userId: owner.id,
      storageKey: `${randomUUID()}.pdf`,
      fileName: "quanten-altbestand.pdf",
      mimeType: "application/pdf",
      byteSize: 1024,
      sha256: "d".repeat(64),
      modifiedAt: new Date("2033-01-03T12:00:00.000Z"),
      searchEnabled: true,
      studyModuleId: module.id,
      extractionStatus: "pending",
    },
  });
  const foreignNote = await database.note.create({
    data: {
      userId: other.id,
      title: "Quantenplanung fremde Notiz",
      content: "Quantenplanung einer fremden Person",
      searchEnabled: true,
    },
  });

  const application = createApplication({
    logger: new SilentLogger(),
    readinessProbe: { check: async () => undefined },
    webOrigin: "http://127.0.0.1:5173",
    moduleRouters: [
      createProfileRouter({
        authentication: new AuthenticationService(
          new PrismaProfileRepository(database, externalId),
          1,
        ),
        profile: new ProfileService(
          new PrismaProfileRepository(database, externalId),
        ),
        secureCookies: false,
      }),
      createSearchRouter({
        authentication: new AuthenticationService(
          new PrismaProfileRepository(database, externalId),
          1,
        ),
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

  const login = await fetch(`${base}/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";", 1)[0] ?? "";
  const searchFor = async (query: string, studyModuleId?: string) =>
    (await (
      await fetch(
        `${base}/search?q=${encodeURIComponent(query)}${
          studyModuleId ? `&studyModuleId=${studyModuleId}` : ""
        }`,
        { headers: { cookie } },
      )
    ).json()) as SearchResponse;

  const broad = await searchFor("Quantenplanung");
  const scriptHit = broad.results.find(
    (result) => result.id === scriptDocument.id,
  );
  /** Ein Seitentreffer nennt die betroffene Seite. */
  assert.equal(scriptHit?.page, 2);
  assert.deepEqual(scriptHit?.pages, [2]);
  assert.equal(scriptHit?.matchReason, "content");
  assert.match(scriptHit?.snippet ?? "", /Skript auf Seite zwei/);
  assert.equal(
    scriptHit?.detailPath,
    `/knowledge/documents/${scriptDocument.id}`,
  );

  /**
   * Ohne hashaktuelle Extraktion entsteht kein Inhaltstreffer: Das Dokument
   * erscheint nur über seine eigenen Metadaten und ohne Seitenangabe.
   */
  const staleHit = broad.results.find(
    (result) => result.id === staleDocument.id,
  );
  assert.equal(staleHit?.matchReason, "metadata");
  assert.equal(staleHit?.page, null);
  assert.deepEqual(staleHit?.pages, []);
  /** Der Text der veralteten Extraktion erscheint in keinem Treffer. */
  assert.equal((await searchFor("veralteten Prüfsumme")).results.length, 0);
  /** Nur die hashaktuelle Quelle liefert Inhalt – hier Seite 1 des Skripts. */
  const firstPageHit = await searchFor("Einleitung ohne Suchbegriff");
  assert.equal(firstPageHit.results.length, 1);
  assert.equal(firstPageHit.results[0]?.id, scriptDocument.id);
  assert.equal(firstPageHit.results[0]?.page, 1);
  /** Ohne Inhalt bleibt das Dokument über seine Metadaten auffindbar. */
  const pendingByName = await searchFor("quanten-altbestand.pdf");
  assert.equal(
    pendingByName.results.some((result) => result.id === pendingDocument.id),
    true,
  );
  assert.equal(
    pendingByName.results.find((result) => result.id === pendingDocument.id)
      ?.page,
    null,
  );
  assert.equal((await searchFor("veralteten Prüfsumme")).results.length, 0);

  /** Sobald Prüfsumme und Status passen, greift dieselbe Quelle sofort. */
  await database.document.update({
    where: { id: staleDocument.id },
    data: { extractionSha256: "b".repeat(64) },
  });
  const currentStale = await searchFor("veralteten Prüfsumme");
  assert.equal(currentStale.results.length, 1);
  assert.equal(currentStale.results[0]?.id, staleDocument.id);
  assert.equal(currentStale.results[0]?.page, 1);

  /** Der Modulfilter greift nur auf freigegebene Modulquellen. */
  const scoped = await searchFor("Quantenplanung", module.id);
  assert.deepEqual(
    scoped.results.map((result) => result.id).sort(),
    [
      module.id,
      moduleEntry.id,
      moduleNote.id,
      scriptDocument.id,
      staleDocument.id,
      /* Ohne Text bleibt das Dokument über seine Modulmetadaten auffindbar. */
      pendingDocument.id,
    ].sort(),
  );
  assert.equal(
    scoped.results.some((result) => result.id === module.id),
    true,
  );
  assert.equal(
    scoped.results.some((result) => result.id === moduleEntry.id),
    true,
  );
  assert.equal(
    scoped.results.some((result) => result.id === moduleNote.id),
    true,
  );
  assert.equal(
    scoped.results.some((result) => result.id === scriptDocument.id),
    true,
  );
  /** Aufgaben bleiben Fachfilter und haben keine automatische Suchfreigabe. */
  assert.equal(
    scoped.results.some((result) => result.id === moduleTask.id),
    false,
  );
  /** Fremde Module und fremde Freigaben bleiben ausgeschlossen. */
  assert.equal(
    scoped.results.some((result) => result.id === otherModule.id),
    false,
  );
  assert.equal(
    scoped.results.some((result) => result.id === foreignNote.id),
    false,
  );
  assert.ok(scoped.results.every((result) => result.ownerId === owner.id));

  /** Widerruf, Archivierung und Löschung schließen Treffer sofort aus. */
  await database.document.update({
    where: { id: scriptDocument.id },
    data: { searchEnabled: false },
  });
  assert.equal((await searchFor("Skript auf Seite zwei")).results.length, 0);
  await database.document.update({
    where: { id: scriptDocument.id },
    data: {
      searchEnabled: true,
      archivedAt: new Date("2033-02-01T12:00:00.000Z"),
    },
  });
  assert.equal((await searchFor("Skript auf Seite zwei")).results.length, 0);
  await database.document.update({
    where: { id: scriptDocument.id },
    data: { archivedAt: null, deletedAt: new Date("2033-02-02T12:00:00.000Z") },
  });
  assert.equal((await searchFor("Skript auf Seite zwei")).results.length, 0);
  await database.note.update({
    where: { id: moduleNote.id },
    data: { searchEnabled: false },
  });
  assert.equal((await searchFor("Fließtext der Notiz")).results.length, 0);
});
