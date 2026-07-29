import type { DatabaseClient } from "@lifeos/database";
import type {
  CalendarView,
  ProfileResponse,
  SupportedLocale,
  UpdateSettingsRequest,
} from "@lifeos/contracts";

export interface StoredCredential {
  userId: string;
  passwordHash: string;
  revision: number;
}

export interface AuthenticationRepository {
  findLocalCredential(): Promise<StoredCredential | null>;
  createSession(input: {
    userId: string;
    tokenHash: string;
    credentialRevision: number;
    expiresAt: Date;
  }): Promise<void>;
  findAuthenticatedUser(tokenHash: string, now: Date): Promise<string | null>;
  revokeSession(tokenHash: string, now: Date): Promise<void>;
}

export interface ProfileRepository {
  getProfile(userId: string): Promise<ProfileResponse | null>;
  updateSettings(
    userId: string,
    changes: UpdateSettingsRequest,
  ): Promise<ProfileResponse>;
}

const mapProfile = (record: {
  id: string;
  displayName: string;
  settings: {
    timezone: string;
    locale: string;
    currencyCode: string;
    weekStartsOn: number;
    defaultCalendarView: string;
    showWeekends: boolean;
  } | null;
}): ProfileResponse | null => {
  if (!record.settings) {
    return null;
  }

  return {
    id: record.id,
    displayName: record.displayName,
    settings: {
      timezone: record.settings.timezone,
      locale: record.settings.locale as SupportedLocale,
      currencyCode: record.settings.currencyCode,
      weekStartsOn: record.settings.weekStartsOn,
      defaultCalendarView: record.settings.defaultCalendarView as CalendarView,
      showWeekends: record.settings.showWeekends,
    },
  };
};

export class PrismaProfileRepository
  implements AuthenticationRepository, ProfileRepository
{
  constructor(
    private readonly database: DatabaseClient,
    private readonly localUserExternalId = "local-personal-user",
  ) {}

  async findLocalCredential(): Promise<StoredCredential | null> {
    return this.database.userCredential.findFirst({
      where: { user: { externalId: this.localUserExternalId } },
      select: { userId: true, passwordHash: true, revision: true },
    });
  }

  async createSession(input: {
    userId: string;
    tokenHash: string;
    credentialRevision: number;
    expiresAt: Date;
  }): Promise<void> {
    await this.database.userSession.create({ data: input });
  }

  async findAuthenticatedUser(
    tokenHash: string,
    now: Date,
  ): Promise<string | null> {
    const session = await this.database.userSession.findUnique({
      where: { tokenHash },
      select: {
        userId: true,
        credentialRevision: true,
        revokedAt: true,
        expiresAt: true,
        user: { select: { credential: { select: { revision: true } } } },
      },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.user.credential?.revision !== session.credentialRevision
    ) {
      return null;
    }
    return session.userId;
  }

  async revokeSession(tokenHash: string, now: Date): Promise<void> {
    await this.database.userSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  async getProfile(userId: string): Promise<ProfileResponse | null> {
    const profile = await this.database.user.findUnique({
      where: { id: userId },
      select: { id: true, displayName: true, settings: true },
    });
    return profile ? mapProfile(profile) : null;
  }

  async updateSettings(
    userId: string,
    changes: UpdateSettingsRequest,
  ): Promise<ProfileResponse> {
    const changedFields = Object.keys(changes).sort();
    const profile = await this.database.$transaction(async (transaction) => {
      await transaction.userSettings.update({
        where: { userId },
        data: changes,
      });
      await transaction.auditEvent.create({
        data: {
          userId,
          action: "settings.updated",
          entityType: "UserSettings",
          entityId: userId,
          metadata: { changedFields },
        },
      });
      return transaction.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, displayName: true, settings: true },
      });
    });

    const mapped = mapProfile(profile);
    if (!mapped) {
      throw new Error("User settings unexpectedly missing after update");
    }
    return mapped;
  }
}
