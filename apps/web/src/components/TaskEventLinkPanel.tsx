import type {
  CalendarEventResponse,
  CreateTaskEventLinkRequest,
  TaskEventLinkResponse,
  TaskResponse,
} from "@lifeos/contracts";
import { useMemo, useState } from "react";

import { LinkIcon, UnlinkIcon } from "./Icons";

type Target =
  | { kind: "task"; taskId: string }
  | { kind: "event"; calendarId: string; eventUid: string };

interface TaskEventLinkPanelProps {
  target: Target;
  links: TaskEventLinkResponse[];
  tasks: TaskResponse[];
  events: CalendarEventResponse[];
  selectedCalendarId: string | null;
  pending: boolean;
  onLink: (input: CreateTaskEventLinkRequest) => Promise<void>;
  onUnlink: (linkId: string) => Promise<void>;
}

export const TaskEventLinkPanel = ({
  target,
  links,
  tasks,
  events,
  selectedCalendarId,
  pending,
  onLink,
  onUnlink,
}: TaskEventLinkPanelProps) => {
  const [selection, setSelection] = useState("");
  const [error, setError] = useState<string | null>(null);
  const relevantLinks = links.filter((link) =>
    target.kind === "task"
      ? link.task.id === target.taskId
      : link.event.calendarId === target.calendarId &&
        link.event.uid === target.eventUid,
  );
  const options = useMemo(() => {
    if (target.kind === "task") {
      const linkedEventUids = new Set(
        relevantLinks
          .filter((link) => link.event.calendarId === selectedCalendarId)
          .map((link) => link.event.uid),
      );
      return events
        .filter((event) => !linkedEventUids.has(event.uid))
        .map((event) => ({ value: event.uid, label: event.title }));
    }
    const linkedTaskIds = new Set(relevantLinks.map((link) => link.task.id));
    return tasks
      .filter((task) => !task.archivedAt && !linkedTaskIds.has(task.id))
      .map((task) => ({ value: task.id, label: task.title }));
  }, [events, relevantLinks, selectedCalendarId, target.kind, tasks]);

  const createLink = async () => {
    if (!selection) return;
    setError(null);
    try {
      if (target.kind === "task") {
        if (!selectedCalendarId) return;
        await onLink({
          taskId: target.taskId,
          calendarId: selectedCalendarId,
          eventUid: selection,
        });
      } else {
        await onLink({
          taskId: selection,
          calendarId: target.calendarId,
          eventUid: target.eventUid,
        });
      }
      setSelection("");
    } catch {
      setError("Die Verknüpfung konnte nicht gespeichert werden.");
    }
  };

  const removeLink = async (linkId: string) => {
    setError(null);
    try {
      await onUnlink(linkId);
    } catch {
      setError("Die Verknüpfung konnte nicht entfernt werden.");
    }
  };

  return (
    <section className="task-event-links full-field" aria-label="Verknüpfungen">
      <div className="link-panel-heading">
        <div>
          <h3>Aufgabe und Termin</h3>
          <p>
            Die Beziehung verbindet beide Objekte, kopiert aber weder Status
            noch Zeiten.
          </p>
        </div>
        <LinkIcon />
      </div>

      {relevantLinks.length > 0 ? (
        <ul className="link-list">
          {relevantLinks.map((link) => {
            const counterpart = target.kind === "task" ? link.event : link.task;
            return (
              <li key={link.id}>
                <span>
                  <strong>
                    {counterpart.title ??
                      (target.kind === "task"
                        ? "Termin nicht mehr verfügbar"
                        : "Aufgabe nicht mehr verfügbar")}
                  </strong>
                  <small>
                    {counterpart.available
                      ? target.kind === "task"
                        ? "Verknüpfter Termin"
                        : "Verknüpfte Aufgabe"
                      : "Verknüpfung bleibt zur Nachvollziehbarkeit erhalten"}
                  </small>
                </span>
                <button
                  type="button"
                  className="text-button danger-text"
                  disabled={pending}
                  onClick={() => void removeLink(link.id)}
                  aria-label={`Verknüpfung mit ${counterpart.title ?? "nicht verfügbarem Objekt"} entfernen`}
                >
                  <UnlinkIcon /> Entfernen
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="empty-link-copy">Noch keine Verknüpfung.</p>
      )}

      <div className="link-create-row">
        <label>
          <span>
            {target.kind === "task" ? "Termin auswählen" : "Aufgabe auswählen"}
          </span>
          <select
            value={selection}
            onChange={(input) => setSelection(input.target.value)}
            disabled={pending || options.length === 0}
          >
            <option value="">
              {options.length > 0
                ? "Bitte auswählen"
                : target.kind === "task"
                  ? "Kein weiterer Termin verfügbar"
                  : "Keine weitere Aufgabe verfügbar"}
            </option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="secondary-button"
          disabled={pending || !selection}
          onClick={() => void createLink()}
        >
          <LinkIcon /> Verknüpfen
        </button>
      </div>
      {target.kind === "task" && selectedCalendarId ? (
        <small className="link-scope-note">
          Termine aus dem aktuell ausgewählten Kalender.
        </small>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
};
