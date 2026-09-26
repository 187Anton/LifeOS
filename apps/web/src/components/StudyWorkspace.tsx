import type {
  CreateStudyEntryRequest,
  CreateStudyModuleRequest,
  CreateStudyProgramRequest,
  DocumentResponse,
  NoteResponse,
  StudyAuditResponse,
  StudyEntryKind,
  StudyEntryResponse,
  StudyModuleResponse,
  StudyOverviewResponse,
  StudyProgramResponse,
  StudyStatus,
  TaskResponse,
  UpdateStudyEntryRequest,
  UpdateStudyModuleRequest,
  UpdateStudyProgramRequest,
} from "@lifeos/contracts";
import {
  useState,
  type FormEvent,
  type FormEventHandler,
  type ReactNode,
} from "react";
import { dateTimeInputToIso, toDateTimeInput } from "../date";
import { ArchiveIcon, PlusIcon, StudyIcon } from "./Icons";
import { StudyModuleDetail } from "./StudyModuleDetail";

/** Gemeinsame Statusschreibweise der Studienformulare dieser Ansicht. */
const studyStatusLabels: Record<StudyStatus, string> = {
  planned: "Geplant",
  active: "Aktiv",
  completed: "Abgeschlossen",
  paused: "Pausiert",
  cancelled: "Abgebrochen",
};
const studyStatuses: { value: StudyStatus; label: string }[] = (
  ["planned", "active", "completed", "paused", "cancelled"] as StudyStatus[]
).map((value) => ({ value, label: studyStatusLabels[value] }));
const studyEntryKindLabels: Record<StudyEntryKind, string> = {
  lecture: "Lehrveranstaltung",
  exam: "Prüfung",
  submission: "Abgabefrist",
  learning: "Lernzeit",
};

const field = (data: FormData, name: string) => {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
};

const auditActionLabels: Record<StudyAuditResponse["action"], string> = {
  "study.program.created": "Studienabschnitt angelegt",
  "study.program.updated": "Studienabschnitt aktualisiert",
  "study.module.created": "Modul angelegt",
  "study.module.updated": "Modul aktualisiert",
  "study.entry.created": "Studieneintrag angelegt",
  "study.entry.updated": "Studieneintrag aktualisiert",
};
const auditFieldLabels: Record<string, string> = {
  title: "Bezeichnung",
  institution: "Einrichtung",
  periodLabel: "Studienabschnitt",
  status: "Status",
  notes: "Notizen",
  archivedAt: "Archivierung",
  programId: "Studienabschnitt",
  code: "Kürzel",
  credits: "Leistungspunkte",
  grade: "Note",
  documentReferences: "Dokumentverweise",
  moduleId: "Modul",
  kind: "Art",
  dueDate: "Fristdatum",
  startsAt: "Beginn",
  endsAt: "Ende",
  timezone: "Zeitzone",
  taskId: "Aufgabenbezug",
  calendarEventId: "Kalenderbezug",
};

/** Einheitliche Datumsangabe eines Studieneintrags in seiner Zeitzone. */
const entryDateLabel = (entry: StudyEntryResponse, timezone: string) => {
  if (entry.dueDate) return entry.dueDate;
  if (!entry.startsAt) return "ohne Datum";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: entry.timezone ?? timezone,
  }).format(new Date(entry.startsAt));
};

interface Props {
  overview: StudyOverviewResponse | null;
  timezone: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  success: string | null;
  /** Gewähltes Modul der Detailansicht; `null` zeigt die Studienübersicht. */
  selectedModuleId: string | null;
  /** Aus der Suche hervorgehobener Studieneintrag im gewählten Modul. */
  selectedEntryId: string | null;
  /** Alle geladenen Aufgaben für die Modulzuordnung. */
  tasks: TaskResponse[];
  /** Alle geladenen Notizen und Dokumente der gemeinsamen Ablage. */
  notes: NoteResponse[];
  documents: DocumentResponse[];
  onReload: () => void;
  /** Öffnet ein Modul in der Detailansicht der Studienansicht. */
  onSelectModule: (moduleId: string) => void;
  /** Kehrt zur separaten Studienübersicht zurück. */
  onClearModuleSelection: () => void;
  onCreateProgram: (value: CreateStudyProgramRequest) => Promise<void>;
  onCreateModule: (value: CreateStudyModuleRequest) => Promise<void>;
  onCreateEntry: (value: CreateStudyEntryRequest) => Promise<void>;
  onUpdateProgram: (
    id: string,
    value: UpdateStudyProgramRequest,
  ) => Promise<void>;
  onUpdateModule: (
    id: string,
    value: UpdateStudyModuleRequest,
  ) => Promise<void>;
  onUpdateEntry: (id: string, value: UpdateStudyEntryRequest) => Promise<void>;
  /** Öffnet den gemeinsamen Aufgabeneditor mit vorausgewähltem Modul. */
  onCreateTaskForModule: (moduleId: string) => void;
  /** Öffnet eine bestehende Aufgabe im gemeinsamen Aufgabeneditor. */
  onOpenTask: (taskId: string) => void;
  /** Öffnet eine Notiz in der Wissensansicht. */
  onOpenNote: (noteId: string) => void;
  /** Öffnet ein Dokument in der Wissensansicht. */
  onOpenDocument: (documentId: string) => void;
}

/**
 * Angeforderte Formularbearbeitung. Bestehende Objekte werden ausschließlich
 * über die bestehenden Studienformulare geändert; es entsteht kein zweiter
 * Schreibpfad.
 */
type StudyForm =
  | { target: "program" }
  | { target: "module"; record: StudyModuleResponse | null }
  | {
      target: "entry";
      record: StudyEntryResponse | null;
      moduleId: string | null;
    };

export const StudyWorkspace = ({
  overview,
  timezone,
  loading,
  saving,
  error,
  success,
  selectedModuleId,
  selectedEntryId,
  tasks,
  notes,
  documents,
  onReload,
  onSelectModule,
  onClearModuleSelection,
  onCreateProgram,
  onCreateModule,
  onCreateEntry,
  onUpdateProgram,
  onUpdateModule,
  onUpdateEntry,
  onCreateTaskForModule,
  onOpenTask,
  onOpenNote,
  onOpenDocument,
}: Props) => {
  const [form, setForm] = useState<StudyForm | null>(null);
  const programs =
    overview?.programs.filter((value) => !value.archivedAt) ?? [];
  const modules = overview?.modules.filter((value) => !value.archivedAt) ?? [];
  const entries = overview?.entries.filter((value) => !value.archivedAt) ?? [];
  const allPrograms = overview?.programs ?? [];
  const allModules = overview?.modules ?? [];
  const allEntries = overview?.entries ?? [];

  const messages = (
    <>
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
    </>
  );

  const selectedModule = selectedModuleId
    ? (allModules.find((module) => module.id === selectedModuleId) ?? null)
    : null;

  /**
   * Ein Suchziel, das nicht mehr auffindbar ist, öffnet ausdrücklich kein
   * anderes Modul, sondern einen klaren Fehlerzustand.
   */
  if (selectedModuleId && !selectedModule && !loading && overview) {
    return (
      <main className="page-content study-page">
        <header className="workspace-heading">
          <div>
            <p className="eyebrow">Studium</p>
            <h1>Modul nicht mehr verfügbar</h1>
            <p>
              Die Auswahl bleibt bestehen, bis die Studiendaten neu geladen oder
              die Übersicht geöffnet wurde.
            </p>
          </div>
        </header>
        {messages}
        <section className="empty-state" role="alert">
          <StudyIcon />
          <h2>Das gewählte Modul ist nicht mehr auffindbar</h2>
          <p>
            Es wurde bewusst kein anderes Modul geöffnet. Möglicherweise wurde
            das Modul inzwischen gelöscht oder ist nicht mehr freigegeben.
          </p>
          <div className="form-actions">
            <button className="primary-button" onClick={onClearModuleSelection}>
              Zur Übersicht
            </button>
            <button
              className="secondary-button"
              onClick={onReload}
              disabled={loading}
            >
              Neu laden
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (selectedModule) {
    return (
      <>
        <StudyModuleDetail
          module={selectedModule}
          program={
            allPrograms.find(
              (program) => program.id === selectedModule.programId,
            ) ?? null
          }
          entries={allEntries}
          tasks={tasks}
          notes={notes}
          documents={documents}
          highlightedEntryId={selectedEntryId}
          timezone={timezone}
          saving={saving}
          error={error}
          success={success}
          formPanel={
            form?.target === "module" ? (
              <ModuleForm
                programs={allPrograms}
                record={form.record}
                saving={saving}
                onCancel={() => setForm(null)}
                onCreate={async (value) => {
                  await onCreateModule(value);
                  setForm(null);
                }}
                onUpdate={async (value) => {
                  const id = form.record?.id;
                  if (!id) return;
                  await onUpdateModule(id, value);
                  setForm(null);
                }}
              />
            ) : form?.target === "entry" ? (
              <EntryForm
                modules={allModules}
                timezone={timezone}
                record={form.record}
                defaultModuleId={form.moduleId}
                saving={saving}
                onCancel={() => setForm(null)}
                onCreate={async (value) => {
                  await onCreateEntry(value);
                  setForm(null);
                }}
                onUpdate={async (value) => {
                  const id = form.record?.id;
                  if (!id) return;
                  await onUpdateEntry(id, value);
                  setForm(null);
                }}
              />
            ) : null
          }
          onBack={onClearModuleSelection}
          onEditModule={() =>
            setForm({ target: "module", record: selectedModule })
          }
          onCreateEntry={() =>
            setForm({
              target: "entry",
              record: null,
              moduleId: selectedModule.id,
            })
          }
          onEditEntry={(entryId) => {
            const record =
              allEntries.find((entry) => entry.id === entryId) ?? null;
            if (record)
              setForm({ target: "entry", record, moduleId: record.moduleId });
          }}
          onCreateTask={() => onCreateTaskForModule(selectedModule.id)}
          onEditTask={onOpenTask}
          onOpenNote={onOpenNote}
          onOpenDocument={onOpenDocument}
        />
      </>
    );
  }

  return (
    <main className="page-content study-page">
      <header className="workspace-heading">
        <div>
          <p className="eyebrow">Studium</p>
          <h1>Lernen nachvollziehbar planen</h1>
          <p>
            Abschnitte, Module, Lehrveranstaltungen, Prüfungen und Lernzeiten
            bleiben an einer Stelle.
          </p>
        </div>
        <div className="study-actions">
          <button
            className="secondary-button"
            onClick={onReload}
            disabled={loading}
          >
            Neu laden
          </button>
          <button
            className="primary-button"
            onClick={() => setForm({ target: "program" })}
          >
            <PlusIcon /> Studienabschnitt
          </button>
        </div>
      </header>
      {messages}
      {loading ? (
        <div className="empty-state" role="status">
          Studiendaten werden geladen …
        </div>
      ) : null}
      {form?.target === "program" ? (
        <ProgramForm
          saving={saving}
          onCancel={() => setForm(null)}
          onSave={async (value) => {
            await onCreateProgram(value);
            setForm(null);
          }}
        />
      ) : null}
      {form?.target === "module" ? (
        <ModuleForm
          programs={allPrograms}
          record={form.record}
          saving={saving}
          onCancel={() => setForm(null)}
          onCreate={async (value) => {
            await onCreateModule(value);
            setForm(null);
          }}
          onUpdate={async (value) => {
            const id = form.record?.id;
            if (!id) return;
            await onUpdateModule(id, value);
            setForm(null);
          }}
        />
      ) : null}
      {form?.target === "entry" ? (
        <EntryForm
          modules={allModules}
          timezone={timezone}
          record={form.record}
          defaultModuleId={form.moduleId}
          saving={saving}
          onCancel={() => setForm(null)}
          onCreate={async (value) => {
            await onCreateEntry(value);
            setForm(null);
          }}
          onUpdate={async (value) => {
            const id = form.record?.id;
            if (!id) return;
            await onUpdateEntry(id, value);
            setForm(null);
          }}
        />
      ) : null}
      {!loading && programs.length === 0 ? (
        <section className="empty-state">
          <StudyIcon />
          <h2>Noch kein Studienabschnitt</h2>
          <p>
            Lege zuerst deinen Studiengang oder Ausbildungsbereich samt
            aktuellem Abschnitt an.
          </p>
          <button
            className="primary-button"
            onClick={() => setForm({ target: "program" })}
          >
            Abschnitt anlegen
          </button>
        </section>
      ) : (
        <div className="study-grid">
          <StudySection
            title="Studienabschnitte"
            action="Abschnitt hinzufügen"
            onAction={() => setForm({ target: "program" })}
          >
            {programs.map((program) => (
              <StudyCard
                key={program.id}
                title={program.title}
                subtitle={`${program.institution} · ${program.periodLabel}`}
              >
                <RecordActions
                  status={program.status}
                  saving={saving}
                  onStatus={(status) => onUpdateProgram(program.id, { status })}
                  onArchive={() =>
                    onUpdateProgram(program.id, { archived: true })
                  }
                />
              </StudyCard>
            ))}
          </StudySection>
          <StudySection
            title="Module und Kurse"
            action="Modul hinzufügen"
            onAction={() => setForm({ target: "module", record: null })}
            disabled={!programs.length}
          >
            {modules.length ? (
              modules.map((module) => (
                <StudyCard
                  key={module.id}
                  title={module.title}
                  subtitle={
                    [
                      module.code,
                      module.credits === null ? null : `${module.credits} LP`,
                      module.grade ? `Note ${module.grade}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Ohne Zusatzangaben"
                  }
                >
                  <RecordActions
                    status={module.status}
                    saving={saving}
                    onStatus={(status) => onUpdateModule(module.id, { status })}
                    onArchive={() =>
                      onUpdateModule(module.id, { archived: true })
                    }
                  />
                  <button
                    className="text-button"
                    disabled={saving}
                    onClick={() => {
                      setForm(null);
                      onSelectModule(module.id);
                    }}
                  >
                    Moduldetails öffnen
                  </button>
                  <button
                    className="text-button"
                    disabled={saving}
                    onClick={() =>
                      void onUpdateModule(module.id, {
                        searchEnabled: !module.searchEnabled,
                      })
                    }
                  >
                    {module.searchEnabled
                      ? "Suchfreigabe aufheben"
                      : "Für lokale Suche freigeben"}
                  </button>
                  <button
                    className="text-button"
                    disabled={saving}
                    onClick={() => onCreateTaskForModule(module.id)}
                  >
                    <PlusIcon /> Aufgabe anlegen
                  </button>
                </StudyCard>
              ))
            ) : (
              <p className="muted-copy">Noch keine Module angelegt.</p>
            )}
          </StudySection>
          <StudySection
            title="Termine, Fristen und Lernzeiten"
            action="Eintrag hinzufügen"
            onAction={() =>
              setForm({ target: "entry", record: null, moduleId: null })
            }
            disabled={!modules.length}
          >
            {entries.length ? (
              entries.map((entry) => (
                <StudyCard
                  key={entry.id}
                  title={entry.title}
                  subtitle={`${studyEntryKindLabels[entry.kind]} · ${entryDateLabel(entry, timezone)}`}
                >
                  <RecordActions
                    status={entry.status}
                    saving={saving}
                    onStatus={(status) => onUpdateEntry(entry.id, { status })}
                    onArchive={() =>
                      onUpdateEntry(entry.id, { archived: true })
                    }
                  />
                </StudyCard>
              ))
            ) : (
              <p className="muted-copy">Noch keine Studienplanung vorhanden.</p>
            )}
          </StudySection>
        </div>
      )}
      <section className="study-history" aria-labelledby="study-history-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ÄNDERUNGSVERLAUF</p>
            <h2 id="study-history-title">Letzte Änderungen</h2>
          </div>
          <span>maximal 50 Einträge</span>
        </div>
        {overview?.history?.length ? (
          <ol className="study-history-list">
            {overview.history.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{auditActionLabels[item.action]}</strong>
                  <small>
                    {new Intl.DateTimeFormat("de-DE", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: timezone,
                    }).format(new Date(item.occurredAt))}
                  </small>
                </div>
                <span>
                  {item.changedFields.length
                    ? item.changedFields
                        .map(
                          (fieldName) => auditFieldLabels[fieldName] ?? "Feld",
                        )
                        .join(", ")
                    : "Anlage ohne Inhaltsprotokoll"}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted-copy">Noch keine Änderungen protokolliert.</p>
        )}
        <p className="privacy-note">
          Der Verlauf zeigt nur Aktion und geänderte Feldnamen. Notizen, Noten
          und andere persönliche Werte werden nicht in Audit-Metadaten
          übernommen.
        </p>
      </section>
    </main>
  );
};

const StudySection = ({
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
const StudyCard = ({
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
  status: StudyStatus;
  saving: boolean;
  onStatus: (status: StudyStatus) => Promise<void>;
  onArchive: () => Promise<void>;
}) => (
  <div className="record-actions">
    <select
      aria-label="Status"
      value={status}
      disabled={saving}
      onChange={(event) => void onStatus(event.target.value as StudyStatus)}
    >
      {studyStatuses.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
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
  onSubmit: FormEventHandler<HTMLFormElement>;
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

const ProgramForm = ({
  saving,
  onCancel,
  onSave,
}: {
  saving: boolean;
  onCancel: () => void;
  onSave: (value: CreateStudyProgramRequest) => Promise<void>;
}) => (
  <FormShell
    title="Studienabschnitt anlegen"
    saving={saving}
    onCancel={onCancel}
    onSubmit={(event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      void onSave({
        title: field(data, "title"),
        institution: field(data, "institution"),
        periodLabel: field(data, "periodLabel"),
        status: "active",
        notes: field(data, "notes") || null,
      });
    }}
  >
    <label>
      Studiengang oder Ausbildungsbereich
      <input name="title" required maxLength={500} />
    </label>
    <label>
      Hochschule oder Bildungseinrichtung
      <input name="institution" required maxLength={500} />
    </label>
    <label>
      Semester oder Studienabschnitt
      <input
        name="periodLabel"
        required
        maxLength={200}
        placeholder="z. B. Sommersemester 2026"
      />
    </label>
    <label className="wide">
      Notizen
      <textarea name="notes" maxLength={20000} />
    </label>
  </FormShell>
);

const ModuleForm = ({
  programs,
  record,
  saving,
  onCancel,
  onCreate,
  onUpdate,
}: {
  programs: StudyProgramResponse[];
  /** Bestehendes Modul; `null` legt ein neues Modul an. */
  record: StudyModuleResponse | null;
  saving: boolean;
  onCancel: () => void;
  onCreate: (value: CreateStudyModuleRequest) => Promise<void>;
  onUpdate: (value: UpdateStudyModuleRequest) => Promise<void>;
}) => {
  /**
   * Ein archivierter oder nicht mehr vorhandener Abschnitt bleibt sichtbar,
   * damit ein bestehender Bezug nicht stillschweigend verschoben wird.
   */
  const selectablePrograms = record
    ? (() => {
        const active = programs.filter((program) => !program.archivedAt);
        const current =
          programs.find((program) => program.id === record.programId) ?? null;
        if (!current) return active;
        if (active.some((program) => program.id === current.id)) return active;
        return [...active, current];
      })()
    : programs.filter((program) => !program.archivedAt);
  return (
    <FormShell
      title={record ? "Modul bearbeiten" : "Modul oder Kurs anlegen"}
      saving={saving}
      onCancel={onCancel}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const credits = field(data, "credits");
        const references = field(data, "documentReferences")
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean);
        const base = {
          programId: field(data, "programId"),
          title: field(data, "title"),
          code: field(data, "code") || null,
          credits: credits ? Number(credits) : null,
          grade: field(data, "grade") || null,
          notes: field(data, "notes") || null,
          documentReferences: references,
          searchEnabled: data.get("searchEnabled") === "on",
        };
        if (record) {
          void onUpdate({
            ...base,
            status: field(data, "status") as StudyStatus,
          });
          return;
        }
        void onCreate({ ...base, status: "planned" });
      }}
    >
      <label>
        Studienabschnitt
        <select
          name="programId"
          required
          defaultValue={record?.programId ?? selectablePrograms[0]?.id ?? ""}
        >
          {selectablePrograms.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title} · {item.periodLabel}
              {item.archivedAt ? " (archiviert)" : ""}
            </option>
          ))}
          {record &&
          !programs.some((program) => program.id === record.programId) ? (
            <option value={record.programId}>
              Nicht mehr verfügbarer Studienabschnitt
            </option>
          ) : null}
        </select>
      </label>
      <label>
        Modul oder Kurs
        <input
          name="title"
          required
          maxLength={500}
          defaultValue={record?.title ?? ""}
        />
      </label>
      <label>
        Kürzel (optional)
        <input name="code" maxLength={100} defaultValue={record?.code ?? ""} />
      </label>
      <label>
        Leistungspunkte (optional)
        <input
          name="credits"
          type="number"
          min="0"
          max="9999"
          step="0.01"
          defaultValue={record?.credits ?? ""}
        />
      </label>
      <label>
        Note (optional)
        <input
          name="grade"
          maxLength={100}
          defaultValue={record?.grade ?? ""}
        />
      </label>
      {record ? (
        <label>
          Status
          <select name="status" defaultValue={record.status}>
            {studyStatuses.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="wide">
        Notizen
        <textarea
          name="notes"
          maxLength={20000}
          defaultValue={record?.notes ?? ""}
        />
      </label>
      <label className="wide checkbox-row">
        <input
          name="searchEnabled"
          type="checkbox"
          defaultChecked={record?.searchEnabled ?? false}
        />
        Modul und aktive Studieneinträge für die lokale Suche freigeben
      </label>
      <label className="wide">
        Dokumentverweise (einer pro Zeile)
        <textarea
          name="documentReferences"
          maxLength={20000}
          defaultValue={(record?.documentReferences ?? []).join("\n")}
        />
      </label>
    </FormShell>
  );
};

/** Ganztagsfrist ohne Zeitblock. */
const isAllDayEntry = (entry: StudyEntryResponse) =>
  Boolean(entry.dueDate) && !entry.startsAt;

const EntryForm = ({
  modules,
  timezone,
  record,
  defaultModuleId,
  saving,
  onCancel,
  onCreate,
  onUpdate,
}: {
  modules: StudyModuleResponse[];
  timezone: string;
  /** Bestehender Eintrag; `null` legt einen neuen Eintrag an. */
  record: StudyEntryResponse | null;
  /** Vorbelegtes Modul einer Neuanlage. */
  defaultModuleId: string | null;
  saving: boolean;
  onCancel: () => void;
  onCreate: (value: CreateStudyEntryRequest) => Promise<void>;
  onUpdate: (value: UpdateStudyEntryRequest) => Promise<void>;
}) => {
  const [kind, setKind] = useState<StudyEntryKind>(record?.kind ?? "exam");
  const [allDay, setAllDay] = useState<boolean>(() =>
    record ? isAllDayEntry(record) : true,
  );
  const allDayCapable = kind === "exam" || kind === "submission";
  const allDaySelected = allDayCapable && allDay;
  /**
   * Aktive Module bleiben wählbar; der bisherige Bezug eines Eintrags bleibt
   * sichtbar und unverändert, auch wenn sein Modul archiviert wurde.
   */
  const selectableModules = (() => {
    const active = modules.filter((module) => !module.archivedAt);
    if (!record) return active;
    const current =
      modules.find((module) => module.id === record.moduleId) ?? null;
    if (!current) return active;
    if (active.some((module) => module.id === current.id)) return active;
    return [...active, current];
  })();
  const changeKind = (next: StudyEntryKind) => {
    setKind(next);
    if (next === "exam" || next === "submission") setAllDay(true);
    else setAllDay(false);
  };
  /**
   * Zeitgebundene Angaben werden in genau einer Zeitzone gelesen und
   * geschrieben. Bei einem bestehenden Eintrag ist das seine gespeicherte
   * Zeitzone: die angezeigten Wandzeitwerte und der gespeicherte Zeitpunkt
   * bleiben dadurch ohne Zeitänderung identisch. Nur neue Einträge verwenden
   * die Profilzeitzone; ein Altwert ohne gespeicherte Zeitzone ebenfalls.
   */
  const scheduleTimezone = record?.timezone ?? timezone;
  return (
    <FormShell
      title={record ? "Studieneintrag bearbeiten" : "Studieneintrag anlegen"}
      saving={saving}
      onCancel={onCancel}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const moduleId = field(data, "moduleId");
        const title = field(data, "title");
        const notes = field(data, "notes") || null;
        if (record) {
          /**
           * Ein Wechsel der Zeitform entfernt die Werte der anderen Form
           * ausdrücklich; sonst bliebe ein widersprüchlicher Altwert bestehen.
           */
          const schedule = allDaySelected
            ? {
                dueDate: field(data, "dueDate"),
                startsAt: null,
                endsAt: null,
                timezone: null,
              }
            : {
                dueDate: null,
                startsAt: dateTimeInputToIso(
                  field(data, "startsAt"),
                  scheduleTimezone,
                ),
                endsAt: dateTimeInputToIso(
                  field(data, "endsAt"),
                  scheduleTimezone,
                ),
                timezone: scheduleTimezone,
              };
          void onUpdate({
            moduleId,
            kind,
            title,
            notes,
            status: field(data, "status") as StudyStatus,
            ...schedule,
          });
          return;
        }
        const create: CreateStudyEntryRequest = {
          moduleId,
          kind,
          title,
          status: "planned",
          notes,
        };
        if (allDaySelected) create.dueDate = field(data, "dueDate");
        else {
          create.startsAt = dateTimeInputToIso(
            field(data, "startsAt"),
            timezone,
          );
          create.endsAt = dateTimeInputToIso(field(data, "endsAt"), timezone);
          create.timezone = timezone;
        }
        void onCreate(create);
      }}
    >
      <label>
        Modul
        <select
          name="moduleId"
          required
          defaultValue={record?.moduleId ?? defaultModuleId ?? undefined}
        >
          {selectableModules.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
              {item.archivedAt ? " (archiviert)" : ""}
            </option>
          ))}
          {record &&
          !modules.some((module) => module.id === record.moduleId) ? (
            <option value={record.moduleId}>
              Nicht mehr verfügbares Modul
            </option>
          ) : null}
        </select>
      </label>
      <label>
        Art
        <select
          value={kind}
          onChange={(event) => changeKind(event.target.value as StudyEntryKind)}
        >
          {(Object.keys(studyEntryKindLabels) as StudyEntryKind[]).map(
            (value) => (
              <option key={value} value={value}>
                {studyEntryKindLabels[value]}
              </option>
            ),
          )}
        </select>
      </label>
      <label>
        Bezeichnung
        <input
          name="title"
          required
          maxLength={500}
          defaultValue={record?.title ?? ""}
        />
      </label>
      {record ? (
        <label>
          Status
          <select name="status" defaultValue={record.status}>
            {studyStatuses.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {record && allDayCapable ? (
        <fieldset className="wide">
          <legend>Art der Angabe</legend>
          <label className="checkbox-row">
            <input
              type="radio"
              name="schedule"
              checked={allDay}
              onChange={() => setAllDay(true)}
            />
            Ganztagsfrist
          </label>
          <label className="checkbox-row">
            <input
              type="radio"
              name="schedule"
              checked={!allDay}
              onChange={() => setAllDay(false)}
            />
            Zeitblock
          </label>
          <p className="field-hint">
            Ein Wechsel entfernt die bisherige Datumsangabe der anderen Form
            bewusst, statt beide Werte zu vermischen.
          </p>
        </fieldset>
      ) : null}
      {allDaySelected ? (
        <label>
          Kalendertag
          <input
            name="dueDate"
            type="date"
            required
            defaultValue={record?.dueDate ?? ""}
          />
        </label>
      ) : (
        <>
          <label>
            Beginn
            <input
              name="startsAt"
              type="datetime-local"
              required
              defaultValue={
                record?.startsAt
                  ? toDateTimeInput(record.startsAt, scheduleTimezone)
                  : ""
              }
            />
          </label>
          <label>
            Ende
            <input
              name="endsAt"
              type="datetime-local"
              required
              defaultValue={
                record?.endsAt
                  ? toDateTimeInput(record.endsAt, scheduleTimezone)
                  : ""
              }
            />
          </label>
          <p className="field-hint">Darstellung in {scheduleTimezone}</p>
        </>
      )}
      <label className="wide">
        Notizen
        <textarea
          name="notes"
          maxLength={20000}
          defaultValue={record?.notes ?? ""}
        />
      </label>
      {record?.calendarEventUid ? (
        <p className="field-hint wide">
          Der führende Kalendertermin bleibt unverändert erhalten. Er ist keine
          freie Aufgaben-Termin-Verknüpfung.
        </p>
      ) : null}
    </FormShell>
  );
};
