import type {
  CalendarEventResponse,
  CalendarResponse,
  CreateTaskEventLinkRequest,
  StudyEntryResponse,
  TaskEventLinkResponse,
  TaskResponse,
} from "@lifeos/contracts";
import { useEffect, useMemo, useState } from "react";

import type { EventPayload } from "../api";
import {
  daysInRange,
  formatOccurrenceTime,
  formatPeriodTitle,
  moveAnchor,
  occurrencesInRange,
  rangeForView,
  todayInTimezone,
  type CalendarOccurrence,
  type CalendarView,
} from "../calendar-view";
import { CalendarIcon, ClockIcon, EditIcon, PlusIcon } from "./Icons";
import { EventForm } from "./EventForm";
import { IcsTransferPanel } from "./IcsTransferPanel";

interface CalendarWorkspaceProps {
  calendars: CalendarResponse[];
  selectedCalendarId: string | null;
  events: CalendarEventResponse[];
  studyEntries: StudyEntryResponse[];
  tasks: TaskResponse[];
  links: TaskEventLinkResponse[];
  initialView: CalendarView;
  loading: boolean;
  saving: boolean;
  error: string | null;
  warning: string | null;
  success: string | null;
  createRequested: boolean;
  onCreateRequestHandled: () => void;
  onCalendarChange: (calendarId: string) => void;
  onReload: () => void;
  onSave: (
    event: CalendarEventResponse | null,
    payload: EventPayload,
  ) => Promise<void>;
  onDelete: (event: CalendarEventResponse) => Promise<void>;
  onLink: (input: CreateTaskEventLinkRequest) => Promise<void>;
  onUnlink: (linkId: string) => Promise<void>;
}

const viewLabels: Record<CalendarView, string> = {
  day: "Tag",
  week: "Woche",
  month: "Monat",
  agenda: "Agenda",
};

const dateLabel = (date: string, long = false): string =>
  new Intl.DateTimeFormat("de-DE", {
    weekday: long ? "long" : "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00.000Z`));

const timestampDate = (value: string, timezone: string): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

const OccurrenceCard = ({
  occurrence,
  compact = false,
  onEdit,
}: {
  occurrence: CalendarOccurrence;
  compact?: boolean;
  onEdit: (event: CalendarEventResponse) => void;
}) => (
  <article className={compact ? "event-card compact-event" : "event-card"}>
    <span className="event-accent" aria-hidden="true" />
    {!compact ? (
      <div className="event-when">
        <strong>{dateLabel(occurrence.dateKey, true)}</strong>
        <span>{formatOccurrenceTime(occurrence)}</span>
      </div>
    ) : (
      <span className="compact-event-time">
        {formatOccurrenceTime(occurrence)}
      </span>
    )}
    <div className="event-copy">
      <h3>{occurrence.event.title}</h3>
      {!compact ? (
        <p>
          {occurrence.event.location ||
            occurrence.event.description ||
            "Keine weiteren Angaben"}
        </p>
      ) : null}
      <div className="event-tags">
        {occurrence.recurring ? <span>Serie</span> : null}
        {occurrence.event.isAllDay ? <span>Ganztägig</span> : null}
        {!compact && occurrence.event.reminderMinutes.length > 0 ? (
          <span>Erinnerung</span>
        ) : null}
        {!compact ? <span>{occurrence.event.timezone}</span> : null}
      </div>
    </div>
    <button
      className="icon-button"
      onClick={() => onEdit(occurrence.event)}
      aria-label={`${occurrence.event.title} bearbeiten`}
    >
      <EditIcon />
    </button>
  </article>
);

const PeriodView = ({
  view,
  range,
  occurrences,
  onEdit,
}: {
  view: CalendarView;
  range: ReturnType<typeof rangeForView>;
  occurrences: CalendarOccurrence[];
  onEdit: (event: CalendarEventResponse) => void;
}) => {
  const days =
    view === "day"
      ? [range.start]
      : daysInRange(range).filter((date) =>
          occurrences.some((occurrence) => occurrence.dateKey === date),
        );

  if (occurrences.length === 0) {
    return (
      <div className="state-card empty-state compact-empty">
        <ClockIcon />
        <h3>Keine Termine in diesem Zeitraum</h3>
        <p>Wechsle den Zeitraum oder lege einen neuen Termin an.</p>
      </div>
    );
  }

  return (
    <div className="calendar-period-list">
      {days.map((date) => (
        <section className="calendar-day-group" key={date}>
          <header>
            <h3>{dateLabel(date, true)}</h3>
            <span>
              {
                occurrences.filter((occurrence) => occurrence.dateKey === date)
                  .length
              }{" "}
              Termine
            </span>
          </header>
          <ol className="event-list">
            {occurrences
              .filter((occurrence) => occurrence.dateKey === date)
              .map((occurrence) => (
                <li key={occurrence.key}>
                  <OccurrenceCard occurrence={occurrence} onEdit={onEdit} />
                </li>
              ))}
          </ol>
        </section>
      ))}
    </div>
  );
};

const MonthView = ({
  range,
  occurrences,
  onEdit,
}: {
  range: ReturnType<typeof rangeForView>;
  occurrences: CalendarOccurrence[];
  onEdit: (event: CalendarEventResponse) => void;
}) => {
  const days = daysInRange(range);
  const firstColumn =
    ((new Date(`${range.start}T12:00:00.000Z`).getUTCDay() + 6) % 7) + 1;

  return (
    <div className="month-view" aria-label="Monatsansicht">
      <div className="month-weekdays" aria-hidden="true">
        {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="month-grid">
        {days.map((date, index) => {
          const dayOccurrences = occurrences.filter(
            (occurrence) => occurrence.dateKey === date,
          );
          return (
            <section
              className={
                index === 0
                  ? `month-day month-day-start-${firstColumn}`
                  : "month-day"
              }
              key={date}
              aria-label={dateLabel(date, true)}
            >
              <time dateTime={date}>{Number(date.slice(-2))}</time>
              <div className="month-events">
                {dayOccurrences.map((occurrence) => (
                  <button
                    type="button"
                    key={occurrence.key}
                    className={
                      occurrence.event.isAllDay
                        ? "month-event all-day"
                        : "month-event"
                    }
                    onClick={() => onEdit(occurrence.event)}
                    title={`${formatOccurrenceTime(occurrence)} · ${occurrence.event.title}`}
                  >
                    <span>{formatOccurrenceTime(occurrence)}</span>
                    {occurrence.event.title}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

export const CalendarWorkspace = ({
  calendars,
  selectedCalendarId,
  events,
  studyEntries,
  tasks,
  links,
  initialView,
  loading,
  saving,
  error,
  warning,
  success,
  createRequested,
  onCreateRequestHandled,
  onCalendarChange,
  onReload,
  onSave,
  onDelete,
  onLink,
  onUnlink,
}: CalendarWorkspaceProps) => {
  const [editorEvent, setEditorEvent] = useState<
    CalendarEventResponse | null | undefined
  >(createRequested ? null : undefined);
  useEffect(() => {
    if (createRequested) onCreateRequestHandled();
  }, [createRequested, onCreateRequestHandled]);
  const selectedCalendar = calendars.find(
    (calendar) => calendar.id === selectedCalendarId,
  );
  const timezone = selectedCalendar?.timezone ?? "UTC";
  const [view, setView] = useState<CalendarView>(initialView);
  const [anchor, setAnchor] = useState(() => todayInTimezone(timezone));
  const range = useMemo(() => rangeForView(view, anchor), [view, anchor]);
  const occurrences = useMemo(
    () => occurrencesInRange(events, range, timezone),
    [events, range, timezone],
  );
  const visibleStudyEntries = useMemo(
    () =>
      studyEntries
        .filter(
          (entry) =>
            !entry.archivedAt &&
            !["completed", "cancelled"].includes(entry.status),
        )
        .map((entry) => ({
          entry,
          date:
            entry.dueDate ??
            (entry.startsAt ? timestampDate(entry.startsAt, timezone) : null),
        }))
        .filter((value): value is { entry: StudyEntryResponse; date: string } =>
          Boolean(
            value.date && value.date >= range.start && value.date < range.end,
          ),
        )
        .sort((left, right) => left.date.localeCompare(right.date)),
    [range.end, range.start, studyEntries, timezone],
  );

  const save = async (payload: EventPayload) => {
    await onSave(editorEvent ?? null, payload);
    setEditorEvent(undefined);
  };

  const deleteEvent = async () => {
    if (!editorEvent) return;
    await onDelete(editorEvent);
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
          <span className="timezone-chip">{timezone}</span>
        </div>
      ) : null}

      {success ? (
        <p role="status" className="success-banner">
          {success}
        </p>
      ) : null}
      {warning ? (
        <p role="alert" className="conflict-banner">
          {warning}
        </p>
      ) : null}

      <IcsTransferPanel calendarId={selectedCalendarId} onImported={onReload} />

      <div
        className={
          editorEvent !== undefined
            ? "calendar-layout editor-open"
            : "calendar-layout"
        }
      >
        <section
          className="event-list-section calendar-view-section"
          aria-labelledby="event-list-title"
        >
          <div className="calendar-view-toolbar">
            <div
              className="view-switcher"
              role="group"
              aria-label="Kalenderansicht"
            >
              {(Object.keys(viewLabels) as CalendarView[]).map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  className={candidate === view ? "active" : ""}
                  aria-pressed={candidate === view}
                  onClick={() => setView(candidate)}
                >
                  {viewLabels[candidate]}
                </button>
              ))}
            </div>
            <div className="period-navigation">
              <button
                type="button"
                className="icon-button"
                aria-label="Vorheriger Zeitraum"
                onClick={() => setAnchor(moveAnchor(view, anchor, -1))}
              >
                ←
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setAnchor(todayInTimezone(timezone))}
              >
                Heute
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Nächster Zeitraum"
                onClick={() => setAnchor(moveAnchor(view, anchor, 1))}
              >
                →
              </button>
            </div>
          </div>

          <div className="section-heading event-list-heading">
            <div>
              <h2 id="event-list-title">
                {formatPeriodTitle(view, range, timezone)}
              </h2>
              <p>{selectedCalendar?.name ?? "Kein Kalender ausgewählt"}</p>
            </div>
            {!loading && !error ? (
              <span>{occurrences.length} sichtbar</span>
            ) : null}
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
          ) : events.length === 0 ? (
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
          ) : view === "month" ? (
            <MonthView
              range={range}
              occurrences={occurrences}
              onEdit={setEditorEvent}
            />
          ) : (
            <PeriodView
              view={view}
              range={range}
              occurrences={occurrences}
              onEdit={setEditorEvent}
            />
          )}

          <section
            className="study-deadlines"
            aria-labelledby="study-deadlines-title"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">STUDIUM · NUR ANZEIGE</p>
                <h2 id="study-deadlines-title">
                  Prüfungen, Abgaben und Lernzeiten
                </h2>
              </div>
              <span>{visibleStudyEntries.length} sichtbar</span>
            </div>
            {visibleStudyEntries.length ? (
              <div className="study-deadline-list">
                {visibleStudyEntries.map(({ entry, date }) => (
                  <article className="study-deadline-card" key={entry.id}>
                    <strong>{dateLabel(date, true)}</strong>
                    <span>{entry.title}</span>
                    <small>
                      {entry.kind === "exam"
                        ? "Prüfung"
                        : entry.kind === "submission"
                          ? "Abgabe"
                          : entry.kind === "lecture"
                            ? "Lehrveranstaltung"
                            : "Lernzeit"}
                      {entry.startsAt
                        ? ` · ${new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: entry.timezone ?? timezone }).format(new Date(entry.startsAt))}`
                        : " · ganztägig"}
                    </small>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted-copy">
                Keine Studienfristen in diesem Zeitraum. Kalenderdaten werden
                nicht automatisch verändert.
              </p>
            )}
          </section>
        </section>

        {editorEvent !== undefined ? (
          <EventForm
            key={editorEvent?.etag ?? "new-event"}
            event={editorEvent}
            calendarId={selectedCalendarId}
            tasks={tasks}
            events={events}
            links={links}
            pending={saving}
            onCancel={() => setEditorEvent(undefined)}
            onSubmit={save}
            onDelete={deleteEvent}
            onLink={onLink}
            onUnlink={onUnlink}
          />
        ) : null}
      </div>
    </main>
  );
};
