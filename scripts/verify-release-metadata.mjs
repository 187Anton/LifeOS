import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = process.cwd();
const packagePaths = [
  "package.json",
  "apps/api/package.json",
  "apps/desktop/package.json",
  "apps/web/package.json",
  "packages/contracts/package.json",
  "packages/database/package.json",
];

const readJson = async (relativePath) =>
  JSON.parse(await readFile(path.join(repositoryRoot, relativePath), "utf8"));

const rootPackage = await readJson("package.json");
const version = rootPackage.version;
assert.match(version, /^\d+\.\d+\.\d+$/, "Ungültige Release-Version");

for (const relativePath of packagePaths) {
  const packageJson = await readJson(relativePath);
  assert.equal(
    packageJson.version,
    version,
    `${relativePath} verwendet nicht die zentrale Version ${version}.`,
  );
  for (const dependency of ["@lifeos/contracts", "@lifeos/database"]) {
    if (packageJson.dependencies?.[dependency]) {
      assert.equal(
        packageJson.dependencies[dependency],
        `^${version}`,
        `${relativePath} referenziert ${dependency} mit einer abweichenden Version.`,
      );
    }
  }
}

const packageLock = await readJson("package-lock.json");
assert.equal(
  packageLock.version,
  version,
  "package-lock.json ist nicht synchron.",
);
for (const relativePath of packagePaths) {
  const lockKey =
    relativePath === "package.json" ? "" : path.dirname(relativePath);
  assert.equal(
    packageLock.packages?.[lockKey]?.version,
    version,
    `package-lock.json enthält für ${lockKey || "das Repository"} eine abweichende Version.`,
  );
}

const tauriConfig = await readJson("apps/desktop/src-tauri/tauri.conf.json");
assert.equal(
  tauriConfig.version,
  version,
  "Die Tauri-Konfiguration ist nicht synchron.",
);

const cargoManifest = await readFile(
  path.join(repositoryRoot, "apps/desktop/src-tauri/Cargo.toml"),
  "utf8",
);
assert.match(
  cargoManifest,
  new RegExp(
    `\\[package\\][\\s\\S]*?version = "${version.replaceAll(".", "\\.")}"`,
  ),
  "Cargo.toml ist nicht synchron.",
);
const cargoLock = await readFile(
  path.join(repositoryRoot, "apps/desktop/src-tauri/Cargo.lock"),
  "utf8",
);
assert.match(
  cargoLock,
  new RegExp(
    `name = "lifeos-desktop"\\nversion = "${version.replaceAll(".", "\\.")}"`,
  ),
  "Cargo.lock ist nicht synchron.",
);

const nodeMajor = (
  await readFile(path.join(repositoryRoot, ".nvmrc"), "utf8")
).trim();
assert.equal(
  nodeMajor,
  "22",
  "Der Build muss die festgelegte Node-22-Linie verwenden.",
);
assert.equal(
  rootPackage.engines?.node,
  ">=22 <23",
  "Die Node-Engine muss exakt auf die unterstützte Hauptversion begrenzt sein.",
);

console.info(
  `Release-Metadaten ${version} sind in npm, Lockfile, Tauri und Cargo konsistent.`,
);
