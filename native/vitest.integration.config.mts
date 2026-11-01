import path from "node:path";
import { defineConfig } from "vitest/config";

// The device client against a real local server. Only scripts/test/run-backend-local.mjs --native-checks runs this: that is what supplies one.
export default defineConfig({
  resolve: { dedupe: ["yjs", "zod"], alias: { yjs: path.resolve(import.meta.dirname, "node_modules/yjs"), zod: path.resolve(import.meta.dirname, "node_modules/zod") } },
  test: { environment: "node", include: ["packages/backend/integration/*.integration.ts"], fileParallelism: false, testTimeout: 30_000 },
});
