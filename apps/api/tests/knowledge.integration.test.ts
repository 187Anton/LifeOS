import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
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
import {
  encryptedPdf,
  imageOnlyPdf,
  multiPagePdf,
  truncatedPdf,
} from "./pdf-fixtures.js";

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

test("verarbeitet lokale PDFs seitenbezogen, erneut und ohne Klartext in Protokollen", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalId = `pdf-owner-${suffix}`;
  const otherExternalId = `pdf-other-${suffix}`;
  const password = `synthetisches-pdfpasswort-${suffix}`;
  const storageRoot = await mkdtemp(path.join(os.tmpdir(), "lifeos-pdf-"));
  const owner = await database.user.create({
    data: {
      externalId,
      displayName: "Synthetische PDF-Person",
      settings: { create: {} },
      credential: { create: { passwordHash: await hashPassword(password) } },
    },
  });
  const other = await database.user.create({
    data: {
      externalId: otherExternalId,
      displayName: "Andere PDF-Person",
      settings: { create: {} },
    },
  });
  const storage = new LocalDocumentStorage(storageRoot);
  const logged: string[] = [];
  const logger: Logger = {
    debug: (...values: unknown[]) => logged.push(String(values.join(" "))),
    info: (...values: unknown[]) => logged.push(String(values.join(" "))),
    warn: (...values: unknown[]) => logged.push(String(values.join(" "))),
    error: (...values: unknown[]) => logged.push(String(values.join(" "))),
  };
  const knowledge = new KnowledgeService(
    new PrismaKnowledgeRepository(database),
    storage,
    () => new Date("2033-03-01T12:00:00.000Z"),
  );
  const profileRepository = new PrismaProfileRepository(database, externalId);
  const authentication = new AuthenticationService(profileRepository, 1);
  const application = createApplication({
    logger,
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
  const origin = base.slice(0, -"/api/v1".length);
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
  const upload = async (fileName: string, bytes: Buffer) =>
    fetch(`${base}/documents?fileName=${encodeURIComponent(fileName)}`, {
      method: "POST",
      headers: { cookie, "content-type": "application/pdf" },
      body: new Uint8Array(bytes),
    });

  /** Ein mehrseitiges PDF mit Text auf zwei von drei Seiten. */
  const documentBytes = multiPagePdf([
    "Synthetische Vorlesungsnotiz zur Extraktion,",
    "",
    "Zweite Textseite der Vorlesung.",
  ]);
  const textUpload = await upload("vorlesung.pdf", documentBytes);
  assert.equal(textUpload.status, 201);
  const textDocument = (await textUpload.json()) as DocumentResponse;
  assert.equal(textDocument.extraction.status, "available");
  assert.equal(textDocument.extraction.errorCode, null);
  assert.equal(textDocument.extraction.truncated, false);
  assert.equal(textDocument.extraction.pageCount, 3);
  assert.equal(textDocument.sha256.length, 64);
  assert.equal(textDocument.extraction.sourceSha256, textDocument.sha256);
  assert.equal(textDocument.extraction.current, true);
  assert.match(
    textDocument.extraction.version ?? "",
    /^pdfjs-\d+\.\d+\.\d+\/text-v1$/,
  );
  assert.equal(textDocument.extraction.storedPages, 2);
  const storedText = await database.document.findUniqueOrThrow({
    where: { id: textDocument.id },
  });
  assert.equal(storedText.extractionStatus, "available");
  assert.equal(storedText.extractionSha256, storedText.sha256);
  const storedPages = storedText.extractionPages as Array<{
    page: number;
    text: string;
  }>;
  assert.deepEqual(
    storedPages.map((page) => page.page),
    [1, 3],
  );
  assert.match(storedPages[0]!.text, /Vorlesungsnotiz zur Extraktion/);
  assert.match(storedText.extractedText ?? "", /Zweite Textseite/);

  /** Die Datei bleibt unverändert abrufbar: Extraktion ersetzt keinen Inhalt. */
  const download = await fetch(`${origin}${textDocument.contentUrl}`, {
    headers: { cookie },
  });
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), documentBytes);

  /** Bildseiten ohne Text, geschützte und defekte Dateien. */
  const imageUpload = await upload("scan.pdf", imageOnlyPdf(2));
  const imageDocument = (await imageUpload.json()) as DocumentResponse;
  assert.equal(imageDocument.extraction.status, "no_text");
  assert.equal(imageDocument.extraction.pageCount, 2);
  assert.equal(imageDocument.extraction.storedPages, 0);

  const protectedUpload = await upload(
    "geschuetzt.pdf",
    encryptedPdf("Vertraulicher Inhalt", "nutzer", "besitzer"),
  );
  const protectedDocument = (await protectedUpload.json()) as DocumentResponse;
  assert.equal(protectedDocument.extraction.status, "protected");
  assert.equal(protectedDocument.extraction.pageCount, null);
  assert.equal(protectedDocument.extraction.storedPages, 0);
  const protectedStored = await database.document.findUniqueOrThrow({
    where: { id: protectedDocument.id },
  });
  assert.equal(protectedStored.extractedText, null);

  const damagedBytes = truncatedPdf();
  const damagedUpload = await upload("defekt.pdf", damagedBytes);
  const damagedDocument = (await damagedUpload.json()) as DocumentResponse;
  assert.equal(damagedDocument.extraction.status, "failed");
  assert.equal(damagedDocument.extraction.errorCode, "invalid_pdf");
  /** Ein Parserfehler darf die Datei nicht verlieren. */
  const damagedDownload = await fetch(
    `${origin}${damagedDocument.contentUrl}`,
    { headers: { cookie } },
  );
  assert.equal(damagedDownload.status, 200);
  assert.deepEqual(
    Buffer.from(await damagedDownload.arrayBuffer()),
    damagedBytes,
  );

  /** Erneute Verarbeitung: besitzgebunden, widerrufbar, idempotent. */
  assert.equal(
    (
      await fetch(`${base}/documents/${textDocument.id}/extraction`, {
        method: "POST",
        headers: { cookie },
      })
    ).status,
    200,
  );
  const foreignDocument = await database.document.create({
    data: {
      userId: other.id,
      storageKey: `${randomUUID()}.pdf`,
      fileName: "fremd.pdf",
      mimeType: "application/pdf",
      byteSize: damagedBytes.byteLength,
      sha256: "c".repeat(64),
      modifiedAt: new Date("2033-03-01T12:00:00.000Z"),
    },
  });
  assert.equal(
    (
      await fetch(`${base}/documents/${foreignDocument.id}/extraction`, {
        method: "POST",
        headers: { cookie },
      })
    ).status,
    404,
  );

  /** Altextraktion: datenerhaltend als Legacy markiert und neu verarbeitbar. */
  const legacyDocument = await database.document.create({
    data: {
      userId: owner.id,
      storageKey: `${randomUUID()}.pdf`,
      fileName: "altbestand.pdf",
      mimeType: "application/pdf",
      byteSize: documentBytes.byteLength,
      sha256: createHash("sha256").update(documentBytes).digest("hex"),
      modifiedAt: new Date("2033-03-01T12:00:00.000Z"),
      extractionStatus: "available",
      extractionVersion: "legacy-text-v1",
      extractedText: "Übernommener Altext ohne Seitenbezug.",
      extractedAt: new Date("2033-03-01T12:00:00.000Z"),
    },
  });
  await mkdir(path.join(storageRoot, owner.id), {
    recursive: true,
    mode: 0o700,
  });
  await writeFile(
    path.join(storageRoot, owner.id, legacyDocument.storageKey),
    documentBytes,
  );
  const legacyOverview = (await (
    await fetch(`${base}/knowledge`, { headers: { cookie } })
  ).json()) as { documents: DocumentResponse[] };
  const legacyView = legacyOverview.documents.find(
    (entry) => entry.id === legacyDocument.id,
  );
  assert.equal(legacyView?.extraction.version, "legacy-text-v1");
  assert.equal(legacyView?.extraction.storedPages, 0);

  const reprocessed = await fetch(
    `${base}/documents/${legacyDocument.id}/extraction`,
    { method: "POST", headers: { cookie } },
  );
  assert.equal(reprocessed.status, 200);
  const reprocessedDocument = (await reprocessed.json()) as DocumentResponse;
  assert.equal(reprocessedDocument.extraction.status, "available");
  assert.match(
    reprocessedDocument.extraction.version ?? "",
    /^pdfjs-\d+\.\d+\.\d+\/text-v1$/,
  );
  assert.equal(reprocessedDocument.extraction.storedPages, 2);

  /** Eine veraltete Prüfsumme erzeugt keinen stillen Treffer. */
  await writeFile(
    path.join(storageRoot, owner.id, legacyDocument.storageKey),
    multiPagePdf(["Manipulierte Seite"]),
  );
  assert.equal(
    (
      await fetch(`${base}/documents/${legacyDocument.id}/extraction`, {
        method: "POST",
        headers: { cookie },
      })
    ).status,
    409,
  );
  const afterTampering = await database.document.findUniqueOrThrow({
    where: { id: legacyDocument.id },
  });
  assert.equal(afterTampering.extractionSha256, legacyDocument.sha256);
  assert.equal((afterTampering.extractionPages as Array<unknown>).length, 2);

  /** Kein Dokumentklartext in Protokollen. */
  assert.equal(logged.length > 0, true);
  for (const line of logged) {
    assert.equal(line.includes("Vorlesungsnotiz zur Extraktion"), false);
    assert.equal(line.includes("Zweite Textseite"), false);
    assert.equal(line.includes("Vertraulicher Inhalt"), false);
    assert.equal(line.includes("Übernommener Altext"), false);
  }
});
