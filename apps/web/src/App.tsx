import type {
  CalendarEventResponse,
  CalendarResponse,
  CreateTaskEventLinkRequest,
  CreateTaskRequest,
  ProfileResponse,
  TaskResponse,
  TaskEventLinkResponse,
  UpdateTaskRequest,
} from "@lifeos/contracts";
import { useCallback, useEffect, useState } from "react";

import { api, ApiClientError, type EventPayload } from "./api";
import { CalendarWorkspace } from "./components/CalendarWorkspace";
import { Dashboard } from "./components/Dashboard";
import { Login } from "./components/Login";
import { Shell, type View } from "./components/Shell";
import { TaskWorkspace } from "./components/TaskWorkspace";

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
  const [view, setView] = useState<View>("dashboard");
  const [loginPending, setLoginPending] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [calendarWarning, setCalendarWarning] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
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
    if (selected) await loadEvents(selected.id);
    else setEvents([]);
    setSession("authenticated");
  }, [loadEvents]);

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
      await loadEvents(selectedCalendarId);
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
      await Promise.all([loadEvents(selectedCalendarId), loadTaskEventLinks()]);
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
      await loadTasks();
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
      await loadTasks();
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
      await Promise.all([loadTasks(), loadTaskEventLinks()]);
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
          calendars={calendars}
          events={events}
          onOpenCalendar={() => setView("calendar")}
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
          onReload={() => void loadTasks()}
          onSave={saveTask}
          onUpdate={updateTask}
          onDelete={deleteTask}
          onLink={createTaskEventLink}
          onUnlink={deleteTaskEventLink}
        />
      ) : (
        <CalendarWorkspace
          calendars={calendars}
          selectedCalendarId={selectedCalendarId}
          events={events}
          tasks={tasks}
          links={taskEventLinks}
          initialView={profile.settings.defaultCalendarView}
          loading={eventsLoading}
          saving={saving}
          error={calendarError}
          warning={calendarWarning}
          success={success}
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
