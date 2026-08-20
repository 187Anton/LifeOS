import type {
  GitHubConnectionResponse,
  GitHubIntegrationOverviewResponse,
  GitHubRepositorySnapshotResponse,
  GitHubRepositorySummaryResponse,
} from "@lifeos/contracts";
import { useEffect, useState } from "react";

import { api, ApiClientError } from "../api";

const errorMessage = (error: unknown) =>
  error instanceof ApiClientError
    ? error.message
    : "Die lesende GitHub-Aktion konnte nicht abgeschlossen werden.";
const valueFrom = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

export const GitHubIntegrationPanel = () => {
  const [overview, setOverview] =
    useState<GitHubIntegrationOverviewResponse | null>(null);
  const [repositories, setRepositories] = useState<
    Record<string, GitHubRepositorySummaryResponse[]>
  >({});
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [snapshot, setSnapshot] =
    useState<GitHubRepositorySnapshotResponse | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  const load = async () => {
    setPending(true);
    try {
      setOverview(await api.getGitHubIntegration());
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  };
  useEffect(() => {
    let active = true;
    api
      .getGitHubIntegration()
      .then((value) => {
        if (active) setOverview(value);
      })
      .catch((caught: unknown) => {
        if (active) setError(errorMessage(caught));
      })
      .finally(() => {
        if (active) setPending(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const action = async (operation: () => Promise<unknown>, text: string) => {
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      await operation();
      setSuccess(text);
      await load();
      return true;
    } catch (caught) {
      setError(errorMessage(caught));
      setPending(false);
      return false;
    }
  };

  const loadRepositories = async (connection: GitHubConnectionResponse) => {
    setPending(true);
    setError(null);
    setSnapshot(null);
    try {
      const result = await api.listGitHubRepositories(connection.id);
      setRepositories((current) => ({
        ...current,
        [connection.id]: result.repositories,
      }));
      setSuccess("Die Repository-Metadaten wurden einmalig lesend geladen.");
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
      setPending(false);
    }
  };

  const loadSnapshot = async (connectionId: string) => {
    const fullName = selected[connectionId];
    if (!fullName) return;
    const [owner, repository] = fullName.split("/", 2);
    if (!owner || !repository) return;
    setPending(true);
    setError(null);
    try {
      setSnapshot(
        await api.getGitHubRepositorySnapshot(connectionId, owner, repository),
      );
      setSuccess("Der aktuelle read-only-Repository-Stand wurde geladen.");
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
      setPending(false);
    }
  };

  return (
    <section className="study-section github-integration-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Optional und nur Lesen</span>
          <h2>GitHub-Integration</h2>
          <p>
            Zeigt Metadaten, Issues, Pull Requests, Commits, Releases und
            CI-Status nur nach ausdrücklicher Aktivierung. Es gibt keine
            GitHub-Schreibaktion.
          </p>
        </div>
        <button
          className="secondary-button"
          onClick={() => void load()}
          disabled={pending}
        >
          GitHub-Status aktualisieren
        </button>
      </div>
      {error ? (
        <p className="conflict-banner" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="success-banner" role="status">
          {success}
        </p>
      ) : null}
      {pending && !overview ? (
        <p role="status">GitHub-Status wird lokal geladen …</p>
      ) : null}
      {overview && !overview.available ? (
        <div className="empty-state">
          <h3>GitHub bleibt sicher deaktiviert</h3>
          <p>
            Ohne lokalen Integrationsschlüssel werden weder Token gespeichert
            noch Netzaufrufe ausgeführt.
          </p>
        </div>
      ) : null}
      {overview?.available ? (
        <form
          className="study-form-grid integration-form"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            const element = event.currentTarget;
            const form = new FormData(element);
            void action(
              () =>
                api.createGitHubConnection({
                  name: valueFrom(form, "name"),
                  token: valueFrom(form, "token"),
                }),
              "Der Token wurde verschlüsselt gespeichert; die Verbindung bleibt deaktiviert.",
            ).then((complete) => {
              if (complete) element.reset();
            });
          }}
        >
          <label>
            Bezeichnung
            <input name="name" maxLength={100} required />
          </label>
          <label>
            GitHub-Token
            <input
              name="token"
              type="password"
              minLength={20}
              maxLength={500}
              autoComplete="new-password"
              required
            />
          </label>
          <button className="primary-button" disabled={pending}>
            Verschlüsselt konfigurieren
          </button>
          <p className="privacy-note">
            Empfohlen: fein abgestimmter Token mit Metadata, Issues, Pull
            requests, Contents und Actions jeweils nur lesend für ausgewählte
            Repositories.
          </p>
        </form>
      ) : null}
      {overview?.connections.map((connection) => {
        const values = repositories[connection.id] ?? [];
        return (
          <article
            className="integration-card github-connection-card"
            key={connection.id}
          >
            <div className="section-heading">
              <div>
                <h3>{connection.name}</h3>
                <p>Konto: {connection.accountLogin ?? "noch nicht geprüft"}</p>
              </div>
              <span className={`status-pill ${connection.status}`}>
                {connection.enabled ? "Aktiv · nur Lesen" : "Deaktiviert"}
              </span>
            </div>
            <p>
              Letzter Test: {connection.lastTestedAt ?? "noch nicht getestet"} ·
              Letzter Abruf: {connection.lastFetchedAt ?? "noch kein Abruf"} ·
              Rate Limit: {connection.rateLimit.remaining ?? "unbekannt"}
            </p>
            {connection.lastErrorCode ? (
              <p className="conflict-banner">
                Fehlercode: {connection.lastErrorCode}
              </p>
            ) : null}
            <div className="button-row">
              <button
                className={
                  connection.enabled ? "secondary-button" : "primary-button"
                }
                disabled={pending}
                onClick={() =>
                  void action(
                    () =>
                      api.setGitHubConnectionEnabled(
                        connection.id,
                        !connection.enabled,
                      ),
                    connection.enabled
                      ? "Die GitHub-Verbindung wurde deaktiviert."
                      : "Die read-only-GitHub-Verbindung wurde aktiviert.",
                  )
                }
              >
                {connection.enabled
                  ? "GitHub deaktivieren"
                  : "Read-only aktivieren"}
              </button>
              <button
                className="secondary-button"
                disabled={!connection.enabled || pending}
                onClick={() =>
                  void action(
                    () => api.testGitHubConnection(connection.id),
                    "Die GitHub-Verbindung wurde erfolgreich getestet.",
                  )
                }
              >
                Verbindung testen
              </button>
              <button
                className="secondary-button"
                disabled={!connection.enabled || pending}
                onClick={() => void loadRepositories(connection)}
              >
                Repositories laden
              </button>
              <button
                className="danger-button"
                disabled={pending}
                onClick={() => setConfirmRevoke(connection.id)}
              >
                Token widerrufen
              </button>
            </div>
            {confirmRevoke === connection.id ? (
              <div className="confirmation-panel" role="alert">
                <p>Verbindung und verschlüsselten Token endgültig löschen?</p>
                <button
                  className="danger-button"
                  onClick={() =>
                    void action(
                      () => api.revokeGitHubConnection(connection.id),
                      "Der lokale GitHub-Zugang wurde widerrufen.",
                    ).then(() => setConfirmRevoke(null))
                  }
                >
                  Endgültig widerrufen
                </button>
                <button
                  className="secondary-button"
                  onClick={() => setConfirmRevoke(null)}
                >
                  Abbrechen
                </button>
              </div>
            ) : null}
            {values.length > 0 ? (
              <div className="study-form-grid import-controls">
                <label>
                  Repository
                  <select
                    value={selected[connection.id] ?? ""}
                    onChange={(event) =>
                      setSelected((current) => ({
                        ...current,
                        [connection.id]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Bitte auswählen</option>
                    {values.map((repository) => (
                      <option key={repository.id} value={repository.fullName}>
                        {repository.fullName}
                        {repository.private ? " · privat" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="secondary-button"
                  disabled={!selected[connection.id] || pending}
                  onClick={() => void loadSnapshot(connection.id)}
                >
                  Aktuellen Stand lesen
                </button>
              </div>
            ) : null}
          </article>
        );
      })}
      {snapshot ? <RepositorySnapshot snapshot={snapshot} /> : null}
      <p className="privacy-note">
        Repository-Inhalte werden nicht dauerhaft kopiert. Externe Texte sind
        nicht vertrauenswürdig und lösen niemals Schreibaktionen aus.
      </p>
    </section>
  );
};

const RepositorySnapshot = ({
  snapshot,
}: {
  snapshot: GitHubRepositorySnapshotResponse;
}) => (
  <div className="github-snapshot" aria-label="GitHub-Repository-Stand">
    <h3>{snapshot.repository.fullName}</h3>
    <p>
      {snapshot.repository.description ?? "Keine Beschreibung"} ·
      Standardbranch: {snapshot.repository.defaultBranch}
    </p>
    <SnapshotList
      title="Issues"
      values={snapshot.issues.map(
        (item) => `#${item.number} ${item.title} · ${item.state}`,
      )}
    />
    <SnapshotList
      title="Pull Requests"
      values={snapshot.pullRequests.map(
        (item) =>
          `#${item.number} ${item.title} · ${item.draft ? "Entwurf" : item.state}`,
      )}
    />
    <SnapshotList
      title="Commits"
      values={snapshot.commits.map(
        (item) => `${item.sha.slice(0, 7)} ${item.message}`,
      )}
    />
    <SnapshotList
      title="Releases"
      values={snapshot.releases.map(
        (item) => `${item.tagName} · ${item.name ?? "ohne Namen"}`,
      )}
    />
    <SnapshotList
      title="CI-Status"
      values={snapshot.ciRuns.map(
        (item) =>
          `${item.name} · ${item.status}${item.conclusion ? `/${item.conclusion}` : ""}`,
      )}
    />
  </div>
);

const SnapshotList = ({
  title,
  values,
}: {
  title: string;
  values: string[];
}) => (
  <section>
    <h4>{title}</h4>
    {values.length > 0 ? (
      <ul>
        {values.map((value, index) => (
          <li key={`${title}-${index}`}>{value}</li>
        ))}
      </ul>
    ) : (
      <p>Keine Einträge im begrenzten Abruf.</p>
    )}
  </section>
);
