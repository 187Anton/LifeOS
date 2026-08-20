import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";

import BetterSqlite3 from "better-sqlite3";

const repositoryRoot = process.cwd();
const desktopRoot = path.join(repositoryRoot, "apps/desktop/src-tauri");
const packagedApp = process.env.LIFEOS_DESKTOP_APP_PATH?.trim();
if (packagedApp && !path.isAbsolute(packagedApp)) {
  throw new Error("LIFEOS_DESKTOP_APP_PATH muss absolut sein.");
}
const resources = packagedApp
  ? path.join(packagedApp, "Contents/Resources")
  : path.join(desktopRoot, "resources");
const manifest = JSON.parse(
  await readFile(path.join(resources, "runtime-manifest.json"), "utf8"),
);
const nodeBinary = packagedApp
  ? path.join(packagedApp, "Contents/MacOS/lifeos-node")
  : path.join(desktopRoot, "binaries", `lifeos-node-${manifest.targetTriple}`);
const serverEntry = path.join(resources, "server/server.js");

const reservePort = async () => {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
};

const waitForReady = async (baseUrl, child) => {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(
        `Der gebündelte Sidecar endete vorzeitig (${child.exitCode}).`,
      );
    }
    try {
      const response = await fetch(`${baseUrl}/api/v1/readiness`);
      if (response.status === 200) return;
    } catch {
      // Der lokale Sidecar startet noch.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Der gebündelte Sidecar wurde nicht rechtzeitig bereit.");
};

const startSidecar = async (databasePath, port) => {
  const baseUrl = `http://127.0.0.1:${port}`;
  const output = [];
  const child = spawn(nodeBinary, [serverEntry], {
    cwd: resources,
    env: {
      NODE_ENV: "production",
      API_HOST: "127.0.0.1",
      API_PORT: String(port),
      DATABASE_URL: `file:${databasePath}`,
      WEB_ORIGIN: baseUrl,
      WEB_DIST_PATH: path.join(resources, "web"),
      SQLITE_MIGRATIONS_PATH: path.join(resources, "sqlite-migrations"),
      STORAGE_PATH: path.join(path.dirname(databasePath), "documents"),
      LOG_LEVEL: "error",
      SHUTDOWN_TIMEOUT_MS: "1000",
      SESSION_TTL_HOURS: "1",
      PATH: "/usr/bin:/bin",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk) => output.push(chunk.toString()));
  await waitForReady(baseUrl, child);
  return { child, baseUrl, output };
};

const stopSidecar = async (child, output) => {
  child.kill("SIGTERM");
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  assert.equal(
    exitCode,
    0,
    `Der Sidecar wurde nicht sauber beendet: ${output.join("").trim()}`,
  );
};

const directory = await mkdtemp(path.join(os.tmpdir(), "lifeos-sidecar-"));
const databasePath = path.join(directory, "data/lifeos.sqlite");
let running;

try {
  const port = await reservePort();
  const first = await startSidecar(databasePath, port);
  running = first.child;

  const page = await fetch(first.baseUrl, {
    headers: { accept: "text/html" },
  });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Anton Life OS/);
  const readiness = await fetch(`${first.baseUrl}/api/v1/readiness`);
  assert.equal(readiness.status, 200);
  const calDav = await fetch(`${first.baseUrl}/caldav/`, {
    method: "PROPFIND",
  });
  assert.equal(calDav.status, 401);

  await stopSidecar(running, first.output);
  running = undefined;

  const database = new BetterSqlite3(databasePath, { readonly: true });
  assert.equal(database.pragma("integrity_check", { simple: true }), "ok");
  assert.equal(database.pragma("journal_mode", { simple: true }), "wal");
  const applied = database
    .prepare('SELECT "name" FROM "_lifeos_migrations" ORDER BY "name"')
    .all()
    .map(({ name }) => name);
  assert.deepEqual(applied, [
    "20260809190000_sqlite_foundation",
    "20260809203000_product_modules",
    "20260812100000_projects_milestones",
    "20260812190000_local_documents_notes",
    "20260820100000_local_search",
  ]);
  database.close();
  assert.equal((await stat(databasePath)).mode & 0o777, 0o600);

  const second = await startSidecar(databasePath, port);
  running = second.child;
  const secondReadiness = await fetch(`${second.baseUrl}/api/v1/readiness`);
  assert.equal(secondReadiness.status, 200);
  await stopSidecar(running, second.output);
  running = undefined;

  console.info(
    `Gebündelter Sidecar mit Node ${manifest.nodeVersion} startete zweimal ohne Homebrew-Pfad.`,
  );
} finally {
  if (running && running.exitCode === null) running.kill("SIGTERM");
  await rm(directory, { recursive: true, force: true });
}
