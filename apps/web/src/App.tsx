import type {
  CalendarEventResponse,
  CalendarResponse,
  ProfileResponse,
} from "@lifeos/contracts";
import { useCallback, useEffect, useState } from "react";

import { api, ApiClientError, type EventPayload } from "./api";
import { CalendarWorkspace } from "./components/CalendarWorkspace";
import { Dashboard } from "./components/Dashboard";
import { Login } from "./components/Login";
import { Shell, type View } from "./components/Shell";

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
  const [view, setView] = useState<View>("dashboard");
  const [loginPending, setLoginPending] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

  const loadAuthenticatedData = useCallback(async () => {
    const [loadedProfile, loadedCalendars] = await Promise.all([
      api.getProfile(),
      api.listCalendars(),
    ]);
    setProfile(loadedProfile);
    setCalendars(loadedCalendars);
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
    setSelectedCalendarId(null);
    setLoginError(null);
  };

  const changeCalendar = (calendarId: string) => {
    setSelectedCalendarId(calendarId);
    setSuccess(null);
    void loadEvents(calendarId);
  };

  const saveEvent = async (
    event: CalendarEventResponse | null,
    payload: EventPayload,
  ) => {
    if (!selectedCalendarId) return;
    setSaving(true);
    setCalendarError(null);
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
      setCalendarError(errorMessage(error));
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
      ) : (
        <CalendarWorkspace
          calendars={calendars}
          selectedCalendarId={selectedCalendarId}
          events={events}
          loading={eventsLoading}
          saving={saving}
          error={calendarError}
          success={success}
          onCalendarChange={changeCalendar}
          onReload={() =>
            selectedCalendarId && void loadEvents(selectedCalendarId)
          }
          onSave={saveEvent}
        />
      )}
    </Shell>
  );
};
