import type {
  CalendarEventResponse,
  CreateTaskEventLinkRequest,
  CreateTaskRequest,
  ProjectResponse,
  StudyModuleResponse,
  TaskArea,
  TaskPriority,
  TaskResponse,
  TaskEventLinkResponse,
  TaskStatus,
  UpdateTaskRequest,
} from "@lifeos/contracts";
import { useEffect, useMemo, useState } from "react";

import {
  compareTasks,
  formatTaskDueDate,
  formatTaskStart,
  selectableTaskAreas,
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
import { TaskForm, type TaskDefaults } from "./TaskForm";

type DueFilter = "all" | "overdue" | "today" | "upcoming" | "none";
/** `all`, `none` (ohne Modulbezug) oder die UUID eines Moduls. */
type ModuleFilter = string;

interface TaskWorkspaceProps {
  tasks: TaskResponse[];
  events: CalendarEventResponse[];
  links: TaskEventLinkResponse[];
  modules: StudyModuleResponse[];
  projects: ProjectResponse[];
  createDefaults: TaskDefaults | null;
  selectedCalendarId: string | null;
  timezone: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  success: string | null;
  createRequested: boolean;
  onCreateRequestHandled: () => void;
  /**
   * Aus einer anderen Ansicht angeforderte Aufgabe. Der gemeinsame Editor
   * öffnet genau diese Aufgabe; die Ansicht selbst bleibt unverändert.
   */
  editRequestId: string | null;
  onEditRequestHandled: () => void;
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
  modules,
  projects,
  createDefaults,
  selectedCalendarId,
  timezone,
  loading,
  saving,
  error,
  success,
  createRequested,
  onCreateRequestHandled,
  editRequestId,
  onEditRequestHandled,
  onReload,
  onSave,
  onUpdate,
  onDelete,
  onLink,
  onUnlink,
}: TaskWorkspaceProps) => {
  const [editorTask, setEditorTask] = useState<TaskResponse | null | undefined>(
    createRequested ? null : undefined,
  );
  const [preset, setPreset] = useState<TaskDefaults | null>(
    createRequested ? createDefaults : null,
  );
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<TaskStatus | "all">("all");
  const [priority, setPriority] = useState<TaskPriority | "all">("all");
  const [area, setArea] = useState<TaskArea | "all">("all");
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>("all");
  const [due, setDue] = useState<DueFilter>("all");
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    if (createRequested) onCreateRequestHandled();
  }, [createRequested, onCreateRequestHandled]);

  /**
   * Eine aus Kalender- oder Planungsansicht angeforderte Aufgabe öffnet den
   * gemeinsamen Editor ohne eigenen Effekt. Die Anforderung übernimmt den
   * Editor, bis er geschlossen oder gespeichert wurde; sie erzeugt weder einen
   * zweiten Schreibpfad noch eine eigene Datenkopie.
   */
  const requestedTask = editRequestId
    ? tasks.find((candidate) => candidate.id === editRequestId)
    : undefined;
  const openTask = editorTask === undefined ? requestedTask : editorTask;
  const openPreset = editorTask === undefined && requestedTask ? null : preset;

  const moduleTitles = useMemo(
    () =>
      new Map(
        modules.map((module) => [
          module.id,
          module.archivedAt ? `Archiviert · ${module.title}` : module.title,
        ]),
      ),
    [modules],
  );

  /**
   * Der Modulfilter bietet alle aktiven Module sowie bereits zugeordnete
   * archivierte Module an, damit Altbezüge nachvollziehbar filterbar bleiben.
   */
  const filterModules = useMemo(() => {
    const referenced = new Set(
      tasks
        .map((task) => task.studyModuleId)
        .filter((id): id is string => Boolean(id)),
    );
    const active = modules.filter((module) => module.archivedAt === null);
    const archived = modules.filter(
      (module) => module.archivedAt !== null && referenced.has(module.id),
    );
    return [...active, ...archived];
  }, [modules, tasks]);

  const openNewTask = (defaults: TaskDefaults | null) => {
    setPreset(defaults);
    setEditorTask(null);
  };

  const filteredTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("de-DE");
    const today = todayInTimezone(timezone);
    return tasks
      .filter((task) => showArchived || task.archivedAt === null)
      .filter((task) => status === "all" || task.status === status)
      .filter((task) => priority === "all" || task.priority === priority)
      .filter((task) => area === "all" || task.area === area)
      .filter((task) => {
        if (moduleFilter === "all") return true;
        if (moduleFilter === "none") return task.studyModuleId === null;
        return task.studyModuleId === moduleFilter;
      })
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
  }, [
    area,
    due,
    moduleFilter,
    priority,
    query,
    showArchived,
    status,
    tasks,
    timezone,
  ]);

  const resetFilters = () => {
    setQuery("");
    setStatus("all");
    setPriority("all");
    setArea("all");
    setModuleFilter("all");
    setDue("all");
    setShowArchived(false);
  };

  /** Schließt den gemeinsamen Editor und beendet eine angeforderte Bearbeitung. */
  const closeEditor = () => {
    setPreset(null);
    setEditorTask(undefined);
    onEditRequestHandled();
  };

  const save = async (payload: CreateTaskRequest | UpdateTaskRequest) => {
    await onSave(openTask ?? null, payload);
    setPreset(null);
    setEditorTask(undefined);
    onEditRequestHandled();
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
        <button className="primary-button" onClick={() => openNewTask(null)}>
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
            {selectableTaskAreas.map((areaValue) => (
              <option key={areaValue} value={areaValue}>
                {taskAreaLabels[areaValue]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Studienmodul</span>
          <select
            value={moduleFilter}
            onChange={(input) => setModuleFilter(input.target.value)}
          >
            <option value="all">Alle Module</option>
            <option value="none">Ohne Modul</option>
            {filterModules.map((module) => (
              <option key={module.id} value={module.id}>
                {module.archivedAt
                  ? `Archiviert · ${module.title}`
                  : module.title}
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
          openTask !== undefined ? "task-layout editor-open" : "task-layout"
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
                onClick={() => openNewTask(null)}
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
                          {task.studyModuleId ? (
                            <span className="module-badge">
                              {moduleTitles.get(task.studyModuleId) ??
                                "Modul nicht mehr verfügbar"}
                            </span>
                          ) : null}
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

        {openTask !== undefined ? (
          <TaskForm
            key={openTask?.updatedAt ?? "new-task"}
            task={openTask}
            tasks={tasks}
            events={events}
            links={links}
            modules={modules}
            projects={projects}
            defaults={openPreset}
            selectedCalendarId={selectedCalendarId}
            timezone={timezone}
            pending={saving}
            onCancel={() => closeEditor()}
            onSubmit={save}
            onArchive={(archived) =>
              openTask ? onUpdate(openTask.id, { archived }) : Promise.resolve()
            }
            onDelete={() =>
              openTask ? onDelete(openTask.id) : Promise.resolve()
            }
            onLink={onLink}
            onUnlink={onUnlink}
          />
        ) : null}
      </div>
    </main>
  );
};
