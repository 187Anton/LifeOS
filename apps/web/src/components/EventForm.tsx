import type {
  CalendarEventResponse,
  CreateTaskEventLinkRequest,
  TaskEventLinkResponse,
  TaskResponse,
} from "@lifeos/contracts";
import { useState, type FormEvent } from "react";

import type { EventPayload } from "../api";
import { isStartMarkerEvent } from "../calendar-projection";
import {
  browserTimezone,
  dateTimeInputToIso,
  nextWholeHour,
  toDateTimeInput,
} from "../date";
import { TrashIcon } from "./Icons";
import { TaskEventLinkPanel } from "./TaskEventLinkPanel";

interface EventFormProps {
  event: CalendarEventResponse | null;
  calendarId: string | null;
  tasks: TaskResponse[];
  events: CalendarEventResponse[];
  links: TaskEventLinkResponse[];
  pending: boolean;
  onCancel: () => void;
  onSubmit: (payload: EventPayload) => Promise<void>;
  onDelete: () => Promise<void>;
  onLink: (input: CreateTaskEventLinkRequest) => Promise<void>;
  onUnlink: (linkId: string) => Promise<void>;
  /**
   * Zugehörige Aufgabe einer verwalteten Startmarkierung. Ist sie bekannt,
   * verweist der schreibgeschützte Editor direkt auf den Aufgabeneditor, über
   * den der geplante Start und eine spätere Dauer gepflegt werden.
   */
  startMarkerTask?: { id: string; title: string | null } | null;
  onOpenTask?: (taskId: string) => void;
}

interface Draft {
  title: string;
  description: string;
  location: string;
  timezone: string;
  isAllDay: boolean;
  startsAt: string;
  endsAt: string;
  startDate: string;
  endDate: string;
  recurrenceRule: string;
  reminderMinutes: string;
}

const today = (): string => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

const tomorrow = (date: string): string => {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
};

const initialDraft = (event: CalendarEventResponse | null): Draft => {
  const defaultTimes = nextWholeHour();
  const startDate = today();
  if (!event) {
    return {
      title: "",
      description: "",
      location: "",
      timezone: browserTimezone(),
      isAllDay: false,
      startsAt: defaultTimes.startsAt,
      endsAt: defaultTimes.endsAt,
      startDate,
      endDate: tomorrow(startDate),
      recurrenceRule: "",
      reminderMinutes: "",
    };
  }
  const startMarker = isStartMarkerEvent(event);
  return {
    title: event.title,
    description: event.description ?? "",
    location: event.location ?? "",
    timezone: event.timezone,
    isAllDay: event.isAllDay,
    startsAt: event.startsAt
      ? toDateTimeInput(event.startsAt, event.timezone)
      : defaultTimes.startsAt,
    /**
     * Eine verwaltete Startmarkierung hat bewusst kein Ende. Der Editor
     * erfindet hier keines: das Feld bleibt leer, damit auch ein unverändertes
     * Speichern keine Dauer erzeugt.
     */
    endsAt: event.endsAt
      ? toDateTimeInput(event.endsAt, event.timezone)
      : startMarker
        ? ""
        : defaultTimes.endsAt,
    startDate: event.startDate ?? startDate,
    endDate: event.endDate ?? tomorrow(startDate),
    recurrenceRule: event.recurrenceRule ?? "",
    reminderMinutes: event.reminderMinutes[0]?.toString() ?? "",
  };
};

export const EventForm = ({
  event,
  calendarId,
  tasks,
  events,
  links,
  pending,
  onCancel,
  onSubmit,
  onDelete,
  onLink,
  onUnlink,
  startMarkerTask = null,
  onOpenTask,
}: EventFormProps) => {
  const [draft, setDraft] = useState(() => initialDraft(event));
  const [validationError, setValidationError] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState(false);
  /**
   * Eine verwaltete Startmarkierung (`DTSTART` ohne `DTEND`) wird
   * ausschließlich über die Aufgabe gepflegt. Der allgemeine Termineditor bleibt
   * für sie schreibgeschützt und lehnt das Speichern einer erfundenen Dauer ab.
   */
  const locked = isStartMarkerEvent(event);

  const update = <Key extends keyof Draft>(key: Key, value: Draft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const deleteEvent = async () => {
    setValidationError(null);
    if (locked) return;
    try {
      await onDelete();
    } catch {
      setValidationError(
        "Der Termin konnte nicht gelöscht werden. Prüfe den Hinweis in der Kalenderansicht.",
      );
    }
  };

  const submit = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    setValidationError(null);
    /**
     * Eine Startmarkierung wird nie über den Termineditor gespeichert: das
     * würde ein Ende und damit eine Dauer erfinden. Sie bleibt schreibgeschützt.
     */
    if (locked) {
      setValidationError(
        "Diese Startmarkierung wird über die Aufgabe gepflegt. Sie hat bewusst kein Ende; hier wird weder ein Ende noch eine Dauer erzeugt.",
      );
      return;
    }
    const common = {
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      location: draft.location.trim() || null,
      timezone: draft.timezone,
      recurrenceRule: draft.recurrenceRule.trim() || null,
      reminderMinutes: draft.reminderMinutes
        ? [Number(draft.reminderMinutes)]
        : [],
    };
    if (!common.title) {
      setValidationError("Bitte gib einen Titel ein.");
      return;
    }
    if (
      common.reminderMinutes.some(
        (minutes) =>
          !Number.isInteger(minutes) || minutes < 0 || minutes > 10_080,
      )
    ) {
      setValidationError(
        "Die Erinnerung muss zwischen 0 und 10080 Minuten liegen.",
      );
      return;
    }
    if (draft.isAllDay) {
      if (
        !draft.startDate ||
        !draft.endDate ||
        draft.endDate <= draft.startDate
      ) {
        setValidationError("Das Enddatum muss nach dem Startdatum liegen.");
        return;
      }
      try {
        await onSubmit({
          ...common,
          isAllDay: true,
          startDate: draft.startDate,
          endDate: draft.endDate,
        });
      } catch {
        setValidationError(
          "Der Termin konnte nicht gespeichert werden. Prüfe den Hinweis in der Kalenderansicht.",
        );
      }
      return;
    }
    let startsAt: string;
    let endsAt: string;
    try {
      startsAt = dateTimeInputToIso(draft.startsAt, draft.timezone);
      endsAt = dateTimeInputToIso(draft.endsAt, draft.timezone);
    } catch {
      setValidationError("Beginn oder Ende ist nicht gültig.");
      return;
    }
    if (endsAt <= startsAt) {
      setValidationError("Das Ende muss nach dem Beginn liegen.");
      return;
    }
    try {
      await onSubmit({ ...common, isAllDay: false, startsAt, endsAt });
    } catch {
      setValidationError(
        "Der Termin konnte nicht gespeichert werden. Prüfe den Hinweis in der Kalenderansicht.",
      );
    }
  };

  return (
    <section className="event-editor" aria-labelledby="event-form-title">
      <div className="editor-heading">
        <div>
          <p className="eyebrow">
            {event ? "TERMIN BEARBEITEN" : "NEUER TERMIN"}
          </p>
          <h2 id="event-form-title">
            {event ? event.title : "Zeit bewusst einplanen"}
          </h2>
        </div>
        <button type="button" className="text-button" onClick={onCancel}>
          Schließen
        </button>
      </div>

      <form onSubmit={(formEvent) => void submit(formEvent)}>
        {locked ? (
          <div className="event-editor-locked full-field" role="status">
            <p>
              Schreibgeschützt: Diese verwaltete Startmarkierung
              {startMarkerTask?.title
                ? ` gehört zur Aufgabe „${startMarkerTask.title}“ und`
                : ""}{" "}
              hat bewusst kein Ende (DTSTART ohne DTEND). Sie wird über den
              Aufgabeneditor gepflegt; hier wird kein Ende und keine Dauer
              erzeugt.
            </p>
            {startMarkerTask && onOpenTask ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => onOpenTask(startMarkerTask.id)}
              >
                Aufgabe öffnen
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="field full-field">
          <label htmlFor="event-title">Titel</label>
          <input
            id="event-title"
            value={draft.title}
            disabled={locked}
            onChange={(input) => update("title", input.target.value)}
            maxLength={500}
            required
            autoFocus
          />
        </div>

        <label className="toggle-field full-field">
          <input
            type="checkbox"
            checked={draft.isAllDay}
            disabled={locked}
            onChange={(input) => update("isAllDay", input.target.checked)}
          />
          <span className="toggle" aria-hidden="true" />
          Ganztägiger Termin
        </label>

        {draft.isAllDay ? (
          <>
            <div className="field">
              <label htmlFor="start-date">Startdatum</label>
              <input
                id="start-date"
                type="date"
                value={draft.startDate}
                disabled={locked}
                onChange={(input) => update("startDate", input.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="end-date">Enddatum (exklusiv)</label>
              <input
                id="end-date"
                type="date"
                value={draft.endDate}
                disabled={locked}
                onChange={(input) => update("endDate", input.target.value)}
                required
              />
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="starts-at">Beginn</label>
              <input
                id="starts-at"
                type="datetime-local"
                value={draft.startsAt}
                disabled={locked}
                onChange={(input) => update("startsAt", input.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="ends-at">Ende</label>
              <input
                id="ends-at"
                type="datetime-local"
                value={draft.endsAt}
                disabled={locked}
                onChange={(input) => update("endsAt", input.target.value)}
                required
              />
            </div>
          </>
        )}

        <div className="field full-field">
          <label htmlFor="timezone">Zeitzone</label>
          <input id="timezone" value={draft.timezone} readOnly />
          <small>Aus Browser bzw. bestehendem Termin übernommen.</small>
        </div>

        <div className="field">
          <label htmlFor="location">Ort</label>
          <input
            id="location"
            value={draft.location}
            disabled={locked}
            onChange={(input) => update("location", input.target.value)}
            maxLength={500}
          />
        </div>
        <div className="field">
          <label htmlFor="reminder">Erinnerung vorher</label>
          <select
            id="reminder"
            value={draft.reminderMinutes}
            disabled={locked}
            onChange={(input) => update("reminderMinutes", input.target.value)}
          >
            <option value="">Keine Erinnerung</option>
            <option value="0">Zum Beginn</option>
            <option value="10">10 Minuten</option>
            <option value="30">30 Minuten</option>
            <option value="60">1 Stunde</option>
            <option value="1440">1 Tag</option>
          </select>
        </div>

        <div className="field full-field">
          <label htmlFor="recurrence">Wiederholung (RRULE)</label>
          <input
            id="recurrence"
            value={draft.recurrenceRule}
            disabled={locked}
            onChange={(input) =>
              update("recurrenceRule", input.target.value.toUpperCase())
            }
            placeholder="z. B. FREQ=WEEKLY;COUNT=4"
            maxLength={2048}
          />
        </div>

        <div className="field full-field">
          <label htmlFor="description">Notiz</label>
          <textarea
            id="description"
            rows={4}
            value={draft.description}
            disabled={locked}
            onChange={(input) => update("description", input.target.value)}
            maxLength={10_000}
          />
        </div>

        {validationError ? (
          <p role="alert" className="form-error full-field">
            {validationError}
          </p>
        ) : null}
        {event && calendarId ? (
          <TaskEventLinkPanel
            target={{ kind: "event", calendarId, eventUid: event.uid }}
            links={links}
            tasks={tasks}
            events={events}
            selectedCalendarId={calendarId}
            pending={pending}
            onLink={onLink}
            onUnlink={onUnlink}
          />
        ) : null}
        {event && !locked ? (
          <div className="task-danger-zone full-field">
            {deleteConfirmation ? (
              <div className="delete-confirmation" role="alert">
                <span>Termin wirklich löschen?</span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setDeleteConfirmation(false)}
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  className="danger-button"
                  disabled={pending}
                  onClick={() => void deleteEvent()}
                >
                  Endgültig löschen
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="text-button danger-text"
                onClick={() => setDeleteConfirmation(true)}
              >
                <TrashIcon /> Löschen
              </button>
            )}
          </div>
        ) : null}
        <div className="form-actions full-field">
          <button type="button" className="secondary-button" onClick={onCancel}>
            Abbrechen
          </button>
          <button className="primary-button" disabled={pending || locked}>
            {locked
              ? "Schreibgeschützt"
              : pending
                ? "Wird gespeichert …"
                : event
                  ? "Änderungen speichern"
                  : "Termin anlegen"}
          </button>
        </div>
      </form>
    </section>
  );
};
