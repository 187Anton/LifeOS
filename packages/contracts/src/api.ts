export const API_VERSION = "v1" as const;
export const ERROR_CONTRACT_VERSION = "1" as const;

export type ApiErrorCode =
  | "INVALID_JSON"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "INVALID_CREDENTIALS"
  | "PRECONDITION_REQUIRED"
  | "PRECONDITION_FAILED"
  | "CONFLICT"
  | "NOT_FOUND"
  | "SERVICE_NOT_READY"
  | "INTERNAL_ERROR";

export interface ApiErrorDetail {
  field: string;
  message: string;
}

export interface ApiErrorResponse {
  error: {
    version: typeof ERROR_CONTRACT_VERSION;
    code: ApiErrorCode;
    message: string;
    requestId: string;
    details?: ApiErrorDetail[];
  };
}

export interface HealthResponse {
  apiVersion: typeof API_VERSION;
  status: "ok";
}

export interface ReadinessResponse {
  apiVersion: typeof API_VERSION;
  status: "ready";
  checks: {
    database: "up";
  };
}

export type SupportedLocale = "de-DE" | "en-US";
export type CalendarView = "day" | "week" | "month";

export interface UserSettingsResponse {
  timezone: string;
  locale: SupportedLocale;
  currencyCode: string;
  weekStartsOn: number;
  defaultCalendarView: CalendarView;
  showWeekends: boolean;
}

export interface ProfileResponse {
  id: string;
  displayName: string;
  settings: UserSettingsResponse;
}

export type UpdateSettingsRequest = Partial<UserSettingsResponse>;

export interface SessionResponse {
  status: "authenticated";
  expiresAt: string;
}

export interface CalendarResponse {
  id: string;
  name: string;
  timezone: string;
  isPrimary: boolean;
  syncToken: number;
}

export interface CalendarEventResponse {
  uid: string;
  title: string;
  description: string | null;
  location: string | null;
  isAllDay: boolean;
  startsAt: string | null;
  endsAt: string | null;
  startDate: string | null;
  endDate: string | null;
  timezone: string;
  recurrenceRule: string | null;
  reminderMinutes: number[];
  etag: string;
  sequence: number;
  updatedAt: string;
}

export type TaskStatus =
  "open" | "in_progress" | "blocked" | "done" | "cancelled";

export type TaskPriority = "low" | "medium" | "high" | "critical";

export type TaskArea =
  "study" | "work" | "projects" | "finance" | "fitness" | "personal";

export interface TaskResponse {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  scheduledStartAt: string | null;
  scheduledStartTimezone: string | null;
  estimatedDurationMinutes: number | null;
  tags: string[];
  area: TaskArea;
  projectId: string | null;
  parentTaskId: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskRequest {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  scheduledStartAt?: string | null;
  scheduledStartTimezone?: string | null;
  estimatedDurationMinutes?: number | null;
  tags?: string[];
  area?: TaskArea;
  projectId?: string | null;
  parentTaskId?: string | null;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  scheduledStartAt?: string | null;
  scheduledStartTimezone?: string | null;
  estimatedDurationMinutes?: number | null;
  tags?: string[];
  area?: TaskArea;
  projectId?: string | null;
  parentTaskId?: string | null;
  archived?: boolean;
}
