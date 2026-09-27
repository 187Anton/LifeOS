import { defineConfig } from "tsup";

export default defineConfig({
  /**
   * Wie im Server-Build ist die OOXML-Workerdatei ein eigener Einstiegspunkt,
   * damit sie im Sidecar-Paket als Datei vorliegt: Der Worker wird zur Laufzeit
   * über einen Pfad geladen, nicht über einen Import.
   */
  entry: ["src/server.ts", "src/modules/knowledge/ooxml-extractor-thread.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist-desktop",
  clean: true,
  sourcemap: false,
  noExternal: [/.*/],
  // Der Treiber lädt sein plattformspezifisches .node-Modul zur Laufzeit.
  external: ["better-sqlite3"],
  banner: {
    js: 'import { createRequire as __lifeosCreateRequire } from "node:module"; import { fileURLToPath as __lifeosFileUrlToPath } from "node:url"; import { dirname as __lifeosDirname } from "node:path"; const require = __lifeosCreateRequire(import.meta.url); const __filename = __lifeosFileUrlToPath(import.meta.url); const __dirname = __lifeosDirname(__filename);',
  },
});
