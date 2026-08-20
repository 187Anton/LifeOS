import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getExternalCalDav: vi.fn(),
  createExternalCalDav: vi.fn(),
  setExternalCalDavEnabled: vi.fn(),
  testExternalCalDav: vi.fn(),
  listExternalCalDavCalendars: vi.fn(),
  previewExternalCalDavImport: vi.fn(),
  commitExternalCalDavImport: vi.fn(),
  revokeExternalCalDav: vi.fn(),
}));

vi.mock("../../src/api", () => ({
  ApiClientError: class ApiClientError extends Error {},
  api: mocks,
}));

import { IntegrationsWorkspace } from "../../src/components/IntegrationsWorkspace";

const calendar = {
  id: "local-calendar",
  name: "Persönlich",
  timezone: "Europe/Berlin",
  isPrimary: true,
  syncToken: 1,
};
const connection = {
  id: "connection-1",
  name: "Synthetischer CalDAV-Dienst",
  baseUrl: "https://calendar.example.test/caldav/",
  enabled: false,
  readOnly: true as const,
  status: "disabled" as const,
  credentialsConfigured: true,
  lastErrorCode: null,
  lastTestedAt: null,
  lastSyncAt: null,
  revokedAt: null,
  calendars: [],
  importedEventCount: 0,
};

describe("optionale Integrationen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getExternalCalDav.mockResolvedValue({
      available: true,
      networkDefault: "disabled",
      mode: "read_only_import",
      connections: [connection],
    });
  });

  it("zeigt Verbindungen standardmäßig deaktiviert und führt keinen Netztest aus", async () => {
    render(<IntegrationsWorkspace calendars={[calendar]} />);

    expect(
      await screen.findByRole("heading", { name: "Integrationen" }),
    ).toBeVisible();
    expect(screen.getByText("Deaktiviert")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Verbindung testen" }),
    ).toBeDisabled();
    expect(mocks.testExternalCalDav).not.toHaveBeenCalled();
  });

  it("übermittelt Zugangsdaten nur beim lokalen Konfigurieren und zeigt sie nicht an", async () => {
    const user = userEvent.setup();
    mocks.createExternalCalDav.mockResolvedValue(connection);
    render(<IntegrationsWorkspace calendars={[calendar]} />);

    await screen.findByRole("heading", { name: "Integrationen" });
    await user.type(screen.getByLabelText("Bezeichnung"), "Privater Kalender");
    await user.type(
      screen.getByLabelText("HTTPS-CalDAV-Adresse"),
      "https://calendar.example.test/caldav/",
    );
    await user.type(screen.getByLabelText("Benutzername"), "synthetisch");
    await user.type(screen.getByLabelText("Passwort"), "synthetic-local-only");
    await user.click(
      screen.getByRole("button", { name: "Verschlüsselt konfigurieren" }),
    );

    expect(mocks.createExternalCalDav).toHaveBeenCalledWith({
      name: "Privater Kalender",
      baseUrl: "https://calendar.example.test/caldav/",
      username: "synthetisch",
      password: "synthetic-local-only",
    });
    expect(await screen.findByText(/verschlüsselt gespeichert/)).toBeVisible();
    expect(screen.queryByDisplayValue("synthetic-local-only")).toBeNull();
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
  });

  it("zeigt externe Konflikte vor dem Schreiben und blockiert den Commit", async () => {
    const user = userEvent.setup();
    mocks.getExternalCalDav.mockResolvedValue({
      available: true,
      networkDefault: "disabled",
      mode: "read_only_import",
      connections: [
        {
          ...connection,
          enabled: true,
          status: "ready",
          calendars: [
            {
              id: "external-calendar-1",
              displayName: "Synthetischer Konfliktkalender",
            },
          ],
        },
      ],
    });
    mocks.previewExternalCalDavImport.mockResolvedValue({
      externalImportId: "external-import-1",
      expiresAt: "2034-03-01T10:15:00.000Z",
      localCalendarId: calendar.id,
      externalCalendarId: "external-calendar-1",
      preview: {
        previewId: "ics-preview-1",
        expiresAt: "2034-03-01T10:15:00.000Z",
        sourceSha256: "a".repeat(64),
        totalEvents: 1,
        creatableEvents: 0,
        unchangedEvents: 0,
        conflictingEvents: 1,
        invalidEvents: 0,
        canCommit: false,
        items: [
          {
            index: 0,
            uid: "conflict@example.test",
            title: "Synthetischer Konflikt",
            action: "conflict",
            message: "Die UID ist lokal bereits abweichend vorhanden.",
            existingEtag: '"local-etag"',
          },
        ],
      },
    });
    render(<IntegrationsWorkspace calendars={[calendar]} />);

    await user.selectOptions(
      await screen.findByLabelText("Externer Kalender"),
      "external-calendar-1",
    );
    await user.click(
      screen.getByRole("button", { name: "Importvorschau erstellen" }),
    );

    expect(await screen.findByText("Synthetischer Konflikt")).toBeVisible();
    expect(screen.getByText("Konflikt")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Read-only-Import bestätigen" }),
    ).toBeDisabled();
    expect(mocks.commitExternalCalDavImport).not.toHaveBeenCalled();
  });
});
