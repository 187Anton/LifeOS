import type {
  ApiErrorResponse,
  CalendarEventResponse,
  CalendarResponse,
  ProfileResponse,
  SessionResponse,
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
};
