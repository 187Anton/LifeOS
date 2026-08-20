import { createHash, randomUUID } from "node:crypto";

import type {
  CalendarEventResponse,
  IcsImportCommitResponse,
  IcsImportPreviewItemResponse,
  IcsImportPreviewResponse,
} from "@lifeos/contracts";

import { ApiError } from "../../errors.js";
import { CalDavError } from "../caldav/errors.js";
import {
  parseCalendarEvents,
  serializeCalendarEvents,
} from "../caldav/icalendar.js";
import type { CalendarService, EventInput } from "../calendar/service.js";

const MAX_ICS_BYTES = 2 * 1024 * 1024;
const MAX_EVENTS = 500;
const MAX_PREVIEWS = 100;
const PREVIEW_TTL_MS = 15 * 60 * 1_000;

interface PendingEvent {
  item: IcsImportPreviewItemResponse;
  input: EventInput | null;
}
interface PendingPreview {
  userId: string;
  calendarId: string;
  expiresAt: Date;
  events: PendingEvent[];
}

const comparableInput = (input: EventInput) => ({
  uid: input.uid,
  title: input.title,
  description: input.description ?? null,
  location: input.location ?? null,
  timezone: input.timezone,
  isAllDay: input.isAllDay,
  startsAt: input.isAllDay ? null : input.startsAt,
  endsAt: input.isAllDay ? null : input.endsAt,
  startDate: input.isAllDay ? input.startDate : null,
  endDate: input.isAllDay ? input.endDate : null,
  recurrenceRule: input.recurrenceRule ?? null,
  reminderMinutes: [...new Set(input.reminderMinutes ?? [])].sort(
    (left, right) => left - right,
  ),
});
const comparableEvent = (event: CalendarEventResponse) => ({
  uid: event.uid,
  title: event.title,
  description: event.description,
  location: event.location,
  timezone: event.timezone,
  isAllDay: event.isAllDay,
  startsAt: event.startsAt,
  endsAt: event.endsAt,
  startDate: event.startDate,
  endDate: event.endDate,
  recurrenceRule: event.recurrenceRule,
  reminderMinutes: [...event.reminderMinutes].sort(
    (left, right) => left - right,
  ),
});

export class IcsImportService {
  private readonly previews = new Map<string, PendingPreview>();

  constructor(
    private readonly calendars: CalendarService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async exportCalendar(userId: string, calendarId: string) {
    const events = await this.calendars.listEvents(userId, calendarId);
    return serializeCalendarEvents(events);
  }

  async preview(
    userId: string,
    calendarId: string,
    source: string,
  ): Promise<IcsImportPreviewResponse> {
    if (!source || Buffer.byteLength(source, "utf8") > MAX_ICS_BYTES)
      throw new ApiError(
        413,
        "VALIDATION_ERROR",
        "Die iCalendar-Datei muss UTF-8-Text enthalten und darf höchstens 2 MiB groß sein.",
      );
    const calendars = await this.calendars.listCalendars(userId);
    const calendar = calendars.find((value) => value.id === calendarId);
    if (!calendar)
      throw new ApiError(
        404,
        "NOT_FOUND",
        "Der Kalender wurde nicht gefunden.",
      );
    let parsed: ReturnType<typeof parseCalendarEvents>;
    try {
      parsed = parseCalendarEvents(source, calendar.timezone, MAX_EVENTS);
    } catch (error) {
      if (error instanceof CalDavError)
        throw new ApiError(error.status, "VALIDATION_ERROR", error.message);
      throw error;
    }
    const existing = await this.calendars.listEvents(userId, calendarId);
    const existingByUid = new Map(existing.map((event) => [event.uid, event]));
    const uidCounts = new Map<string, number>();
    for (const event of parsed) {
      if (event.uid)
        uidCounts.set(event.uid, (uidCounts.get(event.uid) ?? 0) + 1);
    }
    const allExistingUids = new Set(
      await this.calendars.listExistingEventUids(userId, calendarId, [
        ...uidCounts.keys(),
      ]),
    );
    const events: PendingEvent[] = parsed.map((event) => {
      const duplicate = event.uid && (uidCounts.get(event.uid) ?? 0) > 1;
      const recurrenceError = event.input
        ? this.validateRecurrence(event.input.recurrenceRule ?? null)
        : null;
      if (!event.input || event.error || duplicate || recurrenceError) {
        return {
          input: null,
          item: {
            index: event.index,
            uid: event.uid,
            title: event.title,
            action: "invalid",
            message: duplicate
              ? "Die UID kommt innerhalb der Datei mehrfach vor."
              : (recurrenceError ??
                event.error ??
                "Das Ereignis ist ungültig."),
            existingEtag: null,
          },
        };
      }
      const current = existingByUid.get(event.input.uid!);
      if (!current && allExistingUids.has(event.input.uid!)) {
        return {
          input: null,
          item: {
            index: event.index,
            uid: event.input.uid!,
            title: event.input.title,
            action: "conflict",
            message:
              "Die UID gehört zu einem gelöschten Ereignis und wird nicht erneut verwendet.",
            existingEtag: null,
          },
        };
      }
      if (!current) {
        return {
          input: event.input,
          item: {
            index: event.index,
            uid: event.input.uid!,
            title: event.input.title,
            action: "create",
            message: "Das Ereignis kann neu angelegt werden.",
            existingEtag: null,
          },
        };
      }
      const unchanged =
        JSON.stringify(comparableInput(event.input)) ===
        JSON.stringify(comparableEvent(current));
      return {
        input: unchanged ? event.input : null,
        item: {
          index: event.index,
          uid: event.input.uid!,
          title: event.input.title,
          action: unchanged ? "unchanged" : "conflict",
          message: unchanged
            ? "Die gleiche UID ist bereits mit identischem Inhalt vorhanden."
            : "Die UID ist bereits mit anderem Inhalt vorhanden und wird nicht überschrieben.",
          existingEtag: current.etag,
        },
      };
    });
    this.removeExpired();
    if (this.previews.size >= MAX_PREVIEWS) {
      const oldest = this.previews.keys().next().value as string | undefined;
      if (oldest) this.previews.delete(oldest);
    }
    const previewId = randomUUID();
    const expiresAt = new Date(this.now().valueOf() + PREVIEW_TTL_MS);
    this.previews.set(previewId, { userId, calendarId, expiresAt, events });
    const items = events.map(({ item }) => item);
    return {
      previewId,
      expiresAt: expiresAt.toISOString(),
      sourceSha256: createHash("sha256").update(source, "utf8").digest("hex"),
      totalEvents: items.length,
      creatableEvents: items.filter((item) => item.action === "create").length,
      unchangedEvents: items.filter((item) => item.action === "unchanged")
        .length,
      conflictingEvents: items.filter((item) => item.action === "conflict")
        .length,
      invalidEvents: items.filter((item) => item.action === "invalid").length,
      canCommit: items.every((item) =>
        ["create", "unchanged"].includes(item.action),
      ),
      items,
    };
  }

  async commit(
    userId: string,
    calendarId: string,
    previewId: string,
  ): Promise<IcsImportCommitResponse> {
    this.removeExpired();
    const preview = this.previews.get(previewId);
    if (
      !preview ||
      preview.userId !== userId ||
      preview.calendarId !== calendarId
    )
      throw new ApiError(
        404,
        "NOT_FOUND",
        "Die Importvorschau fehlt, ist abgelaufen oder gehört nicht zu diesem Kalender.",
      );
    this.previews.delete(previewId);
    if (
      preview.events.some(({ item }) =>
        ["invalid", "conflict"].includes(item.action),
      )
    )
      throw new ApiError(
        409,
        "CONFLICT",
        "Der Import enthält ungültige Ereignisse oder Konflikte und wurde nicht geschrieben.",
      );
    const current = await this.calendars.listEvents(userId, calendarId);
    const currentByUid = new Map(current.map((event) => [event.uid, event]));
    const toCreate = preview.events
      .filter(({ item }) => item.action === "create")
      .map(({ input }) => input!);
    const unchanged = preview.events
      .filter(({ item }) => item.action === "unchanged")
      .map(({ input }) => input!);
    const changedSincePreview = [...toCreate, ...unchanged].some((input) => {
      const existing = currentByUid.get(input.uid!);
      return existing
        ? JSON.stringify(comparableInput(input)) !==
            JSON.stringify(comparableEvent(existing))
        : unchanged.includes(input);
    });
    if (changedSincePreview)
      throw new ApiError(
        409,
        "CONFLICT",
        "Der Kalender hat sich seit der Vorschau geändert. Erstelle eine neue Vorschau.",
      );
    const created = await this.calendars.importEvents(
      userId,
      calendarId,
      toCreate,
    );
    return {
      createdEvents: created.length,
      unchangedEvents: unchanged.length,
      createdUids: created.map((event) => event.uid).sort(),
    };
  }

  private validateRecurrence(rule: string | null): string | null {
    if (!rule) return null;
    const values = Object.fromEntries(
      rule.split(";").map((entry) => {
        const separator = entry.indexOf("=");
        return separator > 0
          ? [
              entry.slice(0, separator).toUpperCase(),
              entry.slice(separator + 1),
            ]
          : [entry.toUpperCase(), ""];
      }),
    );
    if (!values.COUNT && !values.UNTIL)
      return "Importierte Wiederholungen benötigen COUNT oder UNTIL und dürfen nicht unbegrenzt sein.";
    if (values.COUNT) {
      const count = Number(values.COUNT);
      if (!Number.isInteger(count) || count < 1 || count > 1_000)
        return "COUNT muss zwischen 1 und 1000 liegen.";
    }
    if (values.UNTIL && !/^\d{8}(T\d{6}Z)?$/.test(values.UNTIL))
      return "UNTIL muss ein gültiger iCalendar-Tag oder UTC-Zeitpunkt sein.";
    return null;
  }

  private removeExpired() {
    const now = this.now().valueOf();
    for (const [id, preview] of this.previews) {
      if (preview.expiresAt.valueOf() <= now) this.previews.delete(id);
    }
  }
}

export { MAX_ICS_BYTES };
