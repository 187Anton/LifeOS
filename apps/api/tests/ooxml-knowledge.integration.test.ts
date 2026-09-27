import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import test from "node:test";

import { createDatabaseClient } from "@lifeos/database";
import type { ApiErrorResponse, DocumentResponse } from "@lifeos/contracts";

import { createApplication } from "../src/application.js";
import type { Logger } from "../src/logger.js";
import { ooxmlExtractorThreadsInUse } from "../src/modules/knowledge/ooxml-extractor-worker.js";
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
import { buildDocx, buildPptx, vbaProjectEntry } from "./ooxml-fixtures.js";

class SilentLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

const PPTX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOCM_MIME_TYPE = "application/vnd.ms-word.document.macroEnabled.12";

const close = (server: Server) =>
  new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );

/**
 * Wartet begrenzt auf eine Bedingung. Wird sie nicht erfüllt, gibt die Funktion
 * `false` zurück, statt zu werfen – der Aufrufer prüft das Ergebnis selbst.
 */
const waitUntil = async (
  condition: () => boolean,
  timeoutMs: number,
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return condition();
};

/**
 * Paket 8: PPTX und DOCX werden rein lokal verarbeitet. Der Weg über die echte
 * API prüft, dass Status, Prüfsumme, Version und Fundstellen dokumentgebunden
 * bleiben und dass Besitz-, Suchfreigabe-, Archivierungs- und Löschgrenzen aus
 * Paket 7 unverändert greifen.
 */
test("verarbeitet lokale PPTX und DOCX folien- und absatzbezogen", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalId = `ooxml-owner-${suffix}`;
  const otherExternalId = `ooxml-other-${suffix}`;
  const password = `synthetisches-ooxmlpasswort-${suffix}`;
  const storageRoot = await mkdtemp(path.join(os.tmpdir(), "lifeos-ooxml-"));
  const owner = await database.user.create({
    data: {
      externalId,
      displayName: "Synthetische Officeperson",
      settings: { create: {} },
      credential: { create: { passwordHash: await hashPassword(password) } },
    },
  });
  const other = await database.user.create({
    data: {
      externalId: otherExternalId,
      displayName: "Andere Officeperson",
      settings: { create: {} },
    },
  });
  const program = await database.studyProgram.create({
    data: {
      userId: owner.id,
      title: "Synthetischer Office-Studiengang",
      institution: "Synthetische Hochschule",
      periodLabel: "2033",
    },
  });
  const module = await database.studyModule.create({
    data: {
      userId: owner.id,
      programId: program.id,
      title: "Synthetisches Officemodul",
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
    () => new Date("2033-06-01T12:00:00.000Z"),
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
  const jsonHeaders = { cookie, "content-type": "application/json" };
  const upload = async (
    fileName: string,
    mimeType: string,
    bytes: Buffer,
    query = "",
  ) =>
    fetch(
      `${base}/documents?fileName=${encodeURIComponent(fileName)}${query}`,
      {
        method: "POST",
        headers: { cookie, "content-type": mimeType },
        body: new Uint8Array(bytes),
      },
    );

  /**
   * Die Foliennummer folgt der Beziehungsreihenfolge der Präsentation, nicht
   * der lexikografischen Reihenfolge der Dateinamen: `slide10.xml` liegt hier
   * bewusst vor `slide2.xml`.
   */
  const pptxBytes = buildPptx({
    slides: [
      { fileName: "slide3.xml", paragraphs: ["Titelfolie der Vorlesung."] },
      {
        fileName: "slide10.xml",
        paragraphs: ["Quantenplanung auf der zweiten Folie."],
      },
      {
        fileName: "slide2.xml",
        paragraphs: ["Quantenplanung auf der dritten Folie."],
      },
      { fileName: "slide1.xml", paragraphs: ["Anhang ohne Suchbegriff."] },
    ],
  });
  const pptxUpload = await upload(
    "vorlesungsfolien.pptx",
    PPTX_MIME_TYPE,
    pptxBytes,
    `&studyModuleId=${module.id}`,
  );
  assert.equal(pptxUpload.status, 201);
  const pptxDocument = (await pptxUpload.json()) as DocumentResponse;
  assert.equal(pptxDocument.extraction.status, "available");
  assert.equal(pptxDocument.extraction.errorCode, null);
  assert.equal(pptxDocument.extraction.version, "ooxml-zip-v1/pptx-slides-v1");
  assert.equal(pptxDocument.extraction.locatorKind, "slide");
  /** Folien werden gezählt; eine Seitenzahl entsteht dabei nicht. */
  assert.equal(pptxDocument.extraction.pageCount, null);
  assert.equal(pptxDocument.extraction.locatorCount, 4);
  assert.equal(pptxDocument.extraction.storedPages, 4);
  assert.equal(pptxDocument.extraction.truncated, false);
  assert.equal(pptxDocument.extraction.sourceSha256, pptxDocument.sha256);
  assert.equal(pptxDocument.extraction.current, true);
  assert.equal(pptxDocument.studyModule?.id, module.id);

  const storedPptx = await database.document.findUniqueOrThrow({
    where: { id: pptxDocument.id },
  });
  const slideLocators = storedPptx.extractionPages as Array<{
    slide: number;
    text: string;
  }>;
  assert.deepEqual(
    slideLocators.map((locator) => locator.slide),
    [1, 2, 3, 4],
  );
  /** Die Reihenfolge stammt aus den Beziehungen, nicht aus den Dateinamen. */
  assert.match(slideLocators[0]!.text, /Titelfolie der Vorlesung/);
  assert.match(slideLocators[1]!.text, /Quantenplanung auf der zweiten Folie/);
  assert.match(slideLocators[2]!.text, /dritten Folie/);
  assert.match(storedPptx.extractedText ?? "", /Anhang ohne Suchbegriff/);

  /**
   * Der DOCX-Haupttext wird in Dokumentreihenfolge gelesen; Absatznummern sind
   * stabil und Abschnitte stammen aus erkennbaren Überschriften.
   */
  const docxBytes = buildDocx({
    paragraphs: [
      { text: "Einleitung", style: "Heading1", outline: 0 },
      { text: "Ohne Suchbegriff im Haupttext." },
      { empty: true },
      { text: "Methodik", style: "Heading1", outline: 0 },
      {
        text: "Synthetische Daten wurden lokal ausgewertet.",
      },
      { text: "Quantenplanung im Haupttext der Hausarbeit." },
    ],
  });
  const docxUpload = await upload("hausarbeit.docx", DOCX_MIME_TYPE, docxBytes);
  assert.equal(docxUpload.status, 201);
  const docxDocument = (await docxUpload.json()) as DocumentResponse;
  assert.equal(docxDocument.extraction.status, "available");
  assert.equal(
    docxDocument.extraction.version,
    "ooxml-zip-v1/docx-paragraphs-v1",
  );
  assert.equal(docxDocument.extraction.locatorKind, "paragraph");
  /**
   * Für DOCX gibt es ohne Layout-Rendering keine belastbare Seitenzahl: Es
   * wird deshalb weder eine Seitenzahl gemeldet noch eine erfunden.
   */
  assert.equal(docxDocument.extraction.pageCount, null);
  assert.equal(docxDocument.extraction.locatorCount, 6);
  assert.equal(docxDocument.extraction.storedPages, 5);
  assert.equal(docxDocument.extraction.sourceSha256, docxDocument.sha256);

  const storedDocx = await database.document.findUniqueOrThrow({
    where: { id: docxDocument.id },
  });
  const paragraphLocators = storedDocx.extractionPages as Array<{
    paragraph: number;
    section?: string;
    text: string;
  }>;
  /** Der leere Absatz zählt in der Reihenfolge mit, liefert aber keinen Text. */
  assert.deepEqual(
    paragraphLocators.map((locator) => locator.paragraph),
    [1, 2, 4, 5, 6],
  );
  assert.equal(paragraphLocators[0]!.text, "Einleitung");
  assert.equal(paragraphLocators[3]!.section, "Methodik");

  /** Die Ablage bleibt unangetastet: Extraktion ersetzt keinen Dateiinhalt. */
  for (const [document, bytes] of [
    [pptxDocument, pptxBytes],
    [docxDocument, docxBytes],
  ] as const) {
    const download = await fetch(`${origin}${document.contentUrl}`, {
      headers: { cookie },
    });
    assert.equal(download.status, 200);
    assert.equal(download.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  }

  /** Makrofähige Formate werden weder entpackt noch ausgeführt. */
  const macroUpload = await upload(
    "makro.docm",
    DOCM_MIME_TYPE,
    buildDocx({
      paragraphs: [{ text: "Quantenplanung im Makrodokument." }],
      extraEntries: [vbaProjectEntry()],
    }),
  );
  assert.equal(macroUpload.status, 201);
  const macroDocument = (await macroUpload.json()) as DocumentResponse;
  assert.equal(macroDocument.extraction.status, "unsupported");
  assert.equal(macroDocument.extraction.errorCode, "macro_present");
  assert.equal(macroDocument.extraction.storedPages, 0);
  assert.equal(macroDocument.extraction.locatorKind, null);
  /**
   * Die Datei bleibt an ihre eigene Prüfsumme gebunden, liefert aber keinen
   * Inhalt: Der Makropfad wird erkannt, bevor irgendein Archivteil gelesen wird.
   */
  assert.equal(macroDocument.extraction.sourceSha256, macroDocument.sha256);
  assert.equal(macroDocument.extraction.version, null);
  const storedMacro = await database.document.findUniqueOrThrow({
    where: { id: macroDocument.id },
  });
  assert.equal(storedMacro.extractedText, null);
  /** Keine Fundstellen: die bestehende Spalte bleibt als leere Liste bestehen. */
  assert.deepEqual(storedMacro.extractionPages, []);

  /** Ein beschädigtes Paket verliert die Datei nicht. */
  const damagedBytes = buildDocx({
    paragraphs: [{ text: "Beschädigtes Paket." }],
    corruptDocument: true,
  });
  const damagedUpload = await upload(
    "beschaedigt.docx",
    DOCX_MIME_TYPE,
    damagedBytes,
  );
  assert.equal(damagedUpload.status, 201);
  const damagedDocument = (await damagedUpload.json()) as DocumentResponse;
  assert.equal(damagedDocument.extraction.status, "failed");
  assert.equal(damagedDocument.extraction.errorCode, "damaged_zip");
  assert.equal(damagedDocument.extraction.locatorKind, "paragraph");
  assert.equal(damagedDocument.extraction.pageCount, null);
  assert.equal(damagedDocument.extraction.storedPages, 0);
  const damagedDownload = await fetch(
    `${origin}${damagedDocument.contentUrl}`,
    { headers: { cookie } },
  );
  assert.equal(damagedDownload.status, 200);
  assert.deepEqual(
    Buffer.from(await damagedDownload.arrayBuffer()),
    damagedBytes,
  );

  /** Eine reine Textdatei wird nicht in ein Office-Format umgedeutet. */
  const textUpload = await upload(
    "hinweis.txt",
    "text/plain",
    Buffer.from("Synthetischer Hinweis ohne Suchbegriff.\n"),
  );
  const textDocument = (await textUpload.json()) as DocumentResponse;
  assert.equal(textDocument.extraction.status, "available");
  assert.equal(textDocument.extraction.version, "local-text-v1");
  assert.equal(textDocument.extraction.locatorKind, null);
  assert.equal(textDocument.extraction.locatorCount, null);
  assert.equal(textDocument.extraction.storedPages, 0);

  /** Erneute Verarbeitung bleibt besitzgebunden und wiederholbar. */
  for (const document of [pptxDocument, docxDocument]) {
    const reprocessed = await fetch(
      `${base}/documents/${document.id}/extraction`,
      { method: "POST", headers: { cookie } },
    );
    assert.equal(reprocessed.status, 200);
    const reprocessedDocument = (await reprocessed.json()) as DocumentResponse;
    assert.equal(reprocessedDocument.extraction.status, "available");
    assert.equal(reprocessedDocument.extraction.current, true);
    assert.equal(reprocessedDocument.extraction.sourceSha256, document.sha256);
    assert.equal(reprocessedDocument.sha256, document.sha256);
  }
  const foreignDocument = await database.document.create({
    data: {
      userId: other.id,
      storageKey: `${randomUUID()}.pptx`,
      fileName: "fremd.pptx",
      mimeType: PPTX_MIME_TYPE,
      byteSize: pptxBytes.byteLength,
      sha256: "9".repeat(64),
      modifiedAt: new Date("2033-06-01T12:00:00.000Z"),
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

  /** Suchfreigabe, Archivierung und Löschung bleiben unverändert. */
  const released = await fetch(`${base}/documents/${pptxDocument.id}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify({ searchEnabled: true }),
  });
  assert.equal(released.status, 200);
  const releasedDocument = (await released.json()) as DocumentResponse;
  assert.equal(releasedDocument.searchEnabled, true);
  assert.equal(releasedDocument.extraction.locatorKind, "slide");
  assert.equal(releasedDocument.sha256, pptxDocument.sha256);

  assert.equal(
    (
      await fetch(`${base}/documents/${pptxDocument.id}`, {
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
    active.documents.some((entry) => entry.id === pptxDocument.id),
    false,
  );
  const archived = (await (
    await fetch(`${base}/knowledge?includeArchived=true`, {
      headers: { cookie },
    })
  ).json()) as { documents: DocumentResponse[] };
  const archivedDocument = archived.documents.find(
    (entry) => entry.id === pptxDocument.id,
  );
  assert.ok(archivedDocument?.archivedAt);
  assert.equal(archivedDocument?.extraction.locatorKind, "slide");
  assert.equal(archivedDocument?.extraction.storedPages, 4);

  const storedFile = await database.document.findUniqueOrThrow({
    where: { id: docxDocument.id },
  });
  const storedPath = path.join(storageRoot, owner.id, storedFile.storageKey);
  assert.equal((await stat(storedPath)).mode & 0o777, 0o600);
  assert.equal(
    (
      await fetch(`${base}/documents/${docxDocument.id}`, {
        method: "DELETE",
        headers: { cookie },
      })
    ).status,
    204,
  );
  assert.equal(
    (
      await fetch(`${origin}${docxDocument.contentUrl}`, {
        headers: { cookie },
      })
    ).status,
    404,
  );
  await assert.rejects(stat(storedPath));

  /** Anonyme Anfragen bleiben abgewiesen. */
  const anonymous = await fetch(`${base}/documents?fileName=anonym.docx`, {
    method: "POST",
    headers: { "content-type": DOCX_MIME_TYPE },
  });
  assert.equal(anonymous.status, 401);

  /** Kein Dokumentklartext in Protokollen. */
  assert.equal(logged.length > 0, true);
  for (const line of logged) {
    assert.equal(line.includes("Quantenplanung auf der zweiten Folie"), false);
    assert.equal(line.includes("Quantenplanung im Haupttext"), false);
    assert.equal(line.includes("Quantenplanung im Makrodokument"), false);
    assert.equal(line.includes("Synthetische Daten wurden lokal"), false);
  }
});

/** Fehlerantworten bleiben in Form und Code unverändert (Regression). */
test("weist ungültige Dokumentanfragen unverändert ab", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalId = `ooxml-reject-${suffix}`;
  const password = `synthetisches-ablehnpasswort-${suffix}`;
  const storageRoot = await mkdtemp(path.join(os.tmpdir(), "lifeos-reject-"));
  await database.user.create({
    data: {
      externalId,
      displayName: "Synthetische Ablehnperson",
      settings: { create: {} },
      credential: { create: { passwordHash: await hashPassword(password) } },
    },
  });
  const knowledge = new KnowledgeService(
    new PrismaKnowledgeRepository(database),
    new LocalDocumentStorage(storageRoot),
    () => new Date("2033-06-01T12:00:00.000Z"),
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
    await database.user.deleteMany({ where: { externalId } });
    await database.$disconnect();
    await rm(storageRoot, { recursive: true, force: true });
  });

  const login = await fetch(`${base}/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";", 1)[0] ?? "";

  /** Ein unlesbares Medienformat bleibt ein Formfehler und kein Parserlauf. */
  const invalidMediaType = await fetch(
    `${base}/documents?fileName=ungueltig.pptx`,
    {
      method: "POST",
      headers: { cookie, "content-type": `${PPTX_MIME_TYPE}, text/plain` },
      body: "synthetisch",
    },
  );
  assert.equal(invalidMediaType.status, 400);
  const error = (await invalidMediaType.json()) as ApiErrorResponse;
  assert.equal(error.error.code, "VALIDATION_ERROR");

  /** Ein leerer Foliensatz bleibt lesbar, liefert aber keinen Inhalt. */
  const emptyPptx = buildPptx({ slides: [] });
  const emptyUpload = await fetch(`${base}/documents?fileName=leer.pptx`, {
    method: "POST",
    headers: { cookie, "content-type": PPTX_MIME_TYPE },
    body: new Uint8Array(emptyPptx),
  });
  assert.equal(emptyUpload.status, 201);
  const emptyDocument = (await emptyUpload.json()) as DocumentResponse;
  assert.equal(emptyDocument.extraction.status, "no_text");
  assert.equal(emptyDocument.extraction.locatorKind, "slide");
  assert.equal(emptyDocument.extraction.pageCount, null);
  assert.equal(emptyDocument.extraction.storedPages, 0);
  assert.equal(emptyDocument.extraction.errorCode, null);
});

/**
 * PPTX und DOCX werden in einem begrenzten Worker verarbeitet. Während ein
 * umfangreiches Dokument läuft, muss der API-Prozess weiterhin Anfragen
 * beantworten: eine blockierende Verarbeitung würde den Event-Loop und damit
 * jede weitere Anfrage bis zum Ende des Laufs anhalten.
 */
test("beantwortet eine parallele API-Anfrage während der OOXML-Verarbeitung", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalId = `ooxml-parallel-${suffix}`;
  const password = `synthetisches-parallelpasswort-${suffix}`;
  const storageRoot = await mkdtemp(path.join(os.tmpdir(), "lifeos-parallel-"));
  await database.user.create({
    data: {
      externalId,
      displayName: "Synthetische Parallelperson",
      settings: { create: {} },
      credential: { create: { passwordHash: await hashPassword(password) } },
    },
  });
  const knowledge = new KnowledgeService(
    new PrismaKnowledgeRepository(database),
    new LocalDocumentStorage(storageRoot),
    () => new Date("2033-06-01T12:00:00.000Z"),
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
    await database.user.deleteMany({ where: { externalId } });
    await database.$disconnect();
    await rm(storageRoot, { recursive: true, force: true });
  });

  const login = await fetch(`${base}/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";", 1)[0] ?? "";

  /** Bewusst umfangreich: Der Lauf dauert lange genug für eine echte Überlappung. */
  const largeDocx = buildDocx({
    paragraphs: Array.from({ length: 120_000 }, (_, index) => ({
      text: `Absatz ${index + 1} im umfangreichen Haupttext der parallelen Prüfung.`,
    })),
  });

  const startedAt = performance.now();
  let uploadSettled = false;
  const pendingUpload = fetch(`${base}/documents?fileName=umfangreich.docx`, {
    method: "POST",
    headers: { cookie, "content-type": DOCX_MIME_TYPE },
    body: new Uint8Array(largeDocx),
  }).then((response) => {
    uploadSettled = true;
    return response;
  });

  /**
   * Erst wenn der Worker tatsächlich läuft, ist die folgende Anfrage ein
   * echter Beleg für einen freien Event-Loop.
   */
  assert.ok(
    await waitUntil(() => ooxmlExtractorThreadsInUse() > 0, 10_000),
    "Die Verarbeitung muss während der parallelen Anfrage laufen.",
  );

  const listing = await fetch(`${base}/knowledge?includeArchived=true`, {
    headers: { cookie },
  });
  const listingMs = performance.now() - startedAt;
  assert.equal(listing.status, 200);
  assert.equal(
    uploadSettled,
    false,
    "Die parallele Anfrage muss vor dem Ergebnis des Uploads beantwortet werden.",
  );

  const uploadResponse = await pendingUpload;
  const uploadMs = performance.now() - startedAt;
  assert.equal(uploadResponse.status, 201);
  const document = (await uploadResponse.json()) as DocumentResponse;
  assert.equal(document.extraction.status, "available");
  assert.equal(document.extraction.locatorKind, "paragraph");
  assert.equal(document.extraction.pageCount, null);
  assert.equal(document.extraction.locatorCount, 120_000);
  assert.equal(document.extraction.truncated, true);
  assert.ok(
    uploadMs > listingMs,
    "Die Verarbeitung muss länger dauern als die parallele Anfrage.",
  );
  /** Nach dem Lauf ist kein Worker-Thread dieses Prozesses übrig. */
  assert.equal(ooxmlExtractorThreadsInUse(), 0);
});
