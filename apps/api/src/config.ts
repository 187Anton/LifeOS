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

const environmentSchema = z.strictObject({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_HOST: z.string().trim().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65_535),
  DATABASE_URL: postgresUrl,
  WEB_ORIGIN: z.url(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  SHUTDOWN_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(60_000)
    .default(10_000),
});

export interface ApiConfig {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  databaseUrl: string;
  webOrigin: string;
  logLevel: "debug" | "info" | "warn" | "error";
  shutdownTimeoutMs: number;
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

export const parseConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): ApiConfig => {
  const result = environmentSchema.safeParse({
    NODE_ENV: environment.NODE_ENV,
    API_HOST: environment.API_HOST,
    API_PORT: environment.API_PORT,
    DATABASE_URL: environment.DATABASE_URL,
    WEB_ORIGIN: environment.WEB_ORIGIN,
    LOG_LEVEL: environment.LOG_LEVEL,
    SHUTDOWN_TIMEOUT_MS: environment.SHUTDOWN_TIMEOUT_MS,
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
    databaseUrl: result.data.DATABASE_URL,
    webOrigin: result.data.WEB_ORIGIN,
    logLevel: result.data.LOG_LEVEL,
    shutdownTimeoutMs: result.data.SHUTDOWN_TIMEOUT_MS,
  };
};
