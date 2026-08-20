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
const SYNTHETIC_TASK_ID = "00000000-0000-4000-8000-000000000005";
const SYNTHETIC_PROJECT_ID = "00000000-0000-4000-8000-000000000006";
const SYNTHETIC_TASK_EVENT_LINK_ID = "00000000-0000-4000-8000-000000000007";
const SYNTHETIC_PROJECT_GOAL_ID = "00000000-0000-4000-8000-000000000008";
const SYNTHETIC_PROJECT_MILESTONE_ID = "00000000-0000-4000-8000-000000000009";
const SYNTHETIC_PROJECT_EVENT_LINK_ID = "00000000-0000-4000-8000-000000000010";
const SYNTHETIC_NOTE_ID = "00000000-0000-4000-8000-000000000011";
const SYNTHETIC_AI_INTERACTION_ID = "00000000-0000-4000-8000-000000000012";

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

    const event = await database.calendarEvent.upsert({
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

    const project = await database.project.upsert({
      where: { id: SYNTHETIC_PROJECT_ID },
      update: { searchEnabled: true },
      create: {
        id: SYNTHETIC_PROJECT_ID,
        userId: user.id,
        title: "Synthetisches LifeOS-Projekt",
        description:
          "Nachvollziehbares Beispielprojekt ohne persönliche Daten.",
        status: "active",
        risk: "Testtermin könnte sich verschieben.",
        dueDate: new Date("2030-03-31T00:00:00.000Z"),
        searchEnabled: true,
      },
    });

    await database.projectGoal.upsert({
      where: { id: SYNTHETIC_PROJECT_GOAL_ID },
      update: {},
      create: {
        id: SYNTHETIC_PROJECT_GOAL_ID,
        userId: user.id,
        projectId: project.id,
        title: "Synthetisches Projektziel",
        status: "in_progress",
        dueDate: new Date("2030-02-28T00:00:00.000Z"),
      },
    });

    await database.projectMilestone.upsert({
      where: { id: SYNTHETIC_PROJECT_MILESTONE_ID },
      update: {},
      create: {
        id: SYNTHETIC_PROJECT_MILESTONE_ID,
        userId: user.id,
        projectId: project.id,
        title: "Synthetischer Meilenstein",
        status: "completed",
        dueDate: new Date("2030-01-31T00:00:00.000Z"),
      },
    });

    const task = await database.task.upsert({
      where: { id: SYNTHETIC_TASK_ID },
      update: {},
      create: {
        id: SYNTHETIC_TASK_ID,
        userId: user.id,
        title: "Synthetische LifeOS-Aufgabe",
        description: "Lokaler Beispieldatensatz für Entwicklung und Tests.",
        priority: "high",
        dueDate: new Date("2030-01-16T00:00:00.000Z"),
        scheduledStartAt: new Date("2030-01-15T15:00:00.000Z"),
        scheduledStartTimezone: "Europe/Berlin",
        estimatedDurationMinutes: 60,
        tags: ["organisation", "synthetisch"],
        area: "projects",
        projectId: project.id,
      },
    });

    await database.taskEventLink.upsert({
      where: { id: SYNTHETIC_TASK_EVENT_LINK_ID },
      update: {},
      create: {
        id: SYNTHETIC_TASK_EVENT_LINK_ID,
        userId: user.id,
        taskId: task.id,
        calendarEventId: event.id,
      },
    });

    await database.projectEventLink.upsert({
      where: { id: SYNTHETIC_PROJECT_EVENT_LINK_ID },
      update: {},
      create: {
        id: SYNTHETIC_PROJECT_EVENT_LINK_ID,
        userId: user.id,
        projectId: project.id,
        calendarEventId: event.id,
      },
    });

    await database.note.upsert({
      where: { id: SYNTHETIC_NOTE_ID },
      update: { searchEnabled: true },
      create: {
        id: SYNTHETIC_NOTE_ID,
        userId: user.id,
        projectId: project.id,
        title: "Synthetische Projektnotiz",
        content: "# Beispiel\n\nLokale Markdown-Notiz ohne persönliche Daten.",
        category: "Dokumentation",
        tags: ["synthetisch", "projekt"],
        searchEnabled: true,
        versions: {
          create: {
            user: { connect: { id: user.id } },
            version: 1,
            title: "Synthetische Projektnotiz",
            content:
              "# Beispiel\n\nLokale Markdown-Notiz ohne persönliche Daten.",
            category: "Dokumentation",
            tags: ["synthetisch", "projekt"],
          },
        },
      },
    });

    await database.aiInteraction.upsert({
      where: { id: SYNTHETIC_AI_INTERACTION_ID },
      update: {},
      create: {
        id: SYNTHETIC_AI_INTERACTION_ID,
        userId: user.id,
        requestHash: "a".repeat(64),
        status: "disabled",
        processingMode: "local",
        externalTransferOccurred: false,
        sourceReferences: [
          {
            sourceType: "note",
            sourceId: SYNTHETIC_NOTE_ID,
            sourceUpdatedAt: "2030-01-01T00:00:00.000Z",
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
