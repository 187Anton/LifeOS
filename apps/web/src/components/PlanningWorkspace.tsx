import type {
  CreateAvailabilityWindowRequest,
  PlanningArea,
  PlanningItemKind,
  PlanningItemResponse,
  PlanningResponse,
} from "@lifeos/contracts";
import { useMemo, useState, type FormEvent } from "react";
import {
  eachPlanningDate,
  shiftPlanningRange,
  todayInTimezone,
  weekRange,
  type DateRange,
} from "../planning";
import { ClockIcon, PlanIcon, PlusIcon, TrashIcon } from "./Icons";

const areaLabels: Record<PlanningArea, string> = {
  calendar: "Kalender",
  study: "Studium",
  work: "Arbeit",
  tasks: "Aufgaben",
  availability: "Verfügbarkeit",
};
const kindLabels: Record<PlanningItemKind, string> = {
  fixed_event: "Fester Termin",
  deadline: "Frist",
  planned_task: "Geplante Aufgabe",
  actual_time: "Tatsächliche Zeit",
  availability: "Persönliche Verfügbarkeit",
};
const weekdayLabels = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
];
const timeToMinutes = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return hours! * 60 + minutes!;
};
const formatMinutes = (value: number) =>
  `${Math.floor(value / 60)} h ${value % 60} min`;
const minutesToClock = (value: number) =>
  `${Math.floor(value / 60)
    .toString()
    .padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
const formatDate = (date: string) =>
  new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00.000Z`));
const formatTime = (item: PlanningItemResponse, timezone: string) => {
  if (!item.startsAt) return item.date;
  const formatter = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
  return item.endsAt
    ? `${formatter.format(new Date(item.startsAt))}–${formatter.format(new Date(item.endsAt))}`
    : formatter.format(new Date(item.startsAt));
};

interface Props {
  planning: PlanningResponse | null;
  range: DateRange;
  timezone: string;
  weekStartsOn: number;
  loading: boolean;
  saving: boolean;
  error: string | null;
  success: string | null;
  onReload: () => void;
  onRangeChange: (range: DateRange) => void;
  onCreateAvailability: (
    value: CreateAvailabilityWindowRequest,
  ) => Promise<void>;
  onDeleteAvailability: (id: string) => Promise<void>;
}

export const PlanningWorkspace = ({
  planning,
  range,
  timezone,
  weekStartsOn,
  loading,
  saving,
  error,
  success,
  onReload,
  onRangeChange,
  onCreateAvailability,
  onDeleteAvailability,
}: Props) => {
  const [mode, setMode] = useState<"week" | "agenda">("week");
  const [areas, setAreas] = useState<Set<PlanningArea>>(
    new Set(["calendar", "study", "work", "tasks", "availability"]),
  );
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const visibleItems = useMemo(
    () => planning?.items.filter((item) => areas.has(item.area)) ?? [],
    [areas, planning?.items],
  );
  const visibleIds = useMemo(
    () => new Set(visibleItems.map((item) => item.id)),
    [visibleItems],
  );
  const warnings =
    planning?.warnings.filter(
      (warning) =>
        !warning.itemIds.length ||
        warning.itemIds.some((itemId) => visibleIds.has(itemId)),
    ) ?? [];
  const dates = eachPlanningDate(range);
  const toggleArea = (area: PlanningArea) => {
    setAreas((current) => {
      const next = new Set(current);
      if (next.has(area)) next.delete(area);
      else next.add(area);
      return next;
    });
  };
  return (
    <main className="page-content planning-page">
      <header className="workspace-heading planning-heading">
        <div>
          <p className="eyebrow">Gemeinsame Zeitplanung</p>
          <h1>Woche und Agenda aus deinen Quelldaten</h1>
          <p>
            Feste Termine, Fristen, geplante Aufgaben, tatsächliche Zeit und
            Verfügbarkeit bleiben klar getrennt. Konflikte werden nur erklärt.
          </p>
        </div>
        <button
          className="secondary-button"
          onClick={onReload}
          disabled={loading}
        >
          Neu laden
        </button>
      </header>
      {error ? (
        <div className="message error" role="alert">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="message success" role="status">
          {success}
        </div>
      ) : null}
      <section className="planning-toolbar panel" aria-label="Planung steuern">
        <div className="planning-navigation">
          <button
            className="secondary-button"
            onClick={() => onRangeChange(shiftPlanningRange(range, -7))}
          >
            Vorherige Woche
          </button>
          <strong>
            {formatDate(range.from)} – {formatDate(range.to)}
          </strong>
          <button
            className="secondary-button"
            onClick={() => onRangeChange(shiftPlanningRange(range, 7))}
          >
            Nächste Woche
          </button>
          <button
            className="text-button"
            onClick={() => onRangeChange(weekRange(timezone, weekStartsOn))}
          >
            Aktuelle Woche
          </button>
        </div>
        <div
          className="planning-mode"
          role="group"
          aria-label="Planungsansicht"
        >
          <button
            className={mode === "week" ? "active" : ""}
            onClick={() => setMode("week")}
          >
            Woche
          </button>
          <button
            className={mode === "agenda" ? "active" : ""}
            onClick={() => setMode("agenda")}
          >
            Agenda
          </button>
        </div>
        <fieldset className="planning-area-filters">
          <legend>Bereiche ein- oder ausblenden</legend>
          {(Object.keys(areaLabels) as PlanningArea[]).map((area) => (
            <label key={area}>
              <input
                type="checkbox"
                checked={areas.has(area)}
                onChange={() => toggleArea(area)}
              />
              {areaLabels[area]}
            </label>
          ))}
        </fieldset>
      </section>
      {loading && !planning ? (
        <div className="empty-state" role="status">
          Gemeinsame Planung wird geladen …
        </div>
      ) : null}
      {warnings.length ? (
        <section
          className="planning-warnings"
          aria-labelledby="planning-warning-title"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">HINWEISE</p>
              <h2 id="planning-warning-title">Konflikte und Überlastung</h2>
            </div>
            <span>{warnings.length}</span>
          </div>
          <ul>
            {warnings.map((warning) => (
              <li key={warning.id} className={warning.severity}>
                <strong>{formatDate(warning.date)}</strong>
                <span>{warning.message}</span>
              </li>
            ))}
          </ul>
          <p className="privacy-note">
            Hinweise erklären nur gespeicherte Regeln. Termine und Aufgaben
            werden niemals automatisch verschoben.
          </p>
        </section>
      ) : planning ? (
        <div className="planning-clear" role="status">
          <PlanIcon />
          <span>
            Keine Konflikte oder Überlastungen im sichtbaren Zeitraum erkannt.
          </span>
        </div>
      ) : null}
      {planning && mode === "week" ? (
        <section
          className="planning-week"
          aria-label="Gemeinsame Wochenansicht"
        >
          {dates.map((date) => (
            <PlanningDay
              key={date}
              date={date}
              timezone={timezone}
              items={visibleItems.filter((item) => item.date === date)}
            />
          ))}
        </section>
      ) : planning ? (
        <section className="planning-agenda" aria-label="Gemeinsame Agenda">
          {dates.map((date) => {
            const items = visibleItems.filter((item) => item.date === date);
            return items.length ? (
              <PlanningDay
                key={date}
                date={date}
                timezone={timezone}
                items={items}
                agenda
              />
            ) : null;
          })}
          {!visibleItems.length ? (
            <div className="empty-state">
              <ClockIcon />
              <h2>Keine Einträge im gewählten Filter</h2>
              <p>
                Die Filter ändern nur die Darstellung und keine gespeicherten
                Daten.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}
      <section className="availability-panel panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">KAPAZITÄT</p>
            <h2>Persönliche Verfügbarkeit</h2>
          </div>
          <button
            className="text-button"
            onClick={() => setAvailabilityOpen((value) => !value)}
          >
            <PlusIcon /> Fenster hinzufügen
          </button>
        </div>
        <p>
          Wiederkehrende Wochenfenster liefern die transparente Grundlage für
          Überlastungswarnungen.
        </p>
        {availabilityOpen ? (
          <AvailabilityForm
            timezone={timezone}
            saving={saving}
            onCancel={() => setAvailabilityOpen(false)}
            onSave={async (value) => {
              await onCreateAvailability(value);
              setAvailabilityOpen(false);
            }}
          />
        ) : null}
        {planning?.availabilityWindows.length ? (
          <ul className="availability-list">
            {planning.availabilityWindows.map((window) => (
              <li key={window.id}>
                <span>
                  <strong>{weekdayLabels[window.weekday]}</strong>
                  <small>
                    {minutesToClock(window.startMinute)}–
                    {minutesToClock(window.endMinute)} ·{" "}
                    {window.label ?? "Verfügbar"}
                  </small>
                </span>
                <button
                  className="icon-button"
                  aria-label={`${weekdayLabels[window.weekday]} Verfügbarkeit entfernen`}
                  disabled={saving}
                  onClick={() => void onDeleteAvailability(window.id)}
                >
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted-copy">
            Noch keine persönliche Verfügbarkeit gespeichert.
          </p>
        )}
      </section>
      <p className="privacy-note planning-privacy">
        Darstellung in {timezone}. Konflikte aus privaten, Studien- und
        Arbeitsdaten werden nicht in Logs geschrieben.
      </p>
    </main>
  );
};

const PlanningDay = ({
  date,
  items,
  timezone,
  agenda = false,
}: {
  date: string;
  items: PlanningItemResponse[];
  timezone: string;
  agenda?: boolean;
}) => (
  <article className={agenda ? "planning-day agenda-day" : "planning-day"}>
    <header>
      <span>{formatDate(date)}</span>
      {date === todayInTimezone(timezone) ? <strong>Heute</strong> : null}
    </header>
    <div className="planning-day-items">
      {items.length ? (
        items.map((item) => (
          <div
            key={item.id}
            className={`planning-item ${item.area} ${item.kind} ${item.overdue ? "overdue" : ""}`}
          >
            <span className="planning-item-time">
              {formatTime(item, timezone)}
            </span>
            <div>
              <strong>{item.title}</strong>
              <small>
                {areaLabels[item.area]} · {kindLabels[item.kind]}
                {item.durationMinutes !== null
                  ? ` · ${formatMinutes(item.durationMinutes)}`
                  : ""}
                {item.overdue ? " · überfällig" : ""}
              </small>
            </div>
          </div>
        ))
      ) : (
        <p className="muted-copy">Keine Einträge</p>
      )}
    </div>
  </article>
);

const AvailabilityForm = ({
  timezone,
  saving,
  onCancel,
  onSave,
}: {
  timezone: string;
  saving: boolean;
  onCancel: () => void;
  onSave: (value: CreateAvailabilityWindowRequest) => Promise<void>;
}) => (
  <form
    className="availability-form"
    onSubmit={(event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const field = (name: string) => {
        const value = data.get(name);
        return typeof value === "string" ? value : "";
      };
      void onSave({
        weekday: Number(field("weekday")),
        startMinute: timeToMinutes(field("start")),
        endMinute: timeToMinutes(field("end")),
        timezone,
        label: field("label") || null,
      });
    }}
  >
    <label>
      Wochentag
      <select name="weekday" defaultValue="1">
        {weekdayLabels.map((label, index) => (
          <option key={label} value={index}>
            {label}
          </option>
        ))}
      </select>
    </label>
    <label>
      Von
      <input name="start" type="time" defaultValue="09:00" required />
    </label>
    <label>
      Bis
      <input name="end" type="time" defaultValue="17:00" required />
    </label>
    <label>
      Bezeichnung
      <input name="label" maxLength={200} placeholder="z. B. Fokuszeit" />
    </label>
    <div className="form-actions">
      <button type="button" className="secondary-button" onClick={onCancel}>
        Abbrechen
      </button>
      <button className="primary-button" disabled={saving}>
        {saving ? "Speichert …" : "Verfügbarkeit speichern"}
      </button>
    </div>
  </form>
);
