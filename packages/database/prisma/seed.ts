import { config as loadEnvironment } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createDatabaseClient } from "../src/client.js";

const prismaDirectory = path.dirname(fileURLToPath(import.meta.url));

loadEnvironment({
  path: path.resolve(prismaDirectory, "../../../.env"),
  quiet: true,
});

const SYNTHETIC_USER_ID = "00000000-0000-4000-8000-000000000001";
const SYNTHETIC_CALENDAR_ID = "00000000-0000-4000-8000-000000000002";
const SYNTHETIC_EVENT_ID = "00000000-0000-4000-8000-000000000003";
const SYNTHETIC_AUDIT_ID = "00000000-0000-4000-8000-000000000004";

const seed = async () => {
  const database = createDatabaseClient();

  try {
    const user = await database.user.upsert({
      where: { externalId: "local-personal-user" },
      update: {},
      create: {
        id: SYNTHETIC_USER_ID,
        externalId: "local-personal-user",
        displayName: "Lokale Testperson",
      },
    });

    await database.userSettings.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        timezone: "Europe/Berlin",
        currencyCode: "EUR",
        locale: "de-DE",
        weekStartsOn: 1,
      },
    });

    const calendar = await database.calendar.upsert({
      where: { externalId: "personal" },
      update: {},
      create: {
        id: SYNTHETIC_CALENDAR_ID,
        userId: user.id,
        externalId: "personal",
        name: "Persönlicher Kalender",
        timezone: "Europe/Berlin",
        isPrimary: true,
      },
    });

    await database.calendarEvent.upsert({
      where: {
        calendarId_uid: {
          calendarId: calendar.id,
          uid: "synthetic-foundation-event@lifeos.local",
        },
      },
      update: {},
      create: {
        id: SYNTHETIC_EVENT_ID,
        userId: user.id,
        calendarId: calendar.id,
        uid: "synthetic-foundation-event@lifeos.local",
        title: "Synthetischer LifeOS-Termin",
        description: "Lokaler Beispieldatensatz für Entwicklung und Tests.",
        startsAt: new Date("2030-01-15T17:00:00.000Z"),
        endsAt: new Date("2030-01-15T18:00:00.000Z"),
        timezone: "Europe/Berlin",
        etag: '"seed-v1"',
      },
    });

    await database.auditEvent.upsert({
      where: { id: SYNTHETIC_AUDIT_ID },
      update: {},
      create: {
        id: SYNTHETIC_AUDIT_ID,
        userId: user.id,
        action: "seed.created",
        entityType: "User",
        entityId: user.id,
        metadata: { source: "synthetic-seed", version: 1 },
      },
    });

    console.info("Synthetische LifeOS-Seed-Daten sind vorhanden.");
  } finally {
    await database.$disconnect();
  }
};

await seed();
