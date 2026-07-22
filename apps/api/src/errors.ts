import type { ApiErrorCode, ApiErrorDetail } from "@lifeos/contracts";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: ApiErrorDetail[],
  ) {
    super(message);
    this.name = "ApiError";
  }

  static notFound(): ApiError {
    return new ApiError(
      404,
      "NOT_FOUND",
      "Die angeforderte API-Route existiert nicht.",
    );
  }

  static validation(details: ApiErrorDetail[]): ApiError {
    return new ApiError(
      400,
      "VALIDATION_ERROR",
      "Die Anfrage enthält ungültige Eingaben.",
      details,
    );
  }
}
