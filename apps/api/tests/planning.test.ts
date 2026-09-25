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
        userId: "owner-1",
        uid: "synthetische-serie-1",
        calendarId: "calendar-1",
        title: "Synthetischer Termin A",
        isAllDay: false,
        startsAt: new Date("2032-03-29T07:00:00.000Z"),
        endsAt: new Date("2032-03-29T08:00:00.000Z"),
        timezone: "Europe/Berlin",
        updatedAt: new Date("2032-03-01T00:00:00.000Z"),
      },
      {
        id: "event-2",
        userId: "owner-1",
        uid: "synthetischer-termin-2",
        calendarId: "calendar-1",
        title: "Synthetischer Termin B",
        isAllDay: false,
        startsAt: new Date("2032-03-29T07:30:00.000Z"),
        endsAt: new Date("2032-03-29T08:30:00.000Z"),
        timezone: "Europe/Berlin",
        updatedAt: new Date("2032-03-01T00:00:00.000Z"),
      },
    ],
    tasks: [
      {
        id: "task-1",
        userId: "owner-1",
        title: "Hohe Frist A",
        status: "open",
        priority: "high",
        dueDate: new Date("2032-03-29T00:00:00.000Z"),
        updatedAt: new Date("2032-03-01T00:00:00.000Z"),
      },
      {
        id: "task-2",
        userId: "owner-1",
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
        userId: "owner-1",
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

const sourceWith = (overrides: Record<string, unknown>): PlanningSourceData =>
  ({ ...source(), ...overrides }) as unknown as PlanningSourceData;

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

/**
 * Synthetische Aufgaben für die gemeinsame Kalender- und Planungsprojektion.
 */
const taskFixture = (overrides: Record<string, unknown>) =>
  ({
    userId: "owner-1",
    status: "open",
    priority: "high",
    title: "Synthetische Aufgabe",
    dueDate: null,
    scheduledStartAt: null,
    estimatedDurationMinutes: null,
    updatedAt: new Date("2032-03-01T00:00:00.000Z"),
    ...overrides,
  }) as unknown as PlanningSourceData["tasks"][number];

const studyEntryFixture = (overrides: Record<string, unknown>) =>
  ({
    userId: "owner-1",
    status: "planned",
    kind: "submission",
    title: "Synthetischer Studieneintrag",
    dueDate: null,
    startsAt: null,
    endsAt: null,
    taskId: null,
    calendarEventId: null,
    updatedAt: new Date("2032-03-01T00:00:00.000Z"),
    ...overrides,
  }) as unknown as PlanningSourceData["studyEntries"][number];

test("unterscheidet Frist, geplanten Zeitblock und Startmarkierung", async () => {
  const data = sourceWith({
    events: [],
    workTimeEntries: [],
    availabilityWindows: [],
    tasks: [
      taskFixture({ id: "task-deadline", dueDate: new Date("2032-03-29") }),
      taskFixture({
        id: "task-block",
        scheduledStartAt: new Date("2032-03-29T08:00:00.000Z"),
        estimatedDurationMinutes: 90,
      }),
      taskFixture({
        id: "task-start",
        scheduledStartAt: new Date("2032-03-29T06:00:00.000Z"),
      }),
    ],
  });
  const planning = await new PlanningService(repository(data)).getPlanning(
    "owner-1",
    { from: "2032-03-29", to: "2032-03-29" },
  );

  const deadline = planning.items.find(
    (item) => item.id === "task:task-deadline:deadline",
  );
  assert.ok(deadline);
  assert.equal(deadline.kind, "deadline");
  assert.equal(deadline.startsAt, null);
  assert.equal(deadline.endsAt, null);
  assert.equal(deadline.durationMinutes, null);
  assert.equal(deadline.objectType, "task");
  assert.equal(deadline.ownerId, "owner-1");
  assert.equal(deadline.status, "open");
  assert.equal(deadline.editable, "task");

  const block = planning.items.find(
    (item) => item.id === "task:task-block:planned",
  );
  assert.ok(block);
  assert.equal(block.kind, "planned_task");
  assert.equal(block.startsAt, "2032-03-29T08:00:00.000Z");
  assert.equal(block.endsAt, "2032-03-29T09:30:00.000Z");
  assert.equal(block.durationMinutes, 90);

  const marker = planning.items.find(
    (item) => item.id === "task:task-start:start",
  );
  assert.ok(marker);
  assert.equal(marker.kind, "start_marker");
  assert.equal(marker.startsAt, "2032-03-29T06:00:00.000Z");
  assert.equal(marker.endsAt, null);
  assert.equal(marker.durationMinutes, null);
  assert.equal(marker.date, "2032-03-29");
});

test("rechnet Frist und Startmarkierung nicht in die Auslastung", async () => {
  const data = sourceWith({
    events: [],
    workTimeEntries: [],
    availabilityWindows: [],
    tasks: [
      taskFixture({ id: "task-deadline", dueDate: new Date("2032-03-29") }),
      taskFixture({
        id: "task-start",
        scheduledStartAt: new Date("2032-03-29T06:00:00.000Z"),
      }),
    ],
  });
  const planning = await new PlanningService(repository(data)).getPlanning(
    "owner-1",
    { from: "2032-03-29", to: "2032-03-29" },
  );
  assert.deepEqual(planning.warnings, []);

  const withBlock = sourceWith({
    events: [],
    workTimeEntries: [],
    availabilityWindows: [
      {
        id: "availability-1",
        userId: "owner-1",
        weekday: 1,
        startMinute: 9 * 60,
        endMinute: 9 * 60 + 30,
        timezone: "Europe/Berlin",
        label: "Synthetische Verfügbarkeit",
        createdAt: new Date("2032-03-01T00:00:00.000Z"),
        updatedAt: new Date("2032-03-01T00:00:00.000Z"),
      },
    ],
    tasks: [
      taskFixture({ id: "task-deadline", dueDate: new Date("2032-03-29") }),
      taskFixture({
        id: "task-start",
        scheduledStartAt: new Date("2032-03-29T06:00:00.000Z"),
      }),
      taskFixture({
        id: "task-block",
        scheduledStartAt: new Date("2032-03-29T08:00:00.000Z"),
        estimatedDurationMinutes: 45,
      }),
    ],
  });
  const withBlockPlanning = await new PlanningService(
    repository(withBlock),
  ).getPlanning("owner-1", { from: "2032-03-29", to: "2032-03-29" });
  const capacity = withBlockPlanning.warnings.find(
    (warning) => warning.kind === "capacity",
  );
  assert.ok(capacity);
  assert.equal(capacity.message.includes("15 Minuten"), true);
  assert.deepEqual(capacity.itemIds, ["task:task-block:planned"]);
});

test("unterdrückt verknüpfte Studieneinträge zugunsten des führenden Termins", async () => {
  const linkedStart = new Date("2032-03-29T07:00:00.000Z");
  const linkedEnd = new Date("2032-03-29T08:00:00.000Z");
  const data = sourceWith({
    tasks: [],
    workTimeEntries: [],
    availabilityWindows: [],
    studyEntries: [
      studyEntryFixture({
        id: "entry-linked",
        title: "Verknüpfte Vorlesung",
        kind: "lecture",
        calendarEventId: "event-1",
        startsAt: linkedStart,
        endsAt: linkedEnd,
      }),
      studyEntryFixture({
        id: "entry-linked-deadline",
        title: "Verknüpfte Abgabe",
        dueDate: new Date("2032-03-29"),
        calendarEventId: "event-1",
        startsAt: linkedStart,
        endsAt: linkedEnd,
      }),
      studyEntryFixture({
        id: "entry-own",
        title: "Eigene Lernzeit",
        kind: "learning",
        startsAt: linkedStart,
        endsAt: linkedEnd,
      }),
    ],
  });
  const planning = await new PlanningService(repository(data)).getPlanning(
    "owner-1",
    { from: "2032-03-29", to: "2032-03-29" },
  );

  const event = planning.items.find(
    (item) =>
      item.objectType === "calendar_event" &&
      item.uid === "synthetische-serie-1",
  );
  assert.ok(event);
  assert.equal(event.area, "calendar");
  assert.equal(event.kind, "fixed_event");
  assert.equal(event.editable, "calendar_event");
  assert.equal(
    planning.items.some((item) => item.sourceId === "entry-linked"),
    false,
  );
  assert.ok(
    planning.items.some(
      (item) =>
        item.sourceId === "entry-linked-deadline" && item.kind === "deadline",
    ),
  );
  const own = planning.items.find((item) => item.sourceId === "entry-own");
  assert.ok(own);
  assert.equal(own.kind, "planned_task");
  assert.equal(own.editable, null);
  assert.equal(
    planning.items.filter((item) => item.kind !== "availability").length,
    4,
  );
});

test("projiziert keine fremden Datensätze desselben Repository-Aufrufs", async () => {
  const data = sourceWith({
    tasks: [
      taskFixture({ id: "task-own", dueDate: new Date("2032-03-29") }),
      taskFixture({
        id: "task-foreign",
        userId: "other-1",
        dueDate: new Date("2032-03-29"),
      }),
    ],
    events: [
      {
        id: "event-foreign",
        userId: "other-1",
        uid: "fremder-termin",
        calendarId: "calendar-foreign",
        title: "Fremder Termin",
        isAllDay: false,
        startsAt: new Date("2032-03-29T07:00:00.000Z"),
        endsAt: new Date("2032-03-29T08:00:00.000Z"),
        timezone: "Europe/Berlin",
        updatedAt: new Date("2032-03-01T00:00:00.000Z"),
      },
    ],
    studyEntries: [
      studyEntryFixture({
        id: "entry-foreign",
        userId: "other-1",
        dueDate: new Date("2032-03-29"),
      }),
    ],
    workTimeEntries: [
      {
        id: "work-time-foreign",
        userId: "other-1",
        kind: "planned",
        title: "Fremder Arbeitsblock",
        startsAt: new Date("2032-03-29T09:00:00.000Z"),
        endsAt: new Date("2032-03-29T10:00:00.000Z"),
        updatedAt: new Date("2032-03-01T00:00:00.000Z"),
      },
    ],
    availabilityWindows: [],
  });
  const planning = await new PlanningService(repository(data)).getPlanning(
    "owner-1",
    { from: "2032-03-29", to: "2032-03-29" },
  );
  assert.deepEqual(
    planning.items.map((item) => item.sourceId),
    ["task-own"],
  );
  assert.equal(
    planning.items.every((item) => item.ownerId === "owner-1"),
    true,
  );
  assert.equal(
    planning.items.some((item) => item.sourceId === "entry-foreign"),
    false,
  );
  assert.equal(
    planning.items.some((item) => item.sourceId === "work-time-foreign"),
    false,
  );
});

test("hält Startmarkierung und Zeitblock über die Zeitumstellung korrekt", async () => {
  const data = sourceWith({
    events: [],
    tasks: [
      taskFixture({
        id: "task-spring",
        scheduledStartAt: new Date("2032-03-28T00:30:00.000Z"),
        estimatedDurationMinutes: 120,
      }),
      taskFixture({
        id: "task-autumn",
        scheduledStartAt: new Date("2032-10-31T00:00:00.000Z"),
      }),
    ],
    workTimeEntries: [],
    availabilityWindows: [],
  });
  const service = new PlanningService(repository(data));
  const spring = await service.getPlanning("owner-1", {
    from: "2032-03-28",
    to: "2032-03-28",
  });
  const block = spring.items.find(
    (item) => item.id === "task:task-spring:planned",
  );
  assert.ok(block);
  assert.equal(block.date, "2032-03-28");
  assert.equal(block.durationMinutes, 120);
  assert.equal(block.endsAt, "2032-03-28T02:30:00.000Z");

  const autumn = await service.getPlanning("owner-1", {
    from: "2032-10-31",
    to: "2032-10-31",
  });
  const marker = autumn.items.find(
    (item) => item.id === "task:task-autumn:start",
  );
  assert.ok(marker);
  assert.equal(marker.date, "2032-10-31");
  assert.equal(marker.startsAt, "2032-10-31T00:00:00.000Z");
  assert.equal(marker.endsAt, null);

  const nextDay = await service.getPlanning("owner-1", {
    from: "2032-03-29",
    to: "2032-03-29",
  });
  assert.equal(
    nextDay.items.some((item) => item.kind === "start_marker"),
    false,
  );
  assert.equal(
    nextDay.items.some((item) => item.kind === "planned_task"),
    false,
  );
});

test("kennzeichnet jede Quelle mit Objektart, Besitzer und Bearbeitbarkeit", async () => {
  const data = sourceWith({
    tasks: [taskFixture({ id: "task-1", dueDate: new Date("2032-03-29") })],
  });
  const planning = await new PlanningService(repository(data)).getPlanning(
    "owner-1",
    { from: "2032-03-29", to: "2032-03-29" },
  );
  const byObjectType = new Map(
    planning.items.map((item) => [item.objectType, item]),
  );
  assert.deepEqual([...byObjectType.keys()].sort(), [
    "availability_window",
    "calendar_event",
    "task",
    "work_time_entry",
  ]);
  for (const item of planning.items) {
    assert.equal(item.ownerId, "owner-1");
    assert.equal(item.status.length > 0, true);
    assert.equal(
      ["calendar_event", "task", null].includes(item.editable),
      true,
    );
  }
  assert.equal(byObjectType.get("calendar_event")?.editable, "calendar_event");
  assert.equal(byObjectType.get("availability_window")?.editable, null);
});

/**
 * Geplanter Block 23:00–01:00 in der Profilzeitzone Europe/Berlin: Start am
 * 14.06.2032 um 21:00Z (= 23:00 Berlin), Ende am 14.06.2032 um 23:00Z
 * (= 15.06.2032 01:00 Berlin).
 */
const midnightBlockFixture = () =>
  taskFixture({
    id: "task-midnight",
    scheduledStartAt: new Date("2032-06-14T21:00:00.000Z"),
    estimatedDurationMinutes: 120,
  });

test("ordnet Ereignisse nach gespeicherter Ereignis- und Blöcke nach Profilzeitzone zu", async () => {
  const data = sourceWith({
    tasks: [
      taskFixture({
        id: "task-cross",
        scheduledStartAt: new Date("2032-03-29T02:00:00.000Z"),
        estimatedDurationMinutes: 60,
      }),
    ],
    workTimeEntries: [],
    availabilityWindows: [],
    events: [
      {
        id: "event-ny",
        userId: "owner-1",
        uid: "synthetischer-ny-termin",
        calendarId: "calendar-ny",
        title: "Synthetischer Termin New York",
        isAllDay: false,
        startsAt: new Date("2032-03-29T07:00:00.000Z"),
        endsAt: new Date("2032-03-29T08:00:00.000Z"),
        timezone: "America/New_York",
        updatedAt: new Date("2032-03-01T00:00:00.000Z"),
      },
    ],
  });
  const planning = await new PlanningService(repository(data)).getPlanning(
    "owner-1",
    { from: "2032-03-29", to: "2032-03-29" },
  );

  const event = planning.items.find((item) => item.sourceId === "event-ny");
  assert.ok(event);
  /** Anzeige in der GESPEICHERTEN Ereigniszeitzone und im Quellkalender. */
  assert.equal(event.timezone, "America/New_York");
  assert.equal(event.calendarId, "calendar-ny");
  assert.equal(event.objectType, "calendar_event");
  assert.equal(event.editable, "calendar_event");

  /**
   * 2032-03-29T02:00Z ist in Europe/Berlin der 29.03. (04:00), in
   * America/New_York aber noch der 28.03. (22:00). Der Block wird nach der
   * Profilzeitzone einsortiert.
   */
  const block = planning.items.find((item) => item.sourceId === "task-cross");
  assert.ok(block);
  assert.equal(block.date, "2032-03-29");
  assert.equal(block.timezone, "Europe/Berlin");
});

test("zeigt einen Mitternachtsblock genau einmal mit Anzeigetag in der Profilzeitzone", async () => {
  const data = sourceWith({
    events: [],
    workTimeEntries: [],
    availabilityWindows: [],
    tasks: [midnightBlockFixture()],
  });
  const service = new PlanningService(repository(data));

  /** (i) Zeitraum des Starttags: genau ein Item, date = Starttag. */
  const startDay = await service.getPlanning("owner-1", {
    from: "2032-06-14",
    to: "2032-06-14",
  });
  const startBlocks = startDay.items.filter(
    (item) => item.id === "task:task-midnight:planned",
  );
  assert.equal(startBlocks.length, 1);
  assert.equal(startBlocks[0]?.date, "2032-06-14");
  assert.equal(startBlocks[0]?.durationMinutes, 120);
  assert.equal(startBlocks[0]?.endsAt, "2032-06-14T23:00:00.000Z");

  /**
   * (ii) Zeitraum des Folgetags: Der Block ragt hinein und erscheint mit
   * date = from, genau einmal.
   */
  const nextDay = await service.getPlanning("owner-1", {
    from: "2032-06-15",
    to: "2032-06-15",
  });
  const continuation = nextDay.items.filter(
    (item) => item.id === "task:task-midnight:planned",
  );
  assert.equal(continuation.length, 1);
  assert.equal(continuation[0]?.date, "2032-06-15");
  assert.equal(continuation[0]?.startsAt, "2032-06-14T21:00:00.000Z");
  /** Der Fortsetzungstag allein erzeugt weder `capacity` noch `missing_data`. */
  assert.deepEqual(nextDay.warnings, []);

  /**
   * (iii) Innerhalb eines Zeitraums erscheint der Block genau einmal, und er
   * wird genau einmal in die Kapazität gerechnet – am eigenen Starttag, nicht
   * zusätzlich am Fortsetzungstag.
   */
  const bothDays = await service.getPlanning("owner-1", {
    from: "2032-06-14",
    to: "2032-06-15",
  });
  const bothDayBlocks = bothDays.items.filter(
    (item) => item.kind === "planned_task",
  );
  assert.equal(bothDayBlocks.length, 1);
  assert.equal(bothDayBlocks[0]?.date, "2032-06-14");
  const loadWarnings = bothDays.warnings.filter(
    (warning) => warning.kind === "capacity" || warning.kind === "missing_data",
  );
  assert.equal(loadWarnings.length, 1);
  assert.equal(loadWarnings[0]?.date, "2032-06-14");
  assert.deepEqual(loadWarnings[0]?.itemIds, ["task:task-midnight:planned"]);
});

test("zählt einen Mitternachtsblock nicht doppelt gegen die Verfügbarkeit", async () => {
  const data = sourceWith({
    events: [],
    workTimeEntries: [],
    tasks: [midnightBlockFixture()],
    availabilityWindows: [
      {
        id: "availability-midnight",
        userId: "owner-1",
        weekday: 1,
        startMinute: 20 * 60,
        endMinute: 22 * 60,
        timezone: "Europe/Berlin",
        label: "Synthetische Nachtverfügbarkeit",
        createdAt: new Date("2032-03-01T00:00:00.000Z"),
        updatedAt: new Date("2032-03-01T00:00:00.000Z"),
      },
    ],
  });
  const planning = await new PlanningService(repository(data)).getPlanning(
    "owner-1",
    { from: "2032-06-14", to: "2032-06-15" },
  );
  /**
   * 120 geplante Minuten treffen am Starttag auf 120 Verfügbarkeitsminuten.
   * Würde die Fortsetzung am 15.06. ein zweites Mal zählen, entstünde dort
   * mangels Verfügbarkeit eine zusätzliche Warnung.
   */
  assert.deepEqual(
    planning.warnings.filter(
      (warning) =>
        warning.kind === "capacity" || warning.kind === "missing_data",
    ),
    [],
  );
});

test("führt einen Mitternachtsblock über die Wochengrenze in beiden Wochen", async () => {
  const data = sourceWith({
    events: [],
    workTimeEntries: [],
    availabilityWindows: [],
    tasks: [
      taskFixture({
        id: "task-weekend",
        scheduledStartAt: new Date("2032-06-20T21:00:00.000Z"),
        estimatedDurationMinutes: 120,
      }),
    ],
  });
  const service = new PlanningService(repository(data));

  /** Woche 1: Montag 14.06. bis Sonntag 20.06.2032. */
  const firstWeek = await service.getPlanning("owner-1", {
    from: "2032-06-14",
    to: "2032-06-20",
  });
  const firstBlock = firstWeek.items.filter(
    (item) => item.id === "task:task-weekend:planned",
  );
  assert.equal(firstBlock.length, 1);
  assert.equal(firstBlock[0]?.date, "2032-06-20");

  /** Woche 2: Montag 21.06. bis Sonntag 27.06.2032. */
  const secondWeek = await service.getPlanning("owner-1", {
    from: "2032-06-21",
    to: "2032-06-27",
  });
  const secondBlock = secondWeek.items.filter(
    (item) => item.id === "task:task-weekend:planned",
  );
  assert.equal(secondBlock.length, 1);
  /** In der zweiten Woche erscheint die Fortsetzung am Wochenanfang. */
  assert.equal(secondBlock[0]?.date, "2032-06-21");

  /** Kapazität genau einmal: nur am eigenen Starttag der ersten Woche. */
  assert.deepEqual(
    firstWeek.warnings
      .filter(
        (warning) =>
          warning.kind === "capacity" || warning.kind === "missing_data",
      )
      .map((warning) => warning.date),
    ["2032-06-20"],
  );
  assert.deepEqual(
    secondWeek.warnings.filter(
      (warning) =>
        warning.kind === "capacity" || warning.kind === "missing_data",
    ),
    [],
  );
});

test("lässt den API-Filter für abgebrochene Studieneinträge bewusst unverändert", async () => {
  const data = sourceWith({
    events: [],
    tasks: [],
    workTimeEntries: [],
    availabilityWindows: [],
    studyEntries: [
      studyEntryFixture({
        id: "entry-cancelled",
        status: "cancelled",
        dueDate: new Date("2032-06-14"),
      }),
      studyEntryFixture({
        id: "entry-completed",
        status: "completed",
        dueDate: new Date("2032-06-14"),
      }),
      studyEntryFixture({
        id: "entry-planned",
        status: "planned",
        dueDate: new Date("2032-06-14"),
      }),
    ],
  });
  const planning = await new PlanningService(repository(data)).getPlanning(
    "owner-1",
    { from: "2032-06-14", to: "2032-06-14" },
  );
  const ids = planning.items.map((item) => item.sourceId);
  /**
   * Die Planungs-API filtert ausschließlich `cancelled`; `completed` bleibt in
   * der reinen Projektion sichtbar. Die Kalenderansicht (Web) filtert
   * zusätzlich `completed` und `paused`. Diese bewusste Abweichung ist hier
   * festgehalten, damit sie nicht versehentlich verwischt.
   */
  assert.equal(ids.includes("entry-cancelled"), false);
  assert.equal(ids.includes("entry-completed"), true);
  assert.equal(ids.includes("entry-planned"), true);
});

test("zeigt den Studieneintrag, wenn der führende Termin nicht geliefert wird", async () => {
  const linkedStart = new Date("2032-03-29T07:00:00.000Z");
  const linkedEnd = new Date("2032-03-29T08:00:00.000Z");
  const data = sourceWith({
    tasks: [],
    workTimeEntries: [],
    availabilityWindows: [],
    events: [
      {
        id: "event-other-calendar",
        userId: "owner-1",
        uid: "synthetischer-termin-anderer-kalender",
        calendarId: "calendar-ny",
        title: "Termin in einem anderen Kalender",
        isAllDay: false,
        startsAt: new Date("2032-04-05T07:00:00.000Z"),
        endsAt: new Date("2032-04-05T08:00:00.000Z"),
        timezone: "Europe/Berlin",
        updatedAt: new Date("2032-03-01T00:00:00.000Z"),
      },
    ],
    studyEntries: [
      studyEntryFixture({
        id: "entry-outside",
        title: "Vorlesung außerhalb des Zeitraums",
        kind: "lecture",
        calendarEventId: "event-other-calendar",
        startsAt: linkedStart,
        endsAt: linkedEnd,
      }),
      studyEntryFixture({
        id: "entry-not-delivered",
        title: "Vorlesung ohne gelieferten Termin",
        kind: "lecture",
        calendarEventId: "event-missing",
        startsAt: linkedStart,
        endsAt: linkedEnd,
      }),
    ],
  });
  const planning = await new PlanningService(repository(data)).getPlanning(
    "owner-1",
    { from: "2032-03-29", to: "2032-03-29" },
  );
  /** Der Termin liegt außerhalb des Zeitraums und wird nicht projiziert. */
  assert.equal(
    planning.items.some((item) => item.sourceId === "event-other-calendar"),
    false,
  );
  assert.ok(planning.items.some((item) => item.sourceId === "entry-outside"));
  /**
   * Ein referenzierter, aber nicht gelieferter Termin (anderer Kalender bzw.
   * nicht im Ergebnis enthalten) unterdrückt den Studieneintrag nicht.
   */
  assert.ok(
    planning.items.some((item) => item.sourceId === "entry-not-delivered"),
  );
});

test("unterdrückt verknüpfte Studieneinträge nur gegen die gelieferte Projektion", async () => {
  const data = sourceWith({
    tasks: [],
    workTimeEntries: [],
    availabilityWindows: [],
    studyEntries: [
      studyEntryFixture({
        id: "entry-linked",
        title: "Verknüpfte Vorlesung",
        kind: "lecture",
        calendarEventId: "event-1",
        startsAt: new Date("2032-03-29T07:00:00.000Z"),
        endsAt: new Date("2032-03-29T08:00:00.000Z"),
      }),
    ],
  });
  const service = new PlanningService(repository(data));

  /** Ist der Bereich „Kalender" abgewählt, erscheint der Termin nicht. */
  const withoutCalendar = await service.getPlanning("owner-1", {
    from: "2032-03-29",
    to: "2032-03-29",
    areas: ["study"],
  });
  assert.equal(
    withoutCalendar.items.some((item) => item.area === "calendar"),
    false,
  );
  assert.ok(
    withoutCalendar.items.some((item) => item.sourceId === "entry-linked"),
  );

  /** Wird der Termin geliefert, ersetzt er die verknüpfte Studienprojektion. */
  const withCalendar = await service.getPlanning("owner-1", {
    from: "2032-03-29",
    to: "2032-03-29",
  });
  assert.ok(withCalendar.items.some((item) => item.sourceId === "event-1"));
  assert.equal(
    withCalendar.items.some((item) => item.sourceId === "entry-linked"),
    false,
  );
});
