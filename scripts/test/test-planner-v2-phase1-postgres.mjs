/** Phase 1: disposable, genuine PostgreSQL. Never accepts a database URL.
 * node scripts/test/test-planner-v2-phase1-postgres.mjs [--native-bin /absolute/bin]
 * Docker is tried first. Native binaries may be used without installing a service.
 * Required suites fail closed; Phase 1 guarantees are not implemented by this runner.
 */
import { execFileSync, spawn } from "node:child_process";
import { SignJWT } from "jose";
import { randomBytes, createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, cpSync, symlinkSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { createServer } from "node:net";
import pg from "pg";

const root = resolve(import.meta.dirname, "../..");
let evidence = join(root, "documentation/planner/reports/2026-10-02-phase-1/evidence");
const temporary = mkdtempSync(join(tmpdir(), "sylf-planner-v2-pg-"));
const nonce = randomBytes(8).toString("hex");
const database = `sylf_planner_phase1_${nonce}`;
const container = `sylf-planner-phase1-${nonce}`;
const password = randomBytes(24).toString("hex");
const marker = randomBytes(24).toString("hex");
const arguments_ = process.argv.slice(2);
const browserRequested = arguments_.includes("--browser");
if (browserRequested) arguments_.splice(arguments_.indexOf("--browser"), 1);
let nativeBin;
const liveQualification = arguments_.includes("--live-qualification");
if(liveQualification)arguments_.splice(arguments_.indexOf("--live-qualification"),1);
const liveNonGemini=arguments_.includes("--live-non-gemini");
if(liveNonGemini){if(!liveQualification)throw new Error("Non-Gemini override is qualification-only");arguments_.splice(arguments_.indexOf("--live-non-gemini"),1);}
const liveExistingGroq=arguments_.includes("--live-existing-groq");
if(liveExistingGroq){if(!liveQualification||!liveNonGemini)throw new Error("Existing Groq comparison is non-Gemini qualification-only");arguments_.splice(arguments_.indexOf("--live-existing-groq"),1);}
const liveLowReasoning=arguments_.includes("--live-low-reasoning");
if(liveLowReasoning){if(!liveQualification||!liveNonGemini||liveExistingGroq)throw new Error("Low-reasoning trial requires explicit non-Gemini live qualification");arguments_.splice(arguments_.indexOf("--live-low-reasoning"),1);}
const liveHighReasoning=arguments_.includes("--live-high-reasoning");
if(liveHighReasoning){if(!liveQualification||!liveNonGemini||liveExistingGroq||liveLowReasoning)throw new Error("High-reasoning trial requires exclusive non-Gemini DeepSeek qualification");arguments_.splice(arguments_.indexOf("--live-high-reasoning"),1);}
let liveTemperature;
if(arguments_.includes("--live-temperature")){const i=arguments_.indexOf("--live-temperature");liveTemperature=arguments_[i+1];if(!liveQualification||!liveNonGemini||liveLowReasoning||liveHighReasoning||!['0.2','0.7'].includes(liveTemperature))throw new Error("Only explicit recorded non-thinking qualification sampling trials are permitted");arguments_.splice(i,2);}
let liveReviewTemperature;
if(arguments_.includes("--live-review-temperature")){const i=arguments_.indexOf("--live-review-temperature");liveReviewTemperature=arguments_[i+1];if(!liveQualification||!liveNonGemini||liveLowReasoning||liveHighReasoning||liveTemperature!=="0.7"||liveReviewTemperature!=="0.2")throw new Error("Review sampling requires explicit non-thinking 0.7 generation and 0.2 review");arguments_.splice(i,2);}
const liveReviewLowReasoning=arguments_.includes("--live-review-low-reasoning");
if(liveReviewLowReasoning){if(!liveQualification||liveExistingGroq||!liveNonGemini||liveLowReasoning||liveHighReasoning||liveReviewTemperature!==undefined||liveTemperature!=="0.7")throw new Error("Review-only thinking requires explicit non-thinking0.7generation and no review sampling override");arguments_.splice(arguments_.indexOf("--live-review-low-reasoning"),1);}
const liveProductionSettings=arguments_.includes("--live-production-settings");
if(liveProductionSettings){if(!liveQualification||!liveNonGemini||liveExistingGroq||liveLowReasoning||liveHighReasoning||liveTemperature!==undefined||liveReviewTemperature!==undefined||liveReviewLowReasoning)throw new Error("Production options exclude every model-comparison override");arguments_.splice(arguments_.indexOf("--live-production-settings"),1);}
const liveDisabledThinking=arguments_.includes("--live-disabled-thinking");
if(liveDisabledThinking){if(!liveProductionSettings)throw new Error("Disabled-thinking qualification preserves every other production option");arguments_.splice(arguments_.indexOf("--live-disabled-thinking"),1);}
let liveCases;
if(arguments_.includes("--live-cases")){const i=arguments_.indexOf("--live-cases");liveCases=arguments_[i+1];if(!liveQualification||!liveCases||!/^[-a-z0-9]+(?:,[-a-z0-9]+)*$/.test(liveCases))throw new Error("Explicit live case IDs required");arguments_.splice(i,2);}
let liveRepetitions;
if(arguments_.includes("--live-repetitions")){const i=arguments_.indexOf("--live-repetitions");liveRepetitions=arguments_[i+1];if(!liveQualification||!liveCases||!['1','2','3'].includes(liveRepetitions))throw new Error("Repeated qualification requires selected cases and one to three fresh-root trials");arguments_.splice(i,2);}
const extraSuites = [];
while (arguments_.length) {
  const flag = arguments_.shift(); const value = arguments_.shift();
  if (flag === "--native-bin" && value && isAbsolute(value)) nativeBin = value;
  else if (flag === "--evidence-dir" && value && isAbsolute(value) && value.startsWith(resolve(root, "documentation/planner/reports") + "/") && !value.includes("..")) evidence = value;
  else if (flag === "--extra-suite" && /^__tests__\/planner-v2\/postgres\/[a-z0-9-]+\.postgres\.ts$/.test(value ?? "")) extraSuites.push(value);
  else throw new Error("Usage: disposable Planner harness [--native-bin /absolute/bin] [--evidence-dir /absolute/report/evidence] [--extra-suite owned-test-path]");
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
let web;
const browserFixture = join(temporary, "browser-fixture.json");
const browserDist = `.next-planner-phase1-${nonce}`;
const browserWorkspace = join(temporary,"web");
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
  const preV2Schema = sourceSchema.replace(/^\s*(?:plannedMinutes|remainingMinutesEstimate|remainingEstimateBasisActualSeconds|remainingDisposition|executionVersion|plannerSpec|plannerSpecDigest|executionState|transitionReceipts|executionContext|runningSince|acceptedFocusAtResume|acceptedBreakAtResume)\s+.*\n/gm, "")
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
    ...(browserRequested ? { PLANNER_PHASE1_BROWSER_FIXTURE: browserFixture } : {}),
    PLANNER_PHASE0_DATABASE_MARKER: marker, PLANNER_PHASE0_REQUIRED: "true", JWT_SECRET: "planner-phase0-disposable-test-secret",
    JWT_ISSUER: "sylf", JWT_AUDIENCE: "sylf-app", CRON_SECRET: "planner-phase0-disposable-cron", TOOL_CONFIRMATION_SECRET: "planner-phase0-disposable-tool" };
  let newError;
  run(process.execPath, ["scripts/build/build-planner-worker.mjs"]);
  const newReport = join(temporary, "phase1-report.json");
  try { run(join(root, "node_modules/.bin/vitest"), ["run", "--config", "config/vitest.planner-v2-postgres.config.ts",...(liveQualification?["--exclude","__tests__/planner-v2/postgres/maximum-envelope.postgres.ts"]:[]), "--reporter=json", "--outputFile", newReport], { env: childEnvironment, timeout: 600_000 }); }
  catch (error) { newError = error; }
  if(newError)writeFileSync(join(evidence,"postgres-phase1-command-error.json"),JSON.stringify({code:newError.code,signal:newError.signal,killed:newError.killed,stderr:safe(String(newError.stderr??"")),stdoutTail:safe(String(newError.stdout??"").slice(-16000))},null,2)+"\n");
  checkReport("phase1", newReport, ["__tests__/planner-v2/postgres/durable-core.postgres.ts", "__tests__/planner-v2/postgres/accounting.postgres.ts", "__tests__/planner-v2/postgres/lifecycle-projection.postgres.ts", "__tests__/planner-v2/postgres/coordinated-routes.postgres.ts", "__tests__/planner-v2/postgres/worker-runtime.postgres.ts", "__tests__/planner-v2/postgres/current-sql-invariants.postgres.ts", "__tests__/planner-v2/postgres/separate-connection-concurrency.postgres.ts", ...extraSuites], newError);
  const currentReport = join(temporary, "current-report.json"); let currentError;
  try { run(join(root, "node_modules/.bin/vitest"), ["run", "--no-file-parallelism", "--exclude", "scratch/**", "--reporter=json", "--outputFile", currentReport, ...currentRequired], { env: childEnvironment, timeout: 240_000 }); }
  catch (error) { currentError = error; }
  checkReport("current", currentReport, currentRequired, currentError);
  if(liveQualification){
    const liveReport=join(temporary,"live-report.json");let liveError;
    try { run(join(root,"node_modules/.bin/vitest"),["run","--config","config/vitest.planner-v2-live.config.ts","--reporter=json","--outputFile",liveReport],{env:{...childEnvironment,PLANNER_PHASE2_LIVE_REQUIRED:"true",PLANNER_PHASE2_LIVE_EVIDENCE:evidence,...(liveCases?{PLANNER_PHASE2_LIVE_CASES:liveCases}:{}),...(liveRepetitions?{PLANNER_PHASE2_LIVE_REPETITIONS:liveRepetitions}:{}),...(liveNonGemini?{PLANNER_PHASE2_LIVE_NON_GEMINI:"true"}:{}),...(liveExistingGroq?{PLANNER_PHASE2_LIVE_EXISTING_GROQ:"true"}:{}),...(liveLowReasoning?{PLANNER_PHASE2_LIVE_LOW_REASONING:"true"}:{}),...(liveHighReasoning?{PLANNER_PHASE2_LIVE_HIGH_REASONING:"true"}:{}),...(liveProductionSettings?{PLANNER_PHASE2_LIVE_PRODUCTION_SETTINGS:"true"}:{}),...(liveDisabledThinking?{PLANNER_PHASE2_LIVE_DISABLED_THINKING:"true"}:{}),...(liveTemperature?{PLANNER_PHASE2_LIVE_TEMPERATURE:liveTemperature}:{}),...(liveReviewTemperature?{PLANNER_PHASE2_LIVE_REVIEW_TEMPERATURE:liveReviewTemperature}:{}),...(liveReviewLowReasoning?{PLANNER_PHASE2_LIVE_REVIEW_LOW_REASONING:"true"}:{})},timeout:1800000}); }
    catch(error){liveError=error;}
    checkReport("live",liveReport,["__tests__/planner-v2/postgres/compiler-qualification.live.ts"],liveError);
  }
  if (browserRequested) {
    if (!existsSync(browserFixture)) throw new Error("Browser fixture missing; qualification cannot be skipped.");
    const fixture = JSON.parse(readFileSync(browserFixture, "utf8"));
    // A private source copy avoids shared tsconfig/next-env writes and HMR
    // invalidation by a concurrent development process. Assets/dependencies
    // are read-only links; application and configuration source are copied.
    mkdirSync(browserWorkspace);
    const sourceDirectories=["app","lib","design-system"];
    const sourceFiles=["package.json","package-lock.json","tsconfig.json","next-env.d.ts","next.config.ts","proxy.ts","postcss.config.mjs"];
    for(const directory of sourceDirectories) if(existsSync(join(root,directory)))cpSync(join(root,directory),join(browserWorkspace,directory),{recursive:true});
    for(const file of sourceFiles)if(existsSync(join(root,file)))copyFileSync(join(root,file),join(browserWorkspace,file));
    for(const directory of ["node_modules","public"])symlinkSync(join(root,directory),join(browserWorkspace,directory),"dir");
    const sourcePaths=directory=>readdirSync(join(browserWorkspace,directory),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?sourcePaths(`${directory}/${entry.name}`):[`${directory}/${entry.name}`]);
    const snapshot=Object.fromEntries([...sourceDirectories.filter(directory=>existsSync(join(browserWorkspace,directory))).flatMap(sourcePaths),...sourceFiles.filter(file=>existsSync(join(browserWorkspace,file)))].map(path=>[path,digest(readFileSync(join(browserWorkspace,path)))]));
    outcome.browserSourceSnapshot={files:Object.keys(snapshot).length,sha256:snapshot};
    const token = await new SignJWT({ userId: fixture.ownerId, tokenVersion: fixture.tokenVersion, hasCompletedOnboarding: true }).setProtectedHeader({ alg: "HS256" })
      .setIssuer("sylf").setAudience("sylf-app").setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(childEnvironment.JWT_SECRET));
    // Next loads dotenv itself. Mask every file key before supplying ONLY the
    // disposable runtime; no hosted/provider value enters this web process.
    const masked = {};
    for (const name of [".env", ".env.local", ".env.development", ".env.development.local"]) {
      const file = join(root, name);
      if (existsSync(file)) for (const match of readFileSync(file, "utf8").matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm)) masked[match[1]] = "";
    }
    const webPort = await freePort(); const chromePort = await freePort();
    const webEnvironment = { ...environment, ...masked, ...childEnvironment, DATABASE_POOL_URL: url, DATABASE_WORKER_URL: url,
      PLANNER_V2_DURABLE_CORE_ENABLED: "true", SYLF_TEST_DIST_DIR: browserDist, NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: "development" };
    let webDiagnostic = "";
    web = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(webPort)], { cwd: browserWorkspace, env: webEnvironment, stdio: ["ignore", "pipe", "pipe"] });
    for (const pipe of [web.stdout, web.stderr]) pipe.on("data", data => { webDiagnostic = (webDiagnostic + safe(data)).slice(-12000); });
    let ready = false;
    for (let i = 0; i < 120 && !ready; i++) {
      if (web.exitCode !== null) throw new Error(`Disposable web process stopped: ${webDiagnostic}`);
      try { const response = await fetch(`http://127.0.0.1:${webPort}/api/quests/${fixture.questId}`, { headers: { Cookie: `hunter_token=${token}` }, signal: AbortSignal.timeout(1000) }); ready = response.ok; } catch { /* startup */ }
      if (!ready) await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!ready) throw new Error(`Disposable web failed readiness: ${webDiagnostic}`);
    await new Promise((resolve_,reject) => {
      const verification = spawn(process.execPath,["scripts/verify/verify-planner-v2-phase1-browser.mjs"],{cwd:root,env:{...childEnvironment,
        PLANNER_PHASE1_BROWSER_BASE:`http://127.0.0.1:${webPort}`,PLANNER_PHASE1_BROWSER_FIXTURE:browserFixture,PLANNER_PHASE1_BROWSER_TOKEN:token,PLANNER_PHASE1_CHROME_PORT:String(chromePort)},stdio:["ignore","pipe","pipe"]});
      let diagnostic="";
      for(const pipe of [verification.stdout,verification.stderr])pipe.on("data",data=>{diagnostic=(diagnostic+safe(data)).slice(-6000);});
      const timeout=setTimeout(()=>{verification.kill("SIGTERM");reject(new Error("Focus browser qualification exceeded its four-minute bound"));},240000);
      verification.once("error",error=>{clearTimeout(timeout);reject(error);});
      verification.once("exit",code=>{clearTimeout(timeout);if(code===0)resolve_();else reject(new Error(`Required Focus browser qualification failed; see evidence/browser/results.json. ${diagnostic} ${webDiagnostic}`));});
    });
    const browserResult=JSON.parse(readFileSync(join(evidence,"browser/results.json"),"utf8"));
    const stored=(await client.query('SELECT id,"executionState","durationSeconds" FROM "StudySession" WHERE "userId"=$1 AND "questId"=$2',[fixture.ownerId,fixture.questId])).rows;
    if(stored.length!==1||stored[0].id!==browserResult.sessionId||stored[0].executionState!=="ENDED"||stored[0].durationSeconds!==browserResult.finalAcceptedFocusSeconds)
      throw new Error("Browser refresh created another session or diverged from accepted actual time.");
    for(const [path,hash]of Object.entries(snapshot))if(digest(readFileSync(join(root,path)))!==hash)throw new Error(`Browser source changed during qualification: ${path}`);
    outcome.browser = "PASSED";
  }
  outcome.status = "PASSED";
  console.log("Phase 1 PostgreSQL service gate passed: actual durable services, SQL, concurrency and required current suites.");
} catch (error) {
  outcome.status = "FAILED"; outcome.error = safe(error.message);
  console.error(safe(error.message)); process.exitCode = 1;
} finally {
  if (web && web.exitCode === null) {
    const exited = new Promise(resolve => web.once("exit", resolve)); web.kill("SIGTERM");
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5000))]);
    if (web.exitCode === null) web.kill("SIGKILL");
  }
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
