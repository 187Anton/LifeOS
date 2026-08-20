import { randomUUID } from "node:crypto";

import type {
  CreateGitHubConnectionRequest,
  GitHubIntegrationOverviewResponse,
} from "@lifeos/contracts";

import { ApiError } from "../../errors.js";
import { IntegrationSecretBox } from "../external-caldav/secrets.js";
import { GitHubNetworkError, type GitHubReadClient } from "./client.js";
import {
  GitHubConnectionDuplicateError,
  GitHubConnectionLimitError,
  GitHubConnectionNotFoundError,
  type PrismaGitHubIntegrationRepository,
} from "./repository.js";

export class GitHubIntegrationService {
  private readonly secretBox: IntegrationSecretBox | null;

  constructor(
    private readonly repository: PrismaGitHubIntegrationRepository,
    private readonly client: GitHubReadClient,
    key: string | undefined,
  ) {
    this.secretBox = key ? new IntegrationSecretBox(key) : null;
  }

  async overview(userId: string): Promise<GitHubIntegrationOverviewResponse> {
    return {
      available: this.secretBox !== null,
      networkDefault: "disabled",
      mode: "read_only",
      apiHost: "api.github.com",
      connections: await this.repository.list(userId),
    };
  }

  async create(userId: string, input: CreateGitHubConnectionRequest) {
    const id = randomUUID();
    try {
      await this.repository.create(userId, {
        id,
        name: input.name.trim(),
        sealed: this.requireSecretBox().sealToken(
          input.token.trim(),
          `${userId}:${id}:github`,
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
      const result = await this.client.getViewer(this.token(connection));
      await this.repository.recordTest(userId, id, {
        status: "ready",
        accountLogin: result.data.login,
        errorCode: null,
        rateLimit: result.rateLimit,
      });
      return {
        reachable: true as const,
        accountLogin: result.data.login,
        rateLimit: result.rateLimit,
      };
    } catch (error) {
      const network = this.asNetworkError(error);
      await this.repository.recordTest(userId, id, {
        status: "error",
        accountLogin: null,
        errorCode: network.code,
        rateLimit: network.rateLimit,
      });
      this.rethrowNetwork(network);
    }
  }

  async repositories(userId: string, id: string) {
    const connection = await this.enabledConnection(userId, id);
    try {
      const result = await this.client.listRepositories(this.token(connection));
      await this.repository.recordFetch(userId, id, result.rateLimit);
      return { repositories: result.data, rateLimit: result.rateLimit };
    } catch (error) {
      await this.recordNetworkFailure(userId, id, error);
    }
  }

  async repositorySnapshot(
    userId: string,
    id: string,
    owner: string,
    repository: string,
  ) {
    const connection = await this.enabledConnection(userId, id);
    try {
      const result = await this.client.getRepositorySnapshot(
        this.token(connection),
        owner,
        repository,
      );
      await this.repository.recordFetch(userId, id, result.rateLimit);
      return result.data;
    } catch (error) {
      await this.recordNetworkFailure(userId, id, error);
    }
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
          "Die lesende GitHub-Verbindung ist deaktiviert.",
        );
      return connection;
    } catch (error) {
      this.rethrowRepository(error);
    }
  }

  private token(
    connection: Awaited<ReturnType<typeof this.enabledConnection>>,
  ) {
    return this.requireSecretBox().openToken(
      connection,
      `${connection.userId}:${connection.id}:github`,
    );
  }

  private requireSecretBox() {
    if (!this.secretBox)
      throw new ApiError(
        503,
        "SERVICE_NOT_READY",
        "Optionale externe Integrationen sind lokal nicht konfiguriert und bleiben deaktiviert.",
      );
    return this.secretBox;
  }

  private async recordNetworkFailure(
    userId: string,
    id: string,
    error: unknown,
  ): Promise<never> {
    const network = this.asNetworkError(error);
    await this.repository.recordFailure(
      userId,
      id,
      network.code,
      network.rateLimit,
    );
    this.rethrowNetwork(network);
  }

  private asNetworkError(error: unknown) {
    return error instanceof GitHubNetworkError
      ? error
      : new GitHubNetworkError("CONNECTION_FAILED");
  }

  private rethrowNetwork(error: GitHubNetworkError): never {
    if (error.code === "RATE_LIMITED")
      throw new ApiError(
        429,
        "RATE_LIMITED",
        error.rateLimit.resetAt
          ? `Das GitHub-Limit ist erreicht. Ein neuer Versuch ist nach ${error.rateLimit.resetAt} möglich.`
          : "Das GitHub-Limit ist erreicht. Versuche es später erneut.",
      );
    const permission = [
      "AUTHORIZATION_FAILED",
      "PERMISSION_DENIED",
      "NOT_FOUND_OR_FORBIDDEN",
    ].includes(error.code);
    throw new ApiError(
      permission ? 403 : 502,
      "EXTERNAL_SERVICE_ERROR",
      permission
        ? "GitHub hat den lesenden Zugriff abgelehnt. Prüfe Token und minimale Leseberechtigungen."
        : "Die lesende GitHub-Verbindung ist derzeit nicht erreichbar oder lieferte eine ungültige Antwort.",
    );
  }

  private rethrowRepository(error: unknown): never {
    if (error instanceof ApiError) throw error;
    if (error instanceof GitHubConnectionNotFoundError)
      throw new ApiError(
        404,
        "NOT_FOUND",
        "Die GitHub-Verbindung wurde nicht gefunden.",
      );
    if (error instanceof GitHubConnectionDuplicateError)
      throw new ApiError(
        409,
        "CONFLICT",
        "Eine GitHub-Verbindung mit diesem Namen existiert bereits.",
      );
    if (error instanceof GitHubConnectionLimitError)
      throw new ApiError(
        422,
        "VALIDATION_ERROR",
        "Es dürfen höchstens fünf GitHub-Verbindungen konfiguriert werden.",
      );
    throw error;
  }
}
