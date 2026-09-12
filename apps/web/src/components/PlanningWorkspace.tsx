import type {
  CreateAvailabilityWindowRequest,
  PlanningArea,
  PlanningAutomationResponse,
  PlanningItemKind,
  PlanningItemResponse,
  PlanningProposalResponse,
  PlanningResponse,
} from "@lifeos/contracts";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../api";
import {
  eachPlanningDate,
  shiftPlanningRange,
  todayInTimezone,
  weekRange,
  type DateRange,
} from "../planning";
import { ClockIcon, PlanIcon, PlusIcon, TrashIcon } from "./Icons";

const areaLabels: Record<PlanningArea, string> = {
  calendar: "Kalender",
  study: "Studium",
  work: "Arbeit",
  tasks: "Aufgaben",
  projects: "Projekte",
  fitness: "Fitness",
  availability: "Verfügbarkeit",
};
const kindLabels: Record<PlanningItemKind, string> = {
  fixed_event: "Fester Termin",
  deadline: "Frist",
  planned_task: "Geplante Aufgabe",
  actual_time: "Tatsächliche Zeit",
  availability: "Persönliche Verfügbarkeit",
};
const weekdayLabels = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
];
const automationIssueLabels: Record<string, string> = {
  missing_settings: "Die persönliche Zeitzone fehlt.",
  no_availability: "Keine persönliche Verfügbarkeit vorhanden.",
  missing_task_effort:
    "Mindestens einer Aufgabe fehlt ein geschätzter Aufwand.",
  missing_task_deadline: "Mindestens einer Aufgabe fehlt eine Fälligkeit.",
  capacity_exceeded:
    "Die bekannten Aufgaben überschreiten die freien Zeitfenster.",
  source_limit: "Eine Quelle überschreitet das sichere Auswertungslimit.",
  unsupported_recurrence:
    "Eine Terminserie kann nicht sicher ausgewertet werden.",
  recurrence_limit: "Eine Terminserie überschreitet das Auswertungslimit.",
  fitness_duration_missing:
    "Einer geplanten Trainingseinheit fehlt eine belastbare Dauer.",
  effort_limit:
    "Ein Aufgabenaufwand überschreitet das Blocklimit von acht Stunden.",
  generation_failed: "Die lokale Vorschau konnte nicht erzeugt werden.",
};
const timeToMinutes = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return hours! * 60 + minutes!;
};
const formatMinutes = (value: number) =>
  `${Math.floor(value / 60)} h ${value % 60} min`;
const minutesToClock = (value: number) =>
  `${Math.floor(value / 60)
    .toString()
    .padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
const formatDate = (date: string) =>
  new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00.000Z`));
const formatTime = (item: PlanningItemResponse, timezone: string) => {
  if (!item.startsAt) return item.date;
  const formatter = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
  return item.endsAt
    ? `${formatter.format(new Date(item.startsAt))}–${formatter.format(new Date(item.endsAt))}`
    : formatter.format(new Date(item.startsAt));
};

interface Props {
  planning: PlanningResponse | null;
  range: DateRange;
  timezone: string;
  weekStartsOn: number;
  loading: boolean;
  saving: boolean;
  error: string | null;
  success: string | null;
  onReload: () => void;
  onRangeChange: (range: DateRange) => void;
  onCreateAvailability: (
    value: CreateAvailabilityWindowRequest,
  ) => Promise<void>;
  onDeleteAvailability: (id: string) => Promise<void>;
}

export const PlanningWorkspace = ({
  planning,
  range,
  timezone,
  weekStartsOn,
  loading,
  saving,
  error,
  success,
  onReload,
  onRangeChange,
  onCreateAvailability,
  onDeleteAvailability,
}: Props) => {
  const [mode, setMode] = useState<"day" | "week" | "agenda">("week");
  const [dayDate, setDayDate] = useState(() => todayInTimezone(timezone));
  const [areas, setAreas] = useState<Set<PlanningArea>>(
    new Set([
      "calendar",
      "study",
      "work",
      "tasks",
      "projects",
      "fitness",
      "availability",
    ]),
  );
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [proposals, setProposals] = useState<PlanningProposalResponse[]>([]);
  const [proposalIssues, setProposalIssues] = useState<string[]>([]);
  const [proposalMessage, setProposalMessage] = useState<string | null>(null);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [selectedProposals, setSelectedProposals] = useState<Set<string>>(
    new Set(),
  );
  const [openProposal, setOpenProposal] = useState<string | null>(null);
  const [automations, setAutomations] = useState<PlanningAutomationResponse[]>(
    [],
  );
  const visibleItems = useMemo(
    () => planning?.items.filter((item) => areas.has(item.area)) ?? [],
    [areas, planning?.items],
  );
  const visibleIds = useMemo(
    () => new Set(visibleItems.map((item) => item.id)),
    [visibleItems],
  );
  const warnings =
    planning?.warnings.filter(
      (warning) =>
        !warning.itemIds.length ||
        warning.itemIds.some((itemId) => visibleIds.has(itemId)),
    ) ?? [];
  const dates = eachPlanningDate(range);
  const selectedDayDate =
    dayDate >= range.from && dayDate <= range.to ? dayDate : range.from;
  const visibleDates = mode === "day" ? [selectedDayDate] : dates;
  const failureMessage = (reason: unknown) =>
    reason instanceof Error
      ? reason.message
      : "Die lokale Planung konnte nicht verarbeitet werden.";
  const loadProposalControls = async () => {
    const [proposalResult, automationResult] = await Promise.all([
      api.getPlanningProposals(range.from, range.to),
      api.getPlanningAutomations(),
    ]);
    setProposals(proposalResult.proposals);
    setSelectedProposals((current) => {
      const pending = new Set(
        proposalResult.proposals
          .filter((proposal) => proposal.status === "pending")
          .map((proposal) => proposal.id),
      );
      return new Set([...current].filter((id) => pending.has(id)));
    });
    setAutomations(automationResult.automations);
  };
  useEffect(() => {
    let active = true;
    void Promise.all([
      api.getPlanningProposals(range.from, range.to),
      api.getPlanningAutomations(),
    ])
      .then(([proposalResult, automationResult]) => {
        if (!active) return;
        setProposals(proposalResult.proposals);
        setSelectedProposals(new Set());
        setProposalIssues([]);
        setAutomations(automationResult.automations);
        setProposalError(null);
      })
      .catch((reason: unknown) => {
        if (active) setProposalError(failureMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [range.from, range.to]);
  const toggleArea = (area: PlanningArea) => {
    setAreas((current) => {
      const next = new Set(current);
      if (next.has(area)) next.delete(area);
      else next.add(area);
      return next;
    });
  };
  return (
    <main className="page-content planning-page">
      <header className="workspace-heading planning-heading">
        <div>
          <p className="eyebrow">Gemeinsame Zeitplanung</p>
          <h1>Woche und Agenda aus deinen Quelldaten</h1>
          <p>
            Feste Termine, Fristen, geplante Aufgaben, tatsächliche Zeit und
            Verfügbarkeit bleiben klar getrennt. Konflikte werden nur erklärt.
          </p>
        </div>
        <button
          className="secondary-button"
          onClick={onReload}
          disabled={loading}
        >
          Neu laden
        </button>
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
      <section className="planning-toolbar panel" aria-label="Planung steuern">
        <div className="planning-navigation">
          <button
            className="secondary-button"
            onClick={() => onRangeChange(shiftPlanningRange(range, -7))}
          >
            Vorherige Woche
          </button>
          <strong>
            {formatDate(range.from)} – {formatDate(range.to)}
          </strong>
          <button
            className="secondary-button"
            onClick={() => onRangeChange(shiftPlanningRange(range, 7))}
          >
            Nächste Woche
          </button>
          <button
            className="text-button"
            onClick={() => onRangeChange(weekRange(timezone, weekStartsOn))}
          >
            Aktuelle Woche
          </button>
        </div>
        <div
          className="planning-mode"
          role="group"
          aria-label="Planungsansicht"
        >
          <button
            className={mode === "day" ? "active" : ""}
            onClick={() => setMode("day")}
          >
            Tag
          </button>
          <button
            className={mode === "week" ? "active" : ""}
            onClick={() => setMode("week")}
          >
            Woche
          </button>
          <button
            className={mode === "agenda" ? "active" : ""}
            onClick={() => setMode("agenda")}
          >
            Agenda
          </button>
        </div>
        {mode === "day" ? (
          <label className="planning-day-picker">
            Planungstag
            <input
              type="date"
              value={selectedDayDate}
              min={range.from}
              max={range.to}
              onChange={(event) => setDayDate(event.target.value)}
            />
          </label>
        ) : null}
        <fieldset className="planning-area-filters">
          <legend>Bereiche ein- oder ausblenden</legend>
          {(Object.keys(areaLabels) as PlanningArea[]).map((area) => (
            <label key={area}>
              <input
                type="checkbox"
                checked={areas.has(area)}
                onChange={() => toggleArea(area)}
              />
              {areaLabels[area]}
            </label>
          ))}
        </fieldset>
      </section>
      {loading && !planning ? (
        <div className="empty-state" role="status">
          Gemeinsame Planung wird geladen …
        </div>
      ) : null}
      {warnings.length ? (
        <section
          className="planning-warnings"
          aria-labelledby="planning-warning-title"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">HINWEISE</p>
              <h2 id="planning-warning-title">Konflikte und Überlastung</h2>
            </div>
            <span>{warnings.length}</span>
          </div>
          <ul>
            {warnings.map((warning) => (
              <li key={warning.id} className={warning.severity}>
                <strong>{formatDate(warning.date)}</strong>
                <span>{warning.message}</span>
              </li>
            ))}
          </ul>
          <p className="privacy-note">
            Hinweise erklären nur gespeicherte Regeln. Termine und Aufgaben
            werden niemals automatisch verschoben.
          </p>
        </section>
      ) : planning ? (
        <div className="planning-clear" role="status">
          <PlanIcon />
          <span>
            Keine Konflikte oder Überlastungen im sichtbaren Zeitraum erkannt.
          </span>
        </div>
      ) : null}
      {planning && mode === "week" ? (
        <section
          className="planning-week"
          aria-label="Gemeinsame Wochenansicht"
        >
          {visibleDates.map((date) => (
            <PlanningDay
              key={date}
              date={date}
              timezone={timezone}
              items={visibleItems.filter((item) => item.date === date)}
            />
          ))}
        </section>
      ) : planning && mode === "day" ? (
        <section
          className="planning-agenda"
          aria-label="Gemeinsame Tagesansicht"
        >
          <PlanningDay
            date={selectedDayDate}
            timezone={timezone}
            items={visibleItems.filter((item) => item.date === selectedDayDate)}
            agenda
          />
        </section>
      ) : planning ? (
        <section className="planning-agenda" aria-label="Gemeinsame Agenda">
          {dates.map((date) => {
            const items = visibleItems.filter((item) => item.date === date);
            return items.length ? (
              <PlanningDay
                key={date}
                date={date}
                timezone={timezone}
                items={items}
                agenda
              />
            ) : null;
          })}
          {!visibleItems.length ? (
            <div className="empty-state">
              <ClockIcon />
              <h2>Keine Einträge im gewählten Filter</h2>
              <p>
                Die Filter ändern nur die Darstellung und keine gespeicherten
                Daten.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}
      <section
        className="planning-proposals panel"
        aria-labelledby="proposal-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">LOKALE KI-PLANUNG</p>
            <h2 id="proposal-title">Unverbindliche Planungsvorschläge</h2>
          </div>
          <button
            className="primary-button"
            disabled={proposalBusy}
            onClick={() => {
              setProposalBusy(true);
              setProposalError(null);
              setProposalMessage(null);
              const proposalRange =
                mode === "day"
                  ? {
                      from: selectedDayDate,
                      to: selectedDayDate,
                      view: "day" as const,
                    }
                  : { from: range.from, to: range.to, view: "week" as const };
              void api
                .generatePlanningProposals(proposalRange)
                .then(async (result) => {
                  setProposals(result.proposals);
                  setSelectedProposals(new Set());
                  setProposalIssues(
                    result.issues.map((issue) => issue.message),
                  );
                  setProposalMessage(
                    result.proposals.length
                      ? `${result.proposals.length} lokale Vorschläge wurden nachvollziehbar vorbereitet.`
                      : "Es wurden keine belastbaren Vorschläge erzeugt.",
                  );
                  await loadProposalControls();
                })
                .catch((reason: unknown) =>
                  setProposalError(failureMessage(reason)),
                )
                .finally(() => setProposalBusy(false));
            }}
          >
            {mode === "day"
              ? "Tagesvorschläge erzeugen"
              : "Wochenvorschläge erzeugen"}
          </button>
        </div>
        <p>
          Die Regeln nutzen nur deine aktiven LifeOS-Daten. Erst eine sichtbare
          Bestätigung plant die jeweilige Aufgabe über den bestehenden
          Aufgabenservice ein.
        </p>
        {proposalError ? (
          <div className="message error" role="alert">
            {proposalError}
          </div>
        ) : null}
        {proposalMessage ? (
          <div className="message success" role="status">
            {proposalMessage}
          </div>
        ) : null}
        {proposalIssues.length ? (
          <ul className="planning-proposal-issues">
            {proposalIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : null}
        {selectedProposals.size ? (
          <button
            className="secondary-button"
            disabled={proposalBusy}
            onClick={() => {
              setProposalBusy(true);
              void api
                .confirmPlanningProposalGroup([...selectedProposals])
                .then(async (result) => {
                  setProposalMessage(
                    `${result.results.filter((entry) => entry.status === "applied").length} ausgewählte Vorschläge wurden angewendet.`,
                  );
                  setSelectedProposals(new Set());
                  await Promise.all([
                    loadProposalControls(),
                    Promise.resolve(onReload()),
                  ]);
                })
                .catch((reason: unknown) =>
                  setProposalError(failureMessage(reason)),
                )
                .finally(() => setProposalBusy(false));
            }}
          >
            Ausgewählte bestätigen ({selectedProposals.size})
          </button>
        ) : null}
        {proposals.length ? (
          <div className="planning-proposal-list">
            {proposals.map((proposal) => (
              <article
                key={proposal.id}
                className={`planning-proposal ${proposal.status}`}
              >
                <header>
                  {proposal.status === "pending" ? (
                    <input
                      type="checkbox"
                      aria-label={`${proposal.title} für Gruppenbestätigung auswählen`}
                      checked={selectedProposals.has(proposal.id)}
                      onChange={() =>
                        setSelectedProposals((current) => {
                          const next = new Set(current);
                          if (next.has(proposal.id)) next.delete(proposal.id);
                          else next.add(proposal.id);
                          return next;
                        })
                      }
                    />
                  ) : null}
                  <div>
                    <strong>{proposal.title}</strong>
                    <small>
                      {formatProposalWindow(proposal)} ·{" "}
                      {proposalStatusLabel(proposal.status)}
                    </small>
                  </div>
                </header>
                <button
                  className="text-button"
                  onClick={() =>
                    setOpenProposal(
                      openProposal === proposal.id ? null : proposal.id,
                    )
                  }
                >
                  {openProposal === proposal.id
                    ? "Details schließen"
                    : "Quellen und Begründung öffnen"}
                </button>
                {openProposal === proposal.id ? (
                  <div className="planning-proposal-detail">
                    <p>{proposal.reason}</p>
                    <h3>Verwendete Datenquellen</h3>
                    <ul>
                      {proposal.sources.map((source) => (
                        <li key={`${source.type}:${source.id}`}>
                          {source.title} · {source.role}
                          {source.current ? "" : " · zwischenzeitlich geändert"}
                        </li>
                      ))}
                    </ul>
                    <h3>Unsicherheit oder fehlende Daten</h3>
                    {proposal.uncertainties.length ? (
                      <ul>
                        {proposal.uncertainties.map((item) => (
                          <li key={item.code}>{item.message}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>
                        Für diesen Vorschlag wurden keine zusätzlichen
                        Unsicherheiten erkannt.
                      </p>
                    )}
                    <p className="privacy-note">
                      Status: unverbindlicher Vorschlag. Keine Änderung ohne
                      deine Bestätigung.
                    </p>
                  </div>
                ) : null}
                <div className="planning-proposal-actions">
                  {proposal.status === "pending" ? (
                    <>
                      <button
                        className="primary-button"
                        disabled={proposalBusy}
                        onClick={() =>
                          void changeProposal(
                            () => api.confirmPlanningProposal(proposal.id),
                            "Der Vorschlag wurde bestätigt und die Aufgabe eingeplant.",
                          )
                        }
                      >
                        Bestätigen
                      </button>
                      <button
                        className="secondary-button"
                        disabled={proposalBusy}
                        onClick={() =>
                          void changeProposal(
                            () => api.rejectPlanningProposal(proposal.id),
                            "Der Vorschlag wurde abgelehnt.",
                          )
                        }
                      >
                        Ablehnen
                      </button>
                      <button
                        className="text-button"
                        disabled={proposalBusy}
                        onClick={() =>
                          void changeProposal(
                            () => api.discardPlanningProposal(proposal.id),
                            "Der Vorschlag wurde verworfen.",
                          )
                        }
                      >
                        Verwerfen
                      </button>
                    </>
                  ) : ["rejected", "discarded", "conflict"].includes(
                      proposal.status,
                    ) ? (
                    <button
                      className="secondary-button"
                      disabled={proposalBusy}
                      onClick={() =>
                        void changeProposal(
                          () => api.reopenPlanningProposal(proposal.id),
                          "Der Vorschlag kann erneut geprüft werden.",
                        )
                      }
                    >
                      Erneut prüfen
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted-copy">
            Noch keine Vorschläge für den sichtbaren Zeitraum.
          </p>
        )}
      </section>
      <section
        className="planning-automations panel"
        aria-labelledby="automation-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">KONTROLLIERTE AUTOMATIONEN</p>
            <h2 id="automation-title">Lokale Planungsvorschauen</h2>
          </div>
        </div>
        <p>
          Automationen erzeugen ausschließlich Vorschläge. Sie ändern keine
          Aufgaben oder Termine und rufen kein externes Netzwerk auf.
        </p>
        <div className="planning-automation-list">
          {automations.map((automation) => (
            <article key={automation.kind}>
              <div>
                <strong>
                  {automation.kind === "daily_preview"
                    ? "Vorschau für morgen"
                    : "Vorschau für nächste Woche"}
                </strong>
                <small>
                  {automation.enabled ? "Aktiv" : "Deaktiviert"} · täglich
                  geschützt vor Mehrfachausführung
                </small>
                {automation.lastRun ? (
                  <>
                    <small>
                      Letzter Lauf:{" "}
                      {new Date(automation.lastRun.startedAt).toLocaleString(
                        "de-DE",
                        { timeZone: timezone },
                      )}{" "}
                      · {automation.lastRun.status}
                    </small>
                    {automation.lastRun.issueCodes.length ? (
                      <ul className="automation-issues">
                        {automation.lastRun.issueCodes.map((code) => (
                          <li key={code}>
                            {automationIssueLabels[code] ??
                              "Die lokale Vorschau benötigt eine erneute Prüfung."}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                ) : null}
              </div>
              <label className="automation-toggle">
                <input
                  type="checkbox"
                  checked={automation.enabled}
                  disabled={proposalBusy}
                  onChange={(event) => {
                    setProposalBusy(true);
                    void api
                      .updatePlanningAutomation(automation.kind, {
                        enabled: event.target.checked,
                        localMinute: automation.localMinute,
                        weekday: automation.weekday,
                        timezone,
                        maxSuggestions: automation.maxSuggestions,
                      })
                      .then(loadProposalControls)
                      .catch((reason: unknown) =>
                        setProposalError(failureMessage(reason)),
                      )
                      .finally(() => setProposalBusy(false));
                  }}
                />
                {automation.enabled ? "Deaktivieren" : "Aktivieren"}
              </label>
              {automation.enabled && automation.id ? (
                <button
                  className="text-button"
                  disabled={proposalBusy}
                  onClick={() => {
                    setProposalBusy(true);
                    void api
                      .runPlanningAutomation(automation.id!)
                      .then(async () => {
                        setProposalMessage(
                          "Die lokale Vorschau wurde einmalig geprüft.",
                        );
                        await loadProposalControls();
                      })
                      .catch((reason: unknown) =>
                        setProposalError(failureMessage(reason)),
                      )
                      .finally(() => setProposalBusy(false));
                  }}
                >
                  Jetzt prüfen
                </button>
              ) : null}
            </article>
          ))}
        </div>
      </section>
      <section className="availability-panel panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">KAPAZITÄT</p>
            <h2>Persönliche Verfügbarkeit</h2>
          </div>
          <button
            className="text-button"
            onClick={() => setAvailabilityOpen((value) => !value)}
          >
            <PlusIcon /> Fenster hinzufügen
          </button>
        </div>
        <p>
          Wiederkehrende Wochenfenster liefern die transparente Grundlage für
          Überlastungswarnungen.
        </p>
        {availabilityOpen ? (
          <AvailabilityForm
            timezone={timezone}
            saving={saving}
            onCancel={() => setAvailabilityOpen(false)}
            onSave={async (value) => {
              await onCreateAvailability(value);
              setAvailabilityOpen(false);
            }}
          />
        ) : null}
        {planning?.availabilityWindows.length ? (
          <ul className="availability-list">
            {planning.availabilityWindows.map((window) => (
              <li key={window.id}>
                <span>
                  <strong>{weekdayLabels[window.weekday]}</strong>
                  <small>
                    {minutesToClock(window.startMinute)}–
                    {minutesToClock(window.endMinute)} ·{" "}
                    {window.label ?? "Verfügbar"}
                  </small>
                </span>
                <button
                  className="icon-button"
                  aria-label={`${weekdayLabels[window.weekday]} Verfügbarkeit entfernen`}
                  disabled={saving}
                  onClick={() => void onDeleteAvailability(window.id)}
                >
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted-copy">
            Noch keine persönliche Verfügbarkeit gespeichert.
          </p>
        )}
      </section>
      <p className="privacy-note planning-privacy">
        Darstellung in {timezone}. Konflikte aus privaten, Studien- und
        Arbeitsdaten werden nicht in Logs geschrieben.
      </p>
    </main>
  );

  async function changeProposal(
    operation: () => Promise<PlanningProposalResponse>,
    message: string,
  ) {
    setProposalBusy(true);
    setProposalError(null);
    try {
      await operation();
      setProposalMessage(message);
      await loadProposalControls();
      onReload();
    } catch (reason) {
      setProposalError(failureMessage(reason));
      await loadProposalControls();
    } finally {
      setProposalBusy(false);
    }
  }
};

const formatProposalWindow = (proposal: PlanningProposalResponse) => {
  const date = new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: proposal.action.timezone,
  });
  const time = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: proposal.action.timezone,
  });
  return `${date.format(new Date(proposal.action.startsAt))}, ${time.format(new Date(proposal.action.startsAt))}–${time.format(new Date(proposal.action.endsAt))}`;
};

const proposalStatusLabel = (status: PlanningProposalResponse["status"]) =>
  ({
    pending: "Unverbindlicher Vorschlag",
    confirming: "Bestätigung wird geprüft",
    applied: "Bestätigt und angewendet",
    rejected: "Abgelehnt",
    discarded: "Verworfen",
    conflict: "Konflikt – nichts geändert",
  })[status];

const PlanningDay = ({
  date,
  items,
  timezone,
  agenda = false,
}: {
  date: string;
  items: PlanningItemResponse[];
  timezone: string;
  agenda?: boolean;
}) => (
  <article className={agenda ? "planning-day agenda-day" : "planning-day"}>
    <header>
      <span>{formatDate(date)}</span>
      {date === todayInTimezone(timezone) ? <strong>Heute</strong> : null}
    </header>
    <div className="planning-day-items">
      {items.length ? (
        items.map((item) => (
          <div
            key={item.id}
            className={`planning-item ${item.area} ${item.kind} ${item.overdue ? "overdue" : ""}`}
          >
            <span className="planning-item-time">
              {formatTime(item, timezone)}
            </span>
            <div>
              <strong>{item.title}</strong>
              <small>
                {areaLabels[item.area]} · {kindLabels[item.kind]}
                {item.durationMinutes !== null
                  ? ` · ${formatMinutes(item.durationMinutes)}`
                  : ""}
                {item.overdue ? " · überfällig" : ""}
              </small>
            </div>
          </div>
        ))
      ) : (
        <p className="muted-copy">Keine Einträge</p>
      )}
    </div>
  </article>
);

const AvailabilityForm = ({
  timezone,
  saving,
  onCancel,
  onSave,
}: {
  timezone: string;
  saving: boolean;
  onCancel: () => void;
  onSave: (value: CreateAvailabilityWindowRequest) => Promise<void>;
}) => (
  <form
    className="availability-form"
    onSubmit={(event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const field = (name: string) => {
        const value = data.get(name);
        return typeof value === "string" ? value : "";
      };
      void onSave({
        weekday: Number(field("weekday")),
        startMinute: timeToMinutes(field("start")),
        endMinute: timeToMinutes(field("end")),
        timezone,
        label: field("label") || null,
      });
    }}
  >
    <label>
      Wochentag
      <select name="weekday" defaultValue="1">
        {weekdayLabels.map((label, index) => (
          <option key={label} value={index}>
            {label}
          </option>
        ))}
      </select>
    </label>
    <label>
      Von
      <input name="start" type="time" defaultValue="09:00" required />
    </label>
    <label>
      Bis
      <input name="end" type="time" defaultValue="17:00" required />
    </label>
    <label>
      Bezeichnung
      <input name="label" maxLength={200} placeholder="z. B. Fokuszeit" />
    </label>
    <div className="form-actions">
      <button type="button" className="secondary-button" onClick={onCancel}>
        Abbrechen
      </button>
      <button className="primary-button" disabled={saving}>
        {saving ? "Speichert …" : "Verfügbarkeit speichern"}
      </button>
    </div>
  </form>
);
