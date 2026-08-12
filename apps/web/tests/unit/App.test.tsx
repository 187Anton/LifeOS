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

const eventStartsAt = new Date().toISOString();
const eventEndsAt = new Date(
  new Date(eventStartsAt).valueOf() + 60 * 60 * 1000,
).toISOString();

const event = {
  uid: "termin-1",
  title: "Ruhiger Fokusblock",
  description: "Synthetischer Termin",
  location: null,
  isAllDay: false,
  startsAt: eventStartsAt,
  endsAt: eventEndsAt,
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
  links = [],
  deleteEventConflict = false,
  dashboardError = false,
  setupRequired = false,
}: {
  calendars?: (typeof calendar)[];
  events?: (typeof event)[];
  tasks?: (typeof task)[];
  links?: Array<{
    id: string;
    task: { id: string; title: string | null; available: boolean };
    event: {
      calendarId: string;
      uid: string;
      title: string | null;
      available: boolean;
    };
    createdAt: string;
  }>;
  deleteEventConflict?: boolean;
  dashboardError?: boolean;
  setupRequired?: boolean;
} = {}) => {
  const eventState = events.map((item) => ({ ...item }));
  const taskState = tasks.map((item) => ({ ...item }));
  const linkState = links.map((item) => structuredClone(item));
  const studyState = {
    programs: [] as Record<string, unknown>[],
    modules: [] as Record<string, unknown>[],
    entries: [] as Record<string, unknown>[],
  };
  const workState = {
    contexts: [] as Record<string, unknown>[],
    projects: [] as Record<string, unknown>[],
    taskLinks: [] as Record<string, unknown>[],
    timeEntries: [] as Record<string, unknown>[],
    history: [] as Record<string, unknown>[],
  };
  const projectState: Array<Record<string, unknown>> = [];
  const projectDetails = new Map<
    string,
    {
      goals: Array<Record<string, unknown>>;
      milestones: Array<Record<string, unknown>>;
    }
  >();
  const availabilityState: Record<string, unknown>[] = [];
  let conflictReturned = false;
  let setupIsRequired = setupRequired;
  const fetchMock = vi.fn(
    (request: string | URL | Request, init?: RequestInit) => {
      const path =
        typeof request === "string"
          ? request
          : request instanceof URL
            ? request.href
            : request.url;
      const method = init?.method ?? "GET";
      if (path === "/api/v1/setup" && method === "GET")
        return json({ required: setupIsRequired });
      if (path === "/api/v1/setup" && method === "POST") {
        setupIsRequired = false;
        return json({ status: "configured" }, 201);
      }
      if (path === "/api/v1/session" && method === "POST")
        return json(
          {
            status: "authenticated",
            expiresAt: "2032-01-01T00:00:00.000Z",
          },
          201,
        );
      if (path === "/api/v1/profile") return json(profile);
      if (path.startsWith("/api/v1/study") && method === "GET")
        return json(studyState);
      if (path.startsWith("/api/v1/work") && method === "GET")
        return json(workState);
      if (path.startsWith("/api/v1/planning?") && method === "GET") {
        const url = new URL(path, "http://lifeos.local");
        const date = url.searchParams.get("from") ?? "2032-06-14";
        const start = `${date}T07:00:00.000Z`;
        const overlap = `${date}T07:30:00.000Z`;
        const end = `${date}T08:30:00.000Z`;
        return json({
          generatedAt: new Date().toISOString(),
          timezone: profile.settings.timezone,
          range: {
            from: date,
            to: url.searchParams.get("to") ?? date,
          },
          items: [
            {
              id: "calendar:1",
              sourceId: "event-1",
              area: "calendar",
              kind: "fixed_event",
              title: "Gemeinsamer Termin A",
              date,
              startsAt: start,
              endsAt: `${date}T08:00:00.000Z`,
              timezone: profile.settings.timezone,
              durationMinutes: 60,
              priority: "medium",
              overdue: false,
              sourceUpdatedAt: start,
            },
            {
              id: "calendar:2",
              sourceId: "event-2",
              area: "calendar",
              kind: "fixed_event",
              title: "Gemeinsamer Termin B",
              date,
              startsAt: overlap,
              endsAt: end,
              timezone: profile.settings.timezone,
              durationMinutes: 60,
              priority: "medium",
              overdue: false,
              sourceUpdatedAt: start,
            },
            {
              id: "study:1",
              sourceId: "study-1",
              area: "study",
              kind: "deadline",
              title: "Synthetische Prüfung",
              date,
              startsAt: null,
              endsAt: null,
              timezone: profile.settings.timezone,
              durationMinutes: null,
              priority: "high",
              overdue: false,
              sourceUpdatedAt: start,
            },
            {
              id: "work:1",
              sourceId: "work-1",
              area: "work",
              kind: "planned_task",
              title: "Geplanter Praxisblock",
              date,
              startsAt: `${date}T09:00:00.000Z`,
              endsAt: `${date}T11:00:00.000Z`,
              timezone: profile.settings.timezone,
              durationMinutes: 120,
              priority: "medium",
              overdue: false,
              sourceUpdatedAt: start,
            },
          ],
          warnings: [
            {
              id: "overlap:1",
              kind: "overlap",
              severity: "critical",
              date,
              itemIds: ["calendar:1", "calendar:2"],
              message:
                "Zwei feste Termine überschneiden sich. Es wurde nichts automatisch verschoben.",
            },
          ],
          availabilityWindows: availabilityState,
        });
      }
      if (path.startsWith("/api/v1/projects?") && method === "GET") {
        return json({ projects: projectState });
      }
      if (path === "/api/v1/projects" && method === "POST") {
        const payload = requestBody(init);
        const id = `projekt-${projectState.length + 1}`;
        const created = {
          id,
          ownerId: profile.id,
          ...payload,
          description: payload.description ?? null,
          status: payload.status ?? "planned",
          risk: payload.risk ?? null,
          dueDate: payload.dueDate ?? null,
          archivedAt: null,
          createdAt: "2032-01-01T00:00:00.000Z",
          updatedAt: "2032-01-01T00:00:00.000Z",
          progress: {
            state: "no_data",
            percent: null,
            completedItems: 0,
            totalItems: 0,
            breakdown: {
              goals: { completed: 0, total: 0 },
              milestones: { completed: 0, total: 0 },
              tasks: { completed: 0, total: 0 },
            },
          },
        };
        projectState.push(created);
        projectDetails.set(id, { goals: [], milestones: [] });
        return json(created, 201);
      }
      const projectMatch = path.match(/^\/api\/v1\/projects\/([^/]+)$/);
      if (projectMatch && method === "PATCH") {
        const project = projectState.find(
          (value) => value.id === projectMatch[1],
        )!;
        const payload = requestBody(init);
        Object.assign(project, payload, {
          archivedAt:
            payload.archived === undefined
              ? project.archivedAt
              : payload.archived
                ? "2032-01-02T00:00:00.000Z"
                : null,
          updatedAt: "2032-01-02T00:00:00.000Z",
        });
        return json(project);
      }
      if (projectMatch && method === "GET") {
        const project = projectState.find(
          (value) => value.id === projectMatch[1],
        );
        const items = projectDetails.get(projectMatch[1] ?? "") ?? {
          goals: [],
          milestones: [],
        };
        return json({
          project,
          ...items,
          tasks: [],
          calendarEvents: [],
          progress: project?.progress,
        });
      }
      const itemMatch = path.match(
        /^\/api\/v1\/projects\/([^/]+)\/(goals|milestones)$/,
      );
      if (itemMatch && method === "POST") {
        const payload = requestBody(init);
        const details = projectDetails.get(itemMatch[1] ?? "")!;
        const collection = details[itemMatch[2] as "goals" | "milestones"];
        const created = {
          id: `${itemMatch[2]}-${collection.length + 1}`,
          ownerId: profile.id,
          projectId: itemMatch[1],
          ...payload,
          description: payload.description ?? null,
          risk: payload.risk ?? null,
          dueDate: payload.dueDate ?? null,
          archivedAt: null,
          createdAt: "2032-01-01T00:00:00.000Z",
          updatedAt: "2032-01-01T00:00:00.000Z",
        };
        collection.push(created);
        const project = projectState.find((value) => value.id === itemMatch[1]);
        if (project)
          project.progress = {
            state: "available",
            percent: payload.status === "completed" ? 100 : 0,
            completedItems: payload.status === "completed" ? 1 : 0,
            totalItems: 1,
            breakdown: {
              goals: {
                completed: payload.status === "completed" ? 1 : 0,
                total: itemMatch[2] === "goals" ? 1 : 0,
              },
              milestones: {
                completed: 0,
                total: itemMatch[2] === "milestones" ? 1 : 0,
              },
              tasks: { completed: 0, total: 0 },
            },
          };
        return json(created, 201);
      }
      const itemDetailMatch = path.match(
        /^\/api\/v1\/projects\/([^/]+)\/(goals|milestones)\/([^/]+)$/,
      );
      if (itemDetailMatch && method === "PATCH") {
        const details = projectDetails.get(itemDetailMatch[1] ?? "")!;
        const collection =
          details[itemDetailMatch[2] as "goals" | "milestones"];
        const item = collection.find(
          (value) => value.id === itemDetailMatch[3],
        )!;
        const payload = requestBody(init);
        Object.assign(item, payload, {
          archivedAt:
            payload.archived === undefined
              ? item.archivedAt
              : payload.archived
                ? "2032-01-02T00:00:00.000Z"
                : null,
          updatedAt: "2032-01-02T00:00:00.000Z",
        });
        return json(item);
      }
      if (path === "/api/v1/planning/availability" && method === "POST") {
        const payload = requestBody(init);
        const created = {
          id: `availability-${availabilityState.length + 1}`,
          ownerId: profile.id,
          ...payload,
          label: payload.label ?? null,
          createdAt: "2032-01-01T00:00:00.000Z",
          updatedAt: "2032-01-01T00:00:00.000Z",
        };
        availabilityState.push(created);
        return json(created, 201);
      }
      if (
        path.startsWith("/api/v1/planning/availability/") &&
        method === "DELETE"
      ) {
        const id = path.split("/").at(-1);
        const index = availabilityState.findIndex((item) => item.id === id);
        if (index >= 0) availabilityState.splice(index, 1);
        return new Response(null, { status: 204 });
      }
      if (path === "/api/v1/work/contexts" && method === "POST") {
        const payload = requestBody(init);
        const created = {
          id: `arbeit-${workState.contexts.length + 1}`,
          ownerId: profile.id,
          ...payload,
          organization: payload.organization ?? null,
          startsOn: payload.startsOn ?? null,
          endsOn: payload.endsOn ?? null,
          notes: payload.notes ?? null,
          archivedAt: null,
          createdAt: "2032-01-01T00:00:00.000Z",
          updatedAt: "2032-01-01T00:00:00.000Z",
        };
        workState.contexts.push(created);
        return json(created, 201);
      }
      if (path === "/api/v1/work/projects" && method === "POST") {
        const payload = requestBody(init);
        const created = {
          id: `arbeitsprojekt-${workState.projects.length + 1}`,
          ownerId: profile.id,
          ...payload,
          goal: payload.goal ?? null,
          deadlineDate: payload.deadlineDate ?? null,
          calendarEventId: null,
          notes: payload.notes ?? null,
          archivedAt: null,
          createdAt: "2032-01-01T00:00:00.000Z",
          updatedAt: "2032-01-01T00:00:00.000Z",
        };
        workState.projects.push(created);
        return json(created, 201);
      }
      if (path === "/api/v1/work/time-entries" && method === "POST") {
        const payload = requestBody(init);
        const durationMinutes =
          (new Date(String(payload.endsAt)).getTime() -
            new Date(String(payload.startsAt)).getTime()) /
          60_000;
        const created = {
          id: `arbeitszeit-${workState.timeEntries.length + 1}`,
          ownerId: profile.id,
          ...payload,
          projectId: payload.projectId ?? null,
          taskId: payload.taskId ?? null,
          notes: payload.notes ?? null,
          durationMinutes,
          archivedAt: null,
          createdAt: "2032-01-01T00:00:00.000Z",
          updatedAt: "2032-01-01T00:00:00.000Z",
        };
        workState.timeEntries.push(created);
        return json(created, 201);
      }
      if (path === "/api/v1/study/programs" && method === "POST") {
        const payload = requestBody(init);
        const created = {
          id: `studium-${studyState.programs.length + 1}`,
          ownerId: profile.id,
          ...payload,
          notes: payload.notes ?? null,
          archivedAt: null,
          createdAt: "2026-08-09T10:00:00.000Z",
          updatedAt: "2026-08-09T10:00:00.000Z",
        };
        studyState.programs.push(created);
        return json(created, 201);
      }
      if (path === "/api/v1/study/modules" && method === "POST") {
        const payload = requestBody(init);
        const created = {
          id: `modul-${studyState.modules.length + 1}`,
          ownerId: profile.id,
          ...payload,
          code: payload.code ?? null,
          credits: payload.credits ?? null,
          grade: null,
          notes: payload.notes ?? null,
          documentReferences: payload.documentReferences ?? [],
          archivedAt: null,
          createdAt: "2026-08-09T10:00:00.000Z",
          updatedAt: "2026-08-09T10:00:00.000Z",
        };
        studyState.modules.push(created);
        return json(created, 201);
      }
      if (path === "/api/v1/calendars") return json(calendars);
      if (path === "/api/v1/dashboard" && method === "GET") {
        if (dashboardError) {
          return json(
            {
              error: {
                code: "SERVICE_NOT_READY",
                message: "Das Dashboard ist vorübergehend nicht verfügbar.",
              },
            },
            503,
          );
        }
        return json({
          generatedAt: new Date().toISOString(),
          timezone: profile.settings.timezone,
          tasks: taskState.filter(
            (item) =>
              !item.archivedAt &&
              !["done", "cancelled"].includes(String(item.status)),
          ),
          events: eventState.map((item) => ({
            ...item,
            calendarId: calendar.id,
            calendarName: calendar.name,
          })),
          projects: [],
        });
      }
      if (path === "/api/v1/task-event-links" && method === "GET") {
        return json(linkState);
      }
      if (path === "/api/v1/task-event-links" && method === "POST") {
        const payload = requestBody(init);
        const linkedTask = taskState.find(
          (item) => item.id === payload.taskId,
        )!;
        const linkedEvent = eventState.find(
          (item) => item.uid === payload.eventUid,
        )!;
        const existing = linkState.find(
          (item) =>
            item.task.id === linkedTask.id &&
            item.event.uid === linkedEvent.uid,
        );
        if (existing) return json(existing);
        const created = {
          id: `link-${linkState.length + 1}`,
          task: {
            id: linkedTask.id,
            title: linkedTask.title,
            available: true,
          },
          event: {
            calendarId: String(payload.calendarId),
            uid: linkedEvent.uid,
            title: linkedEvent.title,
            available: true,
          },
          createdAt: "2026-07-29T13:00:00.000Z",
        };
        linkState.push(created);
        return json(created, 201);
      }
      if (path.startsWith("/api/v1/task-event-links/") && method === "DELETE") {
        const linkId = path.split("/").at(-1);
        const index = linkState.findIndex((item) => item.id === linkId);
        if (index >= 0) linkState.splice(index, 1);
        return new Response(null, { status: 204 });
      }
      if (path.endsWith("/events") && method === "GET") {
        return json(eventState);
      }
      if (path.endsWith("/events") && method === "POST") {
        const payload = requestBody(init);
        const created = {
          ...event,
          ...payload,
          uid: `termin-${eventState.length + 1}`,
          etag: `"etag-${eventState.length + 1}"`,
        };
        eventState.push(created);
        return json(created, 201);
      }
      if (path.includes("/events/") && method === "PUT") {
        const uid = decodeURIComponent(path.split("/").at(-1)!);
        const index = eventState.findIndex((item) => item.uid === uid);
        eventState[index] = {
          ...eventState[index]!,
          ...requestBody(init),
          etag: '"etag-neu"',
          sequence: eventState[index]!.sequence + 1,
        };
        return json(eventState[index]);
      }
      if (path.includes("/events/") && method === "DELETE") {
        if (deleteEventConflict && !conflictReturned) {
          conflictReturned = true;
          eventState[0] = { ...eventState[0]!, etag: '"etag-vom-server"' };
          return json(
            {
              error: {
                code: "PRECONDITION_FAILED",
                message: "Das Ereignis wurde zwischenzeitlich geändert.",
              },
            },
            412,
          );
        }
        const uid = decodeURIComponent(path.split("/").at(-1)!);
        const index = eventState.findIndex((item) => item.uid === uid);
        if (index >= 0) eventState.splice(index, 1);
        return new Response(null, { status: 204 });
      }
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
  return { fetchMock, eventState, taskState, linkState };
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
    expect(screen.getByText("Offen und wichtig")).toBeVisible();
    expect(screen.getByText("Roadmap prüfen")).toBeVisible();

    await user.click(screen.getAllByRole("button", { name: "Kalender" })[0]!);
    expect(
      await screen.findByRole("heading", { name: "Kalender" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Ruhiger Fokusblock bearbeiten" }),
    ).toBeVisible();
  });

  it("richtet den ersten lokalen App-Start ohne Terminal ein", async () => {
    const { fetchMock } = installApi({ setupRequired: true });
    const user = userEvent.setup();
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Lokal einrichten" }),
    ).toBeVisible();
    await user.type(screen.getByLabelText("Anzeigename"), "Anton Lokal");
    await user.type(
      screen.getByLabelText("App-Passwort"),
      "synthetic-app-password-2032",
    );
    await user.type(
      screen.getByLabelText("App-Passwort wiederholen"),
      "synthetic-app-password-2032",
    );
    await user.type(
      screen.getByLabelText("CalDAV-Passwort"),
      "synthetic-caldav-password-2032",
    );
    await user.type(
      screen.getByLabelText("CalDAV-Passwort wiederholen"),
      "synthetic-caldav-password-2032",
    );
    await user.click(
      screen.getByRole("button", { name: "Life OS einrichten" }),
    );

    expect(
      await screen.findByRole("heading", { name: /Guten Tag, Anton/ }),
    ).toBeVisible();
    const setupRequest = fetchMock.mock.calls.find(
      ([path, init]) => path === "/api/v1/setup" && init?.method === "POST",
    );
    expect(setupRequest).toBeDefined();
    expect(requestBody(setupRequest?.[1])).toMatchObject({
      displayName: "Anton Lokal",
      password: "synthetic-app-password-2032",
      calDavPassword: "synthetic-caldav-password-2032",
    });
  });

  it("zeigt nach abgeschlossener Einrichtung die Anmeldung ohne Fehler", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const path =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if (path === "/api/v1/setup") {
          return json({ required: false });
        }
        return json(
          {
            error: {
              code: "UNAUTHORIZED",
              message: "Eine lokale Anmeldung ist erforderlich.",
            },
          },
          401,
        );
      }),
    );

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Lokal anmelden" }),
    ).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("öffnet über Dashboard-Schnellaktionen die vorhandenen Erstellformulare", async () => {
    installApi();
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", { name: /Guten Tag, Anton/ });
    await user.click(screen.getByRole("button", { name: /Aufgabe erstellen/ }));
    expect(
      await screen.findByRole("region", {
        name: "Was möchtest du erledigen?",
      }),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Schließen" }));
    await user.click(screen.getAllByRole("button", { name: "Übersicht" })[0]!);
    await user.click(screen.getByRole("button", { name: /Termin erstellen/ }));
    expect(
      await screen.findByRole("region", { name: "Zeit bewusst einplanen" }),
    ).toBeVisible();
  });

  it("legt einen Studienabschnitt und ein Modul nachvollziehbar an", async () => {
    installApi();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: /Guten Tag, Anton/ });
    await user.click(screen.getAllByRole("button", { name: "Studium" })[0]!);
    await user.click(screen.getByRole("button", { name: "Abschnitt anlegen" }));
    await user.type(
      screen.getByLabelText("Studiengang oder Ausbildungsbereich"),
      "Synthetischer Studiengang",
    );
    await user.type(
      screen.getByLabelText("Hochschule oder Bildungseinrichtung"),
      "Lokale Testhochschule",
    );
    await user.type(
      screen.getByLabelText("Semester oder Studienabschnitt"),
      "Sommersemester 2032",
    );
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByText("Synthetischer Studiengang")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Modul hinzufügen" }));
    await user.type(
      screen.getByLabelText("Modul oder Kurs"),
      "Nachvollziehbare Systeme",
    );
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByText("Nachvollziehbare Systeme")).toBeVisible();
  });

  it("legt ein Projekt und ein messbares Ziel in der Projektansicht an", async () => {
    installApi();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: /Guten Tag, Anton/ });
    await user.click(screen.getAllByRole("button", { name: "Projekte" })[0]!);
    await user.click(screen.getByRole("button", { name: "Projekt" }));
    await user.type(
      screen.getByLabelText("Bezeichnung"),
      "Synthetisches Wissensprojekt",
    );
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    expect(
      (await screen.findAllByText("Synthetisches Wissensprojekt"))[0],
    ).toBeVisible();
    expect(screen.getByText("Noch keine Fortschrittsdaten")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Ziel hinzufügen" }));
    await user.type(
      screen.getByLabelText("Bezeichnung"),
      "Nachvollziehbares Ziel",
    );
    await user.selectOptions(screen.getByLabelText("Status"), "completed");
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByText("Nachvollziehbares Ziel")).toBeVisible();
    expect(
      screen.getByText(/1 von 1 aktiven Einträgen abgeschlossen/),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Projekt bearbeiten" }),
    );
    await user.clear(screen.getByLabelText("Bezeichnung"));
    await user.type(screen.getByLabelText("Bezeichnung"), "Projekt bearbeitet");
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    expect((await screen.findAllByText("Projekt bearbeitet"))[0]).toBeVisible();
    await user.click(
      screen.getByRole("button", {
        name: "Nachvollziehbares Ziel archivieren",
      }),
    );
    expect(
      await screen.findByRole("button", {
        name: "Nachvollziehbares Ziel wiederherstellen",
      }),
    ).toBeVisible();
  });

  it("zeigt einen verständlichen Dashboard-Fehler mit Wiederholungsaktion", async () => {
    installApi({ dashboardError: true });
    render(<App />);

    await screen.findByRole("heading", { name: /Guten Tag, Anton/ });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Das Dashboard ist vorübergehend nicht verfügbar.",
    );
    expect(
      screen.getByRole("button", { name: "Erneut versuchen" }),
    ).toBeEnabled();
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

  it("wechselt Ansichten und löscht einen Termin mit seinem ETag", async () => {
    const { fetchMock } = installApi();
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", { name: /Guten Tag, Anton/ });
    await user.click(screen.getAllByRole("button", { name: "Kalender" })[0]!);
    await user.click(screen.getByRole("button", { name: "Tag" }));
    expect(
      screen.getByRole("button", { name: "Ruhiger Fokusblock bearbeiten" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Monat" }));
    expect(
      screen.getByRole("button", { name: /Ruhiger Fokusblock/ }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Agenda" }));

    await user.click(
      screen.getByRole("button", { name: "Ruhiger Fokusblock bearbeiten" }),
    );
    await user.click(screen.getByRole("button", { name: "Löschen" }));
    await user.click(screen.getByRole("button", { name: "Endgültig löschen" }));

    expect(
      await screen.findByText("Dieser Kalender ist noch frei"),
    ).toBeVisible();
    const deleteCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "DELETE",
    ) as [string, RequestInit] | undefined;
    expect(deleteCall?.[0]).toBe(
      "/api/v1/calendars/kalender-1/events/termin-1",
    );
    expect(new Headers(deleteCall?.[1].headers).get("If-Match")).toBe(
      '"etag-1"',
    );
  });

  it("lädt bei einem veralteten ETag die aktuelle Terminversion neu", async () => {
    installApi({ deleteEventConflict: true });
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", { name: /Guten Tag, Anton/ });
    await user.click(screen.getAllByRole("button", { name: "Kalender" })[0]!);
    await user.click(
      screen.getByRole("button", { name: "Ruhiger Fokusblock bearbeiten" }),
    );
    await user.click(screen.getByRole("button", { name: "Löschen" }));
    await user.click(screen.getByRole("button", { name: "Endgültig löschen" }));

    expect(
      await screen.findByText(/aktuelle Version wurde neu geladen/),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Ruhiger Fokusblock bearbeiten" }),
    ).toBeVisible();
  });

  it("zeigt eine Aufgaben-Termin-Verknüpfung in beiden Editoren", async () => {
    installApi();
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", { name: /Guten Tag, Anton/ });
    await user.click(screen.getAllByRole("button", { name: "Aufgaben" })[0]!);
    await user.click(
      screen.getByRole("button", { name: "Roadmap prüfen bearbeiten" }),
    );
    const taskEditor = screen.getByRole("region", { name: "Roadmap prüfen" });
    await user.selectOptions(
      within(taskEditor).getByLabelText("Termin auswählen"),
      "termin-1",
    );
    await user.click(
      within(taskEditor).getByRole("button", { name: "Verknüpfen" }),
    );
    expect(
      await within(taskEditor).findByText("Ruhiger Fokusblock"),
    ).toBeVisible();
    await user.click(
      within(taskEditor).getByRole("button", { name: "Schließen" }),
    );

    await user.click(screen.getAllByRole("button", { name: "Kalender" })[0]!);
    await user.click(
      screen.getByRole("button", { name: "Ruhiger Fokusblock bearbeiten" }),
    );
    const eventEditor = screen.getByRole("region", {
      name: "Ruhiger Fokusblock",
    });
    expect(within(eventEditor).getByText("Roadmap prüfen")).toBeVisible();
    await user.click(
      within(eventEditor).getByRole("button", {
        name: "Verknüpfung mit Roadmap prüfen entfernen",
      }),
    );
    expect(
      await within(eventEditor).findByText("Noch keine Verknüpfung."),
    ).toBeVisible();
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

  it("plant einen Arbeitsbereich mit Projekt und getrennten Zeitarten", async () => {
    installApi();
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", { name: /Guten Tag, Anton/ });
    await user.click(screen.getAllByRole("button", { name: "Arbeit" })[0]!);
    await user.click(
      screen.getByRole("button", { name: "Arbeitsbereich anlegen" }),
    );
    await user.type(
      screen.getByLabelText("Arbeitsbereich"),
      "Synthetische Praxis",
    );
    await user.type(
      screen.getByLabelText("Position oder Rolle"),
      "Praxisrolle",
    );
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    expect(
      await screen.findByRole("heading", { name: "Synthetische Praxis" }),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: /Projekt hinzufügen/ }),
    );
    await user.type(
      screen.getByLabelText("Projekt oder Praxisbereich"),
      "Synthetisches Arbeitsprojekt",
    );
    await user.type(
      screen.getByLabelText("Ziel"),
      "Nachvollziehbarer Testfortschritt",
    );
    await user.type(screen.getByLabelText("Frist"), "2032-06-30");
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    expect(
      await screen.findByText("Synthetisches Arbeitsprojekt"),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: /Zeit erfassen/ }));
    await user.type(
      screen.getByLabelText("Bezeichnung"),
      "Geplanter Fokusblock",
    );
    await user.type(screen.getByLabelText("Beginn"), "2032-06-15T09:00");
    await user.type(screen.getByLabelText("Ende"), "2032-06-15T10:30");
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByText("Geplanter Fokusblock")).toBeVisible();
    expect(screen.getByText("1 h 30 min")).toBeVisible();
    expect(screen.getByText("0 h 0 min")).toBeVisible();
  });

  it("zeigt gemeinsame Woche, Konflikte, Filter und persönliche Verfügbarkeit", async () => {
    installApi();
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", { name: /Guten Tag, Anton/ });
    await user.click(screen.getAllByRole("button", { name: "Planung" })[0]!);
    expect(
      await screen.findByRole("heading", {
        name: "Woche und Agenda aus deinen Quelldaten",
      }),
    ).toBeVisible();
    expect(screen.getByText("Gemeinsamer Termin A")).toBeVisible();
    expect(screen.getByText("Synthetische Prüfung")).toBeVisible();
    expect(
      screen.getByText(/Zwei feste Termine überschneiden sich/),
    ).toBeVisible();

    await user.click(screen.getByRole("checkbox", { name: "Studium" }));
    expect(screen.queryByText("Synthetische Prüfung")).not.toBeInTheDocument();
    expect(screen.getByText("Gemeinsamer Termin A")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Agenda" }));
    expect(
      screen.getByRole("region", { name: "Gemeinsame Agenda" }),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: /Fenster hinzufügen/ }),
    );
    await user.selectOptions(screen.getByLabelText("Wochentag"), "1");
    await user.clear(screen.getByLabelText("Von"));
    await user.type(screen.getByLabelText("Von"), "09:00");
    await user.clear(screen.getByLabelText("Bis"));
    await user.type(screen.getByLabelText("Bis"), "12:00");
    await user.type(screen.getByLabelText("Bezeichnung"), "Fokuszeit");
    await user.click(
      screen.getByRole("button", { name: "Verfügbarkeit speichern" }),
    );
    expect(await screen.findByText(/09:00–12:00 · Fokuszeit/)).toBeVisible();
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
