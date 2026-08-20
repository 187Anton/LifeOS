import type {
  CreateNoteRequest,
  KnowledgeOverviewResponse,
  NoteDetailResponse,
  ProjectResponse,
  StudyModuleResponse,
  SearchResponse,
  SearchResultResponse,
  UpdateDocumentRequest,
  UpdateNoteRequest,
} from "@lifeos/contracts";
import { useState, type FormEvent } from "react";

import { ArchiveIcon, ReopenIcon, TrashIcon } from "./Icons";

interface Props {
  overview: KnowledgeOverviewResponse | null;
  detail: NoteDetailResponse | null;
  projects: ProjectResponse[];
  modules: StudyModuleResponse[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  success: string | null;
  search: SearchResponse | null;
  searchLoading: boolean;
  searchError: string | null;
  onReload: () => void;
  onSelectNote: (id: string) => void;
  onCreateNote: (value: CreateNoteRequest) => Promise<void>;
  onUpdateNote: (id: string, value: UpdateNoteRequest) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  onUploadDocument: (file: File, links: UpdateDocumentRequest) => Promise<void>;
  onUpdateDocument: (id: string, value: UpdateDocumentRequest) => Promise<void>;
  onDeleteDocument: (id: string) => Promise<void>;
  onSearch: (query: string) => Promise<void>;
  onOpenSearchResult: (result: SearchResultResponse) => void;
}

const emptyNote = {
  title: "",
  content: "",
  category: "",
  tags: "",
  projectId: "",
  studyModuleId: "",
  searchEnabled: false,
};

export const KnowledgeWorkspace = (props: Props) => {
  const [note, setNote] = useState(() =>
    props.detail
      ? {
          title: props.detail.title,
          content: props.detail.content,
          category: props.detail.category ?? "",
          tags: props.detail.tags.join(", "),
          projectId: props.detail.project?.id ?? "",
          studyModuleId: props.detail.studyModule?.id ?? "",
          searchEnabled: props.detail.searchEnabled,
        }
      : emptyNote,
  );
  const [file, setFile] = useState<File | null>(null);
  const [documentProjectId, setDocumentProjectId] = useState("");
  const [documentStudyModuleId, setDocumentStudyModuleId] = useState("");
  const [documentSearchEnabled, setDocumentSearchEnabled] = useState(false);
  const [query, setQuery] = useState("");

  const notePayload = (): CreateNoteRequest => ({
    title: note.title,
    content: note.content,
    category: note.category || null,
    tags: note.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    projectId: note.projectId || null,
    studyModuleId: note.studyModuleId || null,
    searchEnabled: note.searchEnabled,
  });
  const submitNote = async (event: FormEvent) => {
    event.preventDefault();
    if (props.detail) await props.onUpdateNote(props.detail.id, notePayload());
    else await props.onCreateNote(notePayload());
  };
  const upload = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    await props.onUploadDocument(file, {
      projectId: documentProjectId || null,
      studyModuleId: documentStudyModuleId || null,
      searchEnabled: documentSearchEnabled,
    });
    setFile(null);
  };

  return (
    <main className="page-content knowledge-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Wissen</p>
          <h1>Notizen & Dokumente</h1>
          <p>
            Lokale Inhalte bleiben privat und werden nur nach ausdrücklicher
            Freigabe durchsuchbar.
          </p>
        </div>
        <button className="secondary-button" onClick={props.onReload}>
          Neu laden
        </button>
      </header>
      {props.error ? (
        <p className="error-banner" role="alert">
          {props.error}
        </p>
      ) : null}
      {props.success ? (
        <p className="success-banner" role="status">
          {props.success}
        </p>
      ) : null}
      {props.loading ? <p role="status">Wissen wird geladen …</p> : null}

      <section
        className="study-section local-search"
        aria-labelledby="local-search-heading"
      >
        <header>
          <div>
            <p className="eyebrow">Lokale Volltextsuche</p>
            <h2 id="local-search-heading">Freigegebene Inhalte finden</h2>
            <p>
              Durchsucht nur eigene, aktive Inhalte mit ausdrücklicher
              Suchfreigabe. Suchanfragen und Treffer werden nicht im Browser
              gespeichert.
            </p>
          </div>
        </header>
        <form
          className="local-search-form"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            void props.onSearch(query);
          }}
        >
          <label>
            Suchbegriff
            <input
              value={query}
              maxLength={200}
              placeholder="z. B. Prüfungsplanung"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button className="primary-button" disabled={props.searchLoading}>
            {props.searchLoading ? "Suche läuft …" : "Suchen"}
          </button>
        </form>
        {props.searchError ? (
          <p className="error-banner" role="alert">
            {props.searchError}
          </p>
        ) : null}
        {props.search ? (
          <div className="search-results" aria-live="polite">
            <p>
              {props.search.results.length
                ? `${props.search.results.length} Treffer für „${props.search.query}“`
                : `Keine freigegebenen Treffer für „${props.search.query}“`}
            </p>
            {props.search.results.map((result) => (
              <article
                className="search-result"
                key={`${result.contentType}-${result.id}`}
              >
                <div className="search-result-heading">
                  <div>
                    <span className="status-pill">
                      {contentTypeLabel(result.contentType)}
                    </span>
                    <h3>{result.title}</h3>
                  </div>
                  <time dateTime={result.updatedAt}>
                    {new Date(result.updatedAt).toLocaleDateString("de-DE")}
                  </time>
                </div>
                <p>{result.snippet}</p>
                <small>
                  Quelle: {result.source.title} · Treffer in{" "}
                  {matchReasonLabel(result.matchReason)} · Eigener,
                  freigegebener Inhalt
                </small>
                <a
                  href={result.detailPath}
                  className="text-button"
                  onClick={(event) => {
                    event.preventDefault();
                    props.onOpenSearchResult(result);
                  }}
                >
                  Quelle öffnen
                </a>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <div className="knowledge-grid">
        <section className="study-section knowledge-list">
          <header>
            <div>
              <p className="eyebrow">Notizen</p>
              <h2>Lokale Markdown-Notizen</h2>
            </div>
          </header>
          <button
            className="secondary-button"
            onClick={() => setNote(emptyNote)}
          >
            Neue Notiz
          </button>
          <div className="knowledge-items">
            {props.overview?.notes.map((entry) => (
              <button
                key={entry.id}
                className={
                  props.detail?.id === entry.id
                    ? "knowledge-item active"
                    : "knowledge-item"
                }
                onClick={() => props.onSelectNote(entry.id)}
              >
                <strong>{entry.title}</strong>
                <span>
                  {entry.category || "Ohne Kategorie"} · Version {entry.version}
                </span>
                {entry.archivedAt ? <small>Archiviert</small> : null}
              </button>
            ))}
            {!props.overview?.notes.length ? (
              <p className="empty-state">Noch keine Notizen.</p>
            ) : null}
          </div>
        </section>

        <form
          className="study-section knowledge-editor"
          onSubmit={(event) => void submitNote(event)}
        >
          <header>
            <div>
              <p className="eyebrow">
                {props.detail ? `Version ${props.detail.version}` : "Neu"}
              </p>
              <h2>{props.detail ? "Notiz bearbeiten" : "Notiz anlegen"}</h2>
            </div>
          </header>
          <label>
            Titel
            <input
              required
              maxLength={500}
              value={note.title}
              onChange={(event) =>
                setNote({ ...note, title: event.target.value })
              }
            />
          </label>
          <label>
            Inhalt (Markdown)
            <textarea
              rows={10}
              maxLength={1_000_000}
              value={note.content}
              onChange={(event) =>
                setNote({ ...note, content: event.target.value })
              }
            />
          </label>
          <div className="form-grid">
            <label>
              Kategorie
              <input
                value={note.category}
                onChange={(event) =>
                  setNote({ ...note, category: event.target.value })
                }
              />
            </label>
            <label>
              Tags, durch Komma getrennt
              <input
                value={note.tags}
                onChange={(event) =>
                  setNote({ ...note, tags: event.target.value })
                }
              />
            </label>
            <LinkSelect
              label="Projekt"
              value={note.projectId}
              onChange={(projectId) => setNote({ ...note, projectId })}
              options={props.projects}
            />
            <LinkSelect
              label="Studienmodul"
              value={note.studyModuleId}
              onChange={(studyModuleId) => setNote({ ...note, studyModuleId })}
              options={props.modules}
            />
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={note.searchEnabled}
              onChange={(event) =>
                setNote({ ...note, searchEnabled: event.target.checked })
              }
            />
            Für lokale Suche freigeben
          </label>
          <div className="form-actions">
            <button className="primary-button" disabled={props.saving}>
              {props.detail ? "Änderung speichern" : "Notiz anlegen"}
            </button>
            {props.detail ? (
              <>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    void props.onUpdateNote(props.detail!.id, {
                      archived: !props.detail!.archivedAt,
                    })
                  }
                >
                  {props.detail.archivedAt ? <ReopenIcon /> : <ArchiveIcon />}
                  {props.detail.archivedAt ? "Wiederherstellen" : "Archivieren"}
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => void props.onDeleteNote(props.detail!.id)}
                >
                  <TrashIcon />
                  Löschen
                </button>
              </>
            ) : null}
          </div>
          {props.detail?.versions.length ? (
            <details>
              <summary>
                Versionsverlauf ({props.detail.versions.length})
              </summary>
              <ol className="version-list">
                {props.detail.versions.map((version) => (
                  <li key={version.version}>
                    <strong>Version {version.version}</strong>
                    <span>
                      {new Date(version.createdAt).toLocaleString("de-DE")}
                    </span>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </form>
      </div>

      <section className="study-section documents-section">
        <header>
          <div>
            <p className="eyebrow">Dokumente</p>
            <h2>Sichere lokale Ablage</h2>
          </div>
        </header>
        <form
          className="document-upload"
          onSubmit={(event) => void upload(event)}
        >
          <label>
            Datei
            <input
              required
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <LinkSelect
            label="Projekt"
            value={documentProjectId}
            onChange={setDocumentProjectId}
            options={props.projects}
          />
          <LinkSelect
            label="Studienmodul"
            value={documentStudyModuleId}
            onChange={setDocumentStudyModuleId}
            options={props.modules}
          />
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={documentSearchEnabled}
              onChange={(event) =>
                setDocumentSearchEnabled(event.target.checked)
              }
            />
            Für lokale Suche freigeben
          </label>
          <button className="primary-button" disabled={!file || props.saving}>
            Lokal ablegen
          </button>
        </form>
        <div className="document-list">
          {props.overview?.documents.map((document) => (
            <article className="document-card" key={document.id}>
              <div>
                <strong>{document.fileName}</strong>
                <p>
                  {document.mimeType} ·{" "}
                  {(document.byteSize / 1024).toLocaleString("de-DE", {
                    maximumFractionDigits: 1,
                  })}{" "}
                  KiB
                </p>
                <small>
                  SHA-256: {document.sha256.slice(0, 12)}…
                  {document.archivedAt ? " · archiviert" : ""}
                </small>
              </div>
              <div className="form-actions">
                <a className="secondary-button" href={document.contentUrl}>
                  Herunterladen
                </a>
                <button
                  className="secondary-button"
                  onClick={() =>
                    void props.onUpdateDocument(document.id, {
                      archived: !document.archivedAt,
                    })
                  }
                >
                  {document.archivedAt ? "Wiederherstellen" : "Archivieren"}
                </button>
                <button
                  className="danger-button"
                  onClick={() => void props.onDeleteDocument(document.id)}
                >
                  Löschen
                </button>
              </div>
            </article>
          ))}
          {!props.overview?.documents.length ? (
            <p className="empty-state">Noch keine lokalen Dokumente.</p>
          ) : null}
        </div>
      </section>
    </main>
  );
};

const contentTypeLabel = (contentType: SearchResultResponse["contentType"]) =>
  ({
    project: "Projekt",
    project_goal: "Projektziel",
    project_milestone: "Meilenstein",
    note: "Notiz",
    document: "Dokument",
    study_module: "Studienmodul",
    study_entry: "Studieneintrag",
    work_project: "Arbeitsprojekt",
  })[contentType];

const matchReasonLabel = (reason: SearchResultResponse["matchReason"]) =>
  ({ title: "Titel", content: "Inhalt", metadata: "Metadaten" })[reason];

const LinkSelect = ({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; title: string }>;
}) => (
  <label>
    {label}
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Keine Verknüpfung</option>
      {options
        .filter((option) => !("archivedAt" in option) || !option.archivedAt)
        .map((option) => (
          <option key={option.id} value={option.id}>
            {option.title}
          </option>
        ))}
    </select>
  </label>
);
