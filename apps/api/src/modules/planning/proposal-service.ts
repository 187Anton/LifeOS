import { createHash } from "node:crypto";

import type {
  PlanningAutomationKind,
  PlanningAutomationOverviewResponse,
  PlanningAutomationResponse,
  PlanningAutomationRunResponse,
  PlanningExplanationResponse,
  PlanningProposalGenerationResponse,
  PlanningProposalResponse,
  PlanningProposalView,
  PlanningSourceReferenceResponse,
  PlanningSourceType,
  UpdatePlanningAutomationRequest,
} from "@lifeos/contracts";
import type { PlanningProposalModel } from "@lifeos/database";

import { ApiError } from "../../errors.js";
import type { TaskService } from "../tasks/service.js";
import type { PlanningRepository, PlanningSourceData } from "./repository.js";
import { expandCalendarEvents } from "./recurrence.js";
import {
  PlanningAutomationDisabledError,
  PlanningAutomationNotFoundError,
  PlanningProposalNotFoundError,
  PlanningProposalStateError,
  type AutomationWithLastRun,
  type PlanningProposalCandidate,
  type PrismaPlanningProposalRepository,
  type StoredPlanningSourceReference,
} from "./proposal-repository.js";
import {
  addDays,
  dateInTimezone,
  eachDate,
  weekday,
  zonedDateTime,
} from "./time.js";

const MAX_SUGGESTIONS = 20;
const MAX_TASK_EFFORT_MINUTES = 480;
const activeTask = (status: string) =>
  status !== "done" && status !== "cancelled";
const day = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
const array = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
const storedSources = (value: unknown): StoredPlanningSourceReference[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is StoredPlanningSourceReference => {
        if (!entry || typeof entry !== "object") return false;
        const source = entry as Record<string, unknown>;
        return (
          typeof source.type === "string" &&
          typeof source.id === "string" &&
          typeof source.role === "string"
        );
      })
    : [];

interface TimeBlock {
  type: PlanningSourceType;
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  updatedAt: string | null;
  etag: string | null;
}

interface FreeSlot {
  date: string;
  availabilityId: string;
  availabilityTitle: string;
  availabilityUpdatedAt: string;
  startsAt: Date;
  endsAt: Date;
}

interface LiveSource {
  type: PlanningSourceType;
  id: string;
  title: string;
  updatedAt: string | null;
  etag: string | null;
}

const sourceKey = (type: PlanningSourceType, id: string) => `${type}:${id}`;
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const overlap = (
  first: { startsAt: Date; endsAt: Date },
  second: { startsAt: Date; endsAt: Date },
) => first.startsAt < second.endsAt && second.startsAt < first.endsAt;

const explanationMessages: Record<string, string> = {
  missing_settings:
    "Die persönliche Zeitzone fehlt. Deshalb wird kein Zeitfenster angenommen.",
  no_availability:
    "Für den Zeitraum ist keine persönliche Verfügbarkeit hinterlegt. Deshalb wird kein Zeitfenster erfunden.",
  missing_task_effort:
    "Offene Aufgaben ohne geschätzten Aufwand wurden nicht minutengenau eingeplant.",
  missing_task_deadline:
    "Offene Aufgaben ohne Fälligkeit wurden nicht scheinpräzise priorisiert.",
  capacity_exceeded:
    "Die bekannten Aufgaben passen nicht vollständig in die freien Zeitfenster.",
  source_limit:
    "Mindestens eine Quelle überschreitet das sichere Limit von 500 aktiven Einträgen.",
  unsupported_recurrence:
    "Mindestens eine Terminserie verwendet eine für die lokale Planung nicht unterstützte Regel.",
  recurrence_limit:
    "Eine Terminserie überschreitet das begrenzte Auswertungslimit.",
  fitness_duration_missing:
    "Eine geplante Trainingseinheit hat keine belastbare Dauer und blockiert deshalb kein erfundenes Zeitfenster.",
  effort_limit:
    "Aufgaben mit mehr als 480 Minuten Aufwand werden nicht als scheinbar zusammenhängender Block vorgeschlagen.",
  deadline_outside_view:
    "Die Frist liegt außerhalb der sichtbaren Planung; der Vorschlag nutzt sie nur als Priorisierungskontext.",
};

const reasonText = (codes: string[], dueDate: string, priority: string) => {
  const reasons = [`Priorität ${priority}`, `Fälligkeit ${dueDate}`];
  if (codes.includes("hard_study_deadline")) reasons.push("harte Studienfrist");
  if (codes.includes("hard_work_deadline")) reasons.push("harte Praxisfrist");
  if (codes.includes("project_deadline"))
    reasons.push("Projekt- oder Meilensteinbezug");
  return `${reasons.join(", ")}. Das Zeitfenster liegt innerhalb deiner gespeicherten Verfügbarkeit und kollidiert mit keinem bekannten Termin.`;
};

const sourceIndex = (source: PlanningSourceData): Map<string, LiveSource> => {
  const values: LiveSource[] = [
    ...(source.settings
      ? [
          {
            type: "settings" as const,
            id: source.settings.userId,
            title: "Persönliche Einstellungen",
            updatedAt: source.settings.updatedAt.toISOString(),
            etag: null,
          },
        ]
      : []),
    ...source.tasks.map((value) => ({
      type: "task" as const,
      id: value.id,
      title: value.title,
      updatedAt: value.updatedAt.toISOString(),
      etag: null,
    })),
    ...source.events.map((value) => ({
      type: "calendar_event" as const,
      id: value.id,
      title: value.title,
      updatedAt: value.updatedAt.toISOString(),
      etag: value.etag,
    })),
    ...source.studyEntries.map((value) => ({
      type: "study_entry" as const,
      id: value.id,
      title: value.title,
      updatedAt: value.updatedAt.toISOString(),
      etag: null,
    })),
    ...source.workProjects.map((value) => ({
      type: "work_project" as const,
      id: value.id,
      title: value.title,
      updatedAt: value.updatedAt.toISOString(),
      etag: null,
    })),
    ...source.workTimeEntries.map((value) => ({
      type: "work_time" as const,
      id: value.id,
      title: value.title,
      updatedAt: value.updatedAt.toISOString(),
      etag: null,
    })),
    ...(source.projects ?? []).map((value) => ({
      type: "project" as const,
      id: value.id,
      title: value.title,
      updatedAt: value.updatedAt.toISOString(),
      etag: null,
    })),
    ...(source.projectGoals ?? []).map((value) => ({
      type: "project_goal" as const,
      id: value.id,
      title: value.title,
      updatedAt: value.updatedAt.toISOString(),
      etag: null,
    })),
    ...(source.projectMilestones ?? []).map((value) => ({
      type: "project_milestone" as const,
      id: value.id,
      title: value.title,
      updatedAt: value.updatedAt.toISOString(),
      etag: null,
    })),
    ...(source.fitnessSessions ?? []).map((value) => ({
      type: "fitness_session" as const,
      id: value.id,
      title: value.title,
      updatedAt: value.updatedAt.toISOString(),
      etag: null,
    })),
    ...source.availabilityWindows.map((value) => ({
      type: "availability" as const,
      id: value.id,
      title: value.label ?? "Persönliche Verfügbarkeit",
      updatedAt: value.updatedAt.toISOString(),
      etag: null,
    })),
  ];
  return new Map(
    values.map((value) => [sourceKey(value.type, value.id), value]),
  );
};

const blocksFor = (
  source: PlanningSourceData,
  from: string,
  to: string,
  timezone: string,
) => {
  const expansion = expandCalendarEvents(source.events, from, to, timezone);
  const allDayDates = new Set<string>();
  const blocks: TimeBlock[] = [];
  for (const occurrence of expansion.occurrences) {
    if (occurrence.startDate && occurrence.endDate) {
      let scanned = 0;
      for (
        let date = occurrence.startDate < from ? from : occurrence.startDate;
        date < occurrence.endDate && date <= to && scanned < 64;
        date = addDays(date, 1)
      ) {
        allDayDates.add(date);
        scanned += 1;
      }
    } else if (occurrence.startsAt && occurrence.endsAt) {
      blocks.push({
        type: "calendar_event",
        id: occurrence.event.id,
        title: occurrence.event.title,
        startsAt: occurrence.startsAt,
        endsAt: occurrence.endsAt,
        updatedAt: occurrence.event.updatedAt.toISOString(),
        etag: occurrence.event.etag,
      });
    }
  }
  for (const entry of source.studyEntries) {
    if (!entry.startsAt || !entry.endsAt) continue;
    blocks.push({
      type: "study_entry",
      id: entry.id,
      title: entry.title,
      startsAt: entry.startsAt,
      endsAt: entry.endsAt,
      updatedAt: entry.updatedAt.toISOString(),
      etag: null,
    });
  }
  for (const entry of source.workTimeEntries.filter(
    (value) => value.kind === "planned",
  )) {
    blocks.push({
      type: "work_time",
      id: entry.id,
      title: entry.title,
      startsAt: entry.startsAt,
      endsAt: entry.endsAt,
      updatedAt: entry.updatedAt.toISOString(),
      etag: null,
    });
  }
  for (const task of source.tasks) {
    if (
      !activeTask(task.status) ||
      !task.scheduledStartAt ||
      !task.estimatedDurationMinutes
    )
      continue;
    blocks.push({
      type: "task",
      id: task.id,
      title: task.title,
      startsAt: task.scheduledStartAt,
      endsAt: new Date(
        task.scheduledStartAt.getTime() +
          task.estimatedDurationMinutes * 60_000,
      ),
      updatedAt: task.updatedAt.toISOString(),
      etag: null,
    });
  }
  return { blocks, allDayDates, recurrenceIssueCodes: expansion.issueCodes };
};

const freeSlots = (
  source: PlanningSourceData,
  from: string,
  to: string,
  blocks: TimeBlock[],
  allDayDates: Set<string>,
) => {
  const result: FreeSlot[] = [];
  for (const date of eachDate(from, to)) {
    if (allDayDates.has(date)) continue;
    for (const window of source.availabilityWindows.filter(
      (value) => value.weekday === weekday(date),
    )) {
      let fragments = [
        {
          startsAt: zonedDateTime(date, window.startMinute, window.timezone),
          endsAt: zonedDateTime(date, window.endMinute, window.timezone),
        },
      ];
      for (const block of blocks) {
        fragments = fragments.flatMap((fragment) => {
          if (!overlap(fragment, block)) return [fragment];
          const remaining: Array<{ startsAt: Date; endsAt: Date }> = [];
          if (fragment.startsAt < block.startsAt)
            remaining.push({
              startsAt: fragment.startsAt,
              endsAt: block.startsAt,
            });
          if (block.endsAt < fragment.endsAt)
            remaining.push({ startsAt: block.endsAt, endsAt: fragment.endsAt });
          return remaining;
        });
      }
      result.push(
        ...fragments
          .filter((fragment) => fragment.endsAt > fragment.startsAt)
          .map((fragment) => ({
            date,
            availabilityId: window.id,
            availabilityTitle: window.label ?? "Persönliche Verfügbarkeit",
            availabilityUpdatedAt: window.updatedAt.toISOString(),
            ...fragment,
          })),
      );
    }
  }
  return result.sort(
    (left, right) => left.startsAt.getTime() - right.startsAt.getTime(),
  );
};

export class PlanningProposalService {
  constructor(
    private readonly sources: PlanningRepository,
    private readonly repository: PrismaPlanningProposalRepository,
    private readonly tasks: TaskService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async generate(
    userId: string,
    input: {
      view: PlanningProposalView;
      from: string;
      to: string;
      maxSuggestions?: number;
    },
  ): Promise<PlanningProposalGenerationResponse> {
    this.assertRange(input.view, input.from, input.to);
    const maxSuggestions = Math.min(
      input.maxSuggestions ?? 10,
      MAX_SUGGESTIONS,
    );
    const source = await this.sources.getSources(userId);
    const timezone = source.settings?.timezone ?? "Europe/Berlin";
    const issues: PlanningExplanationResponse[] = [];
    const addIssue = (code: string, sourceIds: string[] = []) => {
      if (!issues.some((issue) => issue.code === code))
        issues.push({
          code,
          message: explanationMessages[code] ?? code,
          sourceIds: sourceIds.slice(0, 20),
        });
    };
    if (!source.settings) addIssue("missing_settings");
    if (source.sourceLimitsExceeded?.length) addIssue("source_limit");
    if (!source.availabilityWindows.length) addIssue("no_availability");
    const missingEffort = source.tasks.filter(
      (task) =>
        activeTask(task.status) &&
        !task.scheduledStartAt &&
        !task.estimatedDurationMinutes,
    );
    const missingDeadline = source.tasks.filter(
      (task) =>
        activeTask(task.status) && !task.scheduledStartAt && !task.dueDate,
    );
    const excessiveEffort = source.tasks.filter(
      (task) =>
        activeTask(task.status) &&
        !task.scheduledStartAt &&
        Boolean(task.estimatedDurationMinutes) &&
        task.estimatedDurationMinutes! > MAX_TASK_EFFORT_MINUTES,
    );
    if (missingEffort.length)
      addIssue(
        "missing_task_effort",
        missingEffort.map((task) => task.id),
      );
    if (missingDeadline.length)
      addIssue(
        "missing_task_deadline",
        missingDeadline.map((task) => task.id),
      );
    if (excessiveEffort.length)
      addIssue(
        "effort_limit",
        excessiveEffort.map((task) => task.id),
      );
    if (
      (source.fitnessSessions ?? []).some(
        (session) => session.performedAt && !session.calendarEventId,
      )
    )
      addIssue("fitness_duration_missing");

    const { blocks, allDayDates, recurrenceIssueCodes } = blocksFor(
      source,
      input.from,
      input.to,
      timezone,
    );
    for (const code of recurrenceIssueCodes) addIssue(code);
    if (
      !source.settings ||
      source.sourceLimitsExceeded?.length ||
      !source.availabilityWindows.length ||
      recurrenceIssueCodes.length
    ) {
      await this.repository.storeGenerated(
        userId,
        input.view,
        input.from,
        input.to,
        [],
      );
      return {
        generatedAt: this.now().toISOString(),
        timezone,
        range: { from: input.from, to: input.to },
        status: "insufficient_data",
        proposals: [],
        issues,
        externalAiUsed: false,
      };
    }

    const slots = freeSlots(source, input.from, input.to, blocks, allDayDates);
    const eligible = source.tasks
      .filter(
        (task) =>
          activeTask(task.status) &&
          !task.scheduledStartAt &&
          Boolean(task.dueDate) &&
          Boolean(task.estimatedDurationMinutes) &&
          task.estimatedDurationMinutes! <= MAX_TASK_EFFORT_MINUTES,
      )
      .map((task) => {
        const taskDue = day(task.dueDate)!;
        const deadlineSources: StoredPlanningSourceReference[] = [];
        const deadlineCandidates: Array<{
          date: string;
          code: string;
          type: PlanningSourceType;
          id: string;
          updatedAt: string;
        }> = [];
        for (const entry of source.studyEntries.filter(
          (value) =>
            value.taskId === task.id &&
            value.dueDate &&
            ["exam", "submission"].includes(value.kind),
        )) {
          deadlineCandidates.push({
            date: day(entry.dueDate)!,
            code: "hard_study_deadline",
            type: "study_entry",
            id: entry.id,
            updatedAt: entry.updatedAt.toISOString(),
          });
        }
        const workProjectIds = new Set(
          (source.workTaskLinks ?? [])
            .filter((link) => link.taskId === task.id && link.projectId)
            .map((link) => link.projectId!),
        );
        for (const project of source.workProjects.filter(
          (value) => workProjectIds.has(value.id) && value.deadlineDate,
        )) {
          deadlineCandidates.push({
            date: day(project.deadlineDate)!,
            code: "hard_work_deadline",
            type: "work_project",
            id: project.id,
            updatedAt: project.updatedAt.toISOString(),
          });
        }
        if (task.projectId) {
          const projectValues = [
            ...(source.projects ?? [])
              .filter((value) => value.id === task.projectId && value.dueDate)
              .map((value) => ({ ...value, type: "project" as const })),
            ...(source.projectGoals ?? [])
              .filter(
                (value) => value.projectId === task.projectId && value.dueDate,
              )
              .map((value) => ({ ...value, type: "project_goal" as const })),
            ...(source.projectMilestones ?? [])
              .filter(
                (value) => value.projectId === task.projectId && value.dueDate,
              )
              .map((value) => ({
                ...value,
                type: "project_milestone" as const,
              })),
          ];
          for (const value of projectValues)
            deadlineCandidates.push({
              date: day(value.dueDate)!,
              code: "project_deadline",
              type: value.type,
              id: value.id,
              updatedAt: value.updatedAt.toISOString(),
            });
        }
        deadlineCandidates.sort((left, right) =>
          left.date.localeCompare(right.date),
        );
        const effective =
          deadlineCandidates[0]?.date && deadlineCandidates[0].date <= taskDue
            ? deadlineCandidates[0]
            : null;
        if (effective)
          deadlineSources.push({
            type: effective.type,
            id: effective.id,
            role: "deadline",
            updatedAt: effective.updatedAt,
            etag: null,
          });
        const dueDate = effective?.date ?? taskDue;
        const reasonCodes = [
          `priority:${task.priority}`,
          `due:${dueDate}`,
          ...(effective ? [effective.code] : []),
        ];
        const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 }[
          task.priority
        ];
        return { task, dueDate, reasonCodes, deadlineSources, priorityRank };
      })
      .sort(
        (left, right) =>
          left.dueDate.localeCompare(right.dueDate) ||
          left.priorityRank - right.priorityRank ||
          right.task.estimatedDurationMinutes! -
            left.task.estimatedDurationMinutes! ||
          left.task.id.localeCompare(right.task.id),
      );

    const candidates: PlanningProposalCandidate[] = [];
    for (const value of eligible) {
      if (candidates.length >= maxSuggestions) break;
      const duration = value.task.estimatedDurationMinutes!;
      const slotIndex = slots.findIndex(
        (slot) =>
          slot.date <= value.dueDate &&
          slot.endsAt.getTime() - slot.startsAt.getTime() >= duration * 60_000,
      );
      if (slotIndex < 0) continue;
      const slot = slots[slotIndex]!;
      const startsAt = slot.startsAt;
      const endsAt = new Date(startsAt.getTime() + duration * 60_000);
      slots[slotIndex] = { ...slot, startsAt: endsAt };
      const relevantBlocks = blocks
        .filter(
          (block) => dateInTimezone(block.startsAt, timezone) === slot.date,
        )
        .slice(0, 20);
      const linkedFitness = (source.fitnessSessions ?? []).filter((session) =>
        relevantBlocks.some(
          (block) =>
            block.type === "calendar_event" &&
            session.calendarEventId === block.id,
        ),
      );
      const sources: StoredPlanningSourceReference[] = [
        {
          type: "task",
          id: value.task.id,
          role: "target",
          updatedAt: value.task.updatedAt.toISOString(),
          etag: null,
        },
        {
          type: "availability",
          id: slot.availabilityId,
          role: "availability",
          updatedAt: slot.availabilityUpdatedAt,
          etag: null,
        },
        ...(source.settings
          ? [
              {
                type: "settings" as const,
                id: source.settings.userId,
                role: "context" as const,
                updatedAt: source.settings.updatedAt.toISOString(),
                etag: null,
              },
            ]
          : []),
        ...value.deadlineSources,
        ...relevantBlocks.map((block) => ({
          type: block.type,
          id: block.id,
          role: "blocker" as const,
          updatedAt: block.updatedAt,
          etag: block.etag,
        })),
        ...linkedFitness.map((session) => ({
          type: "fitness_session" as const,
          id: session.id,
          role: "context" as const,
          updatedAt: session.updatedAt.toISOString(),
          etag: null,
        })),
      ];
      const uncertainties =
        value.dueDate > input.to ? ["deadline_outside_view"] : [];
      candidates.push({
        fingerprint: hash({
          version: 1,
          userId,
          targetId: value.task.id,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          sources: sources.map((entry) => [
            entry.type,
            entry.id,
            entry.updatedAt,
            entry.etag,
          ]),
        }),
        view: input.view,
        from: input.from,
        to: input.to,
        targetId: value.task.id,
        startsAt,
        endsAt,
        timezone,
        sources,
        reasonCodes: value.reasonCodes,
        uncertaintyCodes: uncertainties,
      });
    }
    if (eligible.length > candidates.length)
      addIssue(
        "capacity_exceeded",
        eligible.slice(candidates.length).map((value) => value.task.id),
      );
    const stored = await this.repository.storeGenerated(
      userId,
      input.view,
      input.from,
      input.to,
      candidates,
    );
    const index = sourceIndex(source);
    const proposals = stored.map((record) => this.mapProposal(record, index));
    return {
      generatedAt: this.now().toISOString(),
      timezone,
      range: { from: input.from, to: input.to },
      status: proposals.length
        ? eligible.length > proposals.length
          ? "overloaded"
          : "ready"
        : issues.length
          ? "insufficient_data"
          : "no_proposals",
      proposals,
      issues,
      externalAiUsed: false,
    };
  }

  async list(userId: string, from: string, to: string) {
    this.assertRange("week", from, to);
    const [records, source] = await Promise.all([
      this.repository.list(userId, from, to),
      this.sources.getSources(userId),
    ]);
    const index = sourceIndex(source);
    return {
      proposals: records.map((record) => this.mapProposal(record, index)),
    };
  }

  async confirm(userId: string, id: string): Promise<PlanningProposalResponse> {
    let proposal = await this.repository.get(userId, id);
    if (proposal.status === "applied") {
      const source = await this.sources.getSources(userId);
      return this.mapProposal(proposal, sourceIndex(source));
    }
    if (proposal.status === "pending")
      proposal = await this.repository.transition(
        userId,
        id,
        ["pending"],
        "confirming",
        null,
      );
    if (proposal.status !== "confirming")
      this.rethrow(new PlanningProposalStateError());
    const source = await this.sources.getSources(userId);
    const task = source.tasks.find(
      (value) => value.id === proposal.targetId && activeTask(value.status),
    );
    if (!task) return this.conflict(userId, proposal, "target_changed", false);
    if (
      task.scheduledStartAt?.toISOString() ===
        proposal.proposedStartsAt.toISOString() &&
      task.scheduledStartTimezone === proposal.timezone
    ) {
      const applied = await this.repository.transition(
        userId,
        id,
        ["confirming"],
        "applied",
        "confirmed",
      );
      return this.mapProposal(applied, sourceIndex(source));
    }
    if (task.scheduledStartAt)
      return this.conflict(userId, proposal, "target_changed", false);
    const live = sourceIndex(source);
    for (const reference of storedSources(proposal.sourceReferences)) {
      const current = live.get(sourceKey(reference.type, reference.id));
      if (
        !current ||
        current.updatedAt !== reference.updatedAt ||
        current.etag !== reference.etag
      ) {
        return this.conflict(
          userId,
          proposal,
          reference.type === "calendar_event"
            ? "etag_changed"
            : "source_changed",
          reference.type === "calendar_event",
        );
      }
    }
    const proposalDate = dateInTimezone(
      proposal.proposedStartsAt,
      proposal.timezone,
    );
    const { blocks, allDayDates } = blocksFor(
      source,
      proposalDate,
      proposalDate,
      proposal.timezone,
    );
    const candidate = {
      startsAt: proposal.proposedStartsAt,
      endsAt: proposal.proposedEndsAt,
    };
    if (
      allDayDates.has(proposalDate) ||
      blocks.some((block) => block.id !== task.id && overlap(block, candidate))
    )
      return this.conflict(userId, proposal, "slot_changed", false);
    try {
      await this.tasks.updateTask(userId, task.id, {
        scheduledStartAt: proposal.proposedStartsAt.toISOString(),
        scheduledStartTimezone: proposal.timezone,
      });
      const applied = await this.repository.transition(
        userId,
        id,
        ["confirming"],
        "applied",
        "confirmed",
      );
      const refreshed = await this.sources.getSources(userId);
      return this.mapProposal(applied, sourceIndex(refreshed));
    } catch (error) {
      await this.repository.transition(
        userId,
        id,
        ["confirming"],
        "conflict",
        "domain_conflict",
      );
      throw error;
    }
  }

  async confirmGroup(userId: string, ids: string[]) {
    const results = [];
    for (const id of ids) {
      try {
        const proposal = await this.confirm(userId, id);
        results.push({
          proposalId: id,
          status:
            proposal.status === "applied"
              ? ("applied" as const)
              : ("conflict" as const),
          message:
            proposal.status === "applied"
              ? "Der Vorschlag wurde bestätigt und über den Aufgabenservice angewendet."
              : "Der Vorschlag konnte wegen eines Konflikts nicht angewendet werden.",
        });
      } catch (error) {
        if (error instanceof ApiError && [409, 412].includes(error.status)) {
          results.push({
            proposalId: id,
            status: "conflict" as const,
            message: error.message,
          });
          continue;
        }
        throw error;
      }
    }
    return { results };
  }

  async reject(userId: string, id: string) {
    const value = await this.repository.transition(
      userId,
      id,
      ["pending", "conflict"],
      "rejected",
      "user_rejected",
    );
    return this.mapProposal(
      value,
      sourceIndex(await this.sources.getSources(userId)),
    );
  }

  async discard(userId: string, id: string) {
    const value = await this.repository.transition(
      userId,
      id,
      ["pending", "rejected", "conflict"],
      "discarded",
      "user_discarded",
    );
    return this.mapProposal(
      value,
      sourceIndex(await this.sources.getSources(userId)),
    );
  }

  async reopen(userId: string, id: string) {
    const value = await this.repository.transition(
      userId,
      id,
      ["rejected", "discarded", "conflict"],
      "pending",
      null,
    );
    return this.mapProposal(
      value,
      sourceIndex(await this.sources.getSources(userId)),
    );
  }

  private async conflict(
    userId: string,
    proposal: PlanningProposalModel,
    reason: string,
    etag: boolean,
  ): Promise<never> {
    await this.repository.transition(
      userId,
      proposal.id,
      ["confirming"],
      "conflict",
      reason,
    );
    throw new ApiError(
      etag ? 412 : 409,
      etag ? "PRECONDITION_FAILED" : "CONFLICT",
      etag
        ? "Ein Kalendertermin der Planungsgrundlage wurde zwischenzeitlich geändert. Es wurde nichts überschrieben."
        : "Die Planungsgrundlage wurde zwischenzeitlich geändert. Es wurde nichts angewendet.",
    );
  }

  private mapProposal(
    record: PlanningProposalModel,
    index: Map<string, LiveSource>,
  ): PlanningProposalResponse {
    const references = storedSources(record.sourceReferences);
    const sources: PlanningSourceReferenceResponse[] = references.map(
      (reference) => {
        const current = index.get(sourceKey(reference.type, reference.id));
        return {
          type: reference.type,
          id: reference.id,
          title: current?.title ?? "Quelle nicht mehr verfügbar",
          role: reference.role,
          updatedAt: reference.updatedAt,
          etag: reference.etag,
          current: Boolean(
            current &&
            current.updatedAt === reference.updatedAt &&
            current.etag === reference.etag,
          ),
        };
      },
    );
    const task = sources.find(
      (source) => source.type === "task" && source.role === "target",
    );
    const codes = array(record.reasonCodes);
    const dueDate =
      codes.find((code) => code.startsWith("due:"))?.slice(4) ??
      "nicht bekannt";
    const priority =
      codes.find((code) => code.startsWith("priority:"))?.slice(9) ??
      "nicht bekannt";
    return {
      id: record.id,
      status: record.status as PlanningProposalResponse["status"],
      view: record.view as PlanningProposalView,
      range: { from: day(record.rangeFrom)!, to: day(record.rangeTo)! },
      title: task?.title ?? "Aufgabe nicht mehr verfügbar",
      action: {
        type: "schedule_task",
        targetId: record.targetId,
        startsAt: record.proposedStartsAt.toISOString(),
        endsAt: record.proposedEndsAt.toISOString(),
        timezone: record.timezone,
      },
      reason: reasonText(codes, dueDate, priority),
      reasonCodes: codes,
      sources,
      uncertainties: array(record.uncertaintyCodes).map((code) => ({
        code,
        message: explanationMessages[code] ?? code,
        sourceIds: [record.targetId],
      })),
      requiresConfirmation: true,
      groupKey: `${record.view}:${day(record.rangeFrom)}:${day(record.rangeTo)}`,
      resolutionReason: record.resolutionReason,
      createdAt: record.createdAt.toISOString(),
      resolvedAt: record.resolvedAt?.toISOString() ?? null,
      appliedAt: record.appliedAt?.toISOString() ?? null,
    };
  }

  private assertRange(view: PlanningProposalView, from: string, to: string) {
    const days =
      Math.round(
        (new Date(`${to}T00:00:00.000Z`).getTime() -
          new Date(`${from}T00:00:00.000Z`).getTime()) /
          86_400_000,
      ) + 1;
    if (
      days < 1 ||
      (view === "day" && days !== 1) ||
      (view === "week" && days > 7)
    )
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Tagesvorschläge umfassen genau einen Tag, Wochenvorschläge höchstens sieben Tage.",
      );
  }

  private rethrow(error: unknown): never {
    if (error instanceof PlanningProposalNotFoundError)
      throw new ApiError(
        404,
        "NOT_FOUND",
        "Der Planungsvorschlag wurde nicht gefunden.",
      );
    if (error instanceof PlanningProposalStateError)
      throw new ApiError(
        409,
        "CONFLICT",
        "Der Planungsvorschlag ist in diesem Status nicht ausführbar.",
      );
    throw error;
  }
}

const runResponse = (
  run: AutomationWithLastRun["runs"][number],
): PlanningAutomationRunResponse => ({
  id: run.id,
  runKey: run.runKey,
  trigger: run.trigger as "scheduled" | "manual",
  status: run.status as PlanningAutomationRunResponse["status"],
  range: { from: day(run.rangeFrom)!, to: day(run.rangeTo)! },
  proposalCount: run.proposalCount,
  issueCodes: array(run.issueCodes),
  startedAt: run.startedAt.toISOString(),
  completedAt: run.completedAt?.toISOString() ?? null,
});

export class PlanningAutomationService {
  constructor(
    private readonly repository: PrismaPlanningProposalRepository,
    private readonly proposals: PlanningProposalService,
    private readonly sources: PlanningRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async overview(userId: string): Promise<PlanningAutomationOverviewResponse> {
    const [values, source] = await Promise.all([
      this.repository.listAutomations(userId),
      this.sources.getSources(userId),
    ]);
    const map = new Map(values.map((value) => [value.kind, value]));
    return {
      scheduler: "local",
      externalNetwork: "disabled",
      automations: (["daily_preview", "weekly_preview"] as const).map((kind) =>
        this.mapAutomation(
          map.get(kind),
          kind,
          source.settings?.timezone ?? "Europe/Berlin",
        ),
      ),
    };
  }

  async update(
    userId: string,
    kind: PlanningAutomationKind,
    input: UpdatePlanningAutomationRequest,
  ) {
    if (
      (kind === "daily_preview" && input.weekday != null) ||
      (kind === "weekly_preview" && input.weekday == null)
    )
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        kind === "daily_preview"
          ? "Die tägliche Vorschau verwendet keinen Wochentag."
          : "Die wöchentliche Vorschau benötigt einen Wochentag.",
      );
    const value = await this.repository.upsertAutomation(userId, kind, input);
    return this.mapAutomation({ ...value, runs: [] }, kind, input.timezone);
  }

  async run(
    userId: string,
    automationId: string,
    trigger: "scheduled" | "manual",
  ) {
    const automation = (await this.repository.listAutomations(userId)).find(
      (value) => value.id === automationId,
    );
    if (!automation) this.rethrow(new PlanningAutomationNotFoundError());
    if (!automation.enabled)
      this.rethrow(new PlanningAutomationDisabledError());
    const today = dateInTimezone(this.now(), automation.timezone);
    const from =
      automation.kind === "daily_preview"
        ? addDays(today, 1)
        : this.nextWeekStart(today);
    const to = automation.kind === "daily_preview" ? from : addDays(from, 6);
    const runKey = `${automation.kind}:${from}`;
    const begun = await this.repository.beginRun(
      userId,
      automation.id,
      runKey,
      trigger,
      from,
      to,
    );
    if (!begun.created) return runResponse(begun.run);
    try {
      const generated = await this.proposals.generate(userId, {
        view: automation.kind === "daily_preview" ? "day" : "week",
        from,
        to,
        maxSuggestions: automation.maxSuggestions,
      });
      return runResponse(
        await this.repository.completeRun(
          begun.run.id,
          generated.proposals.length ? "generated" : "no_data",
          generated.proposals.length,
          generated.issues.map((issue) => issue.code),
        ),
      );
    } catch (error) {
      await this.repository.completeRun(begun.run.id, "failed", 0, [
        "generation_failed",
      ]);
      throw error;
    }
  }

  async runDue() {
    const now = this.now();
    const dueAutomations = [];
    for (const automation of await this.repository.listEnabledAutomations()) {
      const date = dateInTimezone(now, automation.timezone);
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: automation.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(now);
      const number = (name: "hour" | "minute") =>
        Number(parts.find((part) => part.type === name)?.value ?? "0");
      const minute = number("hour") * 60 + number("minute");
      const due =
        minute >= automation.localMinute &&
        (automation.kind === "daily_preview" ||
          automation.weekday === weekday(date));
      if (due) dueAutomations.push(automation);
    }
    await Promise.allSettled(
      dueAutomations.map((automation) =>
        this.run(automation.userId, automation.id, "scheduled"),
      ),
    );
  }

  private nextWeekStart(today: string) {
    const daysUntilMonday = (1 - weekday(today) + 7) % 7 || 7;
    return addDays(today, daysUntilMonday);
  }

  private mapAutomation(
    value: AutomationWithLastRun | undefined,
    kind: PlanningAutomationKind,
    defaultTimezone: string,
  ): PlanningAutomationResponse {
    return {
      id: value?.id ?? null,
      kind,
      enabled: value?.enabled ?? false,
      localMinute: value?.localMinute ?? 18 * 60,
      weekday: kind === "weekly_preview" ? (value?.weekday ?? 0) : null,
      timezone: value?.timezone ?? defaultTimezone,
      maxSuggestions: value?.maxSuggestions ?? 10,
      lastRun: value?.runs[0] ? runResponse(value.runs[0]) : null,
      createdAt: value?.createdAt.toISOString() ?? null,
      updatedAt: value?.updatedAt.toISOString() ?? null,
    };
  }

  private rethrow(error: unknown): never {
    if (error instanceof PlanningAutomationNotFoundError)
      throw new ApiError(
        404,
        "NOT_FOUND",
        "Die lokale Planungsautomation wurde nicht gefunden.",
      );
    if (error instanceof PlanningAutomationDisabledError)
      throw new ApiError(
        409,
        "CONFLICT",
        "Die lokale Planungsautomation ist deaktiviert.",
      );
    throw error;
  }
}

export const startPlanningAutomationScheduler = (
  automations: PlanningAutomationService,
  onError: (error: unknown) => void,
) => {
  void automations.runDue().catch(onError);
  const timer = setInterval(
    () => void automations.runDue().catch(onError),
    60_000,
  );
  timer.unref();
  return () => clearInterval(timer);
};
