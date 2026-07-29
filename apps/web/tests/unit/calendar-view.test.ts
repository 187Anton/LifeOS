import { describe, expect, it } from "vitest";

import {
  occurrencesInRange,
  rangeForView,
  startOfWeek,
} from "../../src/calendar-view";

const event = {
  uid: "serie-1",
  title: "Vorlesung",
  description: null,
  location: null,
  isAllDay: false,
  startsAt: "2032-03-10T08:00:00.000Z",
  endsAt: "2032-03-10T09:30:00.000Z",
  startDate: null,
  endDate: null,
  timezone: "Europe/Berlin",
  recurrenceRule: "FREQ=WEEKLY;COUNT=4",
  reminderMinutes: [],
  etag: '"etag-1"',
  sequence: 0,
  updatedAt: "2032-03-01T10:00:00.000Z",
};

describe("Kalenderansichten", () => {
  it("berechnet Tages-, Wochen-, Monats- und Agendagrenzen als reine Daten", () => {
    expect(startOfWeek("2032-03-10")).toBe("2032-03-08");
    expect(rangeForView("day", "2032-03-10")).toEqual({
      start: "2032-03-10",
      end: "2032-03-11",
    });
    expect(rangeForView("week", "2032-03-10")).toEqual({
      start: "2032-03-08",
      end: "2032-03-15",
    });
    expect(rangeForView("month", "2032-03-10")).toEqual({
      start: "2032-03-01",
      end: "2032-04-01",
    });
    expect(rangeForView("agenda", "2032-03-10")).toEqual({
      start: "2032-03-10",
      end: "2032-04-09",
    });
  });

  it("projiziert Serienvorkommen ohne neue Ereignis-UIDs zu erfinden", () => {
    const occurrences = occurrencesInRange(
      [event],
      { start: "2032-03-01", end: "2032-04-15" },
      "Europe/Berlin",
    );

    expect(occurrences).toHaveLength(4);
    expect(occurrences.map((item) => item.dateKey)).toEqual([
      "2032-03-10",
      "2032-03-17",
      "2032-03-24",
      "2032-03-31",
    ]);
    expect(new Set(occurrences.map((item) => item.event.uid))).toEqual(
      new Set(["serie-1"]),
    );
    expect(occurrences[2]?.startsAt).toBe("2032-03-24T08:00:00.000Z");
  });

  it("behandelt ganztägige Termine ausschließlich als Datumswerte", () => {
    const allDay = {
      ...event,
      uid: "ganztag-1",
      isAllDay: true,
      startsAt: null,
      endsAt: null,
      startDate: "2032-04-02",
      endDate: "2032-04-03",
      recurrenceRule: null,
    };

    expect(
      occurrencesInRange(
        [allDay],
        { start: "2032-04-01", end: "2032-05-01" },
        "Europe/Berlin",
      )[0],
    ).toEqual(
      expect.objectContaining({
        startsAt: null,
        endsAt: null,
        startDate: "2032-04-02",
        endDate: "2032-04-03",
        dateKey: "2032-04-02",
      }),
    );
  });
});
