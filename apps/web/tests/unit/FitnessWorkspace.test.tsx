import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFitness: vi.fn(),
}));

vi.mock("../../src/api", () => ({
  ApiClientError: class ApiClientError extends Error {},
  api: {
    getFitness: mocks.getFitness,
    createFitnessPlan: vi.fn(),
    updateFitnessPlan: vi.fn(),
    createFitnessExercise: vi.fn(),
    updateFitnessExercise: vi.fn(),
    addFitnessPlanExercise: vi.fn(),
    updateFitnessPlanExercise: vi.fn(),
    createFitnessSession: vi.fn(),
    updateFitnessSession: vi.fn(),
    createFitnessSet: vi.fn(),
    updateFitnessSet: vi.fn(),
    createBodyWeight: vi.fn(),
    updateBodyWeight: vi.fn(),
  },
}));

import { FitnessWorkspace } from "../../src/components/FitnessWorkspace";

describe("Fitnessoberfläche", () => {
  beforeEach(() => mocks.getFitness.mockReset());

  it("zeigt Verlauf, Bestleistungen und den eigenständigen Kalenderbezug", async () => {
    mocks.getFitness.mockResolvedValue({
      plans: [
        {
          id: "plan-1",
          ownerId: "owner-1",
          name: "Synthetischer Plan",
          notes: null,
          archivedAt: null,
          createdAt: "2032-01-01T00:00:00.000Z",
          updatedAt: "2032-01-01T00:00:00.000Z",
        },
      ],
      exercises: [
        {
          id: "exercise-1",
          ownerId: "owner-1",
          name: "Synthetische Kniebeuge",
          notes: null,
          archivedAt: null,
          createdAt: "2032-01-01T00:00:00.000Z",
          updatedAt: "2032-01-01T00:00:00.000Z",
        },
      ],
      planExercises: [],
      sessions: [
        {
          id: "session-1",
          ownerId: "owner-1",
          planId: "plan-1",
          title: "Synthetische Einheit",
          status: "completed",
          performedAt: "2032-01-02T17:00:00.000Z",
          timezone: "Europe/Berlin",
          notes: null,
          calendar: {
            calendarId: "calendar-1",
            eventUid: "event-1",
            title: "Geplantes Training",
          },
          archivedAt: null,
          createdAt: "2032-01-01T00:00:00.000Z",
          updatedAt: "2032-01-02T18:00:00.000Z",
        },
      ],
      sets: [
        {
          id: "set-1",
          ownerId: "owner-1",
          sessionId: "session-1",
          exerciseId: "exercise-1",
          setNumber: 1,
          repetitions: 8,
          weightGrams: 60_000,
          durationSeconds: null,
          distanceMeters: null,
          completedAt: "2032-01-02T17:15:00.000Z",
          createdAt: "2032-01-02T17:15:00.000Z",
          updatedAt: "2032-01-02T17:15:00.000Z",
        },
      ],
      bodyWeights: [
        {
          id: "weight-1",
          ownerId: "owner-1",
          measuredDate: "2032-01-02",
          weightGrams: 75_000,
          note: null,
          archivedAt: null,
          createdAt: "2032-01-02T00:00:00.000Z",
          updatedAt: "2032-01-02T00:00:00.000Z",
        },
      ],
      analytics: {
        completedSessionCount: 1,
        completedSetCount: 1,
        volumeGramRepetitions: 480_000,
        weightChangeGrams: null,
        personalBests: [
          {
            exerciseId: "exercise-1",
            maximumWeightGrams: 60_000,
            maximumRepetitions: 8,
            maximumDurationSeconds: null,
            maximumDistanceMeters: null,
          },
        ],
      },
    });

    render(
      <FitnessWorkspace
        calendars={[]}
        events={[]}
        selectedCalendarId={null}
        timezone="Europe/Berlin"
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Fitness" }),
    ).toBeVisible();
    expect(screen.getByText(/Kalender: Geplantes Training/)).toBeVisible();
    expect(screen.getAllByText(/60 kg/).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/weder Diagnosen noch medizinische Empfehlungen/),
    ).toBeVisible();
  });

  it("zeigt verständliche Leerzustände", async () => {
    mocks.getFitness.mockResolvedValue({
      plans: [],
      exercises: [],
      planExercises: [],
      sessions: [],
      sets: [],
      bodyWeights: [],
      analytics: {
        completedSessionCount: 0,
        completedSetCount: 0,
        volumeGramRepetitions: 0,
        weightChangeGrams: null,
        personalBests: [],
      },
    });

    render(
      <FitnessWorkspace
        calendars={[]}
        events={[]}
        selectedCalendarId={null}
        timezone="Europe/Berlin"
      />,
    );

    expect(
      await screen.findByText("Noch keine Trainingseinheit vorhanden."),
    ).toBeVisible();
    expect(
      screen.getByText("Noch keine Gewichtseinträge vorhanden."),
    ).toBeVisible();
    expect(screen.getByText(/Bestleistungen entstehen/)).toBeVisible();
  });
});
