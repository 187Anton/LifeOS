import { createDatabaseClient } from "@lifeos/database";
import { z } from "zod";

import { loadLocalEnvironment } from "../../config.js";
import { hashPassword } from "../profile/security.js";

loadLocalEnvironment();
const passwordResult = z
  .string()
  .min(12)
  .max(200)
  .safeParse(process.env.LIFEOS_CALDAV_PASSWORD);
if (!passwordResult.success) {
  throw new Error(
    "LIFEOS_CALDAV_PASSWORD fehlt oder ist nicht 12 bis 200 Zeichen lang.",
  );
}
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
  const passwordHash = await hashPassword(passwordResult.data);
  await database.$transaction(async (transaction) => {
    await transaction.calDavCredential.upsert({
      where: { userId: user.id },
      create: { userId: user.id, username: "local", passwordHash },
      update: {
        username: "local",
        passwordHash,
        revision: { increment: 1 },
        revokedAt: null,
      },
    });
    await transaction.auditEvent.create({
      data: {
        userId: user.id,
        action: "caldav.credential.updated",
        entityType: "CalDavCredential",
        entityId: user.id,
        metadata: { source: "local-bootstrap" },
      },
    });
  });
  console.info(
    "CalDAV-Zugang für Benutzer local wurde gehasht gespeichert und aktiviert.",
  );
} finally {
  await database.$disconnect();
}
