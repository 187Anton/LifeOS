import { render, screen, within } from "@testing-library/react";
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

const task = {
  id: "aufgabe-1",
  ownerId: "nutzer-1",
  title: "Roadmap prüfen",
  description: "Synthetische Aufgabe",
  status: "open" as const,
  priority: "high" as const,
  dueDate: "2030-07-23",
  scheduledStartAt: "2030-07-22T10:00:00.000Z",
  scheduledStartTimezone: "Europe/Berlin",
  estimatedDurationMinutes: 60,
  tags: ["organisation"],
  area: "projects" as const,
  projectId: null,
  parentTaskId: null,
  completedAt: null,
  archivedAt: null,
  createdAt: "2026-07-22T08:00:00.000Z",
  updatedAt: "2026-07-22T08:00:00.000Z",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const requestBody = (init?: RequestInit): Record<string, unknown> => {
  if (typeof init?.body !== "string") {
    throw new Error("Synthetische Anfrage enthält keinen JSON-Body.");
  }
  return JSON.parse(init.body) as Record<string, unknown>;
};

const installApi = ({
  calendars = [calendar],
  events = [event],
  tasks = [task],
}: {
  calendars?: (typeof calendar)[];
  events?: (typeof event)[];
  tasks?: (typeof task)[];
} = {}) => {
  const taskState = tasks.map((item) => ({ ...item }));
  const fetchMock = vi.fn(
    (request: string | URL | Request, init?: RequestInit) => {
      const path =
        typeof request === "string"
          ? request
          : request instanceof URL
            ? request.href
            : request.url;
      const method = init?.method ?? "GET";
      if (path === "/api/v1/profile") return json(profile);
      if (path === "/api/v1/calendars") return json(calendars);
      if (path.endsWith("/events")) return json(events);
      if (path === "/api/v1/tasks?includeArchived=true" && method === "GET") {
        return json(taskState);
      }
      if (path === "/api/v1/tasks" && method === "POST") {
        const payload = requestBody(init);
        const created = {
          ...task,
          ...payload,
          id: `aufgabe-${taskState.length + 1}`,
          createdAt: "2026-07-22T09:00:00.000Z",
          updatedAt: "2026-07-22T09:00:00.000Z",
        } as typeof task;
        taskState.push(created);
        return json(created, 201);
      }
      if (path.startsWith("/api/v1/tasks/") && method === "PATCH") {
        const taskId = path.split("/").at(-1);
        const index = taskState.findIndex((item) => item.id === taskId);
        const payload = requestBody(init);
        taskState[index] = {
          ...taskState[index]!,
          ...payload,
          completedAt:
            payload.status === "done"
              ? "2026-07-22T10:00:00.000Z"
              : payload.status === "open"
                ? null
                : taskState[index]!.completedAt,
          archivedAt:
            payload.archived === true
              ? "2026-07-22T10:00:00.000Z"
              : payload.archived === false
                ? null
                : taskState[index]!.archivedAt,
          updatedAt: "2026-07-22T10:00:00.000Z",
        } as typeof task;
        return json(taskState[index]);
      }
      if (path.startsWith("/api/v1/tasks/") && method === "DELETE") {
        const taskId = path.split("/").at(-1);
        const index = taskState.findIndex((item) => item.id === taskId);
        if (index >= 0) taskState.splice(index, 1);
        return new Response(null, { status: 204 });
      }
      return json(
        { error: { code: "NOT_FOUND", message: "Nicht gefunden" } },
        404,
      );
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, taskState };
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

  it("erstellt, bearbeitet und filtert Aufgaben gemeinsam", async () => {
    installApi();
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", { name: /Guten Tag, Anton/ });
    await user.click(screen.getAllByRole("button", { name: "Aufgaben" })[0]!);
    expect(
      await screen.findByRole("heading", { name: "Aufgaben" }),
    ).toBeVisible();
    expect(screen.getByText("Roadmap prüfen")).toBeVisible();

    await user.type(
      screen.getByRole("searchbox", { name: "Aufgaben durchsuchen" }),
      "roadmap",
    );
    await user.selectOptions(screen.getByLabelText("Priorität"), "high");
    await user.selectOptions(screen.getByLabelText("Bereich"), "projects");
    expect(screen.getByText("Roadmap prüfen")).toBeVisible();
    expect(screen.getByText("1 von 1 sichtbar")).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Filter zurücksetzen" }),
    );
    await user.click(screen.getByRole("button", { name: /Neue Aufgabe/ }));
    const createEditor = screen.getByRole("region", {
      name: "Was möchtest du erledigen?",
    });
    await user.type(
      within(createEditor).getByLabelText("Titel"),
      "Unterlagen sortieren",
    );
    await user.selectOptions(
      within(createEditor).getByLabelText("Priorität"),
      "medium",
    );
    await user.selectOptions(
      within(createEditor).getByLabelText("Bereich"),
      "personal",
    );
    await user.click(screen.getByRole("button", { name: "Aufgabe anlegen" }));
    expect(await screen.findByText("Unterlagen sortieren")).toBeVisible();

    const createdCard = screen
      .getByText("Unterlagen sortieren")
      .closest("article");
    expect(createdCard).not.toBeNull();
    await user.click(
      within(createdCard!).getByRole("button", {
        name: "Unterlagen sortieren bearbeiten",
      }),
    );
    const editEditor = screen.getByRole("region", {
      name: "Unterlagen sortieren",
    });
    await user.clear(within(editEditor).getByLabelText("Titel"));
    await user.type(
      within(editEditor).getByLabelText("Titel"),
      "Unterlagen archivieren",
    );
    await user.click(
      screen.getByRole("button", { name: "Änderungen speichern" }),
    );
    expect(await screen.findByText("Unterlagen archivieren")).toBeVisible();
  });

  it("zeigt für eine leere Aufgabenliste eine klare nächste Aktion", async () => {
    installApi({ tasks: [] });
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", { name: /Guten Tag, Anton/ });
    await user.click(screen.getAllByRole("button", { name: "Aufgaben" })[0]!);

    expect(await screen.findByText("Noch keine Aufgabe")).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Erste Aufgabe anlegen/ }),
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
