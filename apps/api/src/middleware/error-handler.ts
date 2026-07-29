import {
  ERROR_CONTRACT_VERSION,
  type ApiErrorResponse,
} from "@lifeos/contracts";
import type { ErrorRequestHandler, RequestHandler } from "express";

import { ApiError } from "../errors.js";
import type { Logger } from "../logger.js";

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(ApiError.notFound());
};

export const errorHandler =
  (logger: Logger): ErrorRequestHandler =>
  (error: unknown, _request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    const requestId = String(response.locals.requestId ?? "unknown");
    let apiError: ApiError;

    if (error instanceof ApiError) {
      apiError = error;
    } else if (
      error instanceof SyntaxError &&
      "status" in error &&
      error.status === 400
    ) {
      apiError = new ApiError(
        400,
        "INVALID_JSON",
        "Der Anfragekörper enthält kein gültiges JSON.",
      );
    } else {
      const errorName = error instanceof Error ? error.name : "UnknownError";
      logger.error("http.request.failed", { requestId, errorName });
      apiError = new ApiError(
        500,
        "INTERNAL_ERROR",
        "Die Anfrage konnte unerwartet nicht verarbeitet werden.",
      );
    }

    const payload: ApiErrorResponse = {
      error: {
        version: ERROR_CONTRACT_VERSION,
        code: apiError.code,
        message: apiError.message,
        requestId,
        ...(apiError.details ? { details: apiError.details } : {}),
      },
    };

    response.status(apiError.status).json(payload);
  };
