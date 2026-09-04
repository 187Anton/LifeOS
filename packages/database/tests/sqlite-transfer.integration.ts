import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  appendFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createDatabaseClient,
  createPostgresDatabaseClient,
} from "../src/client.js";
import {
  createSqliteBackup,
  restoreSqliteBackup,
} from "../src/sqlite-backup.js";
import { importPostgresToSqlite } from "../src/sqlite-import.js";

test("überträgt alle Fachmodelle und restauriert SQLite samt Dokumenten nur in neue Ziele", async (t) => {
  const postgresUrl = process.env.DATABASE_URL?.trim();
  if (
    !postgresUrl ||
    (!postgresUrl.startsWith("postgresql://") &&
      !postgresUrl.startsWith("postgres://"))
  ) {
    throw new Error(
      "DATABASE_URL muss für diesen Nachweis auf die isolierte PostgreSQL-Testdatenbank zeigen.",
    );
  }
  const directory = await mkdtemp(path.join(os.tmpdir(), "lifeos-sqlite-m4-"));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  const suffix = randomUUID();
  const source = createPostgresDatabaseClient(postgresUrl);
  const externalId = `sqlite-transfer-${suffix}`;
  t.after(async () => {
    await source.user.deleteMany({ where: { externalId } });
    await source.$disconnect();
  });

  const user = await source.user.create({
    data: {
      externalId,
      displayName: "Synthetische Transferperson",
      settings: {
        create: {
          timezone: "Europe/Berlin",
          currencyCode: "EUR",
          locale: "de-DE",
          weekStartsOn: 1,
          defaultCalendarView: "month",
          showWeekends: false,
        },
      },
      credential: { create: { passwordHash: "synthetic-password-hash" } },
      calDavCredential: {
        create: {
          username: `sqlite-transfer-${suffix}`,
          passwordHash: "synthetic-caldav-hash",
        },
      },
      sessions: {
        create: {
          tokenHash: createHash("sha256").update(suffix).digest("hex"),
          credentialRevision: 1,
          expiresAt: new Date("2033-01-01T00:00:00.000Z"),
        },
      },
    },
  });
  const calendar = await source.calendar.create({
    data: {
      userId: user.id,
      externalId: `transfer-${suffix}`,
      name: "Synthetischer Transferkalender",
      timezone: "Europe/Berlin",
      isPrimary: true,
      syncToken: 7,
    },
  });
  const event = await source.calendarEvent.create({
    data: {
      userId: user.id,
      calendarId: calendar.id,
      uid: `transfer-${suffix}@lifeos.local`,
      title: "Synthetischer Serientermin",
      startsAt: new Date("2032-09-01T08:00:00.000Z"),
      endsAt: new Date("2032-09-01T09:00:00.000Z"),
      timezone: "Europe/Berlin",
      recurrenceRule: "FREQ=WEEKLY;COUNT=3",
      reminderMinutes: [10, 30],
      etag: '"transfer-v7"',
      sequence: 2,
      syncVersion: 7,
    },
  });
  const project = await source.project.create({
    data: {
      userId: user.id,
      title: "Synthetischer Projektanker",
      description: "Transferprojekt",
      status: "active",
      dueDate: new Date("2032-12-31T00:00:00.000Z"),
      searchEnabled: true,
    },
  });
  await source.projectGoal.create({
    data: {
      userId: user.id,
      projectId: project.id,
      title: "Synthetisches Transferziel",
      status: "in_progress",
      dueDate: new Date("2032-10-31T00:00:00.000Z"),
    },
  });
  await source.projectMilestone.create({
    data: {
      userId: user.id,
      projectId: project.id,
      title: "Synthetischer Transfermeilenstein",
      status: "completed",
      dueDate: new Date("2032-09-30T00:00:00.000Z"),
    },
  });
  const task = await source.task.create({
    data: {
      userId: user.id,
      title: "Synthetische Transferaufgabe",
      priority: "high",
      dueDate: new Date("2032-09-02T00:00:00.000Z"),
      scheduledStartAt: new Date("2032-09-01T10:00:00.000Z"),
      scheduledStartTimezone: "Europe/Berlin",
      estimatedDurationMinutes: 45,
      tags: ["transfer", "synthetisch"],
      area: "work",
      projectId: project.id,
    },
  });
  await source.taskEventLink.create({
    data: { userId: user.id, taskId: task.id, calendarEventId: event.id },
  });
  await source.projectEventLink.create({
    data: { userId: user.id, projectId: project.id, calendarEventId: event.id },
  });
  const program = await source.studyProgram.create({
    data: {
      userId: user.id,
      title: "Synthetisches Studium",
      institution: "Testhochschule",
      periodLabel: "Wintersemester 2032",
      status: "active",
    },
  });
  const module = await source.studyModule.create({
    data: {
      userId: user.id,
      programId: program.id,
      code: "SYN-1",
      title: "Synthetisches Modul",
      status: "active",
      credits: 6.5,
      documentReferences: ["documents/study/module.txt"],
      searchEnabled: true,
    },
  });
  const note = await source.note.create({
    data: {
      userId: user.id,
      projectId: project.id,
      studyModuleId: module.id,
      title: "Synthetische Transfernotiz",
      content: "# Transfer\n\nNur synthetische Inhalte.",
      category: "Test",
      tags: ["transfer"],
      searchEnabled: true,
      versions: {
        create: {
          user: { connect: { id: user.id } },
          version: 1,
          title: "Synthetische Transfernotiz",
          content: "# Transfer\n\nNur synthetische Inhalte.",
          category: "Test",
          tags: ["transfer"],
        },
      },
    },
  });
  const storageKey = `${randomUUID()}.txt`;
  await source.document.create({
    data: {
      userId: user.id,
      projectId: project.id,
      studyModuleId: module.id,
      storageKey,
      fileName: "transfer.txt",
      mimeType: "text/plain",
      byteSize: 24,
      sha256: createHash("sha256")
        .update("synthetisches Dokument\n")
        .digest("hex"),
      modifiedAt: new Date("2032-09-01T12:00:00.000Z"),
      searchEnabled: true,
      extractedText: "Synthetisch extrahierter Transfertext.",
    },
  });
  await source.studyEntry.create({
    data: {
      userId: user.id,
      moduleId: module.id,
      kind: "exam",
      title: "Synthetische Prüfung",
      dueDate: new Date("2032-09-15T00:00:00.000Z"),
      taskId: task.id,
      calendarEventId: event.id,
    },
  });
  const context = await source.workContext.create({
    data: {
      userId: user.id,
      title: "Synthetische Praxis",
      role: "Testrolle",
      startsOn: new Date("2032-08-01T00:00:00.000Z"),
      endsOn: new Date("2032-12-31T00:00:00.000Z"),
      timezone: "Europe/Berlin",
      status: "active",
    },
  });
  const workProject = await source.workProject.create({
    data: {
      userId: user.id,
      contextId: context.id,
      title: "Synthetisches Praxisprojekt",
      status: "active",
      deadlineDate: new Date("2032-10-01T00:00:00.000Z"),
      calendarEventId: event.id,
      searchEnabled: true,
    },
  });
  await source.workTaskLink.create({
    data: {
      userId: user.id,
      contextId: context.id,
      projectId: workProject.id,
      taskId: task.id,
    },
  });
  await source.workTimeEntry.create({
    data: {
      userId: user.id,
      contextId: context.id,
      projectId: workProject.id,
      taskId: task.id,
      kind: "actual",
      title: "Synthetische Arbeitszeit",
      startsAt: new Date("2032-09-01T10:00:00.000Z"),
      endsAt: new Date("2032-09-01T10:45:00.000Z"),
      timezone: "Europe/Berlin",
    },
  });
  await source.availabilityWindow.create({
    data: {
      userId: user.id,
      weekday: 2,
      startMinute: 540,
      endMinute: 1020,
      timezone: "Europe/Berlin",
      label: "Synthetische Verfügbarkeit",
    },
  });
  await source.auditEvent.create({
    data: {
      userId: user.id,
      action: "transfer.fixture.created",
      entityType: "User",
      entityId: user.id,
      metadata: { source: "synthetic-m4" },
    },
  });
  const aiInteraction = await source.aiInteraction.create({
    data: {
      userId: user.id,
      requestHash: createHash("sha256")
        .update("synthetic-ai-query")
        .digest("hex"),
      status: "disabled",
      processingMode: "local",
      externalTransferOccurred: false,
      sourceReferences: [
        {
          sourceType: "note",
          sourceId: note.id,
          sourceUpdatedAt: "2032-09-01T12:00:00.000Z",
          excerptHash: createHash("sha256").update("excerpt").digest("hex"),
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
  const financeCategory = await source.financeCategory.create({
    data: {
      userId: user.id,
      name: "Synthetische Lebensmittel",
      kind: "expense",
    },
  });
  const financeTransaction = await source.financeTransaction.create({
    data: {
      userId: user.id,
      categoryId: financeCategory.id,
      kind: "expense",
      bookingDate: new Date("2032-09-01T00:00:00.000Z"),
      amountMinor: 12_345,
      currencyCode: "EUR",
      note: "Ausschließlich synthetische Transferdaten",
      recurrenceFrequency: "monthly",
      recurrenceInterval: 1,
      recurrenceEndDate: new Date("2032-12-31T00:00:00.000Z"),
    },
  });
  const financeBudget = await source.financeBudget.create({
    data: {
      userId: user.id,
      categoryId: financeCategory.id,
      period: "month",
      periodStart: new Date("2032-09-01T00:00:00.000Z"),
      amountMinor: 20_000,
      currencyCode: "EUR",
      warningThresholdPercent: 80,
    },
  });
  const fitnessPlan = await source.fitnessPlan.create({
    data: { userId: user.id, name: "Synthetischer Transferplan" },
  });
  const fitnessExercise = await source.fitnessExercise.create({
    data: { userId: user.id, name: "Synthetische Transferübung" },
  });
  await source.fitnessPlanExercise.create({
    data: {
      userId: user.id,
      planId: fitnessPlan.id,
      exerciseId: fitnessExercise.id,
      position: 0,
      targetSets: 3,
    },
  });
  const fitnessSession = await source.fitnessSession.create({
    data: {
      userId: user.id,
      planId: fitnessPlan.id,
      calendarEventId: event.id,
      title: "Synthetische Transfereinheit",
      status: "completed",
      performedAt: new Date("2032-09-01T12:00:00.000Z"),
      timezone: "Europe/Berlin",
    },
  });
  const fitnessSet = await source.fitnessSet.create({
    data: {
      userId: user.id,
      sessionId: fitnessSession.id,
      exerciseId: fitnessExercise.id,
      setNumber: 1,
      repetitions: 10,
      weightGrams: 50_000,
    },
  });
  const bodyWeight = await source.bodyWeightEntry.create({
    data: {
      userId: user.id,
      measuredDate: new Date("2032-09-01T00:00:00.000Z"),
      weightGrams: 75_000,
    },
  });
  const externalCalDavConnection = await source.externalCalDavConnection.create(
    {
      data: {
        userId: user.id,
        name: "Synthetische Transferverbindung",
        baseUrl: "https://calendar.example.test/caldav/",
        credentialsEncrypted: "synthetic-encrypted-payload",
        secretIv: "synthetic-iv",
        secretTag: "synthetic-tag",
        enabled: false,
        readOnly: true,
      },
    },
  );
  const externalCalDavCalendar = await source.externalCalDavCalendar.create({
    data: {
      userId: user.id,
      connectionId: externalCalDavConnection.id,
      href: "/calendars/personal/",
      displayName: "Synthetischer Transferkalender",
    },
  });
  const externalCalDavMapping = await source.externalCalDavEventMapping.create({
    data: {
      userId: user.id,
      connectionId: externalCalDavConnection.id,
      externalCalendarId: externalCalDavCalendar.id,
      remoteHref: "/calendars/personal/event.ics",
      remoteUid: event.uid,
      remoteEtag: '"synthetic-remote-etag"',
      localCalendarId: calendar.externalId,
      localEventUid: event.uid,
    },
  });
  const gitHubConnection = await source.gitHubConnection.create({
    data: {
      userId: user.id,
      name: "Synthetischer GitHub-Transferzugang",
      tokenEncrypted: "synthetic-encrypted-token",
      secretIv: "synthetic-iv",
      secretTag: "synthetic-tag",
      accountLogin: "synthetic-owner",
      rateLimitRemaining: 4_999,
    },
  });

  const importedDatabasePath = path.join(directory, "imported.sqlite");
  const importResult = await importPostgresToSqlite(
    postgresUrl,
    `file:${importedDatabasePath}`,
  );
  assert.ok(Object.values(importResult.counts).every((count) => count > 0));
  await assert.rejects(
    () => importPostgresToSqlite(postgresUrl, `file:${importedDatabasePath}`),
    /existiert bereits/,
  );

  const imported = createDatabaseClient(`file:${importedDatabasePath}`);
  const importedUser = await imported.user.findUniqueOrThrow({
    where: { externalId },
    include: {
      settings: true,
      credential: true,
      calDavCredential: true,
      externalCalDavConnections: true,
      externalCalDavCalendars: true,
      externalCalDavMappings: true,
      githubConnections: true,
      sessions: true,
      calendars: { include: { events: true } },
      projects: true,
      projectGoals: true,
      projectMilestones: true,
      projectEventLinks: true,
      tasks: true,
      taskEventLinks: true,
      studyPrograms: true,
      studyModules: true,
      studyEntries: true,
      notes: { include: { versions: true } },
      documents: true,
      workContexts: true,
      workProjects: true,
      workTaskLinks: true,
      workTimeEntries: true,
      availabilityWindows: true,
      aiInteractions: true,
      financeCategories: true,
      financeTransactions: true,
      financeBudgets: true,
      fitnessPlans: true,
      fitnessExercises: true,
      fitnessPlanExercises: true,
      fitnessSessions: true,
      fitnessSets: true,
      bodyWeightEntries: true,
      auditEvents: true,
    },
  });
  assert.equal(importedUser.id, user.id);
  assert.equal(
    importedUser.externalCalDavConnections[0]?.id,
    externalCalDavConnection.id,
  );
  assert.equal(
    importedUser.externalCalDavCalendars[0]?.id,
    externalCalDavCalendar.id,
  );
  assert.equal(
    importedUser.externalCalDavMappings[0]?.id,
    externalCalDavMapping.id,
  );
  assert.equal(importedUser.githubConnections[0]?.id, gitHubConnection.id);
  assert.equal(importedUser.calendars[0]?.events[0]?.uid, event.uid);
  assert.equal(
    importedUser.tasks[0]?.dueDate?.toISOString(),
    "2032-09-02T00:00:00.000Z",
  );
  assert.deepEqual(importedUser.studyModules[0]?.documentReferences, [
    "documents/study/module.txt",
  ]);
  assert.equal(
    importedUser.projectGoals[0]?.dueDate?.toISOString(),
    "2032-10-31T00:00:00.000Z",
  );
  assert.equal(importedUser.projectMilestones.length, 1);
  assert.equal(importedUser.projectEventLinks[0]?.calendarEventId, event.id);
  assert.equal(importedUser.notes[0]?.id, note.id);
  assert.equal(importedUser.notes[0]?.versions.length, 1);
  assert.equal(importedUser.documents[0]?.storageKey, storageKey);
  assert.equal(
    importedUser.documents[0]?.extractedText,
    "Synthetisch extrahierter Transfertext.",
  );
  assert.equal(importedUser.projects[0]?.searchEnabled, true);
  assert.equal(importedUser.studyModules[0]?.searchEnabled, true);
  assert.equal(importedUser.workProjects[0]?.searchEnabled, true);
  assert.equal(importedUser.aiInteractions[0]?.id, aiInteraction.id);
  assert.equal(importedUser.aiInteractions[0]?.externalTransferOccurred, false);
  assert.equal(importedUser.financeCategories[0]?.id, financeCategory.id);
  assert.equal(
    importedUser.financeTransactions[0]?.bookingDate.toISOString(),
    "2032-09-01T00:00:00.000Z",
  );
  assert.equal(
    importedUser.financeTransactions[0]?.amountMinor,
    financeTransaction.amountMinor,
  );
  assert.equal(
    importedUser.financeTransactions[0]?.recurrenceEndDate?.toISOString(),
    "2032-12-31T00:00:00.000Z",
  );
  assert.equal(importedUser.financeBudgets[0]?.id, financeBudget.id);
  assert.equal(importedUser.fitnessPlans[0]?.id, fitnessPlan.id);
  assert.equal(importedUser.fitnessExercises[0]?.id, fitnessExercise.id);
  assert.equal(importedUser.fitnessSessions[0]?.calendarEventId, event.id);
  assert.equal(importedUser.fitnessSets[0]?.id, fitnessSet.id);
  assert.equal(
    importedUser.bodyWeightEntries[0]?.measuredDate.toISOString(),
    "2032-09-01T00:00:00.000Z",
  );

  const documents = path.join(directory, "documents-source");
  await mkdir(path.join(documents, user.id), { recursive: true });
  await writeFile(
    path.join(documents, user.id, storageKey),
    "synthetisches Dokument\n",
  );
  await writeFile(path.join(documents, "notiz.txt"), "synthetische Notiz\n");
  const backupDirectory = path.join(directory, "backup");
  const backup = await createSqliteBackup({
    databaseUrl: `file:${importedDatabasePath}`,
    documentsDirectory: documents,
    destinationDirectory: backupDirectory,
  });
  assert.equal(backup.manifest.documents.length, 2);

  await imported.auditEvent.create({
    data: {
      userId: user.id,
      action: "after.backup",
      entityType: "User",
      entityId: user.id,
    },
  });
  await imported.$disconnect();

  const restoredDatabasePath = path.join(directory, "restored.sqlite");
  const restoredDocuments = path.join(directory, "documents-restored");
  await restoreSqliteBackup({
    backupDirectory,
    targetDatabaseUrl: `file:${restoredDatabasePath}`,
    targetDocumentsDirectory: restoredDocuments,
  });
  const restored = createDatabaseClient(`file:${restoredDatabasePath}`);
  const restoredEvent = await restored.calendarEvent.findUniqueOrThrow({
    where: { id: event.id },
  });
  assert.equal(restoredEvent.uid, event.uid);
  assert.equal(restoredEvent.etag, event.etag);
  assert.equal(restoredEvent.syncVersion, event.syncVersion);
  const restoredFinanceTransaction =
    await restored.financeTransaction.findUniqueOrThrow({
      where: { id: financeTransaction.id },
    });
  assert.equal(restoredFinanceTransaction.amountMinor, 12_345);
  assert.equal(restoredFinanceTransaction.currencyCode, "EUR");
  assert.equal(
    (
      await restored.fitnessSet.findUniqueOrThrow({
        where: { id: fitnessSet.id },
      })
    ).weightGrams,
    50_000,
  );
  assert.equal(
    (
      await restored.bodyWeightEntry.findUniqueOrThrow({
        where: { id: bodyWeight.id },
      })
    ).weightGrams,
    75_000,
  );
  assert.equal(
    (
      await restored.externalCalDavEventMapping.findUniqueOrThrow({
        where: { id: externalCalDavMapping.id },
      })
    ).remoteEtag,
    '"synthetic-remote-etag"',
  );
  assert.equal(
    (
      await restored.gitHubConnection.findUniqueOrThrow({
        where: { id: gitHubConnection.id },
      })
    ).accountLogin,
    "synthetic-owner",
  );
  assert.equal(
    await restored.auditEvent.count({
      where: { userId: user.id, action: "after.backup" },
    }),
    0,
  );
  await restored.$disconnect();
  assert.equal(
    await readFile(path.join(restoredDocuments, user.id, storageKey), "utf8"),
    "synthetisches Dokument\n",
  );

  const tamperedBackup = path.join(directory, "backup-tampered");
  await cp(backupDirectory, tamperedBackup, { recursive: true });
  await appendFile(path.join(tamperedBackup, "manifest.json"), " ");
  const rejectedDatabase = path.join(directory, "rejected.sqlite");
  await assert.rejects(
    () =>
      restoreSqliteBackup({
        backupDirectory: tamperedBackup,
        targetDatabaseUrl: `file:${rejectedDatabase}`,
        targetDocumentsDirectory: path.join(directory, "documents-rejected"),
      }),
    /Manifest-Prüfsumme/,
  );
  const tamperedDatabaseBackup = path.join(
    directory,
    "backup-database-tampered",
  );
  await cp(backupDirectory, tamperedDatabaseBackup, { recursive: true });
  await appendFile(
    path.join(tamperedDatabaseBackup, "lifeos.sqlite"),
    "tampered",
  );
  await assert.rejects(
    () =>
      restoreSqliteBackup({
        backupDirectory: tamperedDatabaseBackup,
        targetDatabaseUrl: `file:${path.join(directory, "rejected-database.sqlite")}`,
        targetDocumentsDirectory: path.join(
          directory,
          "documents-database-rejected",
        ),
      }),
    /Backup-Datei ist ungültig|Prüfsumme stimmt nicht/,
  );
  const missingChecksumBackup = path.join(directory, "backup-missing-checksum");
  await cp(backupDirectory, missingChecksumBackup, { recursive: true });
  await unlink(path.join(missingChecksumBackup, "manifest.sha256"));
  await assert.rejects(
    () =>
      restoreSqliteBackup({
        backupDirectory: missingChecksumBackup,
        targetDatabaseUrl: `file:${path.join(directory, "rejected-checksum.sqlite")}`,
        targetDocumentsDirectory: path.join(
          directory,
          "documents-checksum-rejected",
        ),
      }),
    /Manifest oder Prüfsumme fehlt/,
  );
  const missingDocumentBackup = path.join(directory, "backup-missing-document");
  await cp(backupDirectory, missingDocumentBackup, { recursive: true });
  await unlink(path.join(missingDocumentBackup, "documents", "notiz.txt"));
  await assert.rejects(
    () =>
      restoreSqliteBackup({
        backupDirectory: missingDocumentBackup,
        targetDatabaseUrl: `file:${path.join(directory, "rejected-document.sqlite")}`,
        targetDocumentsDirectory: path.join(
          directory,
          "documents-file-rejected",
        ),
      }),
    /Backup-Datei fehlt/,
  );
  const traversalBackup = path.join(directory, "backup-traversal");
  await cp(backupDirectory, traversalBackup, { recursive: true });
  const traversalManifestPath = path.join(traversalBackup, "manifest.json");
  const traversalManifest = JSON.parse(
    await readFile(traversalManifestPath, "utf8"),
  ) as { documents: Array<{ path: string }> };
  traversalManifest.documents[0]!.path = "documents/../fremd";
  const traversalManifestBytes = Buffer.from(
    `${JSON.stringify(traversalManifest, null, 2)}\n`,
  );
  await writeFile(traversalManifestPath, traversalManifestBytes);
  await writeFile(
    path.join(traversalBackup, "manifest.sha256"),
    `${createHash("sha256").update(traversalManifestBytes).digest("hex")}\n`,
  );
  await assert.rejects(
    () =>
      restoreSqliteBackup({
        backupDirectory: traversalBackup,
        targetDatabaseUrl: `file:${path.join(directory, "rejected-traversal.sqlite")}`,
        targetDocumentsDirectory: path.join(
          directory,
          "documents-traversal-rejected",
        ),
      }),
    /unsicheren Dokumentpfad/,
  );
  await assert.rejects(
    () =>
      restoreSqliteBackup({
        backupDirectory,
        targetDatabaseUrl: `file:${restoredDatabasePath}`,
        targetDocumentsDirectory: path.join(directory, "documents-second"),
      }),
    /existieren bereits/,
  );
});
