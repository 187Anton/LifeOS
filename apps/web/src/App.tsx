import type {
  CalendarEventResponse,
  CalendarResponse,
  CreateStudyEntryRequest,
  CreateStudyModuleRequest,
  CreateStudyProgramRequest,
  CreateTaskEventLinkRequest,
  CreateTaskRequest,
  DashboardResponse,
  ProfileResponse,
  TaskResponse,
  TaskEventLinkResponse,
  StudyOverviewResponse,
  UpdateStudyEntryRequest,
  UpdateStudyModuleRequest,
  UpdateStudyProgramRequest,
  UpdateTaskRequest,
  CreateWorkContextRequest,
  CreateWorkProjectRequest,
  CreateWorkTaskLinkRequest,
  CreateWorkTimeEntryRequest,
  UpdateWorkContextRequest,
  UpdateWorkProjectRequest,
  UpdateWorkTimeEntryRequest,
  WorkOverviewResponse,
  CreateAvailabilityWindowRequest,
  PlanningResponse,
  CreateProjectItemRequest,
  CreateProjectRequest,
  ProjectDetailResponse,
  ProjectOverviewResponse,
  UpdateProjectItemRequest,
  UpdateProjectRequest,
  CreateNoteRequest,
  KnowledgeOverviewResponse,
  NoteDetailResponse,
  UpdateDocumentRequest,
  UpdateNoteRequest,
  SearchResponse,
  SearchResultResponse,
  AiQueryResponse,
} from "@lifeos/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { api, ApiClientError, type EventPayload } from "./api";
import { CalendarWorkspace } from "./components/CalendarWorkspace";
import { Dashboard } from "./components/Dashboard";
import { Login } from "./components/Login";
import { Setup, type SetupPayload } from "./components/Setup";
import { Shell, type View } from "./components/Shell";
import { TaskWorkspace } from "./components/TaskWorkspace";
import { StudyWorkspace } from "./components/StudyWorkspace";
import { WorkWorkspace } from "./components/WorkWorkspace";
import { PlanningWorkspace } from "./components/PlanningWorkspace";
import { ProjectWorkspace } from "./components/ProjectWorkspace";
import { KnowledgeWorkspace } from "./components/KnowledgeWorkspace";
import { FitnessWorkspace } from "./components/FitnessWorkspace";
import { IntegrationsWorkspace } from "./components/IntegrationsWorkspace";
import { ShoppingWorkspace } from "./components/ShoppingWorkspace";
import type { TaskDefaults } from "./components/TaskForm";
import { weekRange, type DateRange } from "./planning";

type SessionState = "checking" | "anonymous" | "authenticated";

const errorMessage = (error: unknown): string => {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof TypeError) {
    return "Die lokale API ist nicht erreichbar. Prüfe, ob sie auf Port 3000 läuft.";
  }
  return "Die Anfrage konnte unerwartet nicht abgeschlossen werden.";
};

export const App = () => {
  const [session, setSession] = useState<SessionState>("checking");
  const [setupRequired, setSetupRequired] = useState(false);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [calendars, setCalendars] = useState<CalendarResponse[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(
    null,
  );
  const [events, setEvents] = useState<CalendarEventResponse[]>([]);
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [taskEventLinks, setTaskEventLinks] = useState<TaskEventLinkResponse[]>(
    [],
  );
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [study, setStudy] = useState<StudyOverviewResponse | null>(null);
  const [work, setWork] = useState<WorkOverviewResponse | null>(null);
  const [planning, setPlanning] = useState<PlanningResponse | null>(null);
  const [projects, setProjects] = useState<ProjectOverviewResponse | null>(
    null,
  );
  const [projectDetail, setProjectDetail] =
    useState<ProjectDetailResponse | null>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeOverviewResponse | null>(
    null,
  );
  const [noteDetail, setNoteDetail] = useState<NoteDetailResponse | null>(null);
  const [search, setSearch] = useState<SearchResponse | null>(null);
  const [aiResponse, setAiResponse] = useState<AiQueryResponse | null>(null);
  const [planningRange, setPlanningRange] = useState<DateRange>(() =>
    weekRange("Europe/Berlin", 1),
  );
  const [view, setView] = useState<View>("dashboard");
  const [createRequest, setCreateRequest] = useState<"task" | "event" | null>(
    null,
  );
  /**
   * Aus den gemeinsamen Kalender- und Planungsansichten angeforderte
   * Bearbeitung. Sie öffnet ausschließlich den vorhandenen Editor des
   * jeweiligen Fachobjekts und erzeugt keinen neuen Schreibpfad.
   */
  const [editTaskRequest, setEditTaskRequest] = useState<string | null>(null);
  /**
   * Bearbeitungsanforderung an den Termin-Editor. Sie trägt immer den Kalender
   * des führenden Termins mit; die UID allein ist nicht kalenderübergreifend
   * eindeutig.
   */
  const [editEventRequest, setEditEventRequest] = useState<{
    calendarId: string;
    uid: string;
  } | null>(null);
  /**
   * Kalender der aktuell geladenen `events`. Eine Bearbeitungsanforderung gilt
   * erst als auflösbar, wenn ihr Kalender genau diesem entspricht.
   */
  const [eventsCalendarId, setEventsCalendarId] = useState<string | null>(null);
  /**
   * Laufende Ereignisanfrage. Jede Anfrage erhält eine eigene Nummer; eine
   * Antwort darf den Zustand nur setzen, solange sie die jüngste Anfrage ist.
   * Ein Kalenderwechsel darf nicht davon überschrieben werden, dass eine
   * vorherige Anfrage verspätet eintrifft.
   */
  const eventsRequestRef = useRef(0);
  /**
   * Vorbelegung für einen neu geöffneten Aufgabeneditor. Sie wird
   * ausschließlich von der Anlage im Studienmodul gesetzt und füllt nur die
   * Neuanlage vor; bestehende Aufgaben bleiben unberührt.
   */
  const [taskDraft, setTaskDraft] = useState<TaskDefaults | null>(null);
  const [loginPending, setLoginPending] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [setupPending, setSetupPending] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [calendarWarning, setCalendarWarning] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [studyLoading, setStudyLoading] = useState(false);
  const [studyError, setStudyError] = useState<string | null>(null);
  const [studySuccess, setStudySuccess] = useState<string | null>(null);
  const [workLoading, setWorkLoading] = useState(false);
  const [workError, setWorkError] = useState<string | null>(null);
  const [workSuccess, setWorkSuccess] = useState<string | null>(null);
  const [planningLoading, setPlanningLoading] = useState(false);
  const [planningError, setPlanningError] = useState<string | null>(null);
  const [planningSuccess, setPlanningSuccess] = useState<string | null>(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectSuccess, setProjectSuccess] = useState<string | null>(null);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null);
  const [knowledgeSuccess, setKnowledgeSuccess] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [taskSuccess, setTaskSuccess] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    setTaskError(null);
    try {
      setTasks(await api.listTasks(true));
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        setSession("anonymous");
      } else {
        setTaskError(errorMessage(error));
      }
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
  }, []);

  const loadEvents = useCallback(async (calendarId: string) => {
    const request = eventsRequestRef.current + 1;
    eventsRequestRef.current = request;
    setEventsLoading(true);
    setCalendarError(null);
    try {
      const loaded = await api.listEvents(calendarId);
      /**
       * Eine verspätete Antwort einer überholten Anfrage darf weder die
       * Ereignisse noch deren Kalenderbezug ersetzen; sonst würden Ereignisse
       * eines anderen Kalenders unter der aktuellen Kalender-ID projiziert.
       */
      if (eventsRequestRef.current !== request) return;
      setEvents(loaded);
      setEventsCalendarId(calendarId);
    } catch (error) {
      /** Auch ein Fehler einer überholten Anfrage bleibt ohne Wirkung. */
      if (eventsRequestRef.current !== request) return;
      if (error instanceof ApiClientError && error.status === 401) {
        setSession("anonymous");
      } else {
        setCalendarError(errorMessage(error));
      }
      setEvents([]);
      setEventsCalendarId(null);
    } finally {
      if (eventsRequestRef.current === request) setEventsLoading(false);
    }
  }, []);

  const loadTaskEventLinks = useCallback(async () => {
    setTaskEventLinks(await api.listTaskEventLinks());
  }, []);

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true);
    setDashboardError(null);
    try {
      setDashboard(await api.getDashboard());
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        setSession("anonymous");
      } else {
        setDashboardError(errorMessage(error));
      }
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  const loadStudy = useCallback(async () => {
    setStudyLoading(true);
    setStudyError(null);
    try {
      setStudy(await api.getStudy(true));
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401)
        setSession("anonymous");
      else setStudyError(errorMessage(error));
    } finally {
      setStudyLoading(false);
    }
  }, []);

  const loadWork = useCallback(async () => {
    setWorkLoading(true);
    setWorkError(null);
    try {
      setWork(await api.getWork(true));
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401)
        setSession("anonymous");
      else setWorkError(errorMessage(error));
    } finally {
      setWorkLoading(false);
    }
  }, []);

  const loadPlanning = useCallback(async (range: DateRange) => {
    setPlanningLoading(true);
    setPlanningError(null);
    try {
      setPlanning(await api.getPlanning(range.from, range.to));
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401)
        setSession("anonymous");
      else setPlanningError(errorMessage(error));
    } finally {
      setPlanningLoading(false);
    }
  }, []);

  const loadProject = useCallback(async (projectId: string) => {
    setProjectLoading(true);
    setProjectError(null);
    try {
      setProjectDetail(await api.getProject(projectId));
    } catch (error) {
      setProjectError(errorMessage(error));
      setProjectDetail(null);
    } finally {
      setProjectLoading(false);
    }
  }, []);

  const loadProjects = useCallback(async (preferredProjectId?: string) => {
    setProjectLoading(true);
    setProjectError(null);
    try {
      const overview = await api.listProjects(true);
      setProjects(overview);
      const selected =
        overview.projects.find(
          (project) => project.id === preferredProjectId,
        ) ?? overview.projects[0];
      if (selected) setProjectDetail(await api.getProject(selected.id));
      else setProjectDetail(null);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401)
        setSession("anonymous");
      else setProjectError(errorMessage(error));
    } finally {
      setProjectLoading(false);
    }
  }, []);

  const loadKnowledge = useCallback(async (preferredNoteId?: string) => {
    setKnowledgeLoading(true);
    setKnowledgeError(null);
    try {
      const overview = await api.getKnowledge(true);
      setKnowledge(overview);
      const selected =
        overview.notes.find((entry) => entry.id === preferredNoteId) ??
        overview.notes[0];
      setNoteDetail(selected ? await api.getNote(selected.id) : null);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401)
        setSession("anonymous");
      else setKnowledgeError(errorMessage(error));
    } finally {
      setKnowledgeLoading(false);
    }
  }, []);

  const loadNote = useCallback(async (noteId: string) => {
    setKnowledgeLoading(true);
    setKnowledgeError(null);
    try {
      setNoteDetail(await api.getNote(noteId));
    } catch (error) {
      setKnowledgeError(errorMessage(error));
    } finally {
      setKnowledgeLoading(false);
    }
  }, []);

  const runSearch = useCallback(async (query: string) => {
    setSearchLoading(true);
    setSearchError(null);
    try {
      setSearch(await api.search(query));
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401)
        setSession("anonymous");
      else setSearchError(errorMessage(error));
      setSearch(null);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const openSearchResult = useCallback(
    (result: SearchResultResponse) => {
      if (
        result.contentType === "project" ||
        result.contentType === "project_goal" ||
        result.contentType === "project_milestone"
      ) {
        setView("projects");
        void loadProject(result.source.id);
      } else if (result.contentType === "note") {
        setView("knowledge");
        void loadNote(result.source.id);
      } else if (
        result.contentType === "study_module" ||
        result.contentType === "study_entry"
      ) {
        setView("study");
      } else if (result.contentType === "work_project") {
        setView("work");
      } else {
        setView("knowledge");
      }
    },
    [loadNote, loadProject],
  );

  const prepareAiSources = useCallback(async (query: string) => {
    setAiLoading(true);
    setAiError(null);
    try {
      setAiResponse(await api.createAiQuery({ query }));
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401)
        setSession("anonymous");
      else setAiError(errorMessage(error));
    } finally {
      setAiLoading(false);
    }
  }, []);

  const confirmAiSuggestion = useCallback(
    async (interactionId: string, suggestionId: string) => {
      setAiLoading(true);
      setAiError(null);
      try {
        await api.confirmAiSuggestion(interactionId, suggestionId);
        setAiResponse((current) =>
          current
            ? {
                ...current,
                suggestions: current.suggestions.filter(
                  (suggestion) => suggestion.id !== suggestionId,
                ),
              }
            : current,
        );
      } catch (error) {
        setAiError(errorMessage(error));
      } finally {
        setAiLoading(false);
      }
    },
    [],
  );

  const loadAuthenticatedData = useCallback(async () => {
    const [loadedProfile, loadedCalendars, loadedTasks, loadedLinks] =
      await Promise.all([
        api.getProfile(),
        api.listCalendars(),
        api.listTasks(true),
        api.listTaskEventLinks(),
      ]);
    setProfile(loadedProfile);
    setCalendars(loadedCalendars);
    setTasks(loadedTasks);
    setTaskEventLinks(loadedLinks);
    const selected =
      loadedCalendars.find((calendar) => calendar.isPrimary) ??
      loadedCalendars[0];
    setSelectedCalendarId(selected?.id ?? null);
    const currentPlanningRange = weekRange(
      loadedProfile.settings.timezone,
      loadedProfile.settings.weekStartsOn,
    );
    setPlanningRange(currentPlanningRange);
    if (!selected) {
      setEvents([]);
      setEventsCalendarId(null);
    }
    setSession("authenticated");
    await Promise.all([
      selected ? loadEvents(selected.id) : Promise.resolve(),
      loadDashboard(),
      loadStudy(),
      loadWork(),
      loadPlanning(currentPlanningRange),
      loadProjects(),
      loadKnowledge(),
    ]);
  }, [
    loadDashboard,
    loadEvents,
    loadPlanning,
    loadProjects,
    loadKnowledge,
    loadStudy,
    loadWork,
  ]);

  useEffect(() => {
    // Der initiale API-Aufruf klärt zuerst die einmalige lokale Einrichtung.
    void api
      .getSetupStatus()
      .then(async ({ required }) => {
        if (required) {
          setSetupRequired(true);
          setSession("anonymous");
          return;
        }
        await loadAuthenticatedData();
      })
      .catch((error: unknown) => {
        setSession("anonymous");
        if (!(error instanceof ApiClientError && error.status === 401)) {
          setLoginError(errorMessage(error));
        }
      });
  }, [loadAuthenticatedData]);

  const completeSetup = async (payload: SetupPayload) => {
    setSetupPending(true);
    setSetupError(null);
    try {
      await api.completeSetup(payload);
      await api.createSession(payload.password);
      setSetupRequired(false);
      await loadAuthenticatedData();
    } catch (error) {
      setSetupError(errorMessage(error));
    } finally {
      setSetupPending(false);
    }
  };

  const login = async (password: string) => {
    setLoginPending(true);
    setLoginError(null);
    try {
      await api.createSession(password);
      await loadAuthenticatedData();
    } catch (error) {
      setLoginError(errorMessage(error));
    } finally {
      setLoginPending(false);
    }
  };

  const logout = async () => {
    try {
      await api.deleteSession();
    } catch {
      // Der lokale Zustand wird auch bei nicht erreichbarer API geschlossen.
    }
    setSession("anonymous");
    setProfile(null);
    setCalendars([]);
    setEvents([]);
    setEventsCalendarId(null);
    setTasks([]);
    setTaskEventLinks([]);
    setDashboard(null);
    setStudy(null);
    setWork(null);
    setPlanning(null);
    setProjects(null);
    setProjectDetail(null);
    setKnowledge(null);
    setNoteDetail(null);
    setSearch(null);
    setSearchError(null);
    setAiResponse(null);
    setAiError(null);
    setSelectedCalendarId(null);
    setLoginError(null);
  };

  const changeCalendar = (calendarId: string) => {
    setSelectedCalendarId(calendarId);
    setSuccess(null);
    setCalendarWarning(null);
    /**
     * Die geladenen Ereignisse gehören weiterhin zum bisherigen Kalender. Sie
     * bleiben bis zur Antwort des neuen Kalenders aus der Projektion heraus;
     * das entscheidet die Kalenderansicht anhand von `eventsCalendarId` gegen
     * die aktuelle Auswahl.
     */
    void loadEvents(calendarId);
  };

  /**
   * Nach jeder bestätigten Bearbeitung Aufgaben, Kalender, Studium, Dashboard
   * und Planung konsistent neu laden. Kein Vorgang verändert dabei
   * automatisch das jeweils andere Fachobjekt.
   */
  const reloadProjections = useCallback(
    async (calendarId: string | null) => {
      await Promise.all([
        calendarId ? loadEvents(calendarId) : Promise.resolve(),
        loadTasks(),
        loadStudy(),
        loadDashboard(),
        loadPlanning(planningRange),
      ]);
    },
    [
      loadDashboard,
      loadEvents,
      loadPlanning,
      loadStudy,
      loadTasks,
      planningRange,
    ],
  );

  /**
   * Öffnet den gemeinsamen Aufgabeneditor für eine Aufgabe aus Kalender- oder
   * Planungsansicht. Es entsteht kein zweiter Schreibpfad.
   */
  const openTaskEditor = useCallback((taskId: string) => {
    setTaskDraft(null);
    setTaskError(null);
    setEditTaskRequest(taskId);
    setView("tasks");
  }, []);

  /**
   * Öffnet das führende Kalenderereignis im bestehenden Termin-Editor. Die
   * Anforderung trägt Kalender und stabile UID: Ist der Zielkalender noch nicht
   * ausgewählt, wird zuerst genau dieser ausgewählt und – nur wenn seine
   * Ereignisse noch nicht geladen sind – einmalig nachgeladen. Die Anforderung
   * bleibt bestehen, bis die Kalenderansicht sie auflösen kann oder der Editor
   * wieder geschlossen wird. Es entsteht kein neuer Endpunkt und kein zweiter
   * Schreibpfad.
   */
  const openEventEditor = useCallback(
    (request: { calendarId: string; uid: string }) => {
      setEditEventRequest(request);
      setView("calendar");
      if (request.calendarId === selectedCalendarId) return;
      setSelectedCalendarId(request.calendarId);
      setCalendarWarning(null);
      if (request.calendarId === eventsCalendarId) return;
      void loadEvents(request.calendarId);
    },
    [eventsCalendarId, loadEvents, selectedCalendarId],
  );

  const handleEditTaskRequest = useCallback(() => setEditTaskRequest(null), []);
  const handleEditEventRequest = useCallback(
    () => setEditEventRequest(null),
    [],
  );

  const saveEvent = async (
    event: CalendarEventResponse | null,
    payload: EventPayload,
  ) => {
    if (!selectedCalendarId) return;
    setSaving(true);
    setCalendarError(null);
    setCalendarWarning(null);
    setSuccess(null);
    try {
      if (event) {
        await api.updateEvent(
          selectedCalendarId,
          event.uid,
          event.etag,
          payload,
        );
        setSuccess("Der Termin wurde aktualisiert.");
      } else {
        await api.createEvent(selectedCalendarId, payload);
        setSuccess("Der Termin wurde angelegt.");
      }
      await reloadProjections(selectedCalendarId);
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.code === "PRECONDITION_FAILED"
      ) {
        await loadEvents(selectedCalendarId);
        setCalendarWarning(
          "Der Termin wurde zwischenzeitlich geändert. Die aktuelle Version wurde neu geladen; prüfe sie vor einem weiteren Speicherversuch.",
        );
      } else {
        setCalendarError(errorMessage(error));
      }
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async (event: CalendarEventResponse) => {
    if (!selectedCalendarId) return;
    setSaving(true);
    setCalendarError(null);
    setCalendarWarning(null);
    setSuccess(null);
    try {
      await api.deleteEvent(selectedCalendarId, event.uid, event.etag);
      setSuccess("Der Termin wurde gelöscht.");
      await Promise.all([
        loadTaskEventLinks(),
        reloadProjections(selectedCalendarId),
      ]);
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.code === "PRECONDITION_FAILED"
      ) {
        await loadEvents(selectedCalendarId);
        setCalendarWarning(
          "Der Termin wurde zwischenzeitlich geändert. Die aktuelle Version wurde neu geladen; prüfe sie vor einem weiteren Löschversuch.",
        );
      } else {
        setCalendarError(errorMessage(error));
      }
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const saveTask = async (
    task: TaskResponse | null,
    payload: CreateTaskRequest | UpdateTaskRequest,
  ) => {
    setSaving(true);
    setTaskError(null);
    setTaskSuccess(null);
    try {
      if (task) {
        await api.updateTask(task.id, payload);
        setTaskSuccess("Die Aufgabe wurde aktualisiert.");
      } else {
        await api.createTask(payload as CreateTaskRequest);
        setTaskSuccess("Die Aufgabe wurde angelegt.");
      }
      await reloadProjections(selectedCalendarId);
    } catch (error) {
      setTaskError(errorMessage(error));
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const updateTask = async (taskId: string, payload: UpdateTaskRequest) => {
    setSaving(true);
    setTaskError(null);
    setTaskSuccess(null);
    try {
      await api.updateTask(taskId, payload);
      setTaskSuccess("Die Aufgabe wurde aktualisiert.");
      await reloadProjections(selectedCalendarId);
    } catch (error) {
      setTaskError(errorMessage(error));
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const deleteTask = async (taskId: string) => {
    setSaving(true);
    setTaskError(null);
    setTaskSuccess(null);
    try {
      await api.deleteTask(taskId);
      setTaskSuccess("Die Aufgabe wurde gelöscht.");
      await Promise.all([
        loadTaskEventLinks(),
        reloadProjections(selectedCalendarId),
      ]);
    } catch (error) {
      setTaskError(errorMessage(error));
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const createTaskEventLink = async (input: CreateTaskEventLinkRequest) => {
    setSaving(true);
    setTaskError(null);
    setCalendarError(null);
    try {
      await api.createTaskEventLink(input);
      await loadTaskEventLinks();
      if (view === "tasks") {
        setTaskSuccess("Aufgabe und Termin wurden verknüpft.");
      } else {
        setSuccess("Termin und Aufgabe wurden verknüpft.");
      }
    } catch (error) {
      if (view === "tasks") setTaskError(errorMessage(error));
      else setCalendarError(errorMessage(error));
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const deleteTaskEventLink = async (linkId: string) => {
    setSaving(true);
    setTaskError(null);
    setCalendarError(null);
    try {
      await api.deleteTaskEventLink(linkId);
      await loadTaskEventLinks();
      if (view === "tasks") {
        setTaskSuccess("Die Aufgaben-Termin-Verknüpfung wurde entfernt.");
      } else {
        setSuccess("Die Termin-Aufgaben-Verknüpfung wurde entfernt.");
      }
    } catch (error) {
      if (view === "tasks") setTaskError(errorMessage(error));
      else setCalendarError(errorMessage(error));
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const changeStudy = async (
    operation: () => Promise<unknown>,
    message: string,
  ) => {
    setSaving(true);
    setStudyError(null);
    setStudySuccess(null);
    try {
      await operation();
      setStudySuccess(message);
      await Promise.all([loadStudy(), loadPlanning(planningRange)]);
    } catch (error) {
      setStudyError(errorMessage(error));
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const changeWork = async (
    operation: () => Promise<unknown>,
    message: string,
  ) => {
    setSaving(true);
    setWorkError(null);
    setWorkSuccess(null);
    try {
      await operation();
      setWorkSuccess(message);
      await Promise.all([loadWork(), loadPlanning(planningRange)]);
    } catch (error) {
      setWorkError(errorMessage(error));
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const changePlanning = async (
    operation: () => Promise<unknown>,
    message: string,
  ) => {
    setSaving(true);
    setPlanningError(null);
    setPlanningSuccess(null);
    try {
      await operation();
      setPlanningSuccess(message);
      await loadPlanning(planningRange);
    } catch (error) {
      setPlanningError(errorMessage(error));
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const changePlanningRange = (range: DateRange) => {
    setPlanningRange(range);
    void loadPlanning(range);
  };

  const changeProject = async (
    operation: () => Promise<unknown>,
    message: string,
  ) => {
    const selectedProjectId = projectDetail?.project.id;
    setSaving(true);
    setProjectError(null);
    setProjectSuccess(null);
    try {
      await operation();
      setProjectSuccess(message);
      await Promise.all([
        loadProjects(selectedProjectId),
        loadTasks(),
        loadDashboard(),
      ]);
    } catch (error) {
      setProjectError(errorMessage(error));
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const changeKnowledge = async (
    operation: () => Promise<unknown>,
    message: string,
    preferredNoteId?: string,
  ) => {
    setSaving(true);
    setKnowledgeError(null);
    setKnowledgeSuccess(null);
    try {
      const result = await operation();
      const createdId =
        result && typeof result === "object" && "id" in result
          ? String(result.id)
          : undefined;
      setKnowledgeSuccess(message);
      await loadKnowledge(preferredNoteId ?? createdId ?? noteDetail?.id);
    } catch (error) {
      setKnowledgeError(errorMessage(error));
      throw error;
    } finally {
      setSaving(false);
    }
  };

  if (session === "checking") {
    return (
      <main className="boot-screen" role="status">
        <div className="brand-mark" aria-hidden="true">
          <span />
        </div>
        <span className="spinner" />
        <p>Life OS wird lokal verbunden …</p>
      </main>
    );
  }

  if (setupRequired) {
    return (
      <Setup
        error={setupError}
        pending={setupPending}
        onSetup={completeSetup}
      />
    );
  }

  if (session === "anonymous" || !profile) {
    return <Login error={loginError} pending={loginPending} onLogin={login} />;
  }

  return (
    <Shell
      displayName={profile.displayName}
      view={view}
      onViewChange={setView}
      onLogout={() => void logout()}
    >
      {view === "dashboard" ? (
        <Dashboard
          profile={profile}
          snapshot={dashboard}
          loading={dashboardLoading}
          error={dashboardError}
          onReload={() => void loadDashboard()}
          onOpenTasks={() => setView("tasks")}
          onOpenCalendar={() => setView("calendar")}
          onOpenStudy={() => setView("study")}
          onOpenPlanning={() => setView("planning")}
          studyEntries={study?.entries ?? []}
          onCreateTask={() => {
            setTaskDraft(null);
            setCreateRequest("task");
            setView("tasks");
          }}
          onCreateEvent={() => {
            setCreateRequest("event");
            setView("calendar");
          }}
        />
      ) : view === "tasks" ? (
        <TaskWorkspace
          tasks={tasks}
          events={events}
          links={taskEventLinks}
          modules={study?.modules ?? []}
          projects={projects?.projects ?? []}
          createDefaults={taskDraft}
          selectedCalendarId={selectedCalendarId}
          timezone={profile.settings.timezone}
          loading={tasksLoading}
          saving={saving}
          error={taskError}
          success={taskSuccess}
          createRequested={createRequest === "task"}
          onCreateRequestHandled={() => setCreateRequest(null)}
          editRequestId={editTaskRequest}
          onEditRequestHandled={handleEditTaskRequest}
          onReload={() => void loadTasks()}
          onSave={saveTask}
          onUpdate={updateTask}
          onDelete={deleteTask}
          onLink={createTaskEventLink}
          onUnlink={deleteTaskEventLink}
        />
      ) : view === "study" ? (
        <StudyWorkspace
          overview={study}
          timezone={profile.settings.timezone}
          loading={studyLoading}
          saving={saving}
          error={studyError}
          success={studySuccess}
          onReload={() => void loadStudy()}
          onCreateProgram={(value: CreateStudyProgramRequest) =>
            changeStudy(
              () => api.createStudyProgram(value),
              "Der Studienabschnitt wurde angelegt.",
            )
          }
          onCreateModule={(value: CreateStudyModuleRequest) =>
            changeStudy(
              () => api.createStudyModule(value),
              "Das Modul wurde angelegt.",
            )
          }
          onCreateEntry={(value: CreateStudyEntryRequest) =>
            changeStudy(
              () => api.createStudyEntry(value),
              "Der Studieneintrag wurde angelegt.",
            )
          }
          onUpdateProgram={(id: string, value: UpdateStudyProgramRequest) =>
            changeStudy(
              () => api.updateStudyProgram(id, value),
              "Der Studienabschnitt wurde aktualisiert.",
            )
          }
          onUpdateModule={(id: string, value: UpdateStudyModuleRequest) =>
            changeStudy(
              () => api.updateStudyModule(id, value),
              "Das Modul wurde aktualisiert.",
            )
          }
          onUpdateEntry={(id: string, value: UpdateStudyEntryRequest) =>
            changeStudy(
              () => api.updateStudyEntry(id, value),
              "Der Studieneintrag wurde aktualisiert.",
            )
          }
          onCreateTaskForModule={(moduleId: string) => {
            setTaskDraft({ studyModuleId: moduleId, area: "study" });
            setCreateRequest("task");
            setView("tasks");
          }}
        />
      ) : view === "work" ? (
        <WorkWorkspace
          overview={work}
          tasks={tasks}
          timezone={profile.settings.timezone}
          loading={workLoading}
          saving={saving}
          error={workError}
          success={workSuccess}
          onReload={() => void loadWork()}
          onCreateContext={(value: CreateWorkContextRequest) =>
            changeWork(
              () => api.createWorkContext(value),
              "Der Arbeitsbereich wurde angelegt.",
            )
          }
          onUpdateContext={(id: string, value: UpdateWorkContextRequest) =>
            changeWork(
              () => api.updateWorkContext(id, value),
              "Der Arbeitsbereich wurde aktualisiert.",
            )
          }
          onCreateProject={(value: CreateWorkProjectRequest) =>
            changeWork(
              () => api.createWorkProject(value),
              "Das Arbeitsprojekt wurde angelegt.",
            )
          }
          onUpdateProject={(id: string, value: UpdateWorkProjectRequest) =>
            changeWork(
              () => api.updateWorkProject(id, value),
              "Das Arbeitsprojekt wurde aktualisiert.",
            )
          }
          onCreateTaskLink={(value: CreateWorkTaskLinkRequest) =>
            changeWork(
              () => api.createWorkTaskLink(value),
              "Die Arbeitsaufgabe wurde zugeordnet.",
            )
          }
          onDeleteTaskLink={(id: string) =>
            changeWork(
              () => api.deleteWorkTaskLink(id),
              "Die Aufgabenzuordnung wurde entfernt.",
            )
          }
          onCreateTimeEntry={(value: CreateWorkTimeEntryRequest) =>
            changeWork(
              () => api.createWorkTimeEntry(value),
              "Die Arbeitszeit wurde erfasst.",
            )
          }
          onUpdateTimeEntry={(id: string, value: UpdateWorkTimeEntryRequest) =>
            changeWork(
              () => api.updateWorkTimeEntry(id, value),
              "Die Arbeitszeit wurde aktualisiert.",
            )
          }
        />
      ) : view === "planning" ? (
        <PlanningWorkspace
          planning={planning}
          range={planningRange}
          timezone={profile.settings.timezone}
          weekStartsOn={profile.settings.weekStartsOn}
          loading={planningLoading}
          saving={saving}
          error={planningError}
          success={planningSuccess}
          onReload={() => void loadPlanning(planningRange)}
          onRangeChange={changePlanningRange}
          onOpenEvent={openEventEditor}
          onOpenTask={openTaskEditor}
          onCreateAvailability={(value: CreateAvailabilityWindowRequest) =>
            changePlanning(
              () => api.createAvailability(value),
              "Die persönliche Verfügbarkeit wurde gespeichert.",
            )
          }
          onDeleteAvailability={(id: string) =>
            changePlanning(
              () => api.deleteAvailability(id),
              "Die persönliche Verfügbarkeit wurde entfernt.",
            )
          }
        />
      ) : view === "projects" ? (
        <ProjectWorkspace
          overview={projects}
          detail={projectDetail}
          tasks={tasks}
          calendars={calendars}
          events={events}
          loading={projectLoading}
          saving={saving}
          error={projectError}
          success={projectSuccess}
          onReload={() => void loadProjects()}
          onSelect={(id) => void loadProject(id)}
          onCreateProject={(value: CreateProjectRequest) =>
            changeProject(
              () => api.createProject(value),
              "Das Projekt wurde angelegt.",
            )
          }
          onUpdateProject={(id: string, value: UpdateProjectRequest) =>
            changeProject(
              () => api.updateProject(id, value),
              "Das Projekt wurde aktualisiert.",
            )
          }
          onDeleteProject={(id: string) =>
            changeProject(
              () => api.deleteProject(id),
              "Das Projekt wurde gelöscht.",
            )
          }
          onCreateItem={(
            projectId: string,
            kind: "goals" | "milestones",
            value: CreateProjectItemRequest,
          ) =>
            changeProject(
              () => api.createProjectItem(projectId, kind, value),
              "Der Projekteintrag wurde angelegt.",
            )
          }
          onUpdateItem={(
            projectId: string,
            kind: "goals" | "milestones",
            itemId: string,
            value: UpdateProjectItemRequest,
          ) =>
            changeProject(
              () => api.updateProjectItem(projectId, kind, itemId, value),
              "Der Projekteintrag wurde aktualisiert.",
            )
          }
          onDeleteItem={(
            projectId: string,
            kind: "goals" | "milestones",
            itemId: string,
          ) =>
            changeProject(
              () => api.deleteProjectItem(projectId, kind, itemId),
              "Der Projekteintrag wurde gelöscht.",
            )
          }
          onLinkTask={(projectId: string, taskId: string) =>
            changeProject(
              () => api.linkProjectTask(projectId, { taskId }),
              "Die Aufgabe wurde verknüpft.",
            )
          }
          onUnlinkTask={(projectId: string, taskId: string) =>
            changeProject(
              () => api.unlinkProjectTask(projectId, taskId),
              "Die Aufgabenverknüpfung wurde entfernt.",
            )
          }
          onLinkEvent={(
            projectId: string,
            calendarId: string,
            eventUid: string,
          ) =>
            changeProject(
              () => api.linkProjectEvent(projectId, { calendarId, eventUid }),
              "Der Termin wurde verknüpft.",
            )
          }
          onUnlinkEvent={(
            projectId: string,
            calendarId: string,
            eventUid: string,
          ) =>
            changeProject(
              () => api.unlinkProjectEvent(projectId, calendarId, eventUid),
              "Die Terminverknüpfung wurde entfernt.",
            )
          }
        />
      ) : view === "fitness" ? (
        <FitnessWorkspace
          calendars={calendars}
          events={events}
          selectedCalendarId={selectedCalendarId}
          timezone={profile.settings.timezone}
        />
      ) : view === "shopping" ? (
        <ShoppingWorkspace />
      ) : view === "settings" ? (
        <IntegrationsWorkspace calendars={calendars} />
      ) : view === "knowledge" ? (
        <KnowledgeWorkspace
          key={noteDetail?.id ?? "new-note"}
          overview={knowledge}
          detail={noteDetail}
          projects={projects?.projects ?? []}
          modules={study?.modules ?? []}
          loading={knowledgeLoading}
          saving={saving}
          error={knowledgeError}
          success={knowledgeSuccess}
          search={search}
          searchLoading={searchLoading}
          searchError={searchError}
          aiResponse={aiResponse}
          aiLoading={aiLoading}
          aiError={aiError}
          onReload={() => void loadKnowledge(noteDetail?.id)}
          onSearch={runSearch}
          onOpenSearchResult={openSearchResult}
          onPrepareAiSources={prepareAiSources}
          onConfirmAiSuggestion={confirmAiSuggestion}
          onSelectNote={(id) => void loadNote(id)}
          onCreateNote={(value: CreateNoteRequest) =>
            changeKnowledge(
              () => api.createNote(value),
              "Die Notiz wurde angelegt.",
            )
          }
          onUpdateNote={(id: string, value: UpdateNoteRequest) =>
            changeKnowledge(
              () => api.updateNote(id, value),
              "Die Notiz wurde aktualisiert.",
              id,
            )
          }
          onDeleteNote={(id: string) =>
            changeKnowledge(
              () => api.deleteNote(id),
              "Die Notiz wurde gelöscht.",
            )
          }
          onUploadDocument={(file: File, links: UpdateDocumentRequest) =>
            changeKnowledge(
              () => api.uploadDocument(file, links),
              "Das Dokument wurde lokal abgelegt.",
            )
          }
          onUpdateDocument={(id: string, value: UpdateDocumentRequest) =>
            changeKnowledge(
              () => api.updateDocument(id, value),
              "Das Dokument wurde aktualisiert.",
            )
          }
          onDeleteDocument={(id: string) =>
            changeKnowledge(
              () => api.deleteDocument(id),
              "Das Dokument wurde sicher gelöscht.",
            )
          }
        />
      ) : (
        <CalendarWorkspace
          calendars={calendars}
          selectedCalendarId={selectedCalendarId}
          eventsCalendarId={eventsCalendarId}
          events={events}
          studyEntries={study?.entries ?? []}
          tasks={tasks}
          links={taskEventLinks}
          ownerId={profile.id}
          profileTimezone={profile.settings.timezone}
          initialView={profile.settings.defaultCalendarView}
          loading={eventsLoading}
          saving={saving}
          error={calendarError}
          warning={calendarWarning}
          success={success}
          createRequested={createRequest === "event"}
          onCreateRequestHandled={() => setCreateRequest(null)}
          editEventRequest={editEventRequest}
          onEditEventRequestHandled={handleEditEventRequest}
          onRequestEditEvent={openEventEditor}
          onCalendarChange={changeCalendar}
          onOpenTask={openTaskEditor}
          onReload={() => {
            setCalendarWarning(null);
            if (selectedCalendarId) void loadEvents(selectedCalendarId);
          }}
          onSave={saveEvent}
          onDelete={deleteEvent}
          onLink={createTaskEventLink}
          onUnlink={deleteTaskEventLink}
        />
      )}
    </Shell>
  );
};
