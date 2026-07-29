import { createDatabaseClient } from "@lifeos/database";

import { loadLocalEnvironment } from "../../config.js";

loadLocalEnvironment();
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
  const now = new Date();
  await database.$transaction(async (transaction) => {
    await transaction.calDavCredential.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: now, revision: { increment: 1 } },
    });
    await transaction.auditEvent.create({
      data: {
        userId: user.id,
        action: "caldav.credential.revoked",
        entityType: "CalDavCredential",
        entityId: user.id,
        metadata: { source: "local-command" },
      },
    });
  });
  console.info("Der getrennte CalDAV-Zugang wurde widerrufen.");
} finally {
  await database.$disconnect();
}
