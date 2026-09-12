import type { CalendarEventModel } from "@lifeos/database";

import { addDays, dateInTimezone, zonedDateTime } from "./time.js";

const MAX_OCCURRENCES_PER_EVENT = 500;
const MAX_SCANNED_DAYS_PER_EVENT = 10_000;
const weekdayCodes = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

export interface PlanningCalendarOccurrence {
  event: CalendarEventModel;
  key: string;
  date: string;
  startsAt: Date | null;
  endsAt: Date | null;
  startDate: string | null;
  endDate: string | null;
}

export interface CalendarExpansionResult {
  occurrences: PlanningCalendarOccurrence[];
  issueCodes: string[];
}

const parseRule = (rule: string) =>
  new Map(
    rule.split(";").flatMap((part) => {
      const separator = part.indexOf("=");
      return separator > 0
        ? [[part.slice(0, separator).toUpperCase(), part.slice(separator + 1)]]
        : [];
    }),
  );

const isSupportedRule = (rule: Map<string, string>, timezone: string) => {
  const frequency = rule.get("FREQ");
  const allowed = new Set(["FREQ", "INTERVAL", "COUNT", "UNTIL"]);
  if (frequency === "WEEKLY") allowed.add("BYDAY");
  if (frequency === "MONTHLY") allowed.add("BYMONTHDAY");
  if ([...rule.keys()].some((key) => !allowed.has(key))) return false;
  if (rule.has("COUNT") && rule.has("UNTIL")) return false;
  for (const name of ["INTERVAL", "COUNT"] as const) {
    const value = rule.get(name);
    if (value !== undefined && !/^\d+$/.test(value)) return false;
    if (value !== undefined && Number(value) < 1) return false;
  }
  const byDay = rule.get("BYDAY");
  if (
    byDay !== undefined &&
    !byDay.split(",").every((value) => weekdayCodes.includes(value))
  )
    return false;
  const byMonthDay = rule.get("BYMONTHDAY");
  if (
    byMonthDay !== undefined &&
    (!/^\d+$/.test(byMonthDay) ||
      Number(byMonthDay) < 1 ||
      Number(byMonthDay) > 31)
  )
    return false;
  return !rule.has("UNTIL") || untilDate(rule.get("UNTIL"), timezone) !== null;
};

const dateFromKey = (date: string) => new Date(`${date}T12:00:00.000Z`);
const daysBetween = (start: string, end: string) =>
  Math.round(
    (dateFromKey(end).getTime() - dateFromKey(start).getTime()) / 86_400_000,
  );

const isRuleDate = (
  candidate: string,
  start: string,
  rule: Map<string, string>,
) => {
  const frequency = rule.get("FREQ");
  const interval = Math.max(1, Number(rule.get("INTERVAL") ?? "1") || 1);
  const difference = daysBetween(start, candidate);
  if (difference < 0) return false;
  if (frequency === "DAILY") return difference % interval === 0;
  if (frequency === "WEEKLY") {
    const allowed = (
      rule.get("BYDAY") ?? weekdayCodes[dateFromKey(start).getUTCDay()]!
    )
      .split(",")
      .map((value) => value.slice(-2));
    return (
      Math.floor(difference / 7) % interval === 0 &&
      allowed.includes(weekdayCodes[dateFromKey(candidate).getUTCDay()]!)
    );
  }
  if (frequency === "MONTHLY") {
    const initial = dateFromKey(start);
    const value = dateFromKey(candidate);
    const months =
      (value.getUTCFullYear() - initial.getUTCFullYear()) * 12 +
      value.getUTCMonth() -
      initial.getUTCMonth();
    return (
      months >= 0 &&
      months % interval === 0 &&
      value.getUTCDate() ===
        Number(rule.get("BYMONTHDAY") ?? initial.getUTCDate())
    );
  }
  if (frequency === "YEARLY") {
    const initial = dateFromKey(start);
    const value = dateFromKey(candidate);
    return (
      (value.getUTCFullYear() - initial.getUTCFullYear()) % interval === 0 &&
      value.getUTCMonth() === initial.getUTCMonth() &&
      value.getUTCDate() === initial.getUTCDate()
    );
  }
  return false;
};

const untilDate = (value: string | undefined, timezone: string) => {
  if (!value) return null;
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (dateOnly) return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;
  const timestamp = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(
    value,
  );
  if (!timestamp) return null;
  return dateInTimezone(
    new Date(
      `${timestamp[1]}-${timestamp[2]}-${timestamp[3]}T${timestamp[4]}:${timestamp[5]}:${timestamp[6]}.000Z`,
    ),
    timezone,
  );
};

const minuteInTimezone = (value: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (name: "hour" | "minute") =>
    Number(parts.find((entry) => entry.type === name)?.value ?? "0");
  return part("hour") * 60 + part("minute");
};

const occurrence = (
  event: CalendarEventModel,
  date: string,
  index: number,
  displayTimezone: string,
): PlanningCalendarOccurrence => {
  if (event.isAllDay) {
    const durationDays = Math.max(
      1,
      daysBetween(
        event.startDate!.toISOString().slice(0, 10),
        event.endDate!.toISOString().slice(0, 10),
      ),
    );
    return {
      event,
      key: `${event.id}:${index}:${date}`,
      date,
      startsAt: null,
      endsAt: null,
      startDate: date,
      endDate: addDays(date, durationDays),
    };
  }
  const startsAt = zonedDateTime(
    date,
    minuteInTimezone(event.startsAt!, event.timezone),
    event.timezone,
  );
  const endsAt = new Date(
    startsAt.getTime() + event.endsAt!.getTime() - event.startsAt!.getTime(),
  );
  return {
    event,
    key: `${event.id}:${index}:${startsAt.toISOString()}`,
    date: dateInTimezone(startsAt, displayTimezone),
    startsAt,
    endsAt,
    startDate: null,
    endDate: null,
  };
};

export const expandCalendarEvents = (
  events: CalendarEventModel[],
  from: string,
  to: string,
  displayTimezone: string,
): CalendarExpansionResult => {
  const occurrences: PlanningCalendarOccurrence[] = [];
  const issueCodes = new Set<string>();
  for (const event of events) {
    const start = event.isAllDay
      ? event.startDate?.toISOString().slice(0, 10)
      : event.startsAt
        ? dateInTimezone(event.startsAt, event.timezone)
        : null;
    if (!start) continue;
    if (!event.recurrenceRule) {
      const value: PlanningCalendarOccurrence = event.isAllDay
        ? {
            event,
            key: `${event.id}:0:${start}`,
            date: start,
            startsAt: null,
            endsAt: null,
            startDate: start,
            endDate: event.endDate!.toISOString().slice(0, 10),
          }
        : {
            event,
            key: `${event.id}:0:${event.startsAt!.toISOString()}`,
            date: dateInTimezone(event.startsAt!, displayTimezone),
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            startDate: null,
            endDate: null,
          };
      const overlaps = value.startDate
        ? value.startDate <= to && value.endDate! > from
        : value.startsAt! < zonedDateTime(addDays(to, 1), 0, displayTimezone) &&
          value.endsAt! > zonedDateTime(from, 0, displayTimezone);
      if (overlaps) occurrences.push(value);
      continue;
    }

    const rule = parseRule(event.recurrenceRule);
    if (
      !new Set(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]).has(
        rule.get("FREQ") ?? "",
      ) ||
      !isSupportedRule(rule, event.timezone)
    ) {
      issueCodes.add("unsupported_recurrence");
      continue;
    }
    const hasDeclaredCount = rule.has("COUNT");
    const declaredCount = Math.max(
      1,
      Number(rule.get("COUNT") ?? MAX_OCCURRENCES_PER_EVENT) ||
        MAX_OCCURRENCES_PER_EVENT,
    );
    const countLimit = Math.min(declaredCount, MAX_OCCURRENCES_PER_EVENT);
    const until = untilDate(rule.get("UNTIL"), event.timezone);
    let found = 0;
    let scanned = 0;
    for (
      let candidate = start;
      candidate <= to && found < countLimit;
      candidate = addDays(candidate, 1)
    ) {
      scanned += 1;
      if (scanned > MAX_SCANNED_DAYS_PER_EVENT) {
        issueCodes.add("recurrence_limit");
        break;
      }
      if (until && candidate > until) break;
      if (!isRuleDate(candidate, start, rule)) continue;
      if (candidate >= from)
        occurrences.push(occurrence(event, candidate, found, displayTimezone));
      found += 1;
    }
    if (
      found >= countLimit &&
      (declaredCount > MAX_OCCURRENCES_PER_EVENT || !hasDeclaredCount)
    )
      issueCodes.add("recurrence_limit");
  }
  return {
    occurrences: occurrences.sort((left, right) =>
      (
        left.startsAt?.toISOString() ?? `${left.startDate}T00:00:00.000Z`
      ).localeCompare(
        right.startsAt?.toISOString() ?? `${right.startDate}T00:00:00.000Z`,
      ),
    ),
    issueCodes: [...issueCodes],
  };
};
