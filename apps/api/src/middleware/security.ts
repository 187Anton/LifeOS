import type { RequestHandler } from "express";

import { ApiError } from "../errors.js";

const stateChangingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const securityHeaders: RequestHandler = (request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );

  if (
    request.path === "/api" ||
    request.path.startsWith("/api/") ||
    request.path === "/caldav" ||
    request.path.startsWith("/caldav/")
  ) {
    response.setHeader("Cache-Control", "private, no-store");
  }

  next();
};

export const requireTrustedBrowserOrigin = (
  trustedOrigin: string,
): RequestHandler => {
  const normalizedTrustedOrigin = new URL(trustedOrigin).origin;

  return (request, _response, next) => {
    const origin = request.headers.origin;
    if (
      stateChangingMethods.has(request.method) &&
      origin !== undefined &&
      origin !== normalizedTrustedOrigin
    ) {
      next(
        new ApiError(
          403,
          "FORBIDDEN",
          "Der Ursprung der Browseranfrage ist nicht erlaubt.",
        ),
      );
      return;
    }
    next();
  };
};
