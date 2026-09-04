import { config as loadEnvironment } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const postgresUrl = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) =>
      value.startsWith("postgresql://") || value.startsWith("postgres://"),
    "muss eine PostgreSQL-Verbindungs-URL sein",
  );

const sqliteUrl = z
  .string()
  .trim()
  .min(1)
  .refine((value) => value.startsWith("file:"), "muss mit file: beginnen")
  .refine((value) => {
    const filePath = decodeURIComponent(value.slice("file:".length));
    return path.isAbsolute(filePath);
  }, "muss einen absoluten SQLite-Dateipfad enthalten");

const webOrigin = z
  .string()
  .trim()
  .min(1)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        url.pathname === "/" &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  }, "muss ein reiner HTTP- oder HTTPS-Ursprung sein")
  .transform((value) => new URL(value).origin);

const environmentSchema = z.strictObject({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_HOST: z.string().trim().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65_535),
  DATABASE_URL: z.union([postgresUrl, sqliteUrl]),
  WEB_ORIGIN: webOrigin,
  WEB_DIST_PATH: z
    .string()
    .trim()
    .min(1)
    .optional()
    .refine(
      (value) => value === undefined || path.isAbsolute(value),
      "muss ein absoluter Verzeichnispfad sein",
    ),
  SQLITE_MIGRATIONS_PATH: z
    .string()
    .trim()
    .min(1)
    .optional()
    .refine(
      (value) => value === undefined || path.isAbsolute(value),
      "muss ein absoluter Verzeichnispfad sein",
    ),
  STORAGE_PATH: z
    .string()
    .trim()
    .min(1)
    .refine(path.isAbsolute, "muss ein absoluter Verzeichnispfad sein"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  SHUTDOWN_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(60_000)
    .default(10_000),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(24),
  INTEGRATION_SECRET_KEY: z
    .string()
    .trim()
    .refine(
      (value) =>
        /^[A-Za-z0-9+/]{43}=$/.test(value) &&
        Buffer.from(value, "base64").length === 32,
      "muss ein Base64-kodierter 32-Byte-Schlüssel sein",
    )
    .optional(),
});

export interface ApiConfig {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  databaseProvider: "postgresql" | "sqlite";
  databaseUrl: string;
  webOrigin: string;
  webDistPath?: string;
  sqliteMigrationsPath?: string;
  storagePath: string;
  logLevel: "debug" | "info" | "warn" | "error";
  shutdownTimeoutMs: number;
  sessionTtlHours: number;
  integrationSecretKey?: string;
}

export class ConfigurationError extends Error {
  constructor(readonly fields: string[]) {
    super(`Ungültige oder fehlende Konfiguration: ${fields.join(", ")}`);
    this.name = "ConfigurationError";
  }
}

export const loadLocalEnvironment = (): void => {
  const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
  loadEnvironment({
    path: path.resolve(sourceDirectory, "../../../.env"),
    quiet: true,
  });
};

export const useSecureCookies = (webOrigin: string): boolean =>
  new URL(webOrigin).protocol === "https:";

export const parseConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): ApiConfig => {
  const result = environmentSchema.safeParse({
    NODE_ENV: environment.NODE_ENV,
    API_HOST: environment.API_HOST,
    API_PORT: environment.API_PORT,
    DATABASE_URL: environment.DATABASE_URL,
    WEB_ORIGIN: environment.WEB_ORIGIN,
    WEB_DIST_PATH: environment.WEB_DIST_PATH,
    SQLITE_MIGRATIONS_PATH: environment.SQLITE_MIGRATIONS_PATH,
    STORAGE_PATH: environment.STORAGE_PATH,
    LOG_LEVEL: environment.LOG_LEVEL,
    SHUTDOWN_TIMEOUT_MS: environment.SHUTDOWN_TIMEOUT_MS,
    SESSION_TTL_HOURS: environment.SESSION_TTL_HOURS,
    INTEGRATION_SECRET_KEY: environment.INTEGRATION_SECRET_KEY,
  });

  if (!result.success) {
    const fields = [
      ...new Set(
        result.error.issues.map(
          (issue) => issue.path[0]?.toString() ?? "unbekannt",
        ),
      ),
    ].sort();
    throw new ConfigurationError(fields);
  }

  return {
    nodeEnv: result.data.NODE_ENV,
    host: result.data.API_HOST,
    port: result.data.API_PORT,
    databaseProvider: result.data.DATABASE_URL.startsWith("file:")
      ? "sqlite"
      : "postgresql",
    databaseUrl: result.data.DATABASE_URL,
    webOrigin: result.data.WEB_ORIGIN,
    ...(result.data.WEB_DIST_PATH
      ? { webDistPath: result.data.WEB_DIST_PATH }
      : {}),
    ...(result.data.SQLITE_MIGRATIONS_PATH
      ? { sqliteMigrationsPath: result.data.SQLITE_MIGRATIONS_PATH }
      : {}),
    storagePath: result.data.STORAGE_PATH,
    logLevel: result.data.LOG_LEVEL,
    shutdownTimeoutMs: result.data.SHUTDOWN_TIMEOUT_MS,
    sessionTtlHours: result.data.SESSION_TTL_HOURS,
    ...(result.data.INTEGRATION_SECRET_KEY
      ? { integrationSecretKey: result.data.INTEGRATION_SECRET_KEY }
      : {}),
  };
};
