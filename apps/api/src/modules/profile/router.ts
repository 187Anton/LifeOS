import type { SessionResponse, UpdateSettingsRequest } from "@lifeos/contracts";
import { Router, type RequestHandler } from "express";
import { z } from "zod";

import { validateRequest } from "../../middleware/validate-request.js";
import type { AuthenticationService, ProfileService } from "./service.js";

const SESSION_COOKIE = "lifeos_session";

const loginSchema = z.strictObject({
  password: z.string().min(1).max(1024),
});

const isSupportedTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat("de-DE", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
};

const supportedCurrencies = new Set(Intl.supportedValuesOf("currency"));
const settingsSchema = z
  .strictObject({
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .refine(isSupportedTimeZone)
      .optional(),
    locale: z.enum(["de-DE", "en-US"]).optional(),
    currencyCode: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .refine((value) => supportedCurrencies.has(value))
      .optional(),
    weekStartsOn: z.number().int().min(0).max(6).optional(),
    defaultCalendarView: z.enum(["day", "week", "month"]).optional(),
    showWeekends: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

const readCookie = (
  cookieHeader: string | undefined,
  name: string,
): string | undefined => {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
};

const sessionCookie = (
  token: string,
  expiresAt: Date,
  secure: boolean,
): string => {
  const attributes = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
};

const clearSessionCookie = (secure: boolean): string =>
  sessionCookie("", new Date(0), secure);

export const createProfileRouter = ({
  authentication,
  profile,
  secureCookies,
}: {
  authentication: AuthenticationService;
  profile: ProfileService;
  secureCookies: boolean;
}): Router => {
  const router = Router();
  const requireAuthentication: RequestHandler = async (
    request,
    response,
    next,
  ) => {
    response.locals.userId = await authentication.authenticate(
      readCookie(request.headers.cookie, SESSION_COOKIE),
    );
    next();
  };

  router.post(
    "/session",
    validateRequest({ body: loginSchema }),
    async (_request, response) => {
      const body = response.locals.validated.body as { password: string };
      const session = await authentication.login(body.password);
      response.setHeader(
        "Set-Cookie",
        sessionCookie(session.token, session.expiresAt, secureCookies),
      );
      const payload: SessionResponse = {
        status: "authenticated",
        expiresAt: session.expiresAt.toISOString(),
      };
      response.status(201).json(payload);
    },
  );

  router.delete(
    "/session",
    requireAuthentication,
    async (request, response) => {
      const token = readCookie(request.headers.cookie, SESSION_COOKIE);
      if (token) await authentication.logout(token);
      response.setHeader("Set-Cookie", clearSessionCookie(secureCookies));
      response.status(204).end();
    },
  );

  router.get("/profile", requireAuthentication, async (_request, response) => {
    response.json(await profile.getProfile(String(response.locals.userId)));
  });

  router.patch(
    "/settings",
    requireAuthentication,
    validateRequest({ body: settingsSchema }),
    async (_request, response) => {
      const changes = response.locals.validated.body as UpdateSettingsRequest;
      response.json(
        await profile.updateSettings(String(response.locals.userId), changes),
      );
    },
  );

  return router;
};
