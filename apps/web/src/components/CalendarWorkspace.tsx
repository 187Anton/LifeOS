import type {
  CalendarEventResponse,
  CalendarResponse,
} from "@lifeos/contracts";
import { useState } from "react";

import type { EventPayload } from "../api";
import { eventSortValue, formatEventDate, formatEventTime } from "../date";
import { CalendarIcon, ClockIcon, EditIcon, PlusIcon } from "./Icons";
import { EventForm } from "./EventForm";

interface CalendarWorkspaceProps {
  calendars: CalendarResponse[];
  selectedCalendarId: string | null;
  events: CalendarEventResponse[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  success: string | null;
  onCalendarChange: (calendarId: string) => void;
  onReload: () => void;
  onSave: (
    event: CalendarEventResponse | null,
    payload: EventPayload,
  ) => Promise<void>;
}

export const CalendarWorkspace = ({
  calendars,
  selectedCalendarId,
  events,
  loading,
  saving,
  error,
  success,
  onCalendarChange,
  onReload,
  onSave,
}: CalendarWorkspaceProps) => {
  const [editorEvent, setEditorEvent] = useState<
    CalendarEventResponse | null | undefined
  >(undefined);
  const selectedCalendar = calendars.find(
    (calendar) => calendar.id === selectedCalendarId,
  );
  const sortedEvents = [...events].sort(
    (left, right) => eventSortValue(left) - eventSortValue(right),
  );

  const save = async (payload: EventPayload) => {
    await onSave(editorEvent ?? null, payload);
    setEditorEvent(undefined);
  };

  return (
    <main className="page-content calendar-page">
      <header className="page-heading calendar-heading">
        <div>
          <p className="eyebrow">DEINE ZEIT</p>
          <h1>Kalender</h1>
          <p>Plane Termine lokal. Änderungen erscheinen auch über CalDAV.</p>
        </div>
        <button
          className="primary-button"
          onClick={() => setEditorEvent(null)}
          disabled={!selectedCalendar}
        >
          <PlusIcon /> Neuer Termin
        </button>
      </header>

      {calendars.length > 0 ? (
        <div className="calendar-toolbar">
          <label htmlFor="calendar-select">Kalender</label>
          <select
            id="calendar-select"
            value={selectedCalendarId ?? ""}
            onChange={(event) => onCalendarChange(event.target.value)}
          >
            {calendars.map((calendar) => (
              <option key={calendar.id} value={calendar.id}>
                {calendar.name}
                {calendar.isPrimary ? " · Primär" : ""}
              </option>
            ))}
          </select>
          <span className="timezone-chip">{selectedCalendar?.timezone}</span>
        </div>
      ) : null}

      {success ? (
        <p role="status" className="success-banner">
          {success}
        </p>
      ) : null}

      <div
        className={
          editorEvent !== undefined
            ? "calendar-layout editor-open"
            : "calendar-layout"
        }
      >
        <section
          className="event-list-section"
          aria-labelledby="event-list-title"
        >
          <div className="section-heading event-list-heading">
            <div>
              <h2 id="event-list-title">Gespeicherte Termine</h2>
              <p>{selectedCalendar?.name ?? "Kein Kalender ausgewählt"}</p>
            </div>
            {!loading && !error ? <span>{events.length} Einträge</span> : null}
          </div>

          {loading ? (
            <div className="loading-state" role="status">
              <span className="spinner" />
              <p>Kalender wird geladen …</p>
            </div>
          ) : error ? (
            <div className="state-card error-state" role="alert">
              <h3>Kalender nicht erreichbar</h3>
              <p>{error}</p>
              <button className="secondary-button" onClick={onReload}>
                Erneut versuchen
              </button>
            </div>
          ) : calendars.length === 0 ? (
            <div className="state-card empty-state">
              <CalendarIcon />
              <h3>Noch kein Kalender</h3>
              <p>
                Lege zunächst über die API oder den Seed einen lokalen Kalender
                an.
              </p>
            </div>
          ) : sortedEvents.length === 0 ? (
            <div className="state-card empty-state">
              <ClockIcon />
              <h3>Dieser Kalender ist noch frei</h3>
              <p>
                Der erste Termin schafft eine verlässliche Zeitbasis für LifeOS.
              </p>
              <button
                className="primary-button"
                onClick={() => setEditorEvent(null)}
              >
                <PlusIcon /> Ersten Termin anlegen
              </button>
            </div>
          ) : (
            <ol className="event-list">
              {sortedEvents.map((event) => (
                <li key={event.uid}>
                  <article className="event-card">
                    <span className="event-accent" aria-hidden="true" />
                    <div className="event-when">
                      <strong>{formatEventDate(event)}</strong>
                      <span>{formatEventTime(event)}</span>
                    </div>
                    <div className="event-copy">
                      <h3>{event.title}</h3>
                      <p>
                        {event.location ||
                          event.description ||
                          "Keine weiteren Angaben"}
                      </p>
                      <div className="event-tags">
                        {event.recurrenceRule ? (
                          <span>Wiederholung</span>
                        ) : null}
                        {event.reminderMinutes.length > 0 ? (
                          <span>Erinnerung</span>
                        ) : null}
                      </div>
                    </div>
                    <button
                      className="icon-button"
                      onClick={() => setEditorEvent(event)}
                      aria-label={`${event.title} bearbeiten`}
                    >
                      <EditIcon />
                    </button>
                  </article>
                </li>
              ))}
            </ol>
          )}
        </section>

        {editorEvent !== undefined ? (
          <EventForm
            key={editorEvent?.etag ?? "new-event"}
            event={editorEvent}
            pending={saving}
            onCancel={() => setEditorEvent(undefined)}
            onSubmit={save}
          />
        ) : null}
      </div>
    </main>
  );
};
