import assert from "node:assert/strict";
import test from "node:test";

import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from "../src/modules/profile/security.js";

test("hasht Passwörter mit Salt und vergleicht sie ohne Klartext", async () => {
  const password = "synthetisches-langes-passwort";
  const first = await hashPassword(password);
  const second = await hashPassword(password);

  assert.notEqual(first, second);
  assert.doesNotMatch(first, new RegExp(password));
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("falsch", first), false);
  assert.equal(await verifyPassword(password, "ungueltiger-hash"), false);
});

test("speichert von Sitzungstokens nur einen stabilen SHA-256-Hash", () => {
  const token = createSessionToken();
  const hash = hashSessionToken(token);

  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(hash, token);
});
