import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";

import { XMLParser } from "fast-xml-parser";

import type { ExternalCredentials } from "./secrets.js";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 2;
const REQUEST_TIMEOUT_MS = 5_000;

export interface RemoteCalDavCalendar {
  href: string;
  displayName: string;
  etag: string | null;
}
export interface RemoteCalDavEvent {
  href: string;
  etag: string | null;
  ics: string;
}
export interface ExternalCalDavClient {
  listCalendars(
    baseUrl: string,
    credentials: ExternalCredentials,
  ): Promise<RemoteCalDavCalendar[]>;
  listEvents(
    baseUrl: string,
    calendarHref: string,
    credentials: ExternalCredentials,
  ): Promise<RemoteCalDavEvent[]>;
}

export class ExternalCalDavNetworkError extends Error {
  constructor(readonly code: string) {
    super(
      "Die externe CalDAV-Verbindung konnte nicht sicher verarbeitet werden.",
    );
  }
}

const blockedIpv4 = (address: string) => {
  const values = address.split(".").map(Number);
  const [first, second] = values;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second! >= 16 && second! <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second! >= 64 && second! <= 127) ||
    first! >= 224
  );
};
const blockedIpv6 = (address: string) => {
  const normalized = address.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("::ffff:")
  );
};
const blockedAddress = (address: string) =>
  isIP(address) === 4 ? blockedIpv4(address) : blockedIpv6(address);

export const validateExternalCalDavUrl = (value: string): URL => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ExternalCalDavNetworkError("INVALID_URL");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    value.length > 2048 ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "169.254.169.254" ||
    (isIP(hostname) > 0 && blockedAddress(hostname))
  )
    throw new ExternalCalDavNetworkError("URL_NOT_ALLOWED");
  return url;
};

const resolveAllowedAddress = async (url: URL) => {
  let addresses: Array<{ address: string; family: number }>;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    addresses = await Promise.race([
      lookup(url.hostname, { all: true, verbatim: true }),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new ExternalCalDavNetworkError("TIMEOUT")),
          REQUEST_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (error) {
    if (error instanceof ExternalCalDavNetworkError) throw error;
    throw new ExternalCalDavNetworkError("DNS_FAILED");
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => blockedAddress(address))
  )
    throw new ExternalCalDavNetworkError("ADDRESS_NOT_ALLOWED");
  return addresses[0]!;
};

interface ExternalRequestInit {
  method: "PROPFIND" | "REPORT";
  headers: Record<string, string>;
  body: string;
}

const text = (value: unknown): string =>
  typeof value === "string"
    ? value
    : typeof value === "number"
      ? String(value)
      : "";
const values = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const parsedResponses = (
  source: string,
  maximum: number,
): Array<Record<string, unknown>> => {
  if (/<!DOCTYPE|<!ENTITY/i.test(source))
    throw new ExternalCalDavNetworkError("UNSAFE_XML");
  let document: unknown;
  try {
    document = new XMLParser({
      removeNSPrefix: true,
      ignoreAttributes: false,
      processEntities: false,
    }).parse(source);
  } catch {
    throw new ExternalCalDavNetworkError("INVALID_XML");
  }
  const root = document as { multistatus?: { response?: unknown } };
  const responses = values(root.multistatus?.response).filter(
    (entry): entry is Record<string, unknown> =>
      Boolean(entry && typeof entry === "object"),
  );
  if (responses.length > maximum)
    throw new ExternalCalDavNetworkError("TOO_MANY_RESOURCES");
  return responses;
};
const property = (
  response: Record<string, unknown>,
): Record<string, unknown> => {
  const propstat = values(
    response.propstat as Record<string, unknown> | Record<string, unknown>[],
  );
  const success =
    propstat.find((entry) => text(entry.status).includes(" 200 ")) ??
    propstat[0];
  const prop = success?.prop;
  return prop && typeof prop === "object"
    ? (prop as Record<string, unknown>)
    : {};
};

export class HttpExternalCalDavClient implements ExternalCalDavClient {
  async listCalendars(baseUrl: string, credentials: ExternalCredentials) {
    const response = await this.request(baseUrl, credentials, {
      method: "PROPFIND",
      headers: { Depth: "1", "content-type": "application/xml; charset=utf-8" },
      body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:resourcetype/><d:getetag/></d:prop></d:propfind>',
    });
    const base = validateExternalCalDavUrl(baseUrl);
    return parsedResponses(response, 100)
      .map((entry) => {
        const prop = property(entry);
        const resourceType = prop.resourcetype as
          Record<string, unknown> | undefined;
        const href = this.safeHref(text(entry.href), base);
        return {
          isCalendar: Boolean(resourceType?.calendar !== undefined),
          href,
          displayName: (text(prop.displayname) || "Externer Kalender").slice(
            0,
            200,
          ),
          etag: text(prop.getetag).slice(0, 255) || null,
        };
      })
      .filter(({ isCalendar, href }) => isCalendar && href)
      .map(({ href, displayName, etag }) => ({ href, displayName, etag }));
  }

  async listEvents(
    baseUrl: string,
    calendarHref: string,
    credentials: ExternalCredentials,
  ) {
    const base = validateExternalCalDavUrl(baseUrl);
    const calendarUrl = new URL(calendarHref, base);
    if (calendarUrl.origin !== base.origin)
      throw new ExternalCalDavNetworkError("CROSS_ORIGIN_HREF");
    const response = await this.request(calendarUrl.toString(), credentials, {
      method: "REPORT",
      headers: { Depth: "1", "content-type": "application/xml; charset=utf-8" },
      body: '<?xml version="1.0"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"/></c:comp-filter></c:filter></c:calendar-query>',
    });
    const events = parsedResponses(response, 500)
      .map((entry) => {
        const prop = property(entry);
        return {
          href: this.safeHref(text(entry.href), base),
          etag: text(prop.getetag).slice(0, 255) || null,
          ics: text(prop["calendar-data"]),
        };
      })
      .filter(({ href, ics }) => href && ics);
    return events;
  }

  private safeHref(value: string, base: URL) {
    if (!value || value.length > 2048)
      throw new ExternalCalDavNetworkError("INVALID_RESOURCE_HREF");
    const resource = new URL(value, base);
    if (
      resource.origin !== base.origin ||
      resource.username ||
      resource.password ||
      resource.search ||
      resource.hash
    )
      throw new ExternalCalDavNetworkError("INVALID_RESOURCE_HREF");
    return resource.pathname;
  }

  private async request(
    target: string,
    credentials: ExternalCredentials,
    init: ExternalRequestInit,
    redirectCount = 0,
  ): Promise<string> {
    const url = validateExternalCalDavUrl(target);
    const resolved = await resolveAllowedAddress(url);
    const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
      if (options.all)
        callback(null, [
          { address: resolved.address, family: resolved.family },
        ]);
      else callback(null, resolved.address, resolved.family);
    };
    return new Promise<string>((resolve, reject) => {
      const requestHolder: { current?: ReturnType<typeof httpsRequest> } = {};
      const absoluteTimeout = setTimeout(
        () =>
          requestHolder.current?.destroy(
            new ExternalCalDavNetworkError("TIMEOUT"),
          ),
        REQUEST_TIMEOUT_MS,
      );
      const stopTimeout = () => clearTimeout(absoluteTimeout);
      const fail = (error: ExternalCalDavNetworkError) => {
        stopTimeout();
        reject(error);
      };
      const succeed = (value: string) => {
        stopTimeout();
        resolve(value);
      };
      const request = httpsRequest(
        url,
        {
          method: init.method,
          headers: {
            ...init.headers,
            authorization: `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`, "utf8").toString("base64")}`,
            accept: "application/xml, text/xml",
          },
          lookup: pinnedLookup,
          rejectUnauthorized: true,
        },
        (response) => {
          const status = response.statusCode ?? 0;
          if ([301, 302, 307, 308].includes(status)) {
            response.resume();
            if (redirectCount >= MAX_REDIRECTS) {
              fail(new ExternalCalDavNetworkError("TOO_MANY_REDIRECTS"));
              return;
            }
            const location = response.headers.location;
            if (!location) {
              fail(new ExternalCalDavNetworkError("INVALID_REDIRECT"));
              return;
            }
            const redirected = new URL(location, url);
            if (redirected.origin !== url.origin) {
              fail(new ExternalCalDavNetworkError("CROSS_ORIGIN_REDIRECT"));
              return;
            }
            stopTimeout();
            void this.request(
              redirected.toString(),
              credentials,
              init,
              redirectCount + 1,
            ).then(succeed, reject);
            return;
          }
          if (status === 401 || status === 403) {
            response.resume();
            fail(new ExternalCalDavNetworkError("AUTHORIZATION_FAILED"));
            return;
          }
          if ((status < 200 || status >= 300) && status !== 207) {
            response.resume();
            fail(new ExternalCalDavNetworkError("REMOTE_ERROR"));
            return;
          }
          const declaredSize = Number(response.headers["content-length"] ?? 0);
          if (declaredSize > MAX_RESPONSE_BYTES) {
            response.destroy();
            fail(new ExternalCalDavNetworkError("RESPONSE_TOO_LARGE"));
            return;
          }
          const chunks: Buffer[] = [];
          let received = 0;
          response.on("data", (chunk: Buffer) => {
            received += chunk.byteLength;
            if (received > MAX_RESPONSE_BYTES) {
              response.destroy();
              fail(new ExternalCalDavNetworkError("RESPONSE_TOO_LARGE"));
              return;
            }
            chunks.push(chunk);
          });
          response.on("end", () => {
            try {
              succeed(
                new TextDecoder("utf-8", { fatal: true }).decode(
                  Buffer.concat(chunks),
                ),
              );
            } catch {
              fail(new ExternalCalDavNetworkError("INVALID_ENCODING"));
            }
          });
          response.on("error", () =>
            fail(new ExternalCalDavNetworkError("REQUEST_FAILED")),
          );
        },
      );
      requestHolder.current = request;
      request.setTimeout(REQUEST_TIMEOUT_MS, () =>
        request.destroy(new ExternalCalDavNetworkError("TIMEOUT")),
      );
      request.on("error", (error) =>
        fail(
          error instanceof ExternalCalDavNetworkError
            ? error
            : new ExternalCalDavNetworkError("REQUEST_FAILED"),
        ),
      );
      request.end(init.body);
    });
  }
}
