import type {
  CalendarResponse,
  ExternalCalDavConnectionResponse,
  ExternalCalDavImportPreviewResponse,
  ExternalCalDavOverviewResponse,
} from "@lifeos/contracts";
import { useEffect, useState } from "react";

import { api, ApiClientError } from "../api";

const message = (error: unknown) =>
  error instanceof ApiClientError
    ? error.message
    : "Die externe CalDAV-Aktion konnte nicht abgeschlossen werden.";
const formString = (form: FormData, field: string) => {
  const value = form.get(field);
  return typeof value === "string" ? value : "";
};
const importActionLabel = {
  create: "Neu",
  unchanged: "Unverändert",
  conflict: "Konflikt",
  invalid: "Ungültig",
} as const;

export const IntegrationsWorkspace = ({
  calendars,
}: {
  calendars: CalendarResponse[];
}) => {
  const [overview, setOverview] =
    useState<ExternalCalDavOverviewResponse | null>(null);
  const [preview, setPreview] =
    useState<ExternalCalDavImportPreviewResponse | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [selectedExternal, setSelectedExternal] = useState<
    Record<string, string>
  >({});
  const [selectedLocal, setSelectedLocal] = useState<Record<string, string>>(
    {},
  );

  const load = async () => {
    setPending(true);
    setError(null);
    try {
      setOverview(await api.getExternalCalDav());
    } catch (caught) {
      setError(message(caught));
    } finally {
      setPending(false);
    }
  };
  useEffect(() => {
    let active = true;
    api
      .getExternalCalDav()
      .then((value) => {
        if (active) setOverview(value);
      })
      .catch((caught: unknown) => {
        if (active) setError(message(caught));
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
      setError(message(caught));
      setPending(false);
      return false;
    }
  };

  if (!overview && pending)
    return (
      <main className="page-content integrations-workspace">
        <p role="status">Integrationsstatus wird lokal geladen …</p>
      </main>
    );

  return (
    <main className="page-content integrations-workspace">
      <header className="page-heading">
        <div>
          <span className="eyebrow">Optional und read-only</span>
          <h1>Integrationen</h1>
          <p>
            Externe Netzzugriffe bleiben standardmäßig aus. CalDAV importiert
            nur nach Aktivierung, Vorschau und erneuter Bestätigung.
          </p>
        </div>
        <button
          className="secondary-button"
          onClick={() => void load()}
          disabled={pending}
        >
          Status aktualisieren
        </button>
      </header>

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

      {overview && !overview.available ? (
        <section className="empty-state">
          <h2>Externe Verbindungen sind sicher deaktiviert</h2>
          <p>
            Auf diesem lokalen System fehlt der Integrationsschlüssel. Ohne ihn
            werden weder Zugangsdaten gespeichert noch Netzwerkzugriffe
            ausgeführt.
          </p>
        </section>
      ) : null}

      {overview?.available ? (
        <section className="study-section">
          <h2>CalDAV-Verbindung konfigurieren</h2>
          <p className="privacy-note">
            Benutzername und Passwort werden nur an die lokale API gesendet,
            dort verschlüsselt und niemals wieder angezeigt.
          </p>
          <form
            className="study-form-grid integration-form"
            autoComplete="off"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const element = event.currentTarget;
              void action(
                () =>
                  api.createExternalCalDav({
                    name: formString(form, "name"),
                    baseUrl: formString(form, "baseUrl"),
                    username: formString(form, "username"),
                    password: formString(form, "password"),
                  }),
                "Die Verbindung wurde verschlüsselt gespeichert und bleibt deaktiviert.",
              ).then((completed) => {
                if (completed) element.reset();
              });
            }}
          >
            <label>
              Bezeichnung
              <input name="name" maxLength={100} required />
            </label>
            <label>
              HTTPS-CalDAV-Adresse
              <input name="baseUrl" type="url" maxLength={2048} required />
            </label>
            <label>
              Benutzername
              <input
                name="username"
                maxLength={500}
                autoComplete="off"
                required
              />
            </label>
            <label>
              Passwort
              <input
                name="password"
                type="password"
                maxLength={1024}
                autoComplete="new-password"
                required
              />
            </label>
            <button className="primary-button" disabled={pending}>
              Verschlüsselt konfigurieren
            </button>
          </form>
        </section>
      ) : null}

      {overview?.connections.map((connection) => (
        <ConnectionCard
          key={connection.id}
          connection={connection}
          calendars={calendars}
          pending={pending}
          selectedExternal={selectedExternal[connection.id] ?? ""}
          selectedLocal={selectedLocal[connection.id] ?? calendars[0]?.id ?? ""}
          preview={
            preview &&
            preview.externalCalendarId === selectedExternal[connection.id]
              ? preview
              : null
          }
          confirmRevoke={confirmRevoke === connection.id}
          onSelectExternal={(value) =>
            setSelectedExternal((current) => ({
              ...current,
              [connection.id]: value,
            }))
          }
          onSelectLocal={(value) =>
            setSelectedLocal((current) => ({
              ...current,
              [connection.id]: value,
            }))
          }
          onEnable={(enabled) =>
            void action(
              () => api.setExternalCalDavEnabled(connection.id, enabled),
              enabled
                ? "Die read-only-Verbindung wurde ausdrücklich aktiviert."
                : "Die externe Verbindung wurde deaktiviert.",
            )
          }
          onTest={() =>
            void action(
              () => api.testExternalCalDav(connection.id),
              "Die Verbindung wurde erfolgreich getestet.",
            )
          }
          onList={() =>
            void action(
              () => api.listExternalCalDavCalendars(connection.id),
              "Die externen Kalender wurden kontrolliert geladen.",
            )
          }
          onPreview={() => {
            void (async () => {
              setPending(true);
              setError(null);
              setSuccess(null);
              try {
                setPreview(
                  await api.previewExternalCalDavImport(
                    connection.id,
                    selectedExternal[connection.id] ?? "",
                    selectedLocal[connection.id] ?? calendars[0]?.id ?? "",
                  ),
                );
              } catch (caught) {
                setError(message(caught));
              } finally {
                setPending(false);
              }
            })();
          }}
          onCommit={() => {
            if (!preview) return;
            void action(
              () =>
                api.commitExternalCalDavImport(
                  connection.id,
                  preview.externalImportId,
                ),
              "Die ausgewählten externen Ereignisse wurden read-only importiert.",
            ).then(() => setPreview(null));
          }}
          onRequestRevoke={() => setConfirmRevoke(connection.id)}
          onCancelRevoke={() => setConfirmRevoke(null)}
          onRevoke={() =>
            void action(
              () => api.revokeExternalCalDav(connection.id),
              "Die Verbindung und ihre verschlüsselten Zugangsdaten wurden widerrufen.",
            ).then(() => setConfirmRevoke(null))
          }
        />
      ))}
    </main>
  );
};

const ConnectionCard = ({
  connection,
  calendars,
  pending,
  selectedExternal,
  selectedLocal,
  preview,
  confirmRevoke,
  onSelectExternal,
  onSelectLocal,
  onEnable,
  onTest,
  onList,
  onPreview,
  onCommit,
  onRequestRevoke,
  onCancelRevoke,
  onRevoke,
}: {
  connection: ExternalCalDavConnectionResponse;
  calendars: CalendarResponse[];
  pending: boolean;
  selectedExternal: string;
  selectedLocal: string;
  preview: ExternalCalDavImportPreviewResponse | null;
  confirmRevoke: boolean;
  onSelectExternal: (value: string) => void;
  onSelectLocal: (value: string) => void;
  onEnable: (enabled: boolean) => void;
  onTest: () => void;
  onList: () => void;
  onPreview: () => void;
  onCommit: () => void;
  onRequestRevoke: () => void;
  onCancelRevoke: () => void;
  onRevoke: () => void;
}) => (
  <section className="study-section integration-card">
    <div className="section-heading">
      <div>
        <h2>{connection.name}</h2>
        <p>{connection.baseUrl}</p>
      </div>
      <span className={`status-pill ${connection.status}`}>
        {connection.enabled ? "Aktiv · nur Lesen" : "Deaktiviert"}
      </span>
    </div>
    <p>
      Letzter Test: {connection.lastTestedAt ?? "noch nicht getestet"} · Letzter
      Import: {connection.lastSyncAt ?? "noch kein Import"} · Zugeordnete
      Ereignisse: {connection.importedEventCount}
    </p>
    {connection.lastErrorCode ? (
      <p className="conflict-banner">Fehlercode: {connection.lastErrorCode}</p>
    ) : null}
    <div className="button-row">
      <button
        className={connection.enabled ? "secondary-button" : "primary-button"}
        disabled={pending}
        onClick={() => onEnable(!connection.enabled)}
      >
        {connection.enabled
          ? "Verbindung deaktivieren"
          : "Read-only aktivieren"}
      </button>
      <button
        className="secondary-button"
        disabled={!connection.enabled || pending}
        onClick={onTest}
      >
        Verbindung testen
      </button>
      <button
        className="secondary-button"
        disabled={!connection.enabled || pending}
        onClick={onList}
      >
        Kalender auflisten
      </button>
      <button
        className="danger-button"
        disabled={pending}
        onClick={onRequestRevoke}
      >
        Zugang widerrufen
      </button>
    </div>
    {confirmRevoke ? (
      <div className="confirmation-panel" role="alert">
        <p>Verbindung und verschlüsselte Zugangsdaten endgültig löschen?</p>
        <button className="danger-button" onClick={onRevoke}>
          Endgültig widerrufen
        </button>
        <button className="secondary-button" onClick={onCancelRevoke}>
          Abbrechen
        </button>
      </div>
    ) : null}
    {connection.enabled && connection.calendars.length > 0 ? (
      <div className="study-form-grid import-controls">
        <label>
          Externer Kalender
          <select
            value={selectedExternal}
            onChange={(event) => onSelectExternal(event.target.value)}
          >
            <option value="">Bitte auswählen</option>
            {connection.calendars.map((calendar) => (
              <option key={calendar.id} value={calendar.id}>
                {calendar.displayName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Lokales Importziel
          <select
            value={selectedLocal}
            onChange={(event) => onSelectLocal(event.target.value)}
          >
            {calendars.map((calendar) => (
              <option key={calendar.id} value={calendar.id}>
                {calendar.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button"
          disabled={!selectedExternal || !selectedLocal || pending}
          onClick={onPreview}
        >
          Importvorschau erstellen
        </button>
      </div>
    ) : null}
    {preview ? (
      <div className="ics-preview">
        <p>
          <strong>{preview.preview.totalEvents} Ereignisse:</strong>{" "}
          {preview.preview.creatableEvents} neu,{" "}
          {preview.preview.unchangedEvents} unverändert,{" "}
          {preview.preview.conflictingEvents} Konflikte,{" "}
          {preview.preview.invalidEvents} ungültig.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>UID</th>
                <th>Titel</th>
                <th>Hinweis</th>
              </tr>
            </thead>
            <tbody>
              {preview.preview.items.map((item) => (
                <tr key={`${item.index}-${item.uid ?? "invalid"}`}>
                  <td>
                    <span className={`ics-action ${item.action}`}>
                      {importActionLabel[item.action]}
                    </span>
                  </td>
                  <td>
                    <code>{item.uid ?? "–"}</code>
                  </td>
                  <td>{item.title ?? "–"}</td>
                  <td>{item.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          className="primary-button"
          disabled={!preview.preview.canCommit || pending}
          onClick={onCommit}
        >
          Read-only-Import bestätigen
        </button>
        {!preview.preview.canCommit ? (
          <p className="privacy-note">
            Konflikte und ungültige externe Ereignisse werden nicht geschrieben.
            Lade nach der Klärung eine neue Vorschau.
          </p>
        ) : null}
      </div>
    ) : null}
    <p className="privacy-note">
      Schreiben, Löschen und bidirektionale Synchronisation zum externen Dienst
      sind in diesem sicheren ersten Umfang nicht implementiert.
    </p>
  </section>
);
