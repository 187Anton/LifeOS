import type { CalendarEventResponse } from "@lifeos/contracts";
import ICAL from "ical.js";
import { tzlib_get_ical_block } from "timezones-ical-library";

import type { EventInput } from "../calendar/service.js";
import { CalDavError } from "./errors.js";

const PRODUCT_ID = "-//Anton Life OS//CalDAV 0.1//DE";

const escapeText = (value: string): string =>
  value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");

const foldLine = (line: string): string[] => {
  const folded: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const character of line) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (current && bytes + characterBytes > limit) {
      folded.push(current);
      current = ` ${character}`;
      bytes = 1 + characterBytes;
      limit = 75;
    } else {
      current += character;
      bytes += characterBytes;
    }
  }
  folded.push(current);
  return folded;
};

const utcTimestamp = (value: Date): string =>
  value
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(/\.\d{3}Z$/, "Z");

const dateValue = (value: string): string => value.replaceAll("-", "");

const zonedParts = (value: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
};

const localTimestamp = (value: Date, timezone: string): string => {
  const parts = zonedParts(value, timezone);
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
    "T",
    String(parts.hour).padStart(2, "0"),
    String(parts.minute).padStart(2, "0"),
    String(parts.second).padStart(2, "0"),
  ].join("");
};

const isSupportedTimezone = (timezone: string): boolean => {
  if (!timezone || timezone.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
};

const offsetAt = (timestamp: number, timezone: string): number => {
  const parts = zonedParts(new Date(timestamp), timezone);
  return (
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    ) - timestamp
  );
};

const localTimeToDate = (value: ICAL.Time, timezone: string): Date => {
  const wallTime = Date.UTC(
    value.year,
    value.month - 1,
    value.day,
    value.hour,
    value.minute,
    value.second,
  );
  if (timezone === "UTC") return new Date(wallTime);
  let timestamp = wallTime - offsetAt(wallTime, timezone);
  timestamp = wallTime - offsetAt(timestamp, timezone);
  return new Date(timestamp);
};

const durationToTrigger = (minutes: number): string => {
  const days = Math.floor(minutes / 1440);
  const remainingAfterDays = minutes % 1440;
  const hours = Math.floor(remainingAfterDays / 60);
  const remainingMinutes = remainingAfterDays % 60;
  const datePart = days ? `${days}D` : "";
  const timePart =
    hours || remainingMinutes
      ? `T${hours ? `${hours}H` : ""}${remainingMinutes ? `${remainingMinutes}M` : ""}`
      : "T0M";
  return `-P${datePart}${timePart}`;
};

export const serializeCalendarEvent = (
  event: CalendarEventResponse,
): string => {
  const timezoneDefinition =
    event.timezone === "UTC" ? null : tzlib_get_ical_block(event.timezone);
  const timezoneBlock = Array.isArray(timezoneDefinition)
    ? timezoneDefinition.at(0)
    : undefined;
  if (event.timezone !== "UTC" && !timezoneBlock) {
    throw new Error(`Für ${event.timezone} fehlt eine VTIMEZONE-Definition.`);
  }
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `PRODID:${PRODUCT_ID}`,
    `X-WR-TIMEZONE:${escapeText(event.timezone)}`,
    ...(timezoneBlock ? timezoneBlock.split("\r\n") : []),
    "BEGIN:VEVENT",
    `UID:${escapeText(event.uid)}`,
    `DTSTAMP:${utcTimestamp(new Date(event.updatedAt))}`,
    `LAST-MODIFIED:${utcTimestamp(new Date(event.updatedAt))}`,
    `SEQUENCE:${event.sequence}`,
    `SUMMARY:${escapeText(event.title)}`,
  ];

  if (event.description !== null) {
    lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  }
  if (event.location !== null) {
    lines.push(`LOCATION:${escapeText(event.location)}`);
  }
  if (event.isAllDay) {
    if (!event.startDate || !event.endDate) {
      throw new Error("Ganztägiges Ereignis ohne Datumsgrenzen");
    }
    lines.push(`DTSTART;VALUE=DATE:${dateValue(event.startDate)}`);
    lines.push(`DTEND;VALUE=DATE:${dateValue(event.endDate)}`);
  } else {
    if (!event.startsAt || !event.endsAt) {
      throw new Error("Zeitgebundenes Ereignis ohne Zeitgrenzen");
    }
    const startsAt = new Date(event.startsAt);
    const endsAt = new Date(event.endsAt);
    if (event.timezone === "UTC") {
      lines.push(`DTSTART:${utcTimestamp(startsAt)}`);
      lines.push(`DTEND:${utcTimestamp(endsAt)}`);
    } else {
      lines.push(
        `DTSTART;TZID=${event.timezone}:${localTimestamp(startsAt, event.timezone)}`,
      );
      lines.push(
        `DTEND;TZID=${event.timezone}:${localTimestamp(endsAt, event.timezone)}`,
      );
    }
  }
  if (event.recurrenceRule) lines.push(`RRULE:${event.recurrenceRule}`);
  for (const reminder of event.reminderMinutes) {
    lines.push("BEGIN:VALARM");
    lines.push("ACTION:DISPLAY");
    lines.push(`TRIGGER:${durationToTrigger(reminder)}`);
    lines.push(`DESCRIPTION:${escapeText(event.title)}`);
    lines.push("END:VALARM");
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return `${lines.flatMap(foldLine).join("\r\n")}\r\n`;
};

const readString = (
  component: ICAL.Component,
  property: string,
): string | null => {
  const value = component.getFirstPropertyValue(property);
  return typeof value === "string" ? value : null;
};

const readTimezone = (
  property: ICAL.Property,
  value: ICAL.Time,
  calendar: ICAL.Component,
  defaultTimezone: string,
): string => {
  const parameter = property.getParameter("tzid");
  const explicit = typeof parameter === "string" ? parameter : undefined;
  const calendarTimezone = readString(calendar, "x-wr-timezone") ?? undefined;
  const timezone =
    explicit ??
    (value.zone.tzid === "UTC" ? "UTC" : undefined) ??
    calendarTimezone ??
    defaultTimezone;
  if (!isSupportedTimezone(timezone)) {
    throw new CalDavError(
      400,
      `Die Zeitzone ${timezone} wird nicht unterstützt.`,
    );
  }
  return timezone;
};

const dateString = (value: ICAL.Time): string =>
  `${String(value.year).padStart(4, "0")}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;

export const parseCalendarEvent = (
  source: string,
  defaultTimezone: string,
): EventInput => {
  let calendar: ICAL.Component;
  try {
    calendar = ICAL.Component.fromString(source);
  } catch {
    throw new CalDavError(
      400,
      "Der Anfragekörper ist kein gültiges iCalendar-Dokument.",
    );
  }
  if (calendar.name !== "vcalendar") {
    throw new CalDavError(
      400,
      "Es wird genau ein VCALENDAR-Dokument erwartet.",
    );
  }
  const eventComponents = calendar.getAllSubcomponents("vevent");
  if (eventComponents.length !== 1) {
    throw new CalDavError(400, "Es wird genau ein VEVENT erwartet.");
  }
  const component = eventComponents[0];
  if (!component) throw new CalDavError(400, "Das VEVENT fehlt.");
  const uid = readString(component, "uid")?.trim() ?? "";
  const title = readString(component, "summary")?.trim() ?? "";
  const startsProperty = component.getFirstProperty("dtstart");
  const endsProperty = component.getFirstProperty("dtend");
  const startsValue = startsProperty?.getFirstValue();
  const endsValue = endsProperty?.getFirstValue();
  if (
    !uid ||
    uid.length > 255 ||
    /[\r\n]/.test(uid) ||
    !title ||
    title.length > 500 ||
    !startsProperty ||
    !endsProperty ||
    !(startsValue instanceof ICAL.Time) ||
    !(endsValue instanceof ICAL.Time)
  ) {
    throw new CalDavError(
      400,
      "UID, SUMMARY, DTSTART oder DTEND ist ungültig.",
    );
  }

  const description = readString(component, "description");
  const location = readString(component, "location");
  if ((description?.length ?? 0) > 10_000 || (location?.length ?? 0) > 500) {
    throw new CalDavError(
      400,
      "Beschreibung oder Ort überschreitet die erlaubte Länge.",
    );
  }
  const recurrenceValue = component.getFirstPropertyValue("rrule");
  const recurrenceRule = recurrenceValue ? recurrenceValue.toString() : null;
  if (
    recurrenceRule &&
    (recurrenceRule.length > 2048 || !/^FREQ=[^\r\n]+$/.test(recurrenceRule))
  ) {
    throw new CalDavError(400, "Die Wiederholungsregel ist ungültig.");
  }

  const reminderMinutes = component
    .getAllSubcomponents("valarm")
    .map((alarm) => {
      const action = readString(alarm, "action")?.toUpperCase();
      const trigger = alarm.getFirstPropertyValue("trigger");
      if (
        action !== "DISPLAY" ||
        !(trigger instanceof ICAL.Duration) ||
        !trigger.isNegative
      ) {
        throw new CalDavError(
          400,
          "Nur DISPLAY-Erinnerungen vor dem Ereignis werden unterstützt.",
        );
      }
      const minutes = Math.abs(trigger.toSeconds()) / 60;
      if (!Number.isInteger(minutes) || minutes < 0 || minutes > 10_080) {
        throw new CalDavError(
          400,
          "Die Erinnerung liegt außerhalb des erlaubten Bereichs.",
        );
      }
      return minutes;
    });
  if (reminderMinutes.length > 10) {
    throw new CalDavError(400, "Es sind höchstens zehn Erinnerungen erlaubt.");
  }

  if (startsValue.isDate !== endsValue.isDate) {
    throw new CalDavError(
      400,
      "DTSTART und DTEND müssen denselben Werttyp verwenden.",
    );
  }
  if (startsValue.isDate) {
    const startDate = dateString(startsValue);
    const endDate = dateString(endsValue);
    if (endDate <= startDate) {
      throw new CalDavError(400, "DTEND muss nach DTSTART liegen.");
    }
    const timezone = readString(calendar, "x-wr-timezone") ?? defaultTimezone;
    if (!isSupportedTimezone(timezone)) {
      throw new CalDavError(
        400,
        `Die Zeitzone ${timezone} wird nicht unterstützt.`,
      );
    }
    return {
      uid,
      title,
      ...(description === null ? {} : { description }),
      ...(location === null ? {} : { location }),
      timezone,
      isAllDay: true,
      startDate,
      endDate,
      ...(recurrenceRule === null ? {} : { recurrenceRule }),
      reminderMinutes: [...new Set(reminderMinutes)].sort(
        (left, right) => left - right,
      ),
    };
  }

  const timezone = readTimezone(
    startsProperty,
    startsValue,
    calendar,
    defaultTimezone,
  );
  const endTimezone = readTimezone(endsProperty, endsValue, calendar, timezone);
  if (endTimezone !== timezone) {
    throw new CalDavError(
      400,
      "DTSTART und DTEND müssen dieselbe Zeitzone verwenden.",
    );
  }
  const startsAt = localTimeToDate(startsValue, timezone);
  const endsAt = localTimeToDate(endsValue, timezone);
  if (endsAt <= startsAt) {
    throw new CalDavError(400, "DTEND muss nach DTSTART liegen.");
  }
  return {
    uid,
    title,
    ...(description === null ? {} : { description }),
    ...(location === null ? {} : { location }),
    timezone,
    isAllDay: false,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    ...(recurrenceRule === null ? {} : { recurrenceRule }),
    reminderMinutes: [...new Set(reminderMinutes)].sort(
      (left, right) => left - right,
    ),
  };
};

export const parseUtcCalendarTimestamp = (value: string): Date | null => {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const result = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  );
  return Number.isNaN(result.valueOf()) ? null : result;
};
