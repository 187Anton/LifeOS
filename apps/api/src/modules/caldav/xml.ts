import { XMLParser, XMLValidator } from "fast-xml-parser";

import { CalDavError } from "./errors.js";

type XmlNode = Record<string, unknown>;

export interface ParsedDavXml {
  root: string | null;
  properties: Set<string>;
  hrefs: string[];
  syncToken: string | null;
  displayName: string | null;
  calendarTimezone: string | null;
  timeRange: { start: string | null; end: string | null } | null;
}

const parser = new XMLParser({
  preserveOrder: true,
  removeNSPrefix: true,
  ignoreAttributes: false,
  processEntities: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

const childText = (children: unknown): string => {
  if (!Array.isArray(children)) return "";
  return children
    .flatMap((child) =>
      child && typeof child === "object" && "#text" in child
        ? [String((child as XmlNode)["#text"] ?? "")]
        : [],
    )
    .join("")
    .trim();
};

export const parseDavXml = (source: string | undefined): ParsedDavXml => {
  const result: ParsedDavXml = {
    root: null,
    properties: new Set(),
    hrefs: [],
    syncToken: null,
    displayName: null,
    calendarTimezone: null,
    timeRange: null,
  };
  if (!source?.trim()) return result;
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) {
    throw new CalDavError(
      400,
      "DTD- und Entity-Deklarationen sind nicht erlaubt.",
    );
  }
  const validation = XMLValidator.validate(source, {
    allowBooleanAttributes: false,
  });
  if (validation !== true) {
    throw new CalDavError(400, "Der Anfragekörper enthält kein gültiges XML.");
  }

  let parsed: unknown;
  try {
    parsed = parser.parse(source);
  } catch {
    throw new CalDavError(400, "Der Anfragekörper enthält kein gültiges XML.");
  }

  const visit = (value: unknown, parentName: string | null): void => {
    if (!Array.isArray(value)) return;
    for (const entry of value) {
      if (!entry || typeof entry !== "object") continue;
      for (const [name, children] of Object.entries(entry as XmlNode)) {
        if (name === ":@" || name === "#text" || name.startsWith("?")) continue;
        if (!result.root) result.root = name;
        if (parentName === "prop") result.properties.add(name);
        const text = childText(children);
        if (name === "href" && text) result.hrefs.push(text);
        if (name === "sync-token") result.syncToken = text || null;
        if (name === "displayname" && text) result.displayName = text;
        if (name === "calendar-timezone" && text)
          result.calendarTimezone = text;
        if (name === "time-range" && Array.isArray(children)) {
          const attributes = (entry as XmlNode)[":@"];
          const record =
            attributes && typeof attributes === "object"
              ? (attributes as Record<string, unknown>)
              : {};
          result.timeRange = {
            start:
              typeof record["@_start"] === "string" ? record["@_start"] : null,
            end: typeof record["@_end"] === "string" ? record["@_end"] : null,
          };
        }
        visit(children, name);
      }
    }
  };
  visit(parsed, null);
  return result;
};

export const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export interface DavResponseEntry {
  href: string;
  properties?: string[];
  missingProperties?: string[];
  status?: number;
}

const statusText = (status: number): string => {
  switch (status) {
    case 200:
      return "OK";
    case 201:
      return "Created";
    case 204:
      return "No Content";
    case 403:
      return "Forbidden";
    case 404:
      return "Not Found";
    case 409:
      return "Conflict";
    case 412:
      return "Precondition Failed";
    default:
      return "Error";
  }
};

const responseXml = (entry: DavResponseEntry): string => {
  const href = `<d:href>${escapeXml(entry.href)}</d:href>`;
  if (entry.status && entry.status !== 200) {
    return `<d:response>${href}<d:status>HTTP/1.1 ${entry.status} ${statusText(entry.status)}</d:status></d:response>`;
  }
  const propertyStatuses: string[] = [];
  if (entry.properties?.length) {
    propertyStatuses.push(
      `<d:propstat><d:prop>${entry.properties.join("")}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>`,
    );
  }
  if (entry.missingProperties?.length) {
    propertyStatuses.push(
      `<d:propstat><d:prop>${entry.missingProperties.join("")}</d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat>`,
    );
  }
  return `<d:response>${href}${propertyStatuses.join("")}</d:response>`;
};

export const multistatusXml = (
  entries: DavResponseEntry[],
  syncToken?: string,
): string =>
  `<?xml version="1.0" encoding="utf-8"?>` +
  `<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">` +
  entries.map(responseXml).join("") +
  (syncToken ? `<d:sync-token>${escapeXml(syncToken)}</d:sync-token>` : "") +
  `</d:multistatus>`;

export const davErrorXml = (
  condition: string | undefined,
  message: string,
): string =>
  `<?xml version="1.0" encoding="utf-8"?>` +
  `<d:error xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">` +
  (condition ? `<d:${condition}/>` : "") +
  `<d:responsedescription>${escapeXml(message)}</d:responsedescription>` +
  `</d:error>`;
