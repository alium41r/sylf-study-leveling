import { ProviderCallReservationV2Schema, RuntimeBudgetV2Schema, PLANNER_V2_BUDGETS, type RuntimeBudgetV2 } from "../contracts";
import { reserveOwnedQuota, settleOwnedQuota, type QuotaReservationReceipt } from "../../../ai/quota-accounting";
import type { QuotaFeature } from "../../../ai/config";
import { PlannerDatabase, rows, reject, clock, hash, type Sql } from "./database";
import { reserveProviderCapacity, type ProviderPolicy, type ProviderGuard } from "../intelligence/provider-policy";

type Call = ReturnType<typeof ProviderCallReservationV2Schema.parse>;
export type ProviderUsage = { inputTokens: number; outputTokens: number; costUsd: number | null };
export async function reserveAttemptQuota(sql: Sql, ownerId: number, feature: QuotaFeature, now: Date) {
  const receipt = await reserveOwnedQuota(sql, ownerId, feature, now);
  if (!receipt) reject("BUDGET_EXHAUSTED", "The study-planning usage allowance is exhausted.", "PREFLIGHT");
  return receipt;
}
export async function finalizeAttemptQuota(sql: Sql, receipt: QuotaReservationReceipt, dispatched: boolean, now: Date) {
  if (receipt.state !== "RESERVED") return receipt;
  // Dispatched uncertainty is real spend. A failure cannot make retries free.
  return settleOwnedQuota(sql, receipt, dispatched ? "SETTLED" : "RELEASED", now);
}
export async function recordDispatch(sql: Sql, ownerId: number, call: Call) {
  await sql.query(`INSERT INTO "AiUsageLog" ("userId",feature,workload,provider,model,"requestId","rootRequestId","attemptId",stage,"accountingState","estimatedCostUsd")
    VALUES ($1,'planner','planner_v2',$2,$3,$4,$5,$6,$7,'DISPATCHED',NULL) ON CONFLICT ("requestId") DO NOTHING`,
    [ownerId, call.provider, call.model, call.callId, call.rootRequestId, call.attemptId, call.stage]);
}
export async function recordUnknown(sql: Sql, ownerId: number, calls: readonly Call[]) {
  const ids = calls.filter(call => call.state === "UNKNOWN_SPEND").map(call => call.callId);
  if (ids.length) await sql.query('UPDATE "AiUsageLog" SET "accountingState"=\'UNKNOWN_SPEND\' WHERE "userId"=$1 AND "requestId"=ANY($2::uuid[]) AND "accountingState"=\'DISPATCHED\'', [ownerId, ids]);
}
/** Financial reconciliation can outlive a lease. It never mutates Plan,
 * Attempt, budget, checkpoint or publication. The dispatched receipt is the
 * authority and its unique requestId makes exact replay harmless. */
export async function recordActualUsage(sql: Sql, ownerId: number, call: Call, usage: ProviderUsage): Promise<void> {
  if (![usage.inputTokens, usage.outputTokens].every(value => Number.isSafeInteger(value) && value >= 0) ||
    usage.costUsd !== null && (!Number.isFinite(usage.costUsd) || usage.costUsd < 0)) reject("INVALID_OUTPUT", "Provider accounting must retain finite, nonnegative actual usage.");
  const log = (await rows<{ userId: number; attemptId: string; provider: string; model: string; accountingState: string; promptTokens: number; completionTokens: number; estimatedCostUsd: number | null }>(sql,
    'SELECT * FROM "AiUsageLog" WHERE "requestId"=$1 FOR UPDATE', [call.callId]))[0];
  if (!log || log.userId !== ownerId || log.attemptId !== call.attemptId || log.provider !== call.provider || log.model !== call.model)
    reject("REFERENCE_NOT_OWNED", "This provider usage does not belong to a dispatched request.");
  if (log.accountingState === "SETTLED") {
    if (log.promptTokens !== usage.inputTokens || log.completionTokens !== usage.outputTokens || log.estimatedCostUsd !== usage.costUsd)
      reject("IDEMPOTENCY_MISMATCH", "This provider request was already accounted differently.");
    return;
  }
  await sql.query('UPDATE "AiUsageLog" SET "promptTokens"=$2,"completionTokens"=$3,"estimatedCostUsd"=$4,"accountingState"=\'SETTLED\' WHERE "requestId"=$1',
    [call.callId, usage.inputTokens, usage.outputTokens, usage.costUsd]);
}

interface ForegroundReceipt { call: Call; quotaReceipt: QuotaReservationReceipt; requestDigest: string;
  boundary?: { profile: RuntimeBudgetV2["profile"]; startedAt: string; rootStartedAt: string; completedAt?: string; guard: ProviderGuard } }
async function foregroundReceipts(sql: Sql, ownerId: number, rootRequestId: string) {
  const logs = await rows<{ userId: number; requestId: string; attemptId: string | null; reservation: ForegroundReceipt | null }>(sql,
    'SELECT "userId","requestId","attemptId",reservation FROM "AiUsageLog" WHERE "rootRequestId"=$1 ORDER BY id FOR UPDATE', [rootRequestId]);
  if (logs.some(log => log.userId !== ownerId || log.attemptId !== null || !log.reservation)) reject("IDEMPOTENCY_MISMATCH", "This root accounting is already transferred or unavailable.");
  return logs.map(log => ({ ...log, receipt: log.reservation! }));
}
function foregroundBudget(raw: RuntimeBudgetV2, receipts: readonly ForegroundReceipt[]): RuntimeBudgetV2 {
  const budget = structuredClone(raw);
  budget.consumed.modelCalls = receipts.length;
  budget.consumed.inputTokens = receipts.reduce((sum, receipt) => sum + (receipt.call.actualInputTokens ?? 0), 0);
  budget.consumed.outputTokens = receipts.reduce((sum, receipt) => sum + (receipt.call.actualOutputTokens ?? 0), 0);
  budget.reserved = { modelCalls: 0,
    inputTokens: receipts.reduce((sum, receipt) => sum + (receipt.call.state === "SETTLED" ? 0 : receipt.call.reservedInputTokens), 0),
    outputTokens: receipts.reduce((sum, receipt) => sum + (receipt.call.state === "SETTLED" ? 0 : receipt.call.reservedOutputTokens), 0) };
  if (receipts.some(r => r.boundary)) budget.foregroundProcessingMs = Math.min(PLANNER_V2_BUDGETS[budget.profile].executionSeconds * 1000,
    receipts.reduce((sum, r) => sum + (r.boundary?.completedAt ? Math.max(0, Date.parse(r.boundary.completedAt) - Date.parse(r.boundary.startedAt)) : 0), 0));
  return RuntimeBudgetV2Schema.parse(budget);
}
export async function restoreForegroundBudget(sql:Sql,ownerId:number,budget:RuntimeBudgetV2) {
  return foregroundBudget(budget,(await foregroundReceipts(sql,ownerId,budget.rootRequestId)).map(log=>log.receipt));
}
/** Durable foreground interpretation accounting, without an interview/provider
 * implementation. The same owned receipt transfers to the queue exactly once.
 * Record this dispatch BEFORE calling the provider; a crash retains real spend. */
export class ForegroundAccountingService {
  constructor(readonly db: PlannerDatabase) {}
  async dispatch(ownerId: number, budget: RuntimeBudgetV2, feature: QuotaFeature,
    input: { callId: string; provider: string; model: string; inputTokens: number; outputTokens: number; policy?: ProviderPolicy }) {
    const requestDigest = hash("foreground-dispatch", { rootRequestId: budget.rootRequestId, feature, input });
    return this.db.coordinated(ownerId, async sql => {
      if ((await rows(sql, 'SELECT id FROM "PlannerAttempt" WHERE artifact->\'budget\'->>\'rootRequestId\'=$1', [budget.rootRequestId])).length) reject("IDEMPOTENCY_MISMATCH", "This foreground root already belongs to durable work.");
      const existing = await foregroundReceipts(sql, ownerId, budget.rootRequestId);
      if(input.policy?.purpose==="INTERPRETATION" && existing.length>=2 && !existing.some(log=>log.requestId===input.callId)) reject("BUDGET_EXHAUSTED","The assistant shares two external attempts, including fallback.","INTERPRETATION");
      const now = await clock(sql);
      if (input.policy && input.policy.purpose !== "INTERPRETATION") reject("INVALID_OUTPUT", "Foreground model calls are bounded interpretation only.");
      const priorBoundary = existing.at(-1)?.receipt.boundary;
      if (input.policy && existing.length && !priorBoundary || priorBoundary && (!input.policy || priorBoundary.profile !== budget.profile))
        reject("IDEMPOTENCY_MISMATCH", "Foreground metering policy and root profile cannot change.");
      const rootStartedAt = priorBoundary?.rootStartedAt ?? now.toISOString();
      if (input.policy && Date.parse(rootStartedAt) + PLANNER_V2_BUDGETS[budget.profile].executionSeconds * 1000 <= now.getTime())
        reject("BUDGET_EXHAUSTED", "The foreground processing window expired.", "INTERPRETATION");
      const replay = existing.find(log => log.requestId === input.callId);
      if (replay) {
        if (replay.receipt.requestDigest !== requestDigest) reject("IDEMPOTENCY_MISMATCH", "Foreground call identity belongs to different input.");
        return { call: replay.receipt.call, budget: foregroundBudget(budget, existing.map(log => log.receipt)) };
      }
      if (budget.processingStartedAt !== null || existing.length >= 2 || existing.some(log => log.receipt.quotaReceipt.feature !== feature)) reject("BUDGET_EXHAUSTED", "Foreground interpretation cannot reset or exceed its request allowance.");
      const call = ProviderCallReservationV2Schema.parse({ schemaVersion:2,callId:input.callId,rootRequestId:budget.rootRequestId,attemptId:null,fence:0,stage:"INTERPRETATION",
        provider:input.provider,model:input.model,reservedInputTokens:input.inputTokens,reservedOutputTokens:input.outputTokens,state:"DISPATCHED",actualInputTokens:null,actualOutputTokens:null,costUsd:null,pricing:"UNKNOWN",settlementKey:input.callId });
      const quotaReceipt = existing[0]?.receipt.quotaReceipt ?? await finalizeAttemptQuota(sql, await reserveAttemptQuota(sql, ownerId, feature, await clock(sql)), true, await clock(sql));
      const receipt: ForegroundReceipt = { call, quotaReceipt, requestDigest };
      const nextBudget = foregroundBudget(budget, [...existing.map(log => log.receipt), receipt]);
      if (input.policy) {
        if (existing.some(log => log.receipt.boundary && !log.receipt.boundary.completedAt)) reject("INTENT_CONFLICT", "Only one foreground provider call can be pending per root.");
        receipt.boundary = { profile: budget.profile, startedAt: now.toISOString(), rootStartedAt,
          guard: reserveProviderCapacity(nextBudget, priorBoundary?.guard ?? {}, input.policy, now, ["EDUCATIONAL", "RESEARCH"].includes(budget.profile)) };
      }
      await recordDispatch(sql, ownerId, call);
      const saved = await sql.query('UPDATE "AiUsageLog" SET reservation=$3 WHERE "requestId"=$1 AND "userId"=$2 AND "attemptId" IS NULL AND reservation IS NULL RETURNING id', [call.callId, ownerId, receipt]);
      if (saved.rowCount !== 1) reject("IDEMPOTENCY_MISMATCH", "Foreground dispatch could not be recorded exactly.");
      return { call, budget: nextBudget };
    });
  }
  async settle(ownerId: number, budget: RuntimeBudgetV2, callId: string, usage: ProviderUsage) {
    return this.db.coordinated(ownerId, async sql => {
      const logs = await foregroundReceipts(sql, ownerId, budget.rootRequestId);
      const log = logs.find(log => log.requestId === callId);
      if (!log) reject("REFERENCE_NOT_OWNED", "Foreground usage has no owned dispatch.");
      await recordActualUsage(sql, ownerId, log.receipt.call, usage);
      if (log.receipt.boundary) log.receipt.boundary.completedAt ??= (await clock(sql)).toISOString();
      log.receipt.call = ProviderCallReservationV2Schema.parse({ ...log.receipt.call,state:"SETTLED",actualInputTokens:usage.inputTokens,actualOutputTokens:usage.outputTokens,costUsd:usage.costUsd,pricing:usage.costUsd === null ? "UNKNOWN" : "KNOWN" });
      await sql.query('UPDATE "AiUsageLog" SET reservation=$2 WHERE "requestId"=$1', [callId, log.receipt]);
      return foregroundBudget(budget, logs.map(log => log.receipt));
    });
  }
  async window(ownerId: number, budget: RuntimeBudgetV2, maximumMs?:number) {
    return this.db.coordinated(ownerId, async sql => {
      const logs = await foregroundReceipts(sql, ownerId, budget.rootRequestId); const now = await clock(sql);
      const boundary = logs.at(-1)?.receipt.boundary;
      if (logs.length && (!boundary || boundary.profile !== budget.profile)) reject("IDEMPOTENCY_MISMATCH", "Foreground root profile changed.");
      if(maximumMs!==undefined && (!Number.isSafeInteger(maximumMs)||maximumMs<=0))reject("INVALID_OUTPUT","Invalid foreground sub-window.");
      return { now: now.getTime(), deadline: Date.parse(boundary?.rootStartedAt ?? now.toISOString()) + Math.min(PLANNER_V2_BUDGETS[budget.profile].executionSeconds * 1000,maximumMs??Infinity) };
    });
  }
  async close(ownerId: number, budget: RuntimeBudgetV2, callId: string) {
    return this.db.coordinated(ownerId, async sql => {
      const logs = await foregroundReceipts(sql, ownerId, budget.rootRequestId); const log = logs.find(log => log.requestId === callId);
      if (!log?.receipt.boundary) reject("REFERENCE_NOT_OWNED", "No metered foreground dispatch exists.");
      log.receipt.boundary.completedAt ??= (await clock(sql)).toISOString();
      if (log.receipt.call.state === "DISPATCHED") log.receipt.call.state = "UNKNOWN_SPEND";
      await recordUnknown(sql, ownerId, [log.receipt.call]);
      await sql.query('UPDATE "AiUsageLog" SET reservation=$2 WHERE "requestId"=$1', [callId, log.receipt]);
      return foregroundBudget(budget, logs.map(log => log.receipt));
    });
  }
  async recordLateUsage(ownerId: number, callId: string, usage: ProviderUsage) {
    await this.db.coordinated(ownerId, async sql => {
      const log = (await rows<{ userId: number; attemptId: string | null; reservation: ForegroundReceipt | null }>(sql, 'SELECT "userId","attemptId",reservation FROM "AiUsageLog" WHERE "requestId"=$1 FOR UPDATE', [callId]))[0];
      if (!log?.reservation || log.userId !== ownerId) reject("REFERENCE_NOT_OWNED", "No owned foreground dispatch can be reconciled.");
      await recordActualUsage(sql, ownerId, { ...log.reservation.call, attemptId: log.attemptId }, usage);
    });
  }
}
export async function transferForegroundAccounting(sql: Sql, ownerId: number, attemptId: string, budget: RuntimeBudgetV2) {
  const logs = await foregroundReceipts(sql, ownerId, budget.rootRequestId);
  const receipts = logs.map(log => log.receipt);
  const actual = foregroundBudget(budget, receipts);
  if (hash("foreground-counters", { consumed:actual.consumed,reserved:actual.reserved }) !== hash("foreground-counters", { consumed:budget.consumed,reserved:budget.reserved }) ||
    budget.consumed.planningCalls !== 0 || budget.consumed.researchSynthesisCalls !== 0 || budget.reserved.modelCalls !== 0)
    reject("IDEMPOTENCY_MISMATCH", "Transferred counters must match owned foreground provider receipts.");
  const limit = PLANNER_V2_BUDGETS[budget.profile];
  if (budget.consumed.inputTokens > limit.inputTokens || budget.consumed.outputTokens > limit.outputTokens) reject("BUDGET_EXHAUSTED", "Foreground usage exceeded the selected root allowance.");
  if (!logs.length) return {};
  if (receipts.some(r => r.boundary) && (budget.foregroundProcessingMs !== actual.foregroundProcessingMs ||
    receipts.some(r => r.boundary?.profile !== budget.profile || !r.boundary.completedAt) || budget.foregroundProcessingMs >= limit.executionSeconds * 1000))
    reject("BUDGET_EXHAUSTED", "Foreground time and profile must transfer exactly within the root allowance.");
  // Foreground calls must have resolved accounting before work can be queued;
  // unknown foreground results fail truthfully and cannot become a fresh budget.
  if (receipts.some(receipt => receipt.call.state !== "SETTLED")) reject("SAVE_FAILED", "Resolve foreground provider accounting before enqueueing this request.");
  const calls = receipts.map(receipt => ({ ...receipt.call, attemptId }));
  for (const call of calls) await sql.query('UPDATE "AiUsageLog" SET "attemptId"=$2 WHERE "requestId"=$1 AND "attemptId" IS NULL', [call.callId, attemptId]);
  return { quotaReceipt: receipts[0].quotaReceipt, calls, callCategories: Object.fromEntries(calls.map(call => [call.callId,"OTHER" as const])),
    ...(receipts.at(-1)?.boundary ? { providerGuard: receipts.at(-1)!.boundary!.guard } : {}) };
}
