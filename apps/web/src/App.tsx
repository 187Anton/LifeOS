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
} from "@lifeos/contracts";
import { useCallback, useEffect, useState } from "react";

import { api, ApiClientError, type EventPayload } from "./api";
import { CalendarWorkspace } from "./components/CalendarWorkspace";
import { Dashboard } from "./components/Dashboard";
import { Login } from "./components/Login";
import { Shell, type View } from "./components/Shell";
import { TaskWorkspace } from "./components/TaskWorkspace";
import { StudyWorkspace } from "./components/StudyWorkspace";
import { WorkWorkspace } from "./components/WorkWorkspace";
import { PlanningWorkspace } from "./components/PlanningWorkspace";
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
  const [planningRange, setPlanningRange] = useState<DateRange>(() =>
    weekRange("Europe/Berlin", 1),
  );
  const [view, setView] = useState<View>("dashboard");
  const [createRequest, setCreateRequest] = useState<"task" | "event" | null>(
    null,
  );
  const [loginPending, setLoginPending] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
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
    setEventsLoading(true);
    setCalendarError(null);
    try {
      setEvents(await api.listEvents(calendarId));
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        setSession("anonymous");
      } else {
        setCalendarError(errorMessage(error));
      }
      setEvents([]);
    } finally {
      setEventsLoading(false);
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
    if (!selected) setEvents([]);
    setSession("authenticated");
    await Promise.all([
      selected ? loadEvents(selected.id) : Promise.resolve(),
      loadDashboard(),
      loadStudy(),
      loadWork(),
      loadPlanning(currentPlanningRange),
    ]);
  }, [loadDashboard, loadEvents, loadPlanning, loadStudy, loadWork]);

  useEffect(() => {
    // Der initiale API-Aufruf synchronisiert React mit der lokalen Sitzung.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAuthenticatedData().catch((error: unknown) => {
      setSession("anonymous");
      if (!(error instanceof ApiClientError && error.status === 401)) {
        setLoginError(errorMessage(error));
      }
    });
  }, [loadAuthenticatedData]);

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
    setTasks([]);
    setTaskEventLinks([]);
    setDashboard(null);
    setStudy(null);
    setWork(null);
    setPlanning(null);
    setSelectedCalendarId(null);
    setLoginError(null);
  };

  const changeCalendar = (calendarId: string) => {
    setSelectedCalendarId(calendarId);
    setSuccess(null);
    setCalendarWarning(null);
    void loadEvents(calendarId);
  };

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
      await Promise.all([
        loadEvents(selectedCalendarId),
        loadDashboard(),
        loadPlanning(planningRange),
      ]);
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
        loadEvents(selectedCalendarId),
        loadTaskEventLinks(),
        loadDashboard(),
        loadPlanning(planningRange),
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
      await Promise.all([
        loadTasks(),
        loadDashboard(),
        loadPlanning(planningRange),
      ]);
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
      await Promise.all([
        loadTasks(),
        loadDashboard(),
        loadPlanning(planningRange),
      ]);
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
        loadTasks(),
        loadTaskEventLinks(),
        loadDashboard(),
        loadPlanning(planningRange),
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
          selectedCalendarId={selectedCalendarId}
          timezone={profile.settings.timezone}
          loading={tasksLoading}
          saving={saving}
          error={taskError}
          success={taskSuccess}
          createRequested={createRequest === "task"}
          onCreateRequestHandled={() => setCreateRequest(null)}
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
      ) : (
        <CalendarWorkspace
          calendars={calendars}
          selectedCalendarId={selectedCalendarId}
          events={events}
          studyEntries={study?.entries ?? []}
          tasks={tasks}
          links={taskEventLinks}
          initialView={profile.settings.defaultCalendarView}
          loading={eventsLoading}
          saving={saving}
          error={calendarError}
          warning={calendarWarning}
          success={success}
          createRequested={createRequest === "event"}
          onCreateRequestHandled={() => setCreateRequest(null)}
          onCalendarChange={changeCalendar}
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
