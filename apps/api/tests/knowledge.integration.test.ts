import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createDatabaseClient } from "@lifeos/database";
import type {
  DocumentResponse,
  NoteDetailResponse,
  NoteResponse,
} from "@lifeos/contracts";

import { createApplication } from "../src/application.js";
import type { Logger } from "../src/logger.js";
import { PrismaKnowledgeRepository } from "../src/modules/knowledge/repository.js";
import {
  createDocumentUploadRouter,
  createKnowledgeRouter,
} from "../src/modules/knowledge/router.js";
import { KnowledgeService } from "../src/modules/knowledge/service.js";
import { LocalDocumentStorage } from "../src/modules/knowledge/storage.js";
import { PrismaProfileRepository } from "../src/modules/profile/repository.js";
import { createProfileRouter } from "../src/modules/profile/router.js";
import { hashPassword } from "../src/modules/profile/security.js";
import {
  AuthenticationService,
  ProfileService,
} from "../src/modules/profile/service.js";

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

test("verwaltet lokale Notizen und Dokumente besitzgebunden, versioniert und ohne Klartext-Audit", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalId = `knowledge-owner-${suffix}`;
  const otherExternalId = `knowledge-other-${suffix}`;
  const password = `synthetisches-wissenspasswort-${suffix}`;
  const storageRoot = await mkdtemp(
    path.join(os.tmpdir(), "lifeos-knowledge-"),
  );
  const owner = await database.user.create({
    data: {
      externalId,
      displayName: "Synthetische Wissensperson",
      settings: { create: {} },
      credential: { create: { passwordHash: await hashPassword(password) } },
    },
  });
  const other = await database.user.create({
    data: {
      externalId: otherExternalId,
      displayName: "Andere Wissensperson",
      settings: { create: {} },
    },
  });
  const project = await database.project.create({
    data: { userId: owner.id, title: "Lokales Wissensprojekt" },
  });
  const foreignProject = await database.project.create({
    data: { userId: other.id, title: "Fremdes Projekt" },
  });
  const storage = new LocalDocumentStorage(storageRoot);
  const knowledge = new KnowledgeService(
    new PrismaKnowledgeRepository(database),
    storage,
    () => new Date("2033-02-01T12:00:00.000Z"),
  );
  const profileRepository = new PrismaProfileRepository(database, externalId);
  const authentication = new AuthenticationService(profileRepository, 1);
  const application = createApplication({
    logger: new SilentLogger(),
    readinessProbe: { check: async () => undefined },
    webOrigin: "http://127.0.0.1:5173",
    rawModuleRouters: [
      createDocumentUploadRouter({ authentication, knowledge }),
    ],
    moduleRouters: [
      createProfileRouter({
        authentication,
        profile: new ProfileService(profileRepository),
        secureCookies: false,
      }),
      createKnowledgeRouter({ authentication, knowledge }),
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
    await rm(storageRoot, { recursive: true, force: true });
  });

  assert.equal((await fetch(`${base}/knowledge`)).status, 401);
  const login = await fetch(`${base}/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";", 1)[0] ?? "";
  const jsonHeaders = { cookie, "content-type": "application/json" };
  assert.equal(
    (
      await fetch(`${base}/notes`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          title: "Fremd",
          content: "synthetisch",
          projectId: foreignProject.id,
        }),
      })
    ).status,
    400,
  );

  const createdResponse = await fetch(`${base}/notes`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      title: "Lokale Testnotiz",
      content: "# Synthetisch\n\nEin sicherer Testinhalt.",
      category: "Test",
      tags: [" lokal ", "lokal"],
      projectId: project.id,
      searchEnabled: false,
    }),
  });
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()) as NoteResponse;
  assert.equal(created.ownerId, owner.id);
  assert.deepEqual(created.tags, ["lokal"]);
  assert.equal(created.version, 1);
  assert.equal(created.searchEnabled, false);
  const changedResponse = await fetch(`${base}/notes/${created.id}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify({
      title: "Lokale Testnotiz Version 2",
      content: "Nur synthetischer Inhalt Version 2.",
    }),
  });
  assert.equal(changedResponse.status, 200);
  const detail = (await (
    await fetch(`${base}/notes/${created.id}`, { headers: { cookie } })
  ).json()) as NoteDetailResponse;
  assert.equal(detail.version, 2);
  assert.deepEqual(
    detail.versions.map((version) => version.version),
    [2, 1],
  );
  assert.equal(
    (
      await fetch(`${base}/notes/${created.id}`, {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify({ archived: true }),
      })
    ).status,
    200,
  );

  const bytes = Buffer.from("Synthetischer Dokumentinhalt für den API-Test.\n");
  const upload = await fetch(
    `${base}/documents?fileName=${encodeURIComponent("lokaler test.txt")}&projectId=${project.id}`,
    {
      method: "POST",
      headers: { cookie, "content-type": "text/plain" },
      body: bytes,
    },
  );
  assert.equal(upload.status, 201);
  const document = (await upload.json()) as DocumentResponse;
  assert.equal(document.ownerId, owner.id);
  assert.equal(document.searchEnabled, false);
  assert.equal(document.project?.id, project.id);
  const stored = await database.document.findUniqueOrThrow({
    where: { id: document.id },
  });
  assert.equal(
    (await stat(path.join(storageRoot, owner.id, stored.storageKey))).mode &
      0o777,
    0o600,
  );
  const origin = base.slice(0, -"/api/v1".length);
  const download = await fetch(`${origin}${document.contentUrl}`, {
    headers: { cookie },
  });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  await writeFile(
    path.join(storageRoot, owner.id, stored.storageKey),
    "manipulierter Dokumentinhalt\n",
  );
  const corruptedDownload = await fetch(`${origin}${document.contentUrl}`, {
    headers: { cookie },
  });
  assert.equal(corruptedDownload.status, 409);
  assert.equal(
    ((await corruptedDownload.json()) as { error: { code: string } }).error
      .code,
    "CONFLICT",
  );
  await writeFile(path.join(storageRoot, owner.id, stored.storageKey), bytes);

  const invalidMimeType = await fetch(
    `${base}/documents?fileName=ungueltig.txt`,
    {
      method: "POST",
      headers: { cookie, "content-type": "text/plain, application/json" },
      body: "synthetisch",
    },
  );
  assert.equal(invalidMimeType.status, 400);
  assert.equal(
    (
      await fetch(
        `${base}/documents?fileName=test.txt&projectId=${foreignProject.id}`,
        {
          method: "POST",
          headers: { cookie, "content-type": "text/plain" },
          body: "fremde Referenz",
        },
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(`${base}/documents/${document.id}`, {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify({ archived: true }),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(`${base}/documents/${document.id}`, {
        method: "DELETE",
        headers: { cookie },
      })
    ).status,
    204,
  );
  assert.equal(
    (await fetch(`${origin}${document.contentUrl}`, { headers: { cookie } }))
      .status,
    404,
  );
  await assert.rejects(
    stat(path.join(storageRoot, owner.id, stored.storageKey)),
  );

  assert.equal(
    (
      await fetch(`${base}/notes/${created.id}`, {
        method: "DELETE",
        headers: { cookie },
      })
    ).status,
    204,
  );
  assert.equal(
    (await fetch(`${base}/notes/${created.id}`, { headers: { cookie } }))
      .status,
    404,
  );
  const audits = await database.auditEvent.findMany({
    where: { userId: owner.id, action: { startsWith: "knowledge." } },
  });
  assert.ok(audits.length >= 6);
  assert.ok(
    audits.every(
      (event) =>
        !JSON.stringify(event.metadata).includes(
          "Synthetischer Dokumentinhalt",
        ) && !JSON.stringify(event.metadata).includes("Version 2"),
    ),
  );
});

test("öffnet Dokumente über Besitzgrenzen, Modulbezug und Archivzustand", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalId = `knowledge-target-owner-${suffix}`;
  const otherExternalId = `knowledge-target-other-${suffix}`;
  const password = `synthetisches-dokumentpasswort-${suffix}`;
  const storageRoot = await mkdtemp(
    path.join(os.tmpdir(), "lifeos-knowledge-target-"),
  );
  const owner = await database.user.create({
    data: {
      externalId,
      displayName: "Synthetische Dokumentperson",
      settings: { create: {} },
      credential: { create: { passwordHash: await hashPassword(password) } },
    },
  });
  const other = await database.user.create({
    data: {
      externalId: otherExternalId,
      displayName: "Andere Dokumentperson",
      settings: { create: {} },
    },
  });
  const program = await database.studyProgram.create({
    data: {
      userId: owner.id,
      title: "Synthetischer Dokumentstudiengang",
      institution: "Lokale Testhochschule",
      periodLabel: "Dokumentsemester",
    },
  });
  const module = await database.studyModule.create({
    data: {
      userId: owner.id,
      programId: program.id,
      title: "Synthetisches Dokumentmodul",
    },
  });
  const foreignProgram = await database.studyProgram.create({
    data: {
      userId: other.id,
      title: "Fremder Dokumentstudiengang",
      institution: "Fremde Einrichtung",
      periodLabel: "Fremdsemester",
    },
  });
  const foreignModule = await database.studyModule.create({
    data: {
      userId: other.id,
      programId: foreignProgram.id,
      title: "Fremdes Dokumentmodul",
    },
  });
  const storage = new LocalDocumentStorage(storageRoot);
  const knowledge = new KnowledgeService(
    new PrismaKnowledgeRepository(database),
    storage,
    () => new Date("2033-02-01T12:00:00.000Z"),
  );
  const profileRepository = new PrismaProfileRepository(database, externalId);
  const authentication = new AuthenticationService(profileRepository, 1);
  const application = createApplication({
    logger: new SilentLogger(),
    readinessProbe: { check: async () => undefined },
    webOrigin: "http://127.0.0.1:5173",
    rawModuleRouters: [
      createDocumentUploadRouter({ authentication, knowledge }),
    ],
    moduleRouters: [
      createProfileRouter({
        authentication,
        profile: new ProfileService(profileRepository),
        secureCookies: false,
      }),
      createKnowledgeRouter({ authentication, knowledge }),
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
    await rm(storageRoot, { recursive: true, force: true });
  });

  const login = await fetch(`${base}/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";", 1)[0] ?? "";
  const jsonHeaders = { cookie, "content-type": "application/json" };
  const bytes = Buffer.from("Synthetischer Modul-Dokumentinhalt.\n");
  const upload = await fetch(
    `${base}/documents?fileName=${encodeURIComponent("modul-skript.txt")}`,
    {
      method: "POST",
      headers: { cookie, "content-type": "text/plain" },
      body: bytes,
    },
  );
  assert.equal(upload.status, 201);
  const document = (await upload.json()) as DocumentResponse;
  assert.equal(document.studyModule, null);
  assert.equal(document.sha256.length, 64);

  assert.equal(
    (
      await fetch(`${base}/documents/${document.id}`, {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify({ studyModuleId: foreignModule.id }),
      })
    ).status,
    400,
  );

  const linked = await fetch(`${base}/documents/${document.id}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify({
      projectId: null,
      studyModuleId: module.id,
      searchEnabled: true,
    }),
  });
  assert.equal(linked.status, 200);
  const linkedDocument = (await linked.json()) as DocumentResponse;
  assert.equal(linkedDocument.studyModule?.id, module.id);
  assert.equal(
    linkedDocument.studyModule?.title,
    "Synthetisches Dokumentmodul",
  );
  assert.equal(linkedDocument.project, null);
  assert.equal(linkedDocument.searchEnabled, true);
  /* Die Datei selbst bleibt unverändert: kein stiller Dateiersatz. */
  assert.equal(linkedDocument.sha256, document.sha256);
  assert.equal(linkedDocument.byteSize, document.byteSize);
  const origin = base.slice(0, -"/api/v1".length);
  const download = await fetch(`${origin}${linkedDocument.contentUrl}`, {
    headers: { cookie },
  });
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);

  const linkedOverview = await (
    await fetch(`${base}/knowledge?includeArchived=true`, {
      headers: { cookie },
    })
  ).json();
  const overviewDocument = (
    linkedOverview as { documents: DocumentResponse[] }
  ).documents.find((entry) => entry.id === document.id);
  assert.equal(
    overviewDocument?.studyModule?.title,
    "Synthetisches Dokumentmodul",
  );

  assert.equal(
    (
      await fetch(`${base}/documents/${document.id}`, {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify({ archived: true }),
      })
    ).status,
    200,
  );
  const active = (await (
    await fetch(`${base}/knowledge`, { headers: { cookie } })
  ).json()) as { documents: DocumentResponse[] };
  assert.equal(
    active.documents.some((entry) => entry.id === document.id),
    false,
  );
  const archived = (await (
    await fetch(`${base}/knowledge?includeArchived=true`, {
      headers: { cookie },
    })
  ).json()) as { documents: DocumentResponse[] };
  const archivedDocument = archived.documents.find(
    (entry) => entry.id === document.id,
  );
  assert.ok(archivedDocument?.archivedAt);
  assert.equal(archivedDocument?.studyModule?.id, module.id);

  const foreignDocument = await database.document.create({
    data: {
      userId: other.id,
      storageKey: `${randomUUID()}.txt`,
      fileName: "fremd.txt",
      mimeType: "text/plain",
      byteSize: 4,
      sha256: "b".repeat(64),
      modifiedAt: new Date("2033-02-01T12:00:00.000Z"),
    },
  });
  assert.equal(
    (
      await fetch(`${base}/documents/${foreignDocument.id}`, {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify({ searchEnabled: true }),
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await fetch(`${base}/documents/${foreignDocument.id}`, {
        method: "DELETE",
        headers: { cookie },
      })
    ).status,
    404,
  );
});
