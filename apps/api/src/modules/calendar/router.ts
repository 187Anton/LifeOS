import { Router } from "express";
import { z } from "zod";

import { ApiError } from "../../errors.js";
import { validateRequest } from "../../middleware/validate-request.js";
import { createRequireAuthentication } from "../profile/router.js";
import type { AuthenticationService } from "../profile/service.js";
import type { CalendarService, EventInput } from "./service.js";

const timezone = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("de-DE", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  });
const stableCalendarId = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._~-]+$/);
const calendarIdParams = z.strictObject({ calendarId: stableCalendarId });
const eventParams = z.strictObject({
  calendarId: stableCalendarId,
  uid: z.string().min(1).max(255),
});
const calendarCreate = z.strictObject({
  name: z.string().trim().min(1).max(200),
  timezone,
  isPrimary: z.boolean().optional(),
});
const calendarUpdate = z
  .strictObject({
    name: z.string().trim().min(1).max(200).optional(),
    timezone: timezone.optional(),
    isPrimary: z.literal(true).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
const commonEvent = {
  title: z.string().trim().min(1).max(500),
  description: z.string().max(10_000).nullable().optional(),
  location: z.string().max(500).nullable().optional(),
  timezone,
  recurrenceRule: z
    .string()
    .trim()
    .min(1)
    .max(2048)
    .regex(/^FREQ=[^\r\n]+$/)
    .nullable()
    .optional(),
  reminderMinutes: z
    .array(z.number().int().min(0).max(10_080))
    .max(10)
    .optional(),
  uid: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[^\r\n]+$/)
    .optional(),
};
const eventInput = z.discriminatedUnion("isAllDay", [
  z.strictObject({
    ...commonEvent,
    isAllDay: z.literal(false),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
  }),
  z.strictObject({
    ...commonEvent,
    isAllDay: z.literal(true),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
  }),
]);

const requireEtag = (header: string | undefined): string => {
  if (!header) {
    throw new ApiError(
      428,
      "PRECONDITION_REQUIRED",
      "Für Änderungen ist der aktuelle If-Match-ETag erforderlich.",
    );
  }
  return header;
};

export const createCalendarRouter = ({
  authentication,
  calendars,
}: {
  authentication: AuthenticationService;
  calendars: CalendarService;
}): Router => {
  const router = Router();
  router.use(createRequireAuthentication(authentication));

  router.get("/calendars", async (_request, response) => {
    response.json(
      await calendars.listCalendars(String(response.locals.userId)),
    );
  });
  router.post(
    "/calendars",
    validateRequest({ body: calendarCreate }),
    async (_request, response) => {
      response
        .status(201)
        .json(
          await calendars.createCalendar(
            String(response.locals.userId),
            response.locals.validated.body,
          ),
        );
    },
  );
  router.patch(
    "/calendars/:calendarId",
    validateRequest({ params: calendarIdParams, body: calendarUpdate }),
    async (_request, response) => {
      const { calendarId } = response.locals.validated.params;
      response.json(
        await calendars.updateCalendar(
          String(response.locals.userId),
          calendarId,
          response.locals.validated.body,
        ),
      );
    },
  );
  router.delete(
    "/calendars/:calendarId",
    validateRequest({ params: calendarIdParams }),
    async (_request, response) => {
      await calendars.deleteCalendar(
        String(response.locals.userId),
        response.locals.validated.params.calendarId,
      );
      response.status(204).end();
    },
  );
  router.get(
    "/calendars/:calendarId/events",
    validateRequest({ params: calendarIdParams }),
    async (_request, response) => {
      response.json(
        await calendars.listEvents(
          String(response.locals.userId),
          response.locals.validated.params.calendarId,
        ),
      );
    },
  );
  router.post(
    "/calendars/:calendarId/events",
    validateRequest({ params: calendarIdParams, body: eventInput }),
    async (_request, response) => {
      const event = await calendars.createEvent(
        String(response.locals.userId),
        response.locals.validated.params.calendarId,
        response.locals.validated.body as EventInput,
      );
      response.setHeader("ETag", event.etag).status(201).json(event);
    },
  );
  router.get(
    "/calendars/:calendarId/events/:uid",
    validateRequest({ params: eventParams }),
    async (_request, response) => {
      const { calendarId, uid } = response.locals.validated.params;
      const event = await calendars.getEvent(
        String(response.locals.userId),
        calendarId,
        uid,
      );
      response.setHeader("ETag", event.etag).json(event);
    },
  );
  router.put(
    "/calendars/:calendarId/events/:uid",
    validateRequest({ params: eventParams, body: eventInput }),
    async (request, response) => {
      const { calendarId, uid } = response.locals.validated.params;
      const event = await calendars.replaceEvent(
        String(response.locals.userId),
        calendarId,
        uid,
        requireEtag(request.headers["if-match"]),
        response.locals.validated.body as EventInput,
      );
      response.setHeader("ETag", event.etag).json(event);
    },
  );
  router.delete(
    "/calendars/:calendarId/events/:uid",
    validateRequest({ params: eventParams }),
    async (request, response) => {
      const { calendarId, uid } = response.locals.validated.params;
      await calendars.deleteEvent(
        String(response.locals.userId),
        calendarId,
        uid,
        requireEtag(request.headers["if-match"]),
      );
      response.status(204).end();
    },
  );

  return router;
};
