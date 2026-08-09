import type {
  ApiErrorResponse,
  CalendarEventResponse,
  CalendarResponse,
  CreateTaskEventLinkRequest,
  CreateTaskRequest,
  DashboardResponse,
  CreateStudyEntryRequest,
  CreateStudyModuleRequest,
  CreateStudyProgramRequest,
  ProfileResponse,
  SessionResponse,
  TaskResponse,
  TaskEventLinkResponse,
  StudyOverviewResponse,
  UpdateStudyEntryRequest,
  UpdateStudyModuleRequest,
  UpdateStudyProgramRequest,
  CreateWorkContextRequest,
  CreateWorkProjectRequest,
  CreateWorkTaskLinkRequest,
  CreateWorkTimeEntryRequest,
  UpdateWorkContextRequest,
  UpdateWorkProjectRequest,
  UpdateWorkTimeEntryRequest,
  WorkOverviewResponse,
  UpdateTaskRequest,
} from "@lifeos/contracts";

const API_BASE = "/api/v1";

export type EventPayload =
  | {
      title: string;
      description?: string | null;
      location?: string | null;
      timezone: string;
      isAllDay: false;
      startsAt: string;
      endsAt: string;
      recurrenceRule?: string | null;
      reminderMinutes?: number[];
    }
  | {
      title: string;
      description?: string | null;
      location?: string | null;
      timezone: string;
      isAllDay: true;
      startDate: string;
      endDate: string;
      recurrenceRule?: string | null;
      reminderMinutes?: number[];
    };

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (!response.ok) {
    let error: ApiErrorResponse | null = null;
    try {
      error = (await response.json()) as ApiErrorResponse;
    } catch {
      // Nicht-JSON-Antworten werden auf eine neutrale Meldung abgebildet.
    }
    throw new ApiClientError(
      response.status,
      error?.error.code ?? "HTTP_ERROR",
      error?.error.message ??
        "Die lokale API konnte die Anfrage nicht verarbeiten.",
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
};

export const api = {
  createSession(password: string) {
    return request<SessionResponse>("/session", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
  },

  deleteSession() {
    return request<void>("/session", { method: "DELETE" });
  },

  getProfile() {
    return request<ProfileResponse>("/profile");
  },

  getDashboard() {
    return request<DashboardResponse>("/dashboard");
  },

  listCalendars() {
    return request<CalendarResponse[]>("/calendars");
  },

  listEvents(calendarId: string) {
    return request<CalendarEventResponse[]>(
      `/calendars/${encodeURIComponent(calendarId)}/events`,
    );
  },

  createEvent(calendarId: string, payload: EventPayload) {
    return request<CalendarEventResponse>(
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      { method: "POST", body: JSON.stringify(payload) },
    );
  },

  updateEvent(
    calendarId: string,
    uid: string,
    etag: string,
    payload: EventPayload,
  ) {
    return request<CalendarEventResponse>(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(uid)}`,
      {
        method: "PUT",
        headers: { "If-Match": etag },
        body: JSON.stringify(payload),
      },
    );
  },

  deleteEvent(calendarId: string, uid: string, etag: string) {
    return request<void>(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(uid)}`,
      {
        method: "DELETE",
        headers: { "If-Match": etag },
      },
    );
  },

  listTaskEventLinks() {
    return request<TaskEventLinkResponse[]>("/task-event-links");
  },

  createTaskEventLink(payload: CreateTaskEventLinkRequest) {
    return request<TaskEventLinkResponse>("/task-event-links", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  deleteTaskEventLink(linkId: string) {
    return request<void>(`/task-event-links/${encodeURIComponent(linkId)}`, {
      method: "DELETE",
    });
  },

  listTasks(includeArchived = true) {
    return request<TaskResponse[]>(
      `/tasks?includeArchived=${includeArchived ? "true" : "false"}`,
    );
  },

  createTask(payload: CreateTaskRequest) {
    return request<TaskResponse>("/tasks", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  updateTask(taskId: string, payload: UpdateTaskRequest) {
    return request<TaskResponse>(`/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  deleteTask(taskId: string) {
    return request<void>(`/tasks/${encodeURIComponent(taskId)}`, {
      method: "DELETE",
    });
  },
  getStudy(includeArchived = true) {
    return request<StudyOverviewResponse>(
      `/study?includeArchived=${includeArchived ? "true" : "false"}`,
    );
  },
  createStudyProgram(payload: CreateStudyProgramRequest) {
    return request("/study/programs", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateStudyProgram(id: string, payload: UpdateStudyProgramRequest) {
    return request(`/study/programs/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  createStudyModule(payload: CreateStudyModuleRequest) {
    return request("/study/modules", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateStudyModule(id: string, payload: UpdateStudyModuleRequest) {
    return request(`/study/modules/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  createStudyEntry(payload: CreateStudyEntryRequest) {
    return request("/study/entries", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateStudyEntry(id: string, payload: UpdateStudyEntryRequest) {
    return request(`/study/entries/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  getWork(includeArchived = true) {
    return request<WorkOverviewResponse>(
      `/work?includeArchived=${includeArchived ? "true" : "false"}`,
    );
  },
  createWorkContext(payload: CreateWorkContextRequest) {
    return request("/work/contexts", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateWorkContext(id: string, payload: UpdateWorkContextRequest) {
    return request(`/work/contexts/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  createWorkProject(payload: CreateWorkProjectRequest) {
    return request("/work/projects", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateWorkProject(id: string, payload: UpdateWorkProjectRequest) {
    return request(`/work/projects/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  createWorkTaskLink(payload: CreateWorkTaskLinkRequest) {
    return request("/work/task-links", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  deleteWorkTaskLink(id: string) {
    return request<void>(`/work/task-links/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
  createWorkTimeEntry(payload: CreateWorkTimeEntryRequest) {
    return request("/work/time-entries", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateWorkTimeEntry(id: string, payload: UpdateWorkTimeEntryRequest) {
    return request(`/work/time-entries/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
};
