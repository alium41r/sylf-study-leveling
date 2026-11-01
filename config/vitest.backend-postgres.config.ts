import { defineConfig } from "vitest/config";
import path from "node:path";

// Route handlers against genuine PostgreSQL. Only scripts/test/test-backend-postgres.mjs runs this, because that is what supplies a disposable database.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".."), "server-only": path.resolve(import.meta.dirname, "../__tests__/planner/server-only-stub.ts") } },
  test: {
    environment: "node",
    include: ["__tests__/backend/postgres/*.postgres.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
