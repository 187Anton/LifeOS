import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  clean: true,
  sourcemap: true,
  // Workspace-Quellen werden gebündelt; Prisma und der CommonJS-Treiber
  // bleiben reguläre Node-Laufzeitabhängigkeiten.
  noExternal: ["@lifeos/contracts", "@lifeos/database"],
  external: ["pg", /^@prisma\//],
});
