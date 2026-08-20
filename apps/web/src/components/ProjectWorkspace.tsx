import type {
  CalendarEventResponse,
  CalendarResponse,
  CreateProjectItemRequest,
  CreateProjectRequest,
  ProjectDetailResponse,
  ProjectOverviewResponse,
  ProjectItemResponse,
  ProjectResponse,
  ProjectItemStatus,
  ProjectStatus,
  TaskResponse,
  UpdateProjectItemRequest,
  UpdateProjectRequest,
} from "@lifeos/contracts";
import { useEffect, useState, type FormEvent } from "react";

import {
  ArchiveIcon,
  PlusIcon,
  ProjectIcon,
  TrashIcon,
  UnlinkIcon,
} from "./Icons";

const projectStatuses: Array<{ value: ProjectStatus; label: string }> = [
  { value: "planned", label: "Geplant" },
  { value: "active", label: "Aktiv" },
  { value: "paused", label: "Pausiert" },
  { value: "completed", label: "Abgeschlossen" },
  { value: "cancelled", label: "Abgebrochen" },
];
const itemStatuses = [
  { value: "open", label: "Offen" },
  { value: "in_progress", label: "In Arbeit" },
  { value: "completed", label: "Abgeschlossen" },
  { value: "cancelled", label: "Abgebrochen" },
] as const;
const field = (data: FormData, name: string) => {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
};
const nullable = (value: string) => value || null;

interface Props {
  overview: ProjectOverviewResponse | null;
  detail: ProjectDetailResponse | null;
  tasks: TaskResponse[];
  calendars: CalendarResponse[];
  events: CalendarEventResponse[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  success: string | null;
  onReload: () => void;
  onSelect: (id: string) => void;
  onCreateProject: (value: CreateProjectRequest) => Promise<void>;
  onUpdateProject: (id: string, value: UpdateProjectRequest) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
  onCreateItem: (
    projectId: string,
    kind: "goals" | "milestones",
    value: CreateProjectItemRequest,
  ) => Promise<void>;
  onUpdateItem: (
    projectId: string,
    kind: "goals" | "milestones",
    itemId: string,
    value: UpdateProjectItemRequest,
  ) => Promise<void>;
  onDeleteItem: (
    projectId: string,
    kind: "goals" | "milestones",
    itemId: string,
  ) => Promise<void>;
  onLinkTask: (projectId: string, taskId: string) => Promise<void>;
  onUnlinkTask: (projectId: string, taskId: string) => Promise<void>;
  onLinkEvent: (
    projectId: string,
    calendarId: string,
    eventUid: string,
  ) => Promise<void>;
  onUnlinkEvent: (
    projectId: string,
    calendarId: string,
    eventUid: string,
  ) => Promise<void>;
}

type FormState =
  | { kind: "project-new" }
  | { kind: "project-edit" }
  | { kind: "goal-new" }
  | { kind: "milestone-new" }
  | { kind: "goal-edit"; item: ProjectItemResponse }
  | { kind: "milestone-edit"; item: ProjectItemResponse };

export const ProjectWorkspace = (props: Props) => {
  const [form, setForm] = useState<FormState | null>(null);
  const [taskId, setTaskId] = useState("");
  const [eventUid, setEventUid] = useState("");
  const selectedId = props.detail?.project.id ?? null;
  const firstProjectId = props.overview?.projects[0]?.id;
  const onSelect = props.onSelect;
  useEffect(() => {
    if (!selectedId && firstProjectId) onSelect(firstProjectId);
  }, [firstProjectId, onSelect, selectedId]);
  const availableTasks = props.tasks.filter(
    (task) => !task.archivedAt && !task.projectId,
  );

  return (
    <main className="page-content project-page">
      <header className="workspace-heading">
        <div>
          <p className="eyebrow">Projekte</p>
          <h1>Ziele und Fortschritt im Blick</h1>
          <p>
            Fortschritt entsteht nachvollziehbar aus aktiven Zielen,
            Meilensteinen und Aufgaben.
          </p>
        </div>
        <div className="study-actions">
          <button
            className="secondary-button"
            onClick={props.onReload}
            disabled={props.loading}
          >
            Neu laden
          </button>
          <button
            className="primary-button"
            onClick={() => setForm({ kind: "project-new" })}
          >
            <PlusIcon /> Projekt
          </button>
        </div>
      </header>
      {props.error ? (
        <div className="message error" role="alert">
          {props.error}
        </div>
      ) : null}
      {props.success ? (
        <div className="message success" role="status">
          {props.success}
        </div>
      ) : null}
      {form?.kind === "project-new" ? (
        <ProjectForm
          title="Projekt anlegen"
          saving={props.saving}
          onCancel={() => setForm(null)}
          onSave={async (value) => {
            await props.onCreateProject(value);
            setForm(null);
          }}
        />
      ) : null}
      {form?.kind === "project-edit" && props.detail ? (
        <ProjectForm
          title="Projekt bearbeiten"
          initial={props.detail.project}
          saving={props.saving}
          onCancel={() => setForm(null)}
          onSave={async (value) => {
            await props.onUpdateProject(props.detail!.project.id, value);
            setForm(null);
          }}
        />
      ) : null}
      {form?.kind === "goal-new" && selectedId ? (
        <ItemForm
          label="Ziel"
          saving={props.saving}
          onCancel={() => setForm(null)}
          onSave={async (value) => {
            await props.onCreateItem(selectedId, "goals", value);
            setForm(null);
          }}
        />
      ) : null}
      {form?.kind === "milestone-new" && selectedId ? (
        <ItemForm
          label="Meilenstein"
          saving={props.saving}
          onCancel={() => setForm(null)}
          onSave={async (value) => {
            await props.onCreateItem(selectedId, "milestones", value);
            setForm(null);
          }}
        />
      ) : null}
      {form?.kind === "goal-edit" && selectedId ? (
        <ItemForm
          label="Ziel bearbeiten"
          initial={form.item}
          saving={props.saving}
          onCancel={() => setForm(null)}
          onSave={async (value) => {
            await props.onUpdateItem(selectedId, "goals", form.item.id, value);
            setForm(null);
          }}
        />
      ) : null}
      {form?.kind === "milestone-edit" && selectedId ? (
        <ItemForm
          label="Meilenstein bearbeiten"
          initial={form.item}
          saving={props.saving}
          onCancel={() => setForm(null)}
          onSave={async (value) => {
            await props.onUpdateItem(
              selectedId,
              "milestones",
              form.item.id,
              value,
            );
            setForm(null);
          }}
        />
      ) : null}
      {!props.loading && !props.overview?.projects.length ? (
        <section className="empty-state">
          <ProjectIcon />
          <h2>Noch kein Projekt</h2>
          <p>
            Lege ein Projekt an; ohne Ziele, Meilensteine oder Aufgaben wird
            bewusst kein Fortschrittswert erfunden.
          </p>
        </section>
      ) : (
        <div className="project-layout">
          <section
            className="study-section project-list"
            aria-label="Projektübersicht"
          >
            <h2>Projektübersicht</h2>
            {props.overview?.projects.map((project) => (
              <button
                key={project.id}
                className={
                  project.id === selectedId
                    ? "project-list-item active"
                    : "project-list-item"
                }
                onClick={() => props.onSelect(project.id)}
              >
                <strong>{project.title}</strong>
                <span>
                  {project.progress.state === "no_data"
                    ? "Noch keine Fortschrittsdaten"
                    : `${project.progress.percent} % · ${project.progress.completedItems}/${project.progress.totalItems}`}
                </span>
                <progress
                  max="100"
                  value={project.progress.percent ?? 0}
                  aria-label={`Fortschritt ${project.title}`}
                />
              </button>
            ))}
          </section>
          {props.detail ? (
            <ProjectDetail
              {...props}
              detail={props.detail}
              onOpenForm={setForm}
              availableTasks={availableTasks}
              taskId={taskId}
              setTaskId={setTaskId}
              eventUid={eventUid}
              setEventUid={setEventUid}
            />
          ) : null}
        </div>
      )}
    </main>
  );
};

const ProjectDetail = ({
  detail,
  saving,
  calendars,
  events,
  availableTasks,
  taskId,
  setTaskId,
  eventUid,
  setEventUid,
  onOpenForm,
  onUpdateProject,
  onDeleteProject,
  onUpdateItem,
  onDeleteItem,
  onLinkTask,
  onUnlinkTask,
  onLinkEvent,
  onUnlinkEvent,
}: Props & {
  detail: ProjectDetailResponse;
  availableTasks: TaskResponse[];
  taskId: string;
  setTaskId: (value: string) => void;
  eventUid: string;
  setEventUid: (value: string) => void;
  onOpenForm: (form: FormState) => void;
}) => {
  const { project, progress } = detail;
  const selectedCalendar = calendars[0];
  return (
    <section className="project-detail">
      <article className="study-section">
        <header>
          <div>
            <p className="eyebrow">{project.status}</p>
            <h2>{project.title}</h2>
            <p>{project.description || "Keine Beschreibung"}</p>
          </div>
          <div className="record-actions">
            <button
              className="text-button"
              aria-label="Projekt bearbeiten"
              onClick={() => onOpenForm({ kind: "project-edit" })}
            >
              Bearbeiten
            </button>
            <select
              value={project.status}
              aria-label="Projektstatus"
              disabled={saving}
              onChange={(event) =>
                void onUpdateProject(project.id, {
                  status: event.target.value as ProjectStatus,
                })
              }
            >
              {projectStatuses.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
            <button
              className="icon-button"
              aria-label={
                project.archivedAt
                  ? "Projekt wieder aktivieren"
                  : "Projekt archivieren"
              }
              onClick={() =>
                void onUpdateProject(project.id, {
                  archived: !project.archivedAt,
                })
              }
            >
              <ArchiveIcon />
            </button>
            <button
              className="icon-button danger"
              aria-label="Projekt löschen"
              onClick={() => void onDeleteProject(project.id)}
            >
              <TrashIcon />
            </button>
          </div>
        </header>
        <div className="project-progress">
          <strong>
            {progress.state === "no_data"
              ? "Noch nicht messbar"
              : `${progress.percent} %`}
          </strong>
          <progress max="100" value={progress.percent ?? 0} />
          <span>
            {progress.completedItems} von {progress.totalItems} aktiven
            Einträgen abgeschlossen
          </span>
        </div>
        {project.risk ? (
          <p className="risk-note">
            <strong>Risiko:</strong> {project.risk}
          </p>
        ) : null}
      </article>
      <ProjectItems
        title="Ziele"
        items={detail.goals}
        kind="goals"
        saving={saving}
        onAdd={() => onOpenForm({ kind: "goal-new" })}
        onEdit={(item) => onOpenForm({ kind: "goal-edit", item })}
        onUpdate={(itemId, value) =>
          onUpdateItem(project.id, "goals", itemId, value)
        }
        onDelete={(itemId) => onDeleteItem(project.id, "goals", itemId)}
      />
      <ProjectItems
        title="Meilensteine"
        items={detail.milestones}
        kind="milestones"
        saving={saving}
        onAdd={() => onOpenForm({ kind: "milestone-new" })}
        onEdit={(item) => onOpenForm({ kind: "milestone-edit", item })}
        onUpdate={(itemId, value) =>
          onUpdateItem(project.id, "milestones", itemId, value)
        }
        onDelete={(itemId) => onDeleteItem(project.id, "milestones", itemId)}
      />
      <section className="study-section">
        <header>
          <h2>Aufgaben</h2>
        </header>
        <form
          className="inline-link-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (taskId)
              void onLinkTask(project.id, taskId).then(() => setTaskId(""));
          }}
        >
          <select
            aria-label="Aufgabe auswählen"
            value={taskId}
            onChange={(event) => setTaskId(event.target.value)}
          >
            <option value="">Aufgabe auswählen</option>
            {availableTasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </select>
          <button disabled={!taskId || saving}>Verknüpfen</button>
        </form>
        {detail.tasks.map((task) => (
          <div className="project-linked-row" key={task.id}>
            <span>
              <strong>{task.title}</strong> · {task.status}
            </span>
            <button
              className="icon-button"
              aria-label={`Aufgabe ${task.title} lösen`}
              onClick={() => void onUnlinkTask(project.id, task.id)}
            >
              <UnlinkIcon />
            </button>
          </div>
        ))}
      </section>
      <section className="study-section">
        <header>
          <h2>Kalenderereignisse</h2>
        </header>
        <form
          className="inline-link-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (selectedCalendar && eventUid)
              void onLinkEvent(project.id, selectedCalendar.id, eventUid).then(
                () => setEventUid(""),
              );
          }}
        >
          <select
            aria-label="Kalenderereignis auswählen"
            value={eventUid}
            onChange={(event) => setEventUid(event.target.value)}
          >
            <option value="">Termin auswählen</option>
            {events.map((entry) => (
              <option key={entry.uid} value={entry.uid}>
                {entry.title}
              </option>
            ))}
          </select>
          <button disabled={!selectedCalendar || !eventUid || saving}>
            Verknüpfen
          </button>
        </form>
        {detail.calendarEvents.map((event) => (
          <div
            className="project-linked-row"
            key={`${event.calendarId}-${event.uid}`}
          >
            <span>
              <strong>{event.title}</strong> · ETag {event.etag}
            </span>
            <button
              className="icon-button"
              aria-label={`Termin ${event.title} lösen`}
              onClick={() =>
                void onUnlinkEvent(project.id, event.calendarId, event.uid)
              }
            >
              <UnlinkIcon />
            </button>
          </div>
        ))}
      </section>
    </section>
  );
};

const ProjectItems = ({
  title,
  items,
  saving,
  onAdd,
  onEdit,
  onUpdate,
  onDelete,
}: {
  title: string;
  kind: "goals" | "milestones";
  items: ProjectDetailResponse["goals"];
  saving: boolean;
  onAdd: () => void;
  onEdit: (item: ProjectItemResponse) => void;
  onUpdate: (id: string, value: UpdateProjectItemRequest) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) => (
  <section className="study-section">
    <header>
      <h2>{title}</h2>
      <button className="text-button" onClick={onAdd}>
        <PlusIcon />{" "}
        {title === "Ziele" ? "Ziel hinzufügen" : "Meilenstein hinzufügen"}
      </button>
    </header>
    {items.map((item) => (
      <article className="study-card" key={item.id}>
        <div>
          <h3>{item.title}</h3>
          <p>
            {[item.archivedAt ? "Archiviert" : null, item.dueDate, item.risk]
              .filter(Boolean)
              .join(" · ") || "Ohne Zusatzangaben"}
          </p>
        </div>
        <div className="record-actions">
          <button
            className="text-button"
            aria-label={`${item.title} bearbeiten`}
            onClick={() => onEdit(item)}
          >
            Bearbeiten
          </button>
          <select
            aria-label={`Status ${item.title}`}
            value={item.status}
            disabled={saving}
            onChange={(event) =>
              void onUpdate(item.id, {
                status: event.target.value as ProjectItemStatus,
              })
            }
          >
            {itemStatuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
          <button
            className="icon-button"
            aria-label={`${item.title} ${item.archivedAt ? "wiederherstellen" : "archivieren"}`}
            onClick={() =>
              void onUpdate(item.id, { archived: !item.archivedAt })
            }
          >
            <ArchiveIcon />
          </button>
          <button
            className="icon-button danger"
            aria-label={`${item.title} löschen`}
            onClick={() => void onDelete(item.id)}
          >
            <TrashIcon />
          </button>
        </div>
      </article>
    ))}
  </section>
);

const ProjectForm = ({
  title,
  initial,
  saving,
  onCancel,
  onSave,
}: {
  title: string;
  initial?: ProjectResponse;
  saving: boolean;
  onCancel: () => void;
  onSave: (value: CreateProjectRequest) => Promise<void>;
}) => (
  <BaseForm
    title={title}
    {...(initial ? { initial } : {})}
    saving={saving}
    onCancel={onCancel}
    onSubmit={(data) =>
      onSave({
        title: field(data, "title"),
        description: nullable(field(data, "description")),
        status: field(data, "status") as ProjectStatus,
        risk: nullable(field(data, "risk")),
        dueDate: nullable(field(data, "dueDate")),
        searchEnabled: data.get("searchEnabled") === "on",
      })
    }
    statuses={projectStatuses}
    searchRelease
  />
);
const ItemForm = ({
  label,
  initial,
  saving,
  onCancel,
  onSave,
}: {
  label: string;
  initial?: ProjectItemResponse;
  saving: boolean;
  onCancel: () => void;
  onSave: (value: CreateProjectItemRequest) => Promise<void>;
}) => (
  <BaseForm
    title={initial ? label : `${label} anlegen`}
    {...(initial ? { initial } : {})}
    saving={saving}
    onCancel={onCancel}
    onSubmit={(data) =>
      onSave({
        title: field(data, "title"),
        description: nullable(field(data, "description")),
        status: field(data, "status") as ProjectItemStatus,
        risk: nullable(field(data, "risk")),
        dueDate: nullable(field(data, "dueDate")),
      })
    }
    statuses={[...itemStatuses]}
  />
);
const BaseForm = ({
  title,
  saving,
  onCancel,
  onSubmit,
  statuses,
  initial,
  searchRelease = false,
}: {
  title: string;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (data: FormData) => Promise<void>;
  statuses: ReadonlyArray<{ value: string; label: string }>;
  initial?: {
    title: string;
    description: string | null;
    status: string;
    risk: string | null;
    dueDate: string | null;
    searchEnabled?: boolean;
  };
  searchRelease?: boolean;
}) => (
  <form
    className="study-form"
    onSubmit={(event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void onSubmit(new FormData(event.currentTarget));
    }}
  >
    <h2>{title}</h2>
    <div className="study-form-grid">
      <label>
        Bezeichnung
        <input
          name="title"
          required
          maxLength={500}
          defaultValue={initial?.title}
        />
      </label>
      <label>
        Status
        <select name="status" defaultValue={initial?.status}>
          {statuses.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Fällig am
        <input
          name="dueDate"
          type="date"
          defaultValue={initial?.dueDate ?? ""}
        />
      </label>
      <label>
        Risiko
        <input
          name="risk"
          maxLength={20000}
          defaultValue={initial?.risk ?? ""}
        />
      </label>
      <label className="wide">
        Beschreibung
        <textarea
          name="description"
          maxLength={20000}
          defaultValue={initial?.description ?? ""}
        />
      </label>
      {searchRelease ? (
        <label className="wide checkbox-row">
          <input
            name="searchEnabled"
            type="checkbox"
            defaultChecked={initial?.searchEnabled ?? false}
          />
          Projekt und aktive Ziele sowie Meilensteine für die lokale Suche
          freigeben
        </label>
      ) : null}
    </div>
    <div className="form-actions">
      <button type="button" className="secondary-button" onClick={onCancel}>
        Abbrechen
      </button>
      <button className="primary-button" disabled={saving}>
        Speichern
      </button>
    </div>
  </form>
);
