/**
 * Paket 9: verbindliche Abbildungsregeln der **verwalteten** Aufgaben-Kalender-
 * Beziehung.
 *
 * Diese Datei ist bewusst reine Logik ohne Datenbankzugriff. Sie legt genau
 * fest, wie eine Aufgabe auf ein Kalenderereignis abgebildet wird:
 *
 * | Aufgabe                              | Verwaltetes Ereignis                        |
 * | ------------------------------------ | ------------------------------------------- |
 * | nur Fälligkeit                       | ganztägige Frist an der Fälligkeit          |
 * | geplanter Start mit Aufwandsschätzung | zeitgebundener Arbeitsblock mit Dauer       |
 * | geplanter Start ohne Aufwandsschätzung | Startmarkierung ohne erfundenes Ende       |
 * | Fälligkeit und Start                 | zwei getrennt beschriftete Ereignisse        |
 *
 * Regeln, die hier verbindlich festgehalten sind:
 *
 * - Stabile UID: die UID ergibt sich deterministisch aus Aufgabenkennung und
 *   Abbildungsart. Sie bleibt über Titel-, Zeit-, Status- und Wiederöffnungs-
 *   änderungen hinweg erhalten, damit Apple dieselbe Ressource aktualisiert und
 *   keine zweite anlegt. Es entsteht höchstens eine UID je Art und Aufgabe.
 * - Titelkennzeichnung: `Frist: …`, `Zeitblock: …` beziehungsweise `Start: …`
 *   benennt die Art; `(erledigt)` und `(abgebrochen)` kennzeichnen den
 *   Aufgabenstatus. Beide Markierungen sind umkehrbar: aus einem von Apple
 *   geänderten Titel lässt sich der Aufgabenstatus und der Aufgabentitel
 *   zurückgewinnen.
 * - Beschreibung: der Aufgabentext bleibt führend; ihm wird ein maschinenlesbarer
 *   Markierungsblock angehängt, der Aufgabe und Art benennt. Nur darüber erkennt
 *   die Bestandsprüfung ein eindeutig verwaltetes Ereignis wieder.
 * - Erinnerungen gehören allein zum Ereignis. Sie werden bei einer
 *   Aufgabenänderung unverändert übernommen und nie aus Aufgabenfeldern
 *   abgeleitet oder verworfen.
 * - „Start ohne Dauer“ erhält **kein erfundenes Ende**: das Ereignis hat
 *   DTSTART und kein DTEND (`isStartMarker`). Das ist die gezielte, für Apple
 *   interoperable Darstellung einer sichtbaren Startmarkierung; die allgemeine
 *   Kalenderinvariante `endsAt > startsAt` bleibt für alle übrigen Ereignisse
 *   unverändert.
 * - Apple darf eine verwaltete Frist und einen verwalteten Arbeitsblock
 *   verschieben und verlängern. Eine verschobene Frist ändert genau
 *   `Task.dueDate`; ein verschobener oder verlängerter Arbeitsblock ändert
 *   genau `scheduledStartAt`, `scheduledStartTimezone` und
 *   `estimatedDurationMinutes`. Die jeweils andere Fachangabe bleibt unberührt,
 *   und die Änderung wird nur als Ganzes übernommen.
 * - Nicht unterstützt und deshalb vollständig abgelehnt bleiben Ort, freie
 *   Beschreibung, eine nicht unterstützte Zeitzone, eine ungültige UID, eine
 *   Wiederholungsregel sowie unzulässige Statuswechsel.
 * - Wiederkehrende verwaltete Ereignisse gibt es nicht. Eine Wiederholungsregel
 *   an einem verwalteten Ereignis wird ausdrücklich abgelehnt.
 */

import type { TaskCalendarBindingKind, TaskStatus } from "@lifeos/contracts";

export const MANAGED_UID_DOMAIN = "tasks.lifeos.local";

const UID_SUFFIX: Record<TaskCalendarBindingKind, string> = {
  due: "frist",
  work_block: "zeitblock",
};

const UID_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(frist|zeitblock)@tasks\.lifeos\.local$/;

const SUFFIX_KIND: Record<string, TaskCalendarBindingKind> = {
  frist: "due",
  zeitblock: "work_block",
};

/**
 * Anzeigebeschriftungen der verwalteten Abbildungsarten. Ein Arbeitsblock ohne
 * Aufwandsschätzung ist die Startmarkierung derselben Abbildung: sichtbarer
 * geplanter Start ohne erfundenes Ende.
 */
export const managedKindLabels = {
  due: "Frist",
  work_block: "Geplanter Zeitblock",
  start_marker: "Startmarkierung",
} as const;

/**
 * Zeitform eines verwalteten Ereignisses. `start_only` ist die gezielte
 * Startmarkierung: zeitgebunden ohne Ende (`isStartMarker`).
 */
export type ManagedEventForm = "all_day" | "timed" | "start_only";

const TITLE_PREFIX: Record<ManagedEventForm, string> = {
  all_day: "Frist: ",
  timed: "Zeitblock: ",
  start_only: "Start: ",
};

/** Alle zulässigen Titelkennzeichnungen je Abbildungsart. */
const KIND_TITLE_PREFIXES: Record<TaskCalendarBindingKind, readonly string[]> =
  {
    due: [TITLE_PREFIX.all_day],
    work_block: [TITLE_PREFIX.timed, TITLE_PREFIX.start_only],
  };

/** Statustexte im Ereignistitel. */
export const managedStatusMarkers = {
  done: " (erledigt)",
  cancelled: " (abgebrochen)",
} as const;

const STATUS_BY_MARKER: ReadonlyArray<readonly [string, TaskStatus]> = [
  [managedStatusMarkers.done, "done"],
  [managedStatusMarkers.cancelled, "cancelled"],
];

/** Markierungsblock in der Ereignisbeschreibung. */
export const managedDescriptionMarker = {
  separator: "\n\n---\nLifeOS verwaltete Aufgabenabbildung\n",
  taskPrefix: "Aufgabe: ",
  kindPrefix: "Art: ",
  kindText: {
    due: "Frist",
    work_block: "Zeitblock",
  } as const,
} as const;

const KIND_BY_MARKER_TEXT: Record<string, TaskCalendarBindingKind> = {
  Frist: "due",
  Zeitblock: "work_block",
};

export const taskStatusTransitions: Record<TaskStatus, readonly TaskStatus[]> =
  {
    open: ["in_progress", "blocked", "done", "cancelled"],
    in_progress: ["open", "blocked", "done", "cancelled"],
    blocked: ["open", "in_progress", "done", "cancelled"],
    done: ["open"],
    cancelled: ["open"],
  };

/**
 * Stabile, deterministische UID eines verwalteten Ereignisses. Sie enthält
 * weder Titel noch Zeiten und ändert sich deshalb nie während der Lebensdauer
 * einer Abbildung.
 */
export const managedEventUid = (
  taskId: string,
  kind: TaskCalendarBindingKind,
): string => `${taskId}.${UID_SUFFIX[kind]}@${MANAGED_UID_DOMAIN}`;

export const parseManagedEventUid = (
  uid: string,
): { taskId: string; kind: TaskCalendarBindingKind } | null => {
  const match = UID_PATTERN.exec(uid);
  if (!match) return null;
  const kind = SUFFIX_KIND[match[2] ?? ""];
  if (!kind) return null;
  return { taskId: match[1] as string, kind };
};

export const managedKindLabel = (
  kind: TaskCalendarBindingKind,
  form: ManagedEventForm,
): string =>
  kind === "due"
    ? managedKindLabels.due
    : form === "start_only"
      ? managedKindLabels.start_marker
      : managedKindLabels.work_block;

export const managedTitlePrefix = (
  kind: TaskCalendarBindingKind,
  form: ManagedEventForm,
): string =>
  kind === "due"
    ? TITLE_PREFIX.all_day
    : form === "start_only"
      ? TITLE_PREFIX.start_only
      : TITLE_PREFIX.timed;

export const statusMarker = (status: TaskStatus): string =>
  status === "done"
    ? managedStatusMarkers.done
    : status === "cancelled"
      ? managedStatusMarkers.cancelled
      : "";

export const composeManagedEventTitle = (input: {
  kind: TaskCalendarBindingKind;
  form: ManagedEventForm;
  status: TaskStatus;
  taskTitle: string;
}): string =>
  `${managedTitlePrefix(input.kind, input.form)}${input.taskTitle}${statusMarker(input.status)}`;

export interface ParsedManagedEventTitle {
  title: string;
  status: TaskStatus | null;
}

/**
 * Kehrfunktion der Titelabbildung. Eine der artzugehörigen Kennzeichnungen muss
 * unverändert vorangehen – bei einem Arbeitsblock also `Zeitblock: ` oder
 * `Start: `, damit ein Wechsel zwischen Dauer und Startmarkierung den Bezug
 * nicht verliert. Alles Übrige ist der Aufgabentitel. Eine
 * Statussuffixkennzeichnung wird als Aufgabenstatus gelesen.
 */
export const parseManagedEventTitle = (input: {
  kind: TaskCalendarBindingKind;
  title: string;
}): ParsedManagedEventTitle | null => {
  const prefix = KIND_TITLE_PREFIXES[input.kind].find((value) =>
    input.title.startsWith(value),
  );
  if (!prefix) return null;
  let remainder = input.title.slice(prefix.length);
  let status: TaskStatus | null = null;
  for (const [marker, markerStatus] of STATUS_BY_MARKER) {
    if (remainder.endsWith(marker)) {
      remainder = remainder.slice(0, -marker.length);
      status = markerStatus;
      break;
    }
  }
  if (!remainder.trim()) return null;
  return { title: remainder, status };
};

export const composeManagedEventDescription = (input: {
  taskDescription: string | null;
  taskId: string;
  kind: TaskCalendarBindingKind;
}): string =>
  `${input.taskDescription ?? ""}${managedDescriptionMarker.separator}${
    managedDescriptionMarker.taskPrefix
  }${input.taskId}\n${managedDescriptionMarker.kindPrefix}${
    managedDescriptionMarker.kindText[input.kind]
  }`;

export const parseManagedEventDescription = (
  description: string | null,
): { taskId: string; kind: TaskCalendarBindingKind } | null => {
  if (!description) return null;
  const index = description.lastIndexOf(managedDescriptionMarker.separator);
  if (index < 0) return null;
  const marker = description.slice(
    index + managedDescriptionMarker.separator.length,
  );
  const lines = marker.split("\n");
  const taskLine = lines.find((line) =>
    line.startsWith(managedDescriptionMarker.taskPrefix),
  );
  const kindLine = lines.find((line) =>
    line.startsWith(managedDescriptionMarker.kindPrefix),
  );
  if (!taskLine || !kindLine) return null;
  const taskId = taskLine
    .slice(managedDescriptionMarker.taskPrefix.length)
    .trim();
  const kind =
    KIND_BY_MARKER_TEXT[
      kindLine.slice(managedDescriptionMarker.kindPrefix.length).trim()
    ];
  if (!/^[0-9a-f-]{36}$/.test(taskId) || !kind) return null;
  return { taskId, kind };
};

export interface ManagedEventSource {
  id: string;
  title: string;
  status: TaskStatus;
  description: string | null;
  /** Reine Tagesangabe `YYYY-MM-DD` oder `null`. */
  dueDate: string | null;
  /** Zeitpunkt als ISO-Zeichenkette oder `null`. */
  scheduledStartAt: string | null;
  scheduledStartTimezone: string | null;
  estimatedDurationMinutes: number | null;
  archivedAt: string | null;
  deletedAt: string | null;
}

export interface DesiredManagedEvent {
  uid: string;
  title: string;
  description: string;
  timezone: string;
  isAllDay: boolean;
  /** Gezielte Startmarkierung: zeitgebundenes Ereignis ohne Ende. */
  startMarker: boolean;
  startsAt: string | null;
  endsAt: string | null;
  startDate: string | null;
  endDate: string | null;
  recurrenceRule: null;
}

const dayAfter = (date: string): string => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
};

/**
 * Sollzustand eines verwalteten Ereignisses. `null` bedeutet: für diese
 * Abbildungsart ist derzeit kein Ereignis vorgesehen (fehlende Fachangabe,
 * archivierte oder gelöschte Aufgabe). Es wird nie ein Ersatzwert erfunden.
 */
export const desiredManagedEvent = (
  task: ManagedEventSource,
  kind: TaskCalendarBindingKind,
  profileTimezone: string,
): DesiredManagedEvent | null => {
  if (task.deletedAt !== null || task.archivedAt !== null) return null;
  const base = {
    uid: managedEventUid(taskIdentifier(task), kind),
    recurrenceRule: null as null,
  };
  if (kind === "due") {
    if (!task.dueDate) return null;
    return {
      ...base,
      title: composeManagedEventTitle({
        kind,
        form: "all_day",
        status: task.status,
        taskTitle: task.title,
      }),
      description: composeManagedEventDescription({
        taskDescription: task.description,
        taskId: taskIdentifier(task),
        kind,
      }),
      timezone: profileTimezone,
      isAllDay: true,
      startMarker: false,
      startDate: task.dueDate,
      endDate: dayAfter(task.dueDate),
      startsAt: null,
      endsAt: null,
    };
  }
  if (!task.scheduledStartAt) return null;
  const startsAt = new Date(task.scheduledStartAt);
  const timezone = task.scheduledStartTimezone ?? profileTimezone;
  /**
   * „Start ohne Dauer“ erhält eine sichtbare Startmarkierung ohne erfundenes
   * Ende: DTSTART ohne DTEND (`startMarker`). Es wird weder eine Endzeit noch
   * eine Dauer hinzugefügt; die Aufgabe bleibt führend, und mit einer
   * Aufwandsschätzung entsteht daraus derselbe Arbeitsblock mit derselben UID.
   */
  const baseWorkBlock = {
    ...base,
    description: composeManagedEventDescription({
      taskDescription: task.description,
      taskId: taskIdentifier(task),
      kind,
    }),
    timezone,
    isAllDay: false,
    startDate: null,
    endDate: null,
  };
  if (!task.estimatedDurationMinutes) {
    return {
      ...baseWorkBlock,
      title: composeManagedEventTitle({
        kind,
        form: "start_only",
        status: task.status,
        taskTitle: task.title,
      }),
      startMarker: true,
      startsAt: startsAt.toISOString(),
      endsAt: null,
    };
  }
  return {
    ...baseWorkBlock,
    title: composeManagedEventTitle({
      kind,
      form: "timed",
      status: task.status,
      taskTitle: task.title,
    }),
    startMarker: false,
    startsAt: startsAt.toISOString(),
    endsAt: new Date(
      startsAt.getTime() + task.estimatedDurationMinutes * 60_000,
    ).toISOString(),
  };
};

/**
 * Die Aufgabenkennung wird aus der geladenen Aufgabe gelesen. Sie ist Teil jeder
 * UID und jedes Markierungsblocks und wird nie erfunden.
 */
const taskIdentifier = (task: ManagedEventSource): string => task.id;

export interface StoredManagedEvent {
  uid: string;
  title: string;
  description: string | null;
  timezone: string;
  isAllDay: boolean;
  /** Gezielte Startmarkierung: zeitgebundenes Ereignis ohne Ende. */
  isStartMarker: boolean;
  startsAt: string | null;
  endsAt: string | null;
  startDate: string | null;
  endDate: string | null;
  recurrenceRule: string | null;
}

export const managedEventForm = (
  event: StoredManagedEvent,
): ManagedEventForm =>
  event.isAllDay ? "all_day" : event.isStartMarker ? "start_only" : "timed";

/**
 * Vergleicht Soll- und Istzustand ausschließlich über die **verwalteten**
 * Felder. Erinnerungen und der Kalenderbezug gehören nicht dazu: sie bleiben
 * bei einer Aufgabenänderung erhalten.
 */
export const managedEventDiffers = (
  desired: DesiredManagedEvent,
  current: StoredManagedEvent,
): boolean =>
  desired.title !== current.title ||
  desired.description !== (current.description ?? "") ||
  desired.timezone !== current.timezone ||
  desired.isAllDay !== current.isAllDay ||
  desired.startMarker !== current.isStartMarker ||
  desired.startsAt !== current.startsAt ||
  desired.endsAt !== current.endsAt ||
  desired.startDate !== current.startDate ||
  desired.endDate !== current.endDate ||
  current.recurrenceRule !== null;

export interface ManagedEventChangeInput {
  kind: TaskCalendarBindingKind;
  current: StoredManagedEvent;
  currentStatus: TaskStatus;
  /** Einzeln bereits akzeptierte Erinnerungen und Titelgrenzen des Aufrufers. */
  incoming: {
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
  };
}

/**
 * Führende Aufgabenfelder, die eine akzeptierte Apple-Änderung ändert. Es wird
 * immer nur die Abbildungsart berührt, zu der das Ereignis gehört; die jeweils
 * andere Fachangabe bleibt unverändert.
 */
export interface ManagedTaskTimeChanges {
  dueDate?: string | null;
  scheduledStartAt?: string | null;
  scheduledStartTimezone?: string | null;
  estimatedDurationMinutes?: number | null;
}

export type ManagedEventChangeReview =
  | {
      accepted: true;
      taskTitle: string;
      status: TaskStatus | null;
      reminderMinutes: number[];
      /** Zeitform des Ereignisses nach der Änderung. */
      form: ManagedEventForm;
      /** Zu übernehmende führende Aufgabenfelder. */
      taskChanges: ManagedTaskTimeChanges;
    }
  | { accepted: false; field: string; message: string };

const unchanged = (incoming: string | null, current: string | null): boolean =>
  incoming === current;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Obergrenze der Aufwandsschätzung, identisch zur Aufgabeninvariante. */
export const MAX_MANAGED_DURATION_MINUTES = 525_600;

const MINUTE_MS = 60_000;

type TimeShapeReview =
  | { ok: true; form: ManagedEventForm; changes: ManagedTaskTimeChanges }
  | { ok: false; field: string; message: string };

/**
 * Prüft und übernimmt die Zeitangaben einer eingehenden Apple-Änderung
 * ausschließlich innerhalb der eigenen Abbildungsart:
 *
 * - `due` bleibt ganztägig. Zulässig ist genau ein Tag Abstand zwischen
 *   DTSTART und DTEND (das exklusive iCalendar-Ende); daraus wird `dueDate`.
 * - `work_block` bleibt zeitgebunden. DTSTART/DTEND bestimmen Start,
 *   Zeitzone und Dauer in ganzen Minuten; DTSTART ohne DTEND ist die
 *   Startmarkierung ohne erfundenes Ende.
 *
 * Ungültige Werte, eine unmögliche Form oder eine Dauer außerhalb der
 * Aufgabengrenzen werden vollständig abgelehnt; es entsteht nie eine
 * Teiländerung.
 */
export const reviewManagedTimeChange = (input: {
  kind: TaskCalendarBindingKind;
  incoming: ManagedEventChangeInput["incoming"];
}): TimeShapeReview => {
  const { kind, incoming } = input;
  if (kind === "due") {
    if (!incoming.isAllDay) {
      return {
        ok: false,
        field: "DTSTART;VALUE=DATE",
        message:
          "Die Frist eines verwalteten Ereignisses bleibt ganztägig; eine zeitgebundene Darstellung wird nicht unterstützt.",
      };
    }
    if (
      incoming.startsAt !== null ||
      incoming.endsAt !== null ||
      !incoming.startDate ||
      !incoming.endDate ||
      !DATE_ONLY.test(incoming.startDate) ||
      !DATE_ONLY.test(incoming.endDate)
    ) {
      return {
        ok: false,
        field: "DTSTART;VALUE=DATE",
        message:
          "Eine verwaltete Frist braucht gültige Datumsgrenzen für DTSTART und DTEND.",
      };
    }
    if (incoming.endDate !== dayAfter(incoming.startDate)) {
      return {
        ok: false,
        field: "DTEND",
        message: "Eine verwaltete Frist umfasst genau einen Tag.",
      };
    }
    return {
      ok: true,
      form: "all_day",
      changes: { dueDate: incoming.startDate },
    };
  }

  if (incoming.isAllDay) {
    return {
      ok: false,
      field: "DTSTART;VALUE=DATE",
      message:
        "Ein verwalteter Arbeitsblock bleibt zeitgebunden; eine ganztägige Darstellung wird nicht unterstützt.",
    };
  }
  if (!incoming.startsAt) {
    return {
      ok: false,
      field: "DTSTART",
      message: "Ein verwalteter Arbeitsblock braucht einen gültigen Start.",
    };
  }
  const startsAt = new Date(incoming.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    return {
      ok: false,
      field: "DTSTART",
      message: "Ein verwalteter Arbeitsblock braucht einen gültigen Start.",
    };
  }
  if (incoming.endsAt === null) {
    /**
     * Startmarkierung: die Aufgabe behält ihren geplanten Start und erhält
     * keine Aufwandsschätzung. Es wird kein Ende erfunden.
     */
    return {
      ok: true,
      form: "start_only",
      changes: {
        scheduledStartAt: startsAt.toISOString(),
        scheduledStartTimezone: incoming.timezone,
        estimatedDurationMinutes: null,
      },
    };
  }
  const endsAt = new Date(incoming.endsAt);
  if (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return {
      ok: false,
      field: "DTEND",
      message: "DTEND muss nach DTSTART liegen.",
    };
  }
  const durationMinutes = Math.round(
    (endsAt.getTime() - startsAt.getTime()) / MINUTE_MS,
  );
  if (
    durationMinutes < 1 ||
    durationMinutes > MAX_MANAGED_DURATION_MINUTES ||
    endsAt.getTime() - startsAt.getTime() !== durationMinutes * MINUTE_MS
  ) {
    return {
      ok: false,
      field: "DTEND",
      message: `Die Dauer eines verwalteten Arbeitsblocks muss zwischen 1 und ${MAX_MANAGED_DURATION_MINUTES} ganzen Minuten liegen.`,
    };
  }
  return {
    ok: true,
    form: "timed",
    changes: {
      scheduledStartAt: startsAt.toISOString(),
      scheduledStartTimezone: incoming.timezone,
      estimatedDurationMinutes: durationMinutes,
    },
  };
};

/**
 * Prüft eine eingehende Änderung an einem verwalteten Ereignis vollständig,
 * bevor irgendetwas geschrieben wird. Erlaubt sind die Zeitangaben der eigenen
 * Abbildungsart (Verschieben, Verlängern, Verkürzen, Startmarkierung), die
 * Titeländerung mit umkehrbarer Statuskennzeichnung, die Erinnerungen und die
 * unveränderte Übernahme. Alles andere wird in Gänze abgelehnt; es gibt keine
 * Teiländerung.
 */
export const reviewManagedEventChange = ({
  kind,
  current,
  currentStatus,
  incoming,
}: ManagedEventChangeInput): ManagedEventChangeReview => {
  if (incoming.uid !== current.uid) {
    return {
      accepted: false,
      field: "UID",
      message:
        "Die stabile UID eines verwalteten Ereignisses ist unveränderlich.",
    };
  }
  if (incoming.recurrenceRule !== null) {
    return {
      accepted: false,
      field: "RRULE",
      message:
        "Wiederkehrende verwaltete Aufgabenereignisse werden nicht unterstützt.",
    };
  }
  if (!unchanged(incoming.description, current.description)) {
    return {
      accepted: false,
      field: "DESCRIPTION",
      message:
        "Die Beschreibung eines verwalteten Ereignisses wird von LifeOS geführt und kann hier nicht geändert werden.",
    };
  }
  if (incoming.location !== null) {
    return {
      accepted: false,
      field: "LOCATION",
      message:
        "Ein Ort wird für verwaltete Aufgabenereignisse nicht unterstützt.",
    };
  }
  if (kind === "due" && incoming.timezone !== current.timezone) {
    return {
      accepted: false,
      field: "TZID",
      message: "Die Zeitzone einer verwalteten Frist wird von LifeOS geführt.",
    };
  }
  const shape = reviewManagedTimeChange({ kind, incoming });
  if (!shape.ok) {
    return { accepted: false, field: shape.field, message: shape.message };
  }
  const parsedTitle = parseManagedEventTitle({
    kind,
    title: incoming.title,
  });
  if (!parsedTitle) {
    return {
      accepted: false,
      field: "SUMMARY",
      message: `Der Titel muss mit einer der Kennzeichnungen „${KIND_TITLE_PREFIXES[
        kind
      ]
        .map((prefix) => prefix.trim())
        .join("“ oder „")}“ beginnen, damit die Abbildung eindeutig bleibt.`,
    };
  }
  const requestedStatus = parsedTitle.status;
  if (requestedStatus !== null && requestedStatus !== currentStatus) {
    if (!taskStatusTransitions[currentStatus].includes(requestedStatus)) {
      return {
        accepted: false,
        field: "SUMMARY",
        message: `Der Aufgabenstatus kann nicht von „${currentStatus}“ zu „${requestedStatus}“ wechseln.`,
      };
    }
  }
  if (
    requestedStatus === null &&
    (currentStatus === "done" || currentStatus === "cancelled")
  ) {
    // Ohne Statussuffix gilt die Aufgabe als wieder geöffnet.
    return {
      accepted: true,
      taskTitle: parsedTitle.title,
      status: "open",
      reminderMinutes: incoming.reminderMinutes,
      form: shape.form,
      taskChanges: shape.changes,
    };
  }
  return {
    accepted: true,
    taskTitle: parsedTitle.title,
    status: requestedStatus,
    reminderMinutes: incoming.reminderMinutes,
    form: shape.form,
    taskChanges: shape.changes,
  };
};
