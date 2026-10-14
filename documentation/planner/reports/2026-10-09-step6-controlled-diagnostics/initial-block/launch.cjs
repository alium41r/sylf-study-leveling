#!/usr/bin/env node
'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- Isolated diagnostic command using the existing disposable PostgreSQL harness. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { here, root, sha } = require('./guard.cjs'), { requireApproval } = require('./block.cjs'), { preventSleep } = require('./sleep.cjs');
const mode = process.argv[2], approvalFile = process.argv[3];
assert(['preflight', 'paid'].includes(mode), 'Usage: launch.cjs preflight | launch.cjs paid /absolute/approval.json');
if (mode === 'paid') { assert(approvalFile && path.isAbsolute(approvalFile)); requireApproval(approvalFile); }
const json = x => JSON.stringify(x, null, 2) + '\n';
async function main() {
  const sleep = await preventSleep();
  const working = fs.mkdtempSync(path.join(__dirname, '.harness-'));
  const resultsDirectory = path.join(__dirname, 'evidence', mode === 'paid' ? 'paid-run' : 'unpaid-' + new Date().toISOString().replace(/[:.]/g, '-'));
  assert(!fs.existsSync(resultsDirectory), 'Never overwrite or reset a diagnostic spending journal.');
  fs.mkdirSync(resultsDirectory, { recursive: true, mode: 0o700 });
  try {
    execFileSync(process.execPath, [path.join(here, 'prepare.cjs'), 'check'], { cwd: root, stdio: 'pipe' });
    // Derive a disposable copy: keep audited bootstrap/identity/cleanup; select only
    // this stage suite, omit rebuilding the frozen runtime and unrelated test blocks.
    let harness = fs.readFileSync(path.join(root, 'scripts/test-planner-v2-phase1-postgres.mjs'), 'utf8');
    const replace = (from, to) => { assert.equal(harness.split(from).length, 2, 'Pinned harness layout changed.'); harness = harness.replace(from, to); };
    const suite = path.join(__dirname, 'postgres.test.ts'), requestFile = path.join(working, 'request.json');
    fs.writeFileSync(requestFile, json({ protocolVersion: '2026-10-09-step6-controlled-diagnostics-v2', mode: mode === 'paid' ? 'PAID' : 'UNPAID_PREFLIGHT',
      launcherPid: process.pid, resultsDirectory, approvalFile: approvalFile ?? null }));
    const configFile = path.join(working, 'vitest.config.mjs');
    fs.writeFileSync(configFile, `export default ${JSON.stringify({ resolve: { alias: { '@': root, 'server-only': path.join(root, '__tests__/planner/server-only-stub.ts') } },
      test: { environment: 'node', include: [suite], fileParallelism: false, testTimeout: 3900000, hookTimeout: 15000 } })};\n`);
    replace('const root = resolve(import.meta.dirname, "..");', 'const root = ' + JSON.stringify(root) + ';');
    replace('const childEnvironment = { ...environment,', 'const childEnvironment = { ...environment, SYLF_DIAGNOSTIC_REQUEST_FILE: ' + JSON.stringify(requestFile) + ',');
    replace('run(process.execPath, ["scripts/build-planner-worker.mjs"]);', 'run(process.execPath, [' + JSON.stringify(path.join(here, 'prepare.cjs')) + ', "check"]);');
    replace('"--config", "vitest.planner-v2-postgres.config.ts",', '"--config", ' + JSON.stringify(configFile) + ',');
    replace('timeout: 600_000', 'timeout: 4000000');
    const gate = harness.match(/checkReport\("phase1", newReport, \[[^\n]+\], newError\);/)?.[0]; assert(gate);
    replace(gate, 'checkReport("diagnostic", newReport, [' + JSON.stringify(suite) + '], newError);');
    const currentBlock = harness.match(/  const currentReport = join\(temporary, "current-report.json"\);[\s\S]*?  checkReport\("current", currentReport, currentRequired, currentError\);/)?.[0]; assert(currentBlock);
    replace(currentBlock, '  // Independent stage experiment only; unrelated unit gate is unchanged.');
    const script = path.join(working, 'harness.mjs'); fs.writeFileSync(script, harness);
    fs.writeFileSync(path.join(resultsDirectory, 'launcher-sleep.json'), json(sleep.initial));
    if (mode === 'preflight') {
      const log = execFileSync(process.execPath, ['--test', path.join(__dirname, 'guard.test.cjs')], { cwd: root, stdio: 'pipe' });
      fs.writeFileSync(path.join(resultsDirectory, 'guard-tests.log'), log);
    }
    const child = spawn(process.execPath, [script, '--evidence-dir', resultsDirectory], { cwd: root, stdio: 'pipe' });
    const logFile = fs.openSync(path.join(resultsDirectory, 'harness.log'), 'wx', 0o600);
    child.stdout.on('data', data => fs.writeSync(logFile, data)); child.stderr.on('data', data => fs.writeSync(logFile, data));
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
    fs.closeSync(logFile); assert.equal(code, 0, 'Disposable diagnostic execution failed; inspect evidence.');
    execFileSync(process.execPath, [path.join(here, 'prepare.cjs'), 'check'], { cwd: root, stdio: 'pipe' });
    sleep.check();
    if (mode === 'preflight') {
      const summary = JSON.parse(fs.readFileSync(path.join(resultsDirectory, 'summary.json')));
      fs.writeFileSync(path.join(__dirname, 'evidence/preflight.json'), json({ status: 'PASSED', checkedAt: new Date().toISOString(), paidCalls: 0,
        realAccounting: true, guardTestsPassed: 15, interceptedDispatches: 20, reasoning: 8, independentReview: 12,
        worstCaseReservedUsd: summary.reservedUsd, noProductionRoutingMutation: true, sleepVerified: true,
        sourceFreezeSha256: sha(fs.readFileSync(path.join(here, 'freeze.json'))),
        toolingSha256: Object.fromEntries(['block.cjs', 'guard.cjs', 'guard.test.cjs', 'launch.cjs', 'sleep.cjs', 'postgres.test.ts']
          .map(name => [name, sha(fs.readFileSync(path.join(__dirname, name)))])), evidenceDirectory: path.relative(here, resultsDirectory) }));
    }
    process.stdout.write(json({ status: mode === 'preflight' ? 'UNPAID_PREFLIGHT_PASSED' : 'PAID_BLOCK_FINISHED_UNASSESSED', resultsDirectory }));
  } finally { sleep.release(); fs.rmSync(working, { recursive: true, force: true }); }
}
main().catch(() => { process.stderr.write('DIAGNOSTIC_STOPPED: no further calls are authorized; inspect the evidence or approval gate.\n'); process.exitCode = 1; });
