import type { CalendarEventResponse } from "@lifeos/contracts";

export const browserTimezone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export const formatEventDate = (event: CalendarEventResponse): string => {
  if (event.isAllDay && event.startDate) {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "full",
      timeZone: "UTC",
    }).format(new Date(`${event.startDate}T12:00:00.000Z`));
  }
  if (!event.startsAt) return "Zeit noch offen";
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: event.timezone,
  }).format(new Date(event.startsAt));
};

export const formatEventTime = (event: CalendarEventResponse): string => {
  if (event.isAllDay) return "Ganztägig";
  if (!event.startsAt || !event.endsAt) return "Zeit noch offen";
  const formatter = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: event.timezone,
  });
  return `${formatter.format(new Date(event.startsAt))}–${formatter.format(new Date(event.endsAt))}`;
};

export const toDateTimeInput = (iso: string, timezone: string): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
};

const timezoneOffsetAt = (timestamp: number, timezone: string): number => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return (
    Date.UTC(
      value("year"),
      value("month") - 1,
      value("day"),
      value("hour"),
      value("minute"),
      value("second"),
    ) - timestamp
  );
};

export const dateTimeInputToIso = (value: string, timezone: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Ungültiger lokaler Zeitpunkt");
  const [, year, month, day, hour, minute] = match;
  const wallTime = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
  let timestamp = wallTime - timezoneOffsetAt(wallTime, timezone);
  timestamp = wallTime - timezoneOffsetAt(timestamp, timezone);
  return new Date(timestamp).toISOString();
};

export const nextWholeHour = (): { startsAt: string; endsAt: string } => {
  const start = new Date();
  start.setSeconds(0, 0);
  start.setMinutes(0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const localValue = (date: Date): string => {
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };
  return { startsAt: localValue(start), endsAt: localValue(end) };
};

export const eventSortValue = (event: CalendarEventResponse): number => {
  const value = event.isAllDay ? event.startDate : event.startsAt;
  return value ? new Date(value).valueOf() : Number.MAX_SAFE_INTEGER;
};
