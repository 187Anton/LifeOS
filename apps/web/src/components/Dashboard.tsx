import type {
  CalendarEventResponse,
  CalendarResponse,
  ProfileResponse,
} from "@lifeos/contracts";
import { useState } from "react";

import { eventSortValue, formatEventDate, formatEventTime } from "../date";
import { ArrowIcon, CalendarIcon, ClockIcon } from "./Icons";

interface DashboardProps {
  profile: ProfileResponse;
  calendars: CalendarResponse[];
  events: CalendarEventResponse[];
  onOpenCalendar: () => void;
}

const todayLabel = () =>
  new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date());

export const Dashboard = ({
  profile,
  calendars,
  events,
  onOpenCalendar,
}: DashboardProps) => {
  const [renderedAt] = useState(() => Date.now());
  const nextEvent =
    [...events]
      .sort((left, right) => eventSortValue(left) - eventSortValue(right))
      .find((event) => eventSortValue(event) >= renderedAt) ?? events[0];

  return (
    <main className="page-content dashboard-page">
      <header className="page-heading dashboard-heading">
        <div>
          <p className="date-kicker">{todayLabel()}</p>
          <h1>Guten Tag, {profile.displayName.split(" ")[0]}</h1>
          <p>Hier ist dein ruhiger Überblick für heute.</p>
        </div>
        <button className="secondary-button" onClick={onOpenCalendar}>
          Kalender öffnen <ArrowIcon />
        </button>
      </header>

      <section className="metric-grid" aria-label="Kurzübersicht">
        <article className="metric-card accent-card">
          <span className="metric-icon">
            <CalendarIcon />
          </span>
          <div>
            <span>Kalender</span>
            <strong>{calendars.length}</strong>
            <small>
              {calendars.length === 1 ? "lokaler Kalender" : "lokale Kalender"}
            </small>
          </div>
        </article>
        <article className="metric-card">
          <span className="metric-icon">
            <ClockIcon />
          </span>
          <div>
            <span>Gespeicherte Termine</span>
            <strong>{events.length}</strong>
            <small>im ausgewählten Kalender</small>
          </div>
        </article>
        <article className="metric-card quiet-card">
          <span className="metric-label">Datenhaltung</span>
          <strong>Lokal</strong>
          <small>PostgreSQL auf deinem Rechner</small>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="feature-card next-event-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ALS NÄCHSTES</p>
              <h2>Dein nächster Termin</h2>
            </div>
            <button className="text-button" onClick={onOpenCalendar}>
              Alle anzeigen
            </button>
          </div>
          {nextEvent ? (
            <div className="next-event">
              <span className="event-date-block">
                <strong>{formatEventDate(nextEvent).split(",")[0]}</strong>
                <small>{formatEventTime(nextEvent)}</small>
              </span>
              <div>
                <h3>{nextEvent.title}</h3>
                <p>{nextEvent.location || "Kein Ort eingetragen"}</p>
              </div>
            </div>
          ) : (
            <div className="empty-inline">
              <CalendarIcon />
              <div>
                <h3>Noch kein Termin</h3>
                <p>Lege im Kalender deinen ersten lokalen Termin an.</p>
              </div>
            </div>
          )}
        </article>

        <article className="feature-card connection-card">
          <p className="eyebrow">VERBUNDEN</p>
          <h2>Ein Kalender, überall</h2>
          <p>
            Deine Termine sind über den lokalen CalDAV-Server auch für Apple
            Kalender verfügbar – ohne installierte LifeOS-App.
          </p>
          <div className="connection-status">
            <span className="status-dot" />
            CalDAV-Fundament aktiv
          </div>
        </article>
      </section>
    </main>
  );
};
