import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const environmentCheck = path.join(
  repositoryRoot,
  "scripts/check-local-environment.sh",
);

const runEnvironmentCheck = (pathValue) =>
  spawnSync("/bin/bash", [environmentCheck], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { PATH: pathValue },
  });

const createFakeDocker = async (body) => {
  const directory = await mkdtemp(path.join(tmpdir(), "lifeos-docker-test-"));
  const executable = path.join(directory, "docker");
  await writeFile(executable, `#!/bin/sh\n${body}\n`, "utf8");
  await chmod(executable, 0o755);
  return directory;
};

test("meldet verständlich, wenn Docker fehlt", () => {
  const result = runEnvironmentCheck("");

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Docker wurde nicht gefunden/);
});

test("unterscheidet ein installiertes Docker von einem gestoppten Dienst", async () => {
  const fakePath = await createFakeDocker(
    '[ "$1" = "info" ] && exit 1\nexit 0',
  );
  const result = runEnvironmentCheck(fakePath);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Docker-Dienst ist nicht erreichbar/);
});

test("bestätigt eine erreichbare Docker- und Compose-Umgebung", async () => {
  const fakePath = await createFakeDocker("exit 0");
  const result = runEnvironmentCheck(fakePath);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Lokale Docker-Umgebung ist bereit/);
});

test("bindet PostgreSQL nur lokal und verwendet ein persistentes Volume", async () => {
  const compose = await readFile(
    path.join(repositoryRoot, "compose.yaml"),
    "utf8",
  );

  assert.match(compose, /127\.0\.0\.1:\$\{POSTGRES_PORT:-5432\}:5432/);
  assert.match(compose, /lifeos-postgres:\/var\/lib\/postgresql\/data/);
  assert.match(compose, /pg_isready/);
});

test("stellt sichere, dokumentierte Datenbankbefehle bereit", async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
  );
  const stopScript = await readFile(
    path.join(repositoryRoot, "scripts/stop-database.sh"),
    "utf8",
  );

  assert.equal(
    packageJson.scripts["env:check"],
    "bash scripts/check-local-environment.sh",
  );
  assert.equal(
    packageJson.scripts["db:start"],
    "bash scripts/start-database.sh",
  );
  assert.equal(
    packageJson.scripts["db:check"],
    "bash scripts/check-database.sh",
  );
  assert.equal(packageJson.scripts["db:stop"], "bash scripts/stop-database.sh");
  assert.doesNotMatch(stopScript, /--volumes|-v\b/);
});
