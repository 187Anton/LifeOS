import type { DatabaseClient } from "@lifeos/database";
import type {
  GitHubConnectionResponse,
  GitHubIntegrationStatus,
  GitHubRateLimitResponse,
} from "@lifeos/contracts";

import type { SealedToken } from "../external-caldav/secrets.js";

export interface StoredGitHubConnection extends SealedToken {
  id: string;
  userId: string;
  enabled: boolean;
}

export class GitHubConnectionNotFoundError extends Error {}
export class GitHubConnectionDuplicateError extends Error {}
export class GitHubConnectionLimitError extends Error {}

const rateLimitValues = (rateLimit: GitHubRateLimitResponse) => ({
  rateLimitRemaining: rateLimit.remaining,
  rateLimitResetAt: rateLimit.resetAt ? new Date(rateLimit.resetAt) : null,
});

export class PrismaGitHubIntegrationRepository {
  constructor(private readonly database: DatabaseClient) {}

  async list(userId: string): Promise<GitHubConnectionResponse[]> {
    const connections = await this.database.gitHubConnection.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      take: 5,
    });
    return connections.map((connection) => ({
      id: connection.id,
      name: connection.name,
      enabled: connection.enabled,
      readOnly: true,
      status: connection.status as GitHubIntegrationStatus,
      tokenConfigured: true,
      accountLogin: connection.accountLogin,
      lastErrorCode: connection.lastErrorCode,
      lastTestedAt: connection.lastTestedAt?.toISOString() ?? null,
      lastFetchedAt: connection.lastFetchedAt?.toISOString() ?? null,
      rateLimit: {
        remaining: connection.rateLimitRemaining,
        resetAt: connection.rateLimitResetAt?.toISOString() ?? null,
      },
    }));
  }

  async find(userId: string, id: string): Promise<StoredGitHubConnection> {
    const connection = await this.database.gitHubConnection.findFirst({
      where: { id, userId },
    });
    if (!connection) throw new GitHubConnectionNotFoundError();
    return connection;
  }

  async create(
    userId: string,
    input: { id: string; name: string; sealed: SealedToken },
  ) {
    try {
      await this.database.$transaction(async (transaction) => {
        if (
          (await transaction.gitHubConnection.count({ where: { userId } })) >= 5
        )
          throw new GitHubConnectionLimitError();
        await transaction.gitHubConnection.create({
          data: {
            id: input.id,
            userId,
            name: input.name,
            ...input.sealed,
            enabled: false,
            readOnly: true,
            status: "disabled",
          },
        });
        await transaction.auditEvent.create({
          data: {
            userId,
            action: "github.connection.configured",
            entityType: "GitHubConnection",
            entityId: input.id,
            metadata: { enabled: false, readOnly: true },
          },
        });
      });
    } catch (error) {
      if (error instanceof GitHubConnectionLimitError) throw error;
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2002"
      )
        throw new GitHubConnectionDuplicateError();
      throw error;
    }
  }

  async setEnabled(userId: string, id: string, enabled: boolean) {
    const result = await this.database.gitHubConnection.updateMany({
      where: { id, userId },
      data: {
        enabled,
        status: enabled ? "ready" : "disabled",
        lastErrorCode: null,
      },
    });
    if (result.count !== 1) throw new GitHubConnectionNotFoundError();
    await this.audit(
      userId,
      id,
      `github.connection.${enabled ? "enabled" : "disabled"}`,
      { enabled, readOnly: true },
    );
  }

  async recordTest(
    userId: string,
    id: string,
    input: {
      status: "ready" | "error";
      accountLogin: string | null;
      errorCode: string | null;
      rateLimit: GitHubRateLimitResponse;
    },
  ) {
    const result = await this.database.gitHubConnection.updateMany({
      where: { id, userId },
      data: {
        status: input.status,
        accountLogin: input.accountLogin,
        lastErrorCode: input.errorCode,
        lastTestedAt: new Date(),
        ...rateLimitValues(input.rateLimit),
      },
    });
    if (result.count !== 1) throw new GitHubConnectionNotFoundError();
    await this.audit(userId, id, "github.connection.tested", {
      success: input.status === "ready",
      ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    });
  }

  async recordFetch(
    userId: string,
    id: string,
    rateLimit: GitHubRateLimitResponse,
  ) {
    const result = await this.database.gitHubConnection.updateMany({
      where: { id, userId, enabled: true },
      data: {
        status: "ready",
        lastErrorCode: null,
        lastFetchedAt: new Date(),
        ...rateLimitValues(rateLimit),
      },
    });
    if (result.count !== 1) throw new GitHubConnectionNotFoundError();
    await this.audit(userId, id, "github.metadata.read", {
      readOnly: true,
    });
  }

  async recordFailure(
    userId: string,
    id: string,
    errorCode: string,
    rateLimit: GitHubRateLimitResponse,
  ) {
    const result = await this.database.gitHubConnection.updateMany({
      where: { id, userId },
      data: {
        status: "error",
        lastErrorCode: errorCode,
        ...rateLimitValues(rateLimit),
      },
    });
    if (result.count !== 1) throw new GitHubConnectionNotFoundError();
    await this.audit(userId, id, "github.metadata.read_failed", {
      errorCode,
    });
  }

  async revoke(userId: string, id: string) {
    const deleted = await this.database.$transaction(async (transaction) => {
      const result = await transaction.gitHubConnection.deleteMany({
        where: { id, userId },
      });
      if (result.count === 1)
        await transaction.auditEvent.create({
          data: {
            userId,
            action: "github.connection.revoked",
            entityType: "GitHubConnection",
            entityId: id,
            metadata: { tokenDeleted: true },
          },
        });
      return result.count;
    });
    if (deleted !== 1) throw new GitHubConnectionNotFoundError();
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
        entityType: "GitHubConnection",
        entityId: id,
        metadata,
      },
    });
  }
}
