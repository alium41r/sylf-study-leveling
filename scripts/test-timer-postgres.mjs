/** Timer lifecycle: disposable, genuine PostgreSQL. Never accepts a database URL.
 * node scripts/test-timer-postgres.mjs [--native-bin /absolute/bin]
 * Docker is tried first. Native binaries may be used without installing a service.
 * Reuses the audited Planner bootstrap; never reads hosted database credentials.
 */
import { execFileSync } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { createServer } from "node:net";
import pg from "pg";

const root = resolve(import.meta.dirname, "..");
let evidence = join(root, "documentation/timer/reports/2026-10-14-lifecycle/evidence");
const temporary = mkdtempSync(join(tmpdir(), "sylf-planner-v2-pg-"));
const nonce = randomBytes(8).toString("hex");
const database = `sylf_planner_phase1_${nonce}`;
const container = `sylf-planner-phase1-${nonce}`;
const password = randomBytes(24).toString("hex");
const marker = randomBytes(24).toString("hex");
const arguments_ = process.argv.slice(2);
let nativeBin;
while (arguments_.length) {
  const flag = arguments_.shift(); const value = arguments_.shift();
  if (flag === "--native-bin" && value && isAbsolute(value)) nativeBin = value;
  else throw new Error("Usage: node scripts/test-timer-postgres.mjs [--native-bin /absolute/bin]");
}

// No dotenv, inherited PostgreSQL settings or provider/hosted credentials.
const environment = Object.fromEntries(["PATH", "HOME", "TMPDIR", "USER", "LOGNAME", "SHELL", "SystemRoot"]
  .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
const digest = value => createHash("sha256").update(value).digest("hex");
const safe = value => String(value).replaceAll(password, "[redacted]").replaceAll(marker, "[redacted]")
  .replace(/postgres(?:ql)?:\/\/[^\s"']+/g, "[disposable database URL]");
const run = (file, args, options = {}) => execFileSync(file, args, {
  cwd: root, encoding: "utf8", stdio: "pipe", timeout: 60_000, env: environment, ...options,
});
const outcome = {
  schemaVersion: 1, startedAt: new Date().toISOString(), status: "RUNNING",
  database: "generated disposable loopback database", runtime: null,
  requiredSkippedTests: 0, requiredResults: [], migrations: [],
  limitations: ["Audited schema bootstrap, not replay of the incomplete historical migration chain.",
    "Phase 1 actual services/SQL are exercised; no hosted data is touched."],
};
let runtime;
let url;
let client;
const binary = name => join(nativeBin, name);

async function freePort() {
  const server = createServer();
  await new Promise((resolve_, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve_); });
  const port = server.address().port;
  await new Promise(resolve_ => server.close(resolve_));
  return port;
}
async function readiness() {
  for (let i = 0; i < 30; i++) {
    const probe = new pg.Client({ connectionString: url, connectionTimeoutMillis: 1000 });
    try { await probe.connect(); await probe.query("SELECT 1"); return; }
    catch { await new Promise(resolve_ => setTimeout(resolve_, 250)); }
    finally { await probe.end().catch(() => {}); }
  }
  throw new Error("Disposable PostgreSQL failed readiness; no tests were skipped.");
}
const connection = port => {
  const result = new URL(`postgresql://127.0.0.1/${database}`);
  result.username = "postgres"; result.password = password; result.port = String(port);
  return result.toString();
};

const migrationNames = [
  "20260822000000_atomic_apex_forge_and_skill_unlock_rpcs",
  "20260822010000_atomic_session_and_achievement_rpcs",
  "20260826110000_t3_settle_insert_wall_clamp",
  "20260827000000_s2_security_hardening",
  "20260827010000_s2_policy_jwt_semantics",
  "20260827020000_s2_policy_recursion_fix",
  "20260827030000_cognitive_stats_effects",
  "20260827040000_fix_apex_synthesis_threshold",
  "20260827050000_sp_stipend_level_rank_ups",
  "20260907000000_focus_party_foundation",
  "20260907010000_focus_party_security_hardening",
  "20260907020000_focus_party_realtime_security",
  "20260907030000_focus_party_single_active_membership",
  "20260924010000_planner_foundation",
  "20260925152657_planner_check_result",
  "20260926010000_planner_preference_friction",
  "20260926020000_planner_intake_session",
  "20260926030000_subject_archived_at",
  "20260927090000_planner_user_released_disposition",
  "20260927100000_planner_reoffer_state",
  "20261002000000_planner_v2_durable_core",
  "20261004000000_planner_v2_assistant_documents",
  "20261014000000_timer_durable_completion",
];
function checkReport(label, reportPath, expectedFiles, commandError) {
  if (!existsSync(reportPath)) throw new Error(`${label}: runner produced no report (${commandError ? "command failed" : "missing report"}).`);
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const files = report.testResults ?? [];
  for (const expected of expectedFiles) {
    if (!files.some(file => file.name?.endsWith(expected))) throw new Error(`${label}: required suite missing: ${expected}`);
  }
  const assertions = files.flatMap(file => file.assertionResults ?? []);
  const skipped = assertions.filter(test => ["pending", "skipped", "todo", "disabled"].includes(test.status));
  const forbidden = skipped;
  const failed = assertions.filter(test => test.status === "failed");
  const passed = assertions.filter(test => test.status === "passed");
  const summary = { label, files: files.length, passed: passed.length, failed: failed.length,
    requiredSkipped: forbidden.length, optionalProviderExcluded: skipped.length - forbidden.length,
    failures: failed.map(test => ({ name: test.fullName, messages: test.failureMessages?.map(safe) })),
  };
  outcome.requiredResults.push(summary); outcome.requiredSkippedTests += forbidden.length;
  const suites = files.map(file => ({ name: safe(file.name),
    cases: (file.assertionResults ?? []).map(test => ({ name: safe(test.fullName), status: test.status })),
  }));
  writeFileSync(join(evidence, `postgres-${label}-results.json`), JSON.stringify({ ...summary, suites }, null, 2) + "\n");
  if (!passed.length || forbidden.length || failed.length || commandError || files.some(file => file.status === "failed")) {
    // Preserve actionable diagnostics before removing the disposable cluster.
    // Runtime URLs/passwords and the marker are scrubbed by the same boundary.
    if (commandError) console.error(safe(String(commandError.stderr ?? "").slice(-16_000)));
    throw new Error(`${label}: required PostgreSQL gate failed (${failed.length} failures, ${forbidden.length} required skips).`);
  }
}

try {
  let dockerReady = false;
  try { if (!nativeBin) { run("docker", ["info", "--format", "{{.ServerVersion}}"], { timeout: 5000 }); dockerReady = true; } }
  catch { /* Try native next, but never accept a substitute database URL. */ }
  if (dockerReady) {
    run("docker", ["run", "--detach", "--name", container, "--publish", "127.0.0.1::5432",
      "--env", `POSTGRES_PASSWORD=${password}`, "--env", `POSTGRES_DB=${database}`, "postgres:17"], { timeout: 120_000 });
    runtime = "docker";
    const port = Number(run("docker", ["port", container, "5432/tcp"]).trim().split(":").at(-1));
    if (!Number.isInteger(port) || port < 1) throw new Error("Invalid generated Docker port.");
    url = connection(port);
  } else {
    if (!nativeBin) {
      for (const candidate of ["/opt/homebrew/opt/postgresql@17/bin", "/opt/homebrew/opt/postgresql@16/bin",
        "/usr/local/opt/postgresql@17/bin", "/Applications/Postgres.app/Contents/Versions/latest/bin"]) {
        if (["initdb", "pg_ctl", "postgres"].every(name => existsSync(join(candidate, name)))) { nativeBin = candidate; break; }
      }
    }
    if (!nativeBin || !["initdb", "pg_ctl", "postgres"].every(name => existsSync(binary(name)))) {
      throw new Error("RUNTIME_UNAVAILABLE: working Docker daemon or native PostgreSQL binaries required. PGlite/hosted DB are not permitted. Required suites did not run.");
    }
    const data = join(temporary, "data"); const port = await freePort();
    const passwordFile = join(temporary, "password"); writeFileSync(passwordFile, password + "\n", { mode: 0o600 });
    run(binary("initdb"), ["-D", data, "-U", "postgres", "--auth-host=scram-sha-256", "--auth-local=trust", "--pwfile", passwordFile]);
    run(binary("pg_ctl"), ["-D", data, "-l", join(temporary, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -k ${temporary}`, "-w", "start"]);
    runtime = "native";
    const bootstrapConnection = connection(port).replace(`/${database}`, "/postgres");
    const admin = new pg.Client({ connectionString: bootstrapConnection });
    try { await admin.connect(); await admin.query(`CREATE DATABASE "${database}"`); } finally { await admin.end(); }
    url = connection(port);
  }
  outcome.runtime = runtime; await readiness();
  const sourceSchema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
  const timerBaseline = sourceSchema.replace(/\nmodel TimerSessionStart \{[\s\S]*?\n\}\n/g, "\n")
    .replace(/^\s*(?:timerStarts\s+TimerSessionStart\[\]|timerTimeline\s+Json\?).*\n/gm, "");
  const preV2Schema = timerBaseline.replace(/^\s*(?:plannedMinutes|remainingMinutesEstimate|remainingEstimateBasisActualSeconds|remainingDisposition|executionVersion|plannerSpec|plannerSpecDigest|executionState|transitionReceipts|executionContext|runningSince|acceptedFocusAtResume|acceptedBreakAtResume)\s+.*\n/gm, "")
    .replace(/model AiUsageLog \{[\s\S]*?\n\}/, block => block.replace(/^\s*(?:requestId|rootRequestId|reservation|attemptId|stage|accountingState)\s+.*\n/gm, "").replace(/estimatedCostUsd Float\?/, "estimatedCostUsd Float"));
  const baselineSchema = preV2Schema.replace(/\nmodel Planner[A-Za-z]+ \{[\s\S]*?\n\}\n/g, "\n")
    .replace(/^\s*\w+\s+Planner[A-Za-z]+(?:\[\]|\?).*\n/gm, "");
  const schemaPath = join(temporary, "before.prisma"); writeFileSync(schemaPath, baselineSchema);
  const migrations = join(temporary, "migrations"); mkdirSync(migrations);
  const stage = (name, sql) => { const dir = join(migrations, name); mkdirSync(dir); writeFileSync(join(dir, "migration.sql"), sql); };
  const config = join(temporary, "prisma.config.ts");
  writeFileSync(config, `export default ${JSON.stringify({ schema: join(root, "prisma/schema.prisma"), migrations: { path: migrations }, datasource: { url } })};\n`, { mode: 0o600 });
  const prisma = join(root, "node_modules/.bin/prisma");
  const baseline = run(prisma, ["migrate", "diff", "--from-empty", "--to-schema", schemaPath, "--script", "--config", config]);
  const platform = `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE supabase_admin;
CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE PUBLICATION supabase_realtime;\n`;
  const retiredSources = ["20260821000000_add_user_stats_and_progression_rpc", "20260821020000_add_skill_tree_rpc", "20260821030000_add_concept_forge_rpc"];
  let retiredDefinitions = "";
  outcome.retiredFunctionSources = retiredSources.map(name => {
    const text = readFileSync(join(root,"prisma/migrations",name,"migration.sql"),"utf8");
    const definition = text.match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/)?.[0];
    if (!definition) throw new Error("Historical retired function definition missing");
    retiredDefinitions += "\n" + definition;
    return { name, sha256:digest(text) };
  });
  stage("00000000000000_audited_schema", platform + baseline + retiredDefinitions);
  outcome.schemaDigest = digest(sourceSchema);
  for (const name of migrationNames) {
    const sql = readFileSync(join(root, "prisma/migrations", name, "migration.sql"), "utf8");
    stage(name, sql); outcome.migrations.push({ name, sha256: digest(sql) });
  }
  copyFileSync(join(root, "prisma/migrations/migration_lock.toml"), join(migrations, "migration_lock.toml"));
  run(prisma, ["migrate", "deploy", "--config", config], { timeout: 120_000 });
  client = new pg.Client({ connectionString: url }); await client.connect();
  const identity = (await client.query("SELECT current_database() AS database, host(inet_server_addr()) AS address, current_setting('server_version_num')::int AS version")).rows[0];
  outcome.runtimeIdentity = { databaseMatches: identity.database === database, address: identity.address, version: identity.version };
  if (identity.database !== database || (runtime === "native" && identity.address !== "127.0.0.1") || identity.version < 150000) throw new Error("Disposable runtime identity check failed.");
  outcome.postgresVersion = identity.version;
  await client.query("CREATE TABLE public.__planner_phase0_identity (token text PRIMARY KEY)");
  await client.query("INSERT INTO public.__planner_phase0_identity VALUES ($1)", [marker]);
  mkdirSync(evidence, { recursive: true });
  const childEnvironment = { ...environment, PLANNER_TEST_DATABASE_URL: url, DATABASE_URL: url, DIRECT_URL: url,
    PLANNER_PHASE0_DATABASE_MARKER: marker, PLANNER_PHASE0_REQUIRED: "true", JWT_SECRET: "planner-phase0-disposable-test-secret",
    JWT_ISSUER: "sylf", JWT_AUDIENCE: "sylf-app", CRON_SECRET: "planner-phase0-disposable-cron", TOOL_CONFIRMATION_SECRET: "planner-phase0-disposable-tool" };
  const report = join(temporary, "timer-report.json");
  const suites = ["__tests__/planner-v2/postgres/timer-lifecycle.postgres.ts", "__tests__/planner-v2/postgres/durable-core.postgres.ts",
    "__tests__/planner-v2/postgres/lifecycle-projection.postgres.ts", "__tests__/planner-v2/postgres/coordinated-routes.postgres.ts",
    "__tests__/planner-v2/postgres/separate-connection-concurrency.postgres.ts", "__tests__/planner-v2/postgres/current-sql-invariants.postgres.ts"];
  let failure;
  try { run(join(root, "node_modules/.bin/vitest"), ["run", "--config", "vitest.planner-v2-postgres.config.ts", "--reporter=json", "--outputFile", report, ...suites], { env: childEnvironment, timeout: 120_000 }); }
  catch (error) { failure = error; }
  checkReport("timer", report, suites, failure);
  outcome.status = "PASSED";
  console.log("Timer settlement, migration, replay and concurrency tests passed on disposable PostgreSQL.");
} catch (error) {
  outcome.status = "FAILED"; outcome.error = safe(error.message);
  console.error(safe(error.message)); process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
  try {
    if (runtime === "docker") run("docker", ["rm", "--force", "--volumes", container]);
    if (runtime === "native") run(binary("pg_ctl"), ["-D", join(temporary, "data"), "-m", "immediate", "-w", "stop"]);
    outcome.cleanup = runtime ? "Disposable server stopped; cluster/container removed." : "No server started.";
  } catch (error) { outcome.status = "FAILED"; outcome.cleanupError = safe(error.message); process.exitCode = 1; }
  outcome.finishedAt = new Date().toISOString();
  if (!outcome.cleanupError) rmSync(temporary, { recursive: true, force: true });
  else outcome.cleanupRecoveryPath = temporary;
  mkdirSync(evidence, { recursive: true });
  writeFileSync(join(evidence, "postgres-harness-run.json"), JSON.stringify(outcome, null, 2) + "\n");
}
