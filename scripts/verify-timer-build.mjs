/** Isolated production build: never changes the shared development output or
 * generated source files, never loads credentials from the repository .env. */
import { spawn,execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
const root = resolve(import.meta.dirname, "..");
const temporary = mkdtempSync(join(tmpdir(), "sylf-timer-build-"));
const evidenceArg = process.argv.indexOf("--evidence-dir");
if (evidenceArg !== -1 && !process.argv[evidenceArg + 1]) throw new Error("--evidence-dir requires a directory");
const evidence = resolve(root, evidenceArg === -1 ? "documentation/timer/reports/2026-10-14-lifecycle/evidence" : process.argv[evidenceArg + 1]);
mkdirSync(evidence, { recursive: true });
const startedAt = new Date().toISOString();
const sources=execFileSync("git",["ls-files","-z","--cached","--others","--exclude-standard"],{cwd:root,encoding:"utf8"}).split("\0").filter(file=>existsSync(join(root,file))&&/^(?:app|lib|design-system|__tests__)\//.test(file)&&/\.(?:ts|tsx|css)$/.test(file));
sources.push("package.json","package-lock.json","next.config.ts","tsconfig.json","postcss.config.mjs","proxy.ts");
const pins=Object.fromEntries([...new Set(sources)].sort().map(file=>[file,createHash("sha256").update(readFileSync(join(root,file))).digest("hex")]));
try {
  // The quality corpus imports synthetic fixtures, and the production typecheck
  // includes tests. Preserve those inputs in the private source copy too.
  for (const name of ["app", "lib", "design-system", "__tests__"]) if (existsSync(join(root, name))) cpSync(join(root, name), join(temporary, name), { recursive: true });
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
  writeFileSync(join(evidence, "web-build.log"), output);
  const changedDuringRun=Object.keys(pins).filter(file=>createHash("sha256").update(readFileSync(join(root,file))).digest("hex")!==pins[file]);
  const status = changedDuringRun.length || code !== 0 ? "FAILED" : "PASSED";
  writeFileSync(join(evidence, "web-build.json"), JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), status, code,
    sourceSha256:pins,changedDuringRun,
    command: "next build --webpack (private source copy)", credentialsLoaded: false,

    sharedGeneratedFilesModified: false }, null, 2) + "\n");
  process.stdout.write(`${status}\n`); if (status === "FAILED") process.exitCode = 1;
} finally { rmSync(temporary, { recursive: true, force: true }); }
