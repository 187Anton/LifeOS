import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../src/errors.js";
import type {
  EntryValues,
  StudyRepository,
} from "../src/modules/study/repository.js";
import { StudyService } from "../src/modules/study/service.js";

const repository = (created: EntryValues[]): StudyRepository => ({
  getOverview: async () => ({
    programs: [],
    modules: [],
    entries: [],
    history: [],
  }),
  createProgram: async () => {
    throw new Error("nicht verwendet");
  },
  updateProgram: async () => {
    throw new Error("nicht verwendet");
  },
  createModule: async () => {
    throw new Error("nicht verwendet");
  },
  updateModule: async () => {
    throw new Error("nicht verwendet");
  },
  createEntry: async (_userId, values) => {
    created.push(values);
    return {
      id: "entry-1",
      ownerId: "owner-1",
      ...values,
      dueDate: values.dueDate?.toISOString().slice(0, 10) ?? null,
      startsAt: values.startsAt?.toISOString() ?? null,
      endsAt: values.endsAt?.toISOString() ?? null,
      archivedAt: null,
      createdAt: "2032-01-01T00:00:00.000Z",
      updatedAt: "2032-01-01T00:00:00.000Z",
    };
  },
  updateEntry: async () => {
    throw new Error("nicht verwendet");
  },
});

test("bewahrt reine Prüfungstage ohne erfundene Uhrzeit", async () => {
  const captured: EntryValues[] = [];
  const service = new StudyService(repository(captured));
  const entry = await service.createEntry("owner-1", {
    moduleId: "module-1",
    kind: "exam",
    title: "Synthetische Prüfung",
    dueDate: "2032-07-15",
  });
  assert.equal(entry.dueDate, "2032-07-15");
  assert.equal(entry.startsAt, null);
  assert.equal(captured[0]?.timezone, null);
});
test("normalisiert Lehrveranstaltungen als Zeitpunkt mit IANA-Zeitzone", async () => {
  const captured: EntryValues[] = [];
  const service = new StudyService(repository(captured));
  const entry = await service.createEntry("owner-1", {
    moduleId: "module-1",
    kind: "lecture",
    title: "Synthetische Vorlesung",
    startsAt: "2032-10-31T09:00:00+01:00",
    endsAt: "2032-10-31T10:30:00+01:00",
    timezone: "Europe/Berlin",
  });
  assert.equal(entry.startsAt, "2032-10-31T08:00:00.000Z");
  assert.equal(entry.timezone, "Europe/Berlin");
});
test("weist unvollständige oder rückwärts laufende Zeitangaben verständlich ab", async () => {
  const service = new StudyService(repository([]));
  await assert.rejects(
    () =>
      service.createEntry("owner-1", {
        moduleId: "module-1",
        kind: "learning",
        title: "Ungültige Lernzeit",
        startsAt: "2032-07-15T10:00:00+02:00",
        endsAt: "2032-07-15T09:00:00+02:00",
        timezone: "Europe/Berlin",
      }),
    (error: unknown) =>
      error instanceof ApiError &&
      error.code === "VALIDATION_ERROR" &&
      error.status === 400,
  );
});
