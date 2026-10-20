/** Reuse the disposable Phase 1 harness; never rewrite its historical evidence. */
import { spawn } from "node:child_process";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../..");
const child = spawn(process.execPath, ["scripts/test/test-planner-v2-phase1-postgres.mjs", ...process.argv.slice(2),
  "--evidence-dir", resolve(root, "documentation/planner/reports/2026-10-03-phase-2/evidence/step2-postgres"),
  "--extra-suite", "__tests__/planner-v2/postgres/intelligence-boundary.postgres.ts"], { cwd: root, stdio: "inherit" });
child.on("exit", code => { process.exitCode = code ?? 1; });
child.on("error", error => { process.stderr.write(error.message + "\n"); process.exitCode = 1; });
