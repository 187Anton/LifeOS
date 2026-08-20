import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createDatabaseClient } from "@lifeos/database";
import type { FitnessOverviewResponse } from "@lifeos/contracts";
import { config as loadEnvironment } from "dotenv";

import { createApplication } from "../src/application.js";
import type { Logger } from "../src/logger.js";
import { PrismaFitnessRepository } from "../src/modules/fitness/repository.js";
import { createFitnessRouter } from "../src/modules/fitness/router.js";
import { FitnessService } from "../src/modules/fitness/service.js";
import { PrismaProfileRepository } from "../src/modules/profile/repository.js";
import { createProfileRouter } from "../src/modules/profile/router.js";
import { hashPassword } from "../src/modules/profile/security.js";
import {
  AuthenticationService,
  ProfileService,
} from "../src/modules/profile/service.js";

loadEnvironment({
  path: path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../.env",
  ),
  quiet: true,
});
class SilentLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}
const close = (server: Server) =>
  new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );

test("verwaltet eigene Fitnessdaten und verknüpft Kalenderereignisse ohne Seiteneffekt", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalId = `fitness-owner-${suffix}`;
  const otherExternalId = `fitness-other-${suffix}`;
  const password = `synthetisches-fitnesspasswort-${suffix}`;
  const owner = await database.user.create({
    data: {
      externalId,
      displayName: "Synthetische Fitnessperson",
      settings: { create: { timezone: "Europe/Berlin" } },
      credential: { create: { passwordHash: await hashPassword(password) } },
    },
  });
  const calendar = await database.calendar.create({
    data: {
      userId: owner.id,
      externalId: `fitness-calendar-${suffix}`,
      name: "Synthetischer Fitnesskalender",
      timezone: "Europe/Berlin",
      isPrimary: true,
    },
  });
  const event = await database.calendarEvent.create({
    data: {
      userId: owner.id,
      calendarId: calendar.id,
      uid: `fitness-event-${suffix}@lifeos.local`,
      title: "Geplantes synthetisches Training",
      startsAt: new Date("2033-03-02T17:00:00.000Z"),
      endsAt: new Date("2033-03-02T18:00:00.000Z"),
      timezone: "Europe/Berlin",
      etag: '"fitness-before"',
    },
  });
  const other = await database.user.create({
    data: {
      externalId: otherExternalId,
      displayName: "Andere Fitnessperson",
      settings: { create: {} },
      fitnessExercises: { create: { name: "Fremde Übung" } },
    },
    include: { fitnessExercises: true },
  });
  const profileRepository = new PrismaProfileRepository(database, externalId);
  const authentication = new AuthenticationService(profileRepository, 1);
  const application = createApplication({
    logger: new SilentLogger(),
    readinessProbe: { check: async () => undefined },
    webOrigin: "http://127.0.0.1:5173",
    moduleRouters: [
      createProfileRouter({
        authentication,
        profile: new ProfileService(profileRepository),
        secureCookies: false,
      }),
      createFitnessRouter({
        authentication,
        fitness: new FitnessService(
          new PrismaFitnessRepository(database),
          () => new Date("2033-03-05T12:00:00.000Z"),
        ),
      }),
    ],
  });
  const server = createServer(application);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api/v1`;
  t.after(async () => {
    await close(server);
    await database.user.deleteMany({
      where: { externalId: { in: [externalId, otherExternalId] } },
    });
    await database.$disconnect();
  });

  assert.equal((await fetch(`${base}/fitness`)).status, 401);
  const login = await fetch(`${base}/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";", 1)[0] ?? "";
  const headers = { cookie, "content-type": "application/json" };
  const post = async (route: string, body: object) => {
    const response = await fetch(`${base}${route}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 201);
    return (await response.json()) as { id: string };
  };

  const plan = await post("/fitness/plans", {
    name: "Synthetischer Kraftplan",
    notes: "Keine medizinische Bewertung",
  });
  const exercise = await post("/fitness/exercises", {
    name: "Synthetische Kniebeuge",
  });
  assert.equal(
    (
      await fetch(`${base}/fitness/plans/${plan.id}/exercises`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          exerciseId: other.fitnessExercises[0]!.id,
          position: 0,
          targetSets: 3,
        }),
      })
    ).status,
    400,
  );
  await post(`/fitness/plans/${plan.id}/exercises`, {
    exerciseId: exercise.id,
    position: 0,
    targetSets: 3,
    targetRepetitions: 8,
    targetWeightGrams: 60_000,
  });
  const session = await post("/fitness/sessions", {
    planId: plan.id,
    title: "Synthetisches Training",
    status: "completed",
    performedAt: "2033-03-02T17:00:00.000Z",
    timezone: "Europe/Berlin",
    calendarId: calendar.id,
    eventUid: event.uid,
  });
  assert.equal(
    (
      await fetch(`${base}/fitness/sessions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: "Ungültiger Abschluss",
          status: "completed",
        }),
      })
    ).status,
    400,
  );
  await post("/fitness/sets", {
    sessionId: session.id,
    exerciseId: exercise.id,
    setNumber: 1,
    repetitions: 8,
    weightGrams: 60_000,
    completedAt: "2033-03-02T17:15:00.000Z",
  });
  assert.equal(
    (
      await fetch(`${base}/fitness/sets`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          sessionId: session.id,
          exerciseId: exercise.id,
          setNumber: 2,
        }),
      })
    ).status,
    400,
  );
  await post("/fitness/body-weights", {
    measuredDate: "2033-03-01",
    weightGrams: 75_000,
  });
  const bodyWeight = await post("/fitness/body-weights", {
    measuredDate: "2033-03-05",
    weightGrams: 74_500,
    note: "Synthetisch",
  });

  const overviewResponse = await fetch(`${base}/fitness`, {
    headers: { cookie },
  });
  assert.equal(overviewResponse.status, 200);
  const overview = (await overviewResponse.json()) as FitnessOverviewResponse;
  assert.equal(overview.plans.length, 1);
  assert.equal(overview.exercises.length, 1);
  assert.equal(overview.sessions[0]?.calendar?.eventUid, event.uid);
  assert.equal(overview.analytics.completedSessionCount, 1);
  assert.equal(overview.analytics.completedSetCount, 1);
  assert.equal(overview.analytics.volumeGramRepetitions, 480_000);
  assert.equal(overview.analytics.weightChangeGrams, -500);
  assert.equal(overview.analytics.personalBests[0]?.maximumWeightGrams, 60_000);
  const unchangedEvent = await database.calendarEvent.findUniqueOrThrow({
    where: { id: event.id },
  });
  assert.equal(unchangedEvent.etag, '"fitness-before"');
  assert.equal(unchangedEvent.syncVersion, event.syncVersion);

  assert.equal(
    (
      await fetch(
        `${base}/fitness/exercises/${other.fitnessExercises[0]!.id}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({ archived: true }),
        },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await fetch(`${base}/fitness/body-weights/${bodyWeight.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ archived: true }),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(`${base}/fitness/body-weights`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          measuredDate: "2033-03-06",
          weightGrams: 75_000,
          note: "x".repeat(2_001),
        }),
      })
    ).status,
    400,
  );
});
