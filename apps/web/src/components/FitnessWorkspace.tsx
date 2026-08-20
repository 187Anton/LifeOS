import type {
  CalendarEventResponse,
  CalendarResponse,
  FitnessOverviewResponse,
} from "@lifeos/contracts";
import { useCallback, useEffect, useState } from "react";

import { api, ApiClientError } from "../api";

const field = (data: FormData, name: string) => {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
};
const optionalNumber = (value: string, factor = 1) =>
  value ? Math.round(Number(value) * factor) : null;
const today = () => new Date().toISOString().slice(0, 10);
const localInstant = (value: string) =>
  value ? new Date(value).toISOString() : null;
const message = (error: unknown) =>
  error instanceof ApiClientError
    ? error.message
    : "Die Fitnessdaten konnten nicht verarbeitet werden.";
const kilograms = (grams: number | null) =>
  grams === null
    ? "–"
    : `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(grams / 1_000)} kg`;

export const FitnessWorkspace = ({
  calendars,
  events,
  selectedCalendarId,
  timezone,
}: {
  calendars: CalendarResponse[];
  events: CalendarEventResponse[];
  selectedCalendarId: string | null;
  timezone: string;
}) => {
  const [data, setData] = useState<FitnessOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.getFitness());
    } catch (caught) {
      setData(null);
      setError(message(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void api
      .getFitness()
      .then((overview) => {
        if (active) setData(overview);
      })
      .catch((caught: unknown) => {
        if (active) {
          setData(null);
          setError(message(caught));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const run = async (
    operation: () => Promise<unknown>,
    successMessage: string,
    form?: HTMLFormElement,
  ) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await operation();
      form?.reset();
      setSuccess(successMessage);
      await load();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setSaving(false);
    }
  };

  const activePlans = data?.plans.filter((value) => !value.archivedAt) ?? [];
  const activeExercises =
    data?.exercises.filter((value) => !value.archivedAt) ?? [];
  const activeSessions =
    data?.sessions.filter((value) => !value.archivedAt) ?? [];
  const completedSessions = activeSessions.filter(
    (value) => value.status === "completed",
  );
  const exerciseName = (id: string) =>
    data?.exercises.find((value) => value.id === id)?.name ??
    "Unbekannte Übung";
  const sessionTitle = (id: string) =>
    data?.sessions.find((value) => value.id === id)?.title ??
    "Unbekannte Einheit";

  return (
    <main className="page-content fitness-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">Lokal & ohne Gesundheitsbewertung</span>
          <h1>Fitness</h1>
          <p>
            Plane und dokumentiere Training, Bestleistungen und Gewicht. Life OS
            stellt dabei weder Diagnosen noch medizinische Empfehlungen bereit.
          </p>
        </div>
        <button className="secondary-button" onClick={() => void load()}>
          Neu laden
        </button>
      </header>

      {error ? (
        <p className="status-message error" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="status-message success" role="status">
          {success}
        </p>
      ) : null}
      {loading ? (
        <p role="status">Fitnessdaten werden lokal geladen …</p>
      ) : null}

      <section className="metric-grid" aria-label="Trainingsfortschritt">
        <article className="metric-card">
          <span>Abgeschlossene Einheiten</span>
          <strong>{data?.analytics.completedSessionCount ?? 0}</strong>
        </article>
        <article className="metric-card">
          <span>Dokumentierte Sätze</span>
          <strong>{data?.analytics.completedSetCount ?? 0}</strong>
        </article>
        <article className="metric-card">
          <span>Trainingsvolumen</span>
          <strong>
            {new Intl.NumberFormat("de-DE", {
              maximumFractionDigits: 1,
            }).format(
              (data?.analytics.volumeGramRepetitions ?? 0) / 1_000,
            )}{" "}
            kg·Wdh.
          </strong>
        </article>
        <article className="metric-card">
          <span>Gewichtsverlauf</span>
          <strong>
            {kilograms(data?.analytics.weightChangeGrams ?? null)}
          </strong>
        </article>
      </section>

      <div className="workspace-grid fitness-grid">
        <section className="workspace-panel">
          <h2>Grundlagen</h2>
          <form
            className="stacked-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const values = new FormData(form);
              void run(
                () =>
                  api.createFitnessExercise({
                    name: field(values, "exerciseName"),
                    notes: field(values, "exerciseNotes") || null,
                  }),
                "Die Übung wurde angelegt.",
                form,
              );
            }}
          >
            <h3>Übung anlegen</h3>
            <label>
              Name
              <input name="exerciseName" maxLength={200} required />
            </label>
            <label>
              Notiz
              <textarea name="exerciseNotes" maxLength={2_000} />
            </label>
            <button className="primary-button" disabled={saving}>
              Übung speichern
            </button>
          </form>
          <form
            className="stacked-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const values = new FormData(form);
              void run(
                () =>
                  api.createFitnessPlan({
                    name: field(values, "planName"),
                    notes: field(values, "planNotes") || null,
                  }),
                "Der Trainingsplan wurde angelegt.",
                form,
              );
            }}
          >
            <h3>Trainingsplan anlegen</h3>
            <label>
              Name
              <input name="planName" maxLength={200} required />
            </label>
            <label>
              Notiz
              <textarea name="planNotes" maxLength={2_000} />
            </label>
            <button className="primary-button" disabled={saving}>
              Plan speichern
            </button>
          </form>
          <form
            className="stacked-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const values = new FormData(form);
              void run(
                () =>
                  api.addFitnessPlanExercise(field(values, "planId"), {
                    exerciseId: field(values, "exerciseId"),
                    position: Number(values.get("position")),
                    targetSets: optionalNumber(field(values, "targetSets")),
                    targetRepetitions: optionalNumber(
                      field(values, "targetRepetitions"),
                    ),
                    targetWeightGrams: optionalNumber(
                      field(values, "targetWeight"),
                      1_000,
                    ),
                  }),
                "Die Übung wurde dem Plan zugeordnet.",
                form,
              );
            }}
          >
            <h3>Plan zusammenstellen</h3>
            <label>
              Plan
              <select name="planId" required defaultValue="">
                <option value="" disabled>
                  Plan wählen
                </option>
                {activePlans.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Übung
              <select name="exerciseId" required defaultValue="">
                <option value="" disabled>
                  Übung wählen
                </option>
                {activeExercises.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid compact">
              <label>
                Position
                <input
                  name="position"
                  type="number"
                  min="0"
                  max="500"
                  defaultValue="0"
                  required
                />
              </label>
              <label>
                Zielsätze
                <input name="targetSets" type="number" min="1" max="100" />
              </label>
              <label>
                Wiederholungen
                <input
                  name="targetRepetitions"
                  type="number"
                  min="1"
                  max="10000"
                />
              </label>
              <label>
                Gewicht in kg
                <input
                  name="targetWeight"
                  type="number"
                  min="0.001"
                  max="1000"
                  step="0.001"
                />
              </label>
            </div>
            <button
              className="primary-button"
              disabled={
                saving || !activePlans.length || !activeExercises.length
              }
            >
              Zuordnen
            </button>
          </form>
        </section>

        <section className="workspace-panel">
          <h2>Trainingseinheit</h2>
          <form
            className="stacked-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const values = new FormData(form);
              const status = field(values, "status") as "planned" | "completed";
              const calendar = field(values, "calendarEvent");
              const [calendarId, eventUid] = calendar
                ? calendar.split("|")
                : [];
              void run(
                () =>
                  api.createFitnessSession({
                    title: field(values, "title"),
                    planId: field(values, "sessionPlanId") || null,
                    status,
                    performedAt:
                      status === "completed"
                        ? localInstant(field(values, "performedAt"))
                        : null,
                    timezone: status === "completed" ? timezone : null,
                    notes: field(values, "sessionNotes") || null,
                    calendarId: calendarId || null,
                    eventUid: eventUid || null,
                  }),
                "Die Trainingseinheit wurde gespeichert.",
                form,
              );
            }}
          >
            <label>
              Titel
              <input name="title" maxLength={200} required />
            </label>
            <label>
              Plan
              <select name="sessionPlanId" defaultValue="">
                <option value="">Ohne Plan</option>
                {activePlans.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select name="status" defaultValue="planned">
                <option value="planned">Geplant</option>
                <option value="completed">Abgeschlossen</option>
              </select>
            </label>
            <label>
              Abschlusszeitpunkt
              <input name="performedAt" type="datetime-local" />
              <small>Nur für abgeschlossene Einheiten erforderlich.</small>
            </label>
            <label>
              Bestehenden Kalendertermin verknüpfen
              <select name="calendarEvent" defaultValue="">
                <option value="">Ohne Termin</option>
                {events.map((event) => (
                  <option
                    key={event.uid}
                    value={`${selectedCalendarId}|${event.uid}`}
                  >
                    {event.title}
                  </option>
                ))}
              </select>
              <small>
                Die Verknüpfung ändert den Termin nicht. Neue Termine legst du
                im Kalender an.
              </small>
            </label>
            <label>
              Notiz
              <textarea name="sessionNotes" maxLength={2_000} />
            </label>
            <button className="primary-button" disabled={saving}>
              Einheit speichern
            </button>
          </form>

          <h3>Geplant und zuletzt trainiert</h3>
          {!activeSessions.length && !loading ? (
            <p className="empty-state">
              Noch keine Trainingseinheit vorhanden.
            </p>
          ) : null}
          <div className="record-list">
            {activeSessions.slice(0, 12).map((session) => (
              <article className="record-card" key={session.id}>
                <div>
                  <strong>{session.title}</strong>
                  <p>
                    {session.status === "completed"
                      ? `Abgeschlossen ${session.performedAt ? new Date(session.performedAt).toLocaleString("de-DE") : ""}`
                      : session.status === "planned"
                        ? "Geplant"
                        : "Abgebrochen"}
                  </p>
                  {session.calendar ? (
                    <small>Kalender: {session.calendar.title}</small>
                  ) : null}
                </div>
                <div className="button-row">
                  {session.status === "planned" ? (
                    <button
                      className="secondary-button"
                      disabled={saving}
                      onClick={() =>
                        void run(
                          () =>
                            api.updateFitnessSession(session.id, {
                              status: "completed",
                              performedAt: new Date().toISOString(),
                              timezone,
                            }),
                          "Die Einheit wurde abgeschlossen.",
                        )
                      }
                    >
                      Abschließen
                    </button>
                  ) : null}
                  <button
                    className="text-button"
                    disabled={saving}
                    onClick={() =>
                      void run(
                        () =>
                          api.updateFitnessSession(session.id, {
                            archived: true,
                          }),
                        "Die Einheit wurde archiviert.",
                      )
                    }
                  >
                    Archivieren
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="workspace-panel">
          <h2>Sätze und Leistungen</h2>
          <form
            className="stacked-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const values = new FormData(form);
              void run(
                () =>
                  api.createFitnessSet({
                    sessionId: field(values, "setSessionId"),
                    exerciseId: field(values, "setExerciseId"),
                    setNumber: Number(values.get("setNumber")),
                    repetitions: optionalNumber(field(values, "repetitions")),
                    weightGrams: optionalNumber(field(values, "weight"), 1_000),
                    durationSeconds: optionalNumber(field(values, "duration")),
                    distanceMeters: optionalNumber(field(values, "distance")),
                    completedAt: new Date().toISOString(),
                  }),
                "Der Trainingssatz wurde gespeichert.",
                form,
              );
            }}
          >
            <label>
              Einheit
              <select name="setSessionId" required defaultValue="">
                <option value="" disabled>
                  Einheit wählen
                </option>
                {completedSessions.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Übung
              <select name="setExerciseId" required defaultValue="">
                <option value="" disabled>
                  Übung wählen
                </option>
                {activeExercises.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid compact">
              <label>
                Satz
                <input
                  name="setNumber"
                  type="number"
                  min="1"
                  max="100"
                  defaultValue="1"
                  required
                />
              </label>
              <label>
                Wiederholungen
                <input name="repetitions" type="number" min="1" />
              </label>
              <label>
                Gewicht in kg
                <input
                  name="weight"
                  type="number"
                  min="0.001"
                  max="1000"
                  step="0.001"
                />
              </label>
              <label>
                Dauer in Sekunden
                <input name="duration" type="number" min="1" max="604800" />
              </label>
              <label>
                Distanz in Metern
                <input name="distance" type="number" min="1" max="1000000" />
              </label>
            </div>
            <button
              className="primary-button"
              disabled={
                saving || !completedSessions.length || !activeExercises.length
              }
            >
              Satz speichern
            </button>
          </form>
          <div className="record-list">
            {data?.sets.slice(0, 12).map((set) => (
              <article className="record-card" key={set.id}>
                <div>
                  <strong>
                    {exerciseName(set.exerciseId)} · Satz {set.setNumber}
                  </strong>
                  <p>
                    {sessionTitle(set.sessionId)} ·{" "}
                    {set.repetitions ? `${set.repetitions} Wdh. ` : ""}
                    {set.weightGrams ? kilograms(set.weightGrams) : ""}
                    {set.durationSeconds ? ` · ${set.durationSeconds} s` : ""}
                    {set.distanceMeters ? ` · ${set.distanceMeters} m` : ""}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="workspace-panel">
          <h2>Gewicht und Bestleistungen</h2>
          <form
            className="stacked-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const values = new FormData(form);
              void run(
                () =>
                  api.createBodyWeight({
                    measuredDate: field(values, "measuredDate"),
                    weightGrams: Math.round(
                      Number(values.get("bodyWeight")) * 1_000,
                    ),
                    note: field(values, "bodyWeightNote") || null,
                  }),
                "Der Gewichtseintrag wurde gespeichert.",
                form,
              );
            }}
          >
            <label>
              Datum
              <input
                name="measuredDate"
                type="date"
                defaultValue={today()}
                required
              />
            </label>
            <label>
              Gewicht in kg
              <input
                name="bodyWeight"
                type="number"
                min="20"
                max="500"
                step="0.001"
                required
              />
            </label>
            <label>
              Notiz
              <textarea name="bodyWeightNote" maxLength={2_000} />
            </label>
            <button className="primary-button" disabled={saving}>
              Gewicht speichern
            </button>
          </form>
          <h3>Verlauf</h3>
          {!data?.bodyWeights.length && !loading ? (
            <p className="empty-state">
              Noch keine Gewichtseinträge vorhanden.
            </p>
          ) : null}
          <div className="record-list">
            {data?.bodyWeights
              .slice()
              .reverse()
              .slice(0, 8)
              .map((entry) => (
                <article className="record-card" key={entry.id}>
                  <div>
                    <strong>{kilograms(entry.weightGrams)}</strong>
                    <p>
                      {new Date(
                        `${entry.measuredDate}T00:00:00`,
                      ).toLocaleDateString("de-DE")}
                      {entry.note ? ` · ${entry.note}` : ""}
                    </p>
                  </div>
                  <button
                    className="text-button"
                    disabled={saving}
                    onClick={() =>
                      void run(
                        () =>
                          api.updateBodyWeight(entry.id, { archived: true }),
                        "Der Gewichtseintrag wurde archiviert.",
                      )
                    }
                  >
                    Archivieren
                  </button>
                </article>
              ))}
          </div>
          <h3>Persönliche Bestleistungen</h3>
          {!data?.analytics.personalBests.length && !loading ? (
            <p className="empty-state">
              Bestleistungen entstehen aus abgeschlossenen Trainingssätzen.
            </p>
          ) : null}
          <div className="record-list">
            {data?.analytics.personalBests.map((best) => (
              <article className="record-card" key={best.exerciseId}>
                <div>
                  <strong>{exerciseName(best.exerciseId)}</strong>
                  <p>
                    {kilograms(best.maximumWeightGrams)} ·{" "}
                    {best.maximumRepetitions ?? "–"} Wdh. ·{" "}
                    {best.maximumDurationSeconds ?? "–"} s ·{" "}
                    {best.maximumDistanceMeters ?? "–"} m
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <p className="privacy-note">
        Fitnessdaten bleiben lokal. Es findet keine ungefragte externe
        Übertragung statt. Verknüpfte Kalenderereignisse bleiben eigenständige
        Datensätze mit unveränderter UID und ETag.
        {calendars.length
          ? ` ${calendars.length} lokaler Kalender verfügbar.`
          : ""}
      </p>
    </main>
  );
};
