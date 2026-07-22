import { createDatabaseClient } from "@lifeos/database";
import { z } from "zod";

import { loadLocalEnvironment } from "../../config.js";
import { hashPassword } from "./security.js";

loadLocalEnvironment();
const passwordResult = z
  .string()
  .min(12)
  .max(200)
  .safeParse(process.env.LIFEOS_BOOTSTRAP_PASSWORD);
if (!passwordResult.success) {
  throw new Error(
    "LIFEOS_BOOTSTRAP_PASSWORD fehlt oder ist nicht 12 bis 200 Zeichen lang.",
  );
}
const password = passwordResult.data;
const database = createDatabaseClient();

try {
  const user = await database.user.findUnique({
    where: { externalId: "local-personal-user" },
    select: { id: true },
  });
  if (!user) {
    throw new Error(
      "Das synthetische lokale Profil fehlt. Führe zuerst npm run db:seed aus.",
    );
  }

  const passwordHash = await hashPassword(password);
  await database.$transaction(async (transaction) => {
    await transaction.userCredential.upsert({
      where: { userId: user.id },
      create: { userId: user.id, passwordHash },
      update: { passwordHash, revision: { increment: 1 } },
    });
    await transaction.userSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await transaction.auditEvent.create({
      data: {
        userId: user.id,
        action: "credential.password.updated",
        entityType: "UserCredential",
        entityId: user.id,
        metadata: { source: "local-bootstrap" },
      },
    });
  });
  console.info(
    "Lokales Passwort wurde gehasht gespeichert; bestehende Sitzungen sind widerrufen.",
  );
} finally {
  await database.$disconnect();
}
