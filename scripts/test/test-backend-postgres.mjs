/** Backend route, authorization and RLS suites on a disposable PostgreSQL built from all of prisma/migrations. Never accepts a database URL.
 * node scripts/test/test-backend-postgres.mjs [--out <evidence dir>] [--label <name>] [path-filter]
 * Handlers run in-process against real SQL, RPCs and triggers. The real lib/auth-server runs, not the unit-test shim.
 * --measure <file> also runs the route cost measurement and writes it there.
 * --suite timer runs the repository's timer suites on this same schema. Their own harness cannot bootstrap the current schema any more.
 * --suite planner, pixel and planner-v2 do the same for Planner's, Pixel's and all of Planner V2's own suites, for the same reason (finding D-3).
 *   A path filter narrows them. Each runs with its own suites' configuration, and the schema here is built from every migration, not a curated list.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { backendEnvironment, buildSchemaFromMigrations, root, startDisposablePostgres, suiteEnvironment } from "./lib/disposable-backend.mjs";

const args = process.argv.slice(2); const option = name => { const index = args.indexOf(name); if (index < 0) return undefined; const [, value] = args.splice(index, 2); return value; };
const out = resolve(root, option("--out") ?? "documentation/native/reports/phase-11/evidence");
const label = option("--label") ?? "backend-postgres";
const suite = option("--suite");
const measure = option("--measure");
const TIMER_SUITES = ["timer-lifecycle", "durable-core", "lifecycle-projection", "coordinated-routes", "separate-connection-concurrency", "current-sql-invariants"].map(name => `__tests__/planner-v2/postgres/${name}.postgres.ts`);
const SUITES = {
  timer: { config: "config/vitest.planner-v2-postgres.config.ts", paths: TIMER_SUITES },
  "planner-v2": { config: "config/vitest.planner-v2-postgres.config.ts", paths: ["__tests__/planner-v2/postgres"] },
  planner: { paths: ["__tests__/planner"] },
  pixel: { paths: ["__tests__/pixel-display/database-consolidation.test.ts"] },
};
const chosen = suite ? SUITES[suite] : { config: "config/vitest.backend-postgres.config.ts", paths: [] };
if (!chosen) throw new Error(`Unknown suite ${suite}.`);
const plannerDatabase = suite === "timer" || suite === "planner-v2";
mkdirSync(out, { recursive: true });
const report = join(tmpdir(), `sylf-backend-${randomBytes(6).toString("hex")}.json`);
const backend = await startDisposablePostgres({ log: message => console.error(message), plannerSuites: Boolean(suite) });
let exit = 0;
try {
  const build = await buildSchemaFromMigrations(backend.url);
  const unresolved = build.migrations.flatMap(entry => entry.remaining ?? []);
  if (unresolved.length) throw new Error(`Schema build left ${unresolved.length} statements unapplied.`);
  let failed = false;
  // The Planner suites prove they are on a harness database by reading this marker back.
  const marker = randomBytes(24).toString("hex");
  if (plannerDatabase) {
    const client = new pg.Client({ connectionString: backend.url }); await client.connect();
    await client.query("CREATE TABLE public.__planner_phase0_identity (token text PRIMARY KEY)");
    await client.query("INSERT INTO public.__planner_phase0_identity VALUES ($1)", [marker]);
    await client.end();
  }
  // The worker suites start the compiled worker, which their own harness also builds first.
  if (suite === "planner-v2") execFileSync(process.execPath, ["scripts/build/build-planner-worker.mjs"], { cwd: root, encoding: "utf8", stdio: "pipe", timeout: 180_000, env: suiteEnvironment(backend.url) });
  const environment = suite ? suiteEnvironment(backend.url, { NODE_ENV: "test", PLANNER_TEST_DATABASE_URL: backend.url, PIXEL_TEST_DATABASE_URL: backend.url, ...(plannerDatabase ? { PLANNER_PHASE0_DATABASE_MARKER: marker, PLANNER_PHASE0_REQUIRED: "true" } : {}) })
    : backendEnvironment(backend.url, { NODE_ENV: "test", BACKEND_TEST_DATABASE: "disposable", ...(measure ? { BACKEND_MEASURE_OUT: resolve(root, measure) } : {}) });
  try {
    execFileSync(join(root, "node_modules/.bin/vitest"), ["run", ...(chosen.config ? ["--config", chosen.config] : ["--no-file-parallelism"]), "--reporter=json", "--outputFile", report, ...(args.length ? args : chosen.paths)],
      { cwd: root, encoding: "utf8", stdio: "pipe", timeout: 900_000, maxBuffer: 64 * 1024 * 1024, env: environment });
  } catch (error) { failed = true; if (error.stderr) console.error(backend.redact(String(error.stderr).slice(-6000))); }
  const results = JSON.parse(readFileSync(report, "utf8"));
  const cases = results.testResults.flatMap(file => file.assertionResults.map(test => ({ file: file.name.replace(`${root}/`, ""), name: test.fullName, status: test.status,
    failure: test.failureMessages?.[0] ? backend.redact(test.failureMessages[0]).split("\n").slice(0, 3).join(" ").slice(0, 300) : undefined })));
  const summary = { label, passed: cases.filter(test => test.status === "passed").length, failed: cases.filter(test => test.status === "failed").length,
    skipped: cases.filter(test => !["passed", "failed"].includes(test.status)).length, collectionFailures: results.testResults.filter(file => file.status === "failed" && !file.assertionResults.length).map(file => `${file.name.replace(`${root}/`, "")}: ${backend.redact(file.message ?? "").slice(0, 700)}`) };
  writeFileSync(join(out, `${label}.json`), JSON.stringify({ ...summary, finishedAt: new Date().toISOString(), scope: "Handlers in-process on disposable PostgreSQL 17. Hosted Supabase, Redis and storage were not used.", cases }, null, 1) + "\n");
  console.log(JSON.stringify(summary));
  for (const test of cases) if (test.status === "failed") console.log(`FAIL ${test.name}\n     ${test.failure}`);
  if (failed || summary.failed || summary.collectionFailures.length) exit = 1;
} catch (error) { console.error(backend.redact(error.stack ?? error.message)); exit = 1; }
finally { rmSync(report, { force: true }); backend.stop(); }
process.exitCode = exit;
