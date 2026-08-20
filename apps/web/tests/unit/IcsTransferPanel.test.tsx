import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  previewIcsImport: vi.fn(),
  commitIcsImport: vi.fn(),
  exportIcs: vi.fn(),
}));

vi.mock("../../src/api", () => ({
  ApiClientError: class ApiClientError extends Error {},
  api: mocks,
}));

import { IcsTransferPanel } from "../../src/components/IcsTransferPanel";

const icsFile = (source: string) => {
  const file = new File([source], "test.ics", { type: "text/calendar" });
  Object.defineProperty(file, "text", { value: () => Promise.resolve(source) });
  return file;
};

describe("ICS-Import und -Export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.previewIcsImport.mockResolvedValue({
      previewId: "preview-1",
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
          uid: "external-1@example.test",
          title: "<script>kein Code</script>",
          action: "conflict",
          message: "Die UID ist bereits mit anderem Inhalt vorhanden.",
          existingEtag: '"etag-1"',
        },
      ],
    });
  });

  it("zeigt nicht vertrauenswürdige Inhalte als Text und blockiert Konflikte", async () => {
    const user = userEvent.setup();
    render(<IcsTransferPanel calendarId="kalender-1" onImported={vi.fn()} />);

    await user.upload(
      screen.getByLabelText(/ICS-Datei für Vorschau/),
      icsFile("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n"),
    );

    expect(await screen.findByText("Konflikt")).toBeVisible();
    expect(screen.getByText("<script>kein Code</script>")).toBeVisible();
    expect(document.querySelector("script")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Vorschau verbindlich importieren" }),
    ).toBeDisabled();
    expect(mocks.previewIcsImport).toHaveBeenCalledWith(
      "kalender-1",
      "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n",
    );
  });

  it("importiert erst nach ausdrücklicher Bestätigung", async () => {
    const user = userEvent.setup();
    mocks.previewIcsImport.mockResolvedValueOnce({
      previewId: "preview-2",
      expiresAt: "2034-03-01T10:15:00.000Z",
      sourceSha256: "b".repeat(64),
      totalEvents: 1,
      creatableEvents: 1,
      unchangedEvents: 0,
      conflictingEvents: 0,
      invalidEvents: 0,
      canCommit: true,
      items: [
        {
          index: 0,
          uid: "new-1@example.test",
          title: "Lokaler Termin",
          action: "create",
          message: "Das Ereignis kann neu angelegt werden.",
          existingEtag: null,
        },
      ],
    });
    mocks.commitIcsImport.mockResolvedValue({
      createdEvents: 1,
      unchangedEvents: 0,
      createdUids: ["new-1@example.test"],
    });
    const onImported = vi.fn();
    render(
      <IcsTransferPanel calendarId="kalender-1" onImported={onImported} />,
    );

    await user.upload(
      screen.getByLabelText(/ICS-Datei für Vorschau/),
      icsFile("ics"),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Vorschau verbindlich importieren",
      }),
    );

    expect(mocks.commitIcsImport).toHaveBeenCalledWith(
      "kalender-1",
      "preview-2",
    );
    expect(onImported).toHaveBeenCalledOnce();
    expect(await screen.findByText(/1 Ereignisse importiert/)).toBeVisible();
  });
});
