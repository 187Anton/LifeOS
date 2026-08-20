import type {
  CreateBodyWeightEntryRequest,
  CreateFitnessExerciseRequest,
  CreateFitnessPlanRequest,
  CreateFitnessSessionRequest,
  CreateFitnessSetRequest,
  UpdateBodyWeightEntryRequest,
  UpdateFitnessExerciseRequest,
  UpdateFitnessPlanRequest,
  UpdateFitnessSessionRequest,
  UpdateFitnessSetRequest,
  UpsertFitnessPlanExerciseRequest,
} from "@lifeos/contracts";
import { ApiError } from "../../errors.js";
import {
  FitnessDuplicateError,
  FitnessRecordNotFoundError,
  FitnessReferenceNotFoundError,
  type BodyWeightValues,
  type FitnessChanges,
  type FitnessExerciseValues,
  type FitnessPlanValues,
  type FitnessRepository,
  type FitnessSessionValues,
  type FitnessSetValues,
} from "./repository.js";

const own = <T extends object>(value: T, key: PropertyKey) =>
  Object.hasOwn(value, key);
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const instant = (value: string | null | undefined) =>
  value ? new Date(value) : null;

export class FitnessService {
  constructor(
    private readonly repository: FitnessRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  getOverview(userId: string, includeArchived: boolean) {
    return this.repository.getOverview(userId, includeArchived);
  }

  createPlan(userId: string, input: CreateFitnessPlanRequest) {
    return this.handle(() =>
      this.repository.createPlan(userId, {
        name: input.name,
        notes: input.notes ?? null,
      }),
    );
  }

  updatePlan(userId: string, id: string, input: UpdateFitnessPlanRequest) {
    const changes: FitnessChanges<FitnessPlanValues> = {};
    if (own(input, "name")) changes.name = input.name!;
    if (own(input, "notes")) changes.notes = input.notes ?? null;
    if (input.archived !== undefined)
      changes.archivedAt = input.archived ? this.now() : null;
    return this.handle(() => this.repository.updatePlan(userId, id, changes));
  }

  createExercise(userId: string, input: CreateFitnessExerciseRequest) {
    return this.handle(() =>
      this.repository.createExercise(userId, {
        name: input.name,
        notes: input.notes ?? null,
      }),
    );
  }

  updateExercise(
    userId: string,
    id: string,
    input: UpdateFitnessExerciseRequest,
  ) {
    const changes: FitnessChanges<FitnessExerciseValues> = {};
    if (own(input, "name")) changes.name = input.name!;
    if (own(input, "notes")) changes.notes = input.notes ?? null;
    if (input.archived !== undefined)
      changes.archivedAt = input.archived ? this.now() : null;
    return this.handle(() =>
      this.repository.updateExercise(userId, id, changes),
    );
  }

  addPlanExercise(
    userId: string,
    planId: string,
    input: UpsertFitnessPlanExerciseRequest,
  ) {
    return this.handle(() =>
      this.repository.createPlanExercise(userId, planId, {
        ...input,
        targetSets: input.targetSets ?? null,
        targetRepetitions: input.targetRepetitions ?? null,
        targetWeightGrams: input.targetWeightGrams ?? null,
        targetDurationSeconds: input.targetDurationSeconds ?? null,
        targetDistanceMeters: input.targetDistanceMeters ?? null,
      }),
    );
  }

  updatePlanExercise(
    userId: string,
    id: string,
    input: Partial<UpsertFitnessPlanExerciseRequest>,
  ) {
    return this.handle(() =>
      this.repository.updatePlanExercise(userId, id, input),
    );
  }

  createSession(userId: string, input: CreateFitnessSessionRequest) {
    const values = this.sessionValues(input);
    this.assertSession(values);
    return this.handle(() => this.repository.createSession(userId, values));
  }

  updateSession(
    userId: string,
    id: string,
    input: UpdateFitnessSessionRequest,
  ) {
    const changes: FitnessChanges<FitnessSessionValues> = {};
    if (own(input, "planId")) changes.planId = input.planId ?? null;
    if (own(input, "title")) changes.title = input.title!;
    if (own(input, "status")) changes.status = input.status!;
    if (own(input, "performedAt"))
      changes.performedAt = instant(input.performedAt);
    if (own(input, "timezone")) changes.timezone = input.timezone ?? null;
    if (own(input, "notes")) changes.notes = input.notes ?? null;
    if (own(input, "calendarId") || own(input, "eventUid")) {
      changes.calendar =
        input.calendarId && input.eventUid
          ? { calendarId: input.calendarId, eventUid: input.eventUid }
          : null;
    }
    if (input.archived !== undefined)
      changes.archivedAt = input.archived ? this.now() : null;
    if (
      own(input, "status") ||
      own(input, "performedAt") ||
      own(input, "timezone")
    )
      this.assertSession(changes);
    return this.handle(() =>
      this.repository.updateSession(userId, id, changes),
    );
  }

  createSet(userId: string, input: CreateFitnessSetRequest) {
    const values = this.setValues(input);
    this.assertSet(values);
    return this.handle(() => this.repository.createSet(userId, values));
  }

  updateSet(userId: string, id: string, input: UpdateFitnessSetRequest) {
    const changes: Partial<FitnessSetValues> = {};
    if (own(input, "sessionId")) changes.sessionId = input.sessionId!;
    if (own(input, "exerciseId")) changes.exerciseId = input.exerciseId!;
    if (own(input, "setNumber")) changes.setNumber = input.setNumber!;
    if (own(input, "repetitions"))
      changes.repetitions = input.repetitions ?? null;
    if (own(input, "weightGrams"))
      changes.weightGrams = input.weightGrams ?? null;
    if (own(input, "durationSeconds"))
      changes.durationSeconds = input.durationSeconds ?? null;
    if (own(input, "distanceMeters"))
      changes.distanceMeters = input.distanceMeters ?? null;
    if (own(input, "completedAt"))
      changes.completedAt = instant(input.completedAt);
    return this.handle(() => this.repository.updateSet(userId, id, changes));
  }

  createBodyWeight(userId: string, input: CreateBodyWeightEntryRequest) {
    return this.handle(() =>
      this.repository.createBodyWeight(userId, {
        measuredDate: day(input.measuredDate),
        weightGrams: input.weightGrams,
        note: input.note ?? null,
      }),
    );
  }

  updateBodyWeight(
    userId: string,
    id: string,
    input: UpdateBodyWeightEntryRequest,
  ) {
    const changes: FitnessChanges<BodyWeightValues> = {};
    if (own(input, "measuredDate"))
      changes.measuredDate = day(input.measuredDate!);
    if (own(input, "weightGrams")) changes.weightGrams = input.weightGrams!;
    if (own(input, "note")) changes.note = input.note ?? null;
    if (input.archived !== undefined)
      changes.archivedAt = input.archived ? this.now() : null;
    return this.handle(() =>
      this.repository.updateBodyWeight(userId, id, changes),
    );
  }

  private sessionValues(
    input: CreateFitnessSessionRequest,
  ): FitnessSessionValues {
    return {
      planId: input.planId ?? null,
      title: input.title,
      status: input.status ?? "planned",
      performedAt: instant(input.performedAt),
      timezone: input.timezone ?? null,
      notes: input.notes ?? null,
      calendar:
        input.calendarId && input.eventUid
          ? { calendarId: input.calendarId, eventUid: input.eventUid }
          : null,
    };
  }

  private setValues(input: CreateFitnessSetRequest): FitnessSetValues {
    return {
      sessionId: input.sessionId,
      exerciseId: input.exerciseId,
      setNumber: input.setNumber,
      repetitions: input.repetitions ?? null,
      weightGrams: input.weightGrams ?? null,
      durationSeconds: input.durationSeconds ?? null,
      distanceMeters: input.distanceMeters ?? null,
      completedAt: instant(input.completedAt),
    };
  }

  private assertSession(values: Partial<FitnessSessionValues>) {
    if (
      values.status !== undefined &&
      ((values.status === "completed") !== values.performedAt instanceof Date ||
        (values.status === "completed") !== (values.timezone != null))
    )
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Abgeschlossene Einheiten benötigen Zeitpunkt und Zeitzone; geplante oder abgebrochene Einheiten enthalten beides nicht.",
      );
  }

  private assertSet(values: FitnessSetValues) {
    if (
      values.repetitions == null &&
      values.weightGrams == null &&
      values.durationSeconds == null &&
      values.distanceMeters == null
    )
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Ein Trainingssatz benötigt mindestens Wiederholungen, Gewicht, Dauer oder Distanz.",
      );
  }

  private async handle<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof FitnessRecordNotFoundError)
        throw new ApiError(
          404,
          "NOT_FOUND",
          "Der Fitnessdatensatz wurde nicht gefunden.",
        );
      if (error instanceof FitnessReferenceNotFoundError)
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          "Der referenzierte Trainingsplan, die Übung, Einheit oder das Kalenderereignis fehlt, ist archiviert oder gehört nicht zum angemeldeten Profil.",
        );
      if (error instanceof FitnessDuplicateError)
        throw new ApiError(
          409,
          "CONFLICT",
          "Diese Fitnesszuordnung ist bereits vorhanden.",
        );
      throw error;
    }
  }
}
