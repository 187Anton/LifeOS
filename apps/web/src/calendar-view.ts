import type { CalendarEventResponse } from "@lifeos/contracts";

import { dateTimeInputToIso, toDateTimeInput } from "./date";

export type CalendarView = "day" | "week" | "month" | "agenda";

export interface CalendarOccurrence {
  key: string;
  event: CalendarEventResponse;
  startsAt: string | null;
  endsAt: string | null;
  startDate: string | null;
  endDate: string | null;
  dateKey: string;
  recurring: boolean;
}

export interface DateRange {
  start: string;
  end: string;
}

const dayMilliseconds = 86_400_000;

const dateFromKey = (date: string): Date => new Date(`${date}T12:00:00.000Z`);

export const addDays = (date: string, days: number): string => {
  const value = dateFromKey(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const startOfMonth = (date: string): string => `${date.slice(0, 7)}-01`;

const addMonths = (date: string, months: number): string => {
  const value = dateFromKey(startOfMonth(date));
  value.setUTCMonth(value.getUTCMonth() + months);
  return value.toISOString().slice(0, 10);
};

export const startOfWeek = (date: string): string => {
  const weekday = dateFromKey(date).getUTCDay();
  return addDays(date, -(weekday === 0 ? 6 : weekday - 1));
};

export const dateKeyInTimezone = (value: Date, timezone: string): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

export const todayInTimezone = (timezone: string, now = new Date()): string =>
  dateKeyInTimezone(now, timezone);

export const rangeForView = (view: CalendarView, anchor: string): DateRange => {
  if (view === "day") return { start: anchor, end: addDays(anchor, 1) };
  if (view === "week") {
    const start = startOfWeek(anchor);
    return { start, end: addDays(start, 7) };
  }
  if (view === "month") {
    const start = startOfMonth(anchor);
    return { start, end: addMonths(start, 1) };
  }
  return { start: anchor, end: addDays(anchor, 30) };
};

export const moveAnchor = (
  view: CalendarView,
  anchor: string,
  direction: -1 | 1,
): string => {
  if (view === "day") return addDays(anchor, direction);
  if (view === "week") return addDays(anchor, direction * 7);
  if (view === "month") return addMonths(anchor, direction);
  return addDays(anchor, direction * 30);
};

export const daysInRange = ({ start, end }: DateRange): string[] => {
  const days: string[] = [];
  for (let date = start; date < end; date = addDays(date, 1)) days.push(date);
  return days;
};

const differenceInDays = (start: string, end: string): number =>
  Math.round(
    (dateFromKey(end).valueOf() - dateFromKey(start).valueOf()) /
      dayMilliseconds,
  );

const parseRule = (rule: string): Map<string, string> =>
  new Map(
    rule.split(";").flatMap((part) => {
      const separator = part.indexOf("=");
      return separator > 0
        ? [[part.slice(0, separator).toUpperCase(), part.slice(separator + 1)]]
        : [];
    }),
  );

const weekdayCodes = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

const isRuleDate = (
  candidate: string,
  start: string,
  rule: Map<string, string>,
): boolean => {
  const frequency = rule.get("FREQ");
  const interval = Math.max(1, Number(rule.get("INTERVAL") ?? "1") || 1);
  const difference = differenceInDays(start, candidate);
  if (frequency === "DAILY") return difference % interval === 0;
  if (frequency === "WEEKLY") {
    const allowedDays = (
      rule.get("BYDAY") ?? weekdayCodes[dateFromKey(start).getUTCDay()]!
    )
      .split(",")
      .map((value) => value.slice(-2));
    return (
      Math.floor(difference / 7) % interval === 0 &&
      allowedDays.includes(weekdayCodes[dateFromKey(candidate).getUTCDay()]!)
    );
  }
  if (frequency === "MONTHLY") {
    const startValue = dateFromKey(start);
    const candidateValue = dateFromKey(candidate);
    const months =
      (candidateValue.getUTCFullYear() - startValue.getUTCFullYear()) * 12 +
      candidateValue.getUTCMonth() -
      startValue.getUTCMonth();
    const monthDay = Number(rule.get("BYMONTHDAY") ?? startValue.getUTCDate());
    return (
      months >= 0 &&
      months % interval === 0 &&
      candidateValue.getUTCDate() === monthDay
    );
  }
  if (frequency === "YEARLY") {
    const startValue = dateFromKey(start);
    const candidateValue = dateFromKey(candidate);
    return (
      (candidateValue.getUTCFullYear() - startValue.getUTCFullYear()) %
        interval ===
        0 &&
      candidateValue.getUTCMonth() === startValue.getUTCMonth() &&
      candidateValue.getUTCDate() === startValue.getUTCDate()
    );
  }
  return candidate === start;
};

const untilDate = (
  value: string | undefined,
  timezone: string,
): string | null => {
  if (!value) return null;
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (dateOnly) return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;
  const timestamp = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(
    value,
  );
  if (!timestamp) return null;
  return dateKeyInTimezone(
    new Date(
      `${timestamp[1]}-${timestamp[2]}-${timestamp[3]}T${timestamp[4]}:${timestamp[5]}:${timestamp[6]}.000Z`,
    ),
    timezone,
  );
};

const occurrenceFromDate = (
  event: CalendarEventResponse,
  date: string,
  index: number,
): CalendarOccurrence => {
  if (event.isAllDay) {
    const duration = Math.max(
      1,
      differenceInDays(event.startDate!, event.endDate!),
    );
    return {
      key: `${event.uid}:${index}`,
      event,
      startsAt: null,
      endsAt: null,
      startDate: date,
      endDate: addDays(date, duration),
      dateKey: date,
      recurring: Boolean(event.recurrenceRule),
    };
  }

  const startInput = toDateTimeInput(event.startsAt!, event.timezone);
  const startsAt = dateTimeInputToIso(
    `${date}${startInput.slice(10)}`,
    event.timezone,
  );
  const duration =
    new Date(event.endsAt!).valueOf() - new Date(event.startsAt!).valueOf();
  return {
    key: `${event.uid}:${index}`,
    event,
    startsAt,
    endsAt: new Date(new Date(startsAt).valueOf() + duration).toISOString(),
    startDate: null,
    endDate: null,
    dateKey: date,
    recurring: Boolean(event.recurrenceRule),
  };
};

const eventStartDate = (
  event: CalendarEventResponse,
  displayTimezone: string,
): string =>
  event.isAllDay
    ? event.startDate!
    : dateKeyInTimezone(new Date(event.startsAt!), displayTimezone);

export const occurrencesInRange = (
  events: CalendarEventResponse[],
  range: DateRange,
  displayTimezone: string,
): CalendarOccurrence[] => {
  const occurrences: CalendarOccurrence[] = [];

  for (const event of events) {
    const start = eventStartDate(event, displayTimezone);
    if (!event.recurrenceRule) {
      if (start >= range.start && start < range.end) {
        occurrences.push(occurrenceFromDate(event, start, 0));
      }
      continue;
    }

    const rule = parseRule(event.recurrenceRule);
    const count = Math.min(
      10_000,
      Number(rule.get("COUNT") ?? "10000") || 10_000,
    );
    const until = untilDate(rule.get("UNTIL"), event.timezone);
    let occurrenceIndex = 0;
    const scanEnd = until && until < range.end ? addDays(until, 1) : range.end;
    for (
      let candidate = start;
      candidate < scanEnd && occurrenceIndex < count;
      candidate = addDays(candidate, 1)
    ) {
      if (!isRuleDate(candidate, start, rule)) continue;
      if (candidate >= range.start) {
        occurrences.push(occurrenceFromDate(event, candidate, occurrenceIndex));
      }
      occurrenceIndex += 1;
    }
  }

  return occurrences.sort((left, right) => {
    const leftValue = left.startsAt ?? `${left.startDate}T00:00:00.000Z`;
    const rightValue = right.startsAt ?? `${right.startDate}T00:00:00.000Z`;
    return leftValue.localeCompare(rightValue);
  });
};

export const formatPeriodTitle = (
  view: CalendarView,
  range: DateRange,
  timezone: string,
): string => {
  const date = (value: string) => dateFromKey(value);
  if (view === "day") {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "full",
      timeZone: "UTC",
    }).format(date(range.start));
  }
  if (view === "month") {
    return new Intl.DateTimeFormat("de-DE", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(date(range.start));
  }
  const end = addDays(range.end, -1);
  const formatter = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const label = view === "agenda" ? "Nächste 30 Tage" : "Woche";
  return `${label} · ${formatter.format(date(range.start))} – ${formatter.format(date(end))} · ${timezone}`;
};

export const formatOccurrenceTime = (
  occurrence: CalendarOccurrence,
): string => {
  if (!occurrence.startsAt || !occurrence.endsAt) return "Ganztägig";
  const formatter = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: occurrence.event.timezone,
  });
  return `${formatter.format(new Date(occurrence.startsAt))}–${formatter.format(new Date(occurrence.endsAt))}`;
};
