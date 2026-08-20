import { expect, test, type Page } from "@playwright/test";

const profile = {
  id: "nutzer-1",
  displayName: "Anton Beispiel",
  settings: {
    timezone: "Europe/Berlin",
    locale: "de-DE",
    currencyCode: "EUR",
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
  parentTaskId: null,
  completedAt: null,
  archivedAt: null,
  createdAt: "2026-07-22T08:00:00.000Z",
  updatedAt: "2026-07-22T08:00:00.000Z",
};

const installApi = async (page: Page) => {
  const events: Array<Record<string, unknown>> = [{ ...initialEvent }];
  const tasks: Array<Record<string, unknown>> = [{ ...initialTask }];
  const links: Array<Record<string, unknown>> = [];
  const study = {
    programs: [] as Array<Record<string, unknown>>,
    modules: [] as Array<Record<string, unknown>>,
    entries: [] as Array<Record<string, unknown>>,
  };
  const work = {
    contexts: [] as Array<Record<string, unknown>>,
    projects: [] as Array<Record<string, unknown>>,
    taskLinks: [] as Array<Record<string, unknown>>,
    timeEntries: [] as Array<Record<string, unknown>>,
    history: [] as Array<Record<string, unknown>>,
  };
  const projects: Array<Record<string, unknown>> = [];
  const notes: Array<Record<string, unknown>> = [];
  const documents: Array<Record<string, unknown>> = [];
  const projectItems = new Map<
    string,
    {
      goals: Array<Record<string, unknown>>;
      milestones: Array<Record<string, unknown>>;
    }
  >();
  const availability: Array<Record<string, unknown>> = [];
  const financeCategories: Array<Record<string, unknown>> = [
    {
      id: "finance-category-1",
      ownerId: profile.id,
      name: "Synthetische Lebensmittel",
      kind: "expense",
      archivedAt: null,
      createdAt: "2032-01-01T00:00:00.000Z",
      updatedAt: "2032-01-01T00:00:00.000Z",
    },
  ];
  const financeTransactions: Array<Record<string, unknown>> = [
    {
      id: "finance-transaction-1",
      ownerId: profile.id,
      categoryId: "finance-category-1",
      kind: "expense",
      bookingDate: today,
      amountMinor: 12_345,
      currencyCode: "EUR",
      note: "Nur synthetisch",
      recurrenceFrequency: null,
      recurrenceInterval: null,
      recurrenceEndDate: null,
      archivedAt: null,
      createdAt: "2032-01-01T00:00:00.000Z",
      updatedAt: "2032-01-01T00:00:00.000Z",
    },
  ];
  const financeBudgets: Array<Record<string, unknown>> = [
    {
      id: "finance-budget-1",
      ownerId: profile.id,
      categoryId: "finance-category-1",
      period: "month",
      periodStart: `${today.slice(0, 7)}-01`,
      amountMinor: 20_000,
      currencyCode: "EUR",
      warningThresholdPercent: 50,
      archivedAt: null,
      createdAt: "2032-01-01T00:00:00.000Z",
      updatedAt: "2032-01-01T00:00:00.000Z",
    },
  ];
  const fitnessExercises: Array<Record<string, unknown>> = [];
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
      for (const value of events) {
        const date = value.isAllDay
          ? stringValue(value.startDate)
          : berlinDate(new Date(stringValue(value.startsAt)));
        if (!inRange(date)) continue;
        items.push({
          id: `calendar:${stringValue(value.uid)}`,
          sourceId: value.uid,
          area: "calendar",
          kind: "fixed_event",
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
          sourceUpdatedAt: value.updatedAt,
        });
      }
      for (const value of study.entries) {
        const date = value.dueDate
          ? stringValue(value.dueDate)
          : berlinDate(new Date(stringValue(value.startsAt)));
        if (!inRange(date)) continue;
        items.push({
          id: `study:${stringValue(value.id)}`,
          sourceId: value.id,
          area: "study",
          kind: value.dueDate
            ? "deadline"
            : value.kind === "learning"
              ? "planned_task"
              : "fixed_event",
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
        archivedAt: null,
        createdAt: "2032-01-01T00:00:00.000Z",
        updatedAt: "2032-01-01T00:00:00.000Z",
      };
      study.entries.push(created);
      await route.fulfill({ status: 201, json: created });
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
      const results = notes
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
          snippet: note.content,
          matchReason: "content",
          detailPath: `/knowledge/notes/${String(note.id)}`,
          ownerId: profile.id,
          searchEnabled: true,
        }));
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
      const created = {
        id: `document-${documents.length + 1}`,
        ownerId: profile.id,
        fileName: url.searchParams.get("fileName"),
        mimeType:
          request.headers()["content-type"] ?? "application/octet-stream",
        byteSize: new TextEncoder().encode(request.postData() ?? "").byteLength,
        sha256: "a".repeat(64),
        modifiedAt: "2032-01-01T00:00:00.000Z",
        searchEnabled: false,
        project: null,
        studyModule: null,
        archivedAt: null,
        createdAt: "2032-01-01T00:00:00.000Z",
        updatedAt: "2032-01-01T00:00:00.000Z",
        contentUrl: `/api/v1/documents/document-${documents.length + 1}/content`,
      };
      documents.push(created);
      await route.fulfill({ status: 201, json: created });
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
    if (path === "/api/v1/finance" && method === "GET") {
      const activeTransactions = financeTransactions.filter(
        (value) => !value.archivedAt,
      );
      const incomeMinor = activeTransactions
        .filter((value) => value.kind === "income")
        .reduce((sum, value) => sum + Number(value.amountMinor), 0);
      const expenseMinor = activeTransactions
        .filter((value) => value.kind === "expense")
        .reduce((sum, value) => sum + Number(value.amountMinor), 0);
      const spentMinor = activeTransactions
        .filter((value) => value.categoryId === "finance-category-1")
        .reduce((sum, value) => sum + Number(value.amountMinor), 0);
      await route.fulfill({
        json: {
          range: {
            from: `${today.slice(0, 4)}-01-01`,
            to: `${today.slice(0, 4)}-12-31`,
          },
          categories: financeCategories,
          transactions: activeTransactions,
          budgets: financeBudgets,
          analytics: {
            incomeMinor,
            expenseMinor,
            balanceMinor: incomeMinor - expenseMinor,
            savingsRateBasisPoints:
              incomeMinor > 0
                ? Math.round(
                    ((incomeMinor - expenseMinor) * 10_000) / incomeMinor,
                  )
                : null,
            months: [
              {
                month: today.slice(0, 7),
                incomeMinor,
                expenseMinor,
                balanceMinor: incomeMinor - expenseMinor,
              },
            ],
            budgetWarnings: [
              {
                budgetId: "finance-budget-1",
                spentMinor,
                limitMinor: 20_000,
                utilizationBasisPoints: Math.round(
                  (spentMinor * 10_000) / 20_000,
                ),
                thresholdReached: spentMinor >= 10_000,
                exceeded: spentMinor > 20_000,
              },
            ],
          },
        },
      });
      return;
    }
    if (path === "/api/v1/finance/transactions" && method === "POST") {
      const payload = request.postDataJSON() as Record<string, unknown>;
      const created = {
        ...payload,
        id: `finance-transaction-${financeTransactions.length + 1}`,
        ownerId: profile.id,
        archivedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      financeTransactions.push(created);
      await route.fulfill({ status: 201, json: created });
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
    await route.fulfill({
      status: 404,
      json: { error: { code: "NOT_FOUND", message: "Nicht gefunden" } },
    });
  });
};

test.beforeEach(async ({ page }) => {
  await installApi(page);
});

test("verwaltet Finanzen lokal, ganzzahlig und ohne Browserpersistenz", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Finanzen", exact: true })
    .filter({ visible: true })
    .click();

  await expect(
    page.getByRole("heading", { name: "Finanzen", exact: true }),
  ).toBeVisible();
  const metrics = page.getByRole("region", { name: "Finanzkennzahlen" });
  await expect(metrics.getByText("123,45 €", { exact: true })).toBeVisible();
  await expect(page.getByText("61,73 % genutzt")).toBeVisible();

  const transactionForm = page
    .getByRole("heading", { name: "Buchung anlegen" })
    .locator("..");
  await transactionForm.getByLabel("Art").selectOption("expense");
  await transactionForm
    .getByLabel("Kategorie")
    .selectOption("finance-category-1");
  await transactionForm.getByLabel("Buchungsdatum").fill(today);
  await transactionForm.getByLabel("Betrag in EUR").fill("10.01");
  await transactionForm
    .getByRole("button", { name: "Buchung anlegen" })
    .click();

  await expect(page.getByRole("status")).toContainText("angelegt");
  const transactionList = page
    .getByRole("heading", { name: "Buchungen im Zeitraum" })
    .locator("..");
  await expect(
    transactionList.getByText("−10,01 €", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] });
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
  await expect(page.getByText("Fokusblock aktualisiert")).toBeVisible();
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
  await expect(
    page.getByRole("heading", { name: "Prüfungen, Abgaben und Lernzeiten" }),
  ).toBeVisible();
  await expect(page.getByText("Synthetische Prüfung")).toBeVisible();
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
  await page.getByLabel("Arbeit").uncheck();
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
