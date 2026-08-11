import type { DatabaseClient } from "@lifeos/database";

export const LOCAL_USER_EXTERNAL_ID = "local-personal-user";
const PERSONAL_CALENDAR_EXTERNAL_ID = "personal";

export interface SetupRecord {
  displayName: string;
  passwordHash: string;
  calDavPasswordHash: string;
  timezone: string;
}

export interface SetupRepository {
  isRequired(): Promise<boolean>;
  initialize(record: SetupRecord): Promise<boolean>;
}

export class PrismaSetupRepository implements SetupRepository {
  constructor(
    private readonly database: DatabaseClient,
    private readonly localUserExternalId = LOCAL_USER_EXTERNAL_ID,
    private readonly personalCalendarExternalId = PERSONAL_CALENDAR_EXTERNAL_ID,
    private readonly calDavUsername = "local",
  ) {}

  async isRequired(): Promise<boolean> {
    const user = await this.database.user.findUnique({
      where: { externalId: this.localUserExternalId },
      select: { credential: { select: { userId: true } } },
    });
    return !user?.credential;
  }

  async initialize(record: SetupRecord): Promise<boolean> {
    try {
      return await this.database.$transaction(async (transaction) => {
        const existing = await transaction.user.findUnique({
          where: { externalId: this.localUserExternalId },
          select: { id: true, credential: { select: { userId: true } } },
        });
        if (existing?.credential) return false;

        const user = existing
          ? await transaction.user.update({
              where: { id: existing.id },
              data: { displayName: record.displayName },
            })
          : await transaction.user.create({
              data: {
                externalId: this.localUserExternalId,
                displayName: record.displayName,
              },
            });

        await transaction.userSettings.upsert({
          where: { userId: user.id },
          create: { userId: user.id, timezone: record.timezone },
          update: { timezone: record.timezone },
        });
        const calendar = await transaction.calendar.findUnique({
          where: { externalId: this.personalCalendarExternalId },
          select: { userId: true },
        });
        if (calendar && calendar.userId !== user.id) {
          throw new Error(
            "Der persönliche Kalender gehört nicht zum lokalen Profil.",
          );
        }
        if (!calendar) {
          await transaction.calendar.create({
            data: {
              userId: user.id,
              externalId: this.personalCalendarExternalId,
              name: "Persönlicher Kalender",
              timezone: record.timezone,
              isPrimary: true,
            },
          });
        }
        await transaction.userCredential.create({
          data: { userId: user.id, passwordHash: record.passwordHash },
        });
        await transaction.calDavCredential.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            username: this.calDavUsername,
            passwordHash: record.calDavPasswordHash,
          },
          update: {
            username: this.calDavUsername,
            passwordHash: record.calDavPasswordHash,
            revision: { increment: 1 },
            revokedAt: null,
          },
        });
        await transaction.auditEvent.create({
          data: {
            userId: user.id,
            action: "local.setup.completed",
            entityType: "User",
            entityId: user.id,
            metadata: { source: "local-first-run", version: 1 },
          },
        });
        return true;
      });
    } catch (error) {
      if (!(await this.isRequired())) return false;
      throw error;
    }
  }
}
