/** Phase A reuses the genuine, credential-free Planner harness in an isolated
 * source copy. Historical evidence writers cannot overwrite prior receipts. */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const evidenceIndex = args.indexOf("--evidence-dir");
const evidenceOverride = evidenceIndex < 0 ? null : args.splice(evidenceIndex, 2)[1];
if (evidenceIndex >= 0 && (!evidenceOverride || !resolve(evidenceOverride).startsWith(join(root, "documentation/planner/reports/") ))) throw new Error("Evidence must stay inside Planner reports.");
const baselineControl = args.includes("--baseline-control");
if (baselineControl) args.splice(args.indexOf("--baseline-control"), 1);
const requestedFocused = args.includes("--focused");
if (requestedFocused) args.splice(args.indexOf("--focused"), 1);
const phaseCRehearsal = args.includes("--phase-c-rehearsal");
if (phaseCRehearsal) args.splice(args.indexOf("--phase-c-rehearsal"), 1);
if (phaseCRehearsal && (baselineControl || requestedFocused)) throw new Error("Phase C rehearsal is an exclusive, scripted-only mode.");
const focused = requestedFocused || phaseCRehearsal;
// Optional owned-suite selection keeps every assertion in that suite and the
// complete legacy bank. The default focused/full qualification is unchanged.
const suiteIndex = args.indexOf("--focused-suite");
const focusedSuite = suiteIndex < 0 ? null : args.splice(suiteIndex, 2)[1];
if (suiteIndex >= 0 && (!requestedFocused || baselineControl || phaseCRehearsal || !focusedSuite || !/^[a-z0-9-]+$/.test(focusedSuite) ||
  !existsSync(join(root, `__tests__/planner-v2/postgres/${focusedSuite}.postgres.ts`)))) throw new Error("--focused-suite requires --focused and one existing owned PostgreSQL suite.");
if (args.length && (args.length !== 2 || args[0] !== "--native-bin" || !args[1].startsWith("/"))) throw new Error("Only --native-bin /absolute/path is supported; no live/provider flags.");
const evidence = join(evidenceOverride ? resolve(evidenceOverride) : join(root, "documentation/planner/reports/2026-10-25-ai-first-phase-a/evidence"), ...(focused ? ["focused"] : []), ...(baselineControl ? ["baseline-control"] : []));
mkdirSync(evidence, { recursive: true });
const temporary = realpathSync(mkdtempSync(join(tmpdir(), "sylf-planner-ai-first-")));
const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" }).split("\0").filter(p => (/^(lib\/(?:calendar\/|planner\/(v2\/|research\/search\/|comparison\/contracts|telemetry))|__tests__\/planner-v2\/|prisma\/|scripts\/(build\/build-planner-worker|test\/test-planner-ai-first-foundation)|config\/tsconfig\.planner|package\.json|\.node-version)/.test(p) || phaseCRehearsal && /^(scripts\/qa\/planner-phase-c\/|documentation\/planner\/reports\/2026-10-28-phase-c-qualification-preparation\/(?:CASE_BANK\.json|PILOT_INPUT\.json|EVALUATOR_ONLY\.json|RUBRIC\.json|PROTOCOL\.md|APPROVAL_REQUEST\.md)$)/.test(p)) && existsSync(join(root, p)));
const pins = Object.fromEntries(files.map(p => [p, createHash("sha256").update(readFileSync(join(root, p))).digest("hex")]));
const startedAt = new Date().toISOString();
let exitCode = 1;
try {
  for (const dir of ["app", "lib", "__tests__", "prisma", "scripts", "config", "archive", "documentation/planner"]) cpSync(join(root, dir), join(temporary, dir), { recursive: true });
  for (const file of ["package.json", "package-lock.json", "tsconfig.json", "next-env.d.ts", "vitest.config.ts", "vitest.setup.ts", ".node-version"]) if (existsSync(join(root, file))) cpSync(join(root, file), join(temporary, file));
  if (baselineControl) {
    // These three integration owners were clean at Phase A start. Keep runtime
    // packaging fixes in both arms so the old services can actually be tested.
    for (const file of ["lib/planner/v2/server/compiler.ts", "lib/planner/v2/server/revisions.ts", "lib/planner/v2/server/worker.ts"]) {
      const originalSource = execFileSync("git", ["show", `HEAD:${file}`], { cwd: root, encoding: "utf8" });
      writeFileSync(join(temporary, file), originalSource);
    }
    rmSync(join(temporary, "__tests__/planner-v2/postgres/ai-first-foundation.postgres.ts"));
    // The shared generated Prisma client knows the two new nullable columns.
    // Supply only that mapping in the control, without foundation guards or
    // writers, so unrelated legacy reads can run rather than fail P2022.
    const controlMigration = join(temporary, "prisma/migrations/20261025000000_planner_ai_first_client_control");
    mkdirSync(controlMigration);
    writeFileSync(join(controlMigration, "migration.sql"), 'ALTER TABLE "PlannerAttempt" ADD COLUMN "intelligenceArtifacts" jsonb;\nALTER TABLE "PlannerRevision" ADD COLUMN "intelligenceBundle" jsonb;\n');
  }
  symlinkSync(join(root, "node_modules"), join(temporary, "node_modules"), "dir");
  const harness = join(temporary, "scripts/test/test-planner-v2-phase1-postgres.mjs");
  const original = readFileSync(harness, "utf8"), marker = '  "20261004000000_planner_v2_assistant_documents",';
  if (original.split(marker).length !== 2) throw new Error("Historical harness migration seam changed; inspect before running.");
  const bootstrapSeam = '  const baseline = run(prisma, ["migrate", "diff", "--from-empty", "--to-schema", schemaPath, "--script", "--config", config]);';
  if (!original.includes(bootstrapSeam)) throw new Error("Audited bootstrap seam changed.");
  // Prisma represents SQL-generated Calendar columns as dbgenerated defaults.
  // Restore the exact SQL-owned generated definitions only in this disposable
  // bootstrap; never change the shared schema or historical migrations.
  const bootstrap = `${bootstrapSeam.replace("const baseline", "let baseline")}\n` + String.raw`
  const calendarSql = readFileSync(join(root,"prisma/migrations/20261018030000_calendar_completion/migration.sql"),"utf8");
  for (const name of ["previewText","hasInk","documentMode"]) {
    const ddl = calendarSql.match(new RegExp('ALTER TABLE "CalendarNote" ADD COLUMN ("'+name+'" [^;]+);'))?.[1];
    const pattern = new RegExp('"'+name+'" (?:TEXT|BOOLEAN) DEFAULT [\\s\\S]*?(?=,\\n)');
    if (!ddl || !pattern.test(baseline)) throw new Error("Generated Calendar bootstrap seam changed");
    baseline = baseline.replace(pattern,ddl);
  }
`;
  let adapted = original.replace(marker, `${marker}\n  "20261014000000_timer_durable_completion",\n  "20261015130000_ai_dispatch_telemetry",\n  "${baselineControl ? "20261025000000_planner_ai_first_client_control" : "20261025000000_planner_ai_first_foundation"}",\n  "20261025010000_planner_compiler_version",\n  "20261026000000_planner_role_resources",\n  "20261026010000_planner_understanding",\n  "20261026020000_planner_calendar_capacity",\n  "20261026030000_planner_natural_learning",\n  "20261027000000_planner_reviewed_learning",\n  "20261028000000_planner_reviewed_publication",`).replace(bootstrapSeam, bootstrap);
  // New Vitest JSON can expose only the collection stack for a timeout. Retain
  // the ordinary reporter too, through the existing scrubbed failure receipt.
  adapted=adapted.replace('"--reporter=json", "--outputFile", newReport','"--reporter=default", "--reporter=json", "--outputFile", newReport');
  // The expanded complete-journey bank outgrew the historical ten-minute
  // whole-suite process envelope. No individual test, lease or execution/root
  // deadline changes; retain a finite twenty-minute aggregate runner limit.
  adapted=adapted.replace('env: childEnvironment, timeout: 600_000','env: childEnvironment, timeout: 1_200_000');
  // Current SQL-owned timer/telemetry additions must not already exist in the
  // Prisma-derived pre-migration bootstrap. Apply their actual migrations.
  adapted = adapted.replace('  const schemaPath = join(temporary, "before.prisma"); writeFileSync(schemaPath, baselineSchema);', String.raw`
  const schemaPath = join(temporary, "before.prisma");
  const currentBaseline = baselineSchema.replace(/\nmodel TimerSessionStart \{[\s\S]*?\n\}/g, "")
    .replace(/^\s*compilerVersion\s+Int[^\n]*\n/gm, "")
    .replace(/^\s*timerStarts\s+TimerSessionStart\[\].*\n/gm, "")
    .replace(/^\s*timerTimeline\s+.*\n/gm, "")
    .replace(/^\s*(?:requestedModel|modelVerified|usageKnown|cacheUsageKnown|reasoningTokens|latencyMs|dispatchIndex|retryIndex|outcome|finishReason|pricingVersion|grounding)\s+.*\n/gm, "");
  writeFileSync(schemaPath, currentBaseline);
`);
  // Explicitly alias only inside the disposable copy; ordinary 618-case gates
  // retain their bank. This fixture has a scripted adapter and no live mode.
  if (phaseCRehearsal) cpSync(join(temporary,"__tests__/planner-v2/postgres/phase-c-preparation.phasec.ts"),join(temporary,"__tests__/planner-v2/postgres/phase-c-preparation.postgres.ts"));
  const suites = phaseCRehearsal ? ["__tests__/planner-v2/postgres/phase-c-preparation.postgres.ts"] : focused ? (focusedSuite ? [focusedSuite] : ["generation-integration", "timer-lifecycle", ...baselineControl ? [] : ["ai-first-foundation", "compiler-versions", "role-resources", "understanding", "calendar-capacity", "natural-learning", "reviewed-learning", "student-workspace", "student-workspace-http"]]).map(name => `__tests__/planner-v2/postgres/${name}.postgres.ts`) : [];
  if (focused) {
    const configPath = join(temporary, "config/vitest.planner-v2-postgres.config.ts");
    writeFileSync(configPath, readFileSync(configPath, "utf8").replace('include: ["__tests__/planner-v2/postgres/*.postgres.ts"]', `include: ${JSON.stringify(suites)}`));
    adapted = adapted.replace(/checkReport\("phase1", newReport, \[[^\n]+\], newError\);/, 'checkReport("phase1", newReport, extraSuites, newError);');
  }
  // Collect the independent legacy regression results even when an old fixture
  // fails. Preserve the failure and fail the aggregate after both reports.
  adapted = adapted.replace(/checkReport\("phase1", newReport, [^\n]+, newError\);/, match => `let phase1Failure; try { ${match} } catch (error) { phase1Failure = error; }`)
    .replace('checkReport("current", currentReport, currentRequired, currentError);', 'checkReport("current", currentReport, currentRequired, currentError); if (phase1Failure) throw phase1Failure;');
  writeFileSync(harness, adapted);
  const output = join(temporary, "documentation/planner/reports/2026-10-25-ai-first-phase-a/evidence/postgres");
  const environment = Object.fromEntries(["PATH", "HOME", "TMPDIR", "USER", "LOGNAME", "SHELL"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  exitCode = await new Promise((done, reject) => {
    const required = focused ? suites : baselineControl ? [] : ["__tests__/planner-v2/postgres/ai-first-foundation.postgres.ts", "__tests__/planner-v2/postgres/compiler-versions.postgres.ts", "__tests__/planner-v2/postgres/role-resources.postgres.ts", "__tests__/planner-v2/postgres/understanding.postgres.ts", "__tests__/planner-v2/postgres/calendar-capacity.postgres.ts", "__tests__/planner-v2/postgres/natural-learning.postgres.ts", "__tests__/planner-v2/postgres/reviewed-learning.postgres.ts", "__tests__/planner-v2/postgres/student-workspace.postgres.ts", "__tests__/planner-v2/postgres/student-workspace-http.postgres.ts"];
    const child = spawn(process.execPath, ["scripts/test/test-planner-v2-phase1-postgres.mjs", ...args, "--evidence-dir", output, ...required.flatMap(s => ["--extra-suite", s])], { cwd: temporary, env: environment, stdio: "inherit" });
    const stop = () => child.kill("SIGTERM"); process.once("SIGTERM", stop); process.once("SIGINT", stop);
    child.on("error", reject); child.on("exit", code => { process.removeListener("SIGTERM", stop); process.removeListener("SIGINT", stop); done(code ?? 1); });
  });
  if (existsSync(output)) for (const name of readdirSync(output)) cpSync(join(output, name), join(evidence, name), { recursive: true });
} finally {
  const changed = files.filter(p => !existsSync(join(root, p)) || pins[p] !== createHash("sha256").update(readFileSync(join(root, p))).digest("hex"));
  writeFileSync(join(evidence, "postgres-source-pins.json"), JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), node: process.version, focused, focusedSuite, phaseCRehearsal, baselineControl, baselineRef: baselineControl ? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim() : null, status: exitCode === 0 && !changed.length ? "PASSED" : "FAILED", sources: pins, changedDuringRun: changed, paidCalls: 0, isolation: "Historical harness and evidence writers run in a disposable source copy. Control omits Phase A migration/integration; common runtime compatibility fixes retained in both arms." }, null, 2) + "\n");
  rmSync(temporary, { recursive: true, force: true });
  if (changed.length) exitCode = 1;
}
process.exitCode = exitCode;
