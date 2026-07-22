import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createDatabaseClient } from "@lifeos/database";
import { config as loadEnvironment } from "dotenv";

import { createApplication } from "../src/application.js";
import type { Logger } from "../src/logger.js";
import { CalDavAuthenticationService } from "../src/modules/caldav/authentication.js";
import { PrismaCalDavRepository } from "../src/modules/caldav/repository.js";
import { createCalDavRouter } from "../src/modules/caldav/router.js";
import { PrismaCalendarRepository } from "../src/modules/calendar/repository.js";
import { CalendarService } from "../src/modules/calendar/service.js";
import { hashPassword } from "../src/modules/profile/security.js";

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

const reportBody = (root: string, content: string): string =>
  `<?xml version="1.0" encoding="utf-8"?><${root} xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop>${content}</${root}>`;

test("unterstützt Discovery, Ereignis-CRUD, Reports, Sync und Widerruf", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalId = `caldav-owner-${suffix}`;
  const calendarId = `study-${suffix}`;
  const password = `synthetisches-caldav-passwort-${suffix}`;
  const username = "synthetic-local";
  const user = await database.user.create({
    data: {
      externalId,
      displayName: "Synthetische CalDAV-Person",
      settings: { create: { timezone: "Europe/Berlin" } },
      calDavCredential: {
        create: { username, passwordHash: await hashPassword(password) },
      },
      calendars: {
        create: {
          externalId: calendarId,
          name: "Studium",
          timezone: "Europe/Berlin",
          isPrimary: true,
        },
      },
    },
  });
  const repository = new PrismaCalDavRepository(database, externalId);
  const calendars = new CalendarService(new PrismaCalendarRepository(database));
  const application = createApplication({
    logger: new SilentLogger(),
    readinessProbe: { check: async () => undefined },
    webOrigin: "http://127.0.0.1:5173",
    rootRouters: [
      createCalDavRouter({
        authentication: new CalDavAuthenticationService(repository),
        repository,
        calendars,
      }),
    ],
  });
  const server = createServer(application);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  const calendarUrl = `${baseUrl}/caldav/calendars/local/${calendarId}/`;
  const uid = `lecture-${suffix}@lifeos.local`;
  const eventUrl = `${calendarUrl}${encodeURIComponent(uid)}.ics`;
  t.after(async () => {
    await close(server);
    await database.user.delete({ where: { id: user.id } });
    await database.$disconnect();
  });

  const redirect = await fetch(`${baseUrl}/.well-known/caldav`, {
    redirect: "manual",
  });
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.get("location"), "/caldav/");

  const unauthorized = await fetch(`${baseUrl}/caldav/`, {
    method: "PROPFIND",
  });
  assert.equal(unauthorized.status, 401);
  assert.match(unauthorized.headers.get("www-authenticate") ?? "", /Basic/);

  const principal = await fetch(`${baseUrl}/caldav/principals/local/`, {
    method: "PROPFIND",
    headers: { authorization, depth: "0", "content-type": "application/xml" },
    body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/><d:principal-URL/></d:prop></d:propfind>`,
  });
  assert.equal(principal.status, 207);
  assert.match(await principal.text(), /\/caldav\/calendars\/local\//);

  const home = await fetch(`${baseUrl}/caldav/calendars/local/`, {
    method: "PROPFIND",
    headers: { authorization, depth: "1", "content-type": "application/xml" },
    body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:resourcetype/></d:prop></d:propfind>`,
  });
  assert.equal(home.status, 207);
  assert.match(await home.text(), new RegExp(calendarId));

  const options = await fetch(calendarUrl, {
    method: "OPTIONS",
    headers: { authorization },
  });
  assert.equal(options.status, 204);
  assert.match(options.headers.get("dav") ?? "", /calendar-access/);

  const createdCalendarId = `projects-${suffix}`;
  const createdCalendarUrl = `${baseUrl}/caldav/calendars/local/${createdCalendarId}/`;
  const createdCalendar = await fetch(createdCalendarUrl, {
    method: "MKCALENDAR",
    headers: { authorization, "content-type": "application/xml" },
    body: `<?xml version="1.0"?><c:mkcalendar xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:set><d:prop><d:displayname>Projekte</d:displayname></d:prop></d:set></c:mkcalendar>`,
  });
  assert.equal(createdCalendar.status, 201);
  assert.equal(
    (
      await fetch(createdCalendarUrl, {
        method: "PROPFIND",
        headers: { authorization, depth: "0" },
      })
    ).status,
    207,
  );
  assert.equal(
    (
      await fetch(createdCalendarUrl, {
        method: "DELETE",
        headers: { authorization },
      })
    ).status,
    204,
  );

  const timedIcs = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "X-WR-TIMEZONE:Europe/Berlin",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    "SUMMARY:Synthetische Vorlesung",
    "DESCRIPTION:CalDAV-Integrationstest",
    "LOCATION:Raum 1",
    "DTSTART;TZID=Europe/Berlin:20320310T090000",
    "DTEND;TZID=Europe/Berlin:20320310T103000",
    "RRULE:FREQ=WEEKLY;COUNT=4",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:-PT10M",
    "DESCRIPTION:Erinnerung",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
  const created = await fetch(eventUrl, {
    method: "PUT",
    headers: {
      authorization,
      "if-none-match": "*",
      "content-type": "text/calendar",
    },
    body: timedIcs,
  });
  assert.equal(created.status, 201);
  const firstEtag = created.headers.get("etag") ?? "";
  assert.match(firstEtag, /^"[0-9a-f-]+"$/);

  const fetched = await fetch(eventUrl, { headers: { authorization } });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.headers.get("etag"), firstEtag);
  const fetchedIcs = await fetched.text();
  assert.match(fetchedIcs, /DTSTART;TZID=Europe\/Berlin:20320310T090000/);
  assert.match(fetchedIcs, /RRULE:FREQ=WEEKLY;COUNT=4/);
  assert.match(fetchedIcs, /TRIGGER:-PT10M/);

  const query = await fetch(calendarUrl, {
    method: "REPORT",
    headers: { authorization, depth: "1", "content-type": "application/xml" },
    body: reportBody(
      "c:calendar-query",
      `<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="20320301T000000Z" end="20320401T000000Z"/></c:comp-filter></c:comp-filter></c:filter>`,
    ),
  });
  assert.equal(query.status, 207);
  assert.match(await query.text(), new RegExp(encodeURIComponent(uid)));

  const multiget = await fetch(calendarUrl, {
    method: "REPORT",
    headers: { authorization, depth: "1", "content-type": "application/xml" },
    body: reportBody(
      "c:calendar-multiget",
      `<d:href>/caldav/calendars/local/${calendarId}/${encodeURIComponent(uid)}.ics</d:href>`,
    ),
  });
  assert.equal(multiget.status, 207);
  assert.match(await multiget.text(), /Synthetische Vorlesung/);

  const initialSync = await fetch(calendarUrl, {
    method: "REPORT",
    headers: { authorization, depth: "1", "content-type": "application/xml" },
    body: reportBody("d:sync-collection", `<d:sync-level>1</d:sync-level>`),
  });
  const initialSyncBody = await initialSync.text();
  assert.equal(initialSync.status, 207);
  const firstToken = /<d:sync-token>([^<]+)<\/d:sync-token>/.exec(
    initialSyncBody,
  )?.[1];
  assert.ok(firstToken);

  const updatedIcs = timedIcs.replace(
    "Synthetische Vorlesung",
    "Aktualisierte Vorlesung",
  );
  const updated = await fetch(eventUrl, {
    method: "PUT",
    headers: {
      authorization,
      "if-match": firstEtag,
      "content-type": "text/calendar",
    },
    body: updatedIcs,
  });
  assert.equal(updated.status, 204);
  const secondEtag = updated.headers.get("etag") ?? "";

  const stale = await fetch(eventUrl, {
    method: "DELETE",
    headers: { authorization, "if-match": firstEtag },
  });
  assert.equal(stale.status, 412);

  const incrementalSync = await fetch(calendarUrl, {
    method: "REPORT",
    headers: { authorization, depth: "1", "content-type": "application/xml" },
    body: reportBody(
      "d:sync-collection",
      `<d:sync-token>${firstToken}</d:sync-token><d:sync-level>1</d:sync-level>`,
    ),
  });
  const incrementalBody = await incrementalSync.text();
  assert.equal(incrementalSync.status, 207);
  assert.match(incrementalBody, /Aktualisierte Vorlesung/);
  const secondToken = /<d:sync-token>([^<]+)<\/d:sync-token>/.exec(
    incrementalBody,
  )?.[1];
  assert.ok(secondToken && secondToken !== firstToken);

  const deleted = await fetch(eventUrl, {
    method: "DELETE",
    headers: { authorization, "if-match": secondEtag },
  });
  assert.equal(deleted.status, 204);
  const deletionSync = await fetch(calendarUrl, {
    method: "REPORT",
    headers: { authorization, depth: "1", "content-type": "application/xml" },
    body: reportBody(
      "d:sync-collection",
      `<d:sync-token>${secondToken}</d:sync-token><d:sync-level>1</d:sync-level>`,
    ),
  });
  const deletionBody = await deletionSync.text();
  assert.equal(deletionSync.status, 207);
  assert.match(deletionBody, /HTTP\/1.1 404 Not Found/);

  const allDayUid = `all-day-${suffix}@lifeos.local`;
  const allDayUrl = `${calendarUrl}${encodeURIComponent(allDayUid)}.ics`;
  const allDayCreated = await fetch(allDayUrl, {
    method: "PUT",
    headers: { authorization, "content-type": "text/calendar" },
    body: [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "X-WR-TIMEZONE:Europe/Berlin",
      "BEGIN:VEVENT",
      `UID:${allDayUid}`,
      "SUMMARY:Synthetischer Prüfungstag",
      "DTSTART;VALUE=DATE:20320402",
      "DTEND;VALUE=DATE:20320403",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n"),
  });
  assert.equal(allDayCreated.status, 201);
  assert.match(
    await (await fetch(allDayUrl, { headers: { authorization } })).text(),
    /DTSTART;VALUE=DATE:20320402/,
  );

  await database.calDavCredential.update({
    where: { userId: user.id },
    data: { revokedAt: new Date(), revision: { increment: 1 } },
  });
  assert.equal(
    (
      await fetch(`${baseUrl}/caldav/`, {
        method: "PROPFIND",
        headers: { authorization },
      })
    ).status,
    401,
  );
});
