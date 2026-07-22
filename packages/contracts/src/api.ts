export const API_VERSION = "v1" as const;
export const ERROR_CONTRACT_VERSION = "1" as const;

export type ApiErrorCode =
  | "INVALID_JSON"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "SERVICE_NOT_READY"
  | "INTERNAL_ERROR";

export interface ApiErrorDetail {
  field: string;
  message: string;
}

export interface ApiErrorResponse {
  error: {
    version: typeof ERROR_CONTRACT_VERSION;
    code: ApiErrorCode;
    message: string;
    requestId: string;
    details?: ApiErrorDetail[];
  };
}

export interface HealthResponse {
  apiVersion: typeof API_VERSION;
  status: "ok";
}

export interface ReadinessResponse {
  apiVersion: typeof API_VERSION;
  status: "ready";
  checks: {
    database: "up";
  };
}
