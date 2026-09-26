import type {
  DocumentResponse,
  NoteResponse,
  StudyEntryKind,
  StudyEntryResponse,
  StudyModuleResponse,
  StudyProgramResponse,
  StudyStatus,
  TaskResponse,
} from "@lifeos/contracts";
import { useEffect, useMemo, useRef, type ReactNode } from "react";

import {
  compareTasks,
  formatTaskDueDate,
  formatTaskStart,
  taskAreaLabels,
  taskStatusLabels,
} from "../task";
import { ArrowIcon, EditIcon, PlusIcon, StudyIcon } from "./Icons";

const studyStatusLabels: Record<StudyStatus, string> = {
  planned: "Geplant",
  active: "Aktiv",
  completed: "Abgeschlossen",
  paused: "Pausiert",
  cancelled: "Abgebrochen",
};

const studyEntryKindLabels: Record<StudyEntryKind, string> = {
  lecture: "Lehrveranstaltung",
  exam: "Prüfung",
  submission: "Abgabefrist",
  learning: "Lernzeit",
};

/** Einträge eines Moduls ohne Modulwechsel. */
const moduleEntries = (
  moduleId: string,
  entries: StudyEntryResponse[],
): StudyEntryResponse[] =>
  entries.filter((entry) => entry.moduleId === moduleId);

/** Freie, nicht als Datei interpretierte Verweise bleiben unverändert. */
const relatedNotes = (
  moduleId: string,
  notes: NoteResponse[],
): NoteResponse[] => notes.filter((note) => note.studyModule?.id === moduleId);

const relatedDocuments = (
  moduleId: string,
  documents: DocumentResponse[],
): DocumentResponse[] =>
  documents.filter((document) => document.studyModule?.id === moduleId);

/**
 * Datumsschreibweise eines Studieneintrags. Reine Fristen bleiben Kalendertage;
 * zeitgebundene Einträge werden in ihrer gespeicherten Zeitzone beschriftet und
 * nicht neu interpretiert.
 */
const formatStudyEntryDate = (
  entry: StudyEntryResponse,
  timezone: string,
): string => {
  if (entry.dueDate) return entry.dueDate;
  if (!entry.startsAt) return "ohne Datum";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: entry.timezone ?? timezone,
  }).format(new Date(entry.startsAt));
};

interface Props {
  module: StudyModuleResponse;
  program: StudyProgramResponse | null;
  /** Alle bekannten Studieneinträge; gefiltert wird nach `moduleId`. */
  entries: StudyEntryResponse[];
  /** Alle geladenen Aufgaben; gefiltert wird nach dem Modulbezug. */
  tasks: TaskResponse[];
  notes: NoteResponse[];
  documents: DocumentResponse[];
  /** Suchtreffer eines Studieneintrags; er wird sichtbar hervorgehoben. */
  highlightedEntryId: string | null;
  timezone: string;
  saving: boolean;
  error: string | null;
  success: string | null;
  /** Attributiver Renderplatz der bestehenden Studienformulare. */
  formPanel?: ReactNode;
  onBack: () => void;
  onEditModule: () => void;
  onCreateEntry: () => void;
  onEditEntry: (entryId: string) => void;
  onCreateTask: () => void;
  onEditTask: (taskId: string) => void;
  onOpenNote: (noteId: string) => void;
  onOpenDocument: (documentId: string) => void;
}

const documentSize = (byteSize: number) =>
  `${(byteSize / 1024).toLocaleString("de-DE", {
    maximumFractionDigits: 1,
  })} KiB`;

/**
 * Besitzgebundene Moduldetailansicht. Sie stellt ausschließlich bereits
 * geladene, besitzgefilterte Objekte zusammen und bearbeitet sie über die
 * bestehenden Facheditoren. Es entsteht keine zweite Datenquelle und kein
 * eigener Schreibpfad.
 */
export const StudyModuleDetail = ({
  module,
  program,
  entries,
  tasks,
  notes,
  documents,
  highlightedEntryId,
  timezone,
  saving,
  error,
  success,
  formPanel,
  onBack,
  onEditModule,
  onCreateEntry,
  onEditEntry,
  onCreateTask,
  onEditTask,
  onOpenNote,
  onOpenDocument,
}: Props) => {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [module.id]);

  const entriesOfModule = useMemo(
    () => moduleEntries(module.id, entries),
    [entries, module.id],
  );
  const notesOfModule = useMemo(
    () => relatedNotes(module.id, notes),
    [module.id, notes],
  );
  const documentsOfModule = useMemo(
    () => relatedDocuments(module.id, documents),
    [documents, module.id],
  );
  const moduleTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.studyModuleId === module.id)
        .sort(compareTasks),
    [module.id, tasks],
  );
  const tasksById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks],
  );

  const summary = [
    module.code,
    program ? program.title : null,
    studyStatusLabels[module.status],
    module.credits === null ? null : `${module.credits} LP`,
    module.grade ? `Note ${module.grade}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="page-content study-page study-module-detail">
      <header className="workspace-heading">
        <div>
          <p className="eyebrow">Studienmodul</p>
          <h1 ref={heading} tabIndex={-1}>
            {module.title}
          </h1>
          <p>{summary}</p>
        </div>
        <div className="study-actions">
          <button
            className="secondary-button"
            onClick={onBack}
            disabled={saving}
          >
            <ArrowIcon /> Zur Übersicht
          </button>
          <button
            className="primary-button"
            onClick={onEditModule}
            disabled={saving}
          >
            <EditIcon /> Modul bearbeiten
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
      {formPanel ?? null}

      {module.archivedAt ? (
        <p className="information-banner" role="status">
          Dieses Modul ist archiviert. Aufgabenzuordnungen bleiben erhalten,
          werden aber nicht mehr als Neuordnung angeboten.
        </p>
      ) : null}

      <section
        className="study-section module-facts"
        aria-labelledby="module-facts-title"
      >
        <header>
          <h2 id="module-facts-title">Modulangaben</h2>
        </header>
        <dl className="fact-list">
          <div>
            <dt>Kürzel</dt>
            <dd>{module.code ?? "Ohne Kürzel"}</dd>
          </div>
          <div>
            <dt>Studienabschnitt</dt>
            <dd>
              {program
                ? `${program.title} · ${program.periodLabel}`
                : "Studienabschnitt nicht verfügbar"}
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{studyStatusLabels[module.status]}</dd>
          </div>
          <div>
            <dt>Leistungspunkte</dt>
            <dd>
              {module.credits === null ? "Ohne Angabe" : `${module.credits} LP`}
            </dd>
          </div>
          <div>
            <dt>Note</dt>
            <dd>{module.grade ?? "Ohne Note"}</dd>
          </div>
          <div>
            <dt>Suchfreigabe</dt>
            <dd>
              {module.searchEnabled
                ? "Für die lokale Suche freigegeben"
                : "Nicht freigegeben"}
            </dd>
          </div>
          <div className="wide">
            <dt>Notizen</dt>
            <dd>
              {module.notes?.trim()
                ? module.notes
                : "Keine Notizen hinterlegt."}
            </dd>
          </div>
        </dl>
      </section>

      <section
        className="study-section module-relations"
        aria-labelledby="module-tasks-title"
      >
        <header>
          <div>
            <h2 id="module-tasks-title">Aufgaben</h2>
            <p className="muted-copy">
              Aktive und archivierte Aufgaben mit diesem Modulbezug.
            </p>
          </div>
          <button
            className="text-button"
            onClick={onCreateTask}
            disabled={saving}
          >
            <PlusIcon /> Aufgabe anlegen
          </button>
        </header>
        {moduleTasks.length === 0 ? (
          <p className="empty-state">
            Noch keine Aufgabe mit diesem Modulbezug.
          </p>
        ) : (
          <ul className="relation-list">
            {moduleTasks.map((task) => {
              const start = formatTaskStart(task);
              return (
                <li key={task.id}>
                  <article
                    className={[
                      "study-card",
                      "relation-card",
                      task.archivedAt ? "archived" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <div>
                      <h3>{task.title}</h3>
                      <p>
                        {[
                          taskStatusLabels[task.status],
                          taskAreaLabels[task.area],
                          formatTaskDueDate(task.dueDate, timezone),
                          start ? `Geplant: ${start}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {task.archivedAt ? (
                        <small role="status">Archiviert</small>
                      ) : null}
                    </div>
                    <div className="record-actions">
                      <button
                        className="secondary-button"
                        disabled={saving}
                        onClick={() => onEditTask(task.id)}
                      >
                        Aufgabe öffnen
                      </button>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section
        className="study-section module-relations"
        aria-labelledby="module-entries-title"
      >
        <header>
          <div>
            <h2 id="module-entries-title">Termine, Fristen und Lernzeiten</h2>
            <p className="muted-copy">
              Studieneinträge dieses Moduls. Ein Kalenderbezug eines Eintrags
              ist ausschließlich sein führender Termin und keine freie
              Aufgaben-Termin-Verknüpfung.
            </p>
          </div>
          <button
            className="text-button"
            onClick={onCreateEntry}
            disabled={saving}
          >
            <PlusIcon /> Eintrag hinzufügen
          </button>
        </header>
        {entriesOfModule.length === 0 ? (
          <p className="empty-state">
            Noch kein Termin, keine Frist und keine Lernzeit hinterlegt.
          </p>
        ) : (
          <ul className="relation-list">
            {entriesOfModule.map((entry) => {
              const linkedTask = entry.taskId
                ? (tasksById.get(entry.taskId) ?? null)
                : null;
              const highlighted = entry.id === highlightedEntryId;
              return (
                <li key={entry.id}>
                  <article
                    className={[
                      "study-card",
                      "relation-card",
                      entry.archivedAt ? "archived" : "",
                      highlighted ? "search-target" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    {...(highlighted ? { "aria-current": "true" } : {})}
                  >
                    <div>
                      <h3>
                        {entry.title}
                        {highlighted ? (
                          <span className="status-pill">Suchtreffer</span>
                        ) : null}
                      </h3>
                      <p>
                        {[
                          studyEntryKindLabels[entry.kind],
                          formatStudyEntryDate(entry, timezone),
                          studyStatusLabels[entry.status],
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {entry.archivedAt ? (
                        <small role="status">Archiviert</small>
                      ) : null}
                      {linkedTask ? (
                        <small>
                          Verknüpfte Aufgabe: {linkedTask.title}
                          {linkedTask.archivedAt ? " (archiviert)" : ""}
                        </small>
                      ) : entry.taskId ? (
                        <small role="status">
                          Eine verknüpfte Aufgabe ist nicht mehr verfügbar.
                        </small>
                      ) : null}
                      {entry.calendarEventUid ? (
                        <small>
                          Führender Kalendertermin: {entry.calendarEventUid}
                        </small>
                      ) : null}
                    </div>
                    <div className="record-actions">
                      {linkedTask ? (
                        <button
                          className="secondary-button"
                          disabled={saving}
                          onClick={() => onEditTask(linkedTask.id)}
                        >
                          Aufgabe öffnen
                        </button>
                      ) : null}
                      <button
                        className="secondary-button"
                        disabled={saving}
                        onClick={() => onEditEntry(entry.id)}
                      >
                        Eintrag bearbeiten
                      </button>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section
        className="study-section module-relations"
        aria-labelledby="module-notes-title"
      >
        <header>
          <h2 id="module-notes-title">Notizen</h2>
        </header>
        {notesOfModule.length === 0 ? (
          <p className="empty-state">Noch keine Notiz mit diesem Modulbezug.</p>
        ) : (
          <ul className="relation-list">
            {notesOfModule.map((note) => (
              <li key={note.id}>
                <article
                  className={[
                    "study-card",
                    "relation-card",
                    note.archivedAt ? "archived" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div>
                    <h3>{note.title}</h3>
                    <p>
                      {[
                        note.category ?? "Ohne Kategorie",
                        `Version ${note.version}`,
                        note.searchEnabled
                          ? "Für die lokale Suche freigegeben"
                          : "Nicht freigegeben",
                      ].join(" · ")}
                    </p>
                    {note.archivedAt ? (
                      <small role="status">Archiviert</small>
                    ) : null}
                  </div>
                  <div className="record-actions">
                    <button
                      className="secondary-button"
                      disabled={saving}
                      onClick={() => onOpenNote(note.id)}
                    >
                      Notiz öffnen
                    </button>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="study-section module-relations"
        aria-labelledby="module-documents-title"
      >
        <header>
          <div>
            <h2 id="module-documents-title">Dokumente</h2>
            <p className="muted-copy">
              Verknüpfte Dateien aus der gemeinsamen lokalen Ablage. Der
              Dateiinhalt wird hier nicht ersetzt.
            </p>
          </div>
        </header>
        {documentsOfModule.length === 0 ? (
          <p className="empty-state">
            Noch keine lokale Datei mit diesem Modul verknüpft.
          </p>
        ) : (
          <ul className="relation-list">
            {documentsOfModule.map((document) => (
              <li key={document.id}>
                <article
                  className={[
                    "study-card",
                    "relation-card",
                    document.archivedAt ? "archived" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div>
                    <h3>{document.fileName}</h3>
                    <p>
                      {document.mimeType} · {documentSize(document.byteSize)}
                    </p>
                    <small>
                      SHA-256: {document.sha256.slice(0, 12)}…
                      {document.searchEnabled
                        ? " · für die lokale Suche freigegeben"
                        : " · nicht freigegeben"}
                    </small>
                    {document.archivedAt ? (
                      <small role="status">Archiviert</small>
                    ) : null}
                  </div>
                  <div className="record-actions">
                    <button
                      className="secondary-button"
                      disabled={saving}
                      onClick={() => onOpenDocument(document.id)}
                    >
                      Dokument bearbeiten
                    </button>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}

        <div className="module-references">
          <h3>Dokumentverweise des Moduls</h3>
          {module.documentReferences.length === 0 ? (
            <p className="empty-state">Keine Dokumentverweise hinterlegt.</p>
          ) : (
            <ul className="reference-list">
              {module.documentReferences.map((reference) => (
                <li key={reference}>{reference}</li>
              ))}
            </ul>
          )}
          <p className="field-hint">
            Freie Angaben aus dem Modul. Sie sind keine verknüpften Dateien und
            werden nicht automatisch als lokale Dokumente geöffnet.
          </p>
        </div>
      </section>

      <p className="privacy-note">
        <StudyIcon /> Diese Ansicht liest ausschließlich eigene, bereits
        geladene Studien-, Aufgaben-, Notiz- und Dokumentdaten.
      </p>
    </main>
  );
};
