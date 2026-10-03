/** Phase 0 gate only: no production integration, provider calls or hosted database access. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const reportRoot = "documentation/planner/reports/2026-10-02-phase-0";
const evidence = join(root, reportRoot, "evidence");
const temporary = mkdtempSync(join(tmpdir(), "sylf-planner-phase0-gate-"));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--native-bin" || !isAbsolute(args[1]))) {
  throw new Error("Usage: node scripts/verify-planner-v2-phase0.mjs [--native-bin /absolute/bin]");
}
const environment = Object.fromEntries(["PATH", "HOME", "TMPDIR", "USER", "LOGNAME", "SHELL", "SystemRoot", "TZ"]
  .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
const sha256 = value => createHash("sha256").update(value).digest("hex");
const read = path => readFileSync(join(root, path), "utf8");
const json = path => JSON.parse(read(path));
const walk = directory => readdirSync(join(root, directory), { withFileTypes: true })
  .flatMap(entry => entry.isDirectory() ? walk(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]);
const bin = name => join(root, "node_modules/.bin", name);
const outcome = {
  schemaVersion: 2, gate: "PLANNER_V2_PHASE_0", startedAt: new Date().toISOString(), status: "RUNNING",
  evidenceBoundary: "Pure V2 contracts and current-system PostgreSQL prerequisites; no Phase 1 runtime guarantees or product cutover.",
  checks: [], references: [], limitations: [
    "The historical production migration chain needs rehearsal; the PostgreSQL harness uses the documented audited bootstrap.",
    "Hosted grants/catalog, actual mobile builds, V2 worker/apply recovery, browser quality and model benchmark remain later phase gates.",
    "Whole-repository generated Next route type errors are recorded separately; the isolated Phase 0 typecheck is required.",
  ],
};

function check(name, fn) {
  fn(); outcome.checks.push({ name, status: "PASSED" });
  console.log(`Passed: ${name}`);
}
function command(file, arguments_, timeout = 60_000) {
  try {
    return execFileSync(file, arguments_, { cwd: root, encoding: "utf8", env: environment, timeout, stdio: "pipe" });
  } catch (error) {
    const output = String(error.stdout ?? "") + String(error.stderr ?? "");
    throw new Error(`${file.split("/").at(-1)} failed: ${output.slice(-6000).replace(/postgres(?:ql)?:\/\/[^\s"']+/g, "[database URL]")}`);
  }
}

try {
  mkdirSync(evidence, { recursive: true });
  check("authoritative references and Phase 0 documents", () => {
    for (const path of [
      "documentation/planner/PLANNER_TARGET_ARCHITECTURE.md",
      "documentation/planner/reports/2026-10-02-final-architecture-review/REVIEW.md",
      "documentation/planner/reports/2026-10-02-end-to-end-audit/AUDIT.md",
      ...["README.md", "CONTRACTS.md", "EXECUTION_WRITERS.md", "MIGRATION_MAP.md", "WORKER_RUNTIME.md", "POSTGRES_HARNESS.md"]
        .map(name => `${reportRoot}/${name}`),
    ]) {
      const source = read(path);
      if (source.length < 300) throw new Error(`Missing substantive reference: ${path}`);
      outcome.references.push({ path, sha256: sha256(source) });
    }
  });
  check("writer inventory source correspondence", () => {
    const inventory = json(`${reportRoot}/execution-writers.json`);
    if (inventory.curated_writers.length < 36 || !inventory.orm_mutation_sites.length || !inventory.effective_sql_functions.length || !inventory.runtime_sql_calls.length || !inventory.direct_raw_sql_sites.length) {
      throw new Error("Incomplete writer inventory");
    }
    for (const [path, expected] of Object.entries(inventory.source_sha256)) {
      if (sha256(read(path)) !== expected) throw new Error(`Inventory source changed; inspect and refresh its evidence before proceeding: ${path}`);
    }
    outcome.inventory = {
      behaviorGroups: inventory.curated_writers.length, ormSites: inventory.orm_mutation_sites.length,
      effectiveSqlSignatures: inventory.effective_sql_functions.length, routes: inventory.routes.length,
      runtimeSqlCalls: inventory.runtime_sql_calls.length, rawSqlSites: inventory.direct_raw_sql_sites.length,
      pinnedSourceFiles: Object.keys(inventory.source_sha256).length,
    };
  });
  const unitFiles = ["__tests__/planner-v2/contracts", "__tests__/planner-v2/evidence"]
    .flatMap(walk).filter(path => path.endsWith(".test.ts")).sort();
  check("required contract and audit regression suites", () => {
    if (unitFiles.filter(path => path.includes("/contracts/")).length < 2 || !unitFiles.some(path => path.includes("/evidence/"))) {
      throw new Error("Required pure contract/evidence suites are missing");
    }
    const resultPath = join(temporary, "unit-results.json");
    command(bin("vitest"), ["run", "--no-file-parallelism", "--reporter=json", "--outputFile", resultPath, ...unitFiles], 180_000);
    const result = JSON.parse(readFileSync(resultPath, "utf8"));
    const suites = result.testResults ?? [];
    const tests = suites.flatMap(suite => suite.assertionResults ?? []);
    const skipped = tests.filter(test => test.status !== "passed" && test.status !== "failed");
    if (!tests.length || tests.some(test => test.status === "failed") || skipped.length || suites.some(suite => suite.status !== "passed") ||
      unitFiles.some(path => !suites.some(suite => suite.name.endsWith(path)))) {
      throw new Error("Required contract/evidence suite failed, disappeared or skipped");
    }
    outcome.unit = { suites: suites.length, passed: tests.length, failed: 0, skipped: 0 };
    writeFileSync(join(evidence, "contract-results.json"), JSON.stringify({ ...outcome.unit, tests: tests.map(test => test.fullName) }, null, 2) + "\n");
  });
  check("isolated Phase 0 TypeScript", () => command(bin("tsc"), ["-p", "tsconfig.planner-v2-phase0.json", "--pretty", "false"]));
  check("Phase 0 ESLint", () => command(bin("eslint"), [
    "lib/planner/v2/contracts", "__tests__/planner-v2", "vitest.planner-v2-postgres.config.ts",
    "scripts/test-planner-v2-phase0-postgres.mjs", "scripts/verify-planner-v2-phase0.mjs", "--max-warnings", "0",
  ]));
  check("script syntax", () => {
    for (const script of ["scripts/test-planner-v2-phase0-postgres.mjs", "scripts/verify-planner-v2-phase0.mjs"]) command(process.execPath, ["--check", script]);
  });
  check("genuine PostgreSQL integrity/concurrency and all current required suites", () => {
    command(process.execPath, ["scripts/test-planner-v2-phase0-postgres.mjs", ...args], 300_000);
    const postgres = json(`${reportRoot}/evidence/postgres-harness-run.json`);
    if (postgres.status !== "PASSED" || postgres.requiredSkippedTests !== 0 || postgres.cleanupError || !postgres.postgresVersion ||
      postgres.requiredResults.length !== 2 || postgres.requiredResults.some(result => result.failed || result.requiredSkipped || !result.passed)) {
      throw new Error("Real PostgreSQL prerequisite gate is not passing");
    }
    if (sha256(read("prisma/schema.prisma")) !== postgres.schemaDigest || postgres.migrations.some(migration =>
      sha256(read(`prisma/migrations/${migration.name}/migration.sql`)) !== migration.sha256)) {
      throw new Error("PostgreSQL result does not correspond to current SQL/schema");
    }
    outcome.postgres = { version: postgres.postgresVersion, requiredSkipped: 0, results: postgres.requiredResults, cleanup: postgres.cleanup };
  });
  const corpus = json(`${reportRoot}/fixtures/audit-regressions.v2.json`);
  outcome.audit = { findings: corpus.findings.length, normalizedScenarios: corpus.scenarios.length, sha256: sha256(read(`${reportRoot}/fixtures/audit-regressions.v2.json`)) };
  outcome.contractSources = Object.fromEntries(walk("lib/planner/v2/contracts").map(path => [path, sha256(read(path))]));
  outcome.status = "PASSED";
  console.log("Planner V2 Phase 0 gate passed. Phase 1 has not started.");
} catch (error) {
  outcome.status = "FAILED"; outcome.error = error.message; process.exitCode = 1;
  console.error(error.message);
} finally {
  outcome.finishedAt = new Date().toISOString();
  mkdirSync(evidence, { recursive: true });
  writeFileSync(join(evidence, "phase0-gate.json"), JSON.stringify(outcome, null, 2) + "\n");
  rmSync(temporary, { recursive: true, force: true });
}
