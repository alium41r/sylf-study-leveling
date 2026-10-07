/** Isolated production build: never changes the shared development output or
 * generated source files, never loads credentials from the repository .env. */
import { spawn,execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
const root = resolve(import.meta.dirname, "..");
const temporary = mkdtempSync(join(tmpdir(), "sylf-planner-step4-build-"));
const evidence = resolve(root, "documentation/planner/reports/2026-10-03-phase-2/evidence");
const startedAt = new Date().toISOString();
const sources=execFileSync("git",["ls-files","-z","--cached","--others","--exclude-standard"],{cwd:root,encoding:"utf8"}).split("\0").filter(file=>/^(?:app|lib|design-system)\//.test(file)&&/\.(?:ts|tsx|css)$/.test(file));
sources.push("package.json","package-lock.json","next.config.ts","tsconfig.json","postcss.config.mjs","proxy.ts");
const pins=Object.fromEntries([...new Set(sources)].sort().map(file=>[file,createHash("sha256").update(readFileSync(join(root,file))).digest("hex")]));
try {
  for (const name of ["app", "lib", "design-system"]) if (existsSync(join(root, name))) cpSync(join(root, name), join(temporary, name), { recursive: true });
  for (const name of ["package.json", "package-lock.json", "tsconfig.json", "next-env.d.ts", "next.config.ts", "proxy.ts", "postcss.config.mjs"]) cpSync(join(root, name), join(temporary, name));
  for (const name of ["node_modules", "public", "mobile", "archive"]) symlinkSync(join(root, name), join(temporary, name), "dir");
  const environment = Object.fromEntries(["PATH", "HOME", "TMPDIR", "SHELL", "USER", "LOGNAME"].filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]));
  const child = spawn(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "build", "--webpack"], {
    cwd: temporary, env: { ...environment, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = ""; child.stdout.on("data", chunk => { output += chunk; }); child.stderr.on("data", chunk => { output += chunk; });
  const timeout = setTimeout(() => child.kill("SIGTERM"), 300000);
  const code = await new Promise((resolve_, reject) => { child.once("error", reject); child.once("exit", resolve_); }); clearTimeout(timeout);
  output = output.replaceAll(temporary, "[isolated build workspace]");
  writeFileSync(join(evidence, "step4-build.log"), output);
  const known = /CURATED_SOUNDSCAPES|calculateScopeWeight/.test(output) && /not a valid Route export|not assignable to type.*never|does not satisfy the constraint/.test(output);
  const changedDuringRun=Object.keys(pins).filter(file=>createHash("sha256").update(readFileSync(join(root,file))).digest("hex")!==pins[file]);
  const status = changedDuringRun.length ? "FAILED" : code === 0 ? "PASSED" : known ? "PRE_EXISTING_ROUTE_EXPORT_BLOCKER" : "FAILED";
  writeFileSync(join(evidence, "step4-build.json"), JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), status, code,
    sourceSha256:pins,changedDuringRun,
    command: "next build --webpack (private source copy)", credentialsLoaded: false,
    baselineRouteErrors: readFileSync(join(evidence, "step1-baseline-typecheck.log"), "utf8").split("\n").filter(s => s.includes("error TS")),
    sharedGeneratedFilesModified: false }, null, 2) + "\n");
  process.stdout.write(`${status}\n`); if (status === "FAILED") process.exitCode = 1;
} finally { rmSync(temporary, { recursive: true, force: true }); }
