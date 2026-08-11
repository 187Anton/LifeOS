import assert from "node:assert/strict";
import test from "node:test";
import type {
  PlanningSourceData,
  PlanningRepository,
} from "../src/modules/planning/repository.js";
import { PlanningService } from "../src/modules/planning/service.js";
import { dayRange, zonedDateTime } from "../src/modules/planning/time.js";

const source = (): PlanningSourceData =>
  ({
    settings: { timezone: "Europe/Berlin" },
    events: [
      {
        id: "event-1",
        title: "Synthetischer Termin A",
        isAllDay: false,
        startsAt: new Date("2032-03-29T07:00:00.000Z"),
        endsAt: new Date("2032-03-29T08:00:00.000Z"),
        updatedAt: new Date("2032-03-01T00:00:00.000Z"),
      },
      {
        id: "event-2",
        title: "Synthetischer Termin B",
        isAllDay: false,
        startsAt: new Date("2032-03-29T07:30:00.000Z"),
        endsAt: new Date("2032-03-29T08:30:00.000Z"),
        updatedAt: new Date("2032-03-01T00:00:00.000Z"),
      },
    ],
    tasks: [
      {
        id: "task-1",
        title: "Hohe Frist A",
        status: "open",
        priority: "high",
        dueDate: new Date("2032-03-29T00:00:00.000Z"),
        updatedAt: new Date("2032-03-01T00:00:00.000Z"),
      },
      {
        id: "task-2",
        title: "Hohe Frist B",
        status: "open",
        priority: "critical",
        dueDate: new Date("2032-03-29T00:00:00.000Z"),
        updatedAt: new Date("2032-03-01T00:00:00.000Z"),
      },
    ],
    studyEntries: [],
    workProjects: [],
    workTimeEntries: [
      {
        id: "work-time-1",
        kind: "planned",
        title: "Geplanter Arbeitsblock",
        startsAt: new Date("2032-03-29T09:00:00.000Z"),
        endsAt: new Date("2032-03-29T10:30:00.000Z"),
        updatedAt: new Date("2032-03-01T00:00:00.000Z"),
      },
    ],
    availabilityWindows: [
      {
        id: "availability-1",
        userId: "owner-1",
        weekday: 1,
        startMinute: 9 * 60,
        endMinute: 10 * 60,
        timezone: "Europe/Berlin",
        label: "Synthetische Verfügbarkeit",
        createdAt: new Date("2032-03-01T00:00:00.000Z"),
        updatedAt: new Date("2032-03-01T00:00:00.000Z"),
      },
    ],
  }) as unknown as PlanningSourceData;

const repository = (data: PlanningSourceData): PlanningRepository => ({
  getSources: async () => data,
  createAvailability: async () => {
    throw new Error("nicht verwendet");
  },
  updateAvailability: async () => {
    throw new Error("nicht verwendet");
  },
  deleteAvailability: async () => {
    throw new Error("nicht verwendet");
  },
});

test("erkennt Überschneidung, Überfälligkeit, Kapazität und Prioritätscluster regelbasiert", async () => {
  const service = new PlanningService(
    repository(source()),
    () => new Date("2032-04-02T10:00:00.000Z"),
  );
  const planning = await service.getPlanning("owner-1", {
    from: "2032-03-29",
    to: "2032-03-29",
  });
  assert.deepEqual(
    new Set(planning.warnings.map((warning) => warning.kind)),
    new Set(["overlap", "overdue", "capacity", "high_priority_cluster"]),
  );
  assert.ok(
    planning.warnings.some(
      (warning) =>
        warning.kind === "capacity" && warning.message.includes("30 Minuten"),
    ),
  );
  assert.equal(planning.items[0]?.overdue, true);
});

test("Bereichsfilter verändern nur die ausgegebene Sicht", async () => {
  const data = source();
  const service = new PlanningService(repository(data));
  const planning = await service.getPlanning("owner-1", {
    from: "2032-03-29",
    to: "2032-03-29",
    areas: ["calendar"],
  });
  assert.equal(planning.items.length, 2);
  assert.ok(planning.items.every((item) => item.area === "calendar"));
  assert.equal(data.tasks.length, 2);
  assert.ok(planning.warnings.some((warning) => warning.kind === "overlap"));
});

test("berechnet Tagesgrenzen bei Sommer- und Winterzeit korrekt", () => {
  const spring = dayRange("2032-03-28", "2032-03-28", "Europe/Berlin");
  const autumn = dayRange("2032-10-31", "2032-10-31", "Europe/Berlin");
  assert.equal(
    (spring.toExclusive.getTime() - spring.from.getTime()) / 3_600_000,
    23,
  );
  assert.equal(
    (autumn.toExclusive.getTime() - autumn.from.getTime()) / 3_600_000,
    25,
  );
  assert.equal(
    (zonedDateTime("2032-10-31", 4 * 60, "Europe/Berlin").getTime() -
      zonedDateTime("2032-10-31", 60, "Europe/Berlin").getTime()) /
      3_600_000,
    4,
  );
});
