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
    "docs/foundation-verification.md",
    "docs/release-0.9.md",
    "docs/roadmap-06-local-demo.md",
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
  assert.match(workflow, /run: npm audit --audit-level=low/);
  assert.match(workflow, /run: npm run security:secrets/);
  assert.match(workflow, /run: npm run format:check/);
  assert.match(workflow, /run: docker compose config --quiet/);
  assert.match(workflow, /run: npm run lint && npm run typecheck/);
  assert.match(workflow, /run: npm run build/);
  assert.match(workflow, /run: npm run db:verify:recovery/);
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /run: npm run release:verify/);
  assert.match(workflow, /npm run db:sqlite:verify:recovery/);
  assert.match(workflow, /runs-on: macos-15/);
  assert.match(
    workflow,
    /cargo audit --file apps\/desktop\/src-tauri\/Cargo\.lock/,
  );
  assert.match(workflow, /run: npm run release:build:local/);
  assert.match(workflow, /run: npm run release:verify:local/);
  assert.match(workflow, /if: always\(\)/);
});

test("verwendet eine konsistente Release-Version und portable DMG-Prüfsummen", async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
  );
  const buildScript = await readRepositoryFile("scripts/build-mac-dmg.sh");
  const verifyScript = await readRepositoryFile("scripts/verify-mac-dmg.sh");
  const metadataScript = await readRepositoryFile(
    "scripts/verify-release-metadata.mjs",
  );

  assert.match(packageJson.version, /^\d+\.\d+\.\d+$/);
  assert.equal(
    packageJson.scripts["release:verify"],
    "node scripts/verify-release-metadata.mjs",
  );
  assert.match(packageJson.scripts["desktop:test"], /desktop:prepare/);
  assert.match(
    packageJson.scripts["desktop:prepare"],
    /^env DATABASE_URL=postgresql:\/\/unused:unused@127\.0\.0\.1:5432\/unused npm run db:generate/,
  );
  assert.match(buildScript, /RELEASE_VERSION/);
  assert.match(buildScript, /\.sha256/);
  assert.doesNotMatch(buildScript, /Anton Life OS_0\.1\.0/);
  assert.match(verifyScript, /shasum -a 256 -c/);
  assert.match(verifyScript, /verpflichtende DMG-Prüfsumme/);
  assert.match(verifyScript, /CFBundleShortVersionString/);
  assert.match(verifyScript, /lipo -archs/);
  assert.match(verifyScript, /FORBIDDEN_BUNDLE_FILE/);
  assert.match(verifyScript, /'\*\.sqlite'/);
  assert.match(metadataScript, /tauri\.conf\.json/);
  assert.match(metadataScript, /Cargo\.lock/);
});

test("trennt öffentlichen Apple-Releasepfad und physischen Download-Nachweis", async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
  );
  const notarizeScript = await readRepositoryFile(
    "scripts/notarize-mac-release.sh",
  );
  const publicVerifyScript = await readRepositoryFile(
    "scripts/verify-public-mac-release.sh",
  );

  assert.equal(
    packageJson.scripts["release:build:public"],
    "bash scripts/notarize-mac-release.sh",
  );
  assert.match(
    packageJson.scripts["release:verify:downloaded"],
    /LIFEOS_REQUIRE_QUARANTINE=1/,
  );
  assert.match(notarizeScript, /APPLE_SIGNING_IDENTITY/);
  assert.match(notarizeScript, /APPLE_NOTARY_KEYCHAIN_PROFILE/);
  assert.match(notarizeScript, /notarytool submit/);
  assert.match(notarizeScript, /stapler staple/);
  assert.ok(
    notarizeScript.indexOf("stapler staple") <
      notarizeScript.indexOf("shasum -a 256"),
  );
  assert.doesNotMatch(notarizeScript, /--apple-id|--password|--team-id/);
  assert.match(publicVerifyScript, /com\.apple\.quarantine/);
  assert.match(publicVerifyScript, /stapler validate/);
  assert.match(publicVerifyScript, /spctl --assess --type open/);
  assert.match(publicVerifyScript, /spctl --assess --type execute/);
  assert.match(publicVerifyScript, /Authority=Developer ID Application:/);
  assert.match(publicVerifyScript, /lipo -archs/);
});

test("stellt eine synthetische CalDAV-LAN-Vorprüfung ohne Apple-Erfolgsaussage bereit", async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
  );
  const lanScript = await readRepositoryFile("scripts/verify-caldav-lan.mjs");

  assert.match(packageJson.scripts["caldav:verify:lan"], /verify-caldav-lan/);
  assert.match(lanScript, /API_HOST: "0\.0\.0\.0"/);
  assert.match(lanScript, /private IPv4-Adresse/);
  assert.match(lanScript, /\.well-known\/caldav/);
  assert.match(lanScript, /"if-none-match": "\*"/);
  assert.match(lanScript, /"if-match": firstEtag/);
  assert.match(lanScript, /DTSTART;VALUE=DATE/);
  assert.match(lanScript, /RRULE:FREQ=WEEKLY;COUNT=2/);
  assert.match(
    lanScript,
    /physischer Apple-Kalender-Test ist damit nicht ersetzt/,
  );
});

test("führt die vollständige synthetische Stabilitätsdemo über reale Grenzen aus", async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
  );
  const demoScript = await readRepositoryFile(
    "scripts/verify-stabilization-demo.sh",
  );
  const updateScript = await readRepositoryFile(
    "scripts/verify-mac-update-rollback.mjs",
  );

  assert.equal(
    packageJson.scripts["demo:stabilization"],
    "bash scripts/verify-stabilization-demo.sh",
  );
  for (const command of [
    "npm test",
    "npm run db:verify:recovery",
    "npm run db:sqlite:verify:recovery",
    "npm run release:build:local",
    "npm run release:verify:local",
    "npm run desktop:verify:update-rollback",
    "npm run security:secrets",
  ]) {
    assert.match(demoScript, new RegExp(command.replaceAll(" ", "\\s+")));
  }
  assert.match(updateScript, /createSqliteBackup/);
  assert.match(updateScript, /restoreSqliteBackup/);
  assert.match(updateScript, /baselineSnapshot/);
});

test("stellt Secret-Scan und isolierte Backup-/Restore-Prüfung bereit", async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
  );
  const apiPackageJson = JSON.parse(
    await readFile(path.join(repositoryRoot, "apps/api/package.json"), "utf8"),
  );
  const databasePackageJson = JSON.parse(
    await readFile(
      path.join(repositoryRoot, "packages/database/package.json"),
      "utf8",
    ),
  );
  const recoveryScript = await readRepositoryFile(
    "scripts/verify-database-recovery.sh",
  );
  const backupScript = await readRepositoryFile("scripts/backup-database.sh");
  const restoreScript = await readRepositoryFile("scripts/restore-database.sh");

  assert.equal(
    packageJson.scripts["security:secrets"],
    "node scripts/scan-secrets.mjs",
  );
  assert.equal(
    packageJson.scripts["db:verify:recovery"],
    "bash scripts/verify-database-recovery.sh",
  );
  assert.equal(
    packageJson.scripts["db:restore"],
    "bash scripts/restore-database.sh",
  );
  assert.match(
    packageJson.scripts["db:sqlite:verify:recovery"],
    /--env-file-if-exists=\.env/,
  );
  assert.match(
    apiPackageJson.scripts.test,
    /--env-file-if-exists=\.\.\/\.\.\/\.env/,
  );
  assert.match(
    databasePackageJson.scripts.test,
    /--env-file-if-exists=\.\.\/\.\.\/\.env/,
  );
  assert.equal(
    packageJson.scripts["documents:backup"],
    "node --import tsx scripts/document-data.ts backup",
  );
  assert.equal(
    packageJson.scripts["documents:restore"],
    "node --import tsx scripts/document-data.ts restore",
  );
  assert.match(recoveryScript, /lifeos_verify_/);
  assert.match(recoveryScript, /lifeos_restore_/);
  assert.match(recoveryScript, /pg_dump/);
  assert.match(recoveryScript, /pg_restore/);
  assert.doesNotMatch(recoveryScript, /docker compose down|--volumes/);
  assert.match(backupScript, /umask 077/);
  assert.match(backupScript, /pg_dump/);
  assert.match(backupScript, /-L "\$destination"/);
  assert.match(backupScript, /-L "\$checksum_destination"/);
  assert.match(backupScript, /sha256/);
  assert.match(restoreScript, /\^lifeos_restore_/);
  assert.match(restoreScript, /pg_restore --list/);
  assert.match(restoreScript, /--exit-on-error/);
  assert.match(restoreScript, /timingSafeEqual/);
  assert.match(restoreScript, /verpflichtende SHA-256-Datei/);
  assert.match(restoreScript, /\[\[ -L "\$backup_file" \]\]/);
  assert.doesNotMatch(restoreScript, /--clean|docker compose down|--volumes/);
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
