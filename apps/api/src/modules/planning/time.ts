const partsFor = (value: Date, timezone: string) => {
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
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value ?? "0");
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
    second: part("second"),
  };
};

export const addDays = (date: string, amount: number): string => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
};

export const eachDate = (from: string, to: string): string[] => {
  const dates: string[] = [];
  for (let current = from; current <= to; current = addDays(current, 1)) {
    dates.push(current);
  }
  return dates;
};

export const dateInTimezone = (value: Date, timezone: string): string => {
  const parts = partsFor(value, timezone);
  return `${parts.year.toString().padStart(4, "0")}-${parts.month
    .toString()
    .padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
};

export const weekday = (date: string): number =>
  new Date(`${date}T00:00:00.000Z`).getUTCDay();

export const zonedDateTime = (
  date: string,
  minuteOfDay: number,
  timezone: string,
): Date => {
  const normalizedDate = minuteOfDay === 1440 ? addDays(date, 1) : date;
  const normalizedMinutes = minuteOfDay === 1440 ? 0 : minuteOfDay;
  const [year, month, day] = normalizedDate.split("-").map(Number);
  const hour = Math.floor(normalizedMinutes / 60);
  const minute = normalizedMinutes % 60;
  const desired = Date.UTC(year!, month! - 1, day!, hour, minute, 0);
  let guess = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = partsFor(new Date(guess), timezone);
    const represented = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    guess += desired - represented;
  }
  return new Date(guess);
};

export const dayRange = (from: string, to: string, timezone: string) => ({
  from: zonedDateTime(from, 0, timezone),
  toExclusive: zonedDateTime(addDays(to, 1), 0, timezone),
});
