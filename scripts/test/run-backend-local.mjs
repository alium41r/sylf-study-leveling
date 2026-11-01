/** Starts the real Next.js server on a disposable PostgreSQL. Never accepts a database URL, and blanks every variable the source names.
 * Run it with the hosted variables overridden on the same command, as every local backend command here is:
 *   DATABASE_URL=postgresql://localhost/none DIRECT_URL=postgresql://localhost/none DATABASE_WORKER_URL=postgresql://localhost/none UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= \
 *   node scripts/test/run-backend-local.mjs --smoke [--build] [--out <evidence dir>]    build if asked, run the HTTP smoke test, stop everything
 *   ... node scripts/test/run-backend-local.mjs --serve [--dev] [--port 3111]           keep serving until Ctrl-C, for a client to talk to
 *   ... node scripts/test/run-backend-local.mjs --native-checks [--electron] [--build]  Sylf Native's client against this server: the device client's integration suite, and with --electron the real Electron window. Build `native/` first for that (`npm run build:web`)
 *   ... node scripts/test/run-backend-local.mjs --journey [--build] [--out <dir>]       the whole student journey in real Electron, as two processes on one profile, so a restart is a real restart. Build `native/` first
 * Without --dev it needs a build (`--build`). Redis, Supabase storage, Realtime, email and AI providers are off, and those paths use their fallbacks.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { backendEnvironment, buildSchemaFromMigrations, root, startDisposablePostgres } from "./lib/disposable-backend.mjs";

const args = process.argv.slice(2);
const has = name => args.includes(name);
const value = (name, fallback) => { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1]; };
const port = Number(value("--port", "3111"));
const out = resolve(root, value("--out", "documentation/native/reports/phase-11/evidence"));
const base = `http://127.0.0.1:${port}`;
const next = join(root, "node_modules/.bin/next");

const backend = await startDisposablePostgres({ log: message => console.error(message) });
let server; const report = { schemaVersion: 1, startedAt: new Date().toISOString(), steps: [] };
const stop = () => { server?.kill("SIGTERM"); backend.stop(); };
process.on("SIGINT", () => { stop(); process.exit(130); });

async function ready() {
  for (let attempt = 0; attempt < 240; attempt++) {
    try { const response = await fetch(`${base}/api/auth/check-username?username=probe_name`); if (response.status < 500) return; } catch { /* Not listening yet. */ }
    await new Promise(done => setTimeout(done, 500));
  }
  throw new Error("The server did not become ready.");
}

function cookieJar() {
  let cookie = "";
  return {
    call: async (path, { method = "GET", body, headers = {}, jar = true } = {}) => {
      const started = performance.now();
      const response = await fetch(`${base}${path}`, { method, redirect: "manual", headers: { ...(jar && cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}), "user-agent": "Mozilla/5.0 (Macintosh) sylf-smoke", ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const text = await response.text();
      const set = response.headers.getSetCookie().find(line => line.startsWith("hunter_token="));
      if (set) cookie = set.split(";")[0];
      let json = null; try { json = JSON.parse(text); } catch { /* Not JSON. */ }
      return { status: response.status, json, ms: Math.round(performance.now() - started), bytes: text.length };
    },
    get cookie() { return cookie; },
  };
}

/** Runs a Sylf Native check against this server. Its environment holds nothing of the application's: it talks to the server over HTTP like any client. */
function nativeCheck(file, args, extra, timeout = 300_000) {
  const environment = { ...Object.fromEntries(["PATH", "HOME", "TMPDIR", "USER", "LOGNAME", "SHELL"].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]])), ...extra };
  try { execFileSync(file, args, { cwd: join(root, "native"), env: environment, stdio: "inherit", timeout }); return true; }
  catch { return false; }
}

async function nativeChecks() {
  mkdirSync(out, { recursive: true });
  report.nativeIntegration = nativeCheck("npm", ["run", "test:integration", "--", "--reporter=default", "--reporter=json", `--outputFile.json=${join(out, "native-integration.json")}`], { SYLF_BACKEND_TEST_ORIGIN: base });
  if (!report.nativeIntegration) report.failed = true;
  if (has("--electron")) {
    report.electron = nativeCheck("npm", ["--workspace", "@sylf/desktop", "run", "backend-check"], { SYLF_BACKEND_TARGET: base, SYLF_BACKEND_CHECK_OUT: join(out, "electron-backend-check.json") });
    if (!report.electron) report.failed = true;
  }
}

/** Two processes and one profile: what crosses between them is what a real restart keeps. The profile is thrown away afterwards. */
function journey() {
  mkdirSync(out, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), "sylf-journey-"));
  const run = stage => nativeCheck("npm", ["--workspace", "@sylf/desktop", "run", "journey-check"], { SYLF_BACKEND_TARGET: base, SYLF_JOURNEY_OUT: out, SYLF_JOURNEY_PROFILE: profile, SYLF_JOURNEY_STAGE: stage }, 540_000);
  report.journeyFirst = run("first");
  report.journeySecond = report.journeyFirst && run("second");
  rmSync(profile, { recursive: true, force: true });
  if (!report.journeyFirst || !report.journeySecond) report.failed = true;
}

async function smoke() {
  const step = (name, ok, detail) => { report.steps.push({ name, ok, ...detail }); console.log(`${ok ? "ok  " : "FAIL"} ${name}`); if (!ok) report.failed = true; };
  const tag = Date.now().toString(36); const email = `smoke_${tag}@local.test`; const password = "a-long-enough-password";
  const phone = cookieJar(); const laptop = cookieJar();
  let result = await phone.call("/api/auth/register", { method: "POST", body: { email, password, name: "Smoke", username: `smoke_${tag}`, timezone: "UTC" } });
  step("register sets a cookie", result.status === 201 && Boolean(phone.cookie), { status: result.status, ms: result.ms });
  result = await phone.call("/api/user/stats"); step("cookie reaches a protected route", result.status === 200, { status: result.status, ms: result.ms });
  const token = phone.cookie.split("=")[1];
  result = await phone.call("/api/user/stats", { jar: false, headers: { authorization: `Bearer ${token}` } });
  step("a bearer header is still refused", result.status === 401, { status: result.status });
  result = await laptop.call("/api/auth/login", { method: "POST", body: { identifier: email, password } });
  step("second device signs in", result.status === 200, { status: result.status, ms: result.ms });
  result = await laptop.call("/api/user/sessions");
  step("both devices are listed", result.json?.sessions?.length === 2, { status: result.status, count: result.json?.sessions?.length });
  const other = result.json?.sessions?.find(session => !session.isCurrent);
  await laptop.call("/api/user/sessions", { method: "DELETE", body: { sessionId: other?.id } });
  result = await phone.call("/api/user/stats");
  step("a revoked device is out on its next request", result.status === 401, { status: result.status });
  const key = crypto.randomUUID(); const startedAt = new Date(Date.now() - 120_000).toISOString();
  result = await laptop.call("/api/sessions", { method: "POST", body: { executionProtocol: 2, clientSessionKey: key, startedAt } });
  step("a study session starts", result.status === 201 && Number.isInteger(result.json?.id), { status: result.status, ms: result.ms });
  const session = result.json;
  const replay = await laptop.call("/api/sessions", { method: "POST", body: { executionProtocol: 2, clientSessionKey: key, startedAt } });
  step("a replayed start makes no second session", replay.json?.id === session?.id, { status: replay.status });
  result = await laptop.call("/api/sessions", { method: "PATCH", body: { executionTransition: { schemaVersion: 2, sessionId: session?.id, action: "END", expectedExecutionVersion: session?.execution?.executionVersion, idempotencyKey: crypto.randomUUID(), cumulativeFocusSeconds: 90, cumulativeBreakSeconds: 0 } } });
  step("it settles through the server", result.status === 200 && result.json?.execution?.state === "ENDED", { status: result.status, ms: result.ms, accepted: result.json?.execution?.acceptedFocusSeconds });
  for (const path of ["/api/user/rankings", "/api/friends", "/api/quests/weekly", "/api/goals", "/api/subjects", "/api/achievements", "/api/acoustics", "/api/focus-backgrounds", "/api/focus-party", "/api/calendar/month", "/api/cosmetics", "/api/inventory", "/api/user/detailed-stats", "/api/planner"]) {
    result = await laptop.call(path); step(`GET ${path}`, result.status === 200, { status: result.status, ms: result.ms, bytes: result.bytes });
  }
  result = await laptop.call("/dashboard", { jar: false }); step("the edge proxy still redirects a guest", result.status === 307, { status: result.status });
  const third = cookieJar(); await third.call("/api/auth/login", { method: "POST", body: { identifier: email, password } }); const held = third.cookie;
  await third.call("/api/auth/logout", { method: "POST" });
  result = await third.call("/api/user/stats", { jar: false, headers: { cookie: held } });
  step("a token copied before logout is dead after it", result.status === 401, { status: result.status });
}

let exit = 0;
try {
  const build = await buildSchemaFromMigrations(backend.url);
  report.schema = { migrations: build.migrations.length, recovered: build.migrations.filter(entry => entry.recovered).length, unresolved: build.migrations.flatMap(entry => entry.remaining ?? []).length };
  const dev = has("--dev");
  const environment = backendEnvironment(backend.url, { NODE_ENV: dev ? "development" : "production", NODE_OPTIONS: "--max-old-space-size=3072" });
  if (has("--build")) {
    const started = Date.now();
    execFileSync(next, ["build"], { cwd: root, env: environment, stdio: "pipe", timeout: 590_000, maxBuffer: 256 * 1024 * 1024 });
    report.buildSeconds = Math.round((Date.now() - started) / 1000);
    console.log(`Build passed in ${report.buildSeconds} s`);
  }
  server = spawn(next, [dev ? "dev" : "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: root, env: environment, stdio: ["ignore", "pipe", "pipe"] });
  const logs = []; const keep = chunk => { logs.push(String(chunk)); if (logs.length > 400) logs.shift(); };
  server.stdout.on("data", keep); server.stderr.on("data", keep);
  await ready();
  if (has("--serve")) { console.log(`Serving ${base} on a disposable database. Ctrl-C stops both.`); await new Promise(() => {}); }
  if (has("--journey")) journey(); else if (has("--native-checks")) await nativeChecks(); else await smoke();
  report.serverErrors = logs.join("").split("\n").filter(line => /error/i.test(line)).map(line => backend.redact(line).slice(0, 200)).slice(0, 30);
  if (report.failed) exit = 1;
} catch (error) {
  console.error(backend.redact(`${error.message}\n${String(error.stderr ?? "").slice(-3000)}\n${String(error.stdout ?? "").slice(-3000)}`)); report.error = backend.redact(error.message).slice(0, 500); exit = 1;
} finally {
  stop();
  report.finishedAt = new Date().toISOString();
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, has("--journey") ? "journey-server.json" : has("--native-checks") ? "native-checks.json" : "http-smoke.json"), JSON.stringify(report, null, 1) + "\n");
  process.exitCode = exit;
}
