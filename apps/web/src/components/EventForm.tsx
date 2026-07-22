import type { CalendarEventResponse } from "@lifeos/contracts";
import { useState, type FormEvent } from "react";

import type { EventPayload } from "../api";
import {
  browserTimezone,
  dateTimeInputToIso,
  nextWholeHour,
  toDateTimeInput,
} from "../date";

interface EventFormProps {
  event: CalendarEventResponse | null;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (payload: EventPayload) => Promise<void>;
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
  return {
    title: event.title,
    description: event.description ?? "",
    location: event.location ?? "",
    timezone: event.timezone,
    isAllDay: event.isAllDay,
    startsAt: event.startsAt
      ? toDateTimeInput(event.startsAt, event.timezone)
      : defaultTimes.startsAt,
    endsAt: event.endsAt
      ? toDateTimeInput(event.endsAt, event.timezone)
      : defaultTimes.endsAt,
    startDate: event.startDate ?? startDate,
    endDate: event.endDate ?? tomorrow(startDate),
    recurrenceRule: event.recurrenceRule ?? "",
    reminderMinutes: event.reminderMinutes[0]?.toString() ?? "",
  };
};

export const EventForm = ({
  event,
  pending,
  onCancel,
  onSubmit,
}: EventFormProps) => {
  const [draft, setDraft] = useState(() => initialDraft(event));
  const [validationError, setValidationError] = useState<string | null>(null);

  const update = <Key extends keyof Draft>(key: Key, value: Draft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const submit = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    setValidationError(null);
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
      await onSubmit({
        ...common,
        isAllDay: true,
        startDate: draft.startDate,
        endDate: draft.endDate,
      });
      return;
    }
    try {
      const startsAt = dateTimeInputToIso(draft.startsAt, draft.timezone);
      const endsAt = dateTimeInputToIso(draft.endsAt, draft.timezone);
      if (endsAt <= startsAt) {
        setValidationError("Das Ende muss nach dem Beginn liegen.");
        return;
      }
      await onSubmit({ ...common, isAllDay: false, startsAt, endsAt });
    } catch {
      setValidationError("Beginn oder Ende ist nicht gültig.");
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
        <div className="field full-field">
          <label htmlFor="event-title">Titel</label>
          <input
            id="event-title"
            value={draft.title}
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
            onChange={(input) => update("location", input.target.value)}
            maxLength={500}
          />
        </div>
        <div className="field">
          <label htmlFor="reminder">Erinnerung vorher</label>
          <select
            id="reminder"
            value={draft.reminderMinutes}
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
            onChange={(input) => update("description", input.target.value)}
            maxLength={10_000}
          />
        </div>

        {validationError ? (
          <p role="alert" className="form-error full-field">
            {validationError}
          </p>
        ) : null}
        <div className="form-actions full-field">
          <button type="button" className="secondary-button" onClick={onCancel}>
            Abbrechen
          </button>
          <button className="primary-button" disabled={pending}>
            {pending
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
