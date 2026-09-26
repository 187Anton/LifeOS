import { expect, test, type Page } from "@playwright/test";

const profile = {
  id: "nutzer-1",
  displayName: "Anton Beispiel",
  settings: {
    timezone: "Europe/Berlin",
    locale: "de-DE",
    weekStartsOn: 1,
    defaultCalendarView: "week",
    showWeekends: true,
  },
};

const calendar = {
  id: "kalender-1",
  name: "Persönlich",
  timezone: "Europe/Berlin",
  isPrimary: true,
  syncToken: 1,
};

const berlinDate = (value: Date): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const berlinDateTimeInput = (value: Date): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
};
/**
 * Wandelt eine Berliner Wanduhrzeit in den zugehörigen Zeitpunkt um. Beide
 * möglichen Verschiebungen werden geprüft; nur die passende ergibt die gesuchte
 * Ortszeit. Dadurch bleibt der Test unabhängig von der Zeitzone des
 * Testrechners und von Sommer-/Winterzeit.
 */
const berlinInstant = (date: string, time: string): string => {
  for (const offsetHours of [1, 2]) {
    const candidate = new Date(`${date}T${time}:00.000Z`);
    candidate.setUTCHours(candidate.getUTCHours() - offsetHours);
    if (berlinDateTimeInput(candidate) === `${date}T${time}`) {
      return candidate.toISOString();
    }
  }
  throw new Error(`Keine gültige Berliner Ortszeit für ${date} ${time}.`);
};
const today = berlinDate(new Date());
const eventStartsAt = new Date(`${today}T09:00:00.000Z`).toISOString();
const eventEndsAt = new Date(
  new Date(eventStartsAt).valueOf() + 60 * 60 * 1000,
).toISOString();
const tomorrow = berlinDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
const stringValue = (value: unknown): string =>
  typeof value === "string" ? value : "";

const initialEvent = {
  uid: "termin-1",
  title: "Ruhiger Fokusblock",
  description: "Synthetischer Termin",
  location: "Arbeitszimmer",
  isAllDay: false,
  startsAt: eventStartsAt,
  endsAt: eventEndsAt,
  startDate: null,
  endDate: null,
  timezone: "Europe/Berlin",
  recurrenceRule: null,
  reminderMinutes: [10],
  etag: '"etag-1"',
  sequence: 0,
  updatedAt: "2026-07-22T08:00:00.000Z",
};

const initialTask = {
  id: "aufgabe-1",
  ownerId: "nutzer-1",
  title: "Roadmap prüfen",
  description: "Synthetische Aufgabe",
  status: "open",
  priority: "high",
  dueDate: "2030-07-23",
  scheduledStartAt: "2030-07-22T10:00:00.000Z",
  scheduledStartTimezone: "Europe/Berlin",
  estimatedDurationMinutes: 60,
  tags: ["organisation"],
  area: "projects",
  projectId: null,
  studyModuleId: null,
  parentTaskId: null,
  completedAt: null,
  archivedAt: null,
  createdAt: "2026-07-22T08:00:00.000Z",
  updatedAt: "2026-07-22T08:00:00.000Z",
};

const installApi = async (
  page: Page,
  {
    studyPrograms = [],
    studyModules = [],
    additionalTasks = [],
    additionalEvents = [],
    additionalStudyEntries = [],
    knowledgeNotes = [],
    knowledgeDocuments = [],
  }: {
    studyPrograms?: Array<Record<string, unknown>>;
    studyModules?: Array<Record<string, unknown>>;
    additionalTasks?: Array<Record<string, unknown>>;
    additionalEvents?: Array<Record<string, unknown>>;
    additionalStudyEntries?: Array<Record<string, unknown>>;
    /** Notizen der Wissensübersicht mit vorhandenem Modulbezug. */
    knowledgeNotes?: Array<Record<string, unknown>>;
    /** Dokumente der gemeinsamen lokalen Ablage. */
    knowledgeDocuments?: Array<Record<string, unknown>>;
  } = {},
) => {
  const events: Array<Record<string, unknown>> = [
    { ...initialEvent },
    ...additionalEvents.map((entry) => ({ ...entry })),
  ];
  const tasks: Array<Record<string, unknown>> = [
    { ...initialTask },
    ...additionalTasks.map((entry) => ({ ...entry })),
  ];
  const links: Array<Record<string, unknown>> = [];
  const study = {
    programs: studyPrograms.map((entry) => ({ ...entry })),
    modules: studyModules.map((entry) => ({ ...entry })),
    entries: [
      ...additionalStudyEntries.map((entry) => ({ ...entry })),
    ] as Array<Record<string, unknown>>,
  };
  const work = {
    contexts: [] as Array<Record<string, unknown>>,
    projects: [] as Array<Record<string, unknown>>,
    taskLinks: [] as Array<Record<string, unknown>>,
    timeEntries: [] as Array<Record<string, unknown>>,
    history: [] as Array<Record<string, unknown>>,
  };
  const projects: Array<Record<string, unknown>> = [];
  const notes: Array<Record<string, unknown>> = knowledgeNotes.map((entry) => ({
    ...entry,
  }));
  const documents: Array<Record<string, unknown>> = knowledgeDocuments.map(
    (entry) => ({ ...entry }),
  );
  const projectItems = new Map<
    string,
    {
      goals: Array<Record<string, unknown>>;
      milestones: Array<Record<string, unknown>>;
    }
  >();
  const availability: Array<Record<string, unknown>> = [];
  const fitnessExercises: Array<Record<string, unknown>> = [];
  const shoppingCategories = [
    {
      id: "shopping-category-drinks",
      ownerId: profile.id,
      key: "drinks",
      name: "Getränke",
      sortOrder: 10,
      origin: "system",
      isActive: true,
    },
    {
      id: "shopping-category-other",
      ownerId: profile.id,
      key: "other",
      name: "Sonstiges",
      sortOrder: 90,
      origin: "system",
      isActive: true,
    },
  ];
  const shoppingLists: Array<Record<string, unknown>> = [];
  const externalCalDavConnections: Array<Record<string, unknown>> = [
    {
      id: "external-caldav-1",
      name: "Synthetischer CalDAV-Dienst",
      baseUrl: "https://calendar.example.test/caldav/",
      enabled: false,
      readOnly: true,
      status: "disabled",
      credentialsConfigured: true,
      lastErrorCode: null,
      lastTestedAt: null,
      lastSyncAt: null,
      revokedAt: null,
      calendars: [],
      importedEventCount: 0,
    },
  ];
  const githubConnections: Array<Record<string, unknown>> = [
    {
      id: "github-connection-1",
      name: "Synthetischer GitHub-Zugang",
      enabled: false,
      readOnly: true,
      status: "disabled",
      tokenConfigured: true,
      accountLogin: null,
      lastErrorCode: null,
      lastTestedAt: null,
      lastFetchedAt: null,
      rateLimit: { remaining: null, resetAt: null },
    },
  ];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (path === "/api/v1/setup" && method === "GET") {
      await route.fulfill({ json: { required: false } });
      return;
    }
    if (path === "/api/v1/profile" && method === "GET") {
      await route.fulfill({ json: profile });
      return;
    }
    if (path === "/api/v1/integrations/caldav" && method === "GET") {
      await route.fulfill({
        json: {
          available: true,
          networkDefault: "disabled",
          mode: "read_only_import",
          connections: externalCalDavConnections,
        },
      });
      return;
    }
    if (path === "/api/v1/integrations/github" && method === "GET") {
      await route.fulfill({
        json: {
          available: true,
          networkDefault: "disabled",
          mode: "read_only",
          apiHost: "api.github.com",
          connections: githubConnections,
        },
      });
      return;
    }
    if (
      path === "/api/v1/integrations/github/github-connection-1" &&
      method === "PATCH"
    ) {
      const payload = request.postDataJSON() as { enabled: boolean };
      Object.assign(githubConnections[0]!, {
        enabled: payload.enabled,
        status: payload.enabled ? "ready" : "disabled",
      });
      await route.fulfill({ json: githubConnections[0] });
      return;
    }
    if (
      path === "/api/v1/integrations/github/github-connection-1/test" &&
      method === "POST"
    ) {
      Object.assign(githubConnections[0]!, {
        accountLogin: "synthetic-owner",
        lastTestedAt: "2034-03-01T10:00:00.000Z",
        rateLimit: { remaining: 4_999, resetAt: null },
      });
      await route.fulfill({
        json: {
          reachable: true,
          accountLogin: "synthetic-owner",
          rateLimit: { remaining: 4_999, resetAt: null },
        },
      });
      return;
    }
    if (
      path === "/api/v1/integrations/github/github-connection-1/repositories" &&
      method === "GET"
    ) {
      await route.fulfill({
        json: {
          repositories: [
            {
              id: "github-repository-1",
              owner: "synthetic-owner",
              name: "synthetic-repository",
              fullName: "synthetic-owner/synthetic-repository",
              description: "Nur synthetische Metadaten",
              private: true,
              archived: false,
              defaultBranch: "main",
              updatedAt: "2034-03-01T10:00:00.000Z",
            },
          ],
          rateLimit: { remaining: 4_998, resetAt: null },
        },
      });
      return;
    }
    if (
      path ===
        "/api/v1/integrations/github/github-connection-1/repositories/synthetic-owner/synthetic-repository" &&
      method === "GET"
    ) {
      await route.fulfill({
        json: {
          repository: {
            id: "github-repository-1",
            owner: "synthetic-owner",
            name: "synthetic-repository",
            fullName: "synthetic-owner/synthetic-repository",
            description: "Nur synthetische Metadaten",
            private: true,
            archived: false,
            defaultBranch: "main",
            updatedAt: "2034-03-01T10:00:00.000Z",
          },
          issues: [
            {
              number: 11,
              title: "Synthetisches Issue",
              state: "open",
              updatedAt: "2034-03-01T10:00:00.000Z",
            },
          ],
          pullRequests: [
            {
              number: 12,
              title: "Synthetischer Pull Request",
              state: "open",
              draft: false,
              updatedAt: "2034-03-01T10:00:00.000Z",
            },
          ],
          commits: [
            {
              sha: "a".repeat(40),
              message: "Synthetischer Commit",
              authoredAt: null,
              authorLogin: "synthetic-owner",
            },
          ],
          releases: [
            {
              tagName: "v-test",
              name: "Synthetisches Release",
              draft: false,
              prerelease: true,
              publishedAt: null,
            },
          ],
          ciRuns: [
            {
              id: "ci-1",
              name: "Repository checks",
              status: "completed",
              conclusion: "success",
              headBranch: "main",
              updatedAt: "2034-03-01T10:00:00.000Z",
            },
          ],
          rateLimit: { remaining: 4_992, resetAt: null },
        },
      });
      return;
    }
    if (
      path === "/api/v1/integrations/caldav/external-caldav-1" &&
      method === "PATCH"
    ) {
      const payload = request.postDataJSON() as { enabled: boolean };
      Object.assign(externalCalDavConnections[0]!, {
        enabled: payload.enabled,
        status: payload.enabled ? "ready" : "disabled",
      });
      await route.fulfill({ json: externalCalDavConnections[0] });
      return;
    }
    if (
      path === "/api/v1/integrations/caldav/external-caldav-1/test" &&
      method === "POST"
    ) {
      Object.assign(externalCalDavConnections[0]!, {
        status: "ready",
        lastTestedAt: "2034-03-01T10:00:00.000Z",
      });
      await route.fulfill({ json: { reachable: true, calendarCount: 1 } });
      return;
    }
    if (
      path === "/api/v1/integrations/caldav/external-caldav-1/calendars" &&
      method === "GET"
    ) {
      const remoteCalendar = {
        id: "external-calendar-1",
        displayName: "Externer Testkalender",
        href: "/caldav/test/",
        etag: '"remote-calendar-etag"',
        lastFetchedAt: "2034-03-01T10:00:00.000Z",
      };
      externalCalDavConnections[0]!.calendars = [remoteCalendar];
      await route.fulfill({ json: [remoteCalendar] });
      return;
    }
    if (
      path ===
        "/api/v1/integrations/caldav/external-caldav-1/imports/preview" &&
      method === "POST"
    ) {
      await route.fulfill({
        json: {
          externalImportId: "external-import-1",
          expiresAt: "2034-03-01T10:15:00.000Z",
          localCalendarId: calendar.id,
          externalCalendarId: "external-calendar-1",
          preview: {
            previewId: "external-ics-preview-1",
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
                uid: "external-event@lifeos.local",
                title: "Externer synthetischer Termin",
                action: "create",
                message: "Das Ereignis kann neu angelegt werden.",
                existingEtag: null,
              },
            ],
          },
        },
      });
      return;
    }
    if (
      path === "/api/v1/integrations/caldav/external-caldav-1/imports/commit" &&
      method === "POST"
    ) {
      Object.assign(externalCalDavConnections[0]!, {
        lastSyncAt: "2034-03-01T10:05:00.000Z",
        importedEventCount: 1,
      });
      await route.fulfill({
        json: {
          createdEvents: 1,
          unchangedEvents: 0,
          createdUids: ["external-event@lifeos.local"],
          mappedEvents: 1,
        },
      });
      return;
    }
    if (path === "/api/v1/study" && method === "GET") {
      await route.fulfill({ json: study });
      return;
    }
    if (path === "/api/v1/work" && method === "GET") {
      await route.fulfill({ json: work });
      return;
    }
    if (path === "/api/v1/planning" && method === "GET") {
      const url = new URL(request.url());
      const from = url.searchParams.get("from") ?? today;
      const to = url.searchParams.get("to") ?? from;
      const inRange = (date: string) => date >= from && date <= to;
      const items: Array<Record<string, unknown>> = [];
      /**
       * Öffentliche Identität `(calendarId, uid)` der in dieser Projektion
       * tatsächlich gelieferten Termine. Die UID allein ist nicht
       * kalenderübergreifend eindeutig.
       */
      const displayedEventKeys = new Set<string>();
      const eventKey = (calendarId: string, uid: string) =>
        `${calendarId}\u0000${uid}`;
      for (const value of tasks) {
        const status = stringValue(value.status);
        if (status === "done" || status === "cancelled") continue;
        const dueDate = value.dueDate ? stringValue(value.dueDate) : null;
        if (dueDate && inRange(dueDate)) {
          items.push({
            id: `task:${stringValue(value.id)}:deadline`,
            sourceId: value.id,
            uid: null,
            area: "tasks",
            kind: "deadline",
            objectType: "task",
            ownerId: profile.id,
            status,
            title: value.title,
            date: dueDate,
            startsAt: null,
            endsAt: null,
            timezone: profile.settings.timezone,
            durationMinutes: null,
            priority: value.priority ?? "medium",
            overdue: false,
            editable: "task",
            sourceUpdatedAt: value.updatedAt,
          });
        }
        const startsAt = value.scheduledStartAt
          ? stringValue(value.scheduledStartAt)
          : null;
        if (!startsAt) continue;
        const date = berlinDate(new Date(startsAt));
        if (!inRange(date)) continue;
        const durationMinutes = value.estimatedDurationMinutes
          ? Number(value.estimatedDurationMinutes)
          : null;
        items.push({
          id: `task:${stringValue(value.id)}:${durationMinutes ? "planned" : "start"}`,
          sourceId: value.id,
          uid: null,
          area: "tasks",
          kind: durationMinutes ? "planned_task" : "start_marker",
          objectType: "task",
          ownerId: profile.id,
          status,
          title: value.title,
          date,
          startsAt,
          endsAt: durationMinutes
            ? new Date(
                new Date(startsAt).getTime() + durationMinutes * 60_000,
              ).toISOString()
            : null,
          timezone: value.scheduledStartTimezone ?? profile.settings.timezone,
          durationMinutes,
          priority: value.priority ?? "medium",
          overdue: false,
          editable: "task",
          sourceUpdatedAt: value.updatedAt,
        });
      }
      for (const value of events) {
        const date = value.isAllDay
          ? stringValue(value.startDate)
          : berlinDate(new Date(stringValue(value.startsAt)));
        if (!inRange(date)) continue;
        /*
         * Nur tatsächlich gelieferte Termine dürfen einen verknüpften
         * Studieneintrag unterdrücken; verglichen wird über `(calendarId,
         * uid)`, nie über die UID allein.
         */
        displayedEventKeys.add(
          eventKey(stringValue(calendar.id), stringValue(value.uid)),
        );
        items.push({
          id: `calendar:${stringValue(value.uid)}`,
          sourceId: value.uid,
          uid: value.uid,
          calendarId: calendar.id,
          area: "calendar",
          kind: "fixed_event",
          objectType: "calendar_event",
          ownerId: profile.id,
          status: "confirmed",
          title: value.title,
          date,
          startsAt: value.startsAt,
          endsAt: value.endsAt,
          timezone: profile.settings.timezone,
          durationMinutes:
            value.startsAt && value.endsAt
              ? (new Date(stringValue(value.endsAt)).getTime() -
                  new Date(stringValue(value.startsAt)).getTime()) /
                60_000
              : null,
          priority: "medium",
          overdue: false,
          editable: "calendar_event",
          sourceUpdatedAt: value.updatedAt,
        });
      }
      for (const value of study.entries) {
        /*
         * Gemeinsame Statusregel beider Ansichten: erledigte und abgebrochene
         * Einträge bleiben unsichtbar, aktive einschließlich `paused` bleiben
         * sichtbar.
         */
        const entryStatus = stringValue(value.status);
        /*
         * Archivierte Einträge liefert die Planungsquelle gar nicht erst aus.
         */
        if (value.archivedAt) continue;
        if (entryStatus === "completed" || entryStatus === "cancelled")
          continue;
        /*
         * Paket 5: Ein verknüpfter Studieneintrag wird nur unterdrückt, wenn
         * sein führender Termin – verglichen über `(calendarId, uid)` – in der
         * gezeigten Projektion tatsächlich vorkommt. Ein Termin in einem
         * anderen Kalender oder außerhalb des Zeitraums lässt den
         * Studieneintrag sichtbar.
         */
        const linkedCalendarId = value.calendarEventCalendarId
          ? stringValue(value.calendarEventCalendarId)
          : null;
        const linkedUid = value.calendarEventUid
          ? stringValue(value.calendarEventUid)
          : null;
        if (
          linkedCalendarId &&
          linkedUid &&
          displayedEventKeys.has(eventKey(linkedCalendarId, linkedUid))
        )
          continue;
        const date = value.dueDate
          ? stringValue(value.dueDate)
          : berlinDate(new Date(stringValue(value.startsAt)));
        if (!inRange(date)) continue;
        items.push({
          id: `study:${stringValue(value.id)}`,
          sourceId: value.id,
          uid: null,
          area: "study",
          kind: value.dueDate
            ? "deadline"
            : value.kind === "learning"
              ? "planned_task"
              : "fixed_event",
          objectType: "study_entry",
          ownerId: profile.id,
          status: stringValue(value.status) || "planned",
          title: value.title,
          date,
          startsAt: value.startsAt ?? null,
          endsAt: value.endsAt ?? null,
          timezone: profile.settings.timezone,
          durationMinutes:
            value.startsAt && value.endsAt
              ? (new Date(stringValue(value.endsAt)).getTime() -
                  new Date(stringValue(value.startsAt)).getTime()) /
                60_000
              : null,
          priority: value.kind === "exam" ? "high" : "medium",
          overdue: false,
          editable: null,
          sourceUpdatedAt: value.updatedAt,
        });
      }
      for (const value of work.projects) {
        const date = stringValue(value.deadlineDate);
        if (!date || !inRange(date)) continue;
        items.push({
          id: `work-project:${stringValue(value.id)}`,
          sourceId: value.id,
          area: "work",
          kind: "deadline",
          title: value.title,
          date,
          startsAt: null,
          endsAt: null,
          timezone: profile.settings.timezone,
          durationMinutes: null,
          priority: "high",
          overdue: false,
          editable: null,
          sourceUpdatedAt: value.updatedAt,
        });
      }
      for (const value of work.timeEntries) {
        const date = berlinDate(new Date(stringValue(value.startsAt)));
        if (!inRange(date)) continue;
        items.push({
          id: `work-time:${stringValue(value.id)}`,
          sourceId: value.id,
          area: "work",
          kind: value.kind === "planned" ? "planned_task" : "actual_time",
          title: value.title,
          date,
          startsAt: value.startsAt,
          endsAt: value.endsAt,
          timezone: profile.settings.timezone,
          durationMinutes: value.durationMinutes,
          priority: "medium",
          overdue: false,
          editable: null,
          sourceUpdatedAt: value.updatedAt,
        });
      }
      const dates: string[] = [];
      for (let date = from; date <= to;) {
        dates.push(date);
        const next = new Date(`${date}T00:00:00.000Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        date = next.toISOString().slice(0, 10);
      }
      for (const date of dates) {
        const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
        for (const value of availability.filter(
          (item) => Number(item.weekday) === weekday,
        )) {
          const startMinute = Number(value.startMinute);
          const endMinute = Number(value.endMinute);
          items.push({
            id: `availability:${stringValue(value.id)}:${date}`,
            sourceId: value.id,
            area: "availability",
            kind: "availability",
            title: value.label ?? "Persönliche Verfügbarkeit",
            date,
            startsAt: `${date}T${String(Math.floor(startMinute / 60)).padStart(2, "0")}:${String(startMinute % 60).padStart(2, "0")}:00.000Z`,
            endsAt: `${date}T${String(Math.floor(endMinute / 60)).padStart(2, "0")}:${String(endMinute % 60).padStart(2, "0")}:00.000Z`,
            timezone: profile.settings.timezone,
            durationMinutes: endMinute - startMinute,
            priority: "low",
            overdue: false,
            editable: null,
            sourceUpdatedAt: value.updatedAt,
          });
        }
      }
      const warnings: Array<Record<string, unknown>> = [];
      const fixed = items.filter(
        (item) => item.kind === "fixed_event" && item.startsAt && item.endsAt,
      );
      for (let first = 0; first < fixed.length; first += 1) {
        for (let second = first + 1; second < fixed.length; second += 1) {
          const left = fixed[first]!;
          const right = fixed[second]!;
          if (
            new Date(String(left.startsAt)).getTime() <
              new Date(String(right.endsAt)).getTime() &&
            new Date(String(right.startsAt)).getTime() <
              new Date(String(left.endsAt)).getTime()
          )
            warnings.push({
              id: `overlap:${stringValue(left.id)}:${stringValue(right.id)}`,
              kind: "overlap",
              severity: "critical",
              date: left.date,
              itemIds: [left.id, right.id],
              message:
                "Zwei feste Termine überschneiden sich. Es wurde nichts automatisch verschoben.",
            });
        }
      }
      for (const date of dates) {
        const planned = items.filter(
          (item) => item.date === date && item.kind === "planned_task",
        );
        const plannedMinutes = planned.reduce(
          (sum, item) => sum + Number(item.durationMinutes ?? 0),
          0,
        );
        const availableMinutes = items
          .filter((item) => item.date === date && item.kind === "availability")
          .reduce((sum, item) => sum + Number(item.durationMinutes ?? 0), 0);
        if (plannedMinutes > availableMinutes && availableMinutes > 0)
          warnings.push({
            id: `capacity:${date}`,
            kind: "capacity",
            severity: "warning",
            date,
            itemIds: planned.map((item) => item.id),
            message: `Die geplante Zeit überschreitet die Verfügbarkeit um ${plannedMinutes - availableMinutes} Minuten.`,
          });
      }
      await route.fulfill({
        json: {
          generatedAt: new Date().toISOString(),
          timezone: profile.settings.timezone,
          range: { from, to },
          items,
          warnings,
          availabilityWindows: availability,
        },
      });
      return;
    }
    if (path === "/api/v1/planning/availability" && method === "POST") {
      const payload = request.postDataJSON() as Record<string, unknown>;
      const created = {
        id: `availability-${availability.length + 1}`,
        ownerId: profile.id,
        ...payload,
        label: payload.label ?? null,
        createdAt: "2032-01-01T00:00:00.000Z",
        updatedAt: "2032-01-01T00:00:00.000Z",
      };
      availability.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }
    if (
      path.startsWith("/api/v1/planning/availability/") &&
      method === "DELETE"
    ) {
      const id = path.split("/").at(-1);
      const index = availability.findIndex((item) => item.id === id);
      if (index >= 0) availability.splice(index, 1);
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    if (path === "/api/v1/work/contexts" && method === "POST") {
      const payload = request.postDataJSON() as Record<string, unknown>;
      const created = {
        id: `work-${work.contexts.length + 1}`,
        ownerId: profile.id,
        ...payload,
        organization: payload.organization ?? null,
        startsOn: payload.startsOn ?? null,
        endsOn: payload.endsOn ?? null,
        notes: payload.notes ?? null,
        archivedAt: null,
        createdAt: "2032-01-01T00:00:00.000Z",
        updatedAt: "2032-01-01T00:00:00.000Z",
      };
      work.contexts.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }
    if (path === "/api/v1/work/projects" && method === "POST") {
      const payload = request.postDataJSON() as Record<string, unknown>;
      const created = {
        id: `work-project-${work.projects.length + 1}`,
        ownerId: profile.id,
        ...payload,
        calendarEventId: null,
        notes: payload.notes ?? null,
        archivedAt: null,
        createdAt: "2032-01-01T00:00:00.000Z",
        updatedAt: "2032-01-01T00:00:00.000Z",
      };
      work.projects.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }
    if (path === "/api/v1/work/time-entries" && method === "POST") {
      const payload = request.postDataJSON() as Record<string, unknown>;
      const created = {
        id: `work-time-${work.timeEntries.length + 1}`,
        ownerId: profile.id,
        ...payload,
        projectId: payload.projectId ?? null,
        taskId: payload.taskId ?? null,
        notes: payload.notes ?? null,
        durationMinutes:
          (new Date(String(payload.endsAt)).getTime() -
            new Date(String(payload.startsAt)).getTime()) /
          60_000,
        archivedAt: null,
        createdAt: "2032-01-01T00:00:00.000Z",
        updatedAt: "2032-01-01T00:00:00.000Z",
      };
      work.timeEntries.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }
    if (path === "/api/v1/work/task-links" && method === "POST") {
      const payload = request.postDataJSON() as Record<string, unknown>;
      const created = {
        id: `work-link-${work.taskLinks.length + 1}`,
        ownerId: profile.id,
        ...payload,
        projectId: payload.projectId ?? null,
        createdAt: "2032-01-01T00:00:00.000Z",
        updatedAt: "2032-01-01T00:00:00.000Z",
      };
      work.taskLinks.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }
    if (path.startsWith("/api/v1/work/task-links/") && method === "DELETE") {
      const id = path.split("/").at(-1);
      const index = work.taskLinks.findIndex((item) => item.id === id);
      if (index >= 0) work.taskLinks.splice(index, 1);
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    if (path === "/api/v1/study/programs" && method === "POST") {
      const payload = request.postDataJSON() as Record<string, unknown>;
      const created = {
        id: `study-${study.programs.length + 1}`,
        ownerId: profile.id,
        ...payload,
        notes: payload.notes ?? null,
        archivedAt: null,
        createdAt: "2032-01-01T00:00:00.000Z",
        updatedAt: "2032-01-01T00:00:00.000Z",
      };
      study.programs.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }
    if (path === "/api/v1/study/modules" && method === "POST") {
      const payload = request.postDataJSON() as Record<string, unknown>;
      const created = {
        id: `module-${study.modules.length + 1}`,
        ownerId: profile.id,
        ...payload,
        code: payload.code ?? null,
        grade: null,
        notes: payload.notes ?? null,
        archivedAt: null,
        createdAt: "2032-01-01T00:00:00.000Z",
        updatedAt: "2032-01-01T00:00:00.000Z",
      };
      study.modules.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }
    if (path === "/api/v1/study/entries" && method === "POST") {
      const payload = request.postDataJSON() as Record<string, unknown>;
      const created = {
        id: `entry-${study.entries.length + 1}`,
        ownerId: profile.id,
        ...payload,
        startsAt: payload.startsAt ?? null,
        endsAt: payload.endsAt ?? null,
        timezone: payload.timezone ?? null,
        credits: null,
        grade: null,
        taskId: null,
        calendarEventId: null,
        calendarEventUid: null,
        calendarEventCalendarId: null,
        archivedAt: null,
        createdAt: "2032-01-01T00:00:00.000Z",
        updatedAt: "2032-01-01T00:00:00.000Z",
      };
      study.entries.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }
    const studyModuleMatch = path.match(/^\/api\/v1\/study\/modules\/([^/]+)$/);
    if (studyModuleMatch && method === "PATCH") {
      const payload = request.postDataJSON() as Record<string, unknown>;
      const module = study.modules.find(
        (value) => value.id === studyModuleMatch[1],
      )!;
      Object.assign(module, payload, {
        archivedAt:
          payload.archived === undefined
            ? module.archivedAt
            : payload.archived
              ? "2032-01-02T00:00:00.000Z"
              : null,
        updatedAt: "2032-01-02T00:00:00.000Z",
      });
      await route.fulfill({ json: module });
      return;
    }
    const studyEntryMatch = path.match(/^\/api\/v1\/study\/entries\/([^/]+)$/);
    if (studyEntryMatch && method === "PATCH") {
      const payload = request.postDataJSON() as Record<string, unknown>;
      const entry = study.entries.find(
        (value) => value.id === studyEntryMatch[1],
      )!;
      Object.assign(entry, payload, {
        archivedAt:
          payload.archived === undefined
            ? entry.archivedAt
            : payload.archived
              ? "2032-01-02T00:00:00.000Z"
              : null,
        updatedAt: "2032-01-02T00:00:00.000Z",
      });
      await route.fulfill({ json: entry });
      return;
    }
    if (path === "/api/v1/calendars" && method === "GET") {
      await route.fulfill({ json: [calendar] });
      return;
    }
    if (path === "/api/v1/projects" && method === "GET") {
      await route.fulfill({ json: { projects } });
      return;
    }
    if (path === "/api/v1/knowledge" && method === "GET") {
      await route.fulfill({ json: { notes, documents } });
      return;
    }
    if (path === "/api/v1/search" && method === "GET") {
      const query = new URL(request.url()).searchParams.get("q") ?? "";
      const normalized = query.toLocaleLowerCase("de-DE");
      /* Nur tatsächlich gespeicherte Zeichenketten werden verglichen. */
      const asText = (value: unknown) =>
        typeof value === "string" ? value : "";
      const matches = (value: unknown) =>
        String(value).toLocaleLowerCase("de-DE").includes(normalized);
      /* Paket 6: Modul, Eintrag, Notiz und Dokument bleiben eigene Ziele. */
      const moduleResults = study.modules
        .filter(
          (module) =>
            module.searchEnabled === true &&
            (matches(module.title) || matches(module.notes ?? "")),
        )
        .flatMap((module) => [
          {
            id: module.id,
            title: module.title,
            contentType: "study_module",
            source: {
              type: "study_module",
              id: module.id,
              title: module.title,
            },
            updatedAt: module.updatedAt,
            snippet: module.notes ?? "",
            matchReason: "title",
            detailPath: `/study/modules/${String(module.id)}`,
            ownerId: profile.id,
            searchEnabled: true,
          },
          ...study.entries
            .filter(
              (entry) =>
                entry.moduleId === module.id &&
                entry.archivedAt === null &&
                matches(entry.title),
            )
            .map((entry) => ({
              id: entry.id,
              title: entry.title,
              contentType: "study_entry",
              source: {
                type: "study_module",
                id: module.id,
                title: module.title,
              },
              updatedAt: entry.updatedAt,
              snippet: asText(entry.notes),
              matchReason: "title",
              detailPath: `/study/modules/${String(module.id)}#entry-${String(entry.id)}`,
              ownerId: profile.id,
              searchEnabled: true,
            })),
        ]);
      const documentResults = documents
        .filter(
          (document) =>
            document.searchEnabled === true &&
            document.archivedAt == null &&
            matches(
              `${asText(document.fileName)} ${asText(document.extractedText)}`,
            ),
        )
        .map((document) => ({
          id: document.id,
          title: document.fileName,
          contentType: "document",
          source: {
            type: "document",
            id: document.id,
            title: document.fileName,
          },
          updatedAt: document.updatedAt,
          snippet: String(document.fileName),
          matchReason: "title",
          detailPath: `/knowledge/documents/${String(document.id)}`,
          ownerId: profile.id,
          searchEnabled: true,
        }));
      const results = [
        ...notes
          .filter(
            (note) =>
              note.searchEnabled === true &&
              note.archivedAt == null &&
              `${String(note.title)} ${String(note.content)}`
                .toLocaleLowerCase("de-DE")
                .includes(normalized),
          )
          .map((note) => ({
            id: note.id,
            title: note.title,
            contentType: "note",
            source: { type: "note", id: note.id, title: note.title },
            updatedAt: note.updatedAt,
            snippet: note.content,
            matchReason: "content",
            detailPath: `/knowledge/notes/${String(note.id)}`,
            ownerId: profile.id,
            searchEnabled: true,
          })),
        ...documentResults,
        ...moduleResults,
      ];
      await route.fulfill({ json: { query, results } });
      return;
    }
    if (path === "/api/v1/ai/queries" && method === "POST") {
      const payload = request.postDataJSON() as { query?: string };
      const query = payload.query ?? "";
      const normalized = query.toLocaleLowerCase("de-DE");
      const sources = notes
        .filter(
          (note) =>
            note.searchEnabled === true &&
            `${String(note.title)} ${String(note.content)}`
              .toLocaleLowerCase("de-DE")
              .includes(normalized),
        )
        .map((note) => ({
          id: note.id,
          title: note.title,
          contentType: "note",
          source: { type: "note", id: note.id, title: note.title },
          updatedAt: note.updatedAt,
          excerpt: note.content,
          detailPath: `/knowledge/notes/${String(note.id)}`,
          releaseStatus: "search_enabled",
          usedForResponse: false,
          warning: null,
        }));
      await route.fulfill({
        status: 201,
        json: {
          interactionId: "0d13cbed-0370-4478-a9fc-02997639ff6a",
          status: "disabled",
          message:
            "Die quellengestützte KI ist standardmäßig deaktiviert. Es wurden keine Daten übertragen.",
          answer: null,
          sources,
          suggestions: [],
          metadata: {
            providerId: null,
            processingMode: "local",
            externalTransferOccurred: false,
            sourceCount: sources.length,
            usableSourceCount: sources.length,
            requestHash: "a".repeat(64),
          },
        },
      });
      return;
    }
    if (path === "/api/v1/notes" && method === "POST") {
      const payload = request.postDataJSON() as Record<string, unknown>;
      const created = {
        id: `note-${notes.length + 1}`,
        ownerId: profile.id,
        ...payload,
        format: "markdown",
        category: payload.category ?? null,
        tags: payload.tags ?? [],
        version: 1,
        searchEnabled: payload.searchEnabled ?? false,
        project: null,
        studyModule: null,
        archivedAt: null,
        createdAt: "2032-01-01T00:00:00.000Z",
        updatedAt: "2032-01-01T00:00:00.000Z",
      };
      notes.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }
    const noteMatch = path.match(/^\/api\/v1\/notes\/([^/]+)$/);
    if (noteMatch && method === "GET") {
      const note = notes.find((value) => value.id === noteMatch[1]);
      await route.fulfill({
        json: {
          ...note,
          versions: [
            {
              version: note?.version,
              title: note?.title,
              content: note?.content,
              category: note?.category,
              tags: note?.tags,
              createdAt: note?.createdAt,
            },
          ],
        },
      });
      return;
    }
    if (noteMatch && method === "PATCH") {
      const note = notes.find((value) => value.id === noteMatch[1])!;
      const payload = request.postDataJSON() as Record<string, unknown>;
      const versioned = "title" in payload || "content" in payload;
      Object.assign(note, payload, {
        version: versioned ? Number(note.version) + 1 : note.version,
        archivedAt:
          payload.archived === undefined
            ? note.archivedAt
            : payload.archived
              ? "2032-01-02T00:00:00.000Z"
              : null,
        updatedAt: "2032-01-02T00:00:00.000Z",
      });
      await route.fulfill({ json: note });
      return;
    }
    if (path === "/api/v1/documents" && method === "POST") {
      const url = new URL(request.url());
      const moduleId = url.searchParams.get("studyModuleId");
      const module = moduleId
        ? (study.modules.find((value) => value.id === moduleId) ?? null)
        : null;
      const created = {
        id: `document-${documents.length + 1}`,
        ownerId: profile.id,
        fileName: url.searchParams.get("fileName"),
        mimeType:
          request.headers()["content-type"] ?? "application/octet-stream",
        byteSize: new TextEncoder().encode(request.postData() ?? "").byteLength,
        sha256: "a".repeat(64),
        modifiedAt: "2032-01-01T00:00:00.000Z",
        searchEnabled: url.searchParams.get("searchEnabled") === "true",
        project: null,
        studyModule: module ? { id: module.id, title: module.title } : null,
        archivedAt: null,
        createdAt: "2032-01-01T00:00:00.000Z",
        updatedAt: "2032-01-01T00:00:00.000Z",
        contentUrl: `/api/v1/documents/document-${documents.length + 1}/content`,
      };
      documents.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }
    const documentMatch = path.match(/^\/api\/v1\/documents\/([^/]+)$/);
    if (documentMatch && method === "PATCH") {
      const payload = request.postDataJSON() as Record<string, unknown>;
      const document = documents.find(
        (value) => value.id === documentMatch[1],
      )!;
      const module =
        payload.studyModuleId == null
          ? null
          : (study.modules.find(
              (value) => value.id === payload.studyModuleId,
            ) ?? null);
      Object.assign(document, payload, {
        studyModule:
          payload.studyModuleId === undefined
            ? document.studyModule
            : module
              ? { id: module.id, title: module.title }
              : null,
        project: payload.projectId === undefined ? document.project : null,
        archivedAt:
          payload.archived === undefined
            ? document.archivedAt
            : payload.archived
              ? "2032-01-02T00:00:00.000Z"
              : null,
        updatedAt: "2032-01-02T00:00:00.000Z",
      });
      await route.fulfill({ json: document });
      return;
    }
    if (path === "/api/v1/projects" && method === "POST") {
      const payload = request.postDataJSON() as Record<string, unknown>;
      const id = `project-${projects.length + 1}`;
      const created = {
        id,
        ownerId: profile.id,
        ...payload,
        description: payload.description ?? null,
        status: payload.status ?? "planned",
        risk: payload.risk ?? null,
        dueDate: payload.dueDate ?? null,
        archivedAt: null,
        createdAt: "2032-01-01T00:00:00.000Z",
        updatedAt: "2032-01-01T00:00:00.000Z",
        progress: {
          state: "no_data",
          percent: null,
          completedItems: 0,
          totalItems: 0,
          breakdown: {
            goals: { completed: 0, total: 0 },
            milestones: { completed: 0, total: 0 },
            tasks: { completed: 0, total: 0 },
          },
        },
      };
      projects.push(created);
      projectItems.set(id, { goals: [], milestones: [] });
      await route.fulfill({ status: 201, json: created });
      return;
    }
    const projectMatch = path.match(/^\/api\/v1\/projects\/([^/]+)$/);
    if (projectMatch && method === "PATCH") {
      const project = projects.find((value) => value.id === projectMatch[1])!;
      const payload = request.postDataJSON() as Record<string, unknown>;
      Object.assign(project, payload, {
        archivedAt:
          payload.archived === undefined
            ? project.archivedAt
            : payload.archived
              ? "2032-01-02T00:00:00.000Z"
              : null,
        updatedAt: "2032-01-02T00:00:00.000Z",
      });
      await route.fulfill({ json: project });
      return;
    }
    if (projectMatch && method === "GET") {
      const project = projects.find((value) => value.id === projectMatch[1]);
      const items = projectItems.get(projectMatch[1] ?? "") ?? {
        goals: [],
        milestones: [],
      };
      await route.fulfill({
        json: {
          project,
          ...items,
          tasks: [],
          calendarEvents: [],
          progress: project?.progress,
        },
      });
      return;
    }
    const projectItemMatch = path.match(
      /^\/api\/v1\/projects\/([^/]+)\/(goals|milestones)$/,
    );
    if (projectItemMatch && method === "POST") {
      const payload = request.postDataJSON() as Record<string, unknown>;
      const items = projectItems.get(projectItemMatch[1] ?? "")!;
      const collection = items[projectItemMatch[2] as "goals" | "milestones"];
      const created = {
        id: `${projectItemMatch[2]}-${collection.length + 1}`,
        ownerId: profile.id,
        projectId: projectItemMatch[1],
        ...payload,
        description: null,
        risk: null,
        dueDate: payload.dueDate ?? null,
        archivedAt: null,
        createdAt: "2032-01-01T00:00:00.000Z",
        updatedAt: "2032-01-01T00:00:00.000Z",
      };
      collection.push(created);
      const project = projects.find(
        (value) => value.id === projectItemMatch[1],
      );
      if (project)
        project.progress = {
          state: "available",
          percent: payload.status === "completed" ? 100 : 0,
          completedItems: payload.status === "completed" ? 1 : 0,
          totalItems: 1,
          breakdown: {
            goals: {
              completed: payload.status === "completed" ? 1 : 0,
              total: projectItemMatch[2] === "goals" ? 1 : 0,
            },
            milestones: {
              completed: 0,
              total: projectItemMatch[2] === "milestones" ? 1 : 0,
            },
            tasks: { completed: 0, total: 0 },
          },
        };
      await route.fulfill({ status: 201, json: created });
      return;
    }
    const projectItemDetailMatch = path.match(
      /^\/api\/v1\/projects\/([^/]+)\/(goals|milestones)\/([^/]+)$/,
    );
    if (projectItemDetailMatch && method === "PATCH") {
      const items = projectItems.get(projectItemDetailMatch[1] ?? "")!;
      const collection =
        items[projectItemDetailMatch[2] as "goals" | "milestones"];
      const item = collection.find(
        (value) => value.id === projectItemDetailMatch[3],
      )!;
      const payload = request.postDataJSON() as Record<string, unknown>;
      Object.assign(item, payload, {
        archivedAt:
          payload.archived === undefined
            ? item.archivedAt
            : payload.archived
              ? "2032-01-02T00:00:00.000Z"
              : null,
        updatedAt: "2032-01-02T00:00:00.000Z",
      });
      await route.fulfill({ json: item });
      return;
    }
    if (path === "/api/v1/dashboard" && method === "GET") {
      await route.fulfill({
        json: {
          generatedAt: new Date().toISOString(),
          timezone: profile.settings.timezone,
          tasks: tasks.filter(
            (task) =>
              !task.archivedAt &&
              task.status !== "done" &&
              task.status !== "cancelled",
          ),
          events: events.map((event) => ({
            ...event,
            calendarId: calendar.id,
            calendarName: calendar.name,
          })),
          projects: [],
        },
      });
      return;
    }
    if (path === "/api/v1/task-event-links" && method === "GET") {
      await route.fulfill({ json: links });
      return;
    }
    if (path === "/api/v1/task-event-links" && method === "POST") {
      const payload = request.postDataJSON() as Record<string, string>;
      const linkedTask = tasks.find((task) => task.id === payload.taskId)!;
      const linkedEvent = events.find(
        (event) => event.uid === payload.eventUid,
      )!;
      const existing = links.find(
        (link) =>
          (link.task as Record<string, unknown>).id === linkedTask.id &&
          (link.event as Record<string, unknown>).uid === linkedEvent.uid,
      );
      if (existing) {
        await route.fulfill({ json: existing });
        return;
      }
      const created = {
        id: `link-${links.length + 1}`,
        task: {
          id: linkedTask.id,
          title: linkedTask.title,
          available: true,
        },
        event: {
          calendarId: payload.calendarId,
          uid: linkedEvent.uid,
          title: linkedEvent.title,
          available: true,
        },
        createdAt: "2026-07-29T13:00:00.000Z",
      };
      links.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }
    if (path.startsWith("/api/v1/task-event-links/") && method === "DELETE") {
      const linkId = path.split("/").at(-1);
      const index = links.findIndex((link) => link.id === linkId);
      if (index >= 0) links.splice(index, 1);
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    if (path === "/api/v1/calendars/kalender-1/events" && method === "GET") {
      await route.fulfill({ json: events });
      return;
    }
    if (
      path === "/api/v1/calendars/kalender-1/ics/preview" &&
      method === "POST"
    ) {
      await route.fulfill({
        json: {
          previewId: "ics-preview-1",
          expiresAt: "2034-03-01T10:15:00.000Z",
          sourceSha256: "a".repeat(64),
          totalEvents: 1,
          creatableEvents: 1,
          unchangedEvents: 0,
          conflictingEvents: 0,
          invalidEvents: 0,
          canCommit: true,
          items: [
            {
              index: 0,
              uid: "imported-ics@lifeos.local",
              title: "Importierter Testtermin",
              action: "create",
              message: "Das Ereignis kann neu angelegt werden.",
              existingEtag: null,
            },
          ],
        },
      });
      return;
    }
    if (
      path === "/api/v1/calendars/kalender-1/ics/commit" &&
      method === "POST"
    ) {
      events.push({
        ...initialEvent,
        uid: "imported-ics@lifeos.local",
        title: "Importierter Testtermin",
        etag: '"import-etag"',
      });
      await route.fulfill({
        json: {
          createdEvents: 1,
          unchangedEvents: 0,
          createdUids: ["imported-ics@lifeos.local"],
        },
      });
      return;
    }
    if (
      path === "/api/v1/calendars/kalender-1/ics/export" &&
      method === "GET"
    ) {
      await route.fulfill({
        contentType: "text/calendar; charset=utf-8",
        body: "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n",
      });
      return;
    }
    if (
      path === "/api/v1/tasks" &&
      request.url().includes("includeArchived=true") &&
      method === "GET"
    ) {
      await route.fulfill({ json: tasks });
      return;
    }
    if (path === "/api/v1/tasks" && method === "POST") {
      const payload = request.postDataJSON() as Record<string, unknown>;
      const created = {
        ...initialTask,
        ...payload,
        id: `aufgabe-${tasks.length + 1}`,
        createdAt: "2026-07-22T09:00:00.000Z",
        updatedAt: "2026-07-22T09:00:00.000Z",
      };
      tasks.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }
    if (path.startsWith("/api/v1/tasks/") && method === "PATCH") {
      const taskId = path.split("/").at(-1);
      const index = tasks.findIndex((task) => task.id === taskId);
      const payload = request.postDataJSON() as Record<string, unknown>;
      tasks[index] = {
        ...tasks[index],
        ...payload,
        completedAt:
          payload.status === "done"
            ? "2026-07-22T10:00:00.000Z"
            : payload.status === "open"
              ? null
              : tasks[index]?.completedAt,
        archivedAt:
          payload.archived === true
            ? "2026-07-22T10:00:00.000Z"
            : payload.archived === false
              ? null
              : tasks[index]?.archivedAt,
        updatedAt: "2026-07-22T10:00:00.000Z",
      };
      await route.fulfill({ json: tasks[index] });
      return;
    }
    if (path.startsWith("/api/v1/tasks/") && method === "DELETE") {
      const taskId = path.split("/").at(-1);
      const index = tasks.findIndex((task) => task.id === taskId);
      if (index >= 0) tasks.splice(index, 1);
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    if (path === "/api/v1/calendars/kalender-1/events" && method === "POST") {
      const payload = request.postDataJSON() as Record<string, unknown>;
      events.push({
        ...initialEvent,
        ...payload,
        startsAt: payload.isAllDay ? null : payload.startsAt,
        endsAt: payload.isAllDay ? null : payload.endsAt,
        startDate: payload.isAllDay ? payload.startDate : null,
        endDate: payload.isAllDay ? payload.endDate : null,
        uid: `termin-${events.length + 1}`,
        etag: `"etag-${events.length + 1}"`,
        sequence: 0,
      });
      await route.fulfill({ status: 201, json: events.at(-1) });
      return;
    }
    if (
      path === "/api/v1/calendars/kalender-1/events/termin-1" &&
      method === "PUT"
    ) {
      expect(request.headers()["if-match"]).toBe('"etag-1"');
      const payload = request.postDataJSON() as Record<string, unknown>;
      events[0] = {
        ...initialEvent,
        ...payload,
        etag: '"etag-1-neu"',
        sequence: 1,
      };
      await route.fulfill({ json: events[0] });
      return;
    }
    if (
      path === "/api/v1/calendars/kalender-1/events/termin-1" &&
      method === "DELETE"
    ) {
      expect(request.headers()["if-match"]).toBe('"etag-1-neu"');
      events.splice(0, 1);
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    if (path === "/api/v1/fitness" && method === "GET") {
      await route.fulfill({
        json: {
          plans: [],
          exercises: fitnessExercises,
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
        },
      });
      return;
    }
    if (path === "/api/v1/fitness/exercises" && method === "POST") {
      const payload = request.postDataJSON() as Record<string, unknown>;
      const created = {
        ...payload,
        id: `fitness-exercise-${fitnessExercises.length + 1}`,
        ownerId: profile.id,
        archivedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      fitnessExercises.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }
    if (path === "/api/v1/shopping-lists" && method === "GET") {
      await route.fulfill({ json: shoppingLists });
      return;
    }
    if (path === "/api/v1/shopping-categories" && method === "GET") {
      await route.fulfill({ json: shoppingCategories });
      return;
    }
    if (path === "/api/v1/shopping-lists" && method === "POST") {
      const now = new Date().toISOString();
      const created = {
        id: `shopping-list-${shoppingLists.length + 1}`,
        ownerId: profile.id,
        title: "Einkaufsliste",
        status: "active",
        archivedAt: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
        items: [] as Array<Record<string, unknown>>,
      };
      shoppingLists.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }
    if (path === "/api/v1/shopping-lists/parse-preview" && method === "POST") {
      const payload = request.postDataJSON() as { source?: string };
      await route.fulfill({
        json: {
          parserVersion: 1,
          previewVersion: 1,
          items: [
            {
              clientId: "preview-milk",
              productName: "Milch",
              quantity: 2,
              quantityText: "zwei",
              unit: "liter",
              categoryId: "shopping-category-drinks",
              categoryName: "Getränke",
              uncertain: false,
              source: payload.source ?? "manual",
              rememberCategory: false,
            },
            {
              clientId: "preview-unknown",
              productName: "Synthetischer Artikel",
              quantity: null,
              quantityText: null,
              unit: null,
              categoryId: "shopping-category-other",
              categoryName: "Sonstiges",
              uncertain: true,
              source: payload.source ?? "manual",
              rememberCategory: false,
            },
          ],
        },
      });
      return;
    }
    const shoppingBatchMatch = path.match(
      /^\/api\/v1\/shopping-lists\/([^/]+)\/items\/batch$/,
    );
    if (shoppingBatchMatch && method === "POST") {
      const list = shoppingLists.find(
        (value) => value.id === shoppingBatchMatch[1],
      );
      const payload = request.postDataJSON() as {
        items: Array<Record<string, unknown>>;
      };
      const items = payload.items.map((item, index) => ({
        ...item,
        id: `shopping-item-${index + 1}`,
        ownerId: profile.id,
        shoppingListId: shoppingBatchMatch[1],
        status: "open",
        sortOrder: index,
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        category: shoppingCategories.find(
          (category) => category.id === item.categoryId,
        ),
      }));
      if (list) list.items = items;
      await route.fulfill({ status: 201, json: { items } });
      return;
    }
    const shoppingItemMatch = path.match(
      /^\/api\/v1\/shopping-lists\/([^/]+)\/items\/([^/]+)$/,
    );
    if (shoppingItemMatch && method === "PATCH") {
      const list = shoppingLists.find(
        (value) => value.id === shoppingItemMatch[1],
      );
      const items = (list?.items ?? []) as Array<Record<string, unknown>>;
      const item = items.find((value) => value.id === shoppingItemMatch[2]);
      if (item) Object.assign(item, request.postDataJSON());
      await route.fulfill({ json: item });
      return;
    }
    if (shoppingItemMatch && method === "DELETE") {
      const list = shoppingLists.find(
        (value) => value.id === shoppingItemMatch[1],
      );
      const items = (list?.items ?? []) as Array<Record<string, unknown>>;
      if (list)
        list.items = items.filter((value) => value.id !== shoppingItemMatch[2]);
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    const shoppingReplaceMatch = path.match(
      /^\/api\/v1\/shopping-lists\/([^/]+)\/archive-and-create$/,
    );
    if (shoppingReplaceMatch && method === "POST") {
      const previous = shoppingLists.find(
        (value) => value.id === shoppingReplaceMatch[1],
      );
      const now = new Date().toISOString();
      if (previous)
        Object.assign(previous, { status: "archived", archivedAt: now });
      const created = {
        id: `shopping-list-${shoppingLists.length + 1}`,
        ownerId: profile.id,
        title: "Einkaufsliste",
        status: "active",
        archivedAt: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
        items: [] as Array<Record<string, unknown>>,
      };
      shoppingLists.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }
    await route.fulfill({
      status: 404,
      json: { error: { code: "NOT_FOUND", message: "Nicht gefunden" } },
    });
  });
};

test.beforeEach(async ({ page }) => {
  await installApi(page);
});

test("bietet auf Desktop und Smartphone keine Finanznavigation und bleibt per Tastatur bedienbar", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Guten Tag, Anton/ }),
  ).toBeVisible();

  await expect(
    page.getByRole("button", { name: "Finanzen", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Finanzen", exact: true }),
  ).toHaveCount(0);

  const navigation = page.getByRole("navigation", {
    name:
      testInfo.project.name === "mobile-chrome"
        ? "Mobile Hauptnavigation"
        : "Hauptnavigation",
  });
  await expect(navigation).toBeVisible();
  await expect(
    navigation.getByRole("button", { name: "Finanzen", exact: true }),
  ).toHaveCount(0);

  const tasksButton = navigation.getByRole("button", {
    name: "Aufgaben",
    exact: true,
  });
  await tasksButton.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Aufgaben", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#main-content")).toBeFocused();
});

test("verwaltet Fitness lokal und zeigt medizinische Grenzen", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Fitness", exact: true })
    .filter({ visible: true })
    .click();

  await expect(
    page.getByRole("heading", { name: "Fitness", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/weder Diagnosen noch medizinische Empfehlungen/),
  ).toBeVisible();
  const exerciseForm = page
    .getByRole("heading", { name: "Übung anlegen" })
    .locator("..");
  await exerciseForm.getByLabel("Name").fill("Synthetische Kniebeuge");
  await exerciseForm.getByRole("button", { name: "Übung speichern" }).click();
  await expect(page.getByText("Die Übung wurde angelegt.")).toBeVisible();
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] });
});

test("erfasst, prüft und archiviert eine Einkaufsliste auf Desktop und Smartphone", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Einkauf", exact: true })
    .filter({ visible: true })
    .click();

  await expect(
    page.getByRole("heading", { name: "Einkaufsliste", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Audio wird weder übertragen noch gespeichert/),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Mikrofon/i })).toHaveCount(0);

  await page.getByRole("button", { name: "Einkaufsliste anlegen" }).click();
  await page
    .getByLabel("Einkaufstext")
    .fill("zwei Liter Milch und etwas Neues");
  await page
    .getByLabel("Der Text wurde mit der System-Diktierfunktion eingegeben")
    .check();
  await page.getByRole("button", { name: "Vorschau erstellen" }).click();

  const milk = page.locator(".shopping-preview-card").first();
  await milk.getByLabel("Produkt", { exact: true }).fill("Haferdrink");
  await milk
    .getByLabel("Diese Produkt-Kategorie-Zuordnung künftig merken")
    .check();
  const unknown = page.locator(".shopping-preview-card").filter({
    hasText: "Zuordnung unsicher",
  });
  await unknown.getByRole("button", { name: "Aus Vorschau entfernen" }).click();
  await page
    .getByRole("button", { name: "Alle geprüften Positionen speichern" })
    .click();

  await expect(page.locator('input[value="Haferdrink"]')).toBeVisible();
  await page
    .getByRole("button", { name: "Haferdrink als erledigt markieren" })
    .click();
  await expect(
    page.getByRole("button", { name: "Haferdrink wieder öffnen" }),
  ).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Archivieren & neu beginnen" })
    .click();
  await expect(page.getByText("Noch keine Position vorhanden.")).toBeVisible();
  await expect(page.getByText(/Einkaufsliste · 1 Positionen/)).toBeVisible();

  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] });
});

test("zeigt die lokale Übersicht und speichert Termine ohne Browserpersistenz", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Guten Tag, Anton/ }),
  ).toBeVisible();
  await expect(page.getByText("Ruhiger Fokusblock")).toBeVisible();

  const calendarButton = page
    .getByRole("button", { name: "Kalender", exact: true })
    .filter({ visible: true });
  await calendarButton.click();
  await expect(
    page.getByRole("heading", { name: "Kalender", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tag", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ruhiger Fokusblock bearbeiten" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Monat", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Ruhiger Fokusblock/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Agenda", exact: true }).click();

  await page.getByRole("button", { name: /Neuer Termin/ }).click();
  await page.getByLabel("Titel").fill("Synthetischer Prüfungstag");
  await page
    .locator("label.toggle-field")
    .filter({ hasText: "Ganztägiger Termin" })
    .click();
  await page.getByLabel("Startdatum").fill(today);
  await page.getByLabel("Enddatum (exklusiv)").fill(tomorrow);
  await page.getByRole("button", { name: "Termin anlegen" }).click();
  const allDayCard = page.locator(".event-card").filter({
    hasText: "Synthetischer Prüfungstag",
  });
  await expect(allDayCard.getByText("Ganztägig").first()).toBeVisible();

  await page.getByRole("button", { name: /Neuer Termin/ }).click();
  await page.getByLabel("Titel").fill("Synthetischer Arzttermin");
  await page.getByLabel("Ort", { exact: true }).fill("Praxis");
  await page.getByRole("button", { name: "Termin anlegen" }).click();
  await expect(page.getByText("Synthetischer Arzttermin")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("angelegt");

  await page
    .getByRole("button", { name: "Ruhiger Fokusblock bearbeiten" })
    .click();
  await page.getByLabel("Titel").fill("Fokusblock aktualisiert");
  await page.getByRole("button", { name: "Änderungen speichern" }).click();
  /*
   * Der Termin-Editor bleibt absichtlich so lange offen, bis die Projektionen
   * neu geladen sind, und zeigt in seiner Überschrift den bereits eingetippten
   * Titel. Deshalb zuerst deterministisch auf das Schließen warten und danach
   * die Karte eindeutig prüfen.
   */
  await expect(page.locator(".event-editor")).toBeHidden();
  await expect(
    page.locator(".event-card").filter({ hasText: "Fokusblock aktualisiert" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("aktualisiert");

  await page
    .getByRole("button", { name: "Fokusblock aktualisiert bearbeiten" })
    .click();
  const eventEditor = page.locator(".event-editor");
  await eventEditor.getByLabel("Aufgabe auswählen").selectOption("aufgabe-1");
  await eventEditor.getByRole("button", { name: "Verknüpfen" }).click();
  await expect(eventEditor.getByText("Roadmap prüfen")).toBeVisible();
  await eventEditor
    .getByRole("button", {
      name: "Verknüpfung mit Roadmap prüfen entfernen",
    })
    .click();
  await expect(eventEditor.getByText("Noch keine Verknüpfung.")).toBeVisible();
  await page.getByRole("button", { name: "Löschen" }).click();
  await page.getByRole("button", { name: "Endgültig löschen" }).click();
  await expect(page.getByText("Fokusblock aktualisiert")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("gelöscht");

  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] });
});

test("prüft ICS-Dateien vor dem Import und exportiert lokal", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Kalender", exact: true })
    .filter({ visible: true })
    .click();

  await page.getByLabel(/ICS-Datei für Vorschau/).setInputFiles({
    name: "synthetischer-import.ics",
    mimeType: "text/calendar",
    buffer: (
      globalThis as unknown as {
        Buffer: { from(value: string): never };
      }
    ).Buffer.from(
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:imported-ics@lifeos.local\r\nSUMMARY:Importierter Testtermin\r\nDTSTART:20340320T080000Z\r\nDTEND:20340320T090000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n",
    ),
  });
  await expect(page.getByText("Importierter Testtermin")).toBeVisible();
  await page
    .getByRole("button", { name: "Vorschau verbindlich importieren" })
    .click();
  await expect(page.getByText(/1 Ereignisse importiert/)).toBeVisible();

  await page.getByRole("button", { name: "Kalender exportieren" }).click();
  await expect(
    page.getByText("Der lokale ICS-Export wurde erstellt."),
  ).toBeVisible();
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] });
});

test("aktiviert externe CalDAV-Importe nur kontrolliert und read-only", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Einstellungen", exact: true })
    .filter({ visible: true })
    .click();

  await expect(
    page.getByRole("heading", { name: "Einstellungen", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Integrationen", exact: true }),
  ).toBeVisible();
  const externalCalDav = page.locator(".external-caldav-card");
  await expect(
    externalCalDav.getByText("Deaktiviert", { exact: true }),
  ).toBeVisible();
  await expect(
    externalCalDav.getByRole("button", { name: "Verbindung testen" }),
  ).toBeDisabled();

  await externalCalDav
    .getByRole("button", { name: "Read-only aktivieren" })
    .click();
  await expect(externalCalDav.getByText("Aktiv · nur Lesen")).toBeVisible();
  await externalCalDav
    .getByRole("button", { name: "Verbindung testen" })
    .click();
  await expect(page.getByRole("status")).toContainText("erfolgreich getestet");
  await externalCalDav
    .getByRole("button", { name: "Kalender auflisten" })
    .click();
  await externalCalDav
    .getByLabel("Externer Kalender")
    .selectOption("external-calendar-1");
  await externalCalDav
    .getByRole("button", { name: "Importvorschau erstellen" })
    .click();
  await expect(page.getByText(/1 Ereignisse: 1 neu/)).toBeVisible();
  await externalCalDav
    .getByRole("button", { name: "Read-only-Import bestätigen" })
    .click();
  await expect(page.getByRole("status")).toContainText("read-only importiert");
  await externalCalDav
    .getByRole("button", { name: "Verbindung deaktivieren" })
    .click();
  await expect(
    externalCalDav.getByText("Deaktiviert", { exact: true }),
  ).toBeVisible();

  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] });
});

test("liest GitHub-Metadaten nur nach Aktivierung und ohne Browserpersistenz", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Einstellungen", exact: true })
    .filter({ visible: true })
    .click();
  const github = page.locator(".github-integration-panel");

  await expect(
    github.getByRole("heading", { name: "GitHub-Integration" }),
  ).toBeVisible();
  await expect(github.getByText("Deaktiviert", { exact: true })).toBeVisible();
  await expect(
    github.getByRole("button", { name: "Verbindung testen" }),
  ).toBeDisabled();
  await github.getByRole("button", { name: "Read-only aktivieren" }).click();
  await github.getByRole("button", { name: "Verbindung testen" }).click();
  await expect(github.getByRole("status")).toContainText(
    "erfolgreich getestet",
  );
  await github.getByRole("button", { name: "Repositories laden" }).click();
  await github
    .getByLabel("Repository")
    .selectOption("synthetic-owner/synthetic-repository");
  await github.getByRole("button", { name: "Aktuellen Stand lesen" }).click();

  await expect(github.getByText(/Synthetisches Issue/)).toBeVisible();
  await expect(github.getByText(/Synthetischer Pull Request/)).toBeVisible();
  await expect(github.getByText(/Synthetischer Commit/)).toBeVisible();
  await expect(github.getByText(/Synthetisches Release/)).toBeVisible();
  await expect(github.getByText(/Repository checks/)).toBeVisible();
  await github.getByRole("button", { name: "GitHub deaktivieren" }).click();
  await expect(github.getByText("Deaktiviert", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] });
});

test("plant einen Studienabschnitt mit Modul und Prüfung", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Studium" }).first().click();
  await page.getByRole("button", { name: "Abschnitt anlegen" }).click();
  await page
    .getByLabel("Studiengang oder Ausbildungsbereich")
    .fill("Synthetische Informatik");
  await page
    .getByLabel("Hochschule oder Bildungseinrichtung")
    .fill("Lokale Testhochschule");
  await page
    .getByLabel("Semester oder Studienabschnitt")
    .fill("Sommersemester 2032");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Synthetische Informatik")).toBeVisible();
  await page.getByRole("button", { name: "Modul hinzufügen" }).click();
  await page.getByLabel("Modul oder Kurs").fill("Nachvollziehbare Systeme");
  await page.getByRole("button", { name: "Speichern" }).click();
  await page.getByRole("button", { name: "Eintrag hinzufügen" }).click();
  await page.getByLabel("Bezeichnung").fill("Synthetische Prüfung");
  await page.getByLabel("Kalendertag").fill(today);
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Synthetische Prüfung")).toBeVisible();
  await page.getByRole("button", { name: "Übersicht" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Nächste Prüfungen und Abgaben" }),
  ).toBeVisible();
  await expect(page.getByText("Synthetische Prüfung")).toBeVisible();
  await page.getByRole("button", { name: "Kalender" }).first().click();
  /*
   * Paket 5: Die Studienfrist erscheint in der gemeinsamen Kalenderprojektion
   * und ist dort ausdrücklich als Frist gekennzeichnet.
   */
  const studyDeadline = page
    .locator(".projection-card")
    .filter({ hasText: "Synthetische Prüfung" });
  await expect(studyDeadline.first()).toBeVisible();
  await expect(studyDeadline.first().getByText("Frist")).toBeVisible();
  await expect(studyDeadline.first().getByText("Studium")).toBeVisible();
});

test("trennt Frist, Zeitblock und Startmarkierung, unterdrückt verknüpfte Studienzeiten und bearbeitet Aufgaben aus der Ansicht", async ({
  page,
}) => {
  const linkedUid = "vorlesung-verknuepft";
  const startInstant = `${today}T06:30:00.000Z`;
  const startTime = berlinDateTimeInput(new Date(startInstant)).slice(11);
  await installApi(page, {
    additionalEvents: [
      {
        ...initialEvent,
        uid: linkedUid,
        title: "Verknüpfte Vorlesung",
        startsAt: `${today}T08:00:00.000Z`,
        endsAt: `${today}T10:00:00.000Z`,
        reminderMinutes: [],
      },
    ],
    additionalStudyEntries: [
      {
        id: "study-entry-linked",
        ownerId: profile.id,
        moduleId: null,
        kind: "lecture",
        title: "Verknüpfte Vorlesung",
        status: "planned",
        dueDate: null,
        startsAt: `${today}T08:00:00.000Z`,
        endsAt: `${today}T10:00:00.000Z`,
        timezone: "Europe/Berlin",
        credits: null,
        grade: null,
        notes: null,
        taskId: null,
        calendarEventId: "ereignis-verknuepft",
        /*
         * Paket 5: Die Unterdrückung prüft `(calendarId, uid)` des führenden
         * Termins gegen die tatsächlich gelieferte Projektion. Ohne diese
         * Angaben bliebe der Eintrag sichtbar und würde doppelt erscheinen.
         */
        calendarEventUid: linkedUid,
        calendarEventCalendarId: calendar.id,
        archivedAt: null,
        createdAt: "2026-07-22T08:00:00.000Z",
        updatedAt: "2026-07-22T08:00:00.000Z",
      },
    ],
    additionalTasks: [
      {
        ...initialTask,
        id: "aufgabe-frist",
        title: "Abgabe und Block",
        dueDate: today,
        scheduledStartAt: null,
        scheduledStartTimezone: null,
        estimatedDurationMinutes: null,
      },
      {
        ...initialTask,
        id: "aufgabe-start",
        title: "Prüfungsvorbereitung",
        dueDate: null,
        scheduledStartAt: startInstant,
        scheduledStartTimezone: "Europe/Berlin",
        estimatedDurationMinutes: null,
      },
    ],
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Kalender" }).first().click();

  /*
   * Paket 5: Ein verknüpfter Studieneintrag erscheint genau einmal, nämlich
   * über sein führendes Kalenderereignis.
   */
  await expect(
    page.locator(".projection-card", { hasText: "Verknüpfte Vorlesung" }),
  ).toHaveCount(1);
  await expect(
    page
      .locator(".projection-card", { hasText: "Verknüpfte Vorlesung" })
      .getByText("Studium"),
  ).toHaveCount(0);

  const deadlineCard = page
    .locator(".projection-card", { hasText: "Abgabe und Block" })
    .first();
  await expect(deadlineCard.getByText("Frist")).toBeVisible();
  await expect(deadlineCard.getByText("Ganztägig")).toBeVisible();

  const startCard = page
    .locator(".projection-card", { hasText: "Prüfungsvorbereitung" })
    .first();
  await expect(startCard.getByText("Start ohne Dauer")).toBeVisible();
  await expect(startCard.getByText(startTime, { exact: true })).toBeVisible();
  // Eine Startmarkierung bekommt kein erfundenes Ende.
  await expect(startCard).not.toContainText("–");

  await page.getByRole("button", { name: "Monat", exact: true }).click();
  await expect(page.locator(".month-event.projection-deadline")).toHaveCount(1);
  await expect(
    page.locator(".month-event.projection-start_marker"),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Woche", exact: true }).click();

  // Bearbeitung aus der Ansicht öffnet den vorhandenen Aufgabeneditor.
  await deadlineCard
    .getByRole("button", { name: "Abgabe und Block bearbeiten" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Aufgaben", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Geplanter Beginn").fill(`${today}T14:00`);
  await page.getByLabel("Geschätzte Dauer (Minuten)").fill("90");
  await page.getByRole("button", { name: "Änderungen speichern" }).click();
  await expect(page.getByText("Die Aufgabe wurde aktualisiert.")).toBeVisible();

  await page.getByRole("button", { name: "Kalender" }).first().click();
  const projections = page.locator(".projection-card", {
    hasText: "Abgabe und Block",
  });
  // Die Frist bleibt eine zweite, ausdrücklich beschriftete Projektion.
  await expect(projections).toHaveCount(2);
  await expect(
    projections.filter({ hasText: "Geplanter Zeitblock" }),
  ).toHaveCount(1);
  await expect(projections.filter({ hasText: "14:00–15:30" })).toHaveCount(1);
  await expect(
    page.locator(".projection-card", { hasText: "Prüfungsvorbereitung" }),
  ).toHaveCount(1);

  // Bearbeitung eines Kalenderereignisses aus der Planungsansicht.
  await page.getByRole("button", { name: "Planung" }).first().click();
  await expect(
    page.getByRole("heading", {
      name: "Woche und Agenda aus deinen Quelldaten",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ruhiger Fokusblock im Kalender bearbeiten" })
    .click();
  await expect(page.getByRole("heading", { name: "Kalender" })).toBeVisible();
  await expect(page.getByLabel("Titel")).toHaveValue("Ruhiger Fokusblock");
  await page.getByLabel("Titel").fill("Umbenannter Fokusblock");
  await page.getByRole("button", { name: "Änderungen speichern" }).click();
  await expect(page.getByText("Der Termin wurde aktualisiert.")).toBeVisible();
  // Alle Projektionen zeigen danach den aktualisierten Termin.
  await expect(
    page.locator(".projection-card", { hasText: "Umbenannter Fokusblock" }),
  ).toHaveCount(1);
  await expect(
    page.locator(".projection-card", { hasText: "Prüfungsvorbereitung" }),
  ).toHaveCount(1);
});

test("zeigt einen über Mitternacht laufenden Zeitblock genau einmal mit Fortsetzungskennzeichnung", async ({
  page,
}) => {
  const title = "Synthetischer Nachtblock";
  /*
   * Geplanter Block von 23:00 bis 01:00 des Folgetags in der Profilzeitzone
   * Europe/Berlin. Der Zeitpunkt wird aus der lokalen Wanduhrzeit abgeleitet und
   * ist damit unabhängig von der Zeitzone des Testrechners.
   */
  const startInstant = berlinInstant(today, "23:00");
  await installApi(page, {
    additionalTasks: [
      {
        ...initialTask,
        id: "aufgabe-nachtblock",
        title,
        dueDate: null,
        scheduledStartAt: startInstant,
        scheduledStartTimezone: "Europe/Berlin",
        estimatedDurationMinutes: 120,
      },
    ],
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Kalender" }).first().click();

  /*
   * Wochenansicht: Der Block erscheint an seinem Starttag genau einmal und wird
   * als Fortsetzung am Folgetag gekennzeichnet, statt ein zweites Mal zu
   * erscheinen.
   */
  const weekCards = page.locator(".projection-card", { hasText: title });
  await expect(weekCards).toHaveCount(1);
  await expect(
    weekCards.getByText("23:00–01:00", { exact: true }),
  ).toBeVisible();
  await expect(
    weekCards.getByText("Fortsetzung am Folgetag", { exact: true }),
  ).toBeVisible();

  /*
   * Tagesansicht des Starttags: derselbe eine Block, weiterhin als Fortsetzung
   * am Folgetag gekennzeichnet und kein zweiter Eintrag im Starttag-Zeitraum.
   */
  await page.getByRole("button", { name: "Tag", exact: true }).click();
  const startDayCards = page.locator(".projection-card", { hasText: title });
  await expect(startDayCards).toHaveCount(1);
  await expect(
    startDayCards.getByText("Fortsetzung am Folgetag", { exact: true }),
  ).toBeVisible();

  /*
   * Tagesansicht des Folgetags: Der Block wird dort erneut genau einmal
   * geführt, jetzt als Fortsetzung vom Vortag und ohne Kennzeichnung nach vorn.
   */
  await page.getByRole("button", { name: "Nächster Zeitraum" }).click();
  const nextDayCards = page.locator(".projection-card", { hasText: title });
  await expect(nextDayCards).toHaveCount(1);
  await expect(
    nextDayCards.getByText("Fortsetzung vom Vortag", { exact: true }),
  ).toBeVisible();
  expect(
    await nextDayCards
      .getByText("Fortsetzung am Folgetag", { exact: true })
      .count(),
  ).toBe(0);
});

test("zeigt im Kalender nur aktive Studieneinträge und blendet erledigte, abgebrochene und archivierte aus", async ({
  page,
}) => {
  const syntheticStudyEntry = (
    id: string,
    title: string,
    status: string,
    archivedAt: string | null,
  ) => ({
    id,
    ownerId: profile.id,
    moduleId: null,
    kind: "exam",
    title,
    status,
    dueDate: today,
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
    archivedAt,
    createdAt: "2026-07-22T08:00:00.000Z",
    updatedAt: "2026-07-22T08:00:00.000Z",
  });
  await installApi(page, {
    additionalStudyEntries: [
      syntheticStudyEntry(
        "study-entry-aktiv",
        "Aktive Studienfrist",
        "planned",
        null,
      ),
      syntheticStudyEntry(
        "study-entry-pausiert",
        "Pausierte Studienfrist",
        "paused",
        null,
      ),
      syntheticStudyEntry(
        "study-entry-erledigt",
        "Erledigte Studienfrist",
        "completed",
        null,
      ),
      syntheticStudyEntry(
        "study-entry-abgebrochen",
        "Abgebrochene Studienfrist",
        "cancelled",
        null,
      ),
      syntheticStudyEntry(
        "study-entry-archiviert",
        "Archivierte Studienfrist",
        "planned",
        "2026-07-22T08:00:00.000Z",
      ),
    ],
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Kalender" }).first().click();

  /*
   * Nur die aktiven Einträge sind in der gemeinsamen Kalenderprojektion
   * sichtbar; die Sichtbarkeit wird positiv über die gerenderten Karten
   * geprüft. `paused` bleibt aktiv und damit sichtbar.
   */
  const activeCard = page.locator(".projection-card", {
    hasText: "Aktive Studienfrist",
  });
  await expect(activeCard).toHaveCount(1);
  await expect(activeCard.getByText("Frist", { exact: true })).toBeVisible();
  await expect(activeCard.getByText("Studium", { exact: true })).toBeVisible();
  await expect(
    page.locator(".projection-card", { hasText: "Pausierte Studienfrist" }),
  ).toHaveCount(1);
  await expect(
    page.locator(".projection-card", { hasText: "Studienfrist" }),
  ).toHaveCount(2);

  /*
   * Das Fehlen wird über eine Zählung von 0 geprüft und nicht über eine rein
   * negative Sichtbarkeitsannahme auf einem einzelnen Element.
   */
  const hiddenTitles = [
    "Erledigte Studienfrist",
    "Abgebrochene Studienfrist",
    "Archivierte Studienfrist",
  ];
  for (const hiddenTitle of hiddenTitles) {
    expect(await page.getByText(hiddenTitle).count()).toBe(0);
  }

  /*
   * Dieselben Statusfälle in der Planungsansicht: dieselbe Statusregel,
   * dieselbe Menge sichtbarer Einträge.
   */
  await page.getByRole("button", { name: "Planung" }).first().click();
  await expect(
    page.locator(".planning-item", { hasText: "Aktive Studienfrist" }),
  ).toHaveCount(1);
  await expect(
    page.locator(".planning-item", { hasText: "Pausierte Studienfrist" }),
  ).toHaveCount(1);
  await expect(
    page.locator(".planning-item", { hasText: "Studienfrist" }),
  ).toHaveCount(2);
  for (const hiddenTitle of hiddenTitles) {
    expect(await page.getByText(hiddenTitle).count()).toBe(0);
  }
});

test("bleibt auf Desktop und Smartphone ohne horizontalen Überlauf bedienbar", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Guten Tag, Anton/ }),
  ).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  if (testInfo.project.name === "mobile-chrome") {
    await expect(
      page.getByRole("navigation", { name: "Mobile Hauptnavigation" }),
    ).toBeVisible();
  } else {
    await expect(
      page.getByRole("navigation", { name: "Hauptnavigation" }),
    ).toBeVisible();
  }
});

test("verwaltet Projekte und Fortschritt auf Desktop und Smartphone", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Projekte" })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ziele und Fortschritt im Blick" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Projekt", exact: true }).click();
  await page.getByLabel("Bezeichnung").fill("Synthetisches E2E-Projekt");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(
    page.getByText("Synthetisches E2E-Projekt").first(),
  ).toBeVisible();
  await expect(page.getByText("Noch keine Fortschrittsdaten")).toBeVisible();
  await page.getByRole("button", { name: "Ziel hinzufügen" }).click();
  await page.getByLabel("Bezeichnung").fill("Synthetisches E2E-Ziel");
  await page
    .locator(".study-form")
    .getByLabel("Status")
    .selectOption("completed");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Synthetisches E2E-Ziel")).toBeVisible();
  await expect(
    page.getByText("1 von 1 aktiven Einträgen abgeschlossen"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Projekt bearbeiten" }).click();
  await page.getByLabel("Bezeichnung").fill("Bearbeitetes E2E-Projekt");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(
    page.getByText("Bearbeitetes E2E-Projekt").first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Synthetisches E2E-Ziel archivieren" })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Synthetisches E2E-Ziel wiederherstellen",
    }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("verwaltet lokale Notizen und Dokumente auf Desktop und Smartphone", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Wissen" })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Notizen & Dokumente" }),
  ).toBeVisible();
  await page.getByLabel("Titel").fill("Synthetische Wissensnotiz");
  await page
    .getByLabel("Inhalt (Markdown)")
    .fill("# Lokal\n\nNur synthetischer Inhalt.");
  await page.getByLabel("Für lokale Suche freigeben").first().check();
  await page.getByRole("button", { name: "Notiz anlegen" }).click();
  await expect(
    page.getByText("Synthetische Wissensnotiz").first(),
  ).toBeVisible();
  await page.getByLabel("Titel").fill("Synthetische Wissensnotiz Version 2");
  await page.getByRole("button", { name: "Änderung speichern" }).click();
  await expect(page.getByText("Version 2").first()).toBeVisible();
  await page.getByLabel("Suchbegriff").fill("synthetischer Inhalt");
  await page.getByRole("button", { name: "Suchen" }).click();
  const searchResult = page.locator(".search-result");
  await expect(searchResult).toContainText(
    "Synthetische Wissensnotiz Version 2",
  );
  await expect(searchResult).toContainText("Eigener, freigegebener Inhalt");
  const sourceLink = searchResult.getByRole("link", { name: "Quelle öffnen" });
  await expect(sourceLink).toHaveAttribute(
    "href",
    /\/knowledge\/notes\/note-1/,
  );
  await sourceLink.click();
  await expect(page.getByText("Version 2").first()).toBeVisible();
  await page
    .getByLabel("Frage für die lokale Quellenprüfung")
    .fill("synthetischer Inhalt");
  await page.getByRole("button", { name: "Quellen lokal vorbereiten" }).click();
  await expect(
    page.getByText(
      "Die quellengestützte KI ist standardmäßig deaktiviert. Es wurden keine Daten übertragen.",
    ),
  ).toBeVisible();
  await expect(page.locator(".ai-response")).toContainText(
    "Synthetische Wissensnotiz Version 2",
  );
  await expect(page.locator(".ai-response")).toContainText(
    "Anbieter: keiner · Externe Übertragung: nein",
  );
  await page.getByLabel("Datei").evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(["Synthetisches Dokument"], "synthetisch.txt", {
        type: "text/plain",
      }),
    );
    (element as HTMLInputElement).files = transfer.files;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.getByRole("button", { name: "Lokal ablegen" }).click();
  await expect(page.getByText("synthetisch.txt")).toBeVisible();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("aktualisiert das Dashboard nach Schnellaktionen aus gespeicherten Daten", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Guten Tag, Anton/ }),
  ).toBeVisible();
  await expect(page.getByText("Offen und wichtig")).toBeVisible();
  await expect(page.getByText("Roadmap prüfen")).toBeVisible();

  await page.getByRole("button", { name: /Aufgabe erstellen/ }).click();
  const taskEditor = page.locator(".task-editor");
  await expect(taskEditor).toBeVisible();
  await taskEditor.getByLabel("Titel").fill("Dashboard-Aufgabe");
  await taskEditor.getByRole("button", { name: "Aufgabe anlegen" }).click();
  await page
    .getByRole("button", { name: "Übersicht", exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByText("Dashboard-Aufgabe")).toBeVisible();

  await page.getByRole("button", { name: /Termin erstellen/ }).click();
  const eventEditor = page.locator(".event-editor");
  await expect(eventEditor).toBeVisible();
  await eventEditor.getByLabel("Titel").fill("Dashboard-Termin");
  await eventEditor
    .locator("label.toggle-field")
    .filter({ hasText: "Ganztägiger Termin" })
    .click();
  await eventEditor.getByLabel("Startdatum").fill(today);
  await eventEditor.getByLabel("Enddatum (exklusiv)").fill(tomorrow);
  await eventEditor.getByRole("button", { name: "Termin anlegen" }).click();
  await page
    .getByRole("button", { name: "Übersicht", exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByText("Dashboard-Termin")).toBeVisible();
});

test("erstellt, filtert, bearbeitet und verwaltet Aufgaben ohne Browserpersistenz", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Guten Tag, Anton/ }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Aufgaben", exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Aufgaben", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Roadmap prüfen")).toBeVisible();

  await page.getByRole("button", { name: /Neue Aufgabe/ }).click();
  const editor = page.locator(".task-editor");
  await editor.getByLabel("Titel").fill("Unterlagen sortieren");
  await editor.getByLabel("Priorität").selectOption("high");
  await editor.getByLabel("Bereich").selectOption("work");
  await editor.getByLabel("Fällig am").fill("2030-07-24");
  await editor.getByLabel("Geschätzte Dauer (Minuten)").fill("45");
  await editor.getByLabel("Tags").fill("organisation, fokus");
  await editor.getByLabel("Beschreibung").fill("Synthetischer UI-Ablauf");
  await editor.getByRole("button", { name: "Aufgabe anlegen" }).click();
  await expect(
    page.locator(".task-card").filter({ hasText: "Unterlagen sortieren" }),
  ).toBeVisible();

  await page.reload();
  await page
    .getByRole("button", { name: "Aufgaben", exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page.locator(".task-card").filter({ hasText: "Unterlagen sortieren" }),
  ).toBeVisible();

  const filters = page.getByRole("region", { name: "Aufgaben filtern" });
  await filters.getByRole("searchbox").fill("unterlagen");
  await filters.getByLabel("Priorität").selectOption("high");
  await filters.getByLabel("Bereich").selectOption("work");
  await expect(
    page.locator(".task-card").filter({ hasText: "Unterlagen sortieren" }),
  ).toBeVisible();
  await expect(page.getByText("1 von 2 sichtbar")).toBeVisible();

  const taskCard = page.locator(".task-card").filter({
    hasText: "Unterlagen sortieren",
  });
  await taskCard
    .getByRole("button", { name: "Unterlagen sortieren bearbeiten" })
    .click();
  await editor.getByLabel("Titel").fill("Unterlagen archivieren");
  await editor.getByRole("button", { name: "Änderungen speichern" }).click();
  await expect(
    page.locator(".task-card").filter({ hasText: "Unterlagen archivieren" }),
  ).toBeVisible();

  const updatedCard = page.locator(".task-card").filter({
    hasText: "Unterlagen archivieren",
  });
  await updatedCard.getByRole("button", { name: "Abschließen" }).click();
  await expect(updatedCard.getByText("Erledigt")).toBeVisible();
  await updatedCard.getByRole("button", { name: "Wieder öffnen" }).click();
  await expect(updatedCard.getByText("Offen")).toBeVisible();

  await updatedCard
    .getByRole("button", { name: "Unterlagen archivieren bearbeiten" })
    .click();
  await editor.getByRole("button", { name: "Archivieren" }).click();
  await expect(
    page.locator(".task-card").filter({ hasText: "Unterlagen archivieren" }),
  ).toHaveCount(0);
  await filters.getByLabel("Archivierte anzeigen").check();
  await expect(
    page.locator(".task-card").filter({ hasText: "Unterlagen archivieren" }),
  ).toBeVisible();

  const archivedCard = page.locator(".task-card").filter({
    hasText: "Unterlagen archivieren",
  });
  await archivedCard
    .getByRole("button", { name: "Unterlagen archivieren bearbeiten" })
    .click();
  await editor.getByRole("button", { name: /Löschen/ }).click();
  await editor.getByRole("button", { name: "Endgültig löschen" }).click();
  await expect(
    page.locator(".task-card").filter({ hasText: "Unterlagen archivieren" }),
  ).toHaveCount(0);

  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] });
});

test("verwaltet den optionalen Studienmodulbezug auf Desktop und Smartphone", async ({
  page,
}) => {
  const archivedModuleId = "module-alt";
  // Der E2E-Mock vergibt Modul- und Projekt-IDs fortlaufend; ein archiviertes
  // Modul ist bereits vorhanden.
  const activeModuleId = "module-2";
  const projectId = "project-1";
  await installApi(page, {
    studyPrograms: [
      {
        id: "studium-1",
        ownerId: "nutzer-1",
        title: "Synthetischer Studienabschnitt",
        institution: "Lokale Testhochschule",
        periodLabel: "Wintersemester 2032",
        status: "active",
        notes: null,
        archivedAt: null,
        createdAt: "2026-08-09T10:00:00.000Z",
        updatedAt: "2026-08-09T10:00:00.000Z",
      },
    ],
    studyModules: [
      {
        id: archivedModuleId,
        ownerId: "nutzer-1",
        programId: "studium-1",
        title: "Synthetisches Altmodul",
        code: null,
        credits: null,
        grade: null,
        status: "completed",
        notes: null,
        documentReferences: [],
        searchEnabled: false,
        archivedAt: "2032-03-01T00:00:00.000Z",
        createdAt: "2026-08-09T10:00:00.000Z",
        updatedAt: "2026-08-09T10:00:00.000Z",
      },
    ],
    additionalTasks: [
      {
        ...initialTask,
        id: "aufgabe-alt",
        title: "Alte Modulaufgabe",
        studyModuleId: archivedModuleId,
      },
    ],
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Guten Tag, Anton/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Aufgaben", exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Aufgaben", exact: true }),
  ).toBeVisible();

  const filters = page.getByRole("region", { name: "Aufgaben filtern" });
  const legacyCard = page.locator(".task-card").filter({
    hasText: "Alte Modulaufgabe",
  });
  const plainCard = page.locator(".task-card").filter({
    hasText: "Roadmap prüfen",
  });

  // Der archivierte Altbezug bleibt sichtbar gekennzeichnet.
  await expect(legacyCard).toBeVisible();
  await expect(
    legacyCard.getByText("Archiviert · Synthetisches Altmodul"),
  ).toBeVisible();

  // Der Modulfilter kennt „Ohne Modul“ und archivierte Altbezüge.
  await filters.getByLabel("Studienmodul").selectOption("none");
  await expect(plainCard).toBeVisible();
  await expect(legacyCard).toHaveCount(0);
  await filters.getByLabel("Studienmodul").selectOption(archivedModuleId);
  await expect(legacyCard).toBeVisible();
  await expect(plainCard).toHaveCount(0);
  await filters.getByRole("button", { name: "Filter zurücksetzen" }).click();
  await expect(plainCard).toBeVisible();

  // Der archivierte Altbezug überlebt eine fachfremde Änderung.
  await legacyCard
    .getByRole("button", { name: "Alte Modulaufgabe bearbeiten" })
    .click();
  const editor = page.locator(".task-editor");
  await expect(editor.getByLabel("Studienmodul")).toHaveValue(archivedModuleId);
  await expect(editor.getByText(/Dieses Modul ist archiviert/)).toBeVisible();
  // Das archivierte Modul wird nicht erneut als Neuzuordnung angeboten.
  await expect(
    editor.getByRole("option", {
      name: "Archiviert · Synthetisches Altmodul",
    }),
  ).toHaveCount(1);
  await editor.getByLabel("Priorität").selectOption("low");
  await editor.getByRole("button", { name: "Änderungen speichern" }).click();
  await expect(
    legacyCard.getByText("Archiviert · Synthetisches Altmodul"),
  ).toBeVisible();

  // Anlage aus einem Modul heraus öffnet denselben Editor vorbelegt.
  await page
    .getByRole("button", { name: "Studium" })
    .filter({ visible: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Lernen nachvollziehbar planen" }),
  ).toBeVisible();
  await expect(
    page.getByText("Synthetischer Studienabschnitt").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Modul hinzufügen" }).click();
  await page.getByLabel("Modul oder Kurs").fill("Synthetisches Aktivmodul");
  await page.getByRole("button", { name: "Speichern" }).click();
  const activeModuleCard = page.locator(".study-card").filter({
    hasText: "Synthetisches Aktivmodul",
  });
  await expect(activeModuleCard).toBeVisible();
  await activeModuleCard
    .getByRole("button", { name: "Aufgabe anlegen" })
    .click();

  await expect(
    page.getByRole("heading", { name: "Aufgaben", exact: true }),
  ).toBeVisible();
  await expect(editor.getByLabel("Bereich")).toHaveValue("study");
  await expect(editor.getByLabel("Studienmodul")).toHaveValue(activeModuleId);
  await editor.getByLabel("Titel").fill("Modulaufgabe vorbereiten");
  await editor.getByRole("button", { name: "Aufgabe anlegen" }).click();
  const moduleCard = page.locator(".task-card").filter({
    hasText: "Modulaufgabe vorbereiten",
  });
  await expect(moduleCard).toBeVisible();
  await expect(moduleCard.getByText("Synthetisches Aktivmodul")).toBeVisible();

  // Projekt und Modul bestehen gleichzeitig.
  await page
    .getByRole("button", { name: "Projekte" })
    .filter({ visible: true })
    .click();
  await page.getByRole("button", { name: "Projekt", exact: true }).click();
  await page.getByLabel("Bezeichnung").fill("Synthetisches Modulprojekt");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(
    page.getByText("Synthetisches Modulprojekt").first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Aufgaben", exact: true })
    .filter({ visible: true })
    .click();
  await moduleCard
    .getByRole("button", { name: "Modulaufgabe vorbereiten bearbeiten" })
    .click();
  await editor
    .getByLabel("Projekt")
    .selectOption({ label: "Synthetisches Modulprojekt" });
  await expect(editor.getByLabel("Studienmodul")).toHaveValue(activeModuleId);
  await editor.getByRole("button", { name: "Änderungen speichern" }).click();
  await moduleCard
    .getByRole("button", { name: "Modulaufgabe vorbereiten bearbeiten" })
    .click();
  await expect(editor.getByLabel("Projekt")).toHaveValue(projectId);
  await expect(editor.getByLabel("Studienmodul")).toHaveValue(activeModuleId);

  // Der Bezug bleibt nach dem Neuladen erhalten und ist ausdrücklich entfernbar.
  await page.reload();
  await page
    .getByRole("button", { name: "Aufgaben", exact: true })
    .filter({ visible: true })
    .click();
  const reloadedCard = page.locator(".task-card").filter({
    hasText: "Modulaufgabe vorbereiten",
  });
  await expect(
    reloadedCard.getByText("Synthetisches Aktivmodul"),
  ).toBeVisible();
  await reloadedCard
    .getByRole("button", { name: "Modulaufgabe vorbereiten bearbeiten" })
    .click();
  await editor.getByLabel("Studienmodul").selectOption({ label: "Kein Modul" });
  await editor.getByRole("button", { name: "Änderungen speichern" }).click();
  await expect(
    page
      .locator(".task-card")
      .filter({ hasText: "Modulaufgabe vorbereiten" })
      .getByText("Synthetisches Aktivmodul"),
  ).toHaveCount(0);
  await page
    .locator(".task-card")
    .filter({ hasText: "Modulaufgabe vorbereiten" })
    .getByRole("button", { name: "Modulaufgabe vorbereiten bearbeiten" })
    .click();
  await expect(editor.getByLabel("Projekt")).toHaveValue(projectId);
  await expect(editor.getByLabel("Studienmodul")).toHaveValue("");

  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] });
});

/** Synthetische Detaildaten der Paket-6-Modulansicht. */
const detailProgram = {
  id: "study-program-detail",
  ownerId: profile.id,
  title: "Synthetischer Detailstudiengang",
  institution: "Lokale Testhochschule",
  periodLabel: "Sommersemester 2033",
  status: "active",
  notes: null,
  archivedAt: null,
  createdAt: "2032-01-01T00:00:00.000Z",
  updatedAt: "2032-01-01T00:00:00.000Z",
};

const detailModule = {
  id: "study-module-detail",
  ownerId: profile.id,
  programId: detailProgram.id,
  title: "Synthetisches Detailmodul",
  code: "DET-101",
  status: "active",
  credits: 6,
  grade: null,
  notes: "Synthetische Modulnotiz.",
  documentReferences: ["Skript Kapitel 1"],
  searchEnabled: true,
  archivedAt: null,
  createdAt: "2032-01-01T00:00:00.000Z",
  updatedAt: "2032-01-01T00:00:00.000Z",
};

const detailEntry = {
  id: "study-entry-detail",
  ownerId: profile.id,
  moduleId: detailModule.id,
  kind: "exam",
  title: "Synthetische Detailprüfung",
  status: "planned",
  dueDate: "2033-04-11",
  startsAt: null,
  endsAt: null,
  timezone: null,
  credits: null,
  grade: null,
  notes: null,
  taskId: null,
  calendarEventId: null,
  calendarEventUid: null,
  calendarEventCalendarId: null,
  archivedAt: null,
  createdAt: "2032-01-01T00:00:00.000Z",
  updatedAt: "2032-01-01T00:00:00.000Z",
};

const detailTask = {
  ...initialTask,
  id: "aufgabe-modul-detail",
  title: "Modulaufgabe mit Bezug",
  studyModuleId: detailModule.id,
};

const detailNote = {
  id: "note-modul-detail",
  ownerId: profile.id,
  title: "Synthetische Modulnotiz zur Prüfung",
  content: "Synthetischer Notizinhalt",
  format: "markdown",
  category: "Test",
  tags: ["lokal"],
  version: 1,
  searchEnabled: true,
  project: null,
  studyModule: { id: detailModule.id, title: detailModule.title },
  archivedAt: null,
  createdAt: "2032-01-01T00:00:00.000Z",
  updatedAt: "2032-01-01T00:00:00.000Z",
};

const detailDocument = {
  id: "document-modul-detail",
  ownerId: profile.id,
  fileName: "modul-skript.txt",
  mimeType: "text/plain",
  byteSize: 2048,
  sha256: "a".repeat(64),
  modifiedAt: "2032-01-01T00:00:00.000Z",
  searchEnabled: false,
  /* Vorhandener Extraktionstext; die Suche prüft Dateiname und Inhalt. */
  extractedText: "Synthetischer Dokumenttext zur Modulprüfung",
  project: null,
  studyModule: { id: detailModule.id, title: detailModule.title },
  archivedAt: null,
  createdAt: "2032-01-01T00:00:00.000Z",
  updatedAt: "2032-01-01T00:00:00.000Z",
  contentUrl: "/api/v1/documents/document-modul-detail/content",
};

/** Wechselt über die sichtbare Hauptnavigation in eine Ansicht. */
const showView = async (page: Page, name: string) => {
  await page
    .getByRole("button", { name, exact: true })
    .filter({ visible: true })
    .click();
};

/** Öffnet ein Modul aus der Studienübersicht über seine Karte. */
const openModuleFromOverview = async (page: Page, title: string) => {
  const backToOverview = page.getByRole("button", { name: "Zur Übersicht" });
  if ((await backToOverview.count()) > 0) {
    await backToOverview.click();
  }
  await showView(page, "Studium");
  await page
    .locator(".study-card")
    .filter({ hasText: title })
    .getByRole("button", { name: "Moduldetails öffnen" })
    .click();
  await expect(
    page.getByRole("heading", { name: title, level: 1 }),
  ).toBeVisible();
};

test("öffnet ein Studienmodul mit verknüpften Objekten und bearbeitet sie auf Desktop und Smartphone", async ({
  page,
}) => {
  await installApi(page, {
    studyPrograms: [detailProgram],
    studyModules: [detailModule],
    additionalStudyEntries: [detailEntry],
    additionalTasks: [detailTask],
    knowledgeNotes: [detailNote],
    knowledgeDocuments: [detailDocument],
  });
  await page.goto("/");
  await openModuleFromOverview(page, "Synthetisches Detailmodul");

  /* Modulangaben und echte Verknüpfungen sind nachvollziehbar. */
  const facts = page.getByRole("region", { name: "Modulangaben" });
  await expect(facts.getByText("DET-101")).toBeVisible();
  await expect(
    facts.getByText("Synthetischer Detailstudiengang · Sommersemester 2033"),
  ).toBeVisible();
  await expect(
    facts.getByText("Für die lokale Suche freigegeben"),
  ).toBeVisible();
  const tasksRegion = page.getByRole("region", { name: "Aufgaben" });
  await expect(tasksRegion.getByText("Modulaufgabe mit Bezug")).toBeVisible();
  await expect(tasksRegion.getByText("Roadmap prüfen")).toHaveCount(0);
  const entriesRegion = page.getByRole("region", {
    name: "Termine, Fristen und Lernzeiten",
  });
  await expect(
    entriesRegion.getByText("Synthetische Detailprüfung"),
  ).toBeVisible();
  const notesRegion = page.getByRole("region", { name: "Notizen" });
  await expect(
    notesRegion.getByText("Synthetische Modulnotiz zur Prüfung"),
  ).toBeVisible();
  const documentsRegion = page.getByRole("region", { name: "Dokumente" });
  await expect(documentsRegion.getByText("modul-skript.txt")).toBeVisible();
  /* Freie Verweise sind keine verknüpften Dateien. */
  await expect(documentsRegion.getByText("Skript Kapitel 1")).toBeVisible();
  await expect(
    documentsRegion.getByText(/keine verknüpften Dateien/),
  ).toBeVisible();

  /* Modul über das vorhandene Studienformular bearbeiten. */
  await page.getByRole("button", { name: "Modul bearbeiten" }).click();
  await page.getByLabel("Note (optional)").fill("2,0");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(facts.getByText("2,0")).toBeVisible();

  /* Studieneintrag über das vorhandene Studienformular bearbeiten. */
  await entriesRegion
    .getByRole("button", { name: "Eintrag bearbeiten" })
    .click();
  await page.getByLabel("Bezeichnung").fill("Synthetische Detailprüfung neu");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(
    entriesRegion.getByText("Synthetische Detailprüfung neu"),
  ).toBeVisible();

  /* Aufgabe über den gemeinsamen Aufgabeneditor. */
  await tasksRegion.getByRole("button", { name: "Aufgabe öffnen" }).click();
  const taskEditor = page.locator(".task-editor");
  await expect(taskEditor.getByLabel("Titel")).toHaveValue(
    "Modulaufgabe mit Bezug",
  );
  await expect(taskEditor.getByLabel("Studienmodul")).toHaveValue(
    detailModule.id,
  );

  /* Notiz über die Wissensansicht; die Modulauswahl bleibt erhalten. */
  await showView(page, "Studium");
  await page.getByRole("button", { name: "Notiz öffnen" }).click();
  await expect(
    page.getByRole("heading", { name: "Notiz bearbeiten" }),
  ).toBeVisible();
  await page.getByLabel("Titel").fill("Synthetische Modulnotiz neu");
  await page.getByRole("button", { name: "Änderung speichern" }).click();
  await expect(page.getByText("Die Notiz wurde aktualisiert.")).toBeVisible();

  /* Dokument: nur Metadaten und Verknüpfungen, kein Dateiersatz. */
  await showView(page, "Studium");
  await page.getByRole("button", { name: "Dokument bearbeiten" }).click();
  const documentEditor = page.locator(".document-editor");
  await expect(
    documentEditor.getByRole("heading", { name: "Dokument bearbeiten" }),
  ).toBeVisible();
  await expect(documentEditor.getByLabel("Studienmodul")).toHaveValue(
    detailModule.id,
  );
  await documentEditor.getByLabel("Für lokale Suche freigeben").check();
  await documentEditor
    .getByRole("button", { name: "Änderung speichern" })
    .click();
  await expect(
    page.getByText("Das Dokument wurde aktualisiert."),
  ).toBeVisible();
  await expect(
    documentEditor.getByLabel("Für lokale Suche freigeben"),
  ).toBeChecked();

  /* Nach der Bearbeitung zeigt die Modulansicht den aktualisierten Stand. */
  await showView(page, "Studium");
  await expect(
    page
      .getByRole("region", { name: "Notizen" })
      .getByText("Synthetische Modulnotiz neu"),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Dokumente" })
      .getByText(/für die lokale Suche freigegeben/),
  ).toBeVisible();
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] });
});

test("zeigt leere Modulbereiche, archivierte Bezüge und sichtbare API-Fehler", async ({
  page,
}) => {
  await installApi(page, {
    studyPrograms: [detailProgram],
    studyModules: [
      {
        ...detailModule,
        id: "study-module-empty",
        title: "Synthetisches Leermodul",
        code: "LEER-1",
        grade: null,
        documentReferences: [],
        searchEnabled: false,
      },
      detailModule,
    ],
    additionalStudyEntries: [
      detailEntry,
      {
        ...detailEntry,
        id: "study-entry-archived",
        title: "Archivierte Detailfrist",
        archivedAt: "2032-03-01T00:00:00.000Z",
      },
    ],
    additionalTasks: [
      detailTask,
      {
        ...detailTask,
        id: "aufgabe-modul-archiviert",
        title: "Archivierte Modulaufgabe",
        archivedAt: "2032-03-01T00:00:00.000Z",
      },
    ],
    knowledgeNotes: [detailNote],
    knowledgeDocuments: [detailDocument],
  });
  await page.goto("/");

  /* Ein Modul ohne Bezüge bleibt verständlich. */
  await openModuleFromOverview(page, "Synthetisches Leermodul");
  await expect(
    page.getByText("Noch keine Aufgabe mit diesem Modulbezug."),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Noch kein Termin, keine Frist und keine Lernzeit hinterlegt.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Noch keine Notiz mit diesem Modulbezug."),
  ).toBeVisible();
  await expect(
    page.getByText("Noch keine lokale Datei mit diesem Modul verknüpft."),
  ).toBeVisible();
  await expect(
    page.getByText("Keine Dokumentverweise hinterlegt."),
  ).toBeVisible();

  /* Ein sichtbarer API-Fehler bleibt verständlich. */
  await page.route("**/api/v1/study/modules/**", async (route) => {
    await route.fulfill({
      status: 500,
      json: {
        error: {
          code: "INTERNAL_ERROR",
          message: "Synthetischer Modulfehler",
        },
      },
    });
  });
  await page.getByRole("button", { name: "Modul bearbeiten" }).click();
  await page.getByLabel("Note (optional)").fill("3,0");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Synthetischer Modulfehler",
  );
  await page.getByRole("button", { name: "Abbrechen" }).click();

  /* Archivierte Bezüge bleiben sichtbar und gekennzeichnet. */
  await openModuleFromOverview(page, "Synthetisches Detailmodul");
  const tasksRegion = page.getByRole("region", { name: "Aufgaben" });
  await expect(tasksRegion.getByText("Archivierte Modulaufgabe")).toBeVisible();
  await expect(tasksRegion.getByText("Archiviert").first()).toBeVisible();
  const entriesRegion = page.getByRole("region", {
    name: "Termine, Fristen und Lernzeiten",
  });
  await expect(
    entriesRegion.getByText("Archivierte Detailfrist"),
  ).toBeVisible();
  await expect(entriesRegion.getByText("Archiviert").first()).toBeVisible();
  /* Nicht archivierte Verknüpfungen bleiben daneben sichtbar. */
  await expect(tasksRegion.getByText("Modulaufgabe mit Bezug")).toBeVisible();
  await expect(
    entriesRegion.getByText("Synthetische Detailprüfung"),
  ).toBeVisible();
});

test("öffnet Suchziele konkret und meldet verschwundene Ziele ohne fremdes Objekt", async ({
  page,
}) => {
  await installApi(page, {
    studyPrograms: [detailProgram],
    studyModules: [detailModule],
    additionalStudyEntries: [detailEntry],
    additionalTasks: [detailTask],
    knowledgeNotes: [detailNote],
    knowledgeDocuments: [{ ...detailDocument, searchEnabled: true }],
  });
  await page.goto("/");
  const openSearchResult = async (title: string) => {
    await showView(page, "Wissen");
    await page.getByLabel("Suchbegriff").fill("Synthetisch");
    await page.getByRole("button", { name: "Suchen" }).click();
    await page
      .locator(".search-result")
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
      .getByRole("link", { name: "Quelle öffnen" })
      .click();
  };

  /* Das Studienmodul öffnet genau dieses Modul. */
  await openSearchResult("Synthetisches Detailmodul");
  await expect(
    page.getByRole("heading", { name: "Synthetisches Detailmodul", level: 1 }),
  ).toBeVisible();

  /* Der Studieneintrag öffnet das Modul mit markiertem Eintrag. */
  await openSearchResult("Synthetische Detailprüfung");
  const highlighted = page.locator(".relation-card.search-target");
  await expect(highlighted).toContainText("Synthetische Detailprüfung");
  await expect(highlighted.getByText("Suchtreffer")).toBeVisible();

  /* Die Notiz öffnet genau diese Notiz. */
  await openSearchResult("Synthetische Modulnotiz zur Prüfung");
  await expect(page.getByLabel("Titel")).toHaveValue(
    "Synthetische Modulnotiz zur Prüfung",
  );

  /* Das Dokument öffnet genau seine Metadaten. */
  await openSearchResult("modul-skript.txt");
  await expect(
    page.locator(".document-editor").getByLabel("Studienmodul"),
  ).toHaveValue(detailModule.id);

  /* Verschwundene Ziele zeigen einen Fehler statt eines fremden Objekts. */
  await page.route("**/api/v1/search?*", async (route) => {
    await route.fulfill({
      json: {
        query: "Synthetisch",
        results: [
          {
            id: "modul-weg",
            title: "Verschwundenes Studienmodul",
            contentType: "study_module",
            source: {
              type: "study_module",
              id: "modul-weg",
              title: "Verschwundenes Studienmodul",
            },
            updatedAt: "2032-01-01T00:00:00.000Z",
            snippet: "",
            matchReason: "title",
            detailPath: "/study/modules/modul-weg",
            ownerId: profile.id,
            searchEnabled: true,
          },
          {
            id: "dokument-weg",
            title: "Verschwundenes Dokument",
            contentType: "document",
            source: {
              type: "document",
              id: "dokument-weg",
              title: "Verschwundenes Dokument",
            },
            updatedAt: "2032-01-01T00:00:00.000Z",
            snippet: "",
            matchReason: "title",
            detailPath: "/knowledge/documents/dokument-weg",
            ownerId: profile.id,
            searchEnabled: true,
          },
        ],
      },
    });
  });
  await openSearchResult("Verschwundenes Studienmodul");
  await expect(page.getByRole("alert")).toContainText(
    "Das gesuchte Studienmodul ist nicht mehr verfügbar.",
  );
  await expect(
    page.getByRole("heading", { name: "Synthetisches Detailmodul", level: 1 }),
  ).toHaveCount(0);

  await openSearchResult("Verschwundenes Dokument");
  await expect(page.getByRole("alert")).toContainText(
    "Das gesuchte Dokument ist nicht mehr verfügbar.",
  );
  await expect(page.locator(".document-editor")).toHaveCount(0);
});

test("verwaltet Praxisprojekt, Arbeitsaufgabe und getrennte Zeitwerte", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Aufgaben", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole("button", { name: /Neue Aufgabe/ }).click();
  const taskEditor = page.locator(".task-editor");
  await taskEditor.getByLabel("Titel").fill("Synthetische Arbeitsaufgabe");
  await taskEditor.getByLabel("Bereich").selectOption("work");
  await taskEditor.getByRole("button", { name: "Aufgabe anlegen" }).click();

  await page
    .getByRole("button", { name: "Arbeit", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole("button", { name: "Arbeitsbereich anlegen" }).click();
  await page.getByLabel("Arbeitsbereich").fill("Synthetische Praxisphase");
  await page.getByLabel("Position oder Rolle").fill("Praxisrolle");
  await page.getByLabel("Beginn").fill("2032-01-01");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(
    page.getByRole("heading", { name: "Synthetische Praxisphase" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Projekt hinzufügen/ }).click();
  await page
    .getByLabel("Projekt oder Praxisbereich")
    .fill("Synthetisches Verbesserungsprojekt");
  await page.getByLabel("Ziel").fill("Nachvollziehbarer Testfortschritt");
  await page.getByLabel("Frist").fill("2032-06-30");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(
    page.getByText("Synthetisches Verbesserungsprojekt"),
  ).toBeVisible();

  await page.getByRole("button", { name: /Aufgabe zuordnen/ }).click();
  await page
    .getByLabel("Aufgabe")
    .selectOption({ label: "Synthetische Arbeitsaufgabe" });
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(
    page.getByRole("heading", { name: "Synthetische Arbeitsaufgabe" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Zeit erfassen/ }).click();
  await page.getByLabel("Art").selectOption("planned");
  await page.getByLabel("Bezeichnung").fill("Geplanter Praxisblock");
  await page.getByLabel("Beginn").fill("2032-06-15T09:00");
  await page.getByLabel("Ende").fill("2032-06-15T10:30");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Geplanter Praxisblock")).toBeVisible();

  await page.getByRole("button", { name: /Zeit erfassen/ }).click();
  await page.getByLabel("Art").selectOption("actual");
  await page.getByLabel("Bezeichnung").fill("Tatsächlicher Praxisblock");
  await page.getByLabel("Beginn").fill("2032-06-15T09:15");
  await page.getByLabel("Ende").fill("2032-06-15T10:15");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Tatsächlicher Praxisblock")).toBeVisible();
  await expect(page.getByText("1 h 30 min", { exact: true })).toBeVisible();
  await expect(page.getByText("1 h 0 min", { exact: true })).toBeVisible();

  const filters = page.getByRole("region", { name: "Arbeitsdaten filtern" });
  await filters.getByLabel("Status").selectOption("planned");
  await expect(
    page.getByText("Synthetisches Verbesserungsprojekt"),
  ).toBeVisible();
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] });
});

test("zeigt eine kombinierte Studien- und Arbeitswoche mit erklärten Warnungen", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Studium" }).first().click();
  await page.getByRole("button", { name: "Abschnitt anlegen" }).click();
  await page
    .getByLabel("Studiengang oder Ausbildungsbereich")
    .fill("Synthetische Informatik");
  await page
    .getByLabel("Hochschule oder Bildungseinrichtung")
    .fill("Lokale Testhochschule");
  await page.getByLabel("Semester oder Studienabschnitt").fill("Testwoche");
  await page.getByRole("button", { name: "Speichern" }).click();
  await page.getByRole("button", { name: "Modul hinzufügen" }).click();
  await page.getByLabel("Modul oder Kurs").fill("Transparente Planung");
  await page.getByRole("button", { name: "Speichern" }).click();
  await page.getByRole("button", { name: "Eintrag hinzufügen" }).click();
  await page.getByLabel("Bezeichnung").fill("Synthetische Prüfung");
  await page.getByLabel("Kalendertag").fill(today);
  await page.getByRole("button", { name: "Speichern" }).click();

  await page
    .getByRole("button", { name: "Arbeit", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole("button", { name: "Arbeitsbereich anlegen" }).click();
  await page.getByLabel("Arbeitsbereich").fill("Synthetische Praxisphase");
  await page.getByLabel("Position oder Rolle").fill("Praxisrolle");
  await page.getByLabel("Beginn").fill(today);
  await page.getByRole("button", { name: "Speichern" }).click();
  await page.getByRole("button", { name: /Projekt hinzufügen/ }).click();
  await page
    .getByLabel("Projekt oder Praxisbereich")
    .fill("Synthetisches Wochenprojekt");
  await page.getByLabel("Frist").fill(today);
  await page.getByRole("button", { name: "Speichern" }).click();
  await page.getByRole("button", { name: /Zeit erfassen/ }).click();
  await page.getByLabel("Art").selectOption("planned");
  await page.getByLabel("Bezeichnung").fill("Geplanter Praxisblock");
  const plannedStart = new Date(eventStartsAt);
  plannedStart.setMinutes(plannedStart.getMinutes() + 10);
  const plannedEnd = new Date(plannedStart);
  plannedEnd.setHours(plannedEnd.getHours() + 2);
  await page.getByLabel("Beginn").fill(berlinDateTimeInput(plannedStart));
  await page.getByLabel("Ende").fill(berlinDateTimeInput(plannedEnd));
  await page.getByRole("button", { name: "Speichern" }).click();

  await page
    .getByRole("button", { name: "Kalender", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole("button", { name: /Neuer Termin/ }).click();
  const eventEditor = page.locator(".event-editor");
  await eventEditor.getByLabel("Titel").fill("Überschneidender Pflichttermin");
  const overlapStart = new Date(eventStartsAt);
  overlapStart.setMinutes(overlapStart.getMinutes() + 15);
  const overlapEnd = new Date(eventEndsAt);
  overlapEnd.setMinutes(overlapEnd.getMinutes() + 15);
  await eventEditor
    .getByLabel("Beginn", { exact: true })
    .fill(berlinDateTimeInput(overlapStart));
  await eventEditor
    .getByLabel("Ende", { exact: true })
    .fill(berlinDateTimeInput(overlapEnd));
  await eventEditor.getByRole("button", { name: "Termin anlegen" }).click();

  await page
    .getByRole("button", { name: "Planung", exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Gemeinsame Wochenansicht" }),
  ).toBeVisible();
  await expect(page.getByText("Synthetische Prüfung")).toBeVisible();
  await expect(page.getByText("Synthetisches Wochenprojekt")).toBeVisible();
  await expect(page.getByText("Geplanter Praxisblock")).toBeVisible();
  await expect(
    page.getByText(/Zwei feste Termine überschneiden sich/),
  ).toBeVisible();

  await page.getByRole("button", { name: "Fenster hinzufügen" }).click();
  const availabilityForm = page.locator(".availability-form");
  await availabilityForm
    .getByLabel("Wochentag")
    .selectOption(String(new Date(`${today}T00:00:00.000Z`).getUTCDay()));
  await availabilityForm.getByLabel("Von").fill("09:00");
  await availabilityForm.getByLabel("Bis").fill("10:00");
  await availabilityForm.getByLabel("Bezeichnung").fill("Fokuszeit");
  await availabilityForm
    .getByRole("button", { name: "Verfügbarkeit speichern" })
    .click();
  await expect(
    page.getByText(/geplante Zeit überschreitet die Verfügbarkeit/),
  ).toBeVisible();

  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Gemeinsame Agenda" }),
  ).toBeVisible();
  await page.getByLabel("Arbeit", { exact: true }).uncheck();
  await expect(page.getByText("Geplanter Praxisblock")).toHaveCount(0);
  await expect(page.getByText("Synthetische Prüfung")).toBeVisible();
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] });
});

test("liefert Manifest, Service Worker und das App-Shell offline aus", async ({
  context,
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Guten Tag, Anton/ }),
  ).toBeVisible();

  const manifestUrl = await page
    .locator('link[rel="manifest"]')
    .getAttribute("href");
  expect(manifestUrl).toBeTruthy();
  const manifest = await page.request.get(manifestUrl!);
  expect(manifest.ok()).toBeTruthy();
  const manifestBody = (await manifest.json()) as {
    name: string;
    icons: Array<{ src: string; sizes: string; purpose?: string }>;
  };
  expect(manifestBody.name).toBe("Anton Life OS");
  expect(manifestBody.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192" }),
      expect.objectContaining({ sizes: "512x512", purpose: "any" }),
      expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
    ]),
  );
  const icon = await page.request.get("/icons/lifeos-512.png");
  expect(icon.ok()).toBeTruthy();
  expect(icon.headers()["content-type"]).toContain("image/png");
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBeTruthy();

  await context.setOffline(true);
  const response = await page.reload({ waitUntil: "domcontentloaded" });
  expect(response?.ok()).toBeTruthy();
  expect(response?.fromServiceWorker()).toBeTruthy();
  await expect(
    page.getByRole("heading", { name: /Guten Tag, Anton/ }),
  ).toBeVisible();
});

test("bietet die PWA-Installation nur nach Browserfreigabe an", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Guten Tag, Anton/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "App installieren" }),
  ).toHaveCount(0);

  await page.evaluate(() => {
    const state = window as typeof window & { pwaPromptCalled?: boolean };
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: () => {
        state.pwaPromptCalled = true;
        return Promise.resolve();
      },
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.dispatchEvent(event);
  });
  await page.getByRole("button", { name: "App installieren" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { pwaPromptCalled?: boolean })
            .pwaPromptCalled,
      ),
    )
    .toBe(true);
  await expect(
    page.getByRole("button", { name: "App installieren" }),
  ).toHaveCount(0);
});
