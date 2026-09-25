import type {
  CalendarEventResponse,
  StudyEntryResponse,
  TaskResponse,
} from "@lifeos/contracts";
import { describe, expect, it } from "vitest";

import {
  buildCalendarProjection,
  formatProjectionTime,
  kindLabels,
  type CalendarProjectionEntry,
} from "../../src/calendar-projection";
import { rangeForView } from "../../src/calendar-view";

const owner = "nutzer-1";

const event = (
  overrides: Partial<CalendarEventResponse> = {},
): CalendarEventResponse => ({
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
  recurrenceRule: null,
  reminderMinutes: [],
  etag: '"etag-1"',
  sequence: 0,
  updatedAt: "2032-03-01T10:00:00.000Z",
  ...overrides,
});

const task = (overrides: Partial<TaskResponse> = {}): TaskResponse => ({
  id: "aufgabe-1",
  ownerId: owner,
  title: "Synthetische Aufgabe",
  description: null,
  status: "open",
  priority: "high",
  dueDate: null,
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
  createdAt: "2032-03-01T10:00:00.000Z",
  updatedAt: "2032-03-01T10:00:00.000Z",
  ...overrides,
});

const studyEntry = (
  overrides: Partial<StudyEntryResponse> = {},
): StudyEntryResponse => ({
  id: "eintrag-1",
  ownerId: owner,
  moduleId: "modul-1",
  kind: "submission",
  title: "Synthetische Abgabe",
  status: "planned",
  dueDate: null,
  startsAt: null,
  endsAt: null,
  timezone: "Europe/Berlin",
  credits: null,
  grade: null,
  notes: null,
  taskId: null,
  calendarEventId: null,
  calendarEventUid: null,
  calendarEventCalendarId: null,
  archivedAt: null,
  createdAt: "2032-03-01T10:00:00.000Z",
  updatedAt: "2032-03-01T10:00:00.000Z",
  ...overrides,
});

const build = (
  overrides: {
    events?: CalendarEventResponse[];
    tasks?: TaskResponse[];
    studyEntries?: StudyEntryResponse[];
    view?: ReturnType<typeof rangeForView>;
    /**
     * Profilzeitzone und Tagesgrenze der Ansicht. Sie gilt für Aufgaben,
     * Studieneinträge und Ereignisse; es gibt bewusst keinen zweiten
     * Kalender-Zeitzonenwert mehr, der einen anderen sichtbaren Tag erzeugen
     * könnte.
     */
    profileTimezone?: string;
    /**
     * Ausgewählter Kalender der Ansicht; bildet die erste Hälfte der
     * öffentlichen Identität `(calendarId, uid)` der gezeigten Ereignisse.
     */
    calendarId?: string | null;
  } = {},
): CalendarProjectionEntry[] =>
  buildCalendarProjection({
    events: overrides.events ?? [],
    tasks: overrides.tasks ?? [],
    studyEntries: overrides.studyEntries ?? [],
    range: overrides.view ?? rangeForView("week", "2032-03-10"),
    profileTimezone: overrides.profileTimezone ?? "Europe/Berlin",
    calendarId: overrides.calendarId ?? "kalender-1",
    ownerId: owner,
  });

describe("Gemeinsame Kalenderprojektion", () => {
  it("zeigt Frist, geplanten Zeitblock und Startmarkierung unterscheidbar", () => {
    const entries = build({
      tasks: [
        task({ id: "aufgabe-frist", dueDate: "2032-03-10" }),
        task({
          id: "aufgabe-block",
          scheduledStartAt: "2032-03-10T08:00:00.000Z",
          scheduledStartTimezone: "Europe/Berlin",
          estimatedDurationMinutes: 90,
        }),
        task({
          id: "aufgabe-start",
          scheduledStartAt: "2032-03-10T06:00:00.000Z",
          scheduledStartTimezone: "Europe/Berlin",
        }),
      ],
    });

    const deadline = entries.find(
      (entry) => entry.item.id === "task:aufgabe-frist:deadline",
    );
    expect(deadline?.item.kind).toBe("deadline");
    expect(deadline?.item.objectType).toBe("task");
    expect(deadline?.item.ownerId).toBe(owner);
    expect(deadline?.item.editable).toBe("task");
    expect(deadline?.item.status).toBe("open");
    expect(deadline?.item.startsAt).toBeNull();
    expect(deadline?.item.durationMinutes).toBeNull();
    expect(formatProjectionTime(deadline!.item, "Europe/Berlin")).toBe(
      "Ganztägig",
    );

    const block = entries.find(
      (entry) => entry.item.id === "task:aufgabe-block:planned",
    );
    expect(block?.item.kind).toBe("planned_task");
    expect(block?.item.startsAt).toBe("2032-03-10T08:00:00.000Z");
    expect(block?.item.endsAt).toBe("2032-03-10T09:30:00.000Z");
    expect(block?.item.durationMinutes).toBe(90);

    const marker = entries.find(
      (entry) => entry.item.id === "task:aufgabe-start:start",
    );
    expect(marker?.item.kind).toBe("start_marker");
    expect(marker?.item.startsAt).toBe("2032-03-10T06:00:00.000Z");
    expect(marker?.item.endsAt).toBeNull();
    expect(marker?.item.durationMinutes).toBeNull();
    expect(marker?.dateKey).toBe("2032-03-10");
    expect(formatProjectionTime(marker!.item, "Europe/Berlin")).toBe("07:00");
    expect(kindLabels[marker!.item.kind]).toBe("Start ohne Dauer");
  });

  it("lässt eine Frist ohne belegte Arbeitszeit und ohne Ende", () => {
    const entries = build({ tasks: [task({ dueDate: "2032-03-11" })] });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.startDate).toBe("2032-03-11");
    expect(entries[0]?.startsAt).toBeNull();
    expect(entries[0]?.endsAt).toBeNull();
  });

  it("erhält Serien und ganztägige Termine in allen vier Ansichten", () => {
    const recurring = event({
      uid: "serie-1",
      recurrenceRule: "FREQ=WEEKLY;COUNT=4",
    });
    const allDay = event({
      uid: "ganztag-1",
      title: "Ganztägiger Termin",
      isAllDay: true,
      startsAt: null,
      endsAt: null,
      startDate: "2032-03-10",
      endDate: "2032-03-11",
      recurrenceRule: null,
    });
    const views = ["day", "week", "month", "agenda"] as const;
    for (const view of views) {
      const entries = build({
        events: [recurring, allDay],
        view: rangeForView(view, "2032-03-10"),
      });
      const series = entries.filter((entry) => entry.item.uid === "serie-1");
      expect(series.length).toBeGreaterThan(0);
      expect(series.every((entry) => entry.recurring)).toBe(true);
      expect(new Set(series.map((entry) => entry.item.uid))).toEqual(
        new Set(["serie-1"]),
      );
      expect(series.every((entry) => entry.event?.etag === '"etag-1"')).toBe(
        true,
      );
      const ganztag = entries.find((entry) => entry.item.uid === "ganztag-1");
      expect(ganztag?.startDate).toBe("2032-03-10");
      expect(ganztag?.startsAt).toBeNull();
      expect(ganztag?.dateKey).toBe("2032-03-10");
      expect(ganztag?.item.objectType).toBe("calendar_event");
    }
    const weekSeries = build({
      events: [recurring],
      view: rangeForView("week", "2032-03-10"),
    });
    expect(weekSeries.map((entry) => entry.dateKey)).toEqual(["2032-03-10"]);
    const agendaSeries = build({
      events: [recurring],
      view: rangeForView("agenda", "2032-03-10"),
    });
    expect(agendaSeries.map((entry) => entry.dateKey)).toEqual([
      "2032-03-10",
      "2032-03-17",
      "2032-03-24",
      "2032-03-31",
    ]);
    expect(new Set(agendaSeries.map((entry) => entry.item.sourceId))).toEqual(
      new Set(["serie-1"]),
    );
  });

  it("stellt eine verknüpfte Studienzeit nur einmal dar", () => {
    const linked = event({ uid: "vorlesung-1", title: "Verknüpfte Vorlesung" });
    const entries = build({
      events: [linked],
      studyEntries: [
        studyEntry({
          id: "eintrag-verknuepft",
          title: "Verknüpfte Vorlesung",
          kind: "lecture",
          startsAt: "2032-03-10T08:00:00.000Z",
          endsAt: "2032-03-10T09:30:00.000Z",
          calendarEventId: "ereignis-1",
          calendarEventUid: "vorlesung-1",
          calendarEventCalendarId: "kalender-1",
        }),
        studyEntry({
          id: "eintrag-eigen",
          title: "Eigene Lernzeit",
          kind: "learning",
          startsAt: "2032-03-10T10:00:00.000Z",
          endsAt: "2032-03-10T11:00:00.000Z",
        }),
      ],
    });
    expect(
      entries.filter((entry) => entry.item.title === "Verknüpfte Vorlesung"),
    ).toHaveLength(1);
    expect(
      entries.some((entry) => entry.item.sourceId === "eintrag-verknuepft"),
    ).toBe(false);
    const own = entries.find(
      (entry) => entry.item.sourceId === "eintrag-eigen",
    );
    expect(own?.item.kind).toBe("planned_task");
    expect(own?.item.objectType).toBe("study_entry");
    expect(own?.item.editable).toBeNull();
  });

  it("behält Frist und Zeitblock derselben Aufgabe als zwei Projektionen", () => {
    const entries = build({
      tasks: [
        task({
          id: "aufgabe-doppelt",
          dueDate: "2032-03-10",
          scheduledStartAt: "2032-03-10T08:00:00.000Z",
          scheduledStartTimezone: "Europe/Berlin",
          estimatedDurationMinutes: 60,
        }),
      ],
    });
    expect(entries.map((entry) => entry.item.kind)).toEqual([
      "deadline",
      "planned_task",
    ]);
    expect(new Set(entries.map((entry) => entry.item.sourceId))).toEqual(
      new Set(["aufgabe-doppelt"]),
    );
  });

  it("blendet erledigte und archivierte Quellen aus", () => {
    const entries = build({
      tasks: [
        task({ id: "aufgabe-done", status: "done", dueDate: "2032-03-10" }),
        task({ id: "aufgabe-open", dueDate: "2032-03-10" }),
      ],
      studyEntries: [
        studyEntry({
          id: "eintrag-archiv",
          dueDate: "2032-03-10",
          archivedAt: "2032-03-02T10:00:00.000Z",
        }),
        studyEntry({ id: "eintrag-aktiv", dueDate: "2032-03-10" }),
      ],
    });
    expect(entries.map((entry) => entry.item.sourceId).sort()).toEqual([
      "aufgabe-open",
      "eintrag-aktiv",
    ]);
  });

  it("hält Startmarkierungen über die Zeitumstellung im richtigen Tag", () => {
    const entries = build({
      tasks: [
        task({
          id: "aufgabe-spring",
          scheduledStartAt: "2032-03-28T00:30:00.000Z",
          scheduledStartTimezone: "Europe/Berlin",
        }),
      ],
      view: rangeForView("day", "2032-03-28"),
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.dateKey).toBe("2032-03-28");
    expect(formatProjectionTime(entries[0]!.item, "Europe/Berlin")).toBe(
      "01:30",
    );

    const noEntries = build({
      tasks: [
        task({
          id: "aufgabe-spring",
          scheduledStartAt: "2032-03-28T00:30:00.000Z",
          scheduledStartTimezone: "Europe/Berlin",
        }),
      ],
      view: rangeForView("day", "2032-03-29"),
    });
    expect(noEntries).toHaveLength(0);
  });

  it("gibt Aufgaben, Studium und Terminen bei abweichender Kalenderzeitzone denselben sichtbaren Tag", () => {
    const entries = build({
      view: { start: "2032-03-10", end: "2032-03-12" },
      profileTimezone: "Europe/Berlin",
      tasks: [
        task({
          id: "aufgabe-tz",
          scheduledStartAt: "2032-03-10T23:30:00.000Z",
          scheduledStartTimezone: "Europe/Berlin",
          estimatedDurationMinutes: 30,
        }),
      ],
      studyEntries: [
        studyEntry({
          id: "eintrag-tz",
          kind: "learning",
          title: "Synthetische Lernzeit",
          startsAt: "2032-03-10T23:00:00.000Z",
          endsAt: "2032-03-10T23:45:00.000Z",
          timezone: "Europe/Berlin",
        }),
      ],
      events: [
        event({
          uid: "termin-ny",
          title: "Termin in New York",
          timezone: "America/New_York",
          startsAt: "2032-03-11T02:00:00.000Z",
          endsAt: "2032-03-11T03:00:00.000Z",
        }),
      ],
    });

    /*
     * Der Aufgabenblock und die Studienzeit liegen in Berlin (Profilzeitzone)
     * auf dem 11., in New York auf dem 10. Die Projektion folgt der
     * Profilzeitzone – für Aufgaben, Studium und Termine gleichermaßen, damit
     * ein abweichender Kalender-Zeitzonenwert keinen anderen sichtbaren Tag
     * ergibt.
     */
    const block = entries.find(
      (entry) => entry.item.id === "task:aufgabe-tz:planned",
    );
    expect(block?.dateKey).toBe("2032-03-11");
    expect(block?.item.timezone).toBe("Europe/Berlin");

    const study = entries.find((entry) => entry.item.sourceId === "eintrag-tz");
    expect(study?.dateKey).toBe("2032-03-11");
    expect(study?.item.kind).toBe("planned_task");

    /*
     * Der Termin steht am selben sichtbaren Tag, wird aber in seiner
     * gespeicherten Zeitzone beschriftet; das zugrunde liegende Ereignis bleibt
     * mit Zeitpunkt und Zeitzone unverändert und damit der Bearbeitungspfad.
     */
    const nyEvent = entries.find((entry) => entry.item.uid === "termin-ny");
    expect(nyEvent?.dateKey).toBe("2032-03-11");
    expect(nyEvent?.event?.startsAt).toBe("2032-03-11T02:00:00.000Z");
    expect(nyEvent?.item.timezone).toBe("America/New_York");
    expect(formatProjectionTime(nyEvent!.item, nyEvent!.item.timezone)).toBe(
      "21:00–22:00",
    );
  });

  it("unterdrückt einen verknüpften Studieneintrag nur bei gleicher UID im selben Kalender", () => {
    const linkUid = "vorlesung-doppelt";
    const linkedEntry = (calendarEventCalendarId: string) =>
      studyEntry({
        id: `eintrag-${calendarEventCalendarId}`,
        kind: "lecture",
        title: "Synthetische Vorlesung",
        startsAt: "2032-03-11T08:00:00.000Z",
        endsAt: "2032-03-11T10:00:00.000Z",
        timezone: "Europe/Berlin",
        calendarEventUid: linkUid,
        calendarEventCalendarId,
      });
    const sharedEvents = [
      event({
        uid: linkUid,
        title: "Vorlesung im gezeigten Kalender",
        startsAt: "2032-03-11T08:00:00.000Z",
        endsAt: "2032-03-11T10:00:00.000Z",
      }),
    ];

    /*
     * Dieselbe UID kommt in zwei Kalendern vor. Nur der Eintrag, der den
     * tatsächlich gezeigten Termin als führenden Termin führt, wird
     * unterdrückt; der Eintrag mit derselben UID aus dem anderen Kalender
     * bleibt sichtbar.
     */
    const sameCalendar = build({
      calendarId: "kalender-1",
      events: sharedEvents,
      studyEntries: [linkedEntry("kalender-1")],
    });
    expect(
      sameCalendar.some(
        (entry) => entry.item.sourceId === "eintrag-kalender-1",
      ),
    ).toBe(false);
    expect(
      sameCalendar.filter((entry) => entry.item.uid === linkUid),
    ).toHaveLength(1);

    const otherCalendar = build({
      calendarId: "kalender-1",
      events: sharedEvents,
      studyEntries: [linkedEntry("kalender-2")],
    });
    expect(
      otherCalendar.some(
        (entry) => entry.item.sourceId === "eintrag-kalender-2",
      ),
    ).toBe(true);
    /*
     * Die UID allein darf nie als kalenderübergreifender Schlüssel dienen:
     * Studienergebnisse tragen keine Ereignis-UID, deshalb trägt genau der
     * eine gezeigte Termin die UID – die Studienzeit daneben bleibt sichtbar.
     */
    expect(
      otherCalendar.filter((entry) => entry.item.uid === linkUid),
    ).toHaveLength(1);
  });

  it("wendet in der Kalenderansicht dieselben Statusfälle an wie die Planungs-API", () => {
    /*
     * Gemeinsame Statusregel der Projektion (auch in der Planungs-API
     * umgesetzt): erledigt und abgebrochen bleiben unsichtbar, aktiv
     * einschließlich `paused` bleibt sichtbar, archiviert bleibt unsichtbar.
     */
    const entries = build({
      studyEntries: [
        studyEntry({
          id: "aktiv",
          title: "Aktiver Eintrag",
          status: "planned",
          dueDate: "2032-03-11",
        }),
        studyEntry({
          id: "pausiert",
          title: "Pausierter Eintrag",
          status: "paused",
          dueDate: "2032-03-11",
        }),
        studyEntry({
          id: "erledigt",
          title: "Erledigter Eintrag",
          status: "completed",
          dueDate: "2032-03-11",
        }),
        studyEntry({
          id: "abgebrochen",
          title: "Abgebrochener Eintrag",
          status: "cancelled",
          dueDate: "2032-03-11",
        }),
        studyEntry({
          id: "archiviert",
          title: "Archivierter Eintrag",
          status: "planned",
          dueDate: "2032-03-11",
          archivedAt: "2032-03-01T10:00:00.000Z",
        }),
      ],
    });

    const ids = entries.map((entry) => entry.item.sourceId);
    expect(ids).toEqual(["aktiv", "pausiert"]);
  });

  it("zeigt einen Mitternachtsblock genau einmal am Anzeigetag mit Fortsetzung", () => {
    const block = task({
      id: "aufgabe-mitternacht",
      title: "Mitternachtsblock",
      scheduledStartAt: "2032-03-10T22:00:00.000Z",
      scheduledStartTimezone: "Europe/Berlin",
      estimatedDurationMinutes: 120,
    });

    /* (i) Zeitraum = Starttag: ein Eintrag, Fortsetzung am Folgetag. */
    const startDay = build({
      tasks: [block],
      view: { start: "2032-03-10", end: "2032-03-11" },
    });
    expect(startDay).toHaveLength(1);
    expect(startDay[0]?.dateKey).toBe("2032-03-10");
    expect(startDay[0]?.continuesBefore).toBe(false);
    expect(startDay[0]?.continuesAfter).toBe(true);

    /* (ii) Zeitraum = Folgetag: genau eine Fortsetzung, kein Zusatzeintrag. */
    const nextDay = build({
      tasks: [block],
      view: { start: "2032-03-11", end: "2032-03-12" },
    });
    expect(nextDay).toHaveLength(1);
    expect(nextDay[0]?.dateKey).toBe("2032-03-11");
    expect(nextDay[0]?.continuesBefore).toBe(true);
    expect(nextDay[0]?.continuesAfter).toBe(false);

    /* (iii) Wochenzeitraum: trotz Überschreitung genau ein Eintrag. */
    const week = build({
      tasks: [block],
      view: rangeForView("week", "2032-03-10"),
    });
    expect(
      week.filter((entry) => entry.item.sourceId === "aufgabe-mitternacht"),
    ).toHaveLength(1);
    expect(week[0]?.dateKey).toBe("2032-03-10");
    expect(week[0]?.continuesAfter).toBe(true);
  });

  it("führt einen Block über die Wochengrenze in beiden Wochen fort", () => {
    const block = task({
      id: "aufgabe-wochengrenze",
      title: "Block über die Wochengrenze",
      /* Sonntag 23:00 bis Montag 01:00 in der Profilzeitzone. */
      scheduledStartAt: "2032-03-14T22:00:00.000Z",
      scheduledStartTimezone: "Europe/Berlin",
      estimatedDurationMinutes: 120,
    });

    const sundayWeek = build({
      tasks: [block],
      view: rangeForView("week", "2032-03-10"),
    });
    expect(sundayWeek).toHaveLength(1);
    expect(sundayWeek[0]?.dateKey).toBe("2032-03-14");
    expect(sundayWeek[0]?.continuesBefore).toBe(false);
    expect(sundayWeek[0]?.continuesAfter).toBe(true);

    const mondayWeek = build({
      tasks: [block],
      view: rangeForView("week", "2032-03-15"),
    });
    expect(mondayWeek).toHaveLength(1);
    expect(mondayWeek[0]?.dateKey).toBe("2032-03-15");
    expect(mondayWeek[0]?.continuesBefore).toBe(true);
    expect(mondayWeek[0]?.continuesAfter).toBe(false);
  });

  it("blendet erledigte, abgebrochene und archivierte Studieneinträge aus, aktive bleiben", () => {
    const entries = build({
      studyEntries: [
        studyEntry({
          id: "eintrag-erledigt",
          dueDate: "2032-03-10",
          status: "completed",
        }),
        studyEntry({
          id: "eintrag-abgebrochen",
          dueDate: "2032-03-10",
          status: "cancelled",
        }),
        studyEntry({
          id: "eintrag-archiviert",
          dueDate: "2032-03-10",
          archivedAt: "2032-03-02T10:00:00.000Z",
        }),
        studyEntry({
          id: "eintrag-aktiv",
          dueDate: "2032-03-10",
          status: "active",
        }),
      ],
    });

    expect(entries.map((entry) => entry.item.sourceId)).toEqual([
      "eintrag-aktiv",
    ]);
  });

  it("unterdrückt einen verknüpften Studieneintrag nur bei tatsächlich gezeigtem führendem Termin", () => {
    const linked = (calendarEventUid: string) =>
      studyEntry({
        id: `eintrag-${calendarEventUid}`,
        title: "Verknüpfte Studienzeit",
        kind: "lecture",
        startsAt: "2032-03-10T10:00:00.000Z",
        endsAt: "2032-03-10T11:00:00.000Z",
        timezone: "Europe/Berlin",
        calendarEventUid,
        calendarEventCalendarId: "kalender-1",
      });

    /* (i) Führender Termin im gezeigten Zeitraum: nur der Termin erscheint. */
    const projected = build({
      events: [
        event({
          uid: "vorlesung-innen",
          title: "Verknüpfte Vorlesung",
          startsAt: "2032-03-10T10:00:00.000Z",
          endsAt: "2032-03-10T11:00:00.000Z",
        }),
      ],
      studyEntries: [linked("vorlesung-innen")],
    });
    expect(
      projected.filter((entry) => entry.item.title === "Verknüpfte Vorlesung"),
    ).toHaveLength(1);
    expect(
      projected.some(
        (entry) => entry.item.sourceId === "eintrag-vorlesung-innen",
      ),
    ).toBe(false);
    expect(
      projected.find((entry) => entry.item.uid === "vorlesung-innen")?.item
        .objectType,
    ).toBe("calendar_event");

    /* (ii) Führender Termin nicht geliefert (anderer Kalender): sichtbar. */
    const foreign = build({ studyEntries: [linked("vorlesung-fremd")] });
    expect(foreign.map((entry) => entry.item.sourceId)).toEqual([
      "eintrag-vorlesung-fremd",
    ]);
    expect(foreign[0]?.item.objectType).toBe("study_entry");

    /* (iii) Führender Termin außerhalb des Zeitraums: sichtbar. */
    const outside = build({
      events: [
        event({
          uid: "vorlesung-aussen",
          title: "Verknüpfte Vorlesung",
          startsAt: "2032-04-01T10:00:00.000Z",
          endsAt: "2032-04-01T11:00:00.000Z",
        }),
      ],
      studyEntries: [linked("vorlesung-aussen")],
    });
    expect(outside.map((entry) => entry.item.sourceId)).toEqual([
      "eintrag-vorlesung-aussen",
    ]);
    expect(outside.some((entry) => entry.item.uid === "vorlesung-aussen")).toBe(
      false,
    );
  });
});
