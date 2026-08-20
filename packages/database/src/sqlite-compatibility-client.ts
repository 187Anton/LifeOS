import type { PrismaClient as PostgresPrismaClient } from "./generated/prisma/client.js";
import type { PrismaClient as SqlitePrismaClient } from "./generated/sqlite/client.js";

const dateOnlyFields = new Set([
  "startDate",
  "endDate",
  "dueDate",
  "startsOn",
  "endsOn",
  "deadlineDate",
]);
const delegateNames = new Set([
  "user",
  "userSettings",
  "userCredential",
  "userSession",
  "calDavCredential",
  "calendar",
  "calendarEvent",
  "project",
  "projectGoal",
  "projectMilestone",
  "projectEventLink",
  "note",
  "noteVersion",
  "document",
  "task",
  "taskEventLink",
  "studyProgram",
  "studyModule",
  "studyEntry",
  "workContext",
  "workProject",
  "workTaskLink",
  "workTimeEntry",
  "availabilityWindow",
  "auditEvent",
]);
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);

const transformInput = (value: unknown, field?: string): unknown => {
  if (value instanceof Date) {
    return field && dateOnlyFields.has(field)
      ? value.toISOString().slice(0, 10)
      : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => transformInput(entry, field));
  }
  if (!isPlainObject(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      transformInput(entry, dateOnlyFields.has(key) ? key : field),
    ]),
  );
};

const transformOutput = (value: unknown, field?: string): unknown => {
  if (
    typeof value === "string" &&
    field &&
    dateOnlyFields.has(field) &&
    dateOnlyPattern.test(value)
  ) {
    return new Date(`${value}T00:00:00.000Z`);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => transformOutput(entry, field));
  }
  if (!isPlainObject(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      transformOutput(entry, key),
    ]),
  );
};

type UnknownFunction = (...arguments_: unknown[]) => unknown;
type UnknownObject = Record<PropertyKey, unknown>;

const delegateCache = new WeakMap<object, UnknownObject>();
const clientCache = new WeakMap<object, PostgresPrismaClient>();

const wrapDelegate = (delegate: UnknownObject): UnknownObject => {
  const cached = delegateCache.get(delegate);
  if (cached) return cached;

  const proxy = new Proxy(delegate, {
    get(target, property) {
      const value = Reflect.get(target, property);
      if (typeof value !== "function") return value;

      return (...arguments_: unknown[]) =>
        Promise.resolve(
          (value as UnknownFunction).apply(
            target,
            arguments_.map((argument) => transformInput(argument)),
          ),
        ).then((result) => transformOutput(result));
    },
  });
  delegateCache.set(delegate, proxy);
  return proxy;
};

const wrapClient = (client: object): PostgresPrismaClient => {
  const cached = clientCache.get(client);
  if (cached) return cached;
  const rawClient = client as SqlitePrismaClient;

  const proxy = new Proxy(rawClient as unknown as UnknownObject, {
    get(target, property) {
      const value = Reflect.get(target, property);

      if (typeof property === "string" && delegateNames.has(property)) {
        return wrapDelegate(value as UnknownObject);
      }

      if (property === "$transaction") {
        return async (
          operation: (transaction: PostgresPrismaClient) => Promise<unknown>,
          options?: unknown,
        ) => {
          if (typeof operation !== "function") {
            throw new Error(
              "SQLite unterstützt in LifeOS nur interaktive Transaktionen; verwende eine Callback-Transaktion.",
            );
          }
          return rawClient.$transaction(
            (transaction) => operation(wrapClient(transaction)),
            options as never,
          );
        };
      }

      return typeof value === "function"
        ? (value as UnknownFunction).bind(target)
        : value;
    },
  }) as unknown as PostgresPrismaClient;
  clientCache.set(client, proxy);
  return proxy;
};

export const createSqliteCompatibilityClient = (
  client: SqlitePrismaClient,
): PostgresPrismaClient => wrapClient(client);
