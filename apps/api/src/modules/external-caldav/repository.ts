import type { DatabaseClient } from "@lifeos/database";
import type {
  ExternalCalDavCalendarResponse,
  ExternalCalDavConnectionResponse,
  ExternalCalDavStatus,
} from "@lifeos/contracts";

import type { SealedCredentials } from "./secrets.js";

export interface StoredExternalCalDavConnection extends SealedCredentials {
  id: string;
  userId: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  revokedAt: Date | null;
}
export interface RemoteCalendarValues {
  href: string;
  displayName: string;
  etag: string | null;
}
export interface EventMappingValues {
  remoteHref: string;
  remoteUid: string;
  remoteEtag: string | null;
  localEventUid: string;
}

export class ExternalCalDavNotFoundError extends Error {}
export class ExternalCalDavDuplicateError extends Error {}
export class ExternalCalDavLimitError extends Error {}

export class PrismaExternalCalDavRepository {
  constructor(private readonly database: DatabaseClient) {}

  async list(userId: string): Promise<ExternalCalDavConnectionResponse[]> {
    const connections = await this.database.externalCalDavConnection.findMany({
      where: { userId },
      include: {
        calendars: { orderBy: { displayName: "asc" } },
        _count: { select: { eventMappings: true } },
      },
      orderBy: { name: "asc" },
      take: 20,
    });
    return connections.map((connection) => ({
      id: connection.id,
      name: connection.name,
      baseUrl: connection.baseUrl,
      enabled: connection.enabled,
      readOnly: true,
      status: connection.status as ExternalCalDavStatus,
      credentialsConfigured: connection.revokedAt === null,
      lastErrorCode: connection.lastErrorCode,
      lastTestedAt: connection.lastTestedAt?.toISOString() ?? null,
      lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
      revokedAt: connection.revokedAt?.toISOString() ?? null,
      calendars: connection.calendars.map(
        (calendar): ExternalCalDavCalendarResponse => ({
          id: calendar.id,
          displayName: calendar.displayName,
        }),
      ),
      importedEventCount: connection._count.eventMappings,
    }));
  }

  async find(
    userId: string,
    id: string,
  ): Promise<StoredExternalCalDavConnection> {
    const connection = await this.database.externalCalDavConnection.findFirst({
      where: { id, userId, revokedAt: null },
    });
    if (!connection) throw new ExternalCalDavNotFoundError();
    return connection;
  }

  async create(
    userId: string,
    input: {
      id: string;
      name: string;
      baseUrl: string;
      sealed: SealedCredentials;
    },
  ) {
    try {
      await this.database.$transaction(async (transaction) => {
        const connectionCount =
          await transaction.externalCalDavConnection.count({
            where: { userId },
          });
        if (connectionCount >= 20) throw new ExternalCalDavLimitError();
        await transaction.externalCalDavConnection.create({
          data: {
            id: input.id,
            userId,
            name: input.name,
            baseUrl: input.baseUrl,
            ...input.sealed,
            enabled: false,
            readOnly: true,
            status: "disabled",
          },
        });
        await transaction.auditEvent.create({
          data: {
            userId,
            action: "external_caldav.connection.configured",
            entityType: "ExternalCalDavConnection",
            entityId: input.id,
            metadata: { enabled: false, readOnly: true },
          },
        });
      });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2002"
      )
        throw new ExternalCalDavDuplicateError();
      if (error instanceof ExternalCalDavLimitError) throw error;
      throw error;
    }
  }

  async setEnabled(userId: string, id: string, enabled: boolean) {
    const result = await this.database.externalCalDavConnection.updateMany({
      where: { id, userId, revokedAt: null },
      data: {
        enabled,
        status: enabled ? "ready" : "disabled",
        lastErrorCode: null,
      },
    });
    if (result.count !== 1) throw new ExternalCalDavNotFoundError();
    await this.audit(
      userId,
      id,
      `external_caldav.connection.${enabled ? "enabled" : "disabled"}`,
      {
        enabled,
        readOnly: true,
      },
    );
  }

  async recordTest(
    userId: string,
    id: string,
    status: "ready" | "error",
    errorCode: string | null,
  ) {
    const result = await this.database.externalCalDavConnection.updateMany({
      where: { id, userId, revokedAt: null },
      data: { status, lastErrorCode: errorCode, lastTestedAt: new Date() },
    });
    if (result.count !== 1) throw new ExternalCalDavNotFoundError();
    await this.audit(userId, id, "external_caldav.connection.tested", {
      success: status === "ready",
      ...(errorCode ? { errorCode } : {}),
    });
  }

  async upsertCalendars(
    userId: string,
    connectionId: string,
    calendars: RemoteCalendarValues[],
  ): Promise<ExternalCalDavCalendarResponse[]> {
    return this.database.$transaction(async (transaction) => {
      const connection = await transaction.externalCalDavConnection.findFirst({
        where: { id: connectionId, userId, enabled: true, revokedAt: null },
        select: { id: true },
      });
      if (!connection) throw new ExternalCalDavNotFoundError();
      for (const calendar of calendars) {
        await transaction.externalCalDavCalendar.upsert({
          where: { connectionId_href: { connectionId, href: calendar.href } },
          create: {
            userId,
            connectionId,
            href: calendar.href,
            displayName: calendar.displayName,
            remoteEtag: calendar.etag,
          },
          update: {
            displayName: calendar.displayName,
            remoteEtag: calendar.etag,
          },
        });
      }
      const stored = await transaction.externalCalDavCalendar.findMany({
        where: { connectionId, userId },
        orderBy: { displayName: "asc" },
        take: 100,
      });
      return stored.map((calendar) => ({
        id: calendar.id,
        displayName: calendar.displayName,
      }));
    });
  }

  async findCalendar(userId: string, connectionId: string, calendarId: string) {
    const calendar = await this.database.externalCalDavCalendar.findFirst({
      where: { id: calendarId, userId, connectionId },
    });
    if (!calendar) throw new ExternalCalDavNotFoundError();
    return calendar;
  }

  async recordImport(
    userId: string,
    connectionId: string,
    externalCalendarId: string,
    localCalendarId: string,
    mappings: EventMappingValues[],
  ) {
    await this.database.$transaction(async (transaction) => {
      const connection = await transaction.externalCalDavConnection.findFirst({
        where: { id: connectionId, userId, enabled: true, revokedAt: null },
        select: { id: true },
      });
      const calendar = await transaction.externalCalDavCalendar.findFirst({
        where: { id: externalCalendarId, connectionId, userId },
        select: { id: true },
      });
      if (!connection || !calendar) throw new ExternalCalDavNotFoundError();
      for (const mapping of mappings) {
        await transaction.externalCalDavEventMapping.upsert({
          where: {
            connectionId_remoteHref: {
              connectionId,
              remoteHref: mapping.remoteHref,
            },
          },
          create: {
            userId,
            connectionId,
            externalCalendarId,
            localCalendarId,
            ...mapping,
          },
          update: {
            remoteEtag: mapping.remoteEtag,
            localCalendarId,
            localEventUid: mapping.localEventUid,
            importedAt: new Date(),
          },
        });
      }
      const updated = await transaction.externalCalDavConnection.updateMany({
        where: { id: connectionId, userId, enabled: true, revokedAt: null },
        data: { lastSyncAt: new Date(), status: "ready", lastErrorCode: null },
      });
      if (updated.count !== 1) throw new ExternalCalDavNotFoundError();
      await transaction.auditEvent.create({
        data: {
          userId,
          action: "external_caldav.events.imported",
          entityType: "ExternalCalDavConnection",
          entityId: connectionId,
          metadata: { importedCount: mappings.length, readOnly: true },
        },
      });
    });
  }

  async revoke(userId: string, id: string) {
    const result = await this.database.$transaction(async (transaction) => {
      const deleted = await transaction.externalCalDavConnection.deleteMany({
        where: { id, userId },
      });
      if (deleted.count === 1)
        await transaction.auditEvent.create({
          data: {
            userId,
            action: "external_caldav.connection.revoked",
            entityType: "ExternalCalDavConnection",
            entityId: id,
            metadata: { credentialsDeleted: true },
          },
        });
      return deleted.count;
    });
    if (result !== 1) throw new ExternalCalDavNotFoundError();
  }

  private audit(
    userId: string,
    id: string,
    action: string,
    metadata: Record<string, string | boolean>,
  ) {
    return this.database.auditEvent.create({
      data: {
        userId,
        action,
        entityType: "ExternalCalDavConnection",
        entityId: id,
        metadata,
      },
    });
  }
}
