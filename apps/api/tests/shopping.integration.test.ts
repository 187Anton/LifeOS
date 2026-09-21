import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createDatabaseClient } from "@lifeos/database";
import type { ShoppingParsePreviewResponse } from "@lifeos/contracts";
import { config as loadEnvironment } from "dotenv";

import { createApplication } from "../src/application.js";
import type { Logger } from "../src/logger.js";
import { PrismaProfileRepository } from "../src/modules/profile/repository.js";
import { createProfileRouter } from "../src/modules/profile/router.js";
import {
  AuthenticationService,
  ProfileService,
} from "../src/modules/profile/service.js";
import { hashPassword } from "../src/modules/profile/security.js";
import { PrismaShoppingRepository } from "../src/modules/shopping/repository.js";
import { createShoppingRouter } from "../src/modules/shopping/router.js";
import { ShoppingService } from "../src/modules/shopping/service.js";

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

test("speichert eine bestätigte Vorschau atomar und schützt Besitzergrenzen", async (t) => {
  const database = createDatabaseClient();
  const suffix = randomUUID();
  const externalId = `shopping-owner-${suffix}`;
  const otherExternalId = `shopping-other-${suffix}`;
  const password = `synthetisches-einkaufspasswort-${suffix}`;
  const owner = await database.user.create({
    data: {
      externalId,
      displayName: "Synthetische Einkaufslistenperson",
      settings: { create: {} },
      credential: { create: { passwordHash: await hashPassword(password) } },
    },
  });
  const other = await database.user.create({
    data: {
      externalId: otherExternalId,
      displayName: "Andere synthetische Person",
      settings: { create: {} },
    },
  });
  const otherList = await database.shoppingList.create({
    data: { userId: other.id, title: "Fremde synthetische Liste" },
  });
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
      createShoppingRouter({
        authentication,
        shopping: new ShoppingService(new PrismaShoppingRepository(database)),
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
  assert.equal(login.status, 201);
  const cookie = (login.headers.get("set-cookie") ?? "").split(";", 1)[0] ?? "";
  const headers = { cookie, "content-type": "application/json" };
  const listResponse = await fetch(`${base}/shopping-lists`, {
    method: "POST",
    headers,
    body: JSON.stringify({ title: "Synthetische Wochenliste" }),
  });
  assert.equal(listResponse.status, 201);
  const list = (await listResponse.json()) as { id: string };
  assert.equal(
    (await fetch(`${base}/shopping-lists/${otherList.id}`, { headers })).status,
    404,
  );

  const beforePreview = await database.shoppingItem.count({
    where: { userId: owner.id },
  });
  const previewResponse = await fetch(`${base}/shopping-lists/parse-preview`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      text: "zwei Liter Milch, Käse, Hähnchenbrust, Chips und sechs Äpfel",
    }),
  });
  assert.equal(previewResponse.status, 200);
  const preview =
    (await previewResponse.json()) as ShoppingParsePreviewResponse;
  assert.equal(preview.items.length, 5);
  assert.equal(
    await database.shoppingItem.count({ where: { userId: owner.id } }),
    beforePreview,
  );

  const invalidBatch = await fetch(
    `${base}/shopping-lists/${list.id}/items/batch`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        parserVersion: preview.parserVersion,
        previewVersion: preview.previewVersion,
        items: [
          {
            ...preview.items[0],
            categoryId: "00000000-0000-4000-8000-000000000000",
          },
        ],
      }),
    },
  );
  assert.equal(invalidBatch.status, 400);
  assert.equal(
    await database.shoppingItem.count({ where: { userId: owner.id } }),
    beforePreview,
  );

  const validBatch = await fetch(
    `${base}/shopping-lists/${list.id}/items/batch`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        parserVersion: preview.parserVersion,
        previewVersion: preview.previewVersion,
        items: preview.items,
      }),
    },
  );
  assert.equal(validBatch.status, 201);
  assert.equal(
    await database.shoppingItem.count({ where: { userId: owner.id } }),
    5,
  );
  assert.equal(
    (
      await (
        await fetch(`${base}/shopping-lists/${list.id}`, { headers })
      ).json()
    ).items.length,
    5,
  );

  assert.equal(
    (
      await fetch(`${base}/shopping-lists`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await fetch(`${base}/shopping-lists/${list.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ archived: true }),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(`${base}/shopping-lists`, {
        method: "POST",
        headers,
        body: JSON.stringify({ title: "Neue Liste" }),
      })
    ).status,
    201,
  );
});
