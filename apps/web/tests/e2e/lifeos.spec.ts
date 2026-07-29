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

const eventStartsAt = new Date().toISOString();
const eventEndsAt = new Date(
  new Date(eventStartsAt).valueOf() + 60 * 60 * 1000,
).toISOString();
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
const today = berlinDate(new Date());
const tomorrow = berlinDate(new Date(Date.now() + 24 * 60 * 60 * 1000));

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
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (path === "/api/v1/profile" && method === "GET") {
      await route.fulfill({ json: profile });
      return;
    }
    if (path === "/api/v1/calendars" && method === "GET") {
      await route.fulfill({ json: [calendar] });
      return;
    }
    if (path === "/api/v1/calendars/kalender-1/events" && method === "GET") {
      await route.fulfill({ json: events });
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
    await route.fulfill({
      status: 404,
      json: { error: { code: "NOT_FOUND", message: "Nicht gefunden" } },
    });
  });
};

test.beforeEach(async ({ page }) => {
  await installApi(page);
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
  await page.getByLabel("Ort").fill("Praxis");
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
  await expect(page.getByText("Unterlagen sortieren")).toBeVisible();

  await page.reload();
  await page
    .getByRole("button", { name: "Aufgaben", exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByText("Unterlagen sortieren")).toBeVisible();

  const filters = page.getByRole("region", { name: "Aufgaben filtern" });
  await filters.getByRole("searchbox").fill("unterlagen");
  await filters.getByLabel("Priorität").selectOption("high");
  await filters.getByLabel("Bereich").selectOption("work");
  await expect(page.getByText("Unterlagen sortieren")).toBeVisible();
  await expect(page.getByText("1 von 2 sichtbar")).toBeVisible();

  const taskCard = page.locator(".task-card").filter({
    hasText: "Unterlagen sortieren",
  });
  await taskCard
    .getByRole("button", { name: "Unterlagen sortieren bearbeiten" })
    .click();
  await editor.getByLabel("Titel").fill("Unterlagen archivieren");
  await editor.getByRole("button", { name: "Änderungen speichern" }).click();
  await expect(page.getByText("Unterlagen archivieren")).toBeVisible();

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
  await expect(page.getByText("Unterlagen archivieren")).toHaveCount(0);
  await filters.getByLabel("Archivierte anzeigen").check();
  await expect(page.getByText("Unterlagen archivieren")).toBeVisible();

  const archivedCard = page.locator(".task-card").filter({
    hasText: "Unterlagen archivieren",
  });
  await archivedCard
    .getByRole("button", { name: "Unterlagen archivieren bearbeiten" })
    .click();
  await editor.getByRole("button", { name: /Löschen/ }).click();
  await editor.getByRole("button", { name: "Endgültig löschen" }).click();
  await expect(page.getByText("Unterlagen archivieren")).toHaveCount(0);

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
