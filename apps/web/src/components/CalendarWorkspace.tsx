import type {
  CalendarEventResponse,
  CalendarResponse,
  CreateTaskEventLinkRequest,
  PlanningItemResponse,
  StudyEntryResponse,
  TaskEventLinkResponse,
  TaskResponse,
} from "@lifeos/contracts";
import { useEffect, useMemo, useState } from "react";

import type { EventPayload } from "../api";
import {
  areaLabels,
  buildCalendarProjection,
  continuationLabels,
  formatProjectionTime,
  kindLabels,
  type CalendarProjectionEntry,
} from "../calendar-projection";
import {
  daysInRange,
  formatPeriodTitle,
  moveAnchor,
  rangeForView,
  todayInTimezone,
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
  /** Besitzerkennung der geladenen, ausschließlich eigenen Daten. */
  ownerId: string;
  /**
   * Profilzeitzone und damit Tagesgrenze der gesamten Ansicht: Sie gilt für
   * Aufgaben, Studieneinträge und Termine gleichermaßen, damit der
   * Kalender-Zeitzonenwert der Quelle keinen anderen sichtbaren Tag ergibt.
   * Die Prop `timezone` bleibt der beschreibende Zeitzonenwert des gewählten
   * Kalenders.
   */
  profileTimezone: string;
  initialView: CalendarView;
  loading: boolean;
  saving: boolean;
  error: string | null;
  warning: string | null;
  success: string | null;
  createRequested: boolean;
  onCreateRequestHandled: () => void;
  /**
   * Angefordertes Kalenderereignis aus einer anderen Ansicht. Die Anforderung
   * trägt die calendarId des führenden Termins; App.tsx wählt zuerst diesen
   * Kalender aus und lädt dessen Ereignisse. Erst ein zur Anforderung passender
   * Kalender öffnet den bestehenden Termin-Editor über die stabile UID und den
   * aktuellen ETag.
   */
  editEventRequest: { calendarId: string; uid: string } | null;
  /**
   * Kalender der aktuell geladenen Ereignisse. Eine Anforderung gilt erst als
   * auflösbar, wenn ihr `calendarId` genau diesem Kalender entspricht; sonst
   * bleibt sie unangetastet und erzeugt keinen falschen Hinweis.
   */
  eventsCalendarId: string | null;
  onEditEventRequestHandled: () => void;
  /**
   * Eigene Bearbeitungsklicks dieser Ansicht. Sie fordern die Bearbeitung als
   * `{ calendarId, uid }`-Objekt an – die reine UID ist nicht
   * kalenderübergreifend eindeutig.
   */
  onRequestEditEvent: (request: { calendarId: string; uid: string }) => void;
  onCalendarChange: (calendarId: string) => void;
  onReload: () => void;
  onOpenTask: (taskId: string) => void;
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

const sourceLabel = (item: PlanningItemResponse): string =>
  item.objectType === "study_entry"
    ? "Studium"
    : item.objectType === "task"
      ? "Aufgabe"
      : areaLabels[item.area];

const isAllDayItem = (item: PlanningItemResponse): boolean =>
  item.startsAt === null && item.endsAt === null;

/**
 * Titelzusatz der Monatsansicht für Blöcke, die den Anzeigetag
 * überschreiten. Ein Block wird dadurch weder doppelt gezählt noch doppelt
 * gelistet, sondern nur verständlich gekennzeichnet.
 */
const continuationSuffix = (entry: CalendarProjectionEntry): string =>
  [
    entry.continuesBefore ? continuationLabels.before : "",
    entry.continuesAfter ? continuationLabels.after : "",
  ]
    .filter(Boolean)
    .join(" · ");

/**
 * Ein Eintrag der gemeinsamen Projektion. Kalenderereignisse öffnen den
 * bestehenden Termin-Editor, Aufgabenfristen, Zeitblöcke und Startmarkierungen
 * den bestehenden Aufgabeneditor; die Projektion selbst schreibt nie.
 */
const ProjectionCard = ({
  entry,
  compact = false,
  onEditEvent,
  onOpenTask,
}: {
  entry: CalendarProjectionEntry;
  compact?: boolean;
  onEditEvent: (event: CalendarEventResponse) => void;
  onOpenTask: (taskId: string) => void;
}) => {
  const { item, event } = entry;
  const openEditor = () => {
    if (item.editable === "calendar_event" && event) onEditEvent(event);
    else if (item.editable === "task") onOpenTask(item.sourceId);
  };
  return (
    <article
      className={[
        compact ? "event-card compact-event" : "event-card",
        "projection-card",
        `projection-${item.kind}`,
        item.overdue ? "overdue" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="event-accent" aria-hidden="true" />
      {!compact ? (
        <div className="event-when">
          <strong>{dateLabel(entry.dateKey, true)}</strong>
          <span>{formatProjectionTime(item, item.timezone)}</span>
        </div>
      ) : (
        <span className="compact-event-time">
          {formatProjectionTime(item, item.timezone)}
        </span>
      )}
      <div className="event-copy">
        <h3>{item.title}</h3>
        {!compact ? (
          <p>
            {event?.location || event?.description || "Keine weiteren Angaben"}
          </p>
        ) : null}
        <div className="event-tags">
          <span className={`projection-kind ${item.kind}`}>
            {kindLabels[item.kind]}
          </span>
          <span>{sourceLabel(item)}</span>
          {entry.recurring ? <span>Serie</span> : null}
          {entry.continuesBefore ? (
            <span className="projection-continuation">
              {continuationLabels.before}
            </span>
          ) : null}
          {entry.continuesAfter ? (
            <span className="projection-continuation">
              {continuationLabels.after}
            </span>
          ) : null}
          {item.overdue ? <span>überfällig</span> : null}
          {!compact && event && event.reminderMinutes.length > 0 ? (
            <span>Erinnerung</span>
          ) : null}
          {!compact ? <span>{item.timezone}</span> : null}
        </div>
      </div>
      {item.editable ? (
        <button
          className="icon-button"
          onClick={openEditor}
          aria-label={`${item.title} bearbeiten`}
        >
          <EditIcon />
        </button>
      ) : null}
    </article>
  );
};

const PeriodView = ({
  view,
  range,
  entries,
  onEditEvent,
  onOpenTask,
}: {
  view: CalendarView;
  range: ReturnType<typeof rangeForView>;
  entries: CalendarProjectionEntry[];
  onEditEvent: (event: CalendarEventResponse) => void;
  onOpenTask: (taskId: string) => void;
}) => {
  const days =
    view === "day"
      ? [range.start]
      : daysInRange(range).filter((date) =>
          entries.some((entry) => entry.dateKey === date),
        );

  if (entries.length === 0) {
    return (
      <div className="state-card empty-state compact-empty">
        <ClockIcon />
        <h3>Keine Einträge in diesem Zeitraum</h3>
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
              {entries.filter((entry) => entry.dateKey === date).length}{" "}
              Einträge
            </span>
          </header>
          <ol className="event-list">
            {entries
              .filter((entry) => entry.dateKey === date)
              .map((entry) => (
                <li key={entry.key}>
                  <ProjectionCard
                    entry={entry}
                    onEditEvent={onEditEvent}
                    onOpenTask={onOpenTask}
                  />
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
  entries,
  onEditEvent,
  onOpenTask,
}: {
  range: ReturnType<typeof rangeForView>;
  entries: CalendarProjectionEntry[];
  onEditEvent: (event: CalendarEventResponse) => void;
  onOpenTask: (taskId: string) => void;
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
          const dayEntries = entries.filter((entry) => entry.dateKey === date);
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
                {dayEntries.map((entry) => {
                  const suffix = continuationSuffix(entry);
                  const title = `${formatProjectionTime(entry.item, entry.item.timezone)} · ${kindLabels[entry.item.kind]} · ${entry.item.title}${suffix ? ` · ${suffix}` : ""}`;
                  const className = [
                    "month-event",
                    `projection-${entry.item.kind}`,
                    isAllDayItem(entry.item) ? "all-day" : "",
                    entry.item.overdue ? "overdue" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  const content = (
                    <>
                      <span>
                        {formatProjectionTime(entry.item, entry.item.timezone)}
                      </span>
                      {entry.item.title}
                      {suffix ? (
                        <small className="month-event-continuation">
                          {" "}
                          · {suffix}
                        </small>
                      ) : null}
                    </>
                  );
                  return entry.item.editable ? (
                    <button
                      type="button"
                      key={entry.key}
                      className={className}
                      onClick={() => {
                        if (entry.item.editable === "task")
                          onOpenTask(entry.item.sourceId);
                        else if (entry.event) onEditEvent(entry.event);
                      }}
                      title={title}
                    >
                      {content}
                    </button>
                  ) : (
                    <span key={entry.key} className={className} title={title}>
                      {content}
                    </span>
                  );
                })}
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
  eventsCalendarId,
  events,
  studyEntries,
  tasks,
  links,
  ownerId,
  profileTimezone,
  initialView,
  loading,
  saving,
  error,
  warning,
  success,
  createRequested,
  onCreateRequestHandled,
  editEventRequest,
  onEditEventRequestHandled,
  onRequestEditEvent,
  onCalendarChange,
  onReload,
  onOpenTask,
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
  /**
   * Ein aus Planung oder Aufgabenansicht angeforderter Termin übernimmt den
   * bestehenden Editor ohne eigenen Effekt. Die Anforderung wird erst beim
   * Schließen oder Speichern beendet und erzeugt keinen zweiten Schreibpfad.
   *
   * Auflösbar ist sie ausschließlich im Kalender der geladenen Ereignisse:
   * Wechselt App.tsx den Kalender erst noch, bleibt die Anforderung unverändert,
   * ohne Meldung und ohne Löschung bestehen. Die UID allein ist nicht
   * kalenderübergreifend eindeutig und wird nie so verwendet.
   */
  const requestResolvable =
    editEventRequest !== null &&
    editEventRequest.calendarId === eventsCalendarId;
  const requestedEvent =
    requestResolvable && editEventRequest
      ? events.find((event) => event.uid === editEventRequest.uid)
      : undefined;
  const openEvent = editorEvent === undefined ? requestedEvent : editorEvent;
  /**
   * Erst wenn die Anforderung auflösbar ist und der Termin auch danach
   * unauffindbar bleibt, wurde er zwischenzeitlich gelöscht.
   */
  const editRequestWarning =
    requestResolvable && !loading && !requestedEvent
      ? "Der angeforderte Termin wurde im ausgewählten Kalender nicht gefunden. Er wurde möglicherweise gelöscht."
      : null;
  const selectedCalendar = calendars.find(
    (calendar) => calendar.id === selectedCalendarId,
  );
  /**
   * Kalenderzeitzone: beschreibt weiterhin, in welcher Zeitzone der Kalender
   * geführt wird (Kalender-Chip). Der sichtbare Tag der Ansicht hängt dagegen
   * ausschließlich von der Profilzeitzone ab, damit ein abweichender
   * Kalender-Zeitzonenwert – auch über Mitternacht – keinen anderen Tag ergibt.
   */
  const timezone = selectedCalendar?.timezone ?? "UTC";
  const [view, setView] = useState<CalendarView>(initialView);
  const [anchor, setAnchor] = useState(() => todayInTimezone(profileTimezone));
  const range = useMemo(() => rangeForView(view, anchor), [view, anchor]);
  /**
   * Nur Ereignisse, die nachweislich zum ausgewählten Kalender gehören, dürfen
   * in die Projektion und deren `(calendarId, uid)`-Abgleich eingehen. Beim
   * Kalenderwechsel sind die zuvor geladenen Ereignisse noch dem bisherigen
   * Kalender zugeordnet; sie bleiben deshalb draußen, bis die Antwort für den
   * neuen Kalender vorliegt. Sonst könnte ein Termin desselben UID-Werts aus
   * dem alten Kalender einen verknüpften Studieneintrag fälschlich
   * unterdrücken.
   */
  const projectedEvents = useMemo(
    () =>
      selectedCalendarId !== null && eventsCalendarId === selectedCalendarId
        ? events
        : [],
    [events, eventsCalendarId, selectedCalendarId],
  );
  /**
   * Eine gemeinsame Projektion für Tag, Woche, Monat und Agenda: Termine,
   * Aufgabenfristen, geplante Zeitblöcke, Startmarkierungen und Studienzeiten
   * stammen aus derselben Quelle. Serien bleiben flüchtige Vorkommen des
   * gemeinsamen Kalenderkerns mit stabiler UID und aktuellem ETag.
   */
  const projection = useMemo(
    () =>
      buildCalendarProjection({
        events: projectedEvents,
        tasks,
        studyEntries,
        range,
        profileTimezone,
        calendarId: selectedCalendarId ?? null,
        ownerId,
      }),
    [
      ownerId,
      profileTimezone,
      projectedEvents,
      range,
      selectedCalendarId,
      studyEntries,
      tasks,
    ],
  );

  /**
   * Eigene Bearbeitungsklicks der Karten- und Monatsansicht fordern die
   * Bearbeitung immer als `{ calendarId, uid }`-Objekt an; die reine UID wird
   * nie als kalenderübergreifend eindeutiger Schlüssel verwendet. Der lokale
   * Neu-Anlage-Zustand wird dabei geschlossen, damit der angeforderte Termin
   * den bestehenden Editor übernimmt.
   */
  const requestEventEdit = (event: CalendarEventResponse) => {
    if (!selectedCalendarId) return;
    setEditorEvent(undefined);
    onRequestEditEvent({ calendarId: selectedCalendarId, uid: event.uid });
  };

  /** Schließt den gemeinsamen Termin-Editor und beendet eine Anforderung. */
  const closeEditor = () => {
    setEditorEvent(undefined);
    onEditEventRequestHandled();
  };

  const save = async (payload: EventPayload) => {
    await onSave(openEvent ?? null, payload);
    closeEditor();
  };

  const deleteEvent = async () => {
    if (!openEvent) return;
    await onDelete(openEvent);
    closeEditor();
  };

  return (
    <main className="page-content calendar-page">
      <header className="page-heading calendar-heading">
        <div>
          <p className="eyebrow">DEINE ZEIT</p>
          <h1>Kalender</h1>
          <p>
            Termine, Aufgabenfristen und geplante Zeitblöcke aus einer
            gemeinsamen Projektion. Änderungen erscheinen auch über CalDAV.
          </p>
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
      {editRequestWarning ? (
        <p role="alert" className="conflict-banner">
          {editRequestWarning}
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
                onClick={() => setAnchor(todayInTimezone(profileTimezone))}
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
                {formatPeriodTitle(view, range, profileTimezone)}
              </h2>
              <p>{selectedCalendar?.name ?? "Kein Kalender ausgewählt"}</p>
            </div>
            {!loading && !error ? (
              <span>{projection.length} sichtbar</span>
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
          ) : projection.length === 0 ? (
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
              entries={projection}
              onEditEvent={requestEventEdit}
              onOpenTask={onOpenTask}
            />
          ) : (
            <PeriodView
              view={view}
              range={range}
              entries={projection}
              onEditEvent={requestEventEdit}
              onOpenTask={onOpenTask}
            />
          )}
        </section>

        {openEvent !== undefined ? (
          <EventForm
            key={openEvent?.etag ?? "new-event"}
            event={openEvent}
            calendarId={selectedCalendarId}
            tasks={tasks}
            events={events}
            links={links}
            pending={saving}
            onCancel={() => closeEditor()}
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
