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

const initialEvent = {
  uid: "termin-1",
  title: "Ruhiger Fokusblock",
  description: "Synthetischer Termin",
  location: "Arbeitszimmer",
  isAllDay: false,
  startsAt: "2030-07-22T08:00:00.000Z",
  endsAt: "2030-07-22T09:00:00.000Z",
  startDate: null,
  endDate: null,
  timezone: "Europe/Berlin",
  recurrenceRule: null,
  reminderMinutes: [10],
  etag: '"etag-1"',
  sequence: 0,
  updatedAt: "2026-07-22T08:00:00.000Z",
};

const installApi = async (page: Page) => {
  const events: Array<Record<string, unknown>> = [{ ...initialEvent }];
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
    if (path === "/api/v1/calendars/kalender-1/events" && method === "POST") {
      const payload = request.postDataJSON() as Record<string, unknown>;
      events.push({
        ...initialEvent,
        ...payload,
        uid: "termin-2",
        etag: '"etag-2"',
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
