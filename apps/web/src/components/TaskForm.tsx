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
import { useState, type FormEvent } from "react";

import { dateTimeInputToIso, toDateTimeInput } from "../date";
import { taskAreaLabels, taskPriorityLabels, taskStatusLabels } from "../task";
import { ArchiveIcon, TrashIcon } from "./Icons";
import { TaskEventLinkPanel } from "./TaskEventLinkPanel";

interface TaskFormProps {
  task: TaskResponse | null;
  tasks: TaskResponse[];
  events: CalendarEventResponse[];
  links: TaskEventLinkResponse[];
  selectedCalendarId: string | null;
  timezone: string;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (payload: CreateTaskRequest | UpdateTaskRequest) => Promise<void>;
  onArchive: (archived: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
  onLink: (input: CreateTaskEventLinkRequest) => Promise<void>;
  onUnlink: (linkId: string) => Promise<void>;
}

interface Draft {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  scheduledStart: string;
  estimatedDurationMinutes: string;
  tags: string;
  area: TaskArea;
  parentTaskId: string;
}

const statusValues: TaskStatus[] = [
  "open",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
];
const priorityValues: TaskPriority[] = ["low", "medium", "high", "critical"];
const areaValues: TaskArea[] = [
  "study",
  "work",
  "projects",
  "finance",
  "fitness",
  "personal",
];
const transitions: Record<TaskStatus, TaskStatus[]> = {
  open: ["open", "in_progress", "blocked", "done", "cancelled"],
  in_progress: ["in_progress", "open", "blocked", "done", "cancelled"],
  blocked: ["blocked", "open", "in_progress", "done", "cancelled"],
  done: ["done", "open"],
  cancelled: ["cancelled", "open"],
};

const initialDraft = (task: TaskResponse | null): Draft => ({
  title: task?.title ?? "",
  description: task?.description ?? "",
  status: task?.status ?? "open",
  priority: task?.priority ?? "medium",
  dueDate: task?.dueDate ?? "",
  scheduledStart:
    task?.scheduledStartAt && task.scheduledStartTimezone
      ? toDateTimeInput(task.scheduledStartAt, task.scheduledStartTimezone)
      : "",
  estimatedDurationMinutes: task?.estimatedDurationMinutes?.toString() ?? "",
  tags: task?.tags.join(", ") ?? "",
  area: task?.area ?? "personal",
  parentTaskId: task?.parentTaskId ?? "",
});

export const TaskForm = ({
  task,
  tasks,
  events,
  links,
  selectedCalendarId,
  timezone,
  pending,
  onCancel,
  onSubmit,
  onArchive,
  onDelete,
  onLink,
  onUnlink,
}: TaskFormProps) => {
  const [draft, setDraft] = useState(() => initialDraft(task));
  const [validationError, setValidationError] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState(false);

  const update = <Key extends keyof Draft>(key: Key, value: Draft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError(null);
    const title = draft.title.trim();
    if (!title) {
      setValidationError("Bitte gib einen Titel ein.");
      return;
    }
    const duration = draft.estimatedDurationMinutes
      ? Number(draft.estimatedDurationMinutes)
      : null;
    if (
      duration !== null &&
      (!Number.isInteger(duration) || duration < 1 || duration > 525_600)
    ) {
      setValidationError(
        "Die Dauer muss eine ganze Minute zwischen 1 und 525600 sein.",
      );
      return;
    }
    try {
      await onSubmit({
        title,
        description: draft.description.trim() || null,
        status: draft.status,
        priority: draft.priority,
        dueDate: draft.dueDate || null,
        scheduledStartAt: draft.scheduledStart
          ? dateTimeInputToIso(draft.scheduledStart, timezone)
          : null,
        scheduledStartTimezone: draft.scheduledStart ? timezone : null,
        estimatedDurationMinutes: duration,
        tags: [
          ...new Set(
            draft.tags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
          ),
        ],
        area: draft.area,
        parentTaskId: draft.parentTaskId || null,
      });
    } catch {
      // Der übergeordnete Workspace zeigt den API-Fehler an.
    }
  };

  const availableStatuses = task ? transitions[task.status] : statusValues;
  const possibleParents = tasks.filter(
    (candidate) => candidate.id !== task?.id && candidate.archivedAt === null,
  );
  const changeArchiveState = async () => {
    if (!task) return;
    try {
      await onArchive(task.archivedAt === null);
      onCancel();
    } catch {
      // Der übergeordnete Workspace zeigt den API-Fehler an.
    }
  };
  const deleteTask = async () => {
    try {
      await onDelete();
      onCancel();
    } catch {
      // Der übergeordnete Workspace zeigt den API-Fehler an.
    }
  };

  return (
    <section className="task-editor" aria-labelledby="task-form-title">
      <div className="editor-heading">
        <div>
          <p className="eyebrow">
            {task ? "AUFGABE BEARBEITEN" : "NEUE AUFGABE"}
          </p>
          <h2 id="task-form-title">
            {task ? task.title : "Was möchtest du erledigen?"}
          </h2>
        </div>
        <button type="button" className="text-button" onClick={onCancel}>
          Schließen
        </button>
      </div>

      <form onSubmit={(event) => void submit(event)}>
        <div className="field full-field">
          <label htmlFor="task-title">Titel</label>
          <input
            id="task-title"
            value={draft.title}
            onChange={(input) => update("title", input.target.value)}
            maxLength={500}
            required
            autoFocus
          />
        </div>

        <div className="field">
          <label htmlFor="task-status">Status</label>
          <select
            id="task-status"
            value={draft.status}
            onChange={(input) =>
              update("status", input.target.value as TaskStatus)
            }
          >
            {availableStatuses.map((status) => (
              <option key={status} value={status}>
                {taskStatusLabels[status]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="task-priority">Priorität</label>
          <select
            id="task-priority"
            value={draft.priority}
            onChange={(input) =>
              update("priority", input.target.value as TaskPriority)
            }
          >
            {priorityValues.map((priority) => (
              <option key={priority} value={priority}>
                {taskPriorityLabels[priority]}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="task-due-date">Fällig am</label>
          <input
            id="task-due-date"
            type="date"
            value={draft.dueDate}
            onChange={(input) => update("dueDate", input.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="task-duration">Geschätzte Dauer (Minuten)</label>
          <input
            id="task-duration"
            type="number"
            min="1"
            max="525600"
            step="1"
            value={draft.estimatedDurationMinutes}
            onChange={(input) =>
              update("estimatedDurationMinutes", input.target.value)
            }
          />
        </div>

        <div className="field">
          <label htmlFor="task-start">Geplanter Beginn</label>
          <input
            id="task-start"
            type="datetime-local"
            value={draft.scheduledStart}
            onChange={(input) => update("scheduledStart", input.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="task-timezone">Zeitzone</label>
          <input id="task-timezone" value={timezone} readOnly />
        </div>

        <div className="field">
          <label htmlFor="task-area">Bereich</label>
          <select
            id="task-area"
            value={draft.area}
            onChange={(input) => update("area", input.target.value as TaskArea)}
          >
            {areaValues.map((area) => (
              <option key={area} value={area}>
                {taskAreaLabels[area]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="task-parent">Elternaufgabe</label>
          <select
            id="task-parent"
            value={draft.parentTaskId}
            onChange={(input) => update("parentTaskId", input.target.value)}
          >
            <option value="">Keine Elternaufgabe</option>
            {possibleParents.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title}
              </option>
            ))}
          </select>
        </div>

        <div className="field full-field">
          <label htmlFor="task-tags">Tags</label>
          <input
            id="task-tags"
            value={draft.tags}
            onChange={(input) => update("tags", input.target.value)}
            placeholder="z. B. roadmap, wichtig"
            maxLength={1000}
          />
          <small>Mehrere Tags durch Kommas trennen.</small>
        </div>

        <div className="field full-field">
          <label htmlFor="task-description">Beschreibung</label>
          <textarea
            id="task-description"
            rows={5}
            value={draft.description}
            onChange={(input) => update("description", input.target.value)}
            maxLength={20_000}
          />
        </div>

        {validationError ? (
          <p role="alert" className="form-error full-field">
            {validationError}
          </p>
        ) : null}

        {task ? (
          <TaskEventLinkPanel
            target={{ kind: "task", taskId: task.id }}
            links={links}
            tasks={tasks}
            events={events}
            selectedCalendarId={selectedCalendarId}
            pending={pending}
            onLink={onLink}
            onUnlink={onUnlink}
          />
        ) : null}

        {task ? (
          <div className="task-danger-zone full-field">
            <button
              type="button"
              className="secondary-button"
              disabled={pending}
              onClick={() => void changeArchiveState()}
            >
              <ArchiveIcon />
              {task.archivedAt ? "Aus Archiv holen" : "Archivieren"}
            </button>
            {deleteConfirmation ? (
              <div className="delete-confirmation" role="alert">
                <span>Aufgabe wirklich löschen?</span>
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
                  onClick={() => void deleteTask()}
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
          <button className="primary-button" disabled={pending}>
            {pending
              ? "Wird gespeichert …"
              : task
                ? "Änderungen speichern"
                : "Aufgabe anlegen"}
          </button>
        </div>
      </form>
    </section>
  );
};
