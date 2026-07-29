import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";

import { JsonLogger } from "../src/logger.js";

test("schreibt strukturierte Logs und entfernt sensible Felder rekursiv", () => {
  const output = new PassThrough();
  let logged = "";
  output.on("data", (chunk: Buffer) => {
    logged += chunk.toString("utf8");
  });
  const logger = new JsonLogger("debug", output);

  logger.info("synthetic.event", {
    requestId: "request-1",
    authorization: "Bearer darf-nicht-erscheinen",
    nested: {
      password: "darf-nicht-erscheinen",
      count: 1,
    },
  });

  const record = JSON.parse(logged) as Record<string, unknown>;
  assert.equal(record.level, "info");
  assert.equal(record.service, "lifeos-api");
  assert.equal(record.event, "synthetic.event");
  assert.equal(record.requestId, "request-1");
  assert.deepEqual(record.nested, { count: 1 });
  assert.doesNotMatch(logged, /darf-nicht-erscheinen/);
});
