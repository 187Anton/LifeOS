export interface DateRange {
  from: string;
  to: string;
}

export const addPlanningDays = (date: string, amount: number): string => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
};

export const eachPlanningDate = (range: DateRange): string[] => {
  const values: string[] = [];
  for (let date = range.from; date <= range.to; date = addPlanningDays(date, 1))
    values.push(date);
  return values;
};

export const todayInTimezone = (timezone: string, now = new Date()): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

export const weekRange = (
  timezone: string,
  weekStartsOn: number,
  now = new Date(),
): DateRange => {
  const today = todayInTimezone(timezone, now);
  const currentWeekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
  const offset = (currentWeekday - weekStartsOn + 7) % 7;
  const from = addPlanningDays(today, -offset);
  return { from, to: addPlanningDays(from, 6) };
};

export const shiftPlanningRange = (
  range: DateRange,
  amount: number,
): DateRange => ({
  from: addPlanningDays(range.from, amount),
  to: addPlanningDays(range.to, amount),
});
