import type {
  BodyWeightEntryModel,
  DatabaseClient,
  FitnessExerciseModel,
  FitnessPlanExerciseModel,
  FitnessPlanModel,
  FitnessSessionModel,
  FitnessSetModel,
} from "@lifeos/database";
import type {
  BodyWeightEntryResponse,
  FitnessExerciseResponse,
  FitnessOverviewResponse,
  FitnessPlanExerciseResponse,
  FitnessPlanResponse,
  FitnessSessionResponse,
  FitnessSessionStatus,
  FitnessSetResponse,
} from "@lifeos/contracts";

export class FitnessRecordNotFoundError extends Error {}
export class FitnessReferenceNotFoundError extends Error {}
export class FitnessDuplicateError extends Error {}

export interface FitnessPlanValues {
  name: string;
  notes: string | null;
}
export interface FitnessExerciseValues {
  name: string;
  notes: string | null;
}
export interface FitnessPlanExerciseValues {
  exerciseId: string;
  position: number;
  targetSets: number | null;
  targetRepetitions: number | null;
  targetWeightGrams: number | null;
  targetDurationSeconds: number | null;
  targetDistanceMeters: number | null;
}
export interface FitnessSessionValues {
  planId: string | null;
  title: string;
  status: FitnessSessionStatus;
  performedAt: Date | null;
  timezone: string | null;
  notes: string | null;
  calendar: { calendarId: string; eventUid: string } | null;
}
export interface FitnessSetValues {
  sessionId: string;
  exerciseId: string;
  setNumber: number;
  repetitions: number | null;
  weightGrams: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  completedAt: Date | null;
}
export interface BodyWeightValues {
  measuredDate: Date;
  weightGrams: number;
  note: string | null;
}
export type FitnessChanges<T> = Partial<T> & { archivedAt?: Date | null };

export interface FitnessRepository {
  getOverview(
    userId: string,
    includeArchived: boolean,
  ): Promise<FitnessOverviewResponse>;
  createPlan(
    userId: string,
    values: FitnessPlanValues,
  ): Promise<FitnessPlanResponse>;
  updatePlan(
    userId: string,
    id: string,
    changes: FitnessChanges<FitnessPlanValues>,
  ): Promise<FitnessPlanResponse>;
  createExercise(
    userId: string,
    values: FitnessExerciseValues,
  ): Promise<FitnessExerciseResponse>;
  updateExercise(
    userId: string,
    id: string,
    changes: FitnessChanges<FitnessExerciseValues>,
  ): Promise<FitnessExerciseResponse>;
  createPlanExercise(
    userId: string,
    planId: string,
    values: FitnessPlanExerciseValues,
  ): Promise<FitnessPlanExerciseResponse>;
  updatePlanExercise(
    userId: string,
    id: string,
    changes: Partial<FitnessPlanExerciseValues>,
  ): Promise<FitnessPlanExerciseResponse>;
  createSession(
    userId: string,
    values: FitnessSessionValues,
  ): Promise<FitnessSessionResponse>;
  updateSession(
    userId: string,
    id: string,
    changes: FitnessChanges<FitnessSessionValues>,
  ): Promise<FitnessSessionResponse>;
  createSet(
    userId: string,
    values: FitnessSetValues,
  ): Promise<FitnessSetResponse>;
  updateSet(
    userId: string,
    id: string,
    changes: Partial<FitnessSetValues>,
  ): Promise<FitnessSetResponse>;
  createBodyWeight(
    userId: string,
    values: BodyWeightValues,
  ): Promise<BodyWeightEntryResponse>;
  updateBodyWeight(
    userId: string,
    id: string,
    changes: FitnessChanges<BodyWeightValues>,
  ): Promise<BodyWeightEntryResponse>;
}

const common = (record: {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date | null;
}) => ({
  id: record.id,
  ownerId: record.userId,
  ...(Object.hasOwn(record, "archivedAt")
    ? { archivedAt: record.archivedAt?.toISOString() ?? null }
    : {}),
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});
const mapPlan = (record: FitnessPlanModel): FitnessPlanResponse => ({
  ...common(record),
  name: record.name,
  notes: record.notes,
  archivedAt: record.archivedAt?.toISOString() ?? null,
});
const mapExercise = (
  record: FitnessExerciseModel,
): FitnessExerciseResponse => ({
  ...common(record),
  name: record.name,
  notes: record.notes,
  archivedAt: record.archivedAt?.toISOString() ?? null,
});
const mapPlanExercise = (
  record: FitnessPlanExerciseModel,
): FitnessPlanExerciseResponse => ({
  ...common(record),
  planId: record.planId,
  exerciseId: record.exerciseId,
  position: record.position,
  targetSets: record.targetSets,
  targetRepetitions: record.targetRepetitions,
  targetWeightGrams: record.targetWeightGrams,
  targetDurationSeconds: record.targetDurationSeconds,
  targetDistanceMeters: record.targetDistanceMeters,
});
type SessionWithCalendar = FitnessSessionModel & {
  calendarEvent?: { uid: string; title: string; calendarId: string } | null;
};
const mapSession = (record: SessionWithCalendar): FitnessSessionResponse => ({
  ...common(record),
  planId: record.planId,
  title: record.title,
  status: record.status,
  performedAt: record.performedAt?.toISOString() ?? null,
  timezone: record.timezone,
  notes: record.notes,
  calendar: record.calendarEvent
    ? {
        calendarId: record.calendarEvent.calendarId,
        eventUid: record.calendarEvent.uid,
        title: record.calendarEvent.title,
      }
    : null,
  archivedAt: record.archivedAt?.toISOString() ?? null,
});
const mapSet = (record: FitnessSetModel): FitnessSetResponse => ({
  ...common(record),
  sessionId: record.sessionId,
  exerciseId: record.exerciseId,
  setNumber: record.setNumber,
  repetitions: record.repetitions,
  weightGrams: record.weightGrams,
  durationSeconds: record.durationSeconds,
  distanceMeters: record.distanceMeters,
  completedAt: record.completedAt?.toISOString() ?? null,
});
const mapBodyWeight = (
  record: BodyWeightEntryModel,
): BodyWeightEntryResponse => ({
  ...common(record),
  measuredDate: record.measuredDate.toISOString().slice(0, 10),
  weightGrams: record.weightGrams,
  note: record.note,
  archivedAt: record.archivedAt?.toISOString() ?? null,
});

type Tx = Pick<
  DatabaseClient,
  | "fitnessPlan"
  | "fitnessExercise"
  | "fitnessPlanExercise"
  | "fitnessSession"
  | "fitnessSet"
  | "bodyWeightEntry"
  | "calendarEvent"
  | "auditEvent"
>;

export class PrismaFitnessRepository implements FitnessRepository {
  constructor(private readonly database: DatabaseClient) {}

  async getOverview(
    userId: string,
    includeArchived: boolean,
  ): Promise<FitnessOverviewResponse> {
    const active = includeArchived ? {} : { archivedAt: null };
    const [
      rawPlans,
      rawExercises,
      rawPlanExercises,
      rawSessions,
      rawSets,
      rawWeights,
    ] = await Promise.all([
      this.database.fitnessPlan.findMany({
        where: { userId, ...active },
        orderBy: { name: "asc" },
        take: 1_000,
      }),
      this.database.fitnessExercise.findMany({
        where: { userId, ...active },
        orderBy: { name: "asc" },
        take: 2_000,
      }),
      this.database.fitnessPlanExercise.findMany({
        where: { userId },
        orderBy: [{ planId: "asc" }, { position: "asc" }],
        take: 10_000,
      }),
      this.database.fitnessSession.findMany({
        where: { userId, ...active },
        include: {
          calendarEvent: {
            select: { uid: true, title: true, calendarId: true },
          },
        },
        orderBy: [{ performedAt: "desc" }, { createdAt: "desc" }],
        take: 5_000,
      }),
      this.database.fitnessSet.findMany({
        where: { userId },
        orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
        take: 20_000,
      }),
      this.database.bodyWeightEntry.findMany({
        where: { userId, ...active },
        orderBy: { measuredDate: "asc" },
        take: 5_000,
      }),
    ]);
    const plans = rawPlans.map(mapPlan);
    const exercises = rawExercises.map(mapExercise);
    const planIds = new Set(plans.map((value) => value.id));
    const exerciseIds = new Set(exercises.map((value) => value.id));
    const sessions = rawSessions.map(mapSession);
    const sessionIds = new Set(sessions.map((value) => value.id));
    const planExercises = rawPlanExercises
      .filter(
        (value) =>
          planIds.has(value.planId) && exerciseIds.has(value.exerciseId),
      )
      .map(mapPlanExercise);
    const sets = rawSets
      .filter(
        (value) =>
          sessionIds.has(value.sessionId) && exerciseIds.has(value.exerciseId),
      )
      .map(mapSet);
    const bodyWeights = rawWeights.map(mapBodyWeight);
    const completedSets = sets.filter((value) => value.completedAt !== null);
    const bests = new Map<
      string,
      {
        maximumWeightGrams: number | null;
        maximumRepetitions: number | null;
        maximumDurationSeconds: number | null;
        maximumDistanceMeters: number | null;
      }
    >();
    for (const set of completedSets) {
      const best = bests.get(set.exerciseId) ?? {
        maximumWeightGrams: null,
        maximumRepetitions: null,
        maximumDurationSeconds: null,
        maximumDistanceMeters: null,
      };
      best.maximumWeightGrams = this.maximum(
        best.maximumWeightGrams,
        set.weightGrams,
      );
      best.maximumRepetitions = this.maximum(
        best.maximumRepetitions,
        set.repetitions,
      );
      best.maximumDurationSeconds = this.maximum(
        best.maximumDurationSeconds,
        set.durationSeconds,
      );
      best.maximumDistanceMeters = this.maximum(
        best.maximumDistanceMeters,
        set.distanceMeters,
      );
      bests.set(set.exerciseId, best);
    }
    return {
      plans,
      exercises,
      planExercises,
      sessions,
      sets,
      bodyWeights,
      analytics: {
        completedSessionCount: sessions.filter(
          (value) => value.status === "completed",
        ).length,
        completedSetCount: completedSets.length,
        volumeGramRepetitions: completedSets.reduce(
          (sum, value) =>
            sum + (value.weightGrams ?? 0) * (value.repetitions ?? 0),
          0,
        ),
        weightChangeGrams:
          bodyWeights.length < 2
            ? null
            : bodyWeights.at(-1)!.weightGrams - bodyWeights[0]!.weightGrams,
        personalBests: [...bests.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([exerciseId, values]) => ({ exerciseId, ...values })),
      },
    };
  }

  createPlan(userId: string, values: FitnessPlanValues) {
    return this.mutate(async (tx) => {
      const record = await tx.fitnessPlan.create({
        data: { userId, ...values },
      });
      await this.audit(
        tx,
        userId,
        "fitness.plan.created",
        "FitnessPlan",
        record.id,
      );
      return mapPlan(record);
    });
  }
  updatePlan(
    userId: string,
    id: string,
    changes: FitnessChanges<FitnessPlanValues>,
  ) {
    return this.mutate(async (tx) => {
      await this.requireOwned(tx, "plan", userId, id, false, true);
      const record = await tx.fitnessPlan.update({
        where: { id },
        data: changes,
      });
      await this.audit(
        tx,
        userId,
        "fitness.plan.updated",
        "FitnessPlan",
        id,
        changes,
      );
      return mapPlan(record);
    });
  }
  createExercise(userId: string, values: FitnessExerciseValues) {
    return this.mutate(async (tx) => {
      const record = await tx.fitnessExercise.create({
        data: { userId, ...values },
      });
      await this.audit(
        tx,
        userId,
        "fitness.exercise.created",
        "FitnessExercise",
        record.id,
      );
      return mapExercise(record);
    });
  }
  updateExercise(
    userId: string,
    id: string,
    changes: FitnessChanges<FitnessExerciseValues>,
  ) {
    return this.mutate(async (tx) => {
      await this.requireOwned(tx, "exercise", userId, id, false, true);
      const record = await tx.fitnessExercise.update({
        where: { id },
        data: changes,
      });
      await this.audit(
        tx,
        userId,
        "fitness.exercise.updated",
        "FitnessExercise",
        id,
        changes,
      );
      return mapExercise(record);
    });
  }
  createPlanExercise(
    userId: string,
    planId: string,
    values: FitnessPlanExerciseValues,
  ) {
    return this.mutate(async (tx) => {
      await this.requireOwned(tx, "plan", userId, planId, true);
      await this.requireOwned(tx, "exercise", userId, values.exerciseId, true);
      const record = await tx.fitnessPlanExercise.create({
        data: { userId, planId, ...values },
      });
      await this.audit(
        tx,
        userId,
        "fitness.plan_exercise.created",
        "FitnessPlanExercise",
        record.id,
      );
      return mapPlanExercise(record);
    });
  }
  updatePlanExercise(
    userId: string,
    id: string,
    changes: Partial<FitnessPlanExerciseValues>,
  ) {
    return this.mutate(async (tx) => {
      await this.requireOwned(tx, "planExercise", userId, id, false, true);
      if (changes.exerciseId)
        await this.requireOwned(
          tx,
          "exercise",
          userId,
          changes.exerciseId,
          true,
        );
      const record = await tx.fitnessPlanExercise.update({
        where: { id },
        data: changes,
      });
      await this.audit(
        tx,
        userId,
        "fitness.plan_exercise.updated",
        "FitnessPlanExercise",
        id,
        changes,
      );
      return mapPlanExercise(record);
    });
  }
  createSession(userId: string, values: FitnessSessionValues) {
    return this.mutate(async (tx) => {
      if (values.planId)
        await this.requireOwned(tx, "plan", userId, values.planId, true);
      const calendarEventId = await this.resolveCalendarEventId(
        tx,
        userId,
        values.calendar,
      );
      const record = await tx.fitnessSession.create({
        data: {
          userId,
          planId: values.planId,
          title: values.title,
          status: values.status,
          performedAt: values.performedAt,
          timezone: values.timezone,
          notes: values.notes,
          calendarEventId,
        },
        include: {
          calendarEvent: {
            select: { uid: true, title: true, calendarId: true },
          },
        },
      });
      await this.audit(
        tx,
        userId,
        "fitness.session.created",
        "FitnessSession",
        record.id,
      );
      return mapSession(record);
    });
  }
  updateSession(
    userId: string,
    id: string,
    changes: FitnessChanges<FitnessSessionValues>,
  ) {
    return this.mutate(async (tx) => {
      await this.requireOwned(tx, "session", userId, id, false, true);
      const data = await this.sessionData(tx, userId, changes);
      const record = await tx.fitnessSession.update({
        where: { id },
        data,
        include: {
          calendarEvent: {
            select: { uid: true, title: true, calendarId: true },
          },
        },
      });
      await this.audit(
        tx,
        userId,
        "fitness.session.updated",
        "FitnessSession",
        id,
        changes,
      );
      return mapSession(record);
    });
  }
  createSet(userId: string, values: FitnessSetValues) {
    return this.mutate(async (tx) => {
      await this.requireOwned(tx, "session", userId, values.sessionId, true);
      await this.requireOwned(tx, "exercise", userId, values.exerciseId, true);
      const record = await tx.fitnessSet.create({
        data: { userId, ...values },
      });
      await this.audit(
        tx,
        userId,
        "fitness.set.created",
        "FitnessSet",
        record.id,
      );
      return mapSet(record);
    });
  }
  updateSet(userId: string, id: string, changes: Partial<FitnessSetValues>) {
    return this.mutate(async (tx) => {
      await this.requireOwned(tx, "set", userId, id, false, true);
      if (changes.sessionId)
        await this.requireOwned(tx, "session", userId, changes.sessionId, true);
      if (changes.exerciseId)
        await this.requireOwned(
          tx,
          "exercise",
          userId,
          changes.exerciseId,
          true,
        );
      const record = await tx.fitnessSet.update({
        where: { id },
        data: changes,
      });
      await this.audit(
        tx,
        userId,
        "fitness.set.updated",
        "FitnessSet",
        id,
        changes,
      );
      return mapSet(record);
    });
  }
  createBodyWeight(userId: string, values: BodyWeightValues) {
    return this.mutate(async (tx) => {
      const record = await tx.bodyWeightEntry.create({
        data: { userId, ...values },
      });
      await this.audit(
        tx,
        userId,
        "fitness.body_weight.created",
        "BodyWeightEntry",
        record.id,
      );
      return mapBodyWeight(record);
    });
  }
  updateBodyWeight(
    userId: string,
    id: string,
    changes: FitnessChanges<BodyWeightValues>,
  ) {
    return this.mutate(async (tx) => {
      await this.requireOwned(tx, "bodyWeight", userId, id, false, true);
      const record = await tx.bodyWeightEntry.update({
        where: { id },
        data: changes,
      });
      await this.audit(
        tx,
        userId,
        "fitness.body_weight.updated",
        "BodyWeightEntry",
        id,
        changes,
      );
      return mapBodyWeight(record);
    });
  }

  private maximum(current: number | null, candidate: number | null) {
    return candidate === null
      ? current
      : current === null
        ? candidate
        : Math.max(current, candidate);
  }
  private async sessionData(
    tx: Tx,
    userId: string,
    values: Partial<FitnessSessionValues> & { archivedAt?: Date | null },
  ) {
    const { calendar, ...data } = values;
    if (data.planId)
      await this.requireOwned(tx, "plan", userId, data.planId, true);
    if (calendar === undefined) return data;
    return {
      ...data,
      calendarEventId: await this.resolveCalendarEventId(tx, userId, calendar),
    };
  }
  private async resolveCalendarEventId(
    tx: Tx,
    userId: string,
    calendar: FitnessSessionValues["calendar"],
  ) {
    if (calendar === null) return null;
    const event = await tx.calendarEvent.findFirst({
      where: {
        userId,
        calendarId: calendar.calendarId,
        uid: calendar.eventUid,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!event) throw new FitnessReferenceNotFoundError();
    return event.id;
  }
  private async requireOwned(
    tx: Tx,
    kind:
      "plan" | "exercise" | "planExercise" | "session" | "set" | "bodyWeight",
    userId: string,
    id: string,
    active = false,
    record = false,
  ) {
    const where = { id, userId, ...(active ? { archivedAt: null } : {}) };
    const found =
      kind === "plan"
        ? await tx.fitnessPlan.findFirst({ where, select: { id: true } })
        : kind === "exercise"
          ? await tx.fitnessExercise.findFirst({ where, select: { id: true } })
          : kind === "planExercise"
            ? await tx.fitnessPlanExercise.findFirst({
                where,
                select: { id: true },
              })
            : kind === "session"
              ? await tx.fitnessSession.findFirst({
                  where,
                  select: { id: true },
                })
              : kind === "set"
                ? await tx.fitnessSet.findFirst({ where, select: { id: true } })
                : await tx.bodyWeightEntry.findFirst({
                    where,
                    select: { id: true },
                  });
    if (!found)
      throw record
        ? new FitnessRecordNotFoundError()
        : new FitnessReferenceNotFoundError();
  }
  private async audit(
    tx: Tx,
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    changes?: object,
  ) {
    await tx.auditEvent.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
        ...(changes
          ? { metadata: { changedFields: Object.keys(changes).sort() } }
          : {}),
      },
    });
  }
  private mutate<T>(operation: (tx: Tx) => Promise<T>): Promise<T> {
    return this.database.$transaction(operation).catch((error: unknown) => {
      if (
        error instanceof FitnessReferenceNotFoundError ||
        error instanceof FitnessRecordNotFoundError
      )
        throw error;
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2002"
      )
        throw new FitnessDuplicateError();
      throw error;
    });
  }
}
