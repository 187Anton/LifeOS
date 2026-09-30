import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type {
  TaskCalendarBindingResponse,
  TaskEventLinkResponse,
  TaskResponse,
} from "@lifeos/contracts";

import { TaskForm } from "../../src/components/TaskForm";

const task = (overrides: Partial<TaskResponse> = {}): TaskResponse => ({
  id: "3f6c1d5a-1c2b-4f3e-9a70-8b1d2c3e4f50",
  ownerId: "besitzer-1",
  title: "Synthetische Aufgabe",
  description: null,
  status: "open",
  priority: "medium",
  dueDate: "2032-06-01",
  scheduledStartAt: null,
  scheduledStartTimezone: null,
  estimatedDurationMinutes: null,
  tags: [],
  area: "personal",
  projectId: null,
  studyModuleId: null,
  parentTaskId: null,
  completedAt: null,
  archivedAt: null,
  createdAt: "2032-05-01T08:00:00.000Z",
  updatedAt: "2032-05-01T08:00:00.000Z",
  ...overrides,
});

const binding = (
  overrides: Partial<TaskCalendarBindingResponse> = {},
): TaskCalendarBindingResponse => ({
  id: "bindung-1",
  task: { id: task().id, title: "Synthetische Aufgabe", available: true },
  kind: "due",
  label: "Frist",
  event: {
    calendarId: "kalender-1",
    uid: `${task().id}.frist@tasks.lifeos.local`,
    title: "Frist: Synthetische Aufgabe",
    etag: '"etag-1"',
    available: true,
  },
  status: "active",
  eventKind: "all_day",
  lastKnownEtag: '"etag-1"',
  createdAt: "2032-05-01T08:00:00.000Z",
  updatedAt: "2032-05-01T08:00:00.000Z",
  ...overrides,
});

const freeLink: TaskEventLinkResponse = {
  id: "freie-verknuepfung-1",
  task: { id: task().id, title: "Synthetische Aufgabe", available: true },
  event: {
    calendarId: "kalender-1",
    uid: "freier-termin@lifeos.local",
    title: "Freier Termin",
    available: true,
  },
  createdAt: "2032-05-01T08:00:00.000Z",
};

const renderForm = ({
  value = task(),
  managedBindings = [],
  links = [],
  onReconcile = vi.fn().mockResolvedValue(undefined),
}: {
  value?: TaskResponse;
  managedBindings?: TaskCalendarBindingResponse[];
  links?: TaskEventLinkResponse[];
  onReconcile?: () => Promise<void>;
} = {}) =>
  render(
    <TaskForm
      task={value}
      tasks={[value]}
      events={[]}
      links={links}
      modules={[]}
      projects={[]}
      defaults={null}
      selectedCalendarId="kalender-1"
      timezone="Europe/Berlin"
      pending={false}
      managedBindings={managedBindings}
      onReconcile={onReconcile}
      onCancel={vi.fn()}
      onSubmit={vi.fn().mockResolvedValue(undefined)}
      onArchive={vi.fn().mockResolvedValue(undefined)}
      onDelete={vi.fn().mockResolvedValue(undefined)}
      onLink={vi.fn().mockResolvedValue(undefined)}
      onUnlink={vi.fn().mockResolvedValue(undefined)}
    />,
  );

describe("Verwaltete Kalenderabbildung im Aufgabeneditor", () => {
  it("trennt die verwaltete Abbildung sichtbar von den freien Verknüpfungen", () => {
    renderForm({
      managedBindings: [binding()],
      links: [freeLink],
    });

    const managed = screen.getByRole("region", {
      name: "Verwaltete Kalenderabbildung",
    });
    const free = screen.getByRole("region", { name: "Verknüpfungen" });

    expect(managed).toBeVisible();
    expect(free).toBeVisible();
    expect(managed).not.toBe(free);
    expect(screen.getByText("Frist")).toBeVisible();
    expect(screen.getByText(/Mit dem Kalender abgeglichen/)).toBeVisible();
    expect(screen.getByText(/freien Verknüpfungen darunter/)).toBeVisible();
    expect(screen.getByText("Freier Termin")).toBeVisible();
  });

  it("benennt fehlende Ereignisse, fehlende Kalender und die Startmarkierung", () => {
    const { rerender } = renderForm({
      managedBindings: [binding({ status: "event_missing" })],
    });
    expect(screen.getByText(/Das Kalenderereignis fehlt/)).toBeVisible();

    rerender(
      <TaskForm
        task={task()}
        tasks={[task()]}
        events={[]}
        links={[]}
        modules={[]}
        projects={[]}
        defaults={null}
        selectedCalendarId="kalender-1"
        timezone="Europe/Berlin"
        pending={false}
        managedBindings={[binding({ status: "calendar_missing" })]}
        onReconcile={vi.fn().mockResolvedValue(undefined)}
        onCancel={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onArchive={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
        onLink={vi.fn().mockResolvedValue(undefined)}
        onUnlink={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(
      screen.getByText(/Es wird bewusst kein anderer Kalender gewählt/),
    ).toBeVisible();
  });

  it("erklärt den geplanten Beginn ohne Dauer und prüft den Bestand auf Wunsch", async () => {
    const user = userEvent.setup();
    const onReconcile = vi.fn().mockResolvedValue(undefined);
    renderForm({
      value: task({
        scheduledStartAt: "2032-06-01T08:00:00.000Z",
        scheduledStartTimezone: "Europe/Berlin",
        estimatedDurationMinutes: null,
      }),
      onReconcile,
    });

    expect(
      screen.getByText(
        /Start ohne Dauer: Der geplante Start wird als sichtbare Startmarkierung/,
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        /Für einen verwalteten Zeitblock im Kalender ist eine Dauer/,
      ),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Bestand prüfen" }));
    expect(onReconcile).toHaveBeenCalledTimes(1);
  });
});
