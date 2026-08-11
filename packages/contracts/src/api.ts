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

export interface SetupStatusResponse {
  required: boolean;
}

export interface CompleteSetupRequest {
  displayName: string;
  password: string;
  calDavPassword: string;
  timezone: string;
}

export interface CompleteSetupResponse {
  status: "configured";
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

export interface TaskEventLinkResponse {
  id: string;
  task: {
    id: string;
    title: string | null;
    available: boolean;
  };
  event: {
    calendarId: string;
    uid: string;
    title: string | null;
    available: boolean;
  };
  createdAt: string;
}

export interface CreateTaskEventLinkRequest {
  taskId: string;
  calendarId: string;
  eventUid: string;
}

export interface DashboardEventResponse extends CalendarEventResponse {
  calendarId: string;
  calendarName: string;
}

export interface DashboardProjectResponse {
  id: string;
  title: string;
  openTaskCount: number;
}

export interface DashboardResponse {
  generatedAt: string;
  timezone: string;
  tasks: TaskResponse[];
  events: DashboardEventResponse[];
  projects: DashboardProjectResponse[];
}

export type StudyStatus =
  "planned" | "active" | "completed" | "paused" | "cancelled";
export type StudyEntryKind = "lecture" | "exam" | "submission" | "learning";

interface StudyRecordResponse {
  id: string;
  ownerId: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StudyProgramResponse extends StudyRecordResponse {
  title: string;
  institution: string;
  periodLabel: string;
  status: StudyStatus;
  notes: string | null;
}

export interface StudyModuleResponse extends StudyRecordResponse {
  programId: string;
  code: string | null;
  title: string;
  status: StudyStatus;
  credits: number | null;
  grade: string | null;
  notes: string | null;
  documentReferences: string[];
}

export interface StudyEntryResponse extends StudyRecordResponse {
  moduleId: string;
  kind: StudyEntryKind;
  title: string;
  status: StudyStatus;
  dueDate: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string | null;
  credits: number | null;
  grade: string | null;
  notes: string | null;
  taskId: string | null;
  calendarEventId: string | null;
}

export interface StudyOverviewResponse {
  programs: StudyProgramResponse[];
  modules: StudyModuleResponse[];
  entries: StudyEntryResponse[];
  history: StudyAuditResponse[];
}

export interface StudyAuditResponse {
  id: string;
  action:
    | "study.program.created"
    | "study.program.updated"
    | "study.module.created"
    | "study.module.updated"
    | "study.entry.created"
    | "study.entry.updated";
  entityType: "StudyProgram" | "StudyModule" | "StudyEntry";
  entityId: string | null;
  changedFields: string[];
  occurredAt: string;
}

export interface CreateStudyProgramRequest {
  title: string;
  institution: string;
  periodLabel: string;
  status?: StudyStatus;
  notes?: string | null;
}
export interface UpdateStudyProgramRequest extends Partial<CreateStudyProgramRequest> {
  archived?: boolean;
}

export interface CreateStudyModuleRequest {
  programId: string;
  code?: string | null;
  title: string;
  status?: StudyStatus;
  credits?: number | null;
  grade?: string | null;
  notes?: string | null;
  documentReferences?: string[];
}
export interface UpdateStudyModuleRequest extends Partial<CreateStudyModuleRequest> {
  archived?: boolean;
}

export interface CreateStudyEntryRequest {
  moduleId: string;
  kind: StudyEntryKind;
  title: string;
  status?: StudyStatus;
  dueDate?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  timezone?: string | null;
  credits?: number | null;
  grade?: string | null;
  notes?: string | null;
  taskId?: string | null;
  calendarEventId?: string | null;
}
export interface UpdateStudyEntryRequest extends Partial<CreateStudyEntryRequest> {
  archived?: boolean;
}

export type WorkStatus = StudyStatus;
export type WorkTimeKind = "planned" | "actual";

interface WorkRecordResponse {
  id: string;
  ownerId: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkContextResponse extends WorkRecordResponse {
  title: string;
  role: string;
  organization: string | null;
  startsOn: string | null;
  endsOn: string | null;
  timezone: string;
  status: WorkStatus;
  notes: string | null;
}

export interface WorkProjectResponse extends WorkRecordResponse {
  contextId: string;
  title: string;
  status: WorkStatus;
  goal: string | null;
  deadlineDate: string | null;
  calendarEventId: string | null;
  notes: string | null;
}

export interface WorkTaskLinkResponse {
  id: string;
  ownerId: string;
  contextId: string;
  projectId: string | null;
  taskId: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkTimeEntryResponse extends WorkRecordResponse {
  contextId: string;
  projectId: string | null;
  taskId: string | null;
  kind: WorkTimeKind;
  title: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  durationMinutes: number;
  notes: string | null;
}

export interface WorkAuditResponse {
  id: string;
  action:
    | "work.context.created"
    | "work.context.updated"
    | "work.project.created"
    | "work.project.updated"
    | "work.task-linked"
    | "work.task-unlinked"
    | "work.time.created"
    | "work.time.updated";
  entityType: "WorkContext" | "WorkProject" | "WorkTaskLink" | "WorkTimeEntry";
  entityId: string | null;
  changedFields: string[];
  occurredAt: string;
}

export interface WorkOverviewResponse {
  contexts: WorkContextResponse[];
  projects: WorkProjectResponse[];
  taskLinks: WorkTaskLinkResponse[];
  timeEntries: WorkTimeEntryResponse[];
  history: WorkAuditResponse[];
}

export interface CreateWorkContextRequest {
  title: string;
  role: string;
  organization?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
  timezone: string;
  status?: WorkStatus;
  notes?: string | null;
}
export interface UpdateWorkContextRequest extends Partial<CreateWorkContextRequest> {
  archived?: boolean;
}

export interface CreateWorkProjectRequest {
  contextId: string;
  title: string;
  status?: WorkStatus;
  goal?: string | null;
  deadlineDate?: string | null;
  calendarEventId?: string | null;
  notes?: string | null;
}
export interface UpdateWorkProjectRequest extends Partial<CreateWorkProjectRequest> {
  archived?: boolean;
}

export interface CreateWorkTaskLinkRequest {
  contextId: string;
  projectId?: string | null;
  taskId: string;
}

export interface CreateWorkTimeEntryRequest {
  contextId: string;
  projectId?: string | null;
  taskId?: string | null;
  kind: WorkTimeKind;
  title: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  notes?: string | null;
}
export interface UpdateWorkTimeEntryRequest extends Partial<CreateWorkTimeEntryRequest> {
  archived?: boolean;
}

export type PlanningArea =
  "calendar" | "study" | "work" | "tasks" | "availability";
export type PlanningItemKind =
  "fixed_event" | "deadline" | "planned_task" | "actual_time" | "availability";
export type PlanningPriority = "low" | "medium" | "high" | "critical";

export interface AvailabilityWindowResponse {
  id: string;
  ownerId: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  timezone: string;
  label: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface CreateAvailabilityWindowRequest {
  weekday: number;
  startMinute: number;
  endMinute: number;
  timezone: string;
  label?: string | null;
}
export interface UpdateAvailabilityWindowRequest extends Partial<CreateAvailabilityWindowRequest> {}

export interface PlanningItemResponse {
  id: string;
  sourceId: string;
  area: PlanningArea;
  kind: PlanningItemKind;
  title: string;
  date: string;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  durationMinutes: number | null;
  priority: PlanningPriority;
  overdue: boolean;
  sourceUpdatedAt: string | null;
}

export interface PlanningWarningResponse {
  id: string;
  kind:
    | "overlap"
    | "overdue"
    | "capacity"
    | "high_priority_cluster"
    | "missing_data";
  severity: "info" | "warning" | "critical";
  date: string;
  itemIds: string[];
  message: string;
}

export interface PlanningResponse {
  generatedAt: string;
  timezone: string;
  range: { from: string; to: string };
  items: PlanningItemResponse[];
  warnings: PlanningWarningResponse[];
  availabilityWindows: AvailabilityWindowResponse[];
}
