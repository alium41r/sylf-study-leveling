import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportDirectory = path.join(root, "documentation/planner/reports/2026-10-03-phase-2");
const evidenceDirectory = path.join(reportDirectory, "evidence");
const baseline = JSON.parse(fs.readFileSync(path.join(evidenceDirectory, "step1-baseline.json"), "utf8"));
const concurrent = JSON.parse(fs.readFileSync(path.join(evidenceDirectory, "step1-concurrent-changes.json"), "utf8"));
const concurrentPaths = new Set(concurrent.files.map(file => file.path));
const step1Path = file => file.startsWith("documentation/planner/reports/2026-10-03-phase-2/") || file.startsWith("lib/planner/v2/intelligence/") || file.startsWith("__tests__/planner-v2/intelligence/") || ["tsconfig.planner-v2-phase2.json", "scripts/verify-planner-v2-phase2-step1.mjs"].includes(file);
if ([...concurrentPaths].some(file => step1Path(file) || file.startsWith("lib/planner/") || file.startsWith("documentation/planner/"))) throw new Error("A concurrent change overlaps the governing Planner baseline; resolve that specific conflict before proceeding");
const gate = { schemaVersion: 2, gate: "PLANNER_V2_PHASE_2_STEP_1", startedAt: new Date().toISOString(), status: "FAILED",
  boundary: "Baseline, requirement map, pure supporting artifacts, serialization and normal Node loading. No Phase 2 compiler/provider/database lifecycle completion is claimed.", checks: [] };
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sylf-planner-phase2-step1-"));
const sha256 = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
// Make the report's link to this run valid on the first invocation too.
fs.writeFileSync(path.join(evidenceDirectory, "step1-gate.json"), `${JSON.stringify(gate, null, 2)}\n`);
function check(name, work) {
  try { const evidence = work(); gate.checks.push({ name, status: "PASSED", evidence }); }
  catch (error) { gate.checks.push({ name, status: "FAILED", error: error.message }); throw error; }
}
function run(label, entry, args = [], options = {}) {
  const result = spawnSync(process.execPath, [path.join(root, entry), ...args], { cwd: root, encoding: "utf8", timeout: 120000, maxBuffer: 8 * 1024 * 1024, ...options });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  fs.writeFileSync(path.join(evidenceDirectory, `step1-${label}.log`), output);
  if (result.error) throw result.error;
  return { code: result.status, output };
}
function requiredRun(label, entry, args = [], options = {}) {
  const result = run(label, entry, args, options);
  if (result.code !== 0) throw new Error(`${label} failed (${result.code}); see step1-${label}.log`);
  return result;
}

try {
  check("frozen Phase 0 contracts", () => {
    const source = JSON.parse(fs.readFileSync(path.join(root, "documentation/planner/reports/2026-10-02-phase-0/evidence/phase0-gate.json"), "utf8"));
    const mismatch = Object.entries(source.contractSources).filter(([file, expected]) => sha256(path.join(root, file)) !== expected).map(([file]) => file);
    if (mismatch.length) throw new Error(`Frozen contract mismatch: ${mismatch.join(", ")}`);
    return { files: Object.keys(source.contractSources).length, historicalGateStatus: source.status };
  });
  check("governing source and requirement correspondence", () => {
    const map = JSON.parse(fs.readFileSync(path.join(reportDirectory, "REQUIREMENTS.json"), "utf8"));
    const ids = new Set(); const steps = new Set();
    for (const file of map.governingSources) if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing governing source: ${file}`);
    for (const requirement of map.requirements) {
      if (ids.has(requirement.id) || !requirement.completionGate || !requirement.evidence?.requiredTests?.length) throw new Error(`Incomplete/duplicate requirement: ${requirement.id}`);
      ids.add(requirement.id); steps.add(requirement.step);
      for (const source of requirement.sources) {
        const document = fs.readFileSync(path.join(root, source.path), "utf8");
        if (!document.includes(`## ${source.section}`)) throw new Error(`Missing section for ${requirement.id}: ${source.section}`);
        for (const finding of source.findings ?? []) if (!document.includes(`| ${finding} |`)) throw new Error(`Unknown audit finding: ${finding}`);
      }
    }
    if (JSON.stringify([...steps].sort()) !== JSON.stringify(map.approvedOrder)) throw new Error("Requirement map does not cover the approved order");
    return { requirements: ids.size, steps: [...steps].sort(), mapSha256: sha256(path.join(reportDirectory, "REQUIREMENTS.json")) };
  });
  check("required frozen/audit/digest/supporting suites", () => {
    const output = path.join(evidenceDirectory, "step1-units.json");
    requiredRun("units", "node_modules/vitest/vitest.mjs", ["run", "__tests__/planner-v2/contracts", "__tests__/planner-v2/evidence/audit-regression-fixtures.test.ts", "__tests__/planner-v2/durable-digests.test.ts", "__tests__/planner-v2/intelligence", "--reporter=json", `--outputFile=${output}`]);
    const result = JSON.parse(fs.readFileSync(output, "utf8"));
    if (!result.success || result.numFailedTests || result.numPendingTests || result.testResults.some(file => file.assertionResults.some(test => test.status !== "passed"))) throw new Error("Required test failure or skip");
    return { files: result.testResults.length, passed: result.numPassedTests, failed: result.numFailedTests, requiredSkipped: result.numPendingTests };
  });
  check("isolated supporting artifact TypeScript", () => {
    requiredRun("typecheck", "node_modules/typescript/bin/tsc", ["--project", "tsconfig.planner-v2-phase2.json"]);
    return { config: "tsconfig.planner-v2-phase2.json" };
  });
  check("whole source TypeScript excluding generated Next baseline", () => {
    const project = JSON.parse(fs.readFileSync(path.join(root, "tsconfig.json"), "utf8"));
    const config = path.join(temporary, "source.json");
    fs.writeFileSync(config, JSON.stringify({ extends: path.join(root, "tsconfig.json"), compilerOptions: { incremental: false, noEmit: true },
      exclude: [...project.exclude.map(file => path.join(root, file)), path.join(root, ".next")] }));
    requiredRun("source-typecheck", "node_modules/typescript/bin/tsc", ["--project", config]);
    return { generatedNextTypesExcluded: true };
  });
  check("whole repository typecheck matches pre-change failures exactly", () => {
    const result = run("full-typecheck", "node_modules/typescript/bin/tsc", ["--noEmit", "--incremental", "false"]);
    const errors = text => text.split("\n").filter(line => line.includes("error TS"));
    const expected = errors(fs.readFileSync(path.join(evidenceDirectory, "step1-baseline-typecheck.log"), "utf8"));
    const actual = errors(result.output);
    if (result.code !== 2 || expected.length !== 2 || JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Repository typecheck differs from the two recorded baseline export errors");
    return { status: "BASELINE_FAILURE_UNCHANGED", errors: actual };
  });
  check("Step 1 ESLint without warnings", () => {
    requiredRun("lint", "node_modules/eslint/bin/eslint.js", ["lib/planner/v2/intelligence", "__tests__/planner-v2/intelligence", "scripts/verify-planner-v2-phase2-step1.mjs", "--max-warnings=0"]);
    return { warnings: 0 };
  });
  check("compiled supporting artifacts load in normal Node", () => {
    const output = path.join(temporary, "compiled");
    const config = path.join(temporary, "runtime.json");
    fs.writeFileSync(config, JSON.stringify({ extends: path.join(root, "tsconfig.planner-worker.json"),
      compilerOptions: { rootDir: path.join(root, "lib"), outDir: output, typeRoots: [path.join(root, "node_modules/@types")] },
      include: [path.join(root, "lib/planner/v2/intelligence/checkpoints.ts")], exclude: [] }));
    requiredRun("runtime-compile", "node_modules/typescript/bin/tsc", ["--project", config]);
    const modulePath = path.join(output, "planner/v2/intelligence/checkpoints.js");
    const result = spawnSync(process.execPath, ["-e", "const module = require(process.argv[1]); const result = module.readCompilerCheckpoint({}, {}, {}); if (result.ok || result.reason !== 'MALFORMED_CHECKPOINT') process.exit(1); console.log('Compiled checkpoint module loaded without Next, Vitest aliases, credentials or provider calls.');", modulePath],
      { cwd: root, encoding: "utf8", timeout: 30000, env: { PATH: process.env.PATH, NODE_PATH: path.join(root, "node_modules") } });
    fs.writeFileSync(path.join(evidenceDirectory, "step1-runtime-load.log"), `${result.stdout ?? ""}${result.stderr ?? ""}`);
    if (result.error || result.status !== 0) throw new Error("Normal Node runtime load failed; see step1-runtime-load.log");
    return { node: process.version, module: "intelligence/checkpoints.js", nextRuntimeRequired: false, providerCalls: 0 };
  });
  check("documentation references and Step 1 whitespace", () => {
    const docs = fs.readdirSync(reportDirectory).filter(file => file.endsWith(".md"));
    for (const file of docs) {
      const document = fs.readFileSync(path.join(reportDirectory, file), "utf8");
      if (document.split("\n").some(line => /[\t ]+$/.test(line))) throw new Error(`Trailing whitespace: ${file}`);
      for (const match of document.matchAll(/\]\(([^)]+)\)/g)) {
        const reference = match[1].split("#")[0];
        if (reference && !/^[a-z]+:/i.test(reference) && !fs.existsSync(path.resolve(reportDirectory, reference))) throw new Error(`Broken reference in ${file}: ${reference}`);
      }
    }
    const currentFiles = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
    const step1Sources = currentFiles.filter(file => !baseline.files[file] && !file.includes("/evidence/") && fs.statSync(path.join(root, file)).isFile());
    for (const file of step1Sources) {
      if (fs.readFileSync(path.join(root, file), "utf8").split("\n").some(line => /[\t ]+$/.test(line))) throw new Error(`Step 1 trailing whitespace: ${file}`);
    }
    const diff = spawnSync("git", ["diff", "--check"], { cwd: root, encoding: "utf8" });
    const preExistingFindings = diff.stdout.split("\n").map(line => ({ line, match: line.match(/^([^+].*):\d+: /) })).filter(value => value.match);
    if (diff.status !== 0 && (diff.stderr || !preExistingFindings.length || preExistingFindings.some(({ match }) => {
      const file = match[1];
      return !baseline.files[file]?.sha256 || sha256(path.join(root, file)) !== baseline.files[file].sha256 && !concurrentPaths.has(file);
    }))) throw new Error("Tracked whitespace failures are not proven identical to the pre-work baseline");
    return { documents: docs.length, step1SourceFiles: step1Sources.length, step1WhitespaceFindings: 0,
      preExistingTrackedWhitespaceStatus: diff.status === 0 ? "PASSED" : "PRE_EXISTING_OR_UNRELATED_CONCURRENT_FAILURE", preExistingFindings: preExistingFindings.map(value => value.line) };
  });
  check("Planner baseline preservation and unrelated concurrent changes", () => {
    const mismatches = [];
    for (const [file, before] of Object.entries(baseline.files)) {
      const full = path.join(root, file);
      if (before.missing) { if (fs.existsSync(full)) mismatches.push(file); }
      else if (before.sha256) { if (!fs.existsSync(full) || sha256(full) !== before.sha256) mismatches.push(file); }
      else if (!fs.existsSync(full)) mismatches.push(file);
    }
    const unexpected = mismatches.filter(file => !concurrentPaths.has(file));
    if (unexpected.length) throw new Error(`Unclassified pre-existing changes: ${unexpected.join(", ")}`);
    const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
    const added = files.filter(file => !baseline.files[file]);
    if (added.some(file => !step1Path(file))) throw new Error(`Unexpected new files outside Step 1: ${added.filter(file => !step1Path(file)).join(", ")}`);
    gate.sourceSha256 = Object.fromEntries(added.filter(file => !file.includes("/evidence/")).sort().map(file => [file, sha256(path.join(root, file))]));
    return { preExistingFiles: Object.keys(baseline.files).length, unexpectedChanges: [], unrelatedConcurrentChanges: mismatches.map(file => ({ path: file, baselineSha256: baseline.files[file].sha256, observedSha256: sha256(path.join(root, file)) })),
      step1ChangesToExistingFiles: 0, addedFiles: added.length, sourceFiles: Object.keys(gate.sourceSha256).length };
  });
  gate.serialization = JSON.parse(fs.readFileSync(path.join(evidenceDirectory, "step1-serialization.json"), "utf8"));
  gate.status = "PASSED";
} catch (error) {
  gate.failure = error.message;
  process.exitCode = 1;
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
  gate.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(evidenceDirectory, "step1-gate.json"), `${JSON.stringify(gate, null, 2)}\n`);
  console.log(JSON.stringify({ gate: gate.gate, status: gate.status, checks: gate.checks.length, failure: gate.failure ?? null }));
}
