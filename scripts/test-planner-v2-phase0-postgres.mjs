/** Phase 0: disposable, genuine PostgreSQL. Never accepts a database URL.
 * node scripts/test-planner-v2-phase0-postgres.mjs [--native-bin /absolute/bin]
 * Docker is tried first. Native binaries may be used without installing a service.
 * Required suites fail closed; Phase 1 guarantees are not implemented by this runner.
 */
import { execFileSync } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { createServer } from "node:net";
import pg from "pg";

const root = resolve(import.meta.dirname, "..");
const evidence = join(root, "documentation/planner/reports/2026-10-02-phase-0/evidence");
const temporary = mkdtempSync(join(tmpdir(), "sylf-planner-v2-pg-"));
const nonce = randomBytes(8).toString("hex");
const database = `sylf_planner_phase0_${nonce}`;
const container = `sylf-planner-phase0-${nonce}`;
const password = randomBytes(24).toString("hex");
const marker = randomBytes(24).toString("hex");
const arguments_ = process.argv.slice(2);
let nativeBin;
if (arguments_.length) {
  if (arguments_.length !== 2 || arguments_[0] !== "--native-bin" || !isAbsolute(arguments_[1])) {
    throw new Error("Usage: node scripts/test-planner-v2-phase0-postgres.mjs [--native-bin /absolute/bin]");
  }
  nativeBin = arguments_[1];
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
    "Current services/SQL and PostgreSQL concurrency prerequisites only; V2 worker/apply are not implemented."],
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
  "20260924010000_planner_foundation",
  "20260925152657_planner_check_result",
  "20260926010000_planner_preference_friction",
  "20260926020000_planner_intake_session",
  "20260926030000_subject_archived_at",
  "20260927090000_planner_user_released_disposition",
  "20260927100000_planner_reoffer_state",
];
const currentRequired = [
  "database.test.ts", "database-check-result.test.ts", "database-intake-session.test.ts",
  "database-intake-service.test.ts", "database-scope-confirmation.test.ts", "database-mastery.test.ts",
  "database-rebalance.test.ts", "database-rebalance-modes.test.ts", "database-rebalance-bounds.test.ts",
  "database-replan-context.test.ts", "database-stretch.test.ts", "database-phase3.test.ts",
  "database-preference-friction.test.ts", "database-research-e2e.test.ts", "database-designer.test.ts",
  "database-copilot.test.ts", "database-unlimited-entitlement.test.ts",
].map(name => `__tests__/planner/${name}`);
// The provider experiment in the current suite is deliberately not a DB gate.
// It cannot run: child environment contains no provider keys. No integrity test is exempt.
const optionalProviderName = "live synthetic Exam generation, recovery and confirmation on disposable PostgreSQL";

function checkReport(label, reportPath, expectedFiles, commandError) {
  if (!existsSync(reportPath)) throw new Error(`${label}: runner produced no report (${commandError ? "command failed" : "missing report"}).`);
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const files = report.testResults ?? [];
  for (const expected of expectedFiles) {
    if (!files.some(file => file.name?.endsWith(expected))) throw new Error(`${label}: required suite missing: ${expected}`);
  }
  const assertions = files.flatMap(file => file.assertionResults ?? []);
  const skipped = assertions.filter(test => ["pending", "skipped", "todo", "disabled"].includes(test.status));
  const forbidden = skipped.filter(test => !(label === "current" && test.fullName?.endsWith(optionalProviderName)));
  const failed = assertions.filter(test => test.status === "failed");
  const passed = assertions.filter(test => test.status === "passed");
  const summary = { label, files: files.length, passed: passed.length, failed: failed.length,
    requiredSkipped: forbidden.length, optionalProviderExcluded: skipped.length - forbidden.length,
    failures: failed.map(test => ({ name: test.fullName, messages: test.failureMessages?.map(safe) })),
  };
  outcome.requiredResults.push(summary); outcome.requiredSkippedTests += forbidden.length;
  writeFileSync(join(evidence, `postgres-${label}-results.json`), JSON.stringify(summary, null, 2) + "\n");
  if (!passed.length || forbidden.length || failed.length || commandError || files.some(file => file.status === "failed")) {
    throw new Error(`${label}: required PostgreSQL gate failed (${failed.length} failures, ${forbidden.length} required skips).`);
  }
}

try {
  let dockerReady = false;
  try { run("docker", ["info", "--format", "{{.ServerVersion}}"], { timeout: 5000 }); dockerReady = true; }
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
  const baselineSchema = sourceSchema.replace(/\nmodel Planner[A-Za-z]+ \{[\s\S]*?\n\}\n/g, "\n")
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
  stage("00000000000000_audited_schema", platform + baseline);
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
  let newError;
  const newReport = join(temporary, "phase0-report.json");
  try { run(join(root, "node_modules/.bin/vitest"), ["run", "--config", "vitest.planner-v2-postgres.config.ts", "--reporter=json", "--outputFile", newReport], { env: childEnvironment, timeout: 180_000 }); }
  catch (error) { newError = error; }
  checkReport("phase0", newReport, ["__tests__/planner-v2/postgres/current-sql-invariants.postgres.ts", "__tests__/planner-v2/postgres/separate-connection-concurrency.postgres.ts"], newError);
  const currentReport = join(temporary, "current-report.json"); let currentError;
  try { run(join(root, "node_modules/.bin/vitest"), ["run", "--no-file-parallelism", "--reporter=json", "--outputFile", currentReport, ...currentRequired], { env: childEnvironment, timeout: 240_000 }); }
  catch (error) { currentError = error; }
  checkReport("current", currentReport, currentRequired, currentError);
  outcome.status = "PASSED";
  console.log("Phase 0 PostgreSQL gate passed: actual SQL, separate backend concurrency and required current suites. V2 Phase 1 remains unimplemented.");
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
