import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../../src/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("API-Client", () => {
  it("sendet Sitzungsanfragen nur mit Cookie-Modus an die lokale API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "authenticated",
          expiresAt: "2026-07-22T12:00:00.000Z",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api.createSession("synthetisches-passwort");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/session");
    expect(init.credentials).toBe("include");
    expect(init.method).toBe("POST");
    expect(typeof init.body).toBe("string");
    expect(JSON.parse(init.body as string)).toEqual({
      password: "synthetisches-passwort",
    });
  });

  it("verwendet beim Aktualisieren den ETag als If-Match", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ uid: "termin-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api.updateEvent("kalender-1", "termin/1", '"etag-1"', {
      title: "Termin",
      timezone: "Europe/Berlin",
      isAllDay: false,
      startsAt: "2026-07-22T10:00:00.000Z",
      endsAt: "2026-07-22T11:00:00.000Z",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/calendars/kalender-1/events/termin%2F1");
    expect(new Headers(init.headers).get("If-Match")).toBe('"etag-1"');
    expect(init.method).toBe("PUT");
  });

  it("verwendet auch beim Löschen den aktuellen ETag als If-Match", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await api.deleteEvent("kalender-1", "termin/1", '"etag-2"');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/calendars/kalender-1/events/termin%2F1");
    expect(init.method).toBe("DELETE");
    expect(new Headers(init.headers).get("If-Match")).toBe('"etag-2"');
  });

  it("bildet versionierte API-Fehler auf einen typisierten Fehler ab", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              version: "1",
              code: "PRECONDITION_FAILED",
              message: "Der Termin wurde zwischenzeitlich geändert.",
              requestId: "request-1",
            },
          }),
          { status: 412, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(api.listEvents("kalender-1")).rejects.toEqual(
      expect.objectContaining({
        status: 412,
        code: "PRECONDITION_FAILED",
        name: "ApiClientError",
        message: "Der Termin wurde zwischenzeitlich geändert.",
      }),
    );
  });

  it("verwendet für Aufgaben CRUD nur die versionierte lokale API", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "aufgabe-1" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "aufgabe-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await api.listTasks(true);
    await api.createTask({ title: "Synthetische Aufgabe" });
    await api.updateTask("aufgabe/1", { status: "done" });
    await api.deleteTask("aufgabe/1");

    const taskCalls = fetchMock.mock.calls as unknown as Array<
      [string, RequestInit]
    >;
    expect(taskCalls.map(([url]) => url)).toEqual([
      "/api/v1/tasks?includeArchived=true",
      "/api/v1/tasks",
      "/api/v1/tasks/aufgabe%2F1",
      "/api/v1/tasks/aufgabe%2F1",
    ]);
    expect(taskCalls.map(([, init]) => init.credentials)).toEqual([
      "include",
      "include",
      "include",
      "include",
    ]);
  });

  it("verwaltet Aufgaben-Termin-Beziehungen über den additiven v1-Vertrag", async () => {
    const link = {
      id: "link-1",
      task: { id: "aufgabe-1", title: "Aufgabe", available: true },
      event: {
        calendarId: "kalender-1",
        uid: "termin-1",
        title: "Termin",
        available: true,
      },
      createdAt: "2026-07-29T13:00:00.000Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(link), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await api.listTaskEventLinks();
    await api.createTaskEventLink({
      taskId: "aufgabe-1",
      calendarId: "kalender-1",
      eventUid: "termin-1",
    });
    await api.deleteTaskEventLink("link/1");

    const calls = fetchMock.mock.calls as unknown as Array<
      [string, RequestInit]
    >;
    expect(calls.map(([url]) => url)).toEqual([
      "/api/v1/task-event-links",
      "/api/v1/task-event-links",
      "/api/v1/task-event-links/link%2F1",
    ]);
    expect(calls.map(([, init]) => init.method ?? "GET")).toEqual([
      "GET",
      "POST",
      "DELETE",
    ]);
    expect(JSON.parse(calls[1]?.[1].body as string)).toEqual({
      taskId: "aufgabe-1",
      calendarId: "kalender-1",
      eventUid: "termin-1",
    });
  });

  it("lädt den Organisations-Snapshot rein lesend aus der v1-API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          generatedAt: "2032-05-01T00:00:00.000Z",
          timezone: "Europe/Berlin",
          tasks: [],
          events: [],
          projects: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api.getDashboard();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/dashboard");
    expect(init.credentials).toBe("include");
    expect(init.method).toBeUndefined();
    expect(init.body).toBeUndefined();
  });

  it("verwendet für KI-Quellen und Bestätigung nur den lokalen v1-Vertrag", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            enabled: false,
            providerId: null,
            processingMode: "local",
            externalTransferEnabled: false,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            interactionId: "interaktion-1",
            status: "disabled",
            sources: [],
            suggestions: [],
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            interactionId: "interaktion-1",
            suggestionId: "vorschlag-1",
            status: "confirmed",
            domainChangesApplied: false,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await api.getAiStatus();
    await api.createAiQuery({ query: "Synthetische lokale Frage" });
    await api.confirmAiSuggestion("interaktion/1", "vorschlag/1");

    const calls = fetchMock.mock.calls as unknown as Array<
      [string, RequestInit]
    >;
    expect(calls.map(([url]) => url)).toEqual([
      "/api/v1/ai/status",
      "/api/v1/ai/queries",
      "/api/v1/ai/interactions/interaktion%2F1/suggestions/vorschlag%2F1/confirm",
    ]);
    expect(calls.map(([, init]) => init.credentials)).toEqual([
      "include",
      "include",
      "include",
    ]);
    expect(JSON.parse(calls[1]?.[1].body as string)).toEqual({
      query: "Synthetische lokale Frage",
    });
  });
});
