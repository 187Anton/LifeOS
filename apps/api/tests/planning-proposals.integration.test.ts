import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createDatabaseClient } from "@lifeos/database";
import type {
  ConfirmPlanningProposalGroupResponse,
  PlanningAutomationOverviewResponse,
  PlanningAutomationRunResponse,
  PlanningProposalGenerationResponse,
  PlanningProposalResponse,
} from "@lifeos/contracts";
import { config as loadEnvironment } from "dotenv";

import { createApplication } from "../src/application.js";
import type { Logger } from "../src/logger.js";
import { PrismaPlanningProposalRepository } from "../src/modules/planning/proposal-repository.js";
import {
  PlanningAutomationService,
  PlanningProposalService,
} from "../src/modules/planning/proposal-service.js";
import { PrismaPlanningRepository } from "../src/modules/planning/repository.js";
import { createPlanningRouter } from "../src/modules/planning/router.js";
import { PlanningService } from "../src/modules/planning/service.js";
import { PrismaProfileRepository } from "../src/modules/profile/repository.js";
import { createProfileRouter } from "../src/modules/profile/router.js";
import { hashPassword } from "../src/modules/profile/security.js";
import {
  AuthenticationService,
  ProfileService,
} from "../src/modules/profile/service.js";
import { PrismaTaskRepository } from "../src/modules/tasks/repository.js";
import { TaskService } from "../src/modules/tasks/service.js";

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

test("erzeugt, prüft und bestätigt lokale Vorschläge und Automationen ohne Duplikate", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalId = `proposal-owner-${suffix}`;
  const otherExternalId = `proposal-other-${suffix}`;
  const password = `synthetisches-vorschlagspasswort-${suffix}`;
  const owner = await database.user.create({
    data: {
      externalId,
      displayName: "Synthetische Vorschlagsperson",
      settings: { create: { timezone: "Europe/Berlin" } },
      credential: { create: { passwordHash: await hashPassword(password) } },
    },
  });
  const other = await database.user.create({
    data: {
      externalId: otherExternalId,
      displayName: "Andere synthetische Person",
      settings: { create: { timezone: "Europe/Berlin" } },
    },
  });
  const calendar = await database.calendar.create({
    data: {
      userId: owner.id,
      externalId: `proposal-calendar-${suffix}`,
      name: "Synthetischer Planungskalender",
      timezone: "Europe/Berlin",
    },
  });
  const recurringEvent = await database.calendarEvent.create({
    data: {
      userId: owner.id,
      calendarId: calendar.id,
      uid: `proposal-recurring-${suffix}@lifeos.local`,
      title: "Synthetischer Serientermin",
      startsAt: new Date("2032-06-07T07:00:00.000Z"),
      endsAt: new Date("2032-06-07T08:00:00.000Z"),
      timezone: "Europe/Berlin",
      recurrenceRule: "FREQ=WEEKLY;COUNT=2",
      etag: '"proposal-v1"',
    },
  });
  await database.calendarEvent.create({
    data: {
      userId: owner.id,
      calendarId: calendar.id,
      uid: `proposal-allday-${suffix}@lifeos.local`,
      title: "Synthetischer Ganztagstermin",
      isAllDay: true,
      startDate: new Date("2032-06-15T00:00:00.000Z"),
      endDate: new Date("2032-06-16T00:00:00.000Z"),
      timezone: "Europe/Berlin",
      etag: '"proposal-all-day"',
    },
  });
  const project = await database.project.create({
    data: {
      userId: owner.id,
      title: "Synthetisches Projekt",
      status: "active",
      dueDate: new Date("2032-06-17T00:00:00.000Z"),
    },
  });
  await database.projectMilestone.create({
    data: {
      userId: owner.id,
      projectId: project.id,
      title: "Synthetischer Meilenstein",
      status: "in_progress",
      dueDate: new Date("2032-06-16T00:00:00.000Z"),
    },
  });
  await database.projectGoal.create({
    data: {
      userId: owner.id,
      projectId: project.id,
      title: "Bereits abgeschlossenes synthetisches Ziel",
      status: "completed",
      dueDate: new Date("2032-06-12T00:00:00.000Z"),
    },
  });
  const urgentTask = await database.task.create({
    data: {
      userId: owner.id,
      projectId: project.id,
      title: "Synthetische Prüfungsaufgabe",
      priority: "critical",
      dueDate: new Date("2032-06-14T00:00:00.000Z"),
      estimatedDurationMinutes: 60,
      area: "study",
    },
  });
  const workTask = await database.task.create({
    data: {
      userId: owner.id,
      title: "Synthetische Praxisaufgabe",
      priority: "high",
      dueDate: new Date("2032-06-15T00:00:00.000Z"),
      estimatedDurationMinutes: 120,
      area: "work",
    },
  });
  await database.task.create({
    data: {
      userId: owner.id,
      title: "Aufgabe ohne Aufwand",
      priority: "medium",
      dueDate: new Date("2032-06-14T00:00:00.000Z"),
    },
  });
  await database.task.create({
    data: {
      userId: other.id,
      title: "Fremde Aufgabe",
      priority: "critical",
      dueDate: new Date("2032-06-14T00:00:00.000Z"),
      estimatedDurationMinutes: 30,
    },
  });
  const program = await database.studyProgram.create({
    data: {
      userId: owner.id,
      title: "Synthetisches Studium",
      institution: "Lokale Testeinrichtung",
      periodLabel: "Testabschnitt",
      status: "active",
    },
  });
  const module = await database.studyModule.create({
    data: {
      userId: owner.id,
      programId: program.id,
      title: "Testmodul",
      status: "active",
    },
  });
  await database.studyEntry.create({
    data: {
      userId: owner.id,
      moduleId: module.id,
      taskId: urgentTask.id,
      kind: "exam",
      title: "Synthetische Prüfung",
      dueDate: new Date("2032-06-14T00:00:00.000Z"),
    },
  });
  await database.studyEntry.create({
    data: {
      userId: owner.id,
      moduleId: module.id,
      taskId: urgentTask.id,
      kind: "exam",
      title: "Bereits abgeschlossene synthetische Prüfung",
      status: "completed",
      dueDate: new Date("2032-06-12T00:00:00.000Z"),
    },
  });
  const workContext = await database.workContext.create({
    data: {
      userId: owner.id,
      title: "Synthetische Praxis",
      role: "Praxisrolle",
      timezone: "Europe/Berlin",
      status: "active",
    },
  });
  const workProject = await database.workProject.create({
    data: {
      userId: owner.id,
      contextId: workContext.id,
      title: "Synthetischer Arbeitsauftrag",
      status: "active",
      deadlineDate: new Date("2032-06-15T00:00:00.000Z"),
    },
  });
  await database.workTaskLink.create({
    data: {
      userId: owner.id,
      contextId: workContext.id,
      projectId: workProject.id,
      taskId: workTask.id,
    },
  });
  await database.workTimeEntry.create({
    data: {
      userId: owner.id,
      contextId: workContext.id,
      kind: "planned",
      title: "Synthetischer Praxisblock",
      startsAt: new Date("2032-06-14T09:00:00.000Z"),
      endsAt: new Date("2032-06-14T10:00:00.000Z"),
      timezone: "Europe/Berlin",
    },
  });
  const fitnessPlan = await database.fitnessPlan.create({
    data: { userId: owner.id, name: "Synthetischer Fitnessplan" },
  });
  await database.fitnessSession.create({
    data: {
      userId: owner.id,
      planId: fitnessPlan.id,
      title: "Synthetisches Training ohne Dauer",
      status: "planned",
      calendarEventId: recurringEvent.id,
    },
  });
  await database.availabilityWindow.create({
    data: {
      userId: owner.id,
      weekday: 1,
      startMinute: 9 * 60,
      endMinute: 17 * 60,
      timezone: "Europe/Berlin",
      label: "Synthetische Montagsverfügbarkeit",
    },
  });
  await database.availabilityWindow.create({
    data: {
      userId: owner.id,
      weekday: 2,
      startMinute: 9 * 60,
      endMinute: 17 * 60,
      timezone: "Europe/Berlin",
    },
  });

  const fixedNow = () => new Date("2032-06-13T10:00:00.000Z");
  const planningRepository = new PrismaPlanningRepository(database);
  const proposalRepository = new PrismaPlanningProposalRepository(database);
  const taskService = new TaskService(
    new PrismaTaskRepository(database),
    fixedNow,
  );
  const proposals = new PlanningProposalService(
    planningRepository,
    proposalRepository,
    taskService,
    fixedNow,
  );
  const automations = new PlanningAutomationService(
    proposalRepository,
    proposals,
    planningRepository,
    fixedNow,
  );
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
      createPlanningRouter({
        authentication,
        planning: new PlanningService(planningRepository, fixedNow),
        proposals,
        automations,
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

  const login = await fetch(`${base}/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";", 1)[0] ?? "";
  const headers = { cookie, "content-type": "application/json" };
  const generationRequest = {
    method: "POST",
    headers,
    body: JSON.stringify({
      view: "week",
      from: "2032-06-14",
      to: "2032-06-20",
      maxSuggestions: 10,
    }),
  };
  const projectedPlanning = await (
    await fetch(`${base}/planning?from=2032-06-14&to=2032-06-20`, {
      headers: { cookie },
    })
  ).json();
  assert.ok(
    projectedPlanning.items.some(
      (item: { area: string; date: string; title: string }) =>
        item.area === "calendar" &&
        item.date === "2032-06-14" &&
        item.title === "Synthetischer Serientermin",
    ),
  );
  assert.ok(
    projectedPlanning.items.some(
      (item: { area: string; date: string; title: string }) =>
        item.area === "calendar" &&
        item.date === "2032-06-15" &&
        item.title === "Synthetischer Ganztagstermin",
    ),
  );
  assert.ok(
    projectedPlanning.items.some(
      (item: { area: string; title: string }) =>
        item.area === "projects" && item.title === "Synthetisches Projekt",
    ),
  );
  const firstResponse = await fetch(
    `${base}/planning/proposals`,
    generationRequest,
  );
  assert.equal(firstResponse.status, 201);
  const first =
    (await firstResponse.json()) as PlanningProposalGenerationResponse;
  assert.equal(first.externalAiUsed, false);
  assert.equal(first.proposals.length, 2);
  assert.ok(first.issues.some((issue) => issue.code === "missing_task_effort"));
  assert.ok(first.proposals[0]?.reasonCodes.includes("due:2032-06-14"));
  assert.equal(first.proposals[0]?.action.startsAt, "2032-06-14T08:00:00.000Z");
  assert.equal(
    first.proposals[0]?.sources.some(
      (source) => source.type === "calendar_event",
    ),
    true,
  );
  assert.equal(
    first.proposals[0]?.sources.some((source) => source.type === "study_entry"),
    true,
  );
  assert.equal(
    first.proposals[0]?.sources.some(
      (source) => source.type === "fitness_session",
    ),
    true,
  );
  assert.equal(
    first.proposals[1]?.sources.some(
      (source) => source.type === "work_project",
    ),
    true,
  );
  assert.ok(first.proposals.every((proposal) => proposal.requiresConfirmation));
  assert.ok(
    first.proposals.every(
      (proposal) => !proposal.action.startsAt.startsWith("2032-06-15"),
    ),
  );

  const second = (await (
    await fetch(`${base}/planning/proposals`, generationRequest)
  ).json()) as PlanningProposalGenerationResponse;
  assert.deepEqual(
    second.proposals.map((proposal) => proposal.id),
    first.proposals.map((proposal) => proposal.id),
  );
  assert.equal(
    await database.planningProposal.count({
      where: { userId: owner.id, status: "pending" },
    }),
    2,
  );

  const foreignProposal = await database.planningProposal.create({
    data: {
      userId: other.id,
      fingerprint: "a".repeat(64),
      view: "day",
      rangeFrom: new Date("2032-06-14T00:00:00.000Z"),
      rangeTo: new Date("2032-06-14T00:00:00.000Z"),
      targetType: "task",
      targetId: urgentTask.id,
      actionType: "schedule_task",
      proposedStartsAt: new Date("2032-06-14T08:00:00.000Z"),
      proposedEndsAt: new Date("2032-06-14T09:00:00.000Z"),
      timezone: "Europe/Berlin",
      sourceReferences: [],
      reasonCodes: [],
      uncertaintyCodes: [],
    },
  });
  assert.equal(
    (
      await fetch(`${base}/planning/proposals/${foreignProposal.id}/confirm`, {
        method: "POST",
        headers,
      })
    ).status,
    404,
  );

  const rejectedId = first.proposals[1]!.id;
  const rejected = (await (
    await fetch(`${base}/planning/proposals/${rejectedId}/reject`, {
      method: "POST",
      headers,
    })
  ).json()) as PlanningProposalResponse;
  assert.equal(rejected.status, "rejected");
  const reopened = (await (
    await fetch(`${base}/planning/proposals/${rejectedId}/reopen`, {
      method: "POST",
      headers,
    })
  ).json()) as PlanningProposalResponse;
  assert.equal(reopened.status, "pending");

  await database.calendarEvent.update({
    where: { id: recurringEvent.id },
    data: { etag: '"proposal-v2"' },
  });
  const staleConfirm = await fetch(
    `${base}/planning/proposals/${first.proposals[0]!.id}/confirm`,
    { method: "POST", headers },
  );
  assert.equal(staleConfirm.status, 412);
  assert.equal(
    (await database.task.findUniqueOrThrow({ where: { id: urgentTask.id } }))
      .scheduledStartAt,
    null,
  );

  const refreshed = (await (
    await fetch(`${base}/planning/proposals`, generationRequest)
  ).json()) as PlanningProposalGenerationResponse;
  assert.equal(refreshed.proposals.length, 2);
  const group = (await (
    await fetch(`${base}/planning/proposals/confirm`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        proposalIds: refreshed.proposals.map((proposal) => proposal.id),
      }),
    })
  ).json()) as ConfirmPlanningProposalGroupResponse;
  assert.ok(group.results.every((result) => result.status === "applied"));
  assert.ok(
    (await database.task.findUniqueOrThrow({ where: { id: urgentTask.id } }))
      .scheduledStartAt,
  );
  assert.ok(
    (await database.task.findUniqueOrThrow({ where: { id: workTask.id } }))
      .scheduledStartAt,
  );

  assert.equal(
    (
      await fetch(`${base}/planning/automations/weekly_preview`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          enabled: true,
          localMinute: 18 * 60,
          weekday: null,
          timezone: "Europe/Berlin",
          maxSuggestions: 10,
        }),
      })
    ).status,
    400,
  );
  const automationUpdate = await fetch(
    `${base}/planning/automations/daily_preview`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        enabled: true,
        localMinute: 18 * 60,
        timezone: "Europe/Berlin",
        maxSuggestions: 10,
      }),
    },
  );
  assert.equal(automationUpdate.status, 200);
  const overview = (await (
    await fetch(`${base}/planning/automations`, { headers: { cookie } })
  ).json()) as PlanningAutomationOverviewResponse;
  const daily = overview.automations.find(
    (automation) => automation.kind === "daily_preview",
  )!;
  assert.equal(daily.enabled, true);
  assert.equal(overview.externalNetwork, "disabled");
  const firstRun = (await (
    await fetch(`${base}/planning/automations/${daily.id}/run`, {
      method: "POST",
      headers,
    })
  ).json()) as PlanningAutomationRunResponse;
  const repeatedRun = (await (
    await fetch(`${base}/planning/automations/${daily.id}/run`, {
      method: "POST",
      headers,
    })
  ).json()) as PlanningAutomationRunResponse;
  assert.equal(firstRun.status, "no_data");
  assert.equal(firstRun.proposalCount, 0);
  assert.equal(repeatedRun.id, firstRun.id);
  await fetch(`${base}/planning/automations/daily_preview`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      enabled: false,
      localMinute: 18 * 60,
      timezone: "Europe/Berlin",
      maxSuggestions: 10,
    }),
  });
  assert.equal(
    (
      await fetch(`${base}/planning/automations/${daily.id}/run`, {
        method: "POST",
        headers,
      })
    ).status,
    409,
  );
  const storedText = JSON.stringify(
    await database.planningProposal.findMany({ where: { userId: owner.id } }),
  );
  assert.equal(storedText.includes("Synthetische Prüfungsaufgabe"), false);
  assert.equal(storedText.includes("Synthetischer Serientermin"), false);
});

test("meldet bei fehlender Verfügbarkeit ausdrücklich unzureichende Daten", async () => {
  const source = {
    settings: null,
    events: [],
    tasks: [],
    studyEntries: [],
    workProjects: [],
    workTaskLinks: [],
    workTimeEntries: [],
    projects: [],
    projectGoals: [],
    projectMilestones: [],
    fitnessSessions: [],
    availabilityWindows: [],
  };
  const stored: unknown[] = [];
  const service = new PlanningProposalService(
    {
      getSources: async () => source as never,
      createAvailability: async () => {
        throw new Error("nicht verwendet");
      },
      updateAvailability: async () => {
        throw new Error("nicht verwendet");
      },
      deleteAvailability: async () => undefined,
    },
    {
      storeGenerated: async (
        _userId: string,
        _view: string,
        _from: string,
        _to: string,
        candidates: unknown[],
      ) => {
        stored.push(...candidates);
        return [];
      },
    } as unknown as PrismaPlanningProposalRepository,
    {} as TaskService,
    () => new Date("2032-06-13T10:00:00.000Z"),
  );
  const response = await service.generate("owner", {
    view: "day",
    from: "2032-06-14",
    to: "2032-06-14",
  });
  assert.equal(response.status, "insufficient_data");
  assert.deepEqual(response.proposals, []);
  assert.ok(response.issues.some((issue) => issue.code === "no_availability"));
  assert.deepEqual(stored, []);
});
