import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Prisma } from "../../src/generated/sqlite/client.js";
import { createSqliteDatabaseClient } from "../../src/sqlite-client.js";

type NullableTimestamp = string | null;

interface ExportedCalendarEvent {
  id: string;
  userId: string;
  calendarId: string;
  uid: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: NullableTimestamp;
  endsAt: NullableTimestamp;
  startDate: string | null;
  endDate: string | null;
  timezone: string;
  isAllDay: boolean;
  recurrenceRule: string | null;
  reminderMinutes: number[];
  etag: string;
  sequence: number;
  syncVersion: number;
  deletedAt: NullableTimestamp;
  createdAt: string;
  updatedAt: string;
}

interface SqliteSeedFixture {
  formatVersion: 1;
  user: {
    id: string;
    externalId: string;
    displayName: string;
    createdAt: string;
    updatedAt: string;
  };
  settings: {
    userId: string;
    timezone: string;
    currencyCode: string;
    locale: string;
    weekStartsOn: number;
    defaultCalendarView: string;
    showWeekends: boolean;
    createdAt: string;
    updatedAt: string;
  };
  credential: {
    userId: string;
    passwordHash: string;
    revision: number;
    createdAt: string;
    updatedAt: string;
  };
  session: {
    id: string;
    userId: string;
    tokenHash: string;
    credentialRevision: number;
    expiresAt: string;
    revokedAt: NullableTimestamp;
    createdAt: string;
  };
  calDavCredential: {
    userId: string;
    username: string;
    passwordHash: string;
    revision: number;
    revokedAt: NullableTimestamp;
    createdAt: string;
    updatedAt: string;
  };
  calendar: {
    id: string;
    userId: string;
    externalId: string;
    name: string;
    timezone: string;
    isPrimary: boolean;
    syncToken: number;
    createdAt: string;
    updatedAt: string;
    deletedAt: NullableTimestamp;
  };
  events: ExportedCalendarEvent[];
  auditEvent: {
    id: string;
    userId: string;
    action: string;
    entityType: string;
    entityId: string | null;
    metadata: Prisma.InputJsonValue;
    occurredAt: string;
  };
}

const sqliteDirectory = path.dirname(fileURLToPath(import.meta.url));
export const defaultSqliteSeedFixturePath = path.join(
  sqliteDirectory,
  "fixtures/postgres-calendar-export.v1.json",
);

const isoTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

function requireCondition(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new Error(`Ungültiger SQLite-Seed-Export: ${message}`);
}

function requireTimestamp(
  value: unknown,
  field: string,
): asserts value is string {
  requireCondition(
    typeof value === "string" &&
      isoTimestampPattern.test(value) &&
      new Date(value).toISOString() === value,
    `${field} muss ein normalisierter UTC-Zeitpunkt sein.`,
  );
}

const requireNullableTimestamp = (value: unknown, field: string) => {
  if (value !== null) requireTimestamp(value, field);
};

function requireDateOnly(
  value: unknown,
  field: string,
): asserts value is string {
  requireCondition(
    typeof value === "string" && dateOnlyPattern.test(value),
    `${field} muss ein reines Datum im Format YYYY-MM-DD sein.`,
  );
}

const validateEvent = (
  event: ExportedCalendarEvent,
  fixture: SqliteSeedFixture,
) => {
  requireCondition(
    event.userId === fixture.user.id,
    "Ereignisbesitz weicht ab.",
  );
  requireCondition(
    event.calendarId === fixture.calendar.id,
    "Ereigniskalender weicht ab.",
  );
  requireCondition(event.sequence >= 0, "sequence darf nicht negativ sein.");
  requireCondition(
    event.syncVersion >= 0,
    "syncVersion darf nicht negativ sein.",
  );
  requireCondition(
    event.reminderMinutes.length <= 10 &&
      event.reminderMinutes.every(
        (minute) => Number.isInteger(minute) && minute >= 0 && minute <= 10080,
      ),
    "Erinnerungen müssen höchstens zehn ganzzahlige Minutenwerte enthalten.",
  );
  requireTimestamp(event.createdAt, "events.createdAt");
  requireTimestamp(event.updatedAt, "events.updatedAt");
  requireNullableTimestamp(event.deletedAt, "events.deletedAt");

  if (event.isAllDay) {
    requireCondition(
      event.startsAt === null && event.endsAt === null,
      "Ganztagsereignisse dürfen keine Zeitpunkte enthalten.",
    );
    requireDateOnly(event.startDate, "events.startDate");
    requireDateOnly(event.endDate, "events.endDate");
    requireCondition(
      event.endDate > event.startDate,
      "Das Ganztagsende muss nach dem Starttag liegen.",
    );
    return;
  }

  requireCondition(
    event.startDate === null && event.endDate === null,
    "Zeitgebundene Ereignisse dürfen keine Ganztagsdaten enthalten.",
  );
  requireTimestamp(event.startsAt, "events.startsAt");
  requireTimestamp(event.endsAt, "events.endsAt");
  requireCondition(
    event.endsAt > event.startsAt,
    "Das Ereignisende muss nach dem Start liegen.",
  );
};

export const readSqliteSeedFixture = async (
  fixturePath = defaultSqliteSeedFixturePath,
): Promise<SqliteSeedFixture> => {
  const parsed: unknown = JSON.parse(await readFile(fixturePath, "utf8"));
  requireCondition(
    typeof parsed === "object" && parsed !== null,
    "Der Export muss ein Objekt sein.",
  );

  const fixture = parsed as SqliteSeedFixture;
  requireCondition(
    fixture.formatVersion === 1,
    "formatVersion 1 wird erwartet.",
  );
  requireCondition(
    fixture.user?.id === fixture.settings?.userId &&
      fixture.user.id === fixture.credential?.userId &&
      fixture.user.id === fixture.session?.userId &&
      fixture.user.id === fixture.calDavCredential?.userId &&
      fixture.user.id === fixture.calendar?.userId &&
      fixture.user.id === fixture.auditEvent?.userId,
    "Alle persönlichen Datensätze müssen denselben Besitzer haben.",
  );
  requireCondition(
    Array.isArray(fixture.events) &&
      fixture.events.some((event) => event.isAllDay) &&
      fixture.events.some((event) => !event.isAllDay),
    "Mindestens ein Zeit- und ein Ganztagsereignis werden benötigt.",
  );
  requireCondition(
    fixture.calendar.syncToken >=
      Math.max(...fixture.events.map((event) => event.syncVersion)),
    "Der Kalender-Sync-Token darf nicht hinter den Ereignissen liegen.",
  );

  for (const field of [
    fixture.user.createdAt,
    fixture.user.updatedAt,
    fixture.settings.createdAt,
    fixture.settings.updatedAt,
    fixture.credential.createdAt,
    fixture.credential.updatedAt,
    fixture.session.createdAt,
    fixture.session.expiresAt,
    fixture.calDavCredential.createdAt,
    fixture.calDavCredential.updatedAt,
    fixture.calendar.createdAt,
    fixture.calendar.updatedAt,
    fixture.auditEvent.occurredAt,
  ]) {
    requireTimestamp(field, "Zeitstempel");
  }
  requireNullableTimestamp(fixture.session.revokedAt, "session.revokedAt");
  requireNullableTimestamp(
    fixture.calDavCredential.revokedAt,
    "calDavCredential.revokedAt",
  );
  requireNullableTimestamp(fixture.calendar.deletedAt, "calendar.deletedAt");
  fixture.events.forEach((event) => validateEvent(event, fixture));

  return fixture;
};

const toDate = (value: string) => new Date(value);
const toNullableDate = (value: NullableTimestamp) =>
  value === null ? null : toDate(value);

const SYNTHETIC_PROJECT_ID = "00000000-0000-4000-8000-000000000106";
const SYNTHETIC_PROJECT_GOAL_ID = "00000000-0000-4000-8000-000000000108";
const SYNTHETIC_PROJECT_MILESTONE_ID = "00000000-0000-4000-8000-000000000109";
const SYNTHETIC_PROJECT_EVENT_LINK_ID = "00000000-0000-4000-8000-000000000110";
const SYNTHETIC_NOTE_ID = "00000000-0000-4000-8000-000000000111";
const SYNTHETIC_AI_INTERACTION_ID = "00000000-0000-4000-8000-000000000112";

export const seedSqliteDatabase = async (
  databaseUrl = process.env.SQLITE_DATABASE_URL,
  fixturePath = process.env.SQLITE_SEED_SOURCE || defaultSqliteSeedFixturePath,
) => {
  const fixture = await readSqliteSeedFixture(fixturePath);
  const database = createSqliteDatabaseClient(databaseUrl);

  try {
    await database.$transaction(async (transaction) => {
      await transaction.user.upsert({
        where: { id: fixture.user.id },
        update: {},
        create: {
          ...fixture.user,
          createdAt: toDate(fixture.user.createdAt),
          updatedAt: toDate(fixture.user.updatedAt),
        },
      });
      await transaction.userSettings.upsert({
        where: { userId: fixture.settings.userId },
        update: {},
        create: {
          ...fixture.settings,
          createdAt: toDate(fixture.settings.createdAt),
          updatedAt: toDate(fixture.settings.updatedAt),
        },
      });
      await transaction.userCredential.upsert({
        where: { userId: fixture.credential.userId },
        update: {},
        create: {
          ...fixture.credential,
          createdAt: toDate(fixture.credential.createdAt),
          updatedAt: toDate(fixture.credential.updatedAt),
        },
      });
      await transaction.userSession.upsert({
        where: { id: fixture.session.id },
        update: {},
        create: {
          ...fixture.session,
          expiresAt: toDate(fixture.session.expiresAt),
          revokedAt: toNullableDate(fixture.session.revokedAt),
          createdAt: toDate(fixture.session.createdAt),
        },
      });
      await transaction.calDavCredential.upsert({
        where: { userId: fixture.calDavCredential.userId },
        update: {},
        create: {
          ...fixture.calDavCredential,
          revokedAt: toNullableDate(fixture.calDavCredential.revokedAt),
          createdAt: toDate(fixture.calDavCredential.createdAt),
          updatedAt: toDate(fixture.calDavCredential.updatedAt),
        },
      });
      await transaction.calendar.upsert({
        where: { id: fixture.calendar.id },
        update: {},
        create: {
          ...fixture.calendar,
          createdAt: toDate(fixture.calendar.createdAt),
          updatedAt: toDate(fixture.calendar.updatedAt),
          deletedAt: toNullableDate(fixture.calendar.deletedAt),
        },
      });
      for (const event of fixture.events) {
        await transaction.calendarEvent.upsert({
          where: { id: event.id },
          update: {},
          create: {
            ...event,
            startsAt: toNullableDate(event.startsAt),
            endsAt: toNullableDate(event.endsAt),
            reminderMinutes: event.reminderMinutes,
            deletedAt: toNullableDate(event.deletedAt),
            createdAt: toDate(event.createdAt),
            updatedAt: toDate(event.updatedAt),
          },
        });
      }
      await transaction.project.upsert({
        where: { id: SYNTHETIC_PROJECT_ID },
        update: { searchEnabled: true },
        create: {
          id: SYNTHETIC_PROJECT_ID,
          userId: fixture.user.id,
          title: "Synthetisches SQLite-Projekt",
          description: "Lokales Beispielprojekt für reproduzierbare Tests.",
          status: "active",
          risk: "Nur synthetischer Testrisikohinweis.",
          dueDate: "2030-03-31",
          searchEnabled: true,
          createdAt: toDate(fixture.user.createdAt),
          updatedAt: toDate(fixture.user.updatedAt),
        },
      });
      await transaction.projectGoal.upsert({
        where: { id: SYNTHETIC_PROJECT_GOAL_ID },
        update: {},
        create: {
          id: SYNTHETIC_PROJECT_GOAL_ID,
          userId: fixture.user.id,
          projectId: SYNTHETIC_PROJECT_ID,
          title: "Synthetisches SQLite-Projektziel",
          status: "in_progress",
          dueDate: "2030-02-28",
          createdAt: toDate(fixture.user.createdAt),
          updatedAt: toDate(fixture.user.updatedAt),
        },
      });
      await transaction.projectMilestone.upsert({
        where: { id: SYNTHETIC_PROJECT_MILESTONE_ID },
        update: {},
        create: {
          id: SYNTHETIC_PROJECT_MILESTONE_ID,
          userId: fixture.user.id,
          projectId: SYNTHETIC_PROJECT_ID,
          title: "Synthetischer SQLite-Meilenstein",
          status: "completed",
          dueDate: "2030-01-31",
          createdAt: toDate(fixture.user.createdAt),
          updatedAt: toDate(fixture.user.updatedAt),
        },
      });
      const firstEvent = fixture.events[0];
      requireCondition(
        firstEvent,
        "Ein Kalenderereignis für das Projekt fehlt.",
      );
      await transaction.projectEventLink.upsert({
        where: { id: SYNTHETIC_PROJECT_EVENT_LINK_ID },
        update: {},
        create: {
          id: SYNTHETIC_PROJECT_EVENT_LINK_ID,
          userId: fixture.user.id,
          projectId: SYNTHETIC_PROJECT_ID,
          calendarEventId: firstEvent.id,
          createdAt: toDate(fixture.user.createdAt),
        },
      });
      await transaction.note.upsert({
        where: { id: SYNTHETIC_NOTE_ID },
        update: { searchEnabled: true },
        create: {
          id: SYNTHETIC_NOTE_ID,
          userId: fixture.user.id,
          projectId: SYNTHETIC_PROJECT_ID,
          title: "Synthetische SQLite-Projektnotiz",
          content:
            "# Beispiel\n\nLokale Markdown-Notiz ohne persönliche Daten.",
          category: "Dokumentation",
          tags: ["synthetisch", "projekt"],
          searchEnabled: true,
          createdAt: toDate(fixture.user.createdAt),
          updatedAt: toDate(fixture.user.updatedAt),
          versions: {
            create: {
              user: { connect: { id: fixture.user.id } },
              version: 1,
              title: "Synthetische SQLite-Projektnotiz",
              content:
                "# Beispiel\n\nLokale Markdown-Notiz ohne persönliche Daten.",
              category: "Dokumentation",
              tags: ["synthetisch", "projekt"],
              createdAt: toDate(fixture.user.createdAt),
            },
          },
        },
      });
      await transaction.aiInteraction.upsert({
        where: { id: SYNTHETIC_AI_INTERACTION_ID },
        update: {},
        create: {
          id: SYNTHETIC_AI_INTERACTION_ID,
          userId: fixture.user.id,
          requestHash: "a".repeat(64),
          status: "disabled",
          processingMode: "local",
          externalTransferOccurred: false,
          sourceReferences: [
            {
              sourceType: "note",
              sourceId: SYNTHETIC_NOTE_ID,
              sourceUpdatedAt: fixture.user.updatedAt,
              excerptHash: "b".repeat(64),
              releaseStatus: "search_enabled",
              usedForResponse: false,
              warning: null,
            },
          ],
          responseMetadata: {
            messageCode: "disabled",
            answerHash: null,
            sourceCount: 1,
            usableSourceCount: 1,
            suggestions: [],
          },
          createdAt: toDate(fixture.user.createdAt),
          updatedAt: toDate(fixture.user.updatedAt),
        },
      });
      await transaction.auditEvent.upsert({
        where: { id: fixture.auditEvent.id },
        update: {},
        create: {
          ...fixture.auditEvent,
          occurredAt: toDate(fixture.auditEvent.occurredAt),
        },
      });
    });
  } finally {
    await database.$disconnect();
  }
};

const invokedAsScript = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (invokedAsScript) {
  await seedSqliteDatabase();
  console.info("Synthetische SQLite-Migrationsdaten sind vorhanden.");
}
