import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  chmod,
  copyFile,
  cp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const repositoryRoot = process.cwd();
const desktopRoot = path.join(repositoryRoot, "apps/desktop/src-tauri");
const binariesDirectory = path.join(desktopRoot, "binaries");
const resourcesDirectory = path.join(desktopRoot, "resources");
const cacheDirectory = path.join(repositoryRoot, "apps/desktop/.cache");
const nodeVersion = "22.23.2";
const supportedTargets = {
  arm64: {
    archive: `node-v${nodeVersion}-darwin-arm64.tar.xz`,
    sha256: "5eff7a9011895aae3f29d06f167b84a62b028a591370c7cafb59103559fd26e1",
    triple: "aarch64-apple-darwin",
  },
  x64: {
    archive: `node-v${nodeVersion}-darwin-x64.tar.xz`,
    sha256: "96dff79f4e19a78715da559ec7cac2028f4985a175ea0c3454625a269c21deb7",
    triple: "x86_64-apple-darwin",
  },
};

const fail = (message) => {
  throw new Error(`Desktop-Vorbereitung abgebrochen: ${message}`);
};

const exists = async (target) => {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
};

const sha256 = async (target) =>
  createHash("sha256")
    .update(await readFile(target))
    .digest("hex");

const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    fail(`${command} schlug fehl: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout.trim();
};

const downloadNodeRuntime = async (target) => {
  await mkdir(cacheDirectory, { recursive: true });
  const archivePath = path.join(cacheDirectory, target.archive);
  if (
    !(await exists(archivePath)) ||
    (await sha256(archivePath)) !== target.sha256
  ) {
    const response = await fetch(
      `https://nodejs.org/download/release/v${nodeVersion}/${target.archive}`,
    );
    if (!response.ok) {
      fail(`Node-Download antwortete mit HTTP ${response.status}`);
    }
    const downloadPath = `${archivePath}.download`;
    await writeFile(downloadPath, Buffer.from(await response.arrayBuffer()), {
      mode: 0o600,
    });
    if ((await sha256(downloadPath)) !== target.sha256) {
      await rm(downloadPath, { force: true });
      fail("die SHA-256-Prüfsumme der Node-Laufzeit stimmt nicht");
    }
    await rm(archivePath, { force: true });
    await copyFile(downloadPath, archivePath);
    await rm(downloadPath, { force: true });
  }

  const extractionDirectory = path.join(
    cacheDirectory,
    target.archive.replace(/\.tar\.xz$/, ""),
  );
  const sourceBinary = path.join(extractionDirectory, "bin/node");
  if (!(await exists(sourceBinary))) {
    await rm(extractionDirectory, { recursive: true, force: true });
    run("tar", ["-xJf", archivePath, "-C", cacheDirectory]);
  }
  return sourceBinary;
};

if (process.platform !== "darwin") fail("M5 unterstützt zunächst nur macOS");
const target = supportedTargets[process.arch];
if (!target) {
  fail(`die Architektur ${process.arch} wird noch nicht unterstützt`);
}

const requiredDirectories = [
  path.join(repositoryRoot, "apps/api/dist-desktop"),
  path.join(repositoryRoot, "apps/web/dist"),
  path.join(repositoryRoot, "packages/database/prisma/sqlite/migrations"),
];
for (const requiredDirectory of requiredDirectories) {
  if (!(await exists(requiredDirectory))) fail(`${requiredDirectory} fehlt`);
}

const nativeAddon = path.join(
  repositoryRoot,
  "node_modules/better-sqlite3/build/Release/better_sqlite3.node",
);
if (!(await exists(nativeAddon))) fail("das native SQLite-Modul fehlt");

await rm(binariesDirectory, { recursive: true, force: true });
await rm(resourcesDirectory, { recursive: true, force: true });
await mkdir(binariesDirectory, { recursive: true });
await mkdir(resourcesDirectory, { recursive: true });

const sourceNode = await downloadNodeRuntime(target);
const sidecarBinary = path.join(
  binariesDirectory,
  `lifeos-node-${target.triple}`,
);
await copyFile(sourceNode, sidecarBinary);
await chmod(sidecarBinary, 0o755);

const dependencies = run("otool", ["-L", sidecarBinary])
  .split("\n")
  .slice(1)
  .map((line) => line.trim().split(" ")[0])
  .filter(Boolean);
const unexpectedDependency = dependencies.find(
  (entry) =>
    !entry.startsWith("/usr/lib/") && !entry.startsWith("/System/Library/"),
);
if (unexpectedDependency) {
  fail(`die Node-Laufzeit hängt von ${unexpectedDependency} ab`);
}

await cp(
  path.join(repositoryRoot, "apps/api/dist-desktop"),
  path.join(resourcesDirectory, "server"),
  { recursive: true },
);
await cp(
  path.join(repositoryRoot, "apps/web/dist"),
  path.join(resourcesDirectory, "web"),
  { recursive: true },
);
await cp(
  path.join(repositoryRoot, "packages/database/prisma/sqlite/migrations"),
  path.join(resourcesDirectory, "sqlite-migrations"),
  { recursive: true },
);
await mkdir(path.join(resourcesDirectory, "build/Release"), {
  recursive: true,
});
await copyFile(
  nativeAddon,
  path.join(resourcesDirectory, "build/Release/better_sqlite3.node"),
);
await writeFile(
  path.join(resourcesDirectory, "package.json"),
  `${JSON.stringify({ private: true, type: "module" }, null, 2)}\n`,
  { mode: 0o644 },
);
await writeFile(
  path.join(resourcesDirectory, "runtime-manifest.json"),
  `${JSON.stringify(
    {
      formatVersion: 1,
      nodeVersion,
      nodeArchive: target.archive,
      nodeSha256: target.sha256,
      targetTriple: target.triple,
    },
    null,
    2,
  )}\n`,
  { mode: 0o644 },
);

console.info(
  `Desktop-Ressourcen für ${target.triple} mit Node ${nodeVersion} vorbereitet.`,
);
