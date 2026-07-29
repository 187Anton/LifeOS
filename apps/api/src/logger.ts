import type { Writable } from "node:stream";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

const priorities: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const sensitiveKey = /authorization|cookie|password|secret|token|body|payload/i;

const sanitize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !sensitiveKey.test(key))
        .map(([key, nestedValue]) => [key, sanitize(nestedValue)]),
    );
  }

  return value;
};

export class JsonLogger implements Logger {
  constructor(
    private readonly minimumLevel: LogLevel = "info",
    private readonly output: Writable = process.stdout,
  ) {}

  debug(event: string, fields: LogFields = {}): void {
    this.write("debug", event, fields);
  }

  info(event: string, fields: LogFields = {}): void {
    this.write("info", event, fields);
  }

  warn(event: string, fields: LogFields = {}): void {
    this.write("warn", event, fields);
  }

  error(event: string, fields: LogFields = {}): void {
    this.write("error", event, fields);
  }

  private write(level: LogLevel, event: string, fields: LogFields): void {
    if (priorities[level] < priorities[this.minimumLevel]) {
      return;
    }

    const sanitizedFields = sanitize(fields) as LogFields;

    this.output.write(
      `${JSON.stringify({
        ...sanitizedFields,
        timestamp: new Date().toISOString(),
        level,
        service: "lifeos-api",
        event,
      })}\n`,
    );
  }
}
