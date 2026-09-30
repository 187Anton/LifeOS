import assert from "node:assert/strict";
import test from "node:test";

import {
  composeManagedEventDescription,
  composeManagedEventTitle,
  desiredManagedEvent,
  managedEventDiffers,
  managedEventForm,
  managedEventUid,
  managedKindLabel,
  parseManagedEventDescription,
  parseManagedEventTitle,
  parseManagedEventUid,
  reviewManagedEventChange,
  statusMarker,
  type ManagedEventSource,
  type StoredManagedEvent,
} from "../src/modules/task-calendar-bindings/mapping.js";

const taskId = "3f6c1d5a-1c2b-4f3e-9a70-8b1d2c3e4f50";

const source = (
  overrides: Partial<ManagedEventSource> = {},
): ManagedEventSource => ({
  id: taskId,
  title: "Synthetische Aufgabe",
  status: "open",
  description: null,
  dueDate: null,
  scheduledStartAt: null,
  scheduledStartTimezone: null,
  estimatedDurationMinutes: null,
  archivedAt: null,
  deletedAt: null,
  ...overrides,
});

/** Gespeicherter Stand eines verwalteten Ereignisses für Formprüfungen. */
const storedEvent = (
  overrides: Partial<StoredManagedEvent> = {},
): StoredManagedEvent => ({
  uid: managedEventUid(taskId, "work_block"),
  title: "Start: Synthetische Aufgabe",
  description: null,
  timezone: "Europe/Berlin",
  isAllDay: false,
  isStartMarker: true,
  startsAt: "2032-05-04T08:15:00.000Z",
  endsAt: null,
  startDate: null,
  endDate: null,
  recurrenceRule: null,
  ...overrides,
});

test("bildet eine Frist als ganztägiges Ereignis ohne belegte Arbeitszeit ab", () => {
  const desired = desiredManagedEvent(
    source({ dueDate: "2032-03-15" }),
    "due",
    "Europe/Berlin",
  );
  assert.ok(desired);
  assert.equal(desired.isAllDay, true);
  assert.equal(desired.startDate, "2032-03-15");
  assert.equal(desired.endDate, "2032-03-16");
  assert.equal(desired.startsAt, null);
  assert.equal(desired.endsAt, null);
  assert.equal(desired.timezone, "Europe/Berlin");
  assert.equal(desired.title, "Frist: Synthetische Aufgabe");
  assert.equal(desired.uid, managedEventUid(taskId, "due"));
  assert.equal(desired.recurrenceRule, null);
});

test("führt die Frist über einen Monats-, Jahres- und Schaltjahreswechsel korrekt fort", () => {
  const next = (dueDate: string) => {
    const desired = desiredManagedEvent(
      source({ dueDate }),
      "due",
      "Europe/Berlin",
    );
    assert.ok(desired);
    return desired.endDate;
  };
  assert.equal(next("2032-01-31"), "2032-02-01");
  assert.equal(next("2032-02-28"), "2032-02-29");
  assert.equal(next("2032-12-31"), "2033-01-01");
});

test("bildet einen geplanten Start mit Dauer als zeitgebundenen Arbeitsblock ab", () => {
  const desired = desiredManagedEvent(
    source({
      scheduledStartAt: "2032-05-04T08:00:00.000Z",
      scheduledStartTimezone: "Europe/Berlin",
      estimatedDurationMinutes: 90,
    }),
    "work_block",
    "Europe/Berlin",
  );
  assert.ok(desired);
  assert.equal(desired.isAllDay, false);
  assert.equal(desired.title, "Zeitblock: Synthetische Aufgabe");
  assert.equal(desired.startDate, null);
  assert.equal(desired.endDate, null);
  assert.equal(desired.timezone, "Europe/Berlin");
  assert.equal(
    new Date(desired.endsAt as string).getTime() -
      new Date(desired.startsAt as string).getTime(),
    90 * 60_000,
  );
});

test("bildet „Start ohne Dauer“ als gezielte Startmarkierung ohne Ende ab", () => {
  const desired = desiredManagedEvent(
    source({
      scheduledStartAt: "2032-05-04T08:15:00.000Z",
      scheduledStartTimezone: "Europe/Berlin",
    }),
    "work_block",
    "Europe/Berlin",
  );
  assert.ok(desired, "Ohne Dauer entsteht eine Startmarkierung");
  assert.equal(desired.startMarker, true);
  assert.equal(desired.isAllDay, false);
  assert.equal(desired.title, "Start: Synthetische Aufgabe");
  assert.equal(desired.startsAt, "2032-05-04T08:15:00.000Z");
  assert.equal(desired.endsAt, null, "Es wird kein Ende erfunden");
  assert.equal(desired.startDate, null);
  assert.equal(desired.endDate, null);
  assert.equal(desired.timezone, "Europe/Berlin");
  assert.equal(desired.recurrenceRule, null);
  assert.equal(
    managedEventForm(
      storedEvent({
        isAllDay: false,
        isStartMarker: true,
        startsAt: desired.startsAt,
        endsAt: null,
      }),
    ),
    "start_only",
  );

  /**
   * Eine Dauer von null ist keine Startmarkierung, sondern eine unbrauchbare
   * Angabe: sie wird wie eine fehlende Dauer behandelt und nicht in ein
   * erfundenes Ende übersetzt.
   */
  const zero = desiredManagedEvent(
    source({
      scheduledStartAt: "2032-05-04T08:15:00.000Z",
      scheduledStartTimezone: "Europe/Berlin",
      estimatedDurationMinutes: 0,
    }),
    "work_block",
    "Europe/Berlin",
  );
  assert.equal(zero?.startMarker, true);
  assert.equal(zero?.endsAt, null);

  assert.equal(managedKindLabel("work_block", "timed"), "Geplanter Zeitblock");
  assert.equal(managedKindLabel("work_block", "start_only"), "Startmarkierung");
  assert.equal(managedKindLabel("due", "all_day"), "Frist");
  assert.equal(
    managedEventForm(
      storedEvent({
        isAllDay: false,
        isStartMarker: false,
        endsAt: "2032-05-04T09:00:00.000Z",
      }),
    ),
    "timed",
  );
  assert.equal(
    managedEventForm(
      storedEvent({ isAllDay: false, isStartMarker: true, endsAt: null }),
    ),
    "start_only",
  );
  assert.equal(
    managedEventForm(storedEvent({ isAllDay: true, isStartMarker: false })),
    "all_day",
  );
});

test("übernimmt die geplante Zeitzone und fällt sonst auf die Profilzeitzone zurück", () => {
  const withTaskTimezone = desiredManagedEvent(
    source({
      scheduledStartAt: "2032-05-04T22:00:00.000Z",
      scheduledStartTimezone: "Pacific/Auckland",
      estimatedDurationMinutes: 30,
    }),
    "work_block",
    "Europe/Berlin",
  );
  assert.equal(withTaskTimezone?.timezone, "Pacific/Auckland");

  const withProfileTimezone = desiredManagedEvent(
    source({
      scheduledStartAt: "2032-05-04T22:00:00.000Z",
      estimatedDurationMinutes: 30,
    }),
    "work_block",
    "America/New_York",
  );
  assert.equal(withProfileTimezone?.timezone, "America/New_York");
});

test("berechnet die Dauer über den Sommerzeitwechsel als echte Zeitdauer", () => {
  // Europe/Berlin: 28.03.2032, 02:00 Ortszeit springt auf 03:00 Ortszeit.
  const desired = desiredManagedEvent(
    source({
      scheduledStartAt: "2032-03-28T00:30:00.000Z",
      scheduledStartTimezone: "Europe/Berlin",
      estimatedDurationMinutes: 120,
    }),
    "work_block",
    "Europe/Berlin",
  );
  assert.ok(desired);
  assert.equal(
    new Date(desired.endsAt as string).getTime() -
      new Date(desired.startsAt as string).getTime(),
    120 * 60_000,
  );
  assert.equal(desired.startsAt, "2032-03-28T00:30:00.000Z");
  assert.equal(desired.endsAt, "2032-03-28T02:30:00.000Z");
});

test("führt die Rückstellung der Sommerzeit korrekt fort", () => {
  // Europe/Berlin: 25.10.2032, 03:00 Ortszeit fällt auf 02:00 Ortszeit.
  const desired = desiredManagedEvent(
    source({
      scheduledStartAt: "2032-10-25T00:30:00.000Z",
      scheduledStartTimezone: "Europe/Berlin",
      estimatedDurationMinutes: 60,
    }),
    "work_block",
    "Europe/Berlin",
  );
  assert.equal(desired?.endsAt, "2032-10-25T01:30:00.000Z");
});

test("hält die UID stabil, eindeutig je Art und in beide Richtungen lesbar", () => {
  const due = managedEventUid(taskId, "due");
  const block = managedEventUid(taskId, "work_block");
  assert.notEqual(due, block);
  assert.equal(managedEventUid(taskId, "due"), due);
  assert.deepEqual(parseManagedEventUid(due), { taskId, kind: "due" });
  assert.deepEqual(parseManagedEventUid(block), {
    taskId,
    kind: "work_block",
  });
  assert.equal(parseManagedEventUid("fremd@example.org"), null);
  assert.equal(parseManagedEventUid(`${taskId}.frist@example.org`), null);
  // Anderer Besitzer erzeugt eine andere UID; es entsteht kein gemeinsamer Wert.
  assert.notEqual(
    managedEventUid("11111111-2222-4333-8444-555555555555", "due"),
    due,
  );
});

test("kennzeichnet den Status im Titel und ist in beide Richtungen umkehrbar", () => {
  const done = composeManagedEventTitle({
    kind: "due",
    form: "all_day",
    status: "done",
    taskTitle: "Synthetische Aufgabe",
  });
  assert.equal(done, "Frist: Synthetische Aufgabe (erledigt)");
  assert.deepEqual(
    parseManagedEventTitle({
      kind: "due",
      title: done,
    }),
    { title: "Synthetische Aufgabe", status: "done" },
  );
  assert.equal(statusMarker("cancelled"), " (abgebrochen)");
  assert.equal(statusMarker("in_progress"), "");
  assert.deepEqual(
    parseManagedEventTitle({
      kind: "due",
      title: "Frist: Anderer Titel",
    }),
    { title: "Anderer Titel", status: null },
  );
});

test("erkennt einen veränderten Artpräfix und einen leeren Aufgabentitel nicht als gültig", () => {
  assert.equal(
    parseManagedEventTitle({
      kind: "due",
      title: "Zeitblock: Synthetische Aufgabe",
    }),
    null,
  );
  assert.equal(
    parseManagedEventTitle({
      kind: "due",
      title: "Frist: ",
    }),
    null,
  );
  /**
   * Für einen Arbeitsblock sind beide Kennzeichnungen gültig: „Zeitblock:“ für
   * die zeitgebundene Form und „Start:“ für die Startmarkierung ohne Ende. Eine
   * Kennzeichnung der anderen Abbildungsart bleibt ungültig.
   */
  assert.deepEqual(
    parseManagedEventTitle({
      kind: "work_block",
      title: "Start: Synthetische Aufgabe",
    }),
    { title: "Synthetische Aufgabe", status: null },
  );
  assert.equal(
    parseManagedEventTitle({
      kind: "work_block",
      title: "Frist: Synthetische Aufgabe",
    }),
    null,
  );
});

test("hängt einen maschinenlesbaren Markierungsblock an die Aufgabenbeschreibung", () => {
  const description = composeManagedEventDescription({
    taskDescription: "Aus der Aufgabe.",
    taskId,
    kind: "work_block",
  });
  assert.match(description, /^Aus der Aufgabe\./);
  assert.deepEqual(parseManagedEventDescription(description), {
    taskId,
    kind: "work_block",
  });
  const withoutTaskText = composeManagedEventDescription({
    taskDescription: null,
    taskId,
    kind: "due",
  });
  assert.deepEqual(parseManagedEventDescription(withoutTaskText), {
    taskId,
    kind: "due",
  });
  assert.equal(parseManagedEventDescription(null), null);
  assert.equal(parseManagedEventDescription("Nur ein freier Text."), null);
  assert.equal(
    parseManagedEventDescription(
      "Text\n\n---\nLifeOS verwaltete Aufgabenabbildung\nAufgabe: nicht-uuid\nArt: Frist",
    ),
    null,
  );
});

test("meldet fehlende Fachangaben als „keine Abbildung“ und erfindet nichts", () => {
  assert.equal(desiredManagedEvent(source(), "due", "Europe/Berlin"), null);
  assert.equal(
    desiredManagedEvent(source(), "work_block", "Europe/Berlin"),
    null,
  );
  assert.equal(
    desiredManagedEvent(
      source({ dueDate: "2032-03-15", archivedAt: "2032-03-01T00:00:00.000Z" }),
      "due",
      "Europe/Berlin",
    ),
    null,
  );
  assert.equal(
    desiredManagedEvent(
      source({ dueDate: "2032-03-15", deletedAt: "2032-03-01T00:00:00.000Z" }),
      "due",
      "Europe/Berlin",
    ),
    null,
  );
});

test("lässt Erinnerungen bei einer Aufgabenänderung unangetastet", () => {
  const desired = desiredManagedEvent(
    source({ dueDate: "2032-03-15" }),
    "due",
    "Europe/Berlin",
  );
  assert.ok(desired);
  const current: StoredManagedEvent = {
    uid: desired.uid,
    title: desired.title,
    description: desired.description,
    timezone: desired.timezone,
    isAllDay: true,
    isStartMarker: false,
    startsAt: null,
    endsAt: null,
    startDate: "2032-03-15",
    endDate: "2032-03-16",
    recurrenceRule: null,
  };
  assert.equal(managedEventDiffers(desired, current), false);
  // Geänderter Aufgabentitel erzeugt genau eine Abweichung.
  const renamed = desiredManagedEvent(
    source({ dueDate: "2032-03-15", title: "Neuer Titel" }),
    "due",
    "Europe/Berlin",
  );
  assert.ok(renamed);
  assert.equal(managedEventDiffers(renamed, current), true);
  // Das Ergebnis der Prüfung führt Erinnerungen unverändert weiter.
  const review = reviewManagedEventChange({
    kind: "due",
    current,
    currentStatus: "open",
    incoming: {
      uid: current.uid,
      title: "Frist: Aus Apple geändert",
      isAllDay: true,
      timezone: current.timezone,
      startsAt: null,
      endsAt: null,
      startDate: current.startDate,
      endDate: current.endDate,
      description: current.description,
      location: null,
      recurrenceRule: null,
      reminderMinutes: [5, 30, 5],
    },
  });
  assert.equal(review.accepted, true);
  assert.deepEqual(review.accepted ? review.reminderMinutes : null, [5, 30, 5]);
});

test("nimmt Verschiebung und Verlängerung aus dem Kalender an und lehnt nur nicht unterstützte Felder ab", () => {
  const current: StoredManagedEvent = {
    uid: managedEventUid(taskId, "work_block"),
    title: "Zeitblock: Synthetische Aufgabe",
    description: composeManagedEventDescription({
      taskDescription: null,
      taskId,
      kind: "work_block",
    }),
    timezone: "Europe/Berlin",
    isAllDay: false,
    isStartMarker: false,
    startsAt: "2032-05-04T06:00:00.000Z",
    endsAt: "2032-05-04T07:30:00.000Z",
    startDate: null,
    endDate: null,
    recurrenceRule: null,
  };
  const incoming: {
    uid: string;
    title: string;
    isAllDay: boolean;
    timezone: string;
    startsAt: string | null;
    endsAt: string | null;
    startDate: string | null;
    endDate: string | null;
    description: string | null;
    location: string | null;
    recurrenceRule: string | null;
    reminderMinutes: number[];
  } = {
    uid: current.uid,
    title: current.title,
    isAllDay: false,
    timezone: current.timezone,
    startsAt: current.startsAt,
    endsAt: current.endsAt,
    startDate: null,
    endDate: null,
    description: current.description,
    location: null,
    recurrenceRule: null,
    reminderMinutes: [],
  };
  const review = (changes: Partial<typeof incoming>) =>
    reviewManagedEventChange({
      kind: "work_block",
      current,
      currentStatus: "open",
      incoming: { ...incoming, ...changes },
    });

  assert.equal(review({}).accepted, true);

  /**
   * Verschiebung: Apple verschiebt Start und Ende gemeinsam. Die Dauer bleibt
   * erhalten und wandert mit dem Start in die Aufgabe.
   */
  const moved = review({
    startsAt: "2032-05-04T08:00:00.000Z",
    endsAt: "2032-05-04T09:30:00.000Z",
  });
  assert.equal(moved.accepted, true);
  assert.deepEqual(moved.accepted ? moved.taskChanges : null, {
    scheduledStartAt: "2032-05-04T08:00:00.000Z",
    scheduledStartTimezone: "Europe/Berlin",
    estimatedDurationMinutes: 90,
  });

  /** Verlängerung: nur der Endzeitpunkt ändert sich. */
  const extended = review({ endsAt: "2032-05-04T08:30:00.000Z" });
  assert.equal(extended.accepted, true);
  assert.deepEqual(extended.accepted ? extended.taskChanges : null, {
    scheduledStartAt: "2032-05-04T06:00:00.000Z",
    scheduledStartTimezone: "Europe/Berlin",
    estimatedDurationMinutes: 150,
  });

  /** Andere, gültige Zeitzone: sie wird als geplante Zeitzone übernommen. */
  const rezoned = review({ timezone: "Pacific/Auckland" });
  assert.equal(rezoned.accepted, true);
  assert.equal(
    rezoned.accepted ? rezoned.taskChanges.scheduledStartTimezone : null,
    "Pacific/Auckland",
  );

  /** Ohne DTEND wird nur der Start geführt – ohne erfundenes Ende. */
  const startOnly = review({ endsAt: null });
  assert.equal(startOnly.accepted, true);
  assert.deepEqual(startOnly.accepted ? startOnly.taskChanges : null, {
    scheduledStartAt: "2032-05-04T06:00:00.000Z",
    scheduledStartTimezone: "Europe/Berlin",
    estimatedDurationMinutes: null,
  });
  assert.equal(startOnly.accepted ? startOnly.form : null, "start_only");

  /** Nicht unterstützte Felder bleiben abgelehnt. */
  assert.equal(review({ recurrenceRule: "FREQ=DAILY" }).accepted, false);
  assert.equal(review({ description: "Anderer Text" }).accepted, false);
  assert.equal(review({ location: "Berlin" }).accepted, false);
  assert.equal(review({ uid: `${current.uid}.x` }).accepted, false);
  assert.equal(review({ title: "Ohne Präfix" }).accepted, false);
  assert.equal(
    review({
      isAllDay: true,
      startsAt: null,
      endsAt: null,
      startDate: "2032-05-04",
      endDate: "2032-05-05",
    }).accepted,
    false,
    "Ein Arbeitsblock bleibt zeitgebunden",
  );
  /** Rückwärts laufende Zeitangaben und Dauer null sind keine Dauer. */
  assert.equal(
    review({
      startsAt: "2032-05-04T08:00:00.000Z",
      endsAt: "2032-05-04T08:00:00.000Z",
    }).accepted,
    false,
  );
  assert.equal(
    review({
      startsAt: "2032-05-02T06:00:00.000Z",
      endsAt: "2032-05-01T06:00:00.000Z",
    }).accepted,
    false,
  );
  assert.equal(
    review({ startsAt: "2032-05-01T22:00:00.000Z", endsAt: null }).accepted,
    true,
  );
  assert.equal(
    review({ startsAt: null, endsAt: null }).accepted,
    false,
    "Ohne Start entsteht keine Abbildung",
  );

  const missingStart = review({ startsAt: null });
  assert.equal(missingStart.accepted, false);
  assert.equal(missingStart.accepted ? null : missingStart.field, "DTSTART");
  const reversed = review({
    startsAt: "2032-05-02T06:00:00.000Z",
    endsAt: "2032-05-01T06:00:00.000Z",
  });
  assert.equal(reversed.accepted ? null : reversed.field, "DTEND");
});

test("übernimmt eine verschobene ganztägige Frist als neuen Fälligkeitstag", () => {
  const current: StoredManagedEvent = {
    uid: managedEventUid(taskId, "due"),
    title: "Frist: Synthetische Aufgabe",
    description: composeManagedEventDescription({
      taskDescription: null,
      taskId,
      kind: "due",
    }),
    timezone: "Europe/Berlin",
    isAllDay: true,
    isStartMarker: false,
    startsAt: null,
    endsAt: null,
    startDate: "2032-03-15",
    endDate: "2032-03-16",
    recurrenceRule: null,
  };
  const base: {
    uid: string;
    title: string;
    isAllDay: boolean;
    timezone: string;
    startsAt: string | null;
    endsAt: string | null;
    startDate: string | null;
    endDate: string | null;
    description: string | null;
    location: string | null;
    recurrenceRule: string | null;
    reminderMinutes: number[];
  } = {
    uid: current.uid,
    title: current.title,
    isAllDay: true,
    timezone: current.timezone,
    startsAt: null,
    endsAt: null,
    startDate: current.startDate,
    endDate: current.endDate,
    description: current.description,
    location: null,
    recurrenceRule: null,
    reminderMinutes: [],
  };
  const review = (changes: Partial<typeof base>) =>
    reviewManagedEventChange({
      kind: "due",
      current,
      currentStatus: "open",
      incoming: { ...base, ...changes },
    });

  const moved = review({
    startDate: "2032-03-22",
    endDate: "2032-03-23",
  });
  assert.equal(moved.accepted, true);
  assert.deepEqual(moved.accepted ? moved.taskChanges : null, {
    dueDate: "2032-03-22",
  });
  assert.equal(moved.accepted ? moved.form : null, "all_day");

  /** Eine Frist umfasst genau einen Tag; ein anderes Ende bleibt abgelehnt. */
  assert.equal(
    review({ startDate: "2032-03-22", endDate: "2032-03-24" }).accepted,
    false,
  );
  assert.equal(
    review({ startDate: "2032-03-22", endDate: "2032-03-22" }).accepted,
    false,
  );
  assert.equal(review({ endDate: null }).accepted, false);
  assert.equal(review({ startDate: null }).accepted, false);
  assert.equal(
    review({
      isAllDay: false,
      startsAt: "2032-03-22T08:00:00.000Z",
      endsAt: "2032-03-22T09:00:00.000Z",
    }).accepted,
    false,
    "Eine verwaltete Frist bleibt ganztägig",
  );
  /** Ein gültiges Datumsformat ist Voraussetzung. */
  assert.equal(
    review({ startDate: "2032-3-22", endDate: "2032-3-23" }).accepted,
    false,
  );

  const invalidEnd = review({ endDate: "2032-03-24" });
  assert.equal(invalidEnd.accepted ? null : invalidEnd.field, "DTEND");
});

test("nimmt Statusänderungen aus dem Kalender nur im erlaubten Übergang an", () => {
  const current: StoredManagedEvent = {
    uid: managedEventUid(taskId, "due"),
    title: "Frist: Synthetische Aufgabe",
    description: composeManagedEventDescription({
      taskDescription: null,
      taskId,
      kind: "due",
    }),
    timezone: "Europe/Berlin",
    isAllDay: true,
    isStartMarker: false,
    startsAt: null,
    endsAt: null,
    startDate: "2032-03-15",
    endDate: "2032-03-16",
    recurrenceRule: null,
  };
  const base = {
    uid: current.uid,
    isAllDay: true,
    timezone: current.timezone,
    startsAt: null,
    endsAt: null,
    startDate: current.startDate,
    endDate: current.endDate,
    description: current.description,
    location: null,
    recurrenceRule: null,
    reminderMinutes: [],
  };
  const review = (
    title: string,
    currentStatus: "open" | "done" | "cancelled",
  ) =>
    reviewManagedEventChange({
      kind: "due",
      current,
      currentStatus,
      incoming: { ...base, title },
    });

  const done = review("Frist: Synthetische Aufgabe (erledigt)", "open");
  assert.deepEqual(done, {
    accepted: true,
    taskTitle: "Synthetische Aufgabe",
    status: "done",
    reminderMinutes: [],
    form: "all_day",
    taskChanges: { dueDate: "2032-03-15" },
  });
  const reopened = review("Frist: Synthetische Aufgabe", "done");
  assert.deepEqual(reopened, {
    accepted: true,
    taskTitle: "Synthetische Aufgabe",
    status: "open",
    reminderMinutes: [],
    form: "all_day",
    taskChanges: { dueDate: "2032-03-15" },
  });
  const cancelled = review("Frist: Synthetische Aufgabe (abgebrochen)", "open");
  assert.equal(cancelled.accepted ? cancelled.status : null, "cancelled");
  // Aus „abgebrochen“ ist „erledigt“ kein erlaubter Übergang.
  const invalid = review("Frist: Synthetische Aufgabe (erledigt)", "cancelled");
  assert.equal(invalid.accepted, false);
});
