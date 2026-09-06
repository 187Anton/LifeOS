import assert from "node:assert/strict";
import test from "node:test";

import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  passwordHashNeedsUpgrade,
  verifyPassword,
} from "../src/modules/profile/security.js";

test("hasht Passwörter mit Salt und vergleicht sie ohne Klartext", async () => {
  const password = "synthetisches-langes-passwort";
  const first = await hashPassword(password);
  const second = await hashPassword(password);

  assert.notEqual(first, second);
  assert.doesNotMatch(first, new RegExp(password));
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(passwordHashNeedsUpgrade(first), false);
  assert.equal(await verifyPassword("falsch", first), false);
  assert.equal(await verifyPassword(password, "ungueltiger-hash"), false);
  assert.equal(await verifyPassword(password, `${first}$zusaetzlich`), false);
  const parts = first.split("$");
  parts[4] = "!".repeat(22);
  assert.equal(await verifyPassword(password, parts.join("$")), false);
});

test("akzeptiert bestehende scrypt-v1-Hashes nur zur kontrollierten Aktualisierung", async () => {
  const legacyHash =
    "scrypt-v1$16384$8$1$MDEyMzQ1Njc4OWFiY2RlZg$XhVLJ0yPXpQ-kWu8BEGSxLWxuSzYM43-nzKW30KSA67EndKyv2VjHozxH7UHRhvA-IwNpni7ydBlfcWAMASYBA";

  assert.equal(
    await verifyPassword("synthetisches-passwort", legacyHash),
    true,
  );
  assert.equal(passwordHashNeedsUpgrade(legacyHash), true);
});

test("speichert von Sitzungstokens nur einen stabilen SHA-256-Hash", () => {
  const token = createSessionToken();
  const hash = hashSessionToken(token);

  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(hash, token);
});
