import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "."), "server-only": path.resolve(import.meta.dirname, "__tests__/planner/server-only-stub.ts") } },
  test: {
    environment: "node",
    include: ["__tests__/planner-v2/postgres/*.postgres.ts"],
    fileParallelism: false,
    testTimeout: 10_000,
    hookTimeout: 15_000,
  },
});
