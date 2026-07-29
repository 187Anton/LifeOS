import { describe, expect, it } from "vitest";

import { buildDashboardView } from "../../src/dashboard";

const task = {
  id: "task-1",
  ownerId: "owner",
  title: "Überfällige Aufgabe",
  description: null,
  status: "open" as const,
  priority: "high" as const,
  dueDate: "2032-04-30",
  scheduledStartAt: null,
  scheduledStartTimezone: null,
  estimatedDurationMinutes: null,
  tags: [],
  area: "work" as const,
  projectId: null,
  parentTaskId: null,
  completedAt: null,
  archivedAt: null,
  createdAt: "2032-04-01T00:00:00.000Z",
  updatedAt: "2032-04-01T00:00:00.000Z",
};

const event = (
  uid: string,
  title: string,
  startsAt: string,
  endsAt: string,
) => ({
  uid,
  title,
  description: null,
  location: null,
  isAllDay: false,
  startsAt,
  endsAt,
  startDate: null,
  endDate: null,
  timezone: "Pacific/Kiritimati",
  recurrenceRule: null,
  reminderMinutes: [],
  etag: `"${uid}"`,
  sequence: 0,
  updatedAt: "2032-04-01T00:00:00.000Z",
  calendarId: "calendar-1",
  calendarName: "Persönlich",
});

describe("Dashboard-Auswertung", () => {
  it("bestimmt Überfälligkeit und heutige Termine in der Benutzerzeitzone", () => {
    const result = buildDashboardView({
      generatedAt: "2032-04-30T10:30:00.000Z",
      timezone: "Pacific/Kiritimati",
      tasks: [task],
      events: [
        event(
          "today",
          "Termin am lokalen 1. Mai",
          "2032-04-30T11:00:00.000Z",
          "2032-04-30T12:00:00.000Z",
        ),
      ],
      projects: [],
    });

    expect(result.today).toBe("2032-05-01");
    expect(result.todayEvents.map((item) => item.source.uid)).toEqual([
      "today",
    ]);
    expect(result.overdueTasks.map((item) => item.id)).toEqual(["task-1"]);
    expect(result.highPriorityTasks).toHaveLength(1);
    expect(result.areas).toEqual([{ area: "work", openTaskCount: 1 }]);
  });

  it("meldet Überschneidungen und fehlende Fälligkeiten ohne Daten zu erfinden", () => {
    const result = buildDashboardView({
      generatedAt: "2032-04-30T10:30:00.000Z",
      timezone: "Pacific/Kiritimati",
      tasks: [{ ...task, dueDate: null }],
      events: [
        event(
          "first",
          "Erster Termin",
          "2032-04-30T11:00:00.000Z",
          "2032-04-30T12:00:00.000Z",
        ),
        event(
          "second",
          "Zweiter Termin",
          "2032-04-30T11:30:00.000Z",
          "2032-04-30T12:30:00.000Z",
        ),
      ],
      projects: [],
    });

    expect(result.conflictCount).toBe(1);
    expect(result.tasksWithoutDueDate).toBe(1);
    expect(result.upcomingEvents).toEqual([]);
  });
});
