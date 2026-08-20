import type {
  ApiErrorResponse,
  AiQueryResponse,
  AiStatusResponse,
  CalendarEventResponse,
  CalendarResponse,
  CreateTaskEventLinkRequest,
  CreateTaskRequest,
  DashboardResponse,
  CreateStudyEntryRequest,
  CreateStudyModuleRequest,
  CreateStudyProgramRequest,
  ProfileResponse,
  CompleteSetupRequest,
  CompleteSetupResponse,
  SetupStatusResponse,
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
  CreateAvailabilityWindowRequest,
  PlanningArea,
  PlanningResponse,
  CreateProjectEventLinkRequest,
  CreateProjectItemRequest,
  CreateProjectRequest,
  CreateProjectTaskLinkRequest,
  ProjectDetailResponse,
  ProjectOverviewResponse,
  UpdateProjectItemRequest,
  UpdateProjectRequest,
  UpdateAvailabilityWindowRequest,
  UpdateTaskRequest,
  CreateNoteRequest,
  DocumentResponse,
  KnowledgeOverviewResponse,
  NoteDetailResponse,
  NoteResponse,
  SearchResponse,
  ConfirmAiSuggestionResponse,
  CreateAiQueryRequest,
  UpdateDocumentRequest,
  UpdateNoteRequest,
  CreateFinanceBudgetRequest,
  CreateFinanceCategoryRequest,
  CreateFinanceTransactionRequest,
  FinanceExportResponse,
  FinanceOverviewResponse,
  UpdateFinanceBudgetRequest,
  UpdateFinanceCategoryRequest,
  UpdateFinanceTransactionRequest,
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
  getSetupStatus() {
    return request<SetupStatusResponse>("/setup");
  },

  completeSetup(payload: CompleteSetupRequest) {
    return request<CompleteSetupResponse>("/setup", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

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
  listProjects(includeArchived = true) {
    return request<ProjectOverviewResponse>(
      `/projects?includeArchived=${includeArchived ? "true" : "false"}`,
    );
  },
  getProject(projectId: string) {
    return request<ProjectDetailResponse>(
      `/projects/${encodeURIComponent(projectId)}`,
    );
  },
  createProject(payload: CreateProjectRequest) {
    return request("/projects", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateProject(projectId: string, payload: UpdateProjectRequest) {
    return request(`/projects/${encodeURIComponent(projectId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  deleteProject(projectId: string) {
    return request<void>(`/projects/${encodeURIComponent(projectId)}`, {
      method: "DELETE",
    });
  },
  getKnowledge(includeArchived = true) {
    return request<KnowledgeOverviewResponse>(
      `/knowledge?includeArchived=${includeArchived ? "true" : "false"}`,
    );
  },
  getNote(noteId: string) {
    return request<NoteDetailResponse>(`/notes/${encodeURIComponent(noteId)}`);
  },
  createNote(payload: CreateNoteRequest) {
    return request<NoteResponse>("/notes", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateNote(noteId: string, payload: UpdateNoteRequest) {
    return request<NoteResponse>(`/notes/${encodeURIComponent(noteId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  deleteNote(noteId: string) {
    return request<void>(`/notes/${encodeURIComponent(noteId)}`, {
      method: "DELETE",
    });
  },
  uploadDocument(
    file: File,
    links: {
      projectId?: string | null;
      studyModuleId?: string | null;
      searchEnabled?: boolean;
    } = {},
  ) {
    const query = new URLSearchParams({
      fileName: file.name,
      searchEnabled: links.searchEnabled ? "true" : "false",
    });
    if (links.projectId) query.set("projectId", links.projectId);
    if (links.studyModuleId) query.set("studyModuleId", links.studyModuleId);
    return request<DocumentResponse>(`/documents?${query.toString()}`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
  },
  updateDocument(documentId: string, payload: UpdateDocumentRequest) {
    return request<DocumentResponse>(
      `/documents/${encodeURIComponent(documentId)}`,
      { method: "PATCH", body: JSON.stringify(payload) },
    );
  },
  deleteDocument(documentId: string) {
    return request<void>(`/documents/${encodeURIComponent(documentId)}`, {
      method: "DELETE",
    });
  },
  search(query: string) {
    return request<SearchResponse>(`/search?q=${encodeURIComponent(query)}`);
  },
  getAiStatus() {
    return request<AiStatusResponse>("/ai/status");
  },
  createAiQuery(payload: CreateAiQueryRequest) {
    return request<AiQueryResponse>("/ai/queries", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  confirmAiSuggestion(interactionId: string, suggestionId: string) {
    return request<ConfirmAiSuggestionResponse>(
      `/ai/interactions/${encodeURIComponent(interactionId)}/suggestions/${encodeURIComponent(suggestionId)}/confirm`,
      { method: "POST" },
    );
  },
  createProjectItem(
    projectId: string,
    kind: "goals" | "milestones",
    payload: CreateProjectItemRequest,
  ) {
    return request(`/projects/${encodeURIComponent(projectId)}/${kind}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateProjectItem(
    projectId: string,
    kind: "goals" | "milestones",
    itemId: string,
    payload: UpdateProjectItemRequest,
  ) {
    return request(
      `/projects/${encodeURIComponent(projectId)}/${kind}/${encodeURIComponent(itemId)}`,
      { method: "PATCH", body: JSON.stringify(payload) },
    );
  },
  deleteProjectItem(
    projectId: string,
    kind: "goals" | "milestones",
    itemId: string,
  ) {
    return request<void>(
      `/projects/${encodeURIComponent(projectId)}/${kind}/${encodeURIComponent(itemId)}`,
      { method: "DELETE" },
    );
  },
  linkProjectTask(projectId: string, payload: CreateProjectTaskLinkRequest) {
    return request<void>(
      `/projects/${encodeURIComponent(projectId)}/task-links`,
      { method: "POST", body: JSON.stringify(payload) },
    );
  },
  unlinkProjectTask(projectId: string, taskId: string) {
    return request<void>(
      `/projects/${encodeURIComponent(projectId)}/task-links/${encodeURIComponent(taskId)}`,
      { method: "DELETE" },
    );
  },
  linkProjectEvent(projectId: string, payload: CreateProjectEventLinkRequest) {
    return request(`/projects/${encodeURIComponent(projectId)}/event-links`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  unlinkProjectEvent(projectId: string, calendarId: string, eventUid: string) {
    return request<void>(
      `/projects/${encodeURIComponent(projectId)}/event-links/${encodeURIComponent(calendarId)}/${encodeURIComponent(eventUid)}`,
      { method: "DELETE" },
    );
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
  getPlanning(from: string, to: string, areas?: PlanningArea[]) {
    const query = new URLSearchParams({ from, to });
    if (areas?.length) query.set("areas", areas.join(","));
    return request<PlanningResponse>(`/planning?${query.toString()}`);
  },
  createAvailability(payload: CreateAvailabilityWindowRequest) {
    return request("/planning/availability", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateAvailability(id: string, payload: UpdateAvailabilityWindowRequest) {
    return request(`/planning/availability/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  deleteAvailability(id: string) {
    return request<void>(`/planning/availability/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
  getFinance(
    from: string,
    to: string,
    currencyCode = "EUR",
    categoryId?: string,
  ) {
    const query = new URLSearchParams({ from, to, currencyCode });
    if (categoryId) query.set("categoryId", categoryId);
    return request<FinanceOverviewResponse>(`/finance?${query.toString()}`);
  },
  createFinanceCategory(payload: CreateFinanceCategoryRequest) {
    return request("/finance/categories", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateFinanceCategory(id: string, payload: UpdateFinanceCategoryRequest) {
    return request(`/finance/categories/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  createFinanceTransaction(payload: CreateFinanceTransactionRequest) {
    return request("/finance/transactions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateFinanceTransaction(
    id: string,
    payload: UpdateFinanceTransactionRequest,
  ) {
    return request(`/finance/transactions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  createFinanceBudget(payload: CreateFinanceBudgetRequest) {
    return request("/finance/budgets", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateFinanceBudget(id: string, payload: UpdateFinanceBudgetRequest) {
    return request(`/finance/budgets/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  exportFinance(from: string, to: string, currencyCode = "EUR") {
    const query = new URLSearchParams({ from, to, currencyCode });
    return request<FinanceExportResponse>(
      `/finance/export?${query.toString()}`,
    );
  },
};
