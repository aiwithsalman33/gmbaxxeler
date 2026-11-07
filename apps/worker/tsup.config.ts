import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  outDir: "dist",
  clean: true,
  noExternal: [/^@localpilot\//],
  // Third-party packages load from node_modules. Prisma breaks if bundled into ESM.
  external: [/^(?!@localpilot\/)[a-z@][^:]*$/],
});
