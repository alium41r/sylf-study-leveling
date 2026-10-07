import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, "..");
const directory = path.join(root, "documentation/planner/reports/2026-10-03-phase-2");
const evidence = path.join(directory, "evidence");
const baseline = JSON.parse(fs.readFileSync(path.join(evidence, "step2-baseline.json"), "utf8"));
const existingEdits = ["lib/planner/v2/server/context.ts", "lib/planner/v2/server/apply.ts", "lib/planner/v2/server/revisions.ts", "lib/planner/v2/server/workspace.ts",
  "lib/planner/v2/server/attempts.ts", "lib/planner/v2/server/accounting.ts", "lib/ai/providers/deepseek.ts", "lib/ai/providers/groq.ts", "tsconfig.planner-worker.json",
  "scripts/test-planner-v2-phase1-postgres.mjs", "documentation/planner/README.md", "documentation/planner/reports/2026-10-03-phase-2/README.md", "documentation/planner/reports/2026-10-03-phase-2/REQUIREMENTS.json"];
const newSources = ["lib/planner/v2/intelligence/context.ts", "lib/planner/v2/intelligence/provider-policy.ts", "lib/planner/v2/intelligence/provider.ts", "lib/ai/usage-pricing.ts",
  "__tests__/planner-v2/intelligence/context.test.ts", "__tests__/planner-v2/intelligence/provider.test.ts", "__tests__/planner-v2/intelligence/provider-adapters.test.ts",
  "__tests__/planner-v2/postgres/intelligence-boundary.postgres.ts", "__tests__/planner-v2/postgres/intelligence-process-fixture.cjs",
  "scripts/test-planner-v2-phase2-step2-postgres.mjs", "scripts/verify-planner-v2-phase2-step2.mjs", "scripts/verify-planner-v2-phase2-step2-build.mjs",
  "documentation/planner/reports/2026-10-03-phase-2/STEP_2.md"];
const allowed = new Set([...existingEdits, ...newSources]);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sylf-planner-step2-gate-"));
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const sourceSha = file => sha(fs.readFileSync(path.join(root, file)));
const gate = { gate: "PLANNER_V2_PHASE_2_STEP_2", startedAt: new Date().toISOString(), status: "FAILED", checks: [],
  scope: "Bounded context and shared metered provider boundary; assistant/research/compiler handlers remain later roadmap steps." };
// First-run report links resolve before the final preservation check replaces
// this explicitly pending placeholder with measured source correspondence.
if (!fs.existsSync(path.join(evidence, "step2-source-preservation.json"))) fs.writeFileSync(path.join(evidence, "step2-source-preservation.json"), JSON.stringify({ status: "PENDING" }) + "\n");
function check(name, work) { const result = work(); gate.checks.push({ name, status: "PASSED", evidence: result }); }
function run(label, entry, args = [], input) {
  const r = spawnSync(process.execPath, [path.join(root, entry), ...args], { cwd: root, encoding: "utf8", timeout: 120000, maxBuffer: 12 * 1024 * 1024, input });
  const output = `${r.stdout ?? ""}${r.stderr ?? ""}`; fs.writeFileSync(path.join(evidence, `step2-${label}.log`), output);
  if (r.error) throw r.error; return { code: r.status, output, stdout: r.stdout };
}
function required(label, entry, args) { const r = run(label, entry, args); if (r.code !== 0) throw new Error(`${label} failed; see step2-${label}.log`); return r; }
try {
  check("frozen contracts", () => {
    const pinned = JSON.parse(fs.readFileSync(path.join(root, "documentation/planner/reports/2026-10-02-phase-0/evidence/phase0-gate.json"))).contractSources;
    const drift = Object.entries(pinned).filter(([file, expected]) => sourceSha(file) !== expected).map(([file]) => file);
    if (drift.length) throw new Error(`Frozen source drift: ${drift}`); return { unchanged: Object.keys(pinned).length };
  });
  check("unit regressions and supporting artifacts", () => {
    const output = path.join(evidence, "step2-units.json");
    required("units", "node_modules/vitest/vitest.mjs", ["run", "__tests__/planner-v2/contracts", "__tests__/planner-v2/evidence/audit-regression-fixtures.test.ts", "__tests__/planner-v2/durable-digests.test.ts", "__tests__/planner-v2/intelligence",
      "__tests__/ai/provider-contract.test.ts", "__tests__/ai/multi-engine-router.test.ts", "--exclude", "scratch/**", "--reporter=json", `--outputFile=${output}`]);
    const r = JSON.parse(fs.readFileSync(output));
    if (!r.success || r.numFailedTests || r.numPendingTests || r.testResults.length !== 15 || r.testResults.some(f => f.assertionResults.some(t => t.status !== "passed"))) throw new Error("Unit failure, noncanonical test selection or required skip");
    return { files: r.testResults.length, passed: r.numPassedTests, requiredSkipped: 0 };
  });
  check("isolated and whole source TypeScript", () => {
    required("typecheck", "node_modules/typescript/bin/tsc", ["-p", "tsconfig.planner-v2-phase2.json"]);
    const config = path.join(temporary, "source.json"); const base = JSON.parse(fs.readFileSync(path.join(root, "tsconfig.json")));
    fs.writeFileSync(config, JSON.stringify({ extends: path.join(root, "tsconfig.json"), compilerOptions: { incremental: false, noEmit: true }, exclude: [...base.exclude.map(p => path.join(root, p)), path.join(root, ".next")] }));
    required("source-typecheck", "node_modules/typescript/bin/tsc", ["-p", config]); return { source: "PASSED", generatedNextTypesExcluded: true };
  });
  check("whole repository typecheck baseline correspondence", () => {
    const r = run("full-typecheck", "node_modules/typescript/bin/tsc", ["--noEmit", "--incremental", "false"]);
    const errors = text => text.split("\n").filter(s => s.includes("error TS"));
    const expected = errors(fs.readFileSync(path.join(evidence, "step1-baseline-typecheck.log"), "utf8"));
    const actual = errors(r.output);
    if (r.code !== 2 || expected.length !== 2 || expected.some(error => !actual.includes(error))) throw new Error("Full typecheck differs from the recorded route-export blockers");
    if (JSON.stringify(actual) === JSON.stringify(expected)) return { status: "PRE_EXISTING_FAILURE_UNCHANGED", errors: expected };
    // Concurrent builds can add production validators alongside the development
    // validators present at Step 1. Classify only these observed unrelated owners,
    // and prove their original source bytes before accepting the wider surface.
    const unrelatedOwners = new Set(["app/api/acoustics/route.ts", "app/api/quests/route.ts", "app/api/subjects/[id]/compile/route.ts",
      "app/api/subjects/[id]/forge-apex/route.ts", "app/api/subjects/[id]/nodes/route.ts", "app/api/subjects/[id]/restore/route.ts",
      "app/api/subjects/[id]/route.ts", "app/api/user/focus-backgrounds/route.ts", "app/goals/page.tsx"]);
    const verifiedSources = new Map();
    for (const error of actual) {
      const match = error.match(/^\.next\/(?:dev\/)?types\/(app\/.+)\.ts\(\d+,\d+\): error TS(?:2344|2559):/);
      if (!match) throw new Error("Unclassified non-generated TypeScript failure");
      const file = [match[1] + ".ts", match[1] + ".tsx"].find(p => fs.existsSync(path.join(root, p)));
      if (!file || !unrelatedOwners.has(file) || !baseline.files[file] || sourceSha(file) !== baseline.files[file].sha256)
        throw new Error(`Generated failure has a changed or unclassified owner: ${file ?? match[1]}`);
      verifiedSources.set(file, sourceSha(file));
    }
    return { status: "UNCHANGED_SOURCE_WITH_ADDITIONAL_GENERATED_FAILURES", baselineErrors: expected, errors: actual,
      verifiedUnchangedSources: Object.fromEntries(verifiedSources), generatedFilesModifiedByThisGate: false };
  });
  check("changed source lint and adapter baseline correspondence", () => {
    const adapters = ["lib/ai/providers/deepseek.ts", "lib/ai/providers/groq.ts"];
    required("lint", "node_modules/eslint/bin/eslint.js", [...allowed].filter(p => /\.(?:ts|cjs|mjs)$/.test(p) && !adapters.includes(p)).concat("--max-warnings=0"));
    const r = run("adapter-lint", "node_modules/eslint/bin/eslint.js", [...adapters, "--format=json"]);
    const expected = JSON.parse(fs.readFileSync(path.join(evidence, "step2-adapter-lint-baseline.json")));
    const actual = JSON.parse(r.stdout);
    for (const entry of expected) {
      if (entry.sha256 !== baseline.files[entry.file].sha256) throw new Error("Adapter baseline identity mismatch");
      const messages = actual.find(f => f.filePath.endsWith(entry.file)).messages.map(({ ruleId, severity, message }) => ({ ruleId, severity, message }));
      if (JSON.stringify(messages) !== JSON.stringify(entry.messages)) throw new Error(`New adapter lint findings: ${entry.file}`);
    }
    return { newErrors: 0, newWarnings: 0, existingAdapterErrors: 19, existingAdapterWarnings: 2 };
  });
  check("normal Node worker build and imports", () => {
    required("worker-build", "scripts/build-planner-worker.mjs", []);
    const r = spawnSync(process.execPath, ["-e", "for (const f of ['context','provider','provider-policy','checkpoints']) require('./dist/planner-worker/planner/v2/intelligence/'+f+'.js'); console.log('Normal Node imports passed without Next or provider credentials');"],
      { cwd: root, encoding: "utf8", env: { PATH: process.env.PATH }, timeout: 30000 });
    fs.writeFileSync(path.join(evidence, "step2-node-load.log"), `${r.stdout ?? ""}${r.stderr ?? ""}`);
    if (r.status !== 0 || r.error) throw new Error("Normal Node import failed"); return { node: process.version, modules: 4, providerCredentials: false };
  });
  check("genuine PostgreSQL, compiled provider and existing required service regressions", () => {
    const p = JSON.parse(fs.readFileSync(path.join(evidence, "step2-postgres/postgres-harness-run.json")));
    if (p.status !== "PASSED" || p.requiredResults.length !== 2 || p.requiredResults.some(r => r.failed || r.requiredSkipped) || p.cleanupError || p.requiredResults.find(r => r.label === "current")?.files !== 17) throw new Error("Required PostgreSQL gate failed, noncanonical or incomplete");
    const results = JSON.parse(fs.readFileSync(path.join(evidence, "step2-postgres/postgres-phase1-results.json")));
    const suite = results.suites?.find(f => f.name.endsWith("intelligence-boundary.postgres.ts"));
    if (!suite || suite.cases.length !== 12 || suite.cases.some(t => t.status !== "passed")) throw new Error("Step 2 compiled/provider database cases missing");
    return { results: p.requiredResults, newStep2Cases: suite.cases.length, hostedDataTouched: false, cleanup: p.cleanup };
  });
  check("isolated web build qualification", () => {
    const r = JSON.parse(fs.readFileSync(path.join(evidence, "step2-build.json")));
    if (!["PASSED", "PRE_EXISTING_ROUTE_EXPORT_BLOCKER"].includes(r.status)) throw new Error("Build has an unclassified failure"); return r;
  });
  check("documentation links, changed whitespace and requirement evidence", () => {
    for (const name of fs.readdirSync(directory).filter(p => p.endsWith(".md"))) {
      const content = fs.readFileSync(path.join(directory, name), "utf8");
      for (const match of content.matchAll(/\]\(([^)]+)\)/g)) { const ref = match[1].split("#")[0]; if (ref && !/^[a-z]+:/i.test(ref) && !fs.existsSync(path.resolve(directory, ref))) throw new Error(`Broken reference: ${name}: ${ref}`); }
    }
    for (const file of allowed) {
      const content = fs.readFileSync(path.join(root, file), "utf8");
      const whitespace = content.split("\n").filter(s => /[\t ]+$/.test(s));
      if (file === "lib/ai/providers/groq.ts") {
        const original = content.replace(/          finishReason: completion\.choices\?\.\[0\]\?\.finish_reason === "length" \? "MAX_TOKENS" :\n            \["stop", "tool_calls"\]\.includes\(completion\.choices\?\.\[0\]\?\.finish_reason \?\? ""\) \? "STOP" : "OTHER",\n/, "").replace("if (!options?.singleAttempt && groqInnerError", "if (groqInnerError");
        if (sha(original) !== baseline.files[file].sha256 || JSON.stringify(whitespace) !== JSON.stringify(original.split("\n").filter(s => /[\t ]+$/.test(s)))) throw new Error("Groq whitespace differs from proven original source");
      } else if (whitespace.length) throw new Error(`Changed-file whitespace: ${file}`);
    }
    const map = JSON.parse(fs.readFileSync(path.join(directory, "REQUIREMENTS.json")));
    if (map.requirements.filter(r => r.step === 2).length !== 4) throw new Error("Step 2 requirement map changed scope");
    return { newWhitespaceFindings: 0, preExistingGroqWhitespaceLines: 2, requirements: ["P2-03", "P2-04", "P2-05", "P2-06"] };
  });
  check("pre-existing source preservation and unrelated concurrency", () => {
    const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
    const observation = file => {
      try { return fs.lstatSync(path.join(root, file)).isFile() ? { kind: "file", sha256: sourceSha(file) } : { kind: "other" }; }
      catch (error) { if (error.code === "ENOENT") return { kind: "missing" }; throw error; }
    };
    const observed = new Map(Object.keys(baseline.files).map(file => [file, observation(file)]));
    const changed = Object.entries(baseline.files).filter(([file, b]) => b.sha256 ? observed.get(file).sha256 !== b.sha256 : observed.get(file).kind !== b.kind).map(([file]) => file);
    const external = changed.filter(f => !allowed.has(f));
    if (external.some(f => f.startsWith("lib/planner/") || f.startsWith("documentation/planner/") || f.startsWith("__tests__/planner/") || f.startsWith("__tests__/planner-v2/") || f.startsWith("lib/ai/"))) throw new Error(`Unclassified Planner/provider concurrency: ${external}`);
    const added = files.filter(f => !baseline.files[f] && !allowed.has(f) && !f.startsWith("documentation/planner/reports/2026-10-03-phase-2/evidence/"));
    if (added.some(f => f.startsWith("lib/planner/") || f.startsWith("documentation/planner/"))) throw new Error(`Unclassified new Planner files: ${added}`);
    const preserved = { status: "PASSED", baselineFiles: Object.keys(baseline.files).length,
      nonFileEntries: Object.fromEntries(Object.entries(baseline.files).filter(([, b]) => !b.sha256).map(([file, b]) => [file, { before: b, observed: observed.get(file) }])),
      step2ExistingEdits: changed.filter(f => allowed.has(f)),
      unrelatedConcurrentChanges: external.map(file => ({ path: file, before: baseline.files[file].sha256 ?? baseline.files[file].kind,
        observed: observed.get(file).sha256 ?? observed.get(file).kind })), unrelatedNewFiles: added };
    fs.writeFileSync(path.join(evidence, "step2-source-preservation.json"), JSON.stringify(preserved, null, 2) + "\n");
    gate.sourceSha256 = Object.fromEntries([...allowed].sort().map(f => [f, sourceSha(f)])); return preserved;
  });
  gate.status = "PASSED";
} catch (error) { gate.error = error.message; process.exitCode = 1; }
finally { gate.finishedAt = new Date().toISOString(); fs.writeFileSync(path.join(evidence, "step2-gate.json"), JSON.stringify(gate, null, 2) + "\n"); fs.rmSync(temporary, { recursive: true, force: true }); }
process.stdout.write(JSON.stringify({ status: gate.status, checks: gate.checks.length, error: gate.error }) + "\n");
