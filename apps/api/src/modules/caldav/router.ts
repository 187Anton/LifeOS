import type { CalendarEventResponse } from "@lifeos/contracts";
import express, {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import { ApiError } from "../../errors.js";
import type { CalendarService } from "../calendar/service.js";
import type { CalDavAuthenticationService } from "./authentication.js";
import { CalDavError } from "./errors.js";
import {
  parseCalendarEvent,
  parseUtcCalendarTimestamp,
  serializeCalendarEvent,
} from "./icalendar.js";
import type { CalDavCalendar, CalDavRepository } from "./repository.js";
import {
  davErrorXml,
  escapeXml,
  multistatusXml,
  parseDavXml,
  type DavResponseEntry,
  type ParsedDavXml,
} from "./xml.js";

const PRINCIPAL_HREF = "/caldav/principals/local/";
const HOME_HREF = "/caldav/calendars/local/";
const DAV_HEADER = "1, 3, calendar-access, sync-collection";
const ALLOW_HEADER = "OPTIONS, PROPFIND, REPORT, GET, PUT, DELETE, MKCALENDAR";
const SAFE_CALENDAR_ID = /^[A-Za-z0-9._~-]{1,100}$/;

type CalDavPath =
  | { kind: "root" }
  | { kind: "principal" }
  | { kind: "home" }
  | { kind: "calendar"; calendarId: string }
  | { kind: "event"; calendarId: string; uid: string };

type PropertyResource =
  | { kind: "root" }
  | { kind: "principal" }
  | { kind: "home" }
  | { kind: "calendar"; calendar: CalDavCalendar }
  | { kind: "event"; calendar: CalDavCalendar; event: CalendarEventResponse };

const calendarHref = (calendarId: string): string =>
  `${HOME_HREF}${encodeURIComponent(calendarId)}/`;
const eventHref = (calendarId: string, uid: string): string =>
  `${calendarHref(calendarId)}${encodeURIComponent(uid)}.ics`;

const parsePathname = (pathname: string): CalDavPath | null => {
  let segments: string[];
  try {
    segments = pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }
  if (segments.length === 1 && segments[0] === "caldav")
    return { kind: "root" };
  if (
    segments.length === 3 &&
    segments[0] === "caldav" &&
    segments[1] === "principals" &&
    segments[2] === "local"
  ) {
    return { kind: "principal" };
  }
  if (
    segments.length === 3 &&
    segments[0] === "caldav" &&
    segments[1] === "calendars" &&
    segments[2] === "local"
  ) {
    return { kind: "home" };
  }
  if (
    (segments.length === 4 || segments.length === 5) &&
    segments[0] === "caldav" &&
    segments[1] === "calendars" &&
    segments[2] === "local"
  ) {
    const calendarId = segments[3] ?? "";
    if (!SAFE_CALENDAR_ID.test(calendarId)) return null;
    if (segments.length === 4) return { kind: "calendar", calendarId };
    const resourceName = segments[4] ?? "";
    if (!resourceName.endsWith(".ics")) return null;
    const uid = resourceName.slice(0, -4);
    if (!uid || uid.length > 255 || /[\r\n/]/.test(uid)) return null;
    return { kind: "event", calendarId, uid };
  }
  return null;
};

const requestPath = (request: Request): CalDavPath | null => {
  const pathname = new URL(request.originalUrl, "http://lifeos.local").pathname;
  return parsePathname(pathname);
};

const syncToken = (calendar: CalDavCalendar): string =>
  `urn:lifeos:caldav:sync:${calendar.id}:${calendar.syncToken}`;

const readSyncVersion = (
  token: string,
  calendar: CalDavCalendar,
): number | null => {
  const prefix = `urn:lifeos:caldav:sync:${calendar.id}:`;
  if (!token.startsWith(prefix)) return null;
  const version = Number(token.slice(prefix.length));
  return Number.isSafeInteger(version) && version >= 0 ? version : null;
};

const propertyTag = (name: string): string => {
  const calDavProperties = new Set([
    "calendar-data",
    "calendar-description",
    "calendar-home-set",
    "calendar-timezone-id",
    "supported-calendar-component-set",
  ]);
  const calendarServerProperties = new Set(["getctag"]);
  const prefix = calDavProperties.has(name)
    ? "c"
    : calendarServerProperties.has(name)
      ? "cs"
      : "d";
  return `<${prefix}:${name}/>`;
};

const defaultProperties = (resource: PropertyResource): string[] => {
  switch (resource.kind) {
    case "root":
      return ["resourcetype", "current-user-principal"];
    case "principal":
      return [
        "displayname",
        "resourcetype",
        "principal-URL",
        "calendar-home-set",
      ];
    case "home":
      return ["displayname", "resourcetype", "current-user-principal"];
    case "calendar":
      return [
        "displayname",
        "resourcetype",
        "calendar-description",
        "calendar-timezone-id",
        "supported-calendar-component-set",
        "getctag",
        "sync-token",
      ];
    case "event":
      return ["getetag", "getcontenttype", "calendar-data"];
  }
};

const renderProperty = (
  name: string,
  resource: PropertyResource,
): string | null => {
  switch (name) {
    case "current-user-principal":
      return `<d:current-user-principal><d:href>${PRINCIPAL_HREF}</d:href></d:current-user-principal>`;
    case "principal-URL":
      return resource.kind === "principal"
        ? `<d:principal-URL><d:href>${PRINCIPAL_HREF}</d:href></d:principal-URL>`
        : null;
    case "calendar-home-set":
      return resource.kind === "principal"
        ? `<c:calendar-home-set><d:href>${HOME_HREF}</d:href></c:calendar-home-set>`
        : null;
    case "displayname": {
      const displayName =
        resource.kind === "principal"
          ? "LifeOS"
          : resource.kind === "home"
            ? "LifeOS-Kalender"
            : resource.kind === "calendar"
              ? resource.calendar.name
              : null;
      return displayName === null
        ? null
        : `<d:displayname>${escapeXml(displayName)}</d:displayname>`;
    }
    case "resourcetype":
      if (resource.kind === "event") return `<d:resourcetype/>`;
      if (resource.kind === "principal") {
        return `<d:resourcetype><d:collection/><d:principal/></d:resourcetype>`;
      }
      if (resource.kind === "calendar") {
        return `<d:resourcetype><d:collection/><c:calendar/></d:resourcetype>`;
      }
      return `<d:resourcetype><d:collection/></d:resourcetype>`;
    case "calendar-description":
      return resource.kind === "calendar"
        ? `<c:calendar-description>${escapeXml(resource.calendar.name)}</c:calendar-description>`
        : null;
    case "calendar-timezone-id":
      return resource.kind === "calendar"
        ? `<c:calendar-timezone-id>${escapeXml(resource.calendar.timezone)}</c:calendar-timezone-id>`
        : null;
    case "supported-calendar-component-set":
      return resource.kind === "calendar"
        ? `<c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>`
        : null;
    case "getctag":
      return resource.kind === "calendar"
        ? `<cs:getctag>${escapeXml(syncToken(resource.calendar))}</cs:getctag>`
        : null;
    case "sync-token":
      return resource.kind === "calendar"
        ? `<d:sync-token>${escapeXml(syncToken(resource.calendar))}</d:sync-token>`
        : null;
    case "supported-report-set":
      return resource.kind === "calendar"
        ? `<d:supported-report-set><d:supported-report><d:report><c:calendar-query/></d:report></d:supported-report><d:supported-report><d:report><c:calendar-multiget/></d:report></d:supported-report><d:supported-report><d:report><d:sync-collection/></d:report></d:supported-report></d:supported-report-set>`
        : null;
    case "owner":
      return `<d:owner><d:href>${PRINCIPAL_HREF}</d:href></d:owner>`;
    case "current-user-privilege-set":
      return `<d:current-user-privilege-set><d:privilege><d:read/></d:privilege><d:privilege><d:write/></d:privilege></d:current-user-privilege-set>`;
    case "getetag":
      return resource.kind === "event"
        ? `<d:getetag>${escapeXml(resource.event.etag)}</d:getetag>`
        : null;
    case "getcontenttype":
      return resource.kind === "event"
        ? `<d:getcontenttype>text/calendar; charset=utf-8; component=VEVENT</d:getcontenttype>`
        : null;
    case "getcontentlength":
      return resource.kind === "event"
        ? `<d:getcontentlength>${Buffer.byteLength(serializeCalendarEvent(resource.event), "utf8")}</d:getcontentlength>`
        : null;
    case "getlastmodified":
      return resource.kind === "event"
        ? `<d:getlastmodified>${new Date(resource.event.updatedAt).toUTCString()}</d:getlastmodified>`
        : null;
    case "calendar-data":
      return resource.kind === "event"
        ? `<c:calendar-data>${escapeXml(serializeCalendarEvent(resource.event))}</c:calendar-data>`
        : null;
    default:
      return null;
  }
};

const propertyEntry = (
  href: string,
  resource: PropertyResource,
  requested: Set<string>,
): DavResponseEntry => {
  const names = requested.size ? [...requested] : defaultProperties(resource);
  const properties: string[] = [];
  const missingProperties: string[] = [];
  for (const name of names) {
    const rendered = renderProperty(name, resource);
    if (rendered) properties.push(rendered);
    else missingProperties.push(propertyTag(name));
  }
  return { href, properties, missingProperties };
};

const requireCalendar = async (
  repository: CalDavRepository,
  userId: string,
  calendarId: string,
): Promise<CalDavCalendar> => {
  const calendar = await repository.getCalendar(userId, calendarId);
  if (!calendar)
    throw new CalDavError(404, "Der Kalender wurde nicht gefunden.");
  return calendar;
};

const propfind = async (
  request: Request,
  response: Response,
  repository: CalDavRepository,
  userId: string,
  path: CalDavPath,
): Promise<void> => {
  const depth = request.headers.depth ?? "infinity";
  if (depth !== "0" && depth !== "1") {
    throw new CalDavError(
      403,
      "Es werden nur Depth 0 und 1 unterstützt.",
      "propfind-finite-depth",
    );
  }
  const body = parseDavXml(
    typeof request.body === "string" ? request.body : undefined,
  );
  const entries: DavResponseEntry[] = [];
  if (path.kind === "root") {
    entries.push(propertyEntry("/caldav/", { kind: "root" }, body.properties));
    if (depth === "1") {
      entries.push(
        propertyEntry(PRINCIPAL_HREF, { kind: "principal" }, body.properties),
      );
      entries.push(propertyEntry(HOME_HREF, { kind: "home" }, body.properties));
    }
  } else if (path.kind === "principal") {
    entries.push(
      propertyEntry(PRINCIPAL_HREF, { kind: "principal" }, body.properties),
    );
  } else if (path.kind === "home") {
    entries.push(propertyEntry(HOME_HREF, { kind: "home" }, body.properties));
    if (depth === "1") {
      for (const calendar of await repository.listCalendars(userId)) {
        entries.push(
          propertyEntry(
            calendarHref(calendar.id),
            { kind: "calendar", calendar },
            body.properties,
          ),
        );
      }
    }
  } else if (path.kind === "calendar") {
    const calendar = await requireCalendar(repository, userId, path.calendarId);
    entries.push(
      propertyEntry(
        calendarHref(calendar.id),
        { kind: "calendar", calendar },
        body.properties,
      ),
    );
    if (depth === "1") {
      for (const event of await repository.listEvents(userId, calendar.id)) {
        entries.push(
          propertyEntry(
            eventHref(calendar.id, event.uid),
            { kind: "event", calendar, event },
            body.properties,
          ),
        );
      }
    }
  } else {
    const calendar = await requireCalendar(repository, userId, path.calendarId);
    const event = await repository.getEvent(userId, calendar.id, path.uid);
    if (!event)
      throw new CalDavError(404, "Das Ereignis wurde nicht gefunden.");
    entries.push(
      propertyEntry(
        eventHref(calendar.id, event.uid),
        { kind: "event", calendar, event },
        body.properties,
      ),
    );
  }
  response.status(207).type("application/xml").send(multistatusXml(entries));
};

const eventMatchesRange = (
  event: CalendarEventResponse,
  range: ParsedDavXml["timeRange"],
): boolean => {
  if (!range) return true;
  const start = range.start ? parseUtcCalendarTimestamp(range.start) : null;
  const end = range.end ? parseUtcCalendarTimestamp(range.end) : null;
  if ((range.start && !start) || (range.end && !end)) {
    throw new CalDavError(400, "Der REPORT-Zeitraum ist ungültig.");
  }
  // Wiederholungsserien werden vollständig geliefert, damit ein Client keine
  // innerhalb des Zeitraums liegende Instanz verpasst.
  if (event.recurrenceRule) return true;
  const eventStart = new Date(
    event.isAllDay
      ? `${event.startDate}T00:00:00.000Z`
      : String(event.startsAt),
  );
  const eventEnd = new Date(
    event.isAllDay ? `${event.endDate}T00:00:00.000Z` : String(event.endsAt),
  );
  return (!end || eventStart < end) && (!start || eventEnd > start);
};

const report = async (
  request: Request,
  response: Response,
  repository: CalDavRepository,
  userId: string,
  path: CalDavPath,
): Promise<void> => {
  if (path.kind !== "calendar") {
    throw new CalDavError(405, "REPORT ist nur auf Kalendern verfügbar.");
  }
  const calendar = await requireCalendar(repository, userId, path.calendarId);
  const body = parseDavXml(
    typeof request.body === "string" ? request.body : undefined,
  );
  const entries: DavResponseEntry[] = [];
  if (body.root === "calendar-multiget") {
    for (const href of body.hrefs) {
      const requestedPath = parsePathname(
        new URL(href, "http://lifeos.local").pathname,
      );
      if (
        requestedPath?.kind !== "event" ||
        requestedPath.calendarId !== calendar.id
      ) {
        entries.push({ href, status: 404 });
        continue;
      }
      const event = await repository.getEvent(
        userId,
        calendar.id,
        requestedPath.uid,
      );
      entries.push(
        event
          ? propertyEntry(
              href,
              { kind: "event", calendar, event },
              body.properties,
            )
          : { href, status: 404 },
      );
    }
    response.status(207).type("application/xml").send(multistatusXml(entries));
    return;
  }
  if (body.root === "calendar-query") {
    const events = (await repository.listEvents(userId, calendar.id)).filter(
      (event) => eventMatchesRange(event, body.timeRange),
    );
    for (const event of events) {
      entries.push(
        propertyEntry(
          eventHref(calendar.id, event.uid),
          { kind: "event", calendar, event },
          body.properties,
        ),
      );
    }
    response.status(207).type("application/xml").send(multistatusXml(entries));
    return;
  }
  if (body.root === "sync-collection") {
    if (body.syncToken) {
      const parsedVersion = readSyncVersion(body.syncToken, calendar);
      if (parsedVersion === null || parsedVersion > calendar.syncToken) {
        throw new CalDavError(
          403,
          "Der Sync-Token ist für diesen Kalender ungültig.",
          "valid-sync-token",
        );
      }
      for (const change of await repository.listChanges(
        userId,
        calendar.id,
        parsedVersion,
      )) {
        const href = eventHref(calendar.id, change.event.uid);
        entries.push(
          change.deleted
            ? { href, status: 404 }
            : propertyEntry(
                href,
                { kind: "event", calendar, event: change.event },
                body.properties,
              ),
        );
      }
    } else {
      for (const event of await repository.listEvents(userId, calendar.id)) {
        entries.push(
          propertyEntry(
            eventHref(calendar.id, event.uid),
            { kind: "event", calendar, event },
            body.properties,
          ),
        );
      }
    }
    response
      .status(207)
      .type("application/xml")
      .send(multistatusXml(entries, syncToken(calendar)));
    return;
  }
  throw new CalDavError(400, "Dieser REPORT-Typ wird nicht unterstützt.");
};

const matchingEtag = (
  ifMatch: string | undefined,
  currentEtag: string,
): string => {
  if (!ifMatch) {
    throw new CalDavError(428, "Für Änderungen ist If-Match erforderlich.");
  }
  if (
    ifMatch === "*" ||
    ifMatch
      .split(",")
      .map((value) => value.trim())
      .includes(currentEtag)
  ) {
    return currentEtag;
  }
  throw new CalDavError(412, "Der ETag ist veraltet.", "condition-failed");
};

const putEvent = async (
  request: Request,
  response: Response,
  repository: CalDavRepository,
  calendars: CalendarService,
  userId: string,
  path: Extract<CalDavPath, { kind: "event" }>,
): Promise<void> => {
  const calendar = await requireCalendar(repository, userId, path.calendarId);
  if (typeof request.body !== "string" || !request.body.trim()) {
    throw new CalDavError(400, "Ein iCalendar-Anfragekörper ist erforderlich.");
  }
  const input = parseCalendarEvent(request.body, calendar.timezone);
  if (input.uid !== path.uid) {
    throw new CalDavError(
      409,
      "Die UID muss zum stabilen Ressourcenpfad passen.",
      "no-uid-conflict",
    );
  }
  const current = await repository.getEvent(userId, calendar.id, path.uid);
  if (current) {
    if (request.headers["if-none-match"] === "*") {
      throw new CalDavError(412, "Die Ereignisressource existiert bereits.");
    }
    const updated = await calendars.replaceEvent(
      userId,
      calendar.id,
      path.uid,
      matchingEtag(request.headers["if-match"], current.etag),
      input,
    );
    response.setHeader("ETag", updated.etag).status(204).end();
    return;
  }
  if (request.headers["if-match"]) {
    throw new CalDavError(
      412,
      "Die angeforderte Ereignisressource existiert nicht.",
    );
  }
  const created = await calendars.createEvent(userId, calendar.id, input);
  response
    .setHeader("ETag", created.etag)
    .setHeader("Location", eventHref(calendar.id, created.uid))
    .status(201)
    .end();
};

const mkcalendar = async (
  request: Request,
  response: Response,
  repository: CalDavRepository,
  calendars: CalendarService,
  userId: string,
  path: CalDavPath,
): Promise<void> => {
  if (path.kind !== "calendar") {
    throw new CalDavError(405, "MKCALENDAR benötigt einen neuen Kalenderpfad.");
  }
  if (await repository.getCalendar(userId, path.calendarId)) {
    throw new CalDavError(405, "Der Kalenderpfad ist bereits belegt.");
  }
  const body = parseDavXml(
    typeof request.body === "string" ? request.body : undefined,
  );
  const timezoneText = body.calendarTimezone ?? "";
  const timezoneMatch = /(?:^|\r?\n)TZID:([^\r\n]+)/i.exec(timezoneText);
  const timezone =
    timezoneMatch?.[1]?.trim() ?? (await repository.getUserTimezone(userId));
  const name = body.displayName?.trim() || path.calendarId;
  if (name.length > 200 || timezone.length > 100) {
    throw new CalDavError(400, "Kalendername oder Zeitzone ist zu lang.");
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
  } catch {
    throw new CalDavError(400, "Die Kalenderzeitzone wird nicht unterstützt.");
  }
  await calendars.createCalendar(userId, { name, timezone }, path.calendarId);
  response
    .setHeader("Location", calendarHref(path.calendarId))
    .status(201)
    .end();
};

const handleError = (
  error: unknown,
  response: Response,
  next: NextFunction,
): void => {
  const calDavError =
    error instanceof CalDavError
      ? error
      : error instanceof ApiError
        ? new CalDavError(error.status, error.message)
        : null;
  if (!calDavError) {
    next(error);
    return;
  }
  if (calDavError.status === 401) {
    response.setHeader(
      "WWW-Authenticate",
      'Basic realm="LifeOS CalDAV", charset="UTF-8"',
    );
  }
  response
    .status(calDavError.status)
    .type("application/xml")
    .send(davErrorXml(calDavError.condition, calDavError.message));
};

export const createCalDavRouter = ({
  authentication,
  repository,
  calendars,
}: {
  authentication: CalDavAuthenticationService;
  repository: CalDavRepository;
  calendars: CalendarService;
}): Router => {
  const router = Router();
  router.get("/.well-known/caldav", (_request, response) => {
    response.redirect(301, "/caldav/");
  });
  router.use(
    "/caldav",
    express.text({
      type: [
        "application/xml",
        "text/xml",
        "application/icalendar",
        "text/calendar",
      ],
      limit: "64kb",
    }),
    async (request, response, next) => {
      try {
        const userId = await authentication.authenticate(request);
        const path = requestPath(request);
        if (!path)
          throw new CalDavError(
            404,
            "Die CalDAV-Ressource wurde nicht gefunden.",
          );
        response.setHeader("DAV", DAV_HEADER);
        response.setHeader("MS-Author-Via", "DAV");
        if (request.method === "OPTIONS") {
          response.setHeader("Allow", ALLOW_HEADER).status(204).end();
          return;
        }
        if (request.method === "PROPFIND") {
          await propfind(request, response, repository, userId, path);
          return;
        }
        if (request.method === "REPORT") {
          await report(request, response, repository, userId, path);
          return;
        }
        if (request.method === "GET" && path.kind === "event") {
          const calendar = await requireCalendar(
            repository,
            userId,
            path.calendarId,
          );
          const event = await repository.getEvent(
            userId,
            calendar.id,
            path.uid,
          );
          if (!event)
            throw new CalDavError(404, "Das Ereignis wurde nicht gefunden.");
          response
            .setHeader("ETag", event.etag)
            .type("text/calendar; charset=utf-8")
            .send(serializeCalendarEvent(event));
          return;
        }
        if (request.method === "PUT" && path.kind === "event") {
          await putEvent(
            request,
            response,
            repository,
            calendars,
            userId,
            path,
          );
          return;
        }
        if (request.method === "DELETE" && path.kind === "event") {
          const calendar = await requireCalendar(
            repository,
            userId,
            path.calendarId,
          );
          const event = await repository.getEvent(
            userId,
            calendar.id,
            path.uid,
          );
          if (!event)
            throw new CalDavError(404, "Das Ereignis wurde nicht gefunden.");
          await calendars.deleteEvent(
            userId,
            calendar.id,
            path.uid,
            matchingEtag(request.headers["if-match"], event.etag),
          );
          response.status(204).end();
          return;
        }
        if (request.method === "DELETE" && path.kind === "calendar") {
          await calendars.deleteCalendar(userId, path.calendarId);
          response.status(204).end();
          return;
        }
        if (request.method === "MKCALENDAR") {
          await mkcalendar(
            request,
            response,
            repository,
            calendars,
            userId,
            path,
          );
          return;
        }
        throw new CalDavError(
          405,
          "Die Methode ist für diese CalDAV-Ressource nicht verfügbar.",
        );
      } catch (error) {
        handleError(error, response, next);
      }
    },
  );
  router.use(
    "/caldav",
    (
      error: unknown,
      _request: Request,
      response: Response,
      next: NextFunction,
    ) => {
      if (
        error &&
        typeof error === "object" &&
        "type" in error &&
        error.type === "entity.too.large"
      ) {
        handleError(
          new CalDavError(413, "Der CalDAV-Anfragekörper ist zu groß."),
          response,
          next,
        );
        return;
      }
      handleError(error, response, next);
    },
  );
  return router;
};
