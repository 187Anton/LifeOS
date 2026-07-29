import assert from "node:assert/strict";
import test from "node:test";

import {
  EventLinkTargetNotFoundError,
  TaskEventLinkNotFoundError,
  TaskLinkTargetNotFoundError,
  type TaskEventLinkRepository,
} from "../src/modules/task-event-links/repository.js";
import { TaskEventLinkService } from "../src/modules/task-event-links/service.js";

const link = {
  id: "00000000-0000-4000-8000-000000000010",
  task: {
    id: "00000000-0000-4000-8000-000000000011",
    title: "Aufgabe",
    available: true,
  },
  event: {
    calendarId: "personal",
    uid: "event@lifeos.local",
    title: "Termin",
    available: true,
  },
  createdAt: "2032-01-01T10:00:00.000Z",
};

class FakeRepository implements TaskEventLinkRepository {
  error: Error | null = null;
  links = [link];

  async listLinks() {
    return this.links;
  }

  async createLink() {
    if (this.error) throw this.error;
    return { link, created: true };
  }

  async deleteLink() {
    if (this.error) throw this.error;
  }
}

test("liefert dieselbe Beziehung idempotent ohne Fachdaten zu kopieren", async () => {
  const repository = new FakeRepository();
  const service = new TaskEventLinkService(repository);

  assert.deepEqual(await service.listLinks("owner"), [link]);
  assert.deepEqual(
    await service.createLink("owner", {
      taskId: link.task.id,
      calendarId: link.event.calendarId,
      eventUid: link.event.uid,
    }),
    { link, created: true },
  );
  assert.equal("status" in link, false);
  assert.equal("startsAt" in link, false);
});

test("gibt fremde oder nicht verfügbare Ziele nicht als vorhanden preis", async () => {
  const repository = new FakeRepository();
  const service = new TaskEventLinkService(repository);
  const input = {
    taskId: link.task.id,
    calendarId: link.event.calendarId,
    eventUid: link.event.uid,
  };

  repository.error = new TaskLinkTargetNotFoundError();
  await assert.rejects(
    () => service.createLink("owner", input),
    (error: unknown) =>
      error instanceof Error &&
      "status" in error &&
      error.status === 404 &&
      error.message.includes("Aufgabe"),
  );

  repository.error = new EventLinkTargetNotFoundError();
  await assert.rejects(
    () => service.createLink("owner", input),
    (error: unknown) =>
      error instanceof Error &&
      "status" in error &&
      error.status === 404 &&
      error.message.includes("Termin"),
  );

  repository.error = new TaskEventLinkNotFoundError();
  await assert.rejects(
    () => service.deleteLink("owner", link.id),
    (error: unknown) =>
      error instanceof Error &&
      "status" in error &&
      error.status === 404 &&
      error.message.includes("Verknüpfung"),
  );
});
