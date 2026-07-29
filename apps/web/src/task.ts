import type {
  TaskArea,
  TaskPriority,
  TaskResponse,
  TaskStatus,
} from "@lifeos/contracts";

export const taskStatusLabels: Record<TaskStatus, string> = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  blocked: "Blockiert",
  done: "Erledigt",
  cancelled: "Abgebrochen",
};

export const taskPriorityLabels: Record<TaskPriority, string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
  critical: "Kritisch",
};

export const taskAreaLabels: Record<TaskArea, string> = {
  study: "Studium",
  work: "Arbeit",
  projects: "Projekte",
  finance: "Finanzen",
  fitness: "Fitness",
  personal: "Persönlich",
};

export const todayInTimezone = (timezone: string): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("year")}-${value("month")}-${value("day")}`;
};

export const formatTaskDueDate = (
  dueDate: string | null,
  timezone: string,
): string => {
  if (!dueDate) return "Ohne Fälligkeit";
  const today = todayInTimezone(timezone);
  const label = new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dueDate}T12:00:00.000Z`));
  if (dueDate === today) return `Heute · ${label}`;
  if (dueDate < today) return `Überfällig · ${label}`;
  return label;
};

export const formatTaskStart = (task: TaskResponse): string | null => {
  if (!task.scheduledStartAt || !task.scheduledStartTimezone) return null;
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: task.scheduledStartTimezone,
  }).format(new Date(task.scheduledStartAt));
};

export const taskIsOverdue = (task: TaskResponse, timezone: string): boolean =>
  Boolean(
    task.dueDate &&
    task.dueDate < todayInTimezone(timezone) &&
    task.status !== "done" &&
    task.status !== "cancelled",
  );

const priorityOrder: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export const compareTasks = (left: TaskResponse, right: TaskResponse): number =>
  (left.dueDate ?? "9999-12-31").localeCompare(right.dueDate ?? "9999-12-31") ||
  priorityOrder[left.priority] - priorityOrder[right.priority] ||
  left.createdAt.localeCompare(right.createdAt);
