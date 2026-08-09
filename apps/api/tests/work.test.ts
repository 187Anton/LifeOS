import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../src/errors.js";
import type {
  TimeValues,
  WorkRepository,
} from "../src/modules/work/repository.js";
import { WorkService } from "../src/modules/work/service.js";

const repository = (created: TimeValues[]): WorkRepository => ({
  getOverview: async () => ({
    contexts: [],
    projects: [],
    taskLinks: [],
    timeEntries: [],
    history: [],
  }),
  createContext: async () => {
    throw new Error("nicht verwendet");
  },
  updateContext: async () => {
    throw new Error("nicht verwendet");
  },
  createProject: async () => {
    throw new Error("nicht verwendet");
  },
  updateProject: async () => {
    throw new Error("nicht verwendet");
  },
  createTaskLink: async () => {
    throw new Error("nicht verwendet");
  },
  deleteTaskLink: async () => {
    throw new Error("nicht verwendet");
  },
  createTimeEntry: async (_userId, values) => {
    created.push(values);
    return {
      id: "zeit-1",
      ownerId: "owner-1",
      ...values,
      startsAt: values.startsAt.toISOString(),
      endsAt: values.endsAt.toISOString(),
      durationMinutes: Math.round(
        (values.endsAt.getTime() - values.startsAt.getTime()) / 60_000,
      ),
      archivedAt: null,
      createdAt: "2032-01-01T00:00:00.000Z",
      updatedAt: "2032-01-01T00:00:00.000Z",
    };
  },
  updateTimeEntry: async () => {
    throw new Error("nicht verwendet");
  },
});

test("trennt geplante und tatsächliche Arbeitszeit", async () => {
  const captured: TimeValues[] = [];
  const service = new WorkService(repository(captured));
  const planned = await service.createTimeEntry("owner-1", {
    contextId: "context-1",
    kind: "planned",
    title: "Synthetischer Fokusblock",
    startsAt: "2032-06-15T09:00:00+02:00",
    endsAt: "2032-06-15T10:30:00+02:00",
    timezone: "Europe/Berlin",
  });
  assert.equal(planned.kind, "planned");
  assert.equal(planned.durationMinutes, 90);
  assert.equal(captured[0]?.timezone, "Europe/Berlin");
});

test("berechnet die tatsächliche Dauer über die Zeitumstellung aus den Zeitpunkten", async () => {
  const service = new WorkService(repository([]));
  const actual = await service.createTimeEntry("owner-1", {
    contextId: "context-1",
    kind: "actual",
    title: "Synthetischer DST-Test",
    startsAt: "2032-10-31T01:30:00+02:00",
    endsAt: "2032-10-31T02:30:00+01:00",
    timezone: "Europe/Berlin",
  });
  assert.equal(actual.durationMinutes, 120);
});

test("weist rückwärts laufende Arbeitszeit verständlich ab", async () => {
  const service = new WorkService(repository([]));
  await assert.rejects(
    () =>
      service.createTimeEntry("owner-1", {
        contextId: "context-1",
        kind: "actual",
        title: "Ungültiger Zeitblock",
        startsAt: "2032-06-15T10:00:00+02:00",
        endsAt: "2032-06-15T09:00:00+02:00",
        timezone: "Europe/Berlin",
      }),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 400 &&
      error.code === "VALIDATION_ERROR",
  );
});
