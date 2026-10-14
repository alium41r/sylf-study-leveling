import { test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import pg from 'pg';
import { connect, user } from '@/__tests__/planner-v2/postgres/database';

const requireRuntime = createRequire(import.meta.url);
const directory = path.dirname(new URL(import.meta.url).pathname);
const report = path.dirname(directory), root = path.resolve(report, '../../../..');
const runtime = (name: string) => requireRuntime(path.join(root, 'dist/planner-worker', name));
const { runBlock } = requireRuntime('./block.cjs');

test('review Low pair through frozen dispatcher and genuine durable accounting', async () => {
  const requestFile = process.env.SYLF_DIAGNOSTIC_REQUEST_FILE;
  if (!requestFile) throw new Error('Explicit isolated diagnostic launcher required.');
  const request = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
  expect(request.protocolVersion).toBe('2026-10-09-step6-review-low-pair-v1');
  process.kill(request.launcherPid, 0); // launcher and its sleep assertion must still be alive
  const connection = await connect(); // existing loopback database/marker authority
  const pool = new pg.Pool({ connectionString: process.env.PLANNER_TEST_DATABASE_URL, max: 4 });
  const { PlannerDatabase } = runtime('planner/v2/server/database');
  const { AttemptService, newBudget, persistAttempt, loadAttempt } = runtime('planner/v2/server/attempts');
  const { workerProviderMeter } = runtime('planner/v2/intelligence/provider');
  const { IntentService } = runtime('planner/v2/server/intents');
  const { CanonicalIntentV2Schema } = runtime('planner/v2/contracts');
  const spec = requireRuntime('../evaluator/cases.cjs');
  const db = new PlannerDatabase(pool), attempts = new AttemptService(db);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'run-manifest.json'), 'utf8'));
  const previousUnlimited = process.env.SYLF_UNLIMITED_AI_USER_IDS;
  const labels = request.mode === 'UNPAID_PREFLIGHT' ? JSON.parse(fs.readFileSync(path.join(report, 'evaluator/labels.json'), 'utf8')) : null;
  try {
    const result = await runBlock({ mode: request.mode, directory: request.resultsDirectory, approvalFile: request.approvalFile,
      meterFactory: async (trial: { trialId: string; caseId: string; packet: string; category: string; inputReservationUnits: number; outputTokenCap: number }) => {
        const ownerId = await user(connection); process.env.SYLF_UNLIMITED_AI_USER_IDS = String(ownerId);
        const budget = newBudget('EDUCATIONAL');
        const packet = JSON.parse(fs.readFileSync(path.join(report, trial.packet), 'utf8'));
        const c = [...spec.generation, ...spec.review].find((c: { id: string }) => c.id === trial.caseId);
        const body = JSON.parse(packet.messages[0].content);
        const goals = trial.category === 'REASONING' ? body.context.plans.map((p: { resolved: unknown }) => p.resolved) :
          JSON.parse(fs.readFileSync(path.join(report, 'evaluator/candidates', trial.caseId + '.json'), 'utf8')).input.goals.map((g: { resolved: unknown }) => g.resolved);
        const targets = [];
        for (const goal of goals) {
          const intent = CanonicalIntentV2Schema.parse({ ...goal, schemaVersion: 2, policySelection: 'USER_OVERRIDE',
            scope: goal.scope.map((s: { ref: string; title: string; inclusion: string; sourceClaimIds: string[] }) => ({ scopeKey: randomUUID(), modelRef: s.ref, parentKey: null,
              title: s.title, inclusion: s.inclusion, sourceClaimIds: s.sourceClaimIds })), evidence: [],
            availability: { timezone: 'Asia/Karachi', dailyCeilingMinutes: Array(7).fill(c.minutes), weeklyCeilingMinutes: c.minutes * 7,
              restWeekdays: [], blockedDates: [], recoveryPercent: 0, basis: 'CONFIRMED_AVAILABILITY' }, assumptions: [], unresolvedQuestions: [] });
          const created = await new IntentService(db).create(ownerId, randomUUID(), intent);
          targets.push({ planId: created.plan.id, intentId: created.intent.intentVersionId, planningVersion: 0, baseRevisionId: null });
        }
        const attempt = await attempts.enqueue(ownerId, { key: randomUUID(), text: 'Isolated educational diagnostic: ' + trial.trialId,
          kind: targets.length === 2 ? 'JOINT' : 'PLAN', targets, budget });
        const token = await attempts.claim('diagnostic_' + randomUUID());
        expect(token?.attemptId).toBe(attempt.attemptId);
        // Isolated review starts at a fixed ALLOCATION fixture. Seed its existing holdback,
        // without fabricating an earlier dispatch or declaring the root successfully planned.
        await attempts.mutate(token, (sql: unknown, owned: unknown, payload: object) => persistAttempt(sql, owned, owned, {
          ...payload, providerGuard: { reviewReserve: packet.policy.reviewReserve ?? { inputTokens: trial.inputReservationUnits, outputTokens: trial.outputTokenCap } },
        }));
        const heartbeat = setInterval(() => { void attempts.renew(token).catch(() => {}); }, 10000);
        return { meter: workerProviderMeter(attempts, token), rootRequestId: budget.rootRequestId, attemptId: attempt.attemptId,
          finish: async () => {
            clearInterval(heartbeat);
            await attempts.cancel(ownerId, attempt.attemptId); // no SUCCEEDED/artifact/ApplyService path
            const stored = await db.coordinated(ownerId, (sql: unknown) => loadAttempt(sql, ownerId, attempt.attemptId));
            fs.writeFileSync(path.join(request.resultsDirectory, 'canonical-' + trial.trialId + '.json'), JSON.stringify(stored, null, 2) + '\n', { mode: 0o600 });
            const rows = (await connection.query('SELECT "accountingState", "estimatedCostUsd" FROM "AiUsageLog" WHERE "attemptId"=$1', [attempt.attemptId])).rows;
            expect(rows.length).toBeLessThanOrEqual(1);
            expect(stored.attempt.state).toBe('CANCELLED');
            expect(stored.payload.calls?.length ?? 0).toBeLessThanOrEqual(1);
          } };
      },
      fixtureResponse: (trial: { category: string; caseId: string; inputReservationUnits: number; outputTokenCap: number }) => {
        let text = JSON.stringify({ strategy: 'Scripted transport fixture only. Educational quality is not evaluated by this preflight.' });
        if (trial.category === 'REVIEW') {
          const candidate = JSON.parse(fs.readFileSync(path.join(report, 'evaluator/candidates', trial.caseId + '.json'), 'utf8'));
          const findings = labels.repair[trial.caseId]?.originalFindings ?? [];
          text = JSON.stringify({ plans: candidate.input.goals.map((goal: { planRef: string }) => ({ planRef: goal.planRef,
            issues: findings.filter((f: { planRef: string }) => f.planRef === goal.planRef).map((f: { finding: unknown }) => f.finding) })) });
        }
        return { model: 'deepseek-flash', system_fingerprint: 'UNPAID_FIXTURE', choices: [{ finish_reason: 'stop', message: { content: text } }],
          usage: { prompt_tokens: trial.inputReservationUnits, completion_tokens: trial.outputTokenCap,
            total_tokens: trial.inputReservationUnits + trial.outputTokenCap, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: trial.inputReservationUnits, completion_tokens_details: { reasoning_tokens: 2048 } } };
      },
    });
    if (request.mode === 'UNPAID_PREFLIGHT') {
      expect(result.status).toBe('COMPLETE_UNASSESSED'); expect(result.calls).toBe(2);
      expect(result.interceptedRequests).toBe(2); expect(result.paidCalls).toBe(0); expect(result.reservedUsd).toBe(0.016803);
      const calls = JSON.parse(fs.readFileSync(path.join(request.resultsDirectory, 'spending.json'), 'utf8')).calls;
      expect(calls.every((call: { wires: number; status: string }) => call.wires === 1 && call.status === 'SETTLED')).toBe(true);
      const rows = (await connection.query('SELECT "accountingState", "estimatedCostUsd" FROM "AiUsageLog" WHERE model=\'deepseek-flash\'')).rows;
      expect(rows).toHaveLength(manifest.runs.length);
      expect(rows.every(row => row.estimatedCostUsd === null)).toBe(true);
      expect((await connection.query('SELECT count(*)::int AS n FROM "PlannerRevision"')).rows[0].n).toBe(0);
      expect((await connection.query('SELECT count(*)::int AS n FROM "Quest"')).rows[0].n).toBe(0);
    }
  } finally {
    if (previousUnlimited === undefined) delete process.env.SYLF_UNLIMITED_AI_USER_IDS; else process.env.SYLF_UNLIMITED_AI_USER_IDS = previousUnlimited;
    await pool.end(); await connection.end();
  }
}, 3900000);
