import type {
  CreateWorkContextRequest,
  CreateWorkProjectRequest,
  CreateWorkTaskLinkRequest,
  CreateWorkTimeEntryRequest,
  TaskResponse,
  UpdateWorkContextRequest,
  UpdateWorkProjectRequest,
  UpdateWorkTimeEntryRequest,
  WorkAuditResponse,
  WorkContextResponse,
  WorkOverviewResponse,
  WorkStatus,
} from "@lifeos/contracts";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { dateTimeInputToIso } from "../date";
import { ArchiveIcon, PlusIcon, TrashIcon, WorkIcon } from "./Icons";

const statuses: { value: WorkStatus; label: string }[] = [
  { value: "planned", label: "Geplant" },
  { value: "active", label: "Aktiv" },
  { value: "completed", label: "Abgeschlossen" },
  { value: "paused", label: "Pausiert" },
  { value: "cancelled", label: "Abgebrochen" },
];
const field = (data: FormData, name: string) => {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
};
const auditLabels: Record<WorkAuditResponse["action"], string> = {
  "work.context.created": "Arbeitsbereich angelegt",
  "work.context.updated": "Arbeitsbereich aktualisiert",
  "work.project.created": "Arbeitsprojekt angelegt",
  "work.project.updated": "Arbeitsprojekt aktualisiert",
  "work.task-linked": "Aufgabe zugeordnet",
  "work.task-unlinked": "Aufgabenzuordnung entfernt",
  "work.time.created": "Zeit erfasst",
  "work.time.updated": "Zeiterfassung aktualisiert",
};

interface Props {
  overview: WorkOverviewResponse | null;
  tasks: TaskResponse[];
  timezone: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  success: string | null;
  onReload: () => void;
  onCreateContext: (value: CreateWorkContextRequest) => Promise<void>;
  onUpdateContext: (
    id: string,
    value: UpdateWorkContextRequest,
  ) => Promise<void>;
  onCreateProject: (value: CreateWorkProjectRequest) => Promise<void>;
  onUpdateProject: (
    id: string,
    value: UpdateWorkProjectRequest,
  ) => Promise<void>;
  onCreateTaskLink: (value: CreateWorkTaskLinkRequest) => Promise<void>;
  onDeleteTaskLink: (id: string) => Promise<void>;
  onCreateTimeEntry: (value: CreateWorkTimeEntryRequest) => Promise<void>;
  onUpdateTimeEntry: (
    id: string,
    value: UpdateWorkTimeEntryRequest,
  ) => Promise<void>;
}

export const WorkWorkspace = (props: Props) => {
  const [form, setForm] = useState<
    "context" | "project" | "task" | "time" | null
  >(null);
  const [contextFilter, setContextFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<WorkStatus | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const contexts =
    props.overview?.contexts.filter((item) => !item.archivedAt) ?? [];
  const projects = useMemo(
    () =>
      (props.overview?.projects ?? []).filter(
        (item) =>
          !item.archivedAt &&
          (contextFilter === "all" || item.contextId === contextFilter) &&
          (statusFilter === "all" || item.status === statusFilter) &&
          (!from || !item.deadlineDate || item.deadlineDate >= from) &&
          (!to || !item.deadlineDate || item.deadlineDate <= to),
      ),
    [contextFilter, from, props.overview?.projects, statusFilter, to],
  );
  const timeEntries = useMemo(
    () =>
      (props.overview?.timeEntries ?? []).filter(
        (item) =>
          !item.archivedAt &&
          (contextFilter === "all" || item.contextId === contextFilter) &&
          (!from || item.endsAt.slice(0, 10) >= from) &&
          (!to || item.startsAt.slice(0, 10) <= to),
      ),
    [contextFilter, from, props.overview?.timeEntries, to],
  );
  const workTasks = props.tasks.filter(
    (task) => task.area === "work" && !task.archivedAt,
  );
  const totals = timeEntries.reduce(
    (sum, item) => ({
      ...sum,
      [item.kind]: sum[item.kind] + item.durationMinutes,
    }),
    { planned: 0, actual: 0 },
  );
  const close = () => setForm(null);
  return (
    <main className="page-content study-page work-page">
      <header className="workspace-heading">
        <div>
          <p className="eyebrow">Arbeit und Praxis</p>
          <h1>Berufliche Bereiche persönlich planen</h1>
          <p>
            Kontexte, Projekte, Aufgaben, Ziele, Fristen sowie geplante und
            tatsächliche Zeit bleiben lokal getrennt nachvollziehbar.
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
          <button className="primary-button" onClick={() => setForm("context")}>
            <PlusIcon /> Arbeitsbereich
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
      {props.loading ? (
        <div className="empty-state" role="status">
          Arbeitsdaten werden geladen …
        </div>
      ) : null}
      {form === "context" ? (
        <ContextForm
          timezone={props.timezone}
          saving={props.saving}
          onCancel={close}
          onSave={async (value) => {
            await props.onCreateContext(value);
            close();
          }}
        />
      ) : null}
      {form === "project" ? (
        <ProjectForm
          contexts={contexts}
          saving={props.saving}
          onCancel={close}
          onSave={async (value) => {
            await props.onCreateProject(value);
            close();
          }}
        />
      ) : null}
      {form === "task" ? (
        <TaskLinkForm
          contexts={contexts}
          tasks={workTasks}
          saving={props.saving}
          onCancel={close}
          onSave={async (value) => {
            await props.onCreateTaskLink(value);
            close();
          }}
        />
      ) : null}
      {form === "time" ? (
        <TimeForm
          contexts={contexts}
          tasks={workTasks}
          timezone={props.timezone}
          saving={props.saving}
          onCancel={close}
          onSave={async (value) => {
            await props.onCreateTimeEntry(value);
            close();
          }}
        />
      ) : null}
      {!props.loading && contexts.length === 0 ? (
        <section className="empty-state">
          <WorkIcon />
          <h2>Noch kein Arbeitsbereich</h2>
          <p>
            Lege einen beruflichen Kontext oder Praxisabschnitt ohne
            vertrauliche Unternehmensdaten an.
          </p>
          <button className="primary-button" onClick={() => setForm("context")}>
            Arbeitsbereich anlegen
          </button>
        </section>
      ) : (
        <>
          <section
            className="work-filters panel"
            aria-label="Arbeitsdaten filtern"
          >
            <label>
              Arbeitsbereich
              <select
                value={contextFilter}
                onChange={(event) => setContextFilter(event.target.value)}
              >
                <option value="all">Alle Bereiche</option>
                {contexts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as WorkStatus | "all")
                }
              >
                <option value="all">Alle Status</option>
                {statuses.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Von
              <input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label>
              Bis
              <input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
          </section>
          <div className="work-time-summary" aria-label="Zeitsummen">
            <span>
              Geplant <strong>{formatMinutes(totals.planned)}</strong>
            </span>
            <span>
              Tatsächlich <strong>{formatMinutes(totals.actual)}</strong>
            </span>
          </div>
          <div className="study-grid">
            <WorkSection
              title="Arbeitsbereiche"
              action="Bereich hinzufügen"
              onAction={() => setForm("context")}
            >
              {contexts.map((context) => (
                <WorkCard
                  key={context.id}
                  title={context.title}
                  subtitle={`${context.role}${context.organization ? ` · ${context.organization}` : ""}`}
                >
                  <RecordActions
                    status={context.status}
                    saving={props.saving}
                    onStatus={(status) =>
                      props.onUpdateContext(context.id, { status })
                    }
                    onArchive={() =>
                      props.onUpdateContext(context.id, { archived: true })
                    }
                  />
                </WorkCard>
              ))}
            </WorkSection>
            <WorkSection
              title="Projekte, Ziele und Fristen"
              action="Projekt hinzufügen"
              onAction={() => setForm("project")}
              disabled={!contexts.length}
            >
              {projects.length ? (
                projects.map((project) => (
                  <WorkCard
                    key={project.id}
                    title={project.title}
                    subtitle={
                      [
                        project.goal,
                        project.deadlineDate
                          ? `Frist ${project.deadlineDate}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Ohne Ziel oder Frist"
                    }
                  >
                    <RecordActions
                      status={project.status}
                      saving={props.saving}
                      onStatus={(status) =>
                        props.onUpdateProject(project.id, { status })
                      }
                      onArchive={() =>
                        props.onUpdateProject(project.id, { archived: true })
                      }
                    />
                  </WorkCard>
                ))
              ) : (
                <p className="muted-copy">
                  Keine Projekte im gewählten Filter.
                </p>
              )}
            </WorkSection>
            <WorkSection
              title="Arbeitsaufgaben"
              action="Aufgabe zuordnen"
              onAction={() => setForm("task")}
              disabled={!contexts.length || !workTasks.length}
            >
              {(props.overview?.taskLinks ?? [])
                .filter(
                  (link) =>
                    contextFilter === "all" || link.contextId === contextFilter,
                )
                .map((link) => (
                  <WorkCard
                    key={link.id}
                    title={
                      props.tasks.find((task) => task.id === link.taskId)
                        ?.title ?? "Nicht verfügbare Aufgabe"
                    }
                    subtitle={
                      link.projectId
                        ? (projects.find(
                            (project) => project.id === link.projectId,
                          )?.title ?? "Arbeitsprojekt")
                        : "Direkt dem Arbeitsbereich zugeordnet"
                    }
                  >
                    <button
                      className="icon-button"
                      aria-label="Aufgabenzuordnung entfernen"
                      disabled={props.saving}
                      onClick={() => void props.onDeleteTaskLink(link.id)}
                    >
                      <TrashIcon />
                    </button>
                  </WorkCard>
                ))}
              {!workTasks.length ? (
                <p className="muted-copy">
                  Lege zuerst im bestehenden Aufgabenmodul eine Aufgabe im
                  Bereich Arbeit an.
                </p>
              ) : null}
            </WorkSection>
            <WorkSection
              title="Geplante und tatsächliche Zeit"
              action="Zeit erfassen"
              onAction={() => setForm("time")}
              disabled={!contexts.length}
            >
              {timeEntries.length ? (
                timeEntries.map((item) => (
                  <WorkCard
                    key={item.id}
                    title={item.title}
                    subtitle={`${item.kind === "planned" ? "Geplant" : "Tatsächlich"} · ${formatMinutes(item.durationMinutes)} · ${new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: item.timezone }).format(new Date(item.startsAt))}`}
                  >
                    <button
                      className="icon-button"
                      aria-label="Zeiteintrag archivieren"
                      disabled={props.saving}
                      onClick={() =>
                        void props.onUpdateTimeEntry(item.id, {
                          archived: true,
                        })
                      }
                    >
                      <ArchiveIcon />
                    </button>
                  </WorkCard>
                ))
              ) : (
                <p className="muted-copy">
                  Keine Zeitwerte im gewählten Zeitraum.
                </p>
              )}
            </WorkSection>
          </div>
        </>
      )}
      <section className="study-history">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ÄNDERUNGSVERLAUF</p>
            <h2>Letzte Änderungen</h2>
          </div>
          <span>ohne persönliche Werte</span>
        </div>
        {props.overview?.history.length ? (
          <ol className="study-history-list">
            {props.overview.history.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{auditLabels[item.action]}</strong>
                  <small>
                    {new Intl.DateTimeFormat("de-DE", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: props.timezone,
                    }).format(new Date(item.occurredAt))}
                  </small>
                </div>
                <span>
                  {item.changedFields.length
                    ? `${item.changedFields.length} Feld(er) geändert`
                    : "Anlage oder Zuordnung"}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted-copy">Noch keine Änderungen protokolliert.</p>
        )}
        <p className="privacy-note">
          Notizen, Organisationen, Ziele und Zeitwerte werden nicht in
          Audit-Metadaten übernommen.
        </p>
      </section>
    </main>
  );
};

const formatMinutes = (minutes: number) =>
  `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
const WorkSection = ({
  title,
  action,
  onAction,
  disabled,
  children,
}: {
  title: string;
  action: string;
  onAction: () => void;
  disabled?: boolean;
  children: ReactNode;
}) => (
  <section className="study-section">
    <header>
      <h2>{title}</h2>
      <button className="text-button" onClick={onAction} disabled={disabled}>
        <PlusIcon /> {action}
      </button>
    </header>
    <div className="study-list">{children}</div>
  </section>
);
const WorkCard = ({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) => (
  <article className="study-card">
    <div>
      <h3>{title}</h3>
      <p>{subtitle}</p>
    </div>
    {children}
  </article>
);
const RecordActions = ({
  status,
  saving,
  onStatus,
  onArchive,
}: {
  status: WorkStatus;
  saving: boolean;
  onStatus: (status: WorkStatus) => Promise<void>;
  onArchive: () => Promise<void>;
}) => (
  <div className="record-actions">
    <select
      aria-label="Status"
      value={status}
      disabled={saving}
      onChange={(event) => void onStatus(event.target.value as WorkStatus)}
    >
      {statuses.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
    <button
      className="icon-button"
      aria-label="Archivieren"
      disabled={saving}
      onClick={() => void onArchive()}
    >
      <ArchiveIcon />
    </button>
  </div>
);
const FormShell = ({
  title,
  saving,
  onCancel,
  onSubmit,
  children,
}: {
  title: string;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) => (
  <form className="study-form panel" onSubmit={onSubmit}>
    <h2>{title}</h2>
    <div className="study-form-grid">{children}</div>
    <div className="form-actions">
      <button type="button" className="secondary-button" onClick={onCancel}>
        Abbrechen
      </button>
      <button className="primary-button" disabled={saving}>
        {saving ? "Speichert …" : "Speichern"}
      </button>
    </div>
  </form>
);

const ContextForm = ({
  timezone,
  saving,
  onCancel,
  onSave,
}: {
  timezone: string;
  saving: boolean;
  onCancel: () => void;
  onSave: (value: CreateWorkContextRequest) => Promise<void>;
}) => (
  <FormShell
    title="Arbeitsbereich anlegen"
    saving={saving}
    onCancel={onCancel}
    onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      void onSave({
        title: field(data, "title"),
        role: field(data, "role"),
        organization: field(data, "organization") || null,
        startsOn: field(data, "startsOn") || null,
        endsOn: field(data, "endsOn") || null,
        timezone,
        status: "active",
        notes: field(data, "notes") || null,
      });
    }}
  >
    <label>
      Arbeitsbereich
      <input name="title" required maxLength={500} />
    </label>
    <label>
      Position oder Rolle
      <input name="role" required maxLength={500} />
    </label>
    <label>
      Organisation (optional)
      <input name="organization" maxLength={500} autoComplete="off" />
    </label>
    <label>
      Zeitzone
      <input value={timezone} readOnly />
    </label>
    <label>
      Beginn
      <input name="startsOn" type="date" />
    </label>
    <label>
      Ende
      <input name="endsOn" type="date" />
    </label>
    <label className="wide">
      Notizen
      <textarea name="notes" maxLength={20000} />
    </label>
  </FormShell>
);

const ProjectForm = ({
  contexts,
  saving,
  onCancel,
  onSave,
}: {
  contexts: WorkContextResponse[];
  saving: boolean;
  onCancel: () => void;
  onSave: (value: CreateWorkProjectRequest) => Promise<void>;
}) => (
  <FormShell
    title="Berufliches Projekt anlegen"
    saving={saving}
    onCancel={onCancel}
    onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      void onSave({
        contextId: field(data, "contextId"),
        title: field(data, "title"),
        goal: field(data, "goal") || null,
        deadlineDate: field(data, "deadlineDate") || null,
        status: "planned",
        notes: field(data, "notes") || null,
      });
    }}
  >
    <label>
      Arbeitsbereich
      <select name="contextId" required>
        {contexts.map((item) => (
          <option key={item.id} value={item.id}>
            {item.title}
          </option>
        ))}
      </select>
    </label>
    <label>
      Projekt oder Praxisbereich
      <input name="title" required maxLength={500} />
    </label>
    <label>
      Ziel
      <textarea name="goal" maxLength={20000} />
    </label>
    <label>
      Frist
      <input name="deadlineDate" type="date" />
    </label>
    <label className="wide">
      Notizen
      <textarea name="notes" maxLength={20000} />
    </label>
  </FormShell>
);

const TaskLinkForm = ({
  contexts,
  tasks,
  saving,
  onCancel,
  onSave,
}: {
  contexts: WorkContextResponse[];
  tasks: TaskResponse[];
  saving: boolean;
  onCancel: () => void;
  onSave: (value: CreateWorkTaskLinkRequest) => Promise<void>;
}) => (
  <FormShell
    title="Bestehende Arbeitsaufgabe zuordnen"
    saving={saving}
    onCancel={onCancel}
    onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      void onSave({
        contextId: field(data, "contextId"),
        taskId: field(data, "taskId"),
      });
    }}
  >
    <label>
      Arbeitsbereich
      <select name="contextId" required>
        {contexts.map((item) => (
          <option key={item.id} value={item.id}>
            {item.title}
          </option>
        ))}
      </select>
    </label>
    <label>
      Aufgabe
      <select name="taskId" required>
        {tasks.map((item) => (
          <option key={item.id} value={item.id}>
            {item.title}
          </option>
        ))}
      </select>
    </label>
    <p className="field-hint wide">
      Die Aufgabe bleibt im bestehenden Aufgabenmodul; hier wird nur die
      Zuordnung gespeichert.
    </p>
  </FormShell>
);

const TimeForm = ({
  contexts,
  tasks,
  timezone,
  saving,
  onCancel,
  onSave,
}: {
  contexts: WorkContextResponse[];
  tasks: TaskResponse[];
  timezone: string;
  saving: boolean;
  onCancel: () => void;
  onSave: (value: CreateWorkTimeEntryRequest) => Promise<void>;
}) => (
  <FormShell
    title="Arbeitszeit erfassen"
    saving={saving}
    onCancel={onCancel}
    onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      void onSave({
        contextId: field(data, "contextId"),
        taskId: field(data, "taskId") || null,
        kind: field(data, "kind") as CreateWorkTimeEntryRequest["kind"],
        title: field(data, "title"),
        startsAt: dateTimeInputToIso(field(data, "startsAt"), timezone),
        endsAt: dateTimeInputToIso(field(data, "endsAt"), timezone),
        timezone,
        notes: field(data, "notes") || null,
      });
    }}
  >
    <label>
      Arbeitsbereich
      <select name="contextId" required>
        {contexts.map((item) => (
          <option key={item.id} value={item.id}>
            {item.title}
          </option>
        ))}
      </select>
    </label>
    <label>
      Art
      <select name="kind" required>
        <option value="planned">Geplante Zeit</option>
        <option value="actual">Tatsächliche Zeit</option>
      </select>
    </label>
    <label>
      Bezeichnung
      <input name="title" required maxLength={500} />
    </label>
    <label>
      Aufgabe (optional)
      <select name="taskId">
        <option value="">Keine Aufgabe</option>
        {tasks.map((item) => (
          <option key={item.id} value={item.id}>
            {item.title}
          </option>
        ))}
      </select>
    </label>
    <label>
      Beginn
      <input name="startsAt" type="datetime-local" required />
    </label>
    <label>
      Ende
      <input name="endsAt" type="datetime-local" required />
    </label>
    <p className="field-hint wide">
      Die Dauer wird in Minuten aus Beginn und Ende berechnet. Darstellung in{" "}
      {timezone}.
    </p>
    <label className="wide">
      Notizen
      <textarea name="notes" maxLength={20000} />
    </label>
  </FormShell>
);
