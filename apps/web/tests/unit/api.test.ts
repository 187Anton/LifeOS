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
});
