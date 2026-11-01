import path from "node:path";
import { defineConfig } from "vitest/config";

// Shared lib/ files live outside native/; dedupe forces their bare imports (yjs, zod) onto the native copies,
// mirroring the Metro single-copy rule.
export default defineConfig({
  resolve: { dedupe: ["yjs", "zod"], alias: { yjs: path.resolve(import.meta.dirname, "node_modules/yjs"), zod: path.resolve(import.meta.dirname, "node_modules/zod") } },
  test: {
    environment: "node",
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.{ts,mjs}", "tooling/**/*.test.{ts,mjs}"],
  },
});
