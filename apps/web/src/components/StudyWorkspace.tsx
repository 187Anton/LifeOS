import type {
  CreateStudyEntryRequest,
  CreateStudyModuleRequest,
  CreateStudyProgramRequest,
  StudyAuditResponse,
  StudyModuleResponse,
  StudyOverviewResponse,
  StudyProgramResponse,
  StudyStatus,
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
import { dateTimeInputToIso } from "../date";
import { ArchiveIcon, PlusIcon, StudyIcon } from "./Icons";

const statuses: { value: StudyStatus; label: string }[] = [
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

interface Props {
  overview: StudyOverviewResponse | null;
  timezone: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  success: string | null;
  onReload: () => void;
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
}

export const StudyWorkspace = ({
  overview,
  timezone,
  loading,
  saving,
  error,
  success,
  onReload,
  onCreateProgram,
  onCreateModule,
  onCreateEntry,
  onUpdateProgram,
  onUpdateModule,
  onUpdateEntry,
}: Props) => {
  const [form, setForm] = useState<"program" | "module" | "entry" | null>(null);
  const programs =
    overview?.programs.filter((value) => !value.archivedAt) ?? [];
  const modules = overview?.modules.filter((value) => !value.archivedAt) ?? [];
  const entries = overview?.entries.filter((value) => !value.archivedAt) ?? [];
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
          <button className="primary-button" onClick={() => setForm("program")}>
            <PlusIcon /> Studienabschnitt
          </button>
        </div>
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
      {loading ? (
        <div className="empty-state" role="status">
          Studiendaten werden geladen …
        </div>
      ) : null}
      {form === "program" ? (
        <ProgramForm
          saving={saving}
          onCancel={() => setForm(null)}
          onSave={async (value) => {
            await onCreateProgram(value);
            setForm(null);
          }}
        />
      ) : null}
      {form === "module" ? (
        <ModuleForm
          programs={programs}
          saving={saving}
          onCancel={() => setForm(null)}
          onSave={async (value) => {
            await onCreateModule(value);
            setForm(null);
          }}
        />
      ) : null}
      {form === "entry" ? (
        <EntryForm
          modules={modules}
          timezone={timezone}
          saving={saving}
          onCancel={() => setForm(null)}
          onSave={async (value) => {
            await onCreateEntry(value);
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
          <button className="primary-button" onClick={() => setForm("program")}>
            Abschnitt anlegen
          </button>
        </section>
      ) : (
        <div className="study-grid">
          <StudySection
            title="Studienabschnitte"
            action="Abschnitt hinzufügen"
            onAction={() => setForm("program")}
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
            onAction={() => setForm("module")}
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
                </StudyCard>
              ))
            ) : (
              <p className="muted-copy">Noch keine Module angelegt.</p>
            )}
          </StudySection>
          <StudySection
            title="Termine, Fristen und Lernzeiten"
            action="Eintrag hinzufügen"
            onAction={() => setForm("entry")}
            disabled={!modules.length}
          >
            {entries.length ? (
              entries.map((entry) => (
                <StudyCard
                  key={entry.id}
                  title={entry.title}
                  subtitle={`${entry.kind === "exam" ? "Prüfung" : entry.kind === "submission" ? "Abgabe" : entry.kind === "lecture" ? "Lehrveranstaltung" : "Lernzeit"} · ${entry.dueDate ?? (entry.startsAt ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: entry.timezone ?? timezone }).format(new Date(entry.startsAt)) : "ohne Datum")}`}
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
      {statuses.map((option) => (
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
  saving,
  onCancel,
  onSave,
}: {
  programs: StudyProgramResponse[];
  saving: boolean;
  onCancel: () => void;
  onSave: (value: CreateStudyModuleRequest) => Promise<void>;
}) => (
  <FormShell
    title="Modul oder Kurs anlegen"
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
      void onSave({
        programId: field(data, "programId"),
        title: field(data, "title"),
        code: field(data, "code") || null,
        credits: credits ? Number(credits) : null,
        status: "planned",
        notes: field(data, "notes") || null,
        documentReferences: references,
        searchEnabled: data.get("searchEnabled") === "on",
      });
    }}
  >
    <label>
      Studienabschnitt
      <select name="programId" required>
        {programs.map((item) => (
          <option key={item.id} value={item.id}>
            {item.title} · {item.periodLabel}
          </option>
        ))}
      </select>
    </label>
    <label>
      Modul oder Kurs
      <input name="title" required maxLength={500} />
    </label>
    <label>
      Kürzel (optional)
      <input name="code" maxLength={100} />
    </label>
    <label>
      Leistungspunkte (optional)
      <input name="credits" type="number" min="0" max="9999" step="0.01" />
    </label>
    <label className="wide">
      Notizen
      <textarea name="notes" maxLength={20000} />
    </label>
    <label className="wide checkbox-row">
      <input name="searchEnabled" type="checkbox" />
      Modul und aktive Studieneinträge für die lokale Suche freigeben
    </label>
    <label className="wide">
      Dokumentverweise (einer pro Zeile)
      <textarea name="documentReferences" maxLength={20000} />
    </label>
  </FormShell>
);

const EntryForm = ({
  modules,
  timezone,
  saving,
  onCancel,
  onSave,
}: {
  modules: StudyModuleResponse[];
  timezone: string;
  saving: boolean;
  onCancel: () => void;
  onSave: (value: CreateStudyEntryRequest) => Promise<void>;
}) => {
  const [kind, setKind] = useState<CreateStudyEntryRequest["kind"]>("exam");
  const allDay = kind === "exam" || kind === "submission";
  return (
    <FormShell
      title="Studieneintrag anlegen"
      saving={saving}
      onCancel={onCancel}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const base: CreateStudyEntryRequest = {
          moduleId: field(data, "moduleId"),
          kind,
          title: field(data, "title"),
          status: "planned",
          notes: field(data, "notes") || null,
        };
        if (allDay) base.dueDate = field(data, "dueDate");
        else {
          base.startsAt = dateTimeInputToIso(field(data, "startsAt"), timezone);
          base.endsAt = dateTimeInputToIso(field(data, "endsAt"), timezone);
          base.timezone = timezone;
        }
        void onSave(base);
      }}
    >
      <label>
        Modul
        <select name="moduleId" required>
          {modules.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Art
        <select
          value={kind}
          onChange={(event) =>
            setKind(event.target.value as CreateStudyEntryRequest["kind"])
          }
        >
          <option value="exam">Prüfung</option>
          <option value="submission">Abgabefrist</option>
          <option value="lecture">Lehrveranstaltung</option>
          <option value="learning">Lernzeit</option>
        </select>
      </label>
      <label>
        Bezeichnung
        <input name="title" required maxLength={500} />
      </label>
      {allDay ? (
        <label>
          Kalendertag
          <input name="dueDate" type="date" required />
        </label>
      ) : (
        <>
          <label>
            Beginn
            <input name="startsAt" type="datetime-local" required />
          </label>
          <label>
            Ende
            <input name="endsAt" type="datetime-local" required />
          </label>
          <p className="field-hint">Darstellung in {timezone}</p>
        </>
      )}
      <label className="wide">
        Notizen
        <textarea name="notes" maxLength={20000} />
      </label>
    </FormShell>
  );
};
