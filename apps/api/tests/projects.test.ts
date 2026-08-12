import assert from "node:assert/strict";
import test from "node:test";

import { calculateProjectProgress } from "../src/modules/projects/progress.js";

const item = (
  status: string,
  values: Partial<{ archivedAt: Date | null; deletedAt: Date | null }> = {},
) => ({
  status,
  archivedAt: values.archivedAt ?? null,
  deletedAt: values.deletedAt ?? null,
});

test("berechnet Projektfortschritt gleichgewichtet aus aktiven Zielen, Meilensteinen und Aufgaben", () => {
  const progress = calculateProjectProgress({
    goals: [item("completed"), item("open"), item("cancelled")],
    milestones: [item("completed"), item("open", { archivedAt: new Date() })],
    tasks: [
      item("done"),
      item("in_progress"),
      item("done", { deletedAt: new Date() }),
    ],
  });
  assert.deepEqual(progress, {
    state: "available",
    percent: 60,
    completedItems: 3,
    totalItems: 5,
    breakdown: {
      goals: { completed: 1, total: 2 },
      milestones: { completed: 1, total: 1 },
      tasks: { completed: 1, total: 2 },
    },
  });
});

test("meldet ohne verwertbare Projektdaten bewusst keinen Fortschrittswert", () => {
  assert.deepEqual(
    calculateProjectProgress({ goals: [], milestones: [], tasks: [] }),
    {
      state: "no_data",
      percent: null,
      completedItems: 0,
      totalItems: 0,
      breakdown: {
        goals: { completed: 0, total: 0 },
        milestones: { completed: 0, total: 0 },
        tasks: { completed: 0, total: 0 },
      },
    },
  );
});
