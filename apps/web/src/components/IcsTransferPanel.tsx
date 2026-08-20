import type { IcsImportPreviewResponse } from "@lifeos/contracts";
import { useState } from "react";

import { api, ApiClientError } from "../api";

const errorMessage = (error: unknown) =>
  error instanceof ApiClientError
    ? error.message
    : "Die iCalendar-Datei konnte nicht verarbeitet werden.";
const actionLabel = {
  create: "Neu",
  unchanged: "Unverändert",
  conflict: "Konflikt",
  invalid: "Ungültig",
} as const;

export const IcsTransferPanel = ({
  calendarId,
  onImported,
}: {
  calendarId: string | null;
  onImported: () => void;
}) => {
  const [preview, setPreview] = useState<IcsImportPreviewResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const previewFile = async (file: File | undefined) => {
    if (!file || !calendarId) return;
    setPending(true);
    setError(null);
    setSuccess(null);
    setPreview(null);
    try {
      if (file.size > 2 * 1024 * 1024)
        throw new Error("Die iCalendar-Datei darf höchstens 2 MiB groß sein.");
      setPreview(await api.previewIcsImport(calendarId, await file.text()));
    } catch (caught) {
      setError(
        caught instanceof Error && !(caught instanceof ApiClientError)
          ? caught.message
          : errorMessage(caught),
      );
    } finally {
      setPending(false);
    }
  };

  const commit = async () => {
    if (!calendarId || !preview) return;
    setPending(true);
    setError(null);
    try {
      const result = await api.commitIcsImport(calendarId, preview.previewId);
      setSuccess(
        `${result.createdEvents} Ereignisse importiert, ${result.unchangedEvents} unverändert übersprungen.`,
      );
      setPreview(null);
      onImported();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  const exportCalendar = async () => {
    if (!calendarId) return;
    setPending(true);
    setError(null);
    try {
      const source = await api.exportIcs(calendarId);
      const url = URL.createObjectURL(
        new Blob([source], { type: "text/calendar;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `lifeos-calendar-${calendarId}.ics`;
      link.click();
      URL.revokeObjectURL(url);
      setSuccess("Der lokale ICS-Export wurde erstellt.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="ics-panel" aria-labelledby="ics-transfer-title">
      <div className="section-heading">
        <div>
          <h2 id="ics-transfer-title">ICS-Import und -Export</h2>
          <p>
            Prüfe lokale iCalendar-Dateien vor dem Schreiben. Bestehende
            Ereignisse werden niemals automatisch überschrieben.
          </p>
        </div>
        <button
          className="secondary-button"
          onClick={() => void exportCalendar()}
          disabled={!calendarId || pending}
        >
          Kalender exportieren
        </button>
      </div>
      <label className="file-picker">
        ICS-Datei für Vorschau
        <input
          type="file"
          accept=".ics,text/calendar"
          disabled={!calendarId || pending}
          onChange={(event) => void previewFile(event.target.files?.[0])}
        />
        <small>Maximal 2 MiB und 500 Ereignisse.</small>
      </label>
      {pending ? (
        <p role="status">iCalendar-Datei wird lokal geprüft …</p>
      ) : null}
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
      {preview ? (
        <div className="ics-preview">
          <p>
            <strong>{preview.totalEvents} Ereignisse:</strong>{" "}
            {preview.creatableEvents} neu, {preview.unchangedEvents}{" "}
            unverändert, {preview.conflictingEvents} Konflikte,{" "}
            {preview.invalidEvents} ungültig.
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
                {preview.items.map((item) => (
                  <tr key={`${item.index}-${item.uid ?? "invalid"}`}>
                    <td>
                      <span className={`ics-action ${item.action}`}>
                        {actionLabel[item.action]}
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
            disabled={!preview.canCommit || pending}
            onClick={() => void commit()}
          >
            Vorschau verbindlich importieren
          </button>
          {!preview.canCommit ? (
            <p className="privacy-note">
              Löse alle Konflikte und ungültigen Ereignisse in der Datei und
              erstelle anschließend eine neue Vorschau.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
