import type {
  DatabaseClient,
  PlanningAutomationModel,
  PlanningAutomationRunModel,
  PlanningProposalModel,
} from "@lifeos/database";
import type { Prisma } from "@lifeos/database";
import type {
  PlanningAutomationKind,
  PlanningProposalStatus,
  PlanningProposalView,
  PlanningSourceType,
  UpdatePlanningAutomationRequest,
} from "@lifeos/contracts";

export interface StoredPlanningSourceReference {
  type: PlanningSourceType;
  id: string;
  role: "target" | "deadline" | "availability" | "blocker" | "context";
  updatedAt: string | null;
  etag: string | null;
}

export interface PlanningProposalCandidate {
  fingerprint: string;
  view: PlanningProposalView;
  from: string;
  to: string;
  targetId: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  sources: StoredPlanningSourceReference[];
  reasonCodes: string[];
  uncertaintyCodes: string[];
}

export interface AutomationWithLastRun extends PlanningAutomationModel {
  runs: PlanningAutomationRunModel[];
}

export class PlanningProposalNotFoundError extends Error {}
export class PlanningProposalStateError extends Error {}
export class PlanningAutomationNotFoundError extends Error {}
export class PlanningAutomationDisabledError extends Error {}

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const json = (value: unknown) => value as Prisma.InputJsonValue;

export class PrismaPlanningProposalRepository {
  constructor(private readonly database: DatabaseClient) {}

  async storeGenerated(
    userId: string,
    view: PlanningProposalView,
    from: string,
    to: string,
    candidates: PlanningProposalCandidate[],
  ): Promise<PlanningProposalModel[]> {
    return this.database.$transaction(async (transaction) => {
      const fingerprints = candidates.map((candidate) => candidate.fingerprint);
      await transaction.planningProposal.updateMany({
        where: {
          userId,
          view,
          rangeFrom: day(from),
          rangeTo: day(to),
          status: "pending",
          ...(fingerprints.length
            ? { fingerprint: { notIn: fingerprints } }
            : {}),
        },
        data: {
          status: "discarded",
          resolutionReason: "source_changed",
          resolvedAt: new Date(),
        },
      });
      for (const candidate of candidates) {
        await transaction.planningProposal.upsert({
          where: {
            userId_fingerprint: { userId, fingerprint: candidate.fingerprint },
          },
          create: {
            userId,
            fingerprint: candidate.fingerprint,
            view: candidate.view,
            rangeFrom: day(candidate.from),
            rangeTo: day(candidate.to),
            targetType: "task",
            targetId: candidate.targetId,
            actionType: "schedule_task",
            proposedStartsAt: candidate.startsAt,
            proposedEndsAt: candidate.endsAt,
            timezone: candidate.timezone,
            sourceReferences: json(candidate.sources),
            reasonCodes: json(candidate.reasonCodes),
            uncertaintyCodes: json(candidate.uncertaintyCodes),
          },
          update: {},
        });
      }
      await transaction.auditEvent.create({
        data: {
          userId,
          action: "planning.proposals.generated",
          entityType: "PlanningProposal",
          metadata: {
            view,
            proposalCount: candidates.length,
            rangeDays:
              Math.round(
                (day(to).getTime() - day(from).getTime()) / 86_400_000,
              ) + 1,
            externalAiUsed: false,
          },
        },
      });
      return transaction.planningProposal.findMany({
        where: { userId, fingerprint: { in: fingerprints } },
        orderBy: [{ proposedStartsAt: "asc" }, { createdAt: "asc" }],
      });
    });
  }

  list(userId: string, from: string, to: string) {
    return this.database.planningProposal.findMany({
      where: {
        userId,
        rangeFrom: { lte: day(to) },
        rangeTo: { gte: day(from) },
      },
      orderBy: [{ proposedStartsAt: "asc" }, { createdAt: "asc" }],
      take: 100,
    });
  }

  async get(userId: string, id: string) {
    const value = await this.database.planningProposal.findFirst({
      where: { id, userId },
    });
    if (!value) throw new PlanningProposalNotFoundError();
    return value;
  }

  async transition(
    userId: string,
    id: string,
    expected: PlanningProposalStatus[],
    status: PlanningProposalStatus,
    resolutionReason: string | null,
  ) {
    return this.database.$transaction(async (transaction) => {
      const changed = await transaction.planningProposal.updateMany({
        where: { id, userId, status: { in: expected } },
        data: {
          status,
          resolutionReason,
          resolvedAt: status === "pending" ? null : new Date(),
          ...(status === "applied" ? { appliedAt: new Date() } : {}),
        },
      });
      if (changed.count !== 1) {
        const exists = await transaction.planningProposal.findFirst({
          where: { id, userId },
        });
        if (!exists) throw new PlanningProposalNotFoundError();
        throw new PlanningProposalStateError();
      }
      await transaction.auditEvent.create({
        data: {
          userId,
          action: `planning.proposal.${status}`,
          entityType: "PlanningProposal",
          entityId: id,
          metadata: { domainChangesApplied: status === "applied" },
        },
      });
      return transaction.planningProposal.findUniqueOrThrow({ where: { id } });
    });
  }

  listAutomations(userId: string): Promise<AutomationWithLastRun[]> {
    return this.database.planningAutomation.findMany({
      where: { userId },
      include: { runs: { orderBy: { startedAt: "desc" }, take: 1 } },
      orderBy: { kind: "asc" },
    });
  }

  listEnabledAutomations(): Promise<PlanningAutomationModel[]> {
    return this.database.planningAutomation.findMany({
      where: { enabled: true },
      orderBy: [{ userId: "asc" }, { kind: "asc" }],
      take: 1000,
    });
  }

  upsertAutomation(
    userId: string,
    kind: PlanningAutomationKind,
    input: UpdatePlanningAutomationRequest,
  ) {
    return this.database.$transaction(async (transaction) => {
      const weekday =
        kind === "weekly_preview" ? (input.weekday ?? null) : null;
      const value = await transaction.planningAutomation.upsert({
        where: { userId_kind: { userId, kind } },
        create: {
          userId,
          kind,
          enabled: input.enabled,
          localMinute: input.localMinute,
          weekday,
          timezone: input.timezone,
          maxSuggestions: input.maxSuggestions ?? 10,
        },
        update: {
          enabled: input.enabled,
          localMinute: input.localMinute,
          weekday,
          timezone: input.timezone,
          maxSuggestions: input.maxSuggestions ?? 10,
        },
      });
      await transaction.auditEvent.create({
        data: {
          userId,
          action: input.enabled
            ? "planning.automation.enabled"
            : "planning.automation.disabled",
          entityType: "PlanningAutomation",
          entityId: value.id,
          metadata: { kind, externalNetwork: false },
        },
      });
      return value;
    });
  }

  async beginRun(
    userId: string,
    automationId: string,
    runKey: string,
    trigger: "scheduled" | "manual",
    from: string,
    to: string,
  ): Promise<{ run: PlanningAutomationRunModel; created: boolean }> {
    const automation = await this.database.planningAutomation.findFirst({
      where: { id: automationId, userId },
    });
    if (!automation) throw new PlanningAutomationNotFoundError();
    if (!automation.enabled) throw new PlanningAutomationDisabledError();
    try {
      const run = await this.database.planningAutomationRun.create({
        data: {
          userId,
          automationId,
          runKey,
          trigger,
          status: "running",
          rangeFrom: day(from),
          rangeTo: day(to),
          proposalCount: 0,
          issueCodes: [],
        },
      });
      return { run, created: true };
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2002"
      ) {
        return {
          run: await this.database.planningAutomationRun.findUniqueOrThrow({
            where: { automationId_runKey: { automationId, runKey } },
          }),
          created: false,
        };
      }
      throw error;
    }
  }

  completeRun(
    id: string,
    status: "generated" | "no_data" | "failed",
    proposalCount: number,
    issueCodes: string[],
  ) {
    return this.database.$transaction(async (transaction) => {
      const run = await transaction.planningAutomationRun.update({
        where: { id },
        data: {
          status,
          proposalCount,
          issueCodes: json(issueCodes),
          completedAt: new Date(),
        },
      });
      await transaction.auditEvent.create({
        data: {
          userId: run.userId,
          action: "planning.automation.executed",
          entityType: "PlanningAutomation",
          entityId: run.automationId,
          metadata: {
            trigger: run.trigger,
            status,
            proposalCount,
            issueCodes,
            externalNetwork: false,
          },
        },
      });
      return run;
    });
  }
}
