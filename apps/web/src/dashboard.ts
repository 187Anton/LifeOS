import type {
  DashboardEventResponse,
  DashboardResponse,
  TaskArea,
  TaskResponse,
} from "@lifeos/contracts";

import {
  addDays,
  occurrencesInRange,
  todayInTimezone,
  type CalendarOccurrence,
} from "./calendar-view";
import { compareTasks } from "./task";

export interface DashboardOccurrence {
  key: string;
  occurrence: CalendarOccurrence;
  source: DashboardEventResponse;
}

export interface DashboardArea {
  area: TaskArea;
  openTaskCount: number;
}

export interface DashboardViewModel {
  today: string;
  todayEvents: DashboardOccurrence[];
  upcomingEvents: DashboardOccurrence[];
  openTasks: TaskResponse[];
  overdueTasks: TaskResponse[];
  highPriorityTasks: TaskResponse[];
  areas: DashboardArea[];
  conflictCount: number;
  tasksWithoutDueDate: number;
}

const projectOccurrences = (
  events: DashboardEventResponse[],
  range: { start: string; end: string },
  timezone: string,
): DashboardOccurrence[] =>
  events
    .flatMap((source) =>
      occurrencesInRange([source], range, timezone).map((occurrence) => ({
        key: `${source.calendarId}:${occurrence.key}`,
        occurrence,
        source,
      })),
    )
    .sort((left, right) => {
      const leftValue =
        left.occurrence.startsAt ??
        `${left.occurrence.startDate}T00:00:00.000Z`;
      const rightValue =
        right.occurrence.startsAt ??
        `${right.occurrence.startDate}T00:00:00.000Z`;
      return leftValue.localeCompare(rightValue);
    });

const countConflicts = (events: DashboardOccurrence[]): number => {
  const timed = events
    .filter((item) => item.occurrence.startsAt && item.occurrence.endsAt)
    .sort((left, right) =>
      left.occurrence.startsAt!.localeCompare(right.occurrence.startsAt!),
    );
  let conflicts = 0;
  for (let index = 0; index < timed.length; index += 1) {
    const current = timed[index]!;
    for (let other = index + 1; other < timed.length; other += 1) {
      const candidate = timed[other]!;
      if (candidate.occurrence.startsAt! >= current.occurrence.endsAt!) break;
      conflicts += 1;
    }
  }
  return conflicts;
};

export const buildDashboardView = (
  snapshot: DashboardResponse,
): DashboardViewModel => {
  const now = new Date(snapshot.generatedAt);
  const today = todayInTimezone(snapshot.timezone, now);
  const tomorrow = addDays(today, 1);
  const horizon = addDays(today, 31);
  const todayEvents = projectOccurrences(
    snapshot.events,
    { start: today, end: tomorrow },
    snapshot.timezone,
  );
  const upcomingEvents = projectOccurrences(
    snapshot.events,
    { start: tomorrow, end: horizon },
    snapshot.timezone,
  );
  const openTasks = [...snapshot.tasks].sort(compareTasks);
  const overdueTasks = openTasks.filter(
    (task) => task.dueDate && task.dueDate < today,
  );
  const highPriorityTasks = openTasks.filter(
    (task) => task.priority === "high" || task.priority === "critical",
  );
  const areaCounts = new Map<TaskArea, number>();
  for (const task of openTasks) {
    areaCounts.set(task.area, (areaCounts.get(task.area) ?? 0) + 1);
  }

  return {
    today,
    todayEvents,
    upcomingEvents,
    openTasks,
    overdueTasks,
    highPriorityTasks,
    areas: [...areaCounts]
      .map(([area, openTaskCount]) => ({ area, openTaskCount }))
      .sort(
        (left, right) =>
          right.openTaskCount - left.openTaskCount ||
          left.area.localeCompare(right.area),
      ),
    conflictCount: countConflicts([...todayEvents, ...upcomingEvents]),
    tasksWithoutDueDate: openTasks.filter((task) => !task.dueDate).length,
  };
};
