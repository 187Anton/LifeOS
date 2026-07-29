import type {
  CalendarEventResponse,
  CreateTaskEventLinkRequest,
  CreateTaskRequest,
  TaskArea,
  TaskPriority,
  TaskResponse,
  TaskEventLinkResponse,
  TaskStatus,
  UpdateTaskRequest,
} from "@lifeos/contracts";
import { useMemo, useState } from "react";

import {
  compareTasks,
  formatTaskDueDate,
  formatTaskStart,
  taskAreaLabels,
  taskIsOverdue,
  taskPriorityLabels,
  taskStatusLabels,
  todayInTimezone,
} from "../task";
import {
  CheckIcon,
  EditIcon,
  PlusIcon,
  ReopenIcon,
  SearchIcon,
  TaskIcon,
} from "./Icons";
import { TaskForm } from "./TaskForm";

type DueFilter = "all" | "overdue" | "today" | "upcoming" | "none";

interface TaskWorkspaceProps {
  tasks: TaskResponse[];
  events: CalendarEventResponse[];
  links: TaskEventLinkResponse[];
  selectedCalendarId: string | null;
  timezone: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  success: string | null;
  onReload: () => void;
  onSave: (
    task: TaskResponse | null,
    payload: CreateTaskRequest | UpdateTaskRequest,
  ) => Promise<void>;
  onUpdate: (taskId: string, payload: UpdateTaskRequest) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
  onLink: (input: CreateTaskEventLinkRequest) => Promise<void>;
  onUnlink: (linkId: string) => Promise<void>;
}

export const TaskWorkspace = ({
  tasks,
  events,
  links,
  selectedCalendarId,
  timezone,
  loading,
  saving,
  error,
  success,
  onReload,
  onSave,
  onUpdate,
  onDelete,
  onLink,
  onUnlink,
}: TaskWorkspaceProps) => {
  const [editorTask, setEditorTask] = useState<TaskResponse | null | undefined>(
    undefined,
  );
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<TaskStatus | "all">("all");
  const [priority, setPriority] = useState<TaskPriority | "all">("all");
  const [area, setArea] = useState<TaskArea | "all">("all");
  const [due, setDue] = useState<DueFilter>("all");
  const [showArchived, setShowArchived] = useState(false);

  const filteredTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("de-DE");
    const today = todayInTimezone(timezone);
    return tasks
      .filter((task) => showArchived || task.archivedAt === null)
      .filter((task) => status === "all" || task.status === status)
      .filter((task) => priority === "all" || task.priority === priority)
      .filter((task) => area === "all" || task.area === area)
      .filter((task) => {
        if (due === "all") return true;
        if (due === "none") return task.dueDate === null;
        if (due === "today") return task.dueDate === today;
        if (due === "overdue") return taskIsOverdue(task, timezone);
        return Boolean(task.dueDate && task.dueDate > today);
      })
      .filter((task) => {
        if (!normalizedQuery) return true;
        return [task.title, task.description ?? "", task.tags.join(" ")].some(
          (value) => value.toLocaleLowerCase("de-DE").includes(normalizedQuery),
        );
      })
      .sort(compareTasks);
  }, [area, due, priority, query, showArchived, status, tasks, timezone]);

  const resetFilters = () => {
    setQuery("");
    setStatus("all");
    setPriority("all");
    setArea("all");
    setDue("all");
    setShowArchived(false);
  };

  const save = async (payload: CreateTaskRequest | UpdateTaskRequest) => {
    await onSave(editorTask ?? null, payload);
    setEditorTask(undefined);
  };

  const quickToggle = async (task: TaskResponse) => {
    const reopen = task.status === "done" || task.status === "cancelled";
    try {
      await onUpdate(task.id, { status: reopen ? "open" : "done" });
    } catch {
      // Der übergeordnete Workspace zeigt den API-Fehler an.
    }
  };

  return (
    <main className="page-content task-page">
      <header className="page-heading task-heading">
        <div>
          <p className="eyebrow">DEINE NÄCHSTEN SCHRITTE</p>
          <h1>Aufgaben</h1>
          <p>Plane Arbeit nachvollziehbar – lokal und ohne externe Dienste.</p>
        </div>
        <button className="primary-button" onClick={() => setEditorTask(null)}>
          <PlusIcon /> Neue Aufgabe
        </button>
      </header>

      {success ? (
        <p role="status" className="success-banner">
          {success}
        </p>
      ) : null}
      {error ? (
        <div className="task-error-banner" role="alert">
          <span>{error}</span>
          <button className="text-button" onClick={onReload}>
            Erneut versuchen
          </button>
        </div>
      ) : null}

      <section className="task-filter-panel" aria-label="Aufgaben filtern">
        <label className="task-search">
          <span>Aufgaben durchsuchen</span>
          <span className="search-control">
            <SearchIcon />
            <input
              type="search"
              value={query}
              onChange={(input) => setQuery(input.target.value)}
              placeholder="Titel, Beschreibung oder Tag"
            />
          </span>
        </label>
        <label>
          <span>Status</span>
          <select
            value={status}
            onChange={(input) =>
              setStatus(input.target.value as TaskStatus | "all")
            }
          >
            <option value="all">Alle Status</option>
            {Object.entries(taskStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Priorität</span>
          <select
            value={priority}
            onChange={(input) =>
              setPriority(input.target.value as TaskPriority | "all")
            }
          >
            <option value="all">Alle Prioritäten</option>
            {Object.entries(taskPriorityLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Bereich</span>
          <select
            value={area}
            onChange={(input) =>
              setArea(input.target.value as TaskArea | "all")
            }
          >
            <option value="all">Alle Bereiche</option>
            {Object.entries(taskAreaLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Fälligkeit</span>
          <select
            value={due}
            onChange={(input) => setDue(input.target.value as DueFilter)}
          >
            <option value="all">Alle Fälligkeiten</option>
            <option value="overdue">Überfällig</option>
            <option value="today">Heute</option>
            <option value="upcoming">Zukünftig</option>
            <option value="none">Ohne Fälligkeit</option>
          </select>
        </label>
        <label className="archive-filter">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(input) => setShowArchived(input.target.checked)}
          />
          Archivierte anzeigen
        </label>
        <button className="text-button reset-filters" onClick={resetFilters}>
          Filter zurücksetzen
        </button>
      </section>

      <div
        className={
          editorTask !== undefined ? "task-layout editor-open" : "task-layout"
        }
      >
        <section
          className="task-list-section"
          aria-labelledby="task-list-title"
        >
          <div className="section-heading task-list-heading">
            <div>
              <h2 id="task-list-title">Deine Aufgaben</h2>
              <p>
                {filteredTasks.length} von {tasks.length} sichtbar
              </p>
            </div>
          </div>

          {loading ? (
            <div className="loading-state" role="status">
              <span className="spinner" />
              <p>Aufgaben werden geladen …</p>
            </div>
          ) : tasks.length === 0 ? (
            <div className="state-card empty-state">
              <TaskIcon />
              <h3>Noch keine Aufgabe</h3>
              <p>
                Lege deinen ersten nächsten Schritt an. Er bleibt lokal in
                deiner LifeOS-Datenbank.
              </p>
              <button
                className="primary-button"
                onClick={() => setEditorTask(null)}
              >
                <PlusIcon /> Erste Aufgabe anlegen
              </button>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="state-card empty-state">
              <SearchIcon />
              <h3>Keine passenden Aufgaben</h3>
              <p>Suche und Filter ergeben gemeinsam keinen Treffer.</p>
              <button className="secondary-button" onClick={resetFilters}>
                Filter zurücksetzen
              </button>
            </div>
          ) : (
            <ol className="task-list">
              {filteredTasks.map((task) => {
                const start = formatTaskStart(task);
                const reopen =
                  task.status === "done" || task.status === "cancelled";
                return (
                  <li key={task.id}>
                    <article
                      className={[
                        "task-card",
                        `task-status-${task.status}`,
                        task.archivedAt ? "archived" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <div className="task-card-main">
                        <div className="task-badges">
                          <span className={`status-badge ${task.status}`}>
                            {taskStatusLabels[task.status]}
                          </span>
                          <span className={`priority-badge ${task.priority}`}>
                            {taskPriorityLabels[task.priority]}
                          </span>
                          <span>{taskAreaLabels[task.area]}</span>
                          {task.archivedAt ? <span>Archiviert</span> : null}
                        </div>
                        <h3>{task.title}</h3>
                        <p>
                          {task.description ||
                            "Keine Beschreibung hinzugefügt."}
                        </p>
                        <div className="task-meta">
                          <span
                            className={
                              taskIsOverdue(task, timezone) ? "overdue" : ""
                            }
                          >
                            {formatTaskDueDate(task.dueDate, timezone)}
                          </span>
                          {start ? <span>Geplant: {start}</span> : null}
                          {task.estimatedDurationMinutes ? (
                            <span>{task.estimatedDurationMinutes} Minuten</span>
                          ) : null}
                        </div>
                        {task.tags.length > 0 ? (
                          <div className="task-tags">
                            {task.tags.map((tag) => (
                              <span key={tag}>#{tag}</span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="task-card-actions">
                        <button
                          className="secondary-button compact-action"
                          disabled={saving || Boolean(task.archivedAt)}
                          onClick={() => void quickToggle(task)}
                        >
                          {reopen ? <ReopenIcon /> : <CheckIcon />}
                          {reopen ? "Wieder öffnen" : "Abschließen"}
                        </button>
                        <button
                          className="icon-button"
                          onClick={() => setEditorTask(task)}
                          aria-label={`${task.title} bearbeiten`}
                        >
                          <EditIcon />
                        </button>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {editorTask !== undefined ? (
          <TaskForm
            key={editorTask?.updatedAt ?? "new-task"}
            task={editorTask}
            tasks={tasks}
            events={events}
            links={links}
            selectedCalendarId={selectedCalendarId}
            timezone={timezone}
            pending={saving}
            onCancel={() => setEditorTask(undefined)}
            onSubmit={save}
            onArchive={(archived) =>
              editorTask
                ? onUpdate(editorTask.id, { archived })
                : Promise.resolve()
            }
            onDelete={() =>
              editorTask ? onDelete(editorTask.id) : Promise.resolve()
            }
            onLink={onLink}
            onUnlink={onUnlink}
          />
        ) : null}
      </div>
    </main>
  );
};
