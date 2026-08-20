import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createDatabaseClient } from "@lifeos/database";
import type {
  ExternalCalDavConnectionResponse,
  ExternalCalDavImportPreviewResponse,
  ExternalCalDavOverviewResponse,
} from "@lifeos/contracts";
import { config as loadEnvironment } from "dotenv";

import { createApplication } from "../src/application.js";
import type { Logger } from "../src/logger.js";
import { PrismaCalendarRepository } from "../src/modules/calendar/repository.js";
import { CalendarService } from "../src/modules/calendar/service.js";
import type {
  ExternalCalDavClient,
  RemoteCalDavCalendar,
  RemoteCalDavEvent,
} from "../src/modules/external-caldav/client.js";
import { ExternalCalDavNetworkError } from "../src/modules/external-caldav/client.js";
import { PrismaExternalCalDavRepository } from "../src/modules/external-caldav/repository.js";
import { createExternalCalDavRouter } from "../src/modules/external-caldav/router.js";
import { ExternalCalDavService } from "../src/modules/external-caldav/service.js";
import type { ExternalCredentials } from "../src/modules/external-caldav/secrets.js";
import { IcsImportService } from "../src/modules/ics/service.js";
import { PrismaProfileRepository } from "../src/modules/profile/repository.js";
import { createProfileRouter } from "../src/modules/profile/router.js";
import { hashPassword } from "../src/modules/profile/security.js";
import {
  AuthenticationService,
  ProfileService,
} from "../src/modules/profile/service.js";

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
class SyntheticCalDavClient implements ExternalCalDavClient {
  credentials: ExternalCredentials[] = [];
  failure: ExternalCalDavNetworkError | null = null;
  calendars: RemoteCalDavCalendar[] = [
    {
      href: "/remote/calendars/personal/",
      displayName: "Synthetischer externer Kalender",
      etag: '"calendar-etag"',
    },
  ];
  events: RemoteCalDavEvent[] = [
    {
      href: "/remote/calendars/personal/event-1.ics",
      etag: '"remote-event-etag"',
      ics: [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Synthetic//CalDAV//DE",
        "BEGIN:VEVENT",
        "UID:external-event-1@example.test",
        "DTSTAMP:20340101T000000Z",
        "SUMMARY:Synthetischer externer Termin",
        "DTSTART:20340320T080000Z",
        "DTEND:20340320T090000Z",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "TRIGGER:-PT10M",
        "DESCRIPTION:Erinnerung",
        "END:VALARM",
        "END:VEVENT",
        "END:VCALENDAR",
        "",
      ].join("\r\n"),
    },
  ];
  async listCalendars(_baseUrl: string, credentials: ExternalCredentials) {
    this.credentials.push(credentials);
    if (this.failure) throw this.failure;
    return this.calendars;
  }
  async listEvents(
    _baseUrl: string,
    _calendarHref: string,
    credentials: ExternalCredentials,
  ) {
    this.credentials.push(credentials);
    if (this.failure) throw this.failure;
    return this.events;
  }
}
const close = (server: Server) =>
  new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );

test("konfiguriert externe CalDAV-Importe verschlüsselt, deaktiviert und read-only", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalId = `external-caldav-owner-${suffix}`;
  const otherExternalId = `external-caldav-other-${suffix}`;
  const password = `synthetisches-app-passwort-${suffix}`;
  const remotePassword = `synthetisches-remote-passwort-${suffix}`;
  const remoteUsername = `synthetischer-remote-nutzer-${suffix}`;
  const owner = await database.user.create({
    data: {
      externalId,
      displayName: "Synthetische CalDAV-Person",
      settings: { create: { timezone: "Europe/Berlin" } },
      credential: { create: { passwordHash: await hashPassword(password) } },
    },
  });
  const other = await database.user.create({
    data: {
      externalId: otherExternalId,
      displayName: "Andere CalDAV-Person",
      settings: { create: {} },
    },
  });
  const localCalendar = await database.calendar.create({
    data: {
      userId: owner.id,
      externalId: `external-import-target-${suffix}`,
      name: "Lokaler Importkalender",
      timezone: "Europe/Berlin",
      isPrimary: true,
    },
  });
  const profileRepository = new PrismaProfileRepository(database, externalId);
  const authentication = new AuthenticationService(profileRepository, 1);
  const calendars = new CalendarService(new PrismaCalendarRepository(database));
  const ics = new IcsImportService(calendars);
  const client = new SyntheticCalDavClient();
  const repository = new PrismaExternalCalDavRepository(database);
  const service = new ExternalCalDavService(
    repository,
    client,
    ics,
    Buffer.alloc(32, 8).toString("base64"),
  );
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
      createExternalCalDavRouter({ authentication, externalCalDav: service }),
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

  assert.equal((await fetch(`${base}/integrations/caldav`)).status, 401);
  const login = await fetch(`${base}/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";", 1)[0] ?? "";
  const headers = { cookie, "content-type": "application/json" };

  const overviewResponse = await fetch(`${base}/integrations/caldav`, {
    headers: { cookie },
  });
  assert.equal(
    overviewResponse.headers.get("cache-control"),
    "private, no-store",
  );
  const overview =
    (await overviewResponse.json()) as ExternalCalDavOverviewResponse;
  assert.deepEqual(overview, {
    available: true,
    networkDefault: "disabled",
    mode: "read_only_import",
    connections: [],
  });
  for (const blockedUrl of [
    "http://calendar.example.test/",
    "https://127.0.0.1/caldav/",
    "https://169.254.169.254/latest/meta-data/",
    "https://user:password@calendar.example.test/",
  ]) {
    const blocked = await fetch(`${base}/integrations/caldav`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: `Blockiert ${blockedUrl}`,
        baseUrl: blockedUrl,
        username: remoteUsername,
        password: remotePassword,
      }),
    });
    assert.equal(blocked.status, 400);
  }
  const oversizedCredential = await fetch(`${base}/integrations/caldav`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "Zu groß",
      baseUrl: "https://calendar.example.test/oversized/",
      username: remoteUsername,
      password: "x".repeat(1025),
    }),
  });
  assert.equal(oversizedCredential.status, 400);
  assert.equal(
    (
      await fetch(`${base}/integrations/caldav/${randomUUID()}/calendars`, {
        headers: { cookie },
      })
    ).status,
    404,
  );

  const createdResponse = await fetch(`${base}/integrations/caldav`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "Synthetischer CalDAV-Dienst",
      baseUrl: "https://calendar.example.test/caldav",
      username: remoteUsername,
      password: remotePassword,
    }),
  });
  assert.equal(createdResponse.status, 201);
  const created =
    (await createdResponse.json()) as ExternalCalDavConnectionResponse;
  assert.equal(created.enabled, false);
  assert.equal(created.readOnly, true);
  assert.equal(created.status, "disabled");
  assert.equal(created.credentialsConfigured, true);
  assert.equal("username" in created, false);
  const stored = await database.externalCalDavConnection.findUniqueOrThrow({
    where: { id: created.id },
  });
  assert.doesNotMatch(stored.credentialsEncrypted, new RegExp(remoteUsername));
  assert.doesNotMatch(stored.credentialsEncrypted, new RegExp(remotePassword));
  assert.equal(
    (
      await fetch(`${base}/integrations/caldav/${created.id}/test`, {
        method: "POST",
        headers,
      })
    ).status,
    409,
  );
  assert.equal(client.credentials.length, 0);

  const enabled = await fetch(`${base}/integrations/caldav/${created.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(enabled.status, 200);
  const tested = await fetch(`${base}/integrations/caldav/${created.id}/test`, {
    method: "POST",
    headers,
  });
  assert.deepEqual(await tested.json(), { reachable: true, calendarCount: 1 });
  assert.deepEqual(client.credentials.at(-1), {
    username: remoteUsername,
    password: remotePassword,
  });

  client.failure = new ExternalCalDavNetworkError("TIMEOUT");
  const failed = await fetch(`${base}/integrations/caldav/${created.id}/test`, {
    method: "POST",
    headers,
  });
  assert.equal(failed.status, 502);
  assert.doesNotMatch(await failed.text(), new RegExp(remotePassword));
  client.failure = new ExternalCalDavNetworkError("AUTHORIZATION_FAILED");
  const denied = await fetch(`${base}/integrations/caldav/${created.id}/test`, {
    method: "POST",
    headers,
  });
  assert.equal(denied.status, 502);
  assert.doesNotMatch(await denied.text(), new RegExp(remotePassword));
  client.failure = null;

  const remoteCalendars = (await (
    await fetch(`${base}/integrations/caldav/${created.id}/calendars`, {
      headers: { cookie },
    })
  ).json()) as Array<{ id: string; displayName: string }>;
  assert.equal(remoteCalendars.length, 1);
  assert.equal(
    remoteCalendars[0]?.displayName,
    "Synthetischer externer Kalender",
  );

  const validRemoteEvents = client.events;
  client.events = [
    {
      href: "/remote/calendars/personal/invalid.ics",
      etag: '"invalid-etag"',
      ics: "Dieser fremde Inhalt ist kein iCalendar-Dokument.",
    },
  ];
  const invalidRemoteEvent = await fetch(
    `${base}/integrations/caldav/${created.id}/imports/preview`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        externalCalendarId: remoteCalendars[0]!.id,
        localCalendarId: localCalendar.externalId,
      }),
    },
  );
  assert.equal(invalidRemoteEvent.status, 400);
  assert.match(await invalidRemoteEvent.text(), /gültige VEVENT-Ressource/);
  client.events = validRemoteEvents;

  const previewResponse = await fetch(
    `${base}/integrations/caldav/${created.id}/imports/preview`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        externalCalendarId: remoteCalendars[0]!.id,
        localCalendarId: localCalendar.externalId,
      }),
    },
  );
  assert.equal(previewResponse.status, 200);
  const preview =
    (await previewResponse.json()) as ExternalCalDavImportPreviewResponse;
  assert.equal(preview.preview.canCommit, true);
  assert.equal(preview.preview.creatableEvents, 1);
  const commit = await fetch(
    `${base}/integrations/caldav/${created.id}/imports/commit`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ externalImportId: preview.externalImportId }),
    },
  );
  assert.equal(commit.status, 200);
  assert.deepEqual(await commit.json(), {
    createdEvents: 1,
    unchangedEvents: 0,
    createdUids: ["external-event-1@example.test"],
    mappedEvents: 1,
  });
  const imported = await database.calendarEvent.findUniqueOrThrow({
    where: {
      calendarId_uid: {
        calendarId: localCalendar.id,
        uid: "external-event-1@example.test",
      },
    },
  });
  assert.equal(imported.title, "Synthetischer externer Termin");
  assert.equal(imported.reminderMinutes[0], 10);
  const mapping = await database.externalCalDavEventMapping.findFirstOrThrow({
    where: { connectionId: created.id, userId: owner.id },
  });
  assert.equal(mapping.remoteEtag, '"remote-event-etag"');
  assert.equal(mapping.localEventUid, imported.uid);

  await assert.rejects(
    service
      .overview(other.id)
      .then(async () => service.test(other.id, created.id)),
  );
  const audit = JSON.stringify(
    await database.auditEvent.findMany({ where: { userId: owner.id } }),
  );
  assert.doesNotMatch(audit, new RegExp(remoteUsername));
  assert.doesNotMatch(audit, new RegExp(remotePassword));

  await database.externalCalDavConnection.createMany({
    data: Array.from({ length: 19 }, (_, index) => ({
      id: randomUUID(),
      userId: owner.id,
      name: `Synthetische Verbindung ${String(index + 1).padStart(2, "0")}`,
      baseUrl: `https://calendar-${index + 1}.example.test/caldav/`,
      credentialsEncrypted: "synthetic-encrypted-payload",
      secretIv: "synthetic-iv",
      secretTag: "synthetic-tag",
    })),
  });
  const overLimit = await fetch(`${base}/integrations/caldav`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "Eine Verbindung zu viel",
      baseUrl: "https://calendar-limit.example.test/caldav/",
      username: remoteUsername,
      password: remotePassword,
    }),
  });
  assert.equal(overLimit.status, 422);

  const revoked = await fetch(`${base}/integrations/caldav/${created.id}`, {
    method: "DELETE",
    headers,
  });
  assert.equal(revoked.status, 204);
  assert.equal(
    await database.externalCalDavConnection.count({
      where: { id: created.id },
    }),
    0,
  );
  assert.equal(
    (
      await fetch(`${base}/integrations/caldav/${created.id}/test`, {
        method: "POST",
        headers,
      })
    ).status,
    404,
  );
});

test("bleibt ohne lokalen Integrationsschlüssel vollständig deaktiviert", async () => {
  const database = createDatabaseClient();
  const service = new ExternalCalDavService(
    new PrismaExternalCalDavRepository(database),
    new SyntheticCalDavClient(),
    new IcsImportService(
      new CalendarService(new PrismaCalendarRepository(database)),
    ),
    undefined,
  );
  const overview = await service.overview(randomUUID());
  assert.equal(overview.available, false);
  await assert.rejects(
    service.create(randomUUID(), {
      name: "Nicht verfügbar",
      baseUrl: "https://calendar.example.test/",
      username: "synthetisch",
      password: "synthetisch",
    }),
    (error: unknown) =>
      error instanceof Error && /nicht konfiguriert/.test(error.message),
  );
  await database.$disconnect();
});
