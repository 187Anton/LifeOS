import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createDatabaseClient } from "@lifeos/database";
import { config as loadEnvironment } from "dotenv";

import { PrismaProfileRepository } from "../src/modules/profile/repository.js";
import {
  AuthenticationService,
  ProfileService,
} from "../src/modules/profile/service.js";
import { hashPassword } from "../src/modules/profile/security.js";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
loadEnvironment({
  path: path.resolve(testDirectory, "../../../.env"),
  quiet: true,
});

test("persistiert Hash, Sitzung, Einstellungen und Audit ohne Klartext", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const password = `synthetisch-${suffix}`;
  const externalId = `integration-profile-${suffix}`;
  const user = await database.user.create({
    data: {
      externalId,
      displayName: "Synthetische Profilperson",
      settings: { create: {} },
    },
  });
  t.after(async () => {
    await database.user.delete({ where: { id: user.id } });
    await database.$disconnect();
  });
  const passwordHash = await hashPassword(password);
  await database.userCredential.create({
    data: { userId: user.id, passwordHash },
  });

  const repository = new PrismaProfileRepository(database, externalId);
  const authentication = new AuthenticationService(repository, 1);
  const session = await authentication.login(password);
  const storedSession = await database.userSession.findFirstOrThrow({
    where: { userId: user.id },
  });
  assert.notEqual(storedSession.tokenHash, session.token);
  assert.doesNotMatch(storedSession.tokenHash, new RegExp(password));
  assert.equal(await authentication.authenticate(session.token), user.id);

  const updated = await new ProfileService(repository).updateSettings(user.id, {
    timezone: "UTC",
    locale: "en-US",
    currencyCode: "USD",
    weekStartsOn: 0,
    defaultCalendarView: "month",
    showWeekends: false,
  });
  assert.equal(updated.settings.timezone, "UTC");
  assert.equal(updated.settings.defaultCalendarView, "month");
  const audit = await database.auditEvent.findFirstOrThrow({
    where: { userId: user.id, action: "settings.updated" },
  });
  assert.deepEqual(audit.metadata, {
    changedFields: [
      "currencyCode",
      "defaultCalendarView",
      "locale",
      "showWeekends",
      "timezone",
      "weekStartsOn",
    ],
  });
  assert.doesNotMatch(JSON.stringify(audit.metadata), /UTC|USD|en-US/);

  await database.userCredential.update({
    where: { userId: user.id },
    data: { revision: { increment: 1 } },
  });
  await assert.rejects(() => authentication.authenticate(session.token));
});
