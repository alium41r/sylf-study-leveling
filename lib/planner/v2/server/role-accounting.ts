import { z } from "zod";
import { ProviderCallReservationV2Schema, type PlannerAttemptV2, type RuntimeBudgetV2 } from "../contracts";
import { ResourcePolicySchema, admitRoleCall, type ResourceSnapshot } from "../intelligence/foundation/resources";
import { RoleCallSchema, ProviderReasoningSchema, type RoleCall } from "../intelligence/foundation/role-calls";
import { hash, rows, reject, type Sql } from "./database";
import type { AttemptPayload } from "./attempts";
import { recordActualUsage, reserveAttemptQuota, type ProviderUsage } from "./accounting";
import { ProducerV2Schema } from "../intelligence/foundation/contracts";
import { AI_PRICING_VERSION } from "../../../ai/config";
import { pricedProviderUsage } from "../../../ai/usage-pricing";

const ReceiptSchema = z.object({ schemaVersion: z.literal(2), roleCall: RoleCallSchema, call: ProviderCallReservationV2Schema,
  result: z.object({ text: z.string(), digest: z.string(), finishReason: z.enum(["STOP", "MAX_TOKENS", "OTHER"]).nullable(),
    reasoning:ProviderReasoningSchema.optional(),
    metadata:z.object({effectiveModel:z.string().nullable(),fingerprint:z.string().nullable()}).optional() }).optional(),
  usage: z.object({ effectiveModel: z.string().nullable(), fingerprint: z.string().nullable(), reasoningTokens: z.number().nullable(), finishReason: z.enum(["STOP", "MAX_TOKENS", "OTHER"]).nullable() }).optional(),
  accepted: z.boolean().optional() });
type Receipt = z.infer<typeof ReceiptSchema>;
type Log = { requestId: string; attemptId: string; accountingState: string; promptTokens: number; completionTokens: number;
  estimatedCostUsd: number | null; reservation: unknown; reasoningTokens: number | null; model: string };
export type UnaccountedRoleResponse={text?:string;reasoningText?:string;finishReason?:"STOP"|"MAX_TOKENS"|"OTHER";model?:string;fingerprint?:string|null};
/** Preserve available response evidence independently of billing completion.
 * No token usage, cost, acceptance or dispatch state is manufactured. */
export async function retainUnaccountedRoleResponse(sql:Sql,attempt:PlannerAttemptV2,callId:string,fence:number,response:UnaccountedRoleResponse){
  const log=(await logs(sql,attempt)).find(r=>r.requestId===callId),receipt=log?ReceiptSchema.parse(log.reservation):null;
  if(!log||!receipt||receipt.call.attemptId!==attempt.attemptId||receipt.call.fence!==fence||!["DISPATCHED","UNKNOWN_SPEND","SETTLED"].includes(log.accountingState))reject("REFERENCE_NOT_OWNED","No matching owned role dispatch can retain response evidence.");
  const text=response.text??"",digest=hash("saved-role-response-v1",text);
  if(receipt.result&&response.reasoningText!==undefined&&receipt.result.reasoning?.digest!==hash("provider-reasoning-v1",response.reasoningText))reject("IDEMPOTENCY_MISMATCH","A retained provider reasoning trace cannot be replaced.");
  if(receipt.result){if(receipt.result.text!==text||receipt.result.digest!==digest||receipt.result.finishReason!==(response.finishReason??null)||receipt.result.metadata&&hash("reported-model",receipt.result.metadata)!==hash("reported-model",{effectiveModel:response.model??null,fingerprint:response.fingerprint??null}))reject("IDEMPOTENCY_MISMATCH","A retained role response cannot be replaced.");return;}
  const raw=log.reservation as Receipt,overflow=Buffer.byteLength(text)>2*1024*1024||Buffer.byteLength(response.reasoningText??"")>2*1024*1024;
  const reasoning=response.reasoningText!==undefined?{schemaVersion:1 as const,source:"DEEPSEEK_REASONING_CONTENT" as const,text:response.reasoningText,digest:hash("provider-reasoning-v1",response.reasoningText)}:undefined;
  const result={text,digest,finishReason:response.finishReason??null,metadata:{effectiveModel:response.model??null,fingerprint:response.fingerprint??null},...(reasoning?{reasoning}:{})};
  await sql.query('UPDATE "AiUsageLog" SET reservation=$2,"finishReason"=$3 WHERE "requestId"=$1',[callId,{...raw,accepted:false,...(overflow?{responseOverflow:true}:{result})},response.finishReason??null]);
}
export function boundRolePolicy(attempt: PlannerAttemptV2, payload: AttemptPayload) {
  const policy = ResourcePolicySchema.parse(payload.resourcePolicy);
  if (!attempt.budget.aiFirst || hash("resource-policy-v1", policy) !== attempt.budget.aiFirst.policyDigest ||
    hash("resource-limits", policy.root) !== hash("resource-limits", attempt.budget.aiFirst.limits) || policy.processingMs !== attempt.budget.aiFirst.processingMs ||
    policy.authorizationDigest !== attempt.acceptedRequest.targetAuthorizationDigest) reject("INTENT_CONFLICT", "Role resources do not match this accepted authorization.");
  return policy;
}
async function logs(sql: Sql, attempt: PlannerAttemptV2, lock = true) {
  return rows<Log>(sql, `SELECT "requestId","attemptId","accountingState","promptTokens","completionTokens","estimatedCostUsd",reservation,"reasoningTokens",model FROM "AiUsageLog" WHERE "rootRequestId"=$1 AND "userId"=$2 ORDER BY id${lock ? " FOR UPDATE" : ""}`, [attempt.budget.rootRequestId, attempt.ownerId]);
}
function peakMicros(model: string, inputTokens: number, outputTokens: number) {
  const price = pricedProviderUsage(model, { promptTokens: inputTokens, completionTokens: outputTokens,
    totalTokens: inputTokens + outputTokens, cacheHitTokens: 0 }).costUsd;
  if (price === null || !Number.isFinite(price) || price < 0) reject("QUALITY_INCOMPLETE", "The provider price is unknown; no further spending is authorized.");
  return Math.ceil(price * 1000000);
}
/** A conservative projection of the existing root ledger, including held calls.
 * No second financial ledger or mutable per-attempt spending counter. */
export function roleSpendingExposure(records: readonly Pick<Log, "accountingState" | "estimatedCostUsd" | "reservation" | "model">[]) {
  let micros = 0;
  for (const row of records) {
    if (row.accountingState === "CANCELLED_BEFORE_DISPATCH") continue;
    if (row.accountingState === "SETTLED") {
      if (row.estimatedCostUsd === null || !Number.isFinite(row.estimatedCostUsd) || row.estimatedCostUsd < 0)
        reject("QUALITY_INCOMPLETE", "Spending is uncertain; reconcile it before another paid request.");
      micros += Math.ceil(row.estimatedCostUsd * 1000000);
    } else if (row.accountingState === "RESERVED") {
      const receipt = ReceiptSchema.parse(row.reservation);
      micros += peakMicros(row.model, receipt.call.reservedInputTokens, receipt.call.reservedOutputTokens);
    } else reject("QUALITY_INCOMPLETE", "Spending is uncertain; reconcile it before another paid request.");
  }
  return micros;
}
export async function assertRoleSpending(sql: Sql, attempt: PlannerAttemptV2, payload: AttemptPayload,
  additionalMicros: number, records?: readonly Log[]) {
  const spending = boundRolePolicy(attempt, payload).spending;
  if (!spending) return;
  if (spending.pricingVersion !== AI_PRICING_VERSION || !Number.isSafeInteger(additionalMicros) || additionalMicros < 0)
    reject("QUALITY_INCOMPLETE", "The approved spending quote is unavailable or changed.");
  if (roleSpendingExposure(records ?? await logs(sql, attempt)) + additionalMicros > spending.maximumMicros)
    reject("BUDGET_EXHAUSTED", "The authorized dollar ceiling cannot fund this complete request. Retained work remains available.");
}
export async function projectRoleResources(sql: Sql, attempt: PlannerAttemptV2, payload: AttemptPayload) {
  const policy = boundRolePolicy(attempt, payload), records = await logs(sql, attempt);
  const consumed = { calls: 0, inputUnits: 0, completionTokens: 0 }, reserved = { ...consumed };
  let uncertainDispatch = false, planningCalls = 0, researchCalls = 0;
  for (const log of records) {
    if (log.reservation && typeof log.reservation === "object" && Reflect.get(log.reservation,"schemaVersion") === 3) {
      uncertainDispatch ||= ["DISPATCHED","UNKNOWN_SPEND"].includes(log.accountingState); continue;
    }
    const receipt = ReceiptSchema.parse(log.reservation), state = log.accountingState;
    if (receipt.roleCall.policyDigest !== attempt.budget.aiFirst!.policyDigest) reject("INVALID_OUTPUT", "A financial receipt has a different role policy.");
    if (state === "CANCELLED_BEFORE_DISPATCH") continue;
    if (state === "RESERVED") reserved.calls++;
    else {
      consumed.calls++;
      if (receipt.roleCall.role === "RESEARCH") researchCalls++; else planningCalls++;
    }
    if (state === "SETTLED") { consumed.inputUnits += log.promptTokens; consumed.completionTokens += log.completionTokens; }
    else { reserved.inputUnits += receipt.call.reservedInputTokens; reserved.completionTokens += receipt.call.reservedOutputTokens; }
    uncertainDispatch ||= state === "UNKNOWN_SPEND" || state === "DISPATCHED" && (log.attemptId !== attempt.attemptId || receipt.call.fence !== attempt.fence);
  }
  const lineage: string[] = []; let cursor: string | null = attempt.attemptId;
  while (cursor) {
    if (lineage.includes(cursor)) reject("INVALID_OUTPUT", "Resource lineage is cyclic.");
    lineage.unshift(cursor);
    const parent: { parent: string | null } | undefined = (await rows<{ parent: string | null }>(sql, 'SELECT artifact->>\'parentAttemptId\' AS parent FROM "PlannerAttempt" WHERE id=$1 AND "userId"=$2', [cursor, attempt.ownerId]))[0];
    cursor = parent?.parent ?? null;
  }
  const snapshot: ResourceSnapshot = { schemaVersion: 1, rootRequestId: attempt.budget.rootRequestId, policyDigest: attempt.budget.aiFirst!.policyDigest,
    lineage, deadlineAt: attempt.budget.executionDeadlineAt!, consumed, reserved, uncertainDispatch,
    accountingDigest: hash("role-accounting-v1", records) };
  const budget: RuntimeBudgetV2 = { ...attempt.budget, consumed: { ...attempt.budget.consumed, modelCalls: consumed.calls, inputTokens: consumed.inputUnits,
    outputTokens: consumed.completionTokens, planningCalls, researchSynthesisCalls: researchCalls }, reserved: { modelCalls: reserved.calls, inputTokens: reserved.inputUnits, outputTokens: reserved.completionTokens } };
  return { policy, snapshot, budget, records };
}
/** Stop/cancel follows the existing receipt transitions. Late finance updates
 * remain in AiUsageLog; terminal Attempt history is never rewritten. */
export async function syncRoleStops(sql: Sql, attempt: PlannerAttemptV2, payload: AttemptPayload) {
  for (const call of payload.calls ?? []) {
    if (call.state === "CANCELLED_BEFORE_DISPATCH") await sql.query('UPDATE "AiUsageLog" SET "accountingState"=\'CANCELLED_BEFORE_DISPATCH\',"estimatedCostUsd"=0 WHERE "requestId"=$1 AND "userId"=$2 AND "accountingState"=\'RESERVED\'', [call.callId, attempt.ownerId]);
  }
}
export async function reserveRoleReceipt(sql: Sql, attempt: PlannerAttemptV2, payload: AttemptPayload, now: Date,
  input: { callId: string; provider: string; model: string; inputTokens: number; outputTokens: number; roleCall: RoleCall }) {
  const roleCall = RoleCallSchema.parse(input.roleCall), projected = await projectRoleResources(sql, attempt, payload);
  const policy = projected.policy.roles[roleCall.role];
  if (roleCall.policyDigest !== attempt.budget.aiFirst!.policyDigest || roleCall.format !== policy.format || roleCall.effort !== policy.effort || input.provider !== policy.provider || input.model !== policy.model)
    reject("INTENT_CONFLICT", "Role dispatch cannot change its authorized provider, format, effort or policy.");
  const prior = projected.records.find(row => ReceiptSchema.safeParse(row.reservation).data?.roleCall.key === roleCall.key);
  if (prior) reject("IDEMPOTENCY_MISMATCH", "This logical role call is already retained; recover its response or reconcile its dispatch.");
  try { admitRoleCall(projected.policy, projected.snapshot, roleCall.role, { calls: 1, inputUnits: input.inputTokens, completionTokens: input.outputTokens }, now.getTime()); }
  catch { reject("BUDGET_EXHAUSTED", "Role admission requires remaining authorized resources, a live deadline and downstream review capacity."); }
  const call = ProviderCallReservationV2Schema.parse({ schemaVersion: 2, callId: input.callId, rootRequestId: attempt.budget.rootRequestId, attemptId: attempt.attemptId,
    fence: attempt.fence, stage: attempt.stage, provider: input.provider, model: input.model, reservedInputTokens: input.inputTokens, reservedOutputTokens: input.outputTokens,
    state: "RESERVED", actualInputTokens: null, actualOutputTokens: null, costUsd: null, pricing: "UNKNOWN", settlementKey: input.callId });
  if (projected.policy.spending) await assertRoleSpending(sql, attempt, payload,
    peakMicros(input.model, input.inputTokens, input.outputTokens), projected.records);
  const quotaReceipt = payload.quotaReceipt?.state === "SETTLED" || payload.quotaReceipt?.state === "RESERVED" ? payload.quotaReceipt :
    await reserveAttemptQuota(sql, attempt.ownerId, attempt.kind === "JOINT" || attempt.kind === "REPLAN" ? "plannerRebalance" : "planner", now);
  await sql.query(`INSERT INTO "AiUsageLog" ("userId",feature,workload,provider,model,"requestId","rootRequestId","attemptId",stage,"accountingState",reservation,"estimatedCostUsd")
    VALUES ($1,'planner','planner_v2',$2,$3,$4,$5,$6,$7,'RESERVED',$8,NULL)`, [attempt.ownerId, call.provider, call.model, call.callId, call.rootRequestId, call.attemptId, call.stage, { schemaVersion: 2, call, roleCall }]);
  const purpose = roleCall.purpose;
  return { ...payload, quotaReceipt, calls: [...payload.calls ?? [], call], callCategories: { ...payload.callCategories, [call.callId]: roleCall.role === "RESEARCH" ? "RESEARCH" as const : "PLANNING" as const },
    providerCalls: { ...payload.providerCalls, [call.callId]: { purpose, reservedAt: now.toISOString() } } } as AttemptPayload;
}
export async function settleRoleReceipt(sql: Sql, attempt: PlannerAttemptV2, payload: AttemptPayload, callId: string, usage: ProviderUsage) {
  const log = (await logs(sql, attempt)).find(row => row.requestId === callId);
  if (!log || !["DISPATCHED", "UNKNOWN_SPEND", "SETTLED"].includes(log.accountingState)) reject("REFERENCE_NOT_OWNED", "No dispatched role receipt can be reconciled.");
  const receipt = ReceiptSchema.parse(log.reservation), call = receipt.call;
  if (call.attemptId !== attempt.attemptId) reject("REFERENCE_NOT_OWNED", "Usage belongs to another linked operation.");
  for (const value of [usage.reasoningTokens, usage.cacheHitTokens]) if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) reject("INVALID_OUTPUT", "Invalid role usage details.");
  if (usage.reasoningTokens !== undefined && usage.reasoningTokens > usage.outputTokens || usage.cacheHitTokens !== undefined && usage.cacheHitTokens > usage.inputTokens) reject("INVALID_OUTPUT", "Usage subsets cannot exceed billed totals.");
  const responseOverflow = usage.response !== undefined && Buffer.byteLength(usage.response) > 2 * 1024 * 1024||Buffer.byteLength(usage.reasoningText??"")>2*1024*1024;
  await recordActualUsage(sql, attempt.ownerId, call, usage);
  const reasoning=usage.reasoningText!==undefined?{schemaVersion:1 as const,source:"DEEPSEEK_REASONING_CONTENT" as const,text:usage.reasoningText,digest:hash("provider-reasoning-v1",usage.reasoningText)}:receipt.result?.reasoning;
  const result = !responseOverflow && usage.response !== undefined && usage.finishReason ? { text: usage.response, finishReason: usage.finishReason, digest: hash("saved-role-response-v1", usage.response),...(receipt.result?.metadata?{metadata:receipt.result.metadata}:{}),...(reasoning?{reasoning}:{}) } : undefined;
  if (receipt.result && result && hash("role-result", receipt.result) !== hash("role-result", result)) reject("IDEMPOTENCY_MISMATCH", "A retained role response cannot be replaced.");
  const details = { reasoningTokens: usage.reasoningTokens ?? null, cacheHitTokens: usage.cacheHitTokens ?? null, effectiveModel: usage.effectiveModel ?? receipt.result?.metadata?.effectiveModel ?? null, fingerprint: usage.fingerprint ?? receipt.result?.metadata?.fingerprint ?? null, finishReason: usage.finishReason ?? receipt.result?.finishReason ?? null };
  const previous = log.reservation as Receipt & { usage?: typeof details };
  if (previous.usage && hash("role-usage-details", previous.usage) !== hash("role-usage-details", details)) reject("IDEMPOTENCY_MISMATCH", "Role usage metadata already differs.");
  await sql.query('UPDATE "AiUsageLog" SET reservation=$2,"reasoningTokens"=$3,"usageKnown"=true,"cacheUsageKnown"=$4,"modelVerified"=$5,"finishReason"=$6,"cacheHitTokens"=$7 WHERE "requestId"=$1',
    [callId, { ...previous, usage: details, ...(responseOverflow ? { responseOverflow: true } : {}), ...(result ? { result } : {}) }, usage.reasoningTokens ?? null, usage.cacheHitTokens !== undefined, usage.effectiveModel !== undefined, usage.finishReason ?? null, usage.cacheHitTokens ?? 0]);
  return { ...payload, calls: payload.calls?.map(c => c.callId === callId ? { ...c, state: "SETTLED" as const, actualInputTokens: usage.inputTokens, actualOutputTokens: usage.outputTokens, costUsd: usage.costUsd, pricing: usage.costUsd === null ? "UNKNOWN" as const : "KNOWN" as const } : c) };
}
export async function recoverRoleReceipt(sql: Sql, attempt: PlannerAttemptV2, payload: AttemptPayload, roleCall: RoleCall) {
  boundRolePolicy(attempt, payload);
  const prior = (await logs(sql, attempt)).find(row => ReceiptSchema.safeParse(row.reservation).data?.roleCall.key === roleCall.key);
  if (!prior) return null;
  const receipt = ReceiptSchema.parse(prior.reservation);
  if (prior.attemptId !== attempt.attemptId || hash("role-call", receipt.roleCall) !== hash("role-call", roleCall)) reject("IDEMPOTENCY_MISMATCH", "A logical role call cannot change inputs or operation.");
  if (prior.accountingState !== "SETTLED" || !receipt.result || receipt.result.finishReason !== "STOP" || !receipt.result.text.trim()) reject("QUALITY_INCOMPLETE", "Retained dispatch is uncertain or incomplete; it cannot be repeated automatically.");
  if (receipt.result.digest !== hash("saved-role-response-v1", receipt.result.text)) reject("INVALID_OUTPUT", "Retained role response digest does not match.");
  if(receipt.result.reasoning&&receipt.result.reasoning.digest!==hash("provider-reasoning-v1",receipt.result.reasoning.text))reject("INVALID_OUTPUT","Retained provider reasoning digest does not match.");
  return { callId: prior.requestId, text: receipt.result.text, finishReason: "STOP" as const, metadata: receipt.usage };
}

export async function assertRoleCheckpoint(sql: Sql, attempt: PlannerAttemptV2, pending: { callId: string; role: string; inputDigest: string; state: string; response: string | null; responseDigest: string | null }) {
  const log = (await logs(sql, attempt, false)).find(r => r.requestId === pending.callId), receipt = log ? ReceiptSchema.parse(log.reservation) : null;
  if (!log || !receipt || log.attemptId !== attempt.attemptId || receipt.roleCall.role !== pending.role || receipt.roleCall.inputDigest !== pending.inputDigest ||
    pending.state === "RESPONSE_SAVED" && (log.accountingState !== "SETTLED" || receipt.result?.finishReason !== "STOP" || receipt.result.text !== pending.response || receipt.result.digest !== pending.responseDigest))
    reject("INVALID_OUTPUT", "Checkpoint must correspond to the exact retained role input and response.");
}

export async function assertResearchResponses(sql:Sql,attempt:PlannerAttemptV2,calls:readonly {callId:string;key:string;responseDigest:string;interpretationDigest:string}[]) {
  const records=await logs(sql,attempt,false);
  for(const call of calls) {
    const log=records.find(r=>r.requestId===call.callId),receipt=log?ReceiptSchema.safeParse(log.reservation).data:null;
    if(!log||log.attemptId!==attempt.attemptId||log.accountingState!=="SETTLED"||receipt?.roleCall.role!=="RESEARCH"||receipt.roleCall.key!==call.key||receipt.result?.finishReason!=="STOP"||receipt.result.digest!==call.responseDigest||hash("research-interpretation-v1",JSON.parse(receipt.result.text))!==call.interpretationDigest)
      reject("INVALID_OUTPUT","Research must reference its exact retained complete provider responses.","RECOVERY");
  }
}

type LearningCall = { role: string; key: string; inputDigest: string; promptDigest: string; outputCap: number; purpose?: string };
async function readCompleteLearningResponse(sql: Sql, attempt: PlannerAttemptV2, call: LearningCall, accepted: boolean) {
  const row = (await logs(sql, attempt, false)).find(r => ReceiptSchema.safeParse(r.reservation).data?.roleCall.key === call.key);
  const receipt = row && ReceiptSchema.safeParse(row.reservation).data;
  if (!row || !receipt || row.attemptId !== attempt.attemptId || row.accountingState !== "SETTLED" || receipt.result?.finishReason !== "STOP" || !receipt.result.text.trim() ||
    receipt.result.digest !== hash("saved-role-response-v1", receipt.result.text) || receipt.roleCall.role !== call.role || receipt.roleCall.inputDigest !== call.inputDigest ||
    receipt.roleCall.promptDigest !== call.promptDigest || receipt.call.reservedOutputTokens !== call.outputCap || call.purpose !== undefined && receipt.roleCall.purpose !== call.purpose || receipt.accepted !== accepted) reject("INVALID_OUTPUT", "Learning must retain its exact complete role response, validation outcome and input.", "RECOVERY");
  return { text: receipt.result.text, responseDigest: receipt.result.digest, producer: ProducerV2Schema.parse({
    callId: row.requestId, provider: receipt.call.provider, model: receipt.call.model, effectiveModel: receipt.usage?.effectiveModel ?? null,
    fingerprint: receipt.usage?.fingerprint ?? null, promptDigest: receipt.roleCall.promptDigest, inputDigest: receipt.roleCall.inputDigest,
    effort: receipt.roleCall.effort, outputCap: receipt.call.reservedOutputTokens, finishReason: "STOP",
  }) };
}
export const readLearningResponse = (sql:Sql,attempt:PlannerAttemptV2,call:LearningCall) => readCompleteLearningResponse(sql,attempt,call,true);
/** A rejected, complete response is evidence for explicit correction only. It
 * cannot authorize education, approval, uncertain replay or publication. */
export const readRejectedLearningResponse = (sql:Sql,attempt:PlannerAttemptV2,call:LearningCall) => readCompleteLearningResponse(sql,attempt,call,false);

/** The financial ledger is the durable dispatch state. A checkpoint records
 * immutable logical inputs, without duplicating responses or inventing state. */
export async function learningCallRecovery(sql: Sql, attempt: PlannerAttemptV2, call: { role: string; key: string; inputDigest: string; promptDigest: string; outputCap: number; purpose?: string }) {
  const row = (await logs(sql, attempt, false)).find(r => ReceiptSchema.safeParse(r.reservation).data?.roleCall.key === call.key);
  if (!row) return "RESUME_STAGE" as const;
  const receipt = ReceiptSchema.parse(row.reservation);
  if (row.attemptId !== attempt.attemptId || receipt.roleCall.role !== call.role || receipt.roleCall.inputDigest !== call.inputDigest || receipt.roleCall.promptDigest !== call.promptDigest || receipt.call.reservedOutputTokens !== call.outputCap || call.purpose !== undefined && receipt.roleCall.purpose !== call.purpose)
    reject("INVALID_OUTPUT", "Learning dispatch differs from its immutable retained input.", "RECOVERY");
  if (["DISPATCHED", "UNKNOWN_SPEND"].includes(row.accountingState)) return "RECONCILE_UNCERTAIN_DISPATCH" as const;
  if (row.accountingState === "SETTLED" && receipt.result?.finishReason === "STOP" && receipt.result.text.trim() && receipt.accepted !== false) return "ASSEMBLE_SAVED_RESPONSE" as const;
  return "EXPLICIT_CONTINUATION_REQUIRED" as const;
}
