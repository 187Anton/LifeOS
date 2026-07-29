import type {
  DashboardResponse,
  ProfileResponse,
  TaskResponse,
} from "@lifeos/contracts";
import { useMemo } from "react";

import { buildDashboardView, type DashboardOccurrence } from "../dashboard";
import { formatOccurrenceTime } from "../calendar-view";
import { formatTaskDueDate, taskAreaLabels, taskPriorityLabels } from "../task";
import {
  ArrowIcon,
  CalendarIcon,
  ClockIcon,
  PlusIcon,
  TaskIcon,
} from "./Icons";

interface DashboardProps {
  profile: ProfileResponse;
  snapshot: DashboardResponse | null;
  loading: boolean;
  error: string | null;
  onReload: () => void;
  onOpenTasks: () => void;
  onOpenCalendar: () => void;
  onCreateTask: () => void;
  onCreateEvent: () => void;
}

const dateLabel = (date: string): string =>
  new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00.000Z`));

const EventRow = ({ item }: { item: DashboardOccurrence }) => (
  <li className="dashboard-list-item">
    <span className="dashboard-time">
      {formatOccurrenceTime(item.occurrence)}
    </span>
    <span>
      <strong>{item.occurrence.event.title}</strong>
      <small>
        {item.source.calendarName}
        {item.occurrence.event.location
          ? ` · ${item.occurrence.event.location}`
          : ""}
      </small>
    </span>
  </li>
);

const TaskRow = ({
  task,
  timezone,
}: {
  task: TaskResponse;
  timezone: string;
}) => (
  <li className="dashboard-list-item">
    <span className={`priority-dot ${task.priority}`} aria-hidden="true" />
    <span>
      <strong>{task.title}</strong>
      <small>
        {formatTaskDueDate(task.dueDate, timezone)} ·{" "}
        {taskPriorityLabels[task.priority]}
      </small>
    </span>
  </li>
);

export const Dashboard = ({
  profile,
  snapshot,
  loading,
  error,
  onReload,
  onOpenTasks,
  onOpenCalendar,
  onCreateTask,
  onCreateEvent,
}: DashboardProps) => {
  const dashboard = useMemo(
    () => (snapshot ? buildDashboardView(snapshot) : null),
    [snapshot],
  );

  return (
    <main className="page-content dashboard-page">
      <header className="page-heading dashboard-heading">
        <div>
          <p className="date-kicker">
            {dashboard ? dateLabel(dashboard.today) : "Lokale Organisation"}
          </p>
          <h1>Guten Tag, {profile.displayName.split(" ")[0]}</h1>
          <p>Dein Überblick basiert ausschließlich auf gespeicherten Daten.</p>
        </div>
        <div className="dashboard-actions">
          <button className="secondary-button" onClick={onCreateEvent}>
            <CalendarIcon /> Termin erstellen
          </button>
          <button className="primary-button" onClick={onCreateTask}>
            <PlusIcon /> Aufgabe erstellen
          </button>
        </div>
      </header>

      {error ? (
        <div className="task-error-banner" role="alert">
          <span>{error}</span>
          <button className="text-button" onClick={onReload}>
            Erneut versuchen
          </button>
        </div>
      ) : null}

      {loading && !dashboard ? (
        <div className="loading-state dashboard-loading" role="status">
          <span className="spinner" />
          <p>Dashboard wird aus der lokalen Datenbank geladen …</p>
        </div>
      ) : dashboard && snapshot ? (
        <>
          <section className="metric-grid" aria-label="Kurzübersicht">
            <article className="metric-card accent-card">
              <span className="metric-icon">
                <CalendarIcon />
              </span>
              <div>
                <span>Heutige Termine</span>
                <strong>{dashboard.todayEvents.length}</strong>
                <small>in allen lokalen Kalendern</small>
              </div>
            </article>
            <article className="metric-card">
              <span className="metric-icon">
                <TaskIcon />
              </span>
              <div>
                <span>Offene Aufgaben</span>
                <strong>{dashboard.openTasks.length}</strong>
                <small>nicht archiviert</small>
              </div>
            </article>
            <article className="metric-card quiet-card">
              <span className="metric-label">Überfällig</span>
              <strong>{dashboard.overdueTasks.length}</strong>
              <small>nach {snapshot.timezone}</small>
            </article>
          </section>

          <section className="dashboard-grid organisation-grid">
            <article className="feature-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">HEUTE</p>
                  <h2>Deine Termine</h2>
                </div>
                <button className="text-button" onClick={onOpenCalendar}>
                  Alle Termine <ArrowIcon />
                </button>
              </div>
              {dashboard.todayEvents.length ? (
                <ol className="dashboard-list">
                  {dashboard.todayEvents.map((item) => (
                    <EventRow key={item.key} item={item} />
                  ))}
                </ol>
              ) : (
                <div className="empty-inline">
                  <CalendarIcon />
                  <div>
                    <h3>Heute ist noch frei</h3>
                    <p>Es sind keine gespeicherten Termine vorhanden.</p>
                  </div>
                </div>
              )}
            </article>

            <article className="feature-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">NÄCHSTE 30 TAGE</p>
                  <h2>Nächste Termine</h2>
                </div>
              </div>
              {dashboard.upcomingEvents.length ? (
                <ol className="dashboard-list">
                  {dashboard.upcomingEvents.slice(0, 5).map((item) => (
                    <EventRow key={item.key} item={item} />
                  ))}
                </ol>
              ) : (
                <div className="empty-inline">
                  <ClockIcon />
                  <div>
                    <h3>Keine nächsten Termine</h3>
                    <p>Für die nächsten 30 Tage ist nichts gespeichert.</p>
                  </div>
                </div>
              )}
            </article>

            <article className="feature-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">AUFGABEN</p>
                  <h2>Offen und wichtig</h2>
                </div>
                <button className="text-button" onClick={onOpenTasks}>
                  Alle Aufgaben <ArrowIcon />
                </button>
              </div>
              {dashboard.openTasks.length ? (
                <ol className="dashboard-list">
                  {dashboard.openTasks.slice(0, 5).map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      timezone={snapshot.timezone}
                    />
                  ))}
                </ol>
              ) : (
                <div className="empty-inline">
                  <TaskIcon />
                  <div>
                    <h3>Keine offenen Aufgaben</h3>
                    <p>
                      Lege eine Aufgabe an, wenn ein nächster Schritt fehlt.
                    </p>
                  </div>
                </div>
              )}
              {dashboard.highPriorityTasks.length ? (
                <p className="dashboard-summary">
                  {dashboard.highPriorityTasks.length} Aufgabe
                  {dashboard.highPriorityTasks.length === 1 ? "" : "n"} mit
                  hoher oder kritischer Priorität.
                </p>
              ) : null}
            </article>

            <article className="feature-card">
              <p className="eyebrow">BEREICHE & PROJEKTE</p>
              <h2>Aktueller Fokus</h2>
              {dashboard.areas.length || snapshot.projects.length ? (
                <div className="focus-groups">
                  {dashboard.areas.map((area) => (
                    <span key={area.area}>
                      {taskAreaLabels[area.area]} · {area.openTaskCount}
                    </span>
                  ))}
                  {snapshot.projects.map((project) => (
                    <span key={project.id}>
                      {project.title} · {project.openTaskCount}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="quiet-copy">
                  Noch keine aktiven Bereiche oder Projekte.
                </p>
              )}
            </article>

            <article className="feature-card dashboard-notices">
              <p className="eyebrow">HINWEISE</p>
              <h2>Planungsqualität</h2>
              <ul>
                <li>
                  {dashboard.conflictCount
                    ? `${dashboard.conflictCount} zeitliche Überschneidung${dashboard.conflictCount === 1 ? "" : "en"} in den nächsten 30 Tagen.`
                    : "Keine zeitlichen Überschneidungen erkannt."}
                </li>
                <li>
                  {dashboard.tasksWithoutDueDate
                    ? `${dashboard.tasksWithoutDueDate} offene Aufgabe${dashboard.tasksWithoutDueDate === 1 ? "" : "n"} ohne Fälligkeit.`
                    : "Alle offenen Aufgaben haben eine Fälligkeit."}
                </li>
              </ul>
            </article>
          </section>
        </>
      ) : (
        <div className="state-card empty-state">
          <TaskIcon />
          <h2>Dashboard nicht verfügbar</h2>
          <p>
            Es konnten noch keine lokalen Organisationsdaten geladen werden.
          </p>
          {!error ? (
            <button className="secondary-button" onClick={onReload}>
              Erneut versuchen
            </button>
          ) : null}
        </div>
      )}
    </main>
  );
};
