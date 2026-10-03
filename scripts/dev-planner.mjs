import { spawn } from "node:child_process";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
if (!process.env.DATABASE_WORKER_URL) throw new Error("Set the local worker database connection before starting web and worker.");
const children = [spawn(process.execPath, ["dist/planner-worker/main.js"], { cwd: root, stdio: "inherit" }),
  spawn(resolve(root, "node_modules/.bin/next"), ["dev"], { cwd: root, stdio: "inherit" })];
let stopping = false;
function stop() { if (stopping) return; stopping = true; for (const child of children) child.kill("SIGTERM"); }
process.once("SIGINT", stop); process.once("SIGTERM", stop);
for (const child of children) child.once("exit", code => { if (!stopping) { process.exitCode = code ?? 1; stop(); } });
