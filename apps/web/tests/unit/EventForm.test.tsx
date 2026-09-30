import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CalendarEventResponse } from "@lifeos/contracts";

import { EventForm } from "../../src/components/EventForm";

const event = (
  overrides: Partial<CalendarEventResponse> = {},
): CalendarEventResponse => ({
  uid: "3f6c1d5a-1c2b-4f3e-9a70-8b1d2c3e4f50.zeitblock@tasks.lifeos.local",
  title: "Zeitblock: Synthetische Aufgabe",
  description: null,
  location: null,
  isAllDay: false,
  isStartMarker: false,
  startsAt: "2032-06-01T08:00:00.000Z",
  endsAt: "2032-06-01T09:00:00.000Z",
  startDate: null,
  endDate: null,
  timezone: "Europe/Berlin",
  recurrenceRule: null,
  reminderMinutes: [],
  etag: '"etag-1"',
  sequence: 0,
  updatedAt: "2032-05-01T08:00:00.000Z",
  ...overrides,
});

const renderForm = (
  {
    value,
    onSubmit = vi.fn().mockResolvedValue(undefined),
    onOpenTask = vi.fn(),
    startMarkerTask = null,
  }: {
    value: CalendarEventResponse;
    onSubmit?: (payload: unknown) => Promise<void>;
    onOpenTask?: (taskId: string) => void;
    startMarkerTask?: { id: string; title: string | null } | null;
  } = { value: event() },
) =>
  render(
    <EventForm
      event={value}
      calendarId="kalender-1"
      tasks={[]}
      events={[]}
      links={[]}
      pending={false}
      onCancel={vi.fn()}
      onSubmit={onSubmit}
      onDelete={vi.fn().mockResolvedValue(undefined)}
      onLink={vi.fn().mockResolvedValue(undefined)}
      onUnlink={vi.fn().mockResolvedValue(undefined)}
      startMarkerTask={startMarkerTask}
      onOpenTask={onOpenTask}
    />,
  );

describe("Verwaltete Startmarkierung im Termineditor", () => {
  it("bleibt schreibgeschützt und erfindet kein Ende", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onOpenTask = vi.fn();
    const { container } = renderForm({
      value: event({ isStartMarker: true, endsAt: null }),
      onSubmit,
      onOpenTask,
      startMarkerTask: { id: "aufgabe-1", title: "Synthetische Aufgabe" },
    });

    // Klare Meldung mit dem einen Pflegepfad.
    const notice = screen.getByRole("status");
    expect(notice).toBeVisible();
    expect(notice).toHaveTextContent(/Schreibgeschützt/);
    expect(notice).toHaveTextContent(/Synthetische Aufgabe/);
    expect(notice).toHaveTextContent(/kein Ende und keine Dauer/);

    // Es wird kein Ende erfunden; der geplante Start bleibt unverändert.
    expect(screen.getByLabelText("Ende")).toHaveValue("");
    expect(screen.getByLabelText("Beginn")).toHaveValue("2032-06-01T10:00");
    expect(screen.getByLabelText("Ganztägiger Termin")).not.toBeChecked();

    // Alle Felder bleiben gesperrt, gespeichert wird nichts.
    expect(screen.getByLabelText("Titel")).toBeDisabled();
    expect(screen.getByLabelText("Ort")).toBeDisabled();
    expect(screen.getByLabelText("Notiz")).toBeDisabled();
    expect(screen.getByLabelText("Erinnerung vorher")).toBeDisabled();
    const save = screen.getByRole("button", { name: "Schreibgeschützt" });
    expect(save).toBeDisabled();
    // Der Termineditor löscht keine verwaltete Startmarkierung.
    expect(screen.queryByRole("button", { name: /Löschen/ })).toBeNull();

    // Auch ein direktes Absenden erzeugt keine Dauer.
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /über die Aufgabe gepflegt/,
    );

    // Der eine Pflegepfad bleibt erreichbar.
    await userEvent.click(
      screen.getByRole("button", { name: "Aufgabe öffnen" }),
    );
    expect(onOpenTask).toHaveBeenCalledWith("aufgabe-1");
  });

  it("erkennt eine Startmarkierung auch ohne Kennzeichen am fehlenden Ende", () => {
    /** Ältere Antwort ohne das Kennzeichen: das fehlende Ende bleibt maßgeblich. */
    const legacy = { ...event({ endsAt: null }) };
    delete legacy.isStartMarker;
    renderForm({ value: legacy });

    expect(screen.getByRole("status")).toHaveTextContent(/Schreibgeschützt/);
    expect(screen.getByLabelText("Ende")).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Schreibgeschützt" }),
    ).toBeDisabled();
  });

  it("lässt echte Zeitblöcke unverändert bearbeitbar", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm({ value: event(), onSubmit });

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByLabelText("Titel")).not.toBeDisabled();
    expect(screen.getByLabelText("Ende")).toHaveValue("2032-06-01T11:00");

    await userEvent.click(
      screen.getByRole("button", { name: "Änderungen speichern" }),
    );
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        isAllDay: false,
        startsAt: "2032-06-01T08:00:00.000Z",
        endsAt: "2032-06-01T09:00:00.000Z",
      }),
    );
  });

  it("lässt ganztägige Fristen unverändert bearbeitbar", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm({
      value: event({
        isAllDay: true,
        startsAt: null,
        endsAt: null,
        startDate: "2032-06-01",
        endDate: "2032-06-02",
      }),
      onSubmit,
    });

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByLabelText("Startdatum")).toHaveValue("2032-06-01");
    expect(screen.getByLabelText("Enddatum (exklusiv)")).toHaveValue(
      "2032-06-02",
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Änderungen speichern" }),
    );
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        isAllDay: true,
        startDate: "2032-06-01",
        endDate: "2032-06-02",
      }),
    );
  });
});
