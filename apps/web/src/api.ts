import type {
  ApiErrorResponse,
  CalendarEventResponse,
  CalendarResponse,
  CreateTaskEventLinkRequest,
  CreateTaskRequest,
  DashboardResponse,
  ProfileResponse,
  SessionResponse,
  TaskResponse,
  TaskEventLinkResponse,
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
};
