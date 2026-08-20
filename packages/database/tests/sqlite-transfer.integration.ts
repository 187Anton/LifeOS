import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  appendFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
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
      auditEvents: true,
    },
  });
  assert.equal(importedUser.id, user.id);
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
