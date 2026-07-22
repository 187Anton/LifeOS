import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const readRepositoryFile = (relativePath) =>
  readFile(path.join(repositoryRoot, relativePath), "utf8");

test("enthält die verpflichtenden Repository-Artefakte", async () => {
  const requiredPaths = [
    ".env.example",
    ".github/pull_request_template.md",
    ".github/workflows/ci.yml",
    "AGENTS.md",
    "CONTRIBUTING.md",
    "README.md",
    "compose.yaml",
    "docs/architecture.md",
    "docs/roadmap.md",
  ];

  await Promise.all(
    requiredPaths.map((relativePath) =>
      access(path.join(repositoryRoot, relativePath)),
    ),
  );
});

test("schützt lokale Secrets und Anwendungsdaten vor Git", async () => {
  const gitignore = await readRepositoryFile(".gitignore");

  assert.match(gitignore, /^\.env$/m);
  assert.match(gitignore, /^\.env\.\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
  assert.match(gitignore, /^secrets\/$/m);
  assert.match(gitignore, /^\*\.key$/m);
  assert.match(gitignore, /^\*\.pem$/m);
  assert.match(gitignore, /^data\/\*$/m);
  assert.match(gitignore, /^!data\/\.gitkeep$/m);
  assert.match(gitignore, /^backups\/$/m);
  assert.doesNotMatch(gitignore, /packages\/database\/prisma\/migrations\//);
  assert.match(gitignore, /packages\/database\/src\/generated\//);
});

test("führt CI für develop und main mit den verbindlichen Prüfungen aus", async () => {
  const workflow = await readRepositoryFile(".github/workflows/ci.yml");

  assert.match(workflow, /branches: \["main", "develop"\]/);
  assert.match(workflow, /run: npm ci/);
  assert.match(workflow, /run: npm run format:check/);
  assert.match(workflow, /run: docker compose config --quiet/);
  assert.match(workflow, /run: npm run lint && npm run typecheck/);
  assert.match(workflow, /run: npm run build/);
  assert.match(workflow, /run: npm test/);
});

test("dokumentiert den Issue-, Branch- und Pull-Request-Workflow", async () => {
  const contributing = await readRepositoryFile("CONTRIBUTING.md");
  const pullRequestTemplate = await readRepositoryFile(
    ".github/pull_request_template.md",
  );

  assert.match(contributing, /Branch aus dem aktuellen `develop`/);
  assert.match(contributing, /Conventional Commits/);
  assert.match(contributing, /Closes #<Issue-Nummer>/);
  assert.match(pullRequestTemplate, /Closes #/);
});
