import assert from "node:assert/strict";
import { appendFile, cp, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  migrateSqliteDatabase,
  sqliteMigrationsDirectory,
} from "../prisma/sqlite/migrate.js";
import {
  readSqliteSeedFixture,
  seedSqliteDatabase,
} from "../prisma/sqlite/seed.js";
import {
  createSqliteDatabaseClient,
  SQLITE_BUSY_TIMEOUT_MS,
} from "../src/sqlite-client.js";

const createIsolatedDatabase = async (t: test.TestContext) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lifeos-sqlite-m1-"));
  const databaseUrl = `file:${path.join(directory, "lifeos.sqlite")}`;
  t.after(async () => rm(directory, { recursive: true, force: true }));
  return databaseUrl;
};

const readMigrationSnapshot = async (
  database: ReturnType<typeof createSqliteDatabaseClient>,
) => {
  const user = await database.user.findFirstOrThrow({
    where: { externalId: "sqlite-migration-synthetic-user" },
    include: {
      settings: true,
      credential: true,
      calDavCredential: true,
      sessions: { orderBy: { id: "asc" } },
      calendars: {
        orderBy: { id: "asc" },
        include: { events: { orderBy: { id: "asc" } } },
      },
      aiInteractions: { orderBy: { id: "asc" } },
      auditEvents: { orderBy: { id: "asc" } },
    },
  });

  return JSON.parse(JSON.stringify(user)) as unknown;
};

test("erstellt SQLite nur über versionierte Migrationen und bleibt wiederholbar", async (t) => {
  const databaseUrl = await createIsolatedDatabase(t);

  const firstMigration = await migrateSqliteDatabase(databaseUrl);
  assert.deepEqual(firstMigration.appliedNow, [
    "20260809190000_sqlite_foundation",
    "20260809203000_product_modules",
    "20260812100000_projects_milestones",
    "20260812190000_local_documents_notes",
    "20260820100000_local_search",
    "20260820150000_source_grounded_ai",
  ]);

  const database = createSqliteDatabaseClient(databaseUrl);
  t.after(async () => database.$disconnect());

  const migrationRows = await database.$queryRawUnsafe<
    Array<{ name: string; checksum: string }>
  >('SELECT "name", "checksum" FROM "_lifeos_migrations"');
  assert.equal(migrationRows.length, 6);
  assert.equal(migrationRows[0]?.name, "20260809190000_sqlite_foundation");
  assert.match(migrationRows[0]?.checksum ?? "", /^[0-9a-f]{64}$/);
  assert.equal(migrationRows[1]?.name, "20260809203000_product_modules");
  assert.match(migrationRows[1]?.checksum ?? "", /^[0-9a-f]{64}$/);
  assert.equal(migrationRows[2]?.name, "20260812100000_projects_milestones");
  assert.match(migrationRows[2]?.checksum ?? "", /^[0-9a-f]{64}$/);
  assert.equal(migrationRows[3]?.name, "20260812190000_local_documents_notes");
  assert.match(migrationRows[3]?.checksum ?? "", /^[0-9a-f]{64}$/);
  assert.equal(migrationRows[4]?.name, "20260820100000_local_search");
  assert.match(migrationRows[4]?.checksum ?? "", /^[0-9a-f]{64}$/);
  assert.equal(migrationRows[5]?.name, "20260820150000_source_grounded_ai");
  assert.match(migrationRows[5]?.checksum ?? "", /^[0-9a-f]{64}$/);

  const foreignKeys = await database.$queryRawUnsafe<
    Array<{ foreign_keys: bigint }>
  >("PRAGMA foreign_keys");
  assert.equal(Number(foreignKeys[0]?.foreign_keys), 1);

  const journalMode = await database.$queryRawUnsafe<
    Array<{ journal_mode: string }>
  >("PRAGMA journal_mode");
  assert.equal(journalMode[0]?.journal_mode.toLowerCase(), "wal");
  const busyTimeout = await database.$queryRawUnsafe<
    Array<{ timeout: bigint }>
  >("PRAGMA busy_timeout");
  assert.equal(Number(busyTimeout[0]?.timeout), SQLITE_BUSY_TIMEOUT_MS);

  await seedSqliteDatabase(databaseUrl);
  const firstSeed = await readMigrationSnapshot(database);
  await seedSqliteDatabase(databaseUrl);
  const secondSeed = await readMigrationSnapshot(database);
  assert.deepEqual(secondSeed, firstSeed);

  const secondMigration = await migrateSqliteDatabase(databaseUrl);
  assert.deepEqual(secondMigration.appliedNow, []);
  assert.deepEqual(await readMigrationSnapshot(database), firstSeed);

  const changedMigrations = path.join(
    path.dirname(firstMigration.databasePath),
    "changed-migrations",
  );
  await cp(sqliteMigrationsDirectory, changedMigrations, { recursive: true });
  await appendFile(
    path.join(
      changedMigrations,
      "20260809190000_sqlite_foundation",
      "migration.sql",
    ),
    "\n-- unzulässige nachträgliche Änderung\n",
  );
  await assert.rejects(
    () => migrateSqliteDatabase(databaseUrl, changedMigrations),
    /bereits angewendete SQLite-Migration .* wurde verändert/,
  );
});

test("übernimmt stabile Kalenderidentitäten, Zeitpunkte und reine Ganztagsdaten", async (t) => {
  const databaseUrl = await createIsolatedDatabase(t);
  await migrateSqliteDatabase(databaseUrl);
  await seedSqliteDatabase(databaseUrl);

  const fixture = await readSqliteSeedFixture();
  const database = createSqliteDatabaseClient(databaseUrl);
  t.after(async () => database.$disconnect());

  const calendar = await database.calendar.findUniqueOrThrow({
    where: { id: fixture.calendar.id },
    include: { events: { orderBy: { id: "asc" } } },
  });
  assert.equal(calendar.userId, fixture.user.id);
  assert.equal(calendar.externalId, fixture.calendar.externalId);
  assert.equal(calendar.syncToken, fixture.calendar.syncToken);
  assert.equal(calendar.events.length, 2);

  const timed = calendar.events.find((event) => !event.isAllDay);
  const allDay = calendar.events.find((event) => event.isAllDay);
  const timedFixture = fixture.events.find((event) => !event.isAllDay);
  const allDayFixture = fixture.events.find((event) => event.isAllDay);
  assert.ok(timed && allDay && timedFixture && allDayFixture);

  assert.equal(timed.id, timedFixture.id);
  assert.equal(timed.uid, timedFixture.uid);
  assert.equal(timed.etag, timedFixture.etag);
  assert.equal(timed.sequence, timedFixture.sequence);
  assert.equal(timed.syncVersion, timedFixture.syncVersion);
  assert.equal(timed.timezone, timedFixture.timezone);
  assert.equal(timed.startsAt?.toISOString(), timedFixture.startsAt);
  assert.equal(timed.endsAt?.toISOString(), timedFixture.endsAt);
  assert.deepEqual(timed.reminderMinutes, timedFixture.reminderMinutes);
  assert.equal(timed.startDate, null);
  assert.equal(timed.endDate, null);

  assert.equal(allDay.id, allDayFixture.id);
  assert.equal(allDay.uid, allDayFixture.uid);
  assert.equal(allDay.etag, allDayFixture.etag);
  assert.equal(allDay.sequence, allDayFixture.sequence);
  assert.equal(allDay.syncVersion, allDayFixture.syncVersion);
  assert.equal(allDay.timezone, allDayFixture.timezone);
  assert.equal(allDay.startDate, allDayFixture.startDate);
  assert.equal(allDay.endDate, allDayFixture.endDate);
  assert.deepEqual(allDay.reminderMinutes, allDayFixture.reminderMinutes);
  assert.equal(allDay.startsAt, null);
  assert.equal(allDay.endsAt, null);
});

test("weist fremden Besitz, gemischte Zeitformen und ungültige Erinnerungen ab", async (t) => {
  const databaseUrl = await createIsolatedDatabase(t);
  await migrateSqliteDatabase(databaseUrl);
  await seedSqliteDatabase(databaseUrl);

  const fixture = await readSqliteSeedFixture();
  const database = createSqliteDatabaseClient(databaseUrl);
  t.after(async () => database.$disconnect());

  await assert.rejects(() =>
    database.calendarEvent.create({
      data: {
        id: "20000000-0000-4000-8000-000000000001",
        userId: fixture.user.id,
        calendarId: fixture.calendar.id,
        uid: "sqlite-invalid-mixed-time@lifeos.local",
        title: "Ungültige gemischte Zeitform",
        isAllDay: true,
        startsAt: new Date("2030-04-01T08:00:00.000Z"),
        endsAt: new Date("2030-04-01T09:00:00.000Z"),
        startDate: "2030-04-01",
        endDate: "2030-04-02",
        etag: '"sqlite-invalid-v1"',
      },
    }),
  );

  await assert.rejects(() =>
    database.calendarEvent.create({
      data: {
        id: "20000000-0000-4000-8000-000000000005",
        userId: fixture.user.id,
        calendarId: fixture.calendar.id,
        uid: "sqlite-invalid-all-day-range@lifeos.local",
        title: "Ungültige Ganztagsgrenze",
        isAllDay: true,
        startDate: "2030-04-02",
        endDate: "2030-04-02",
        etag: '"sqlite-invalid-all-day-v1"',
      },
    }),
  );

  await assert.rejects(() =>
    database.calendarEvent.create({
      data: {
        id: "20000000-0000-4000-8000-000000000002",
        userId: "20000000-0000-4000-8000-000000000099",
        calendarId: fixture.calendar.id,
        uid: "sqlite-invalid-owner@lifeos.local",
        title: "Ungültiger Besitzer",
        startsAt: new Date("2030-04-01T08:00:00.000Z"),
        endsAt: new Date("2030-04-01T09:00:00.000Z"),
        etag: '"sqlite-invalid-owner-v1"',
      },
    }),
  );

  await assert.rejects(() =>
    database.calendarEvent.create({
      data: {
        id: "20000000-0000-4000-8000-000000000003",
        userId: fixture.user.id,
        calendarId: fixture.calendar.id,
        uid: "sqlite-invalid-reminder@lifeos.local",
        title: "Ungültige Erinnerung",
        startsAt: new Date("2030-04-01T08:00:00.000Z"),
        endsAt: new Date("2030-04-01T09:00:00.000Z"),
        reminderMinutes: [10081],
        etag: '"sqlite-invalid-reminder-v1"',
      },
    }),
  );

  await assert.rejects(() =>
    database.calendar.create({
      data: {
        id: "20000000-0000-4000-8000-000000000004",
        userId: fixture.user.id,
        externalId: "sqlite-second-primary-calendar",
        name: "Unzulässiger zweiter Primärkalender",
        isPrimary: true,
      },
    }),
  );
});

test("speichert Projektziele und Meilensteine mit reinen Fälligkeitstagen und Besitzergrenzen", async (t) => {
  const databaseUrl = await createIsolatedDatabase(t);
  await migrateSqliteDatabase(databaseUrl);
  await seedSqliteDatabase(databaseUrl);
  const fixture = await readSqliteSeedFixture();
  const database = createSqliteDatabaseClient(databaseUrl);
  t.after(async () => database.$disconnect());
  const project = await database.project.findFirstOrThrow({
    where: { userId: fixture.user.id },
    include: { goals: true, milestones: true, eventLinks: true },
  });
  assert.equal(project.dueDate, "2030-03-31");
  assert.equal(project.goals[0]?.dueDate, "2030-02-28");
  assert.equal(project.milestones[0]?.dueDate, "2030-01-31");
  assert.equal(project.eventLinks.length, 1);
  await assert.rejects(() =>
    database.projectGoal.create({
      data: {
        userId: "fremder-besitzer",
        projectId: project.id,
        title: "Unzulässiges fremdes Ziel",
      },
    }),
  );
  await assert.rejects(() =>
    database.projectMilestone.create({
      data: {
        userId: fixture.user.id,
        projectId: project.id,
        title: "Ungültiges Datum",
        dueDate: "31.01.2030",
      },
    }),
  );
  await assert.rejects(() =>
    database.projectGoal.update({
      where: { id: project.goals[0]!.id },
      data: { archivedAt: new Date("2000-01-01T00:00:00.000Z") },
    }),
  );
  await assert.rejects(() =>
    database.project.update({
      where: { id: project.id },
      data: { deletedAt: new Date("2000-01-01T00:00:00.000Z") },
    }),
  );
});

test("speichert Notizversionen und Dokumentmetadaten mit Besitzergrenzen", async (t) => {
  const databaseUrl = await createIsolatedDatabase(t);
  await migrateSqliteDatabase(databaseUrl);
  await seedSqliteDatabase(databaseUrl);
  const fixture = await readSqliteSeedFixture();
  const database = createSqliteDatabaseClient(databaseUrl);
  t.after(async () => database.$disconnect());
  const seeded = await database.note.findFirstOrThrow({
    where: { userId: fixture.user.id },
    include: { versions: true },
  });
  assert.equal(seeded.format, "markdown");
  assert.equal(seeded.versions.length, 1);
  assert.equal(seeded.searchEnabled, true);

  await assert.rejects(() =>
    database.note.create({
      data: {
        userId: fixture.user.id,
        projectId: "00000000-0000-4000-8000-000000000999",
        title: "Ungültige Verknüpfung",
        content: "synthetisch",
      },
    }),
  );
  await assert.rejects(() =>
    database.document.create({
      data: {
        userId: "00000000-0000-4000-8000-000000000999",
        storageKey: "00000000-0000-4000-8000-000000000801.txt",
        fileName: "synthetisch.txt",
        mimeType: "text/plain",
        byteSize: 12,
        sha256: "a".repeat(64),
        modifiedAt: new Date(),
      },
    }),
  );
});
