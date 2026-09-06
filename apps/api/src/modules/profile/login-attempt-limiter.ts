import { ApiError } from "../../errors.js";

interface FailedLoginWindow {
  failures: number;
  inFlight: number;
  expiresAt: number;
}

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1_000;
const MAX_TRACKED_CLIENTS = 1_000;

export class LoginAttemptLimiter {
  private readonly attempts = new Map<string, FailedLoginWindow>();

  constructor(private readonly now: () => number = Date.now) {}

  requireAllowed(clientKey: string): void {
    this.prune();
    const attempt = this.attempts.get(clientKey);
    if (!attempt || attempt.failures + attempt.inFlight < MAX_FAILURES) return;

    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Zu viele fehlgeschlagene Anmeldungen. Versuche es später erneut.",
    );
  }

  beginAttempt(clientKey: string): void {
    this.requireAllowed(clientKey);
    const now = this.now();
    const current = this.attempts.get(clientKey);
    this.attempts.delete(clientKey);
    this.attempts.set(clientKey, {
      failures: current?.failures ?? 0,
      inFlight: (current?.inFlight ?? 0) + 1,
      expiresAt: current?.expiresAt ?? now + WINDOW_MS,
    });
    this.enforceCapacity();
  }

  recordFailure(clientKey: string): void {
    this.prune();
    const now = this.now();
    const current = this.attempts.get(clientKey);
    const failures = current ? current.failures + 1 : 1;
    this.attempts.delete(clientKey);
    this.attempts.set(clientKey, {
      failures,
      inFlight: Math.max(0, (current?.inFlight ?? 0) - 1),
      expiresAt: now + WINDOW_MS,
    });

    this.enforceCapacity();
  }

  releaseAttempt(clientKey: string): void {
    const current = this.attempts.get(clientKey);
    if (!current) return;
    const inFlight = Math.max(0, current.inFlight - 1);
    if (current.failures === 0 && inFlight === 0) {
      this.attempts.delete(clientKey);
      return;
    }
    this.attempts.set(clientKey, { ...current, inFlight });
  }

  private enforceCapacity(): void {
    while (this.attempts.size > MAX_TRACKED_CLIENTS) {
      const oldest = this.attempts.keys().next().value as string | undefined;
      if (!oldest) break;
      this.attempts.delete(oldest);
    }
  }

  reset(clientKey: string): void {
    this.attempts.delete(clientKey);
  }

  retryAfterSeconds(clientKey: string): number | null {
    this.prune();
    const attempt = this.attempts.get(clientKey);
    if (!attempt || attempt.failures + attempt.inFlight < MAX_FAILURES) {
      return null;
    }
    return Math.max(1, Math.ceil((attempt.expiresAt - this.now()) / 1_000));
  }

  private prune(): void {
    const now = this.now();
    for (const [key, attempt] of this.attempts) {
      if (attempt.expiresAt <= now) this.attempts.delete(key);
    }
  }
}
