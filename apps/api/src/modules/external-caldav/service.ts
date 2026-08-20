import { randomUUID } from "node:crypto";

import type {
  CalendarEventResponse,
  CreateExternalCalDavConnectionRequest,
  ExternalCalDavImportCommitResponse,
  ExternalCalDavImportPreviewResponse,
  ExternalCalDavOverviewResponse,
} from "@lifeos/contracts";

import { ApiError } from "../../errors.js";
import {
  parseCalendarEvents,
  serializeCalendarEvents,
} from "../caldav/icalendar.js";
import type { IcsImportService } from "../ics/service.js";
import {
  ExternalCalDavNetworkError,
  validateExternalCalDavUrl,
  type ExternalCalDavClient,
  type RemoteCalDavEvent,
} from "./client.js";
import {
  ExternalCalDavDuplicateError,
  ExternalCalDavLimitError,
  ExternalCalDavNotFoundError,
  type EventMappingValues,
  type PrismaExternalCalDavRepository,
} from "./repository.js";
import { IntegrationSecretBox } from "./secrets.js";

const IMPORT_TTL_MS = 15 * 60 * 1_000;
const MAX_PENDING_IMPORTS = 100;

interface PendingImport {
  userId: string;
  connectionId: string;
  externalCalendarId: string;
  localCalendarId: string;
  icsPreviewId: string;
  expiresAt: Date;
  mappings: EventMappingValues[];
}

const asCalendarEvent = (
  input: NonNullable<ReturnType<typeof parseCalendarEvents>[number]["input"]>,
): CalendarEventResponse => ({
  uid: input.uid!,
  title: input.title,
  description: input.description ?? null,
  location: input.location ?? null,
  isAllDay: input.isAllDay,
  startsAt: input.isAllDay ? null : input.startsAt,
  endsAt: input.isAllDay ? null : input.endsAt,
  startDate: input.isAllDay ? input.startDate : null,
  endDate: input.isAllDay ? input.endDate : null,
  timezone: input.timezone,
  recurrenceRule: input.recurrenceRule ?? null,
  reminderMinutes: input.reminderMinutes ?? [],
  etag: '"remote-read-only"',
  sequence: 0,
  updatedAt: new Date(0).toISOString(),
});

export class ExternalCalDavService {
  private readonly pendingImports = new Map<string, PendingImport>();
  private readonly secretBox: IntegrationSecretBox | null;

  constructor(
    private readonly repository: PrismaExternalCalDavRepository,
    private readonly client: ExternalCalDavClient,
    private readonly ics: IcsImportService,
    key: string | undefined,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.secretBox = key ? new IntegrationSecretBox(key) : null;
  }

  async overview(userId: string): Promise<ExternalCalDavOverviewResponse> {
    return {
      available: this.secretBox !== null,
      networkDefault: "disabled",
      mode: "read_only_import",
      connections: await this.repository.list(userId),
    };
  }

  async create(userId: string, input: CreateExternalCalDavConnectionRequest) {
    const box = this.requireSecretBox();
    const id = randomUUID();
    let baseUrl: string;
    try {
      const parsed = validateExternalCalDavUrl(input.baseUrl);
      parsed.pathname = parsed.pathname.endsWith("/")
        ? parsed.pathname
        : `${parsed.pathname}/`;
      baseUrl = parsed.toString();
    } catch (error) {
      this.rethrowNetwork(error);
    }
    try {
      await this.repository.create(userId, {
        id,
        name: input.name.trim(),
        baseUrl,
        sealed: box.seal(
          { username: input.username, password: input.password },
          `${userId}:${id}`,
        ),
      });
      return (await this.repository.list(userId)).find(
        (connection) => connection.id === id,
      )!;
    } catch (error) {
      this.rethrowRepository(error);
    }
  }

  async setEnabled(userId: string, id: string, enabled: boolean) {
    this.requireSecretBox();
    try {
      await this.repository.setEnabled(userId, id, enabled);
      return (await this.repository.list(userId)).find(
        (connection) => connection.id === id,
      )!;
    } catch (error) {
      this.rethrowRepository(error);
    }
  }

  async test(userId: string, id: string) {
    const connection = await this.enabledConnection(userId, id);
    try {
      const calendars = await this.client.listCalendars(
        connection.baseUrl,
        this.credentials(connection),
      );
      await this.repository.recordTest(userId, id, "ready", null);
      return {
        reachable: true as const,
        calendarCount: calendars.length,
      };
    } catch (error) {
      const code =
        error instanceof ExternalCalDavNetworkError
          ? error.code
          : "CONNECTION_FAILED";
      await this.repository.recordTest(userId, id, "error", code);
      this.rethrowNetwork(error);
    }
  }

  async listCalendars(userId: string, id: string) {
    const connection = await this.enabledConnection(userId, id);
    try {
      const remote = await this.client.listCalendars(
        connection.baseUrl,
        this.credentials(connection),
      );
      const calendars = await this.repository.upsertCalendars(
        userId,
        id,
        remote.map((calendar) => ({
          href: calendar.href,
          displayName: calendar.displayName,
          etag: calendar.etag,
        })),
      );
      await this.repository.recordTest(userId, id, "ready", null);
      return calendars;
    } catch (error) {
      const code =
        error instanceof ExternalCalDavNetworkError
          ? error.code
          : "CONNECTION_FAILED";
      await this.repository.recordTest(userId, id, "error", code);
      this.rethrowNetwork(error);
    }
  }

  async previewImport(
    userId: string,
    connectionId: string,
    externalCalendarId: string,
    localCalendarId: string,
  ): Promise<ExternalCalDavImportPreviewResponse> {
    const connection = await this.enabledConnection(userId, connectionId);
    let remote: RemoteCalDavEvent[];
    try {
      const calendar = await this.repository.findCalendar(
        userId,
        connectionId,
        externalCalendarId,
      );
      remote = await this.client.listEvents(
        connection.baseUrl,
        calendar.href,
        this.credentials(connection),
      );
    } catch (error) {
      if (error instanceof ExternalCalDavNotFoundError)
        this.rethrowRepository(error);
      const code =
        error instanceof ExternalCalDavNetworkError
          ? error.code
          : "SYNC_FAILED";
      await this.repository.recordTest(userId, connectionId, "error", code);
      this.rethrowNetwork(error);
    }
    const converted = remote.map((event, index) => {
      try {
        const parsed = parseCalendarEvents(event.ics, "UTC", 2);
        if (parsed.length !== 1 || !parsed[0]?.input || parsed[0].error)
          throw new Error("invalid remote event");
        return { event, parsed: parsed[0].input };
      } catch {
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          `Das externe Ereignis ${index + 1} ist keine eindeutige, gültige VEVENT-Ressource.`,
        );
      }
    });
    const preview = await this.ics.preview(
      userId,
      localCalendarId,
      serializeCalendarEvents(
        converted.map(({ parsed }) => asCalendarEvent(parsed)),
      ),
    );
    this.removeExpired();
    if (this.pendingImports.size >= MAX_PENDING_IMPORTS) {
      const oldest = this.pendingImports.keys().next().value as
        string | undefined;
      if (oldest) this.pendingImports.delete(oldest);
    }
    const externalImportId = randomUUID();
    const expiresAt = new Date(this.now().valueOf() + IMPORT_TTL_MS);
    this.pendingImports.set(externalImportId, {
      userId,
      connectionId,
      externalCalendarId,
      localCalendarId,
      icsPreviewId: preview.previewId,
      expiresAt,
      mappings: converted.map(({ event, parsed }) => ({
        remoteHref: event.href,
        remoteUid: parsed.uid!,
        remoteEtag: event.etag,
        localEventUid: parsed.uid!,
      })),
    });
    return {
      externalImportId,
      expiresAt: expiresAt.toISOString(),
      localCalendarId,
      externalCalendarId,
      preview,
    };
  }

  async commitImport(
    userId: string,
    connectionId: string,
    externalImportId: string,
  ): Promise<ExternalCalDavImportCommitResponse> {
    this.removeExpired();
    const pending = this.pendingImports.get(externalImportId);
    if (
      !pending ||
      pending.userId !== userId ||
      pending.connectionId !== connectionId
    )
      throw new ApiError(
        404,
        "NOT_FOUND",
        "Die externe Importvorschau fehlt, ist abgelaufen oder gehört nicht zu dieser Verbindung.",
      );
    this.pendingImports.delete(externalImportId);
    await this.enabledConnection(userId, connectionId);
    const committed = await this.ics.commit(
      userId,
      pending.localCalendarId,
      pending.icsPreviewId,
    );
    await this.repository.recordImport(
      userId,
      connectionId,
      pending.externalCalendarId,
      pending.localCalendarId,
      pending.mappings,
    );
    return { ...committed, mappedEvents: pending.mappings.length };
  }

  async revoke(userId: string, id: string) {
    try {
      await this.repository.revoke(userId, id);
    } catch (error) {
      this.rethrowRepository(error);
    }
  }

  private async enabledConnection(userId: string, id: string) {
    this.requireSecretBox();
    try {
      const connection = await this.repository.find(userId, id);
      if (!connection.enabled)
        throw new ApiError(
          409,
          "CONFLICT",
          "Die externe CalDAV-Verbindung ist deaktiviert.",
        );
      return connection;
    } catch (error) {
      this.rethrowRepository(error);
    }
  }

  private credentials(
    connection: Awaited<ReturnType<typeof this.enabledConnection>>,
  ) {
    return this.requireSecretBox().open(
      connection,
      `${connection.userId}:${connection.id}`,
    );
  }

  private requireSecretBox() {
    if (!this.secretBox)
      throw new ApiError(
        503,
        "SERVICE_NOT_READY",
        "Externe Integrationen sind lokal nicht konfiguriert und bleiben deaktiviert.",
      );
    return this.secretBox;
  }

  private removeExpired() {
    const now = this.now().valueOf();
    for (const [id, pending] of this.pendingImports)
      if (pending.expiresAt.valueOf() <= now) this.pendingImports.delete(id);
  }

  private rethrowRepository(error: unknown): never {
    if (error instanceof ApiError) throw error;
    if (error instanceof ExternalCalDavNotFoundError)
      throw new ApiError(
        404,
        "NOT_FOUND",
        "Die externe Verbindung wurde nicht gefunden.",
      );
    if (error instanceof ExternalCalDavDuplicateError)
      throw new ApiError(
        409,
        "CONFLICT",
        "Eine Verbindung mit diesem Namen existiert bereits.",
      );
    if (error instanceof ExternalCalDavLimitError)
      throw new ApiError(
        422,
        "VALIDATION_ERROR",
        "Es dürfen höchstens 20 externe CalDAV-Verbindungen konfiguriert werden.",
      );
    throw error;
  }

  private rethrowNetwork(error: unknown): never {
    if (error instanceof ApiError) throw error;
    const code =
      error instanceof ExternalCalDavNetworkError
        ? error.code
        : "CONNECTION_FAILED";
    throw new ApiError(
      code === "INVALID_URL" || code === "URL_NOT_ALLOWED" ? 400 : 502,
      "EXTERNAL_SERVICE_ERROR",
      "Die externe CalDAV-Verbindung wurde aus Sicherheitsgründen nicht ausgeführt oder ist nicht erreichbar.",
    );
  }
}
