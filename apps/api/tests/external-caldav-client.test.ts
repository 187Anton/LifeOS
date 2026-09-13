import assert from "node:assert/strict";
import type { lookup } from "node:dns/promises";
import { EventEmitter } from "node:events";
import type { request as httpsRequest } from "node:https";
import { PassThrough } from "node:stream";
import test from "node:test";

import {
  ExternalCalDavNetworkError,
  externalCalDavTimeRange,
  HttpExternalCalDavClient,
  isBlockedExternalCalDavAddress,
  validateExternalCalDavUrl,
} from "../src/modules/external-caldav/client.js";

interface SyntheticResponse {
  status: number;
  headers?: Record<string, string>;
  chunks?: Buffer[];
  timeout?: boolean;
}

const syntheticRequests = (...responses: SyntheticResponse[]) => {
  const bodies: string[] = [];
  const urls: string[] = [];
  let index = 0;
  const requestImpl = ((
    target: URL,
    _options: unknown,
    callback: (
      response: PassThrough & {
        statusCode: number;
        headers: Record<string, string>;
      },
    ) => void,
  ) => {
    const response = responses[index++] ?? responses.at(-1)!;
    const request = new EventEmitter() as EventEmitter & {
      setTimeout: (timeout: number, listener: () => void) => typeof request;
      destroy: (error: Error) => typeof request;
      end: (body: string) => void;
    };
    let destroyed = false;
    urls.push(String(target));
    request.setTimeout = (_timeout, listener) => {
      if (response.timeout) setTimeout(listener, 0);
      return request;
    };
    request.destroy = (error) => {
      if (!destroyed) {
        destroyed = true;
        request.emit("error", error);
      }
      return request;
    };
    request.end = (body) => {
      bodies.push(body);
      if (response.timeout) return;
      queueMicrotask(() => {
        const stream = new PassThrough() as PassThrough & {
          statusCode: number;
          headers: Record<string, string>;
        };
        stream.statusCode = response.status;
        stream.headers = response.headers ?? {};
        callback(stream);
        for (const chunk of response.chunks ?? []) stream.write(chunk);
        stream.end();
      });
    };
    return request;
  }) as unknown as typeof httpsRequest;
  return { requestImpl, bodies, urls };
};

const publicLookup = (async () => [
  { address: "93.184.216.34", family: 4 },
]) as unknown as typeof lookup;

test("weist lokale, reservierte und IPv4-übersetzende CalDAV-Ziele zurück", () => {
  for (const address of [
    "127.0.0.1",
    "169.254.169.254",
    "192.168.1.20",
    "198.18.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "64:ff9b::7f00:1",
    "2002:7f00:1::",
    "fe80::1",
  ]) {
    assert.equal(isBlockedExternalCalDavAddress(address), true, address);
  }
  assert.equal(isBlockedExternalCalDavAddress("93.184.216.34"), false);
  assert.equal(isBlockedExternalCalDavAddress("2606:2800:220:1::1"), false);
});

test("akzeptiert ausschließlich HTTPS-Ziele ohne Zugangsdaten oder lokale Namen", () => {
  assert.equal(
    validateExternalCalDavUrl("https://calendar.example.test/dav/").origin,
    "https://calendar.example.test",
  );
  for (const target of [
    "http://calendar.example.test/dav/",
    "https://name:password@calendar.example.test/dav/",
    "https://localhost/dav/",
    "https://service.local/dav/",
    "https://127.0.0.1/dav/",
    "https://[64:ff9b::7f00:1]/dav/",
  ]) {
    assert.throws(
      () => validateExternalCalDavUrl(target),
      (error: unknown) => error instanceof ExternalCalDavNetworkError,
      target,
    );
  }
});

test("begrenzt CalDAV-Ereignisse auf ein festes Importzeitfenster", async () => {
  const now = new Date("2034-03-01T10:00:00.000Z");
  assert.deepEqual(externalCalDavTimeRange(now), {
    start: "20330301T100000Z",
    end: "20360229T100000Z",
  });
  const network = syntheticRequests({
    status: 207,
    chunks: [
      Buffer.from(
        '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"></d:multistatus>',
      ),
    ],
  });
  const client = new HttpExternalCalDavClient(
    () => now,
    publicLookup,
    network.requestImpl,
  );

  await client.listEvents(
    "https://calendar.example.test/dav/",
    "/dav/personal/",
    { username: "synthetic", password: "synthetic" },
  );

  assert.match(network.bodies[0] ?? "", /start="20330301T100000Z"/);
  assert.match(network.bodies[0] ?? "", /end="20360229T100000Z"/);
});

test("stoppt gleichursprüngliche Redirect-Ketten und DNS-Rebinding", async () => {
  const redirects = syntheticRequests(
    { status: 302, headers: { location: "/dav/one" } },
    { status: 302, headers: { location: "/dav/two" } },
    { status: 302, headers: { location: "/dav/three" } },
  );
  const client = new HttpExternalCalDavClient(
    undefined,
    publicLookup,
    redirects.requestImpl,
  );
  await assert.rejects(
    client.listCalendars("https://calendar.example.test/dav/", {
      username: "synthetic",
      password: "synthetic",
    }),
    (error: unknown) =>
      error instanceof ExternalCalDavNetworkError &&
      error.code === "TOO_MANY_REDIRECTS",
  );
  assert.equal(redirects.urls.length, 3);

  let lookups = 0;
  const rebindingLookup = (async () => {
    lookups += 1;
    return [
      {
        address: lookups === 1 ? "93.184.216.34" : "127.0.0.1",
        family: 4,
      },
    ];
  }) as unknown as typeof lookup;
  const rebinding = syntheticRequests({
    status: 302,
    headers: { location: "/dav/rebound" },
  });
  const reboundClient = new HttpExternalCalDavClient(
    undefined,
    rebindingLookup,
    rebinding.requestImpl,
  );
  await assert.rejects(
    reboundClient.listCalendars("https://calendar.example.test/dav/", {
      username: "synthetic",
      password: "synthetic",
    }),
    (error: unknown) =>
      error instanceof ExternalCalDavNetworkError &&
      error.code === "ADDRESS_NOT_ALLOWED",
  );
  assert.equal(rebinding.urls.length, 1);
});

test("begrenzt CalDAV-Antwortgröße und Laufzeit", async () => {
  const oversized = syntheticRequests({
    status: 207,
    headers: { "content-length": String(2 * 1024 * 1024 + 1) },
  });
  await assert.rejects(
    new HttpExternalCalDavClient(
      undefined,
      publicLookup,
      oversized.requestImpl,
    ).listCalendars("https://calendar.example.test/dav/", {
      username: "synthetic",
      password: "synthetic",
    }),
    (error: unknown) =>
      error instanceof ExternalCalDavNetworkError &&
      error.code === "RESPONSE_TOO_LARGE",
  );

  const timeout = syntheticRequests({ status: 207, timeout: true });
  await assert.rejects(
    new HttpExternalCalDavClient(
      undefined,
      publicLookup,
      timeout.requestImpl,
      5,
    ).listCalendars("https://calendar.example.test/dav/", {
      username: "synthetic",
      password: "synthetic",
    }),
    (error: unknown) =>
      error instanceof ExternalCalDavNetworkError && error.code === "TIMEOUT",
  );
});

test("weist zu viele CalDAV-Ressourcen und fremde Redirect-Ursprünge ab", async () => {
  const entries = Array.from(
    { length: 101 },
    (_, index) =>
      `<d:response><d:href>/dav/${index}/</d:href><d:propstat><d:status>HTTP/1.1 200 OK</d:status><d:prop><d:displayname>Kalender ${index}</d:displayname><d:resourcetype><c:calendar/></d:resourcetype></d:prop></d:propstat></d:response>`,
  ).join("");
  const tooMany = syntheticRequests({
    status: 207,
    chunks: [
      Buffer.from(
        `<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">${entries}</d:multistatus>`,
      ),
    ],
  });
  await assert.rejects(
    new HttpExternalCalDavClient(
      undefined,
      publicLookup,
      tooMany.requestImpl,
    ).listCalendars("https://calendar.example.test/dav/", {
      username: "synthetic",
      password: "synthetic",
    }),
    (error: unknown) =>
      error instanceof ExternalCalDavNetworkError &&
      error.code === "TOO_MANY_RESOURCES",
  );

  const crossOrigin = syntheticRequests({
    status: 302,
    headers: { location: "https://other.example.test/dav/" },
  });
  await assert.rejects(
    new HttpExternalCalDavClient(
      undefined,
      publicLookup,
      crossOrigin.requestImpl,
    ).listCalendars("https://calendar.example.test/dav/", {
      username: "synthetic",
      password: "synthetic",
    }),
    (error: unknown) =>
      error instanceof ExternalCalDavNetworkError &&
      error.code === "CROSS_ORIGIN_REDIRECT",
  );
});
