import assert from "node:assert/strict";
import test from "node:test";

import { ApiError } from "../src/errors.js";
import { LoginAttemptLimiter } from "../src/modules/profile/login-attempt-limiter.js";

test("begrenzt fehlgeschlagene Anmeldungen je lokalem Client", () => {
  let now = 1_000_000;
  const limiter = new LoginAttemptLimiter(() => now);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    limiter.requireAllowed("127.0.0.1");
    limiter.recordFailure("127.0.0.1");
  }

  assert.equal(limiter.retryAfterSeconds("127.0.0.1"), 900);
  assert.throws(
    () => limiter.requireAllowed("127.0.0.1"),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 429 &&
      error.code === "RATE_LIMITED",
  );
  assert.doesNotThrow(() => limiter.requireAllowed("127.0.0.2"));

  now += 15 * 60 * 1_000;
  assert.doesNotThrow(() => limiter.requireAllowed("127.0.0.1"));
});

test("setzt die Fehlversuche nach erfolgreicher Anmeldung zurück", () => {
  const limiter = new LoginAttemptLimiter(() => 1_000_000);
  limiter.recordFailure("local");
  limiter.recordFailure("local");
  limiter.reset("local");
  assert.equal(limiter.retryAfterSeconds("local"), null);
});
