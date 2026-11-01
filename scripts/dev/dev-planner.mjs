import { spawn } from "node:child_process";
import { resolve } from "node:path";
import nextEnv from "@next/env";
const root = resolve(import.meta.dirname, "../..");
nextEnv.loadEnvConfig(root, true);
if (!process.env.DATABASE_WORKER_URL) throw new Error("Set the local worker database connection before starting web and worker.");
const children = [spawn(process.execPath, ["dist/planner-worker/main.js"], { cwd: root, stdio: "inherit" }),
  spawn(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "dev"], { cwd: root, stdio: "inherit" })];
let stopping = false;
function stop() { if (stopping) return; stopping = true; for (const child of children) child.kill("SIGTERM"); }
process.once("SIGINT", stop); process.once("SIGTERM", stop);
for (const child of children) child.once("exit", code => { if (!stopping) { process.exitCode = code ?? 1; stop(); } });
