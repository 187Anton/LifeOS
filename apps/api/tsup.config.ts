import { defineConfig } from "tsup";

export default defineConfig({
  /**
   * Der Server ist der Haupteinstieg. Die OOXML-Workerdatei ist ein eigener
   * Einstiegspunkt, weil sie zur Laufzeit über einen Pfad und nicht über einen
   * Import geladen wird: Sie wird dadurch als eigene Datei unter
   * `modules/knowledge/` ausgegeben und ist im gebündelten Laufzeitpaket
   * vorhanden. Genau diesen Ort erwartet `ooxml-extractor-worker.ts`.
   */
  entry: ["src/server.ts", "src/modules/knowledge/ooxml-extractor-thread.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  clean: true,
  sourcemap: true,
  // Workspace-Quellen werden gebündelt; Prisma und der CommonJS-Treiber
  // bleiben reguläre Node-Laufzeitabhängigkeiten.
  noExternal: ["@lifeos/contracts", "@lifeos/database"],
  external: ["pg", "better-sqlite3", /^@prisma\//],
});
