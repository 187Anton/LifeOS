import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../src/App";

const profile = {
  id: "nutzer-1",
  displayName: "Anton Beispiel",
  settings: {
    timezone: "Europe/Berlin",
    locale: "de-DE" as const,
    currencyCode: "EUR",
    weekStartsOn: 1,
    defaultCalendarView: "week" as const,
    showWeekends: true,
  },
};

const calendar = {
  id: "kalender-1",
  name: "Persönlich",
  timezone: "Europe/Berlin",
  isPrimary: true,
  syncToken: 1,
};

const event = {
  uid: "termin-1",
  title: "Ruhiger Fokusblock",
  description: "Synthetischer Termin",
  location: null,
  isAllDay: false,
  startsAt: "2030-07-22T08:00:00.000Z",
  endsAt: "2030-07-22T09:00:00.000Z",
  startDate: null,
  endDate: null,
  timezone: "Europe/Berlin",
  recurrenceRule: null,
  reminderMinutes: [10],
  etag: '"etag-1"',
  sequence: 0,
  updatedAt: "2026-07-22T08:00:00.000Z",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const installApi = ({
  calendars = [calendar],
  events = [event],
}: {
  calendars?: (typeof calendar)[];
  events?: (typeof event)[];
} = {}) => {
  const fetchMock = vi.fn((request: string | URL | Request) => {
    const path =
      typeof request === "string"
        ? request
        : request instanceof URL
          ? request.href
          : request.url;
    if (path === "/api/v1/profile") return json(profile);
    if (path === "/api/v1/calendars") return json(calendars);
    if (path.endsWith("/events")) return json(events);
    return json(
      { error: { code: "NOT_FOUND", message: "Nicht gefunden" } },
      404,
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LifeOS-Weboberfläche", () => {
  it("zeigt während der Sitzungsprüfung einen verständlichen Ladezustand", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );

    render(<App />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Life OS wird lokal verbunden",
    );
  });

  it("zeigt Dashboard und Kalendertermine nach erfolgreichem Laden", async () => {
    installApi();
    const user = userEvent.setup();
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: /Guten Tag, Anton/ }),
    ).toBeVisible();
    expect(screen.getByText("Ruhiger Fokusblock")).toBeVisible();

    await user.click(screen.getAllByRole("button", { name: "Kalender" })[0]!);
    expect(
      await screen.findByRole("heading", { name: "Kalender" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Ruhiger Fokusblock bearbeiten" }),
    ).toBeVisible();
  });

  it("zeigt einen leeren Kalender mit klarer nächster Aktion", async () => {
    installApi({ events: [] });
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", { name: /Guten Tag, Anton/ });
    await user.click(screen.getAllByRole("button", { name: "Kalender" })[0]!);

    expect(
      await screen.findByText("Dieser Kalender ist noch frei"),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Ersten Termin anlegen/ }),
    ).toBeEnabled();
  });

  it("zeigt bei nicht erreichbarer API die Anmeldung mit Fehlerhinweis", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Lokal anmelden" }),
    ).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Die lokale API ist nicht erreichbar",
    );
  });
});
