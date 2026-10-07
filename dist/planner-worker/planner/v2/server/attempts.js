"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attemptPayloadDigest = exports.AttemptService = void 0;
exports.loadAttempt = loadAttempt;
exports.persistAttempt = persistAttempt;
exports.assertAttemptCurrent = assertAttemptCurrent;
exports.assertLease = assertLease;
exports.stopAccounting = stopAccounting;
exports.supersedePlanAttempts = supersedePlanAttempts;
exports.newBudget = newBudget;
const node_crypto_1 = require("node:crypto");
const contracts_1 = require("../contracts");
const database_1 = require("./database");
const intents_1 = require("./intents");
const accounting_1 = require("./accounting");
const provider_policy_1 = require("../intelligence/provider-policy");
async function loadAttempt(sql, ownerId, attemptId, lock = true) {
    // Inspect without row locks, then establish Plan -> Attempt order.
    const initial = (await (0, database_1.rows)(sql, 'SELECT artifact FROM "PlannerAttempt" WHERE id=$1::uuid AND "userId"=$2', [attemptId, ownerId]))[0];
    if (!initial)
        (0, database_1.reject)("REFERENCE_NOT_OWNED", "This operation is unavailable.");
    const artifact = contracts_1.PlannerAttemptV2Schema.parse(initial.artifact);
    if (lock)
        for (const target of [...artifact.targets].sort((a, b) => a.planId.localeCompare(b.planId)))
            await (0, intents_1.ownedPlan)(sql, ownerId, target.planId);
    const row = (await (0, database_1.rows)(sql, `SELECT artifact,payload FROM "PlannerAttempt" WHERE id=$1::uuid AND "userId"=$2${lock ? " FOR UPDATE" : ""}`, [attemptId, ownerId]))[0];
    if (!row)
        (0, database_1.reject)("REFERENCE_NOT_OWNED", "This operation is unavailable.");
    return { attempt: contracts_1.PlannerAttemptV2Schema.parse(row.artifact), payload: row.payload ?? {} };
}
async function persistAttempt(sql, before, raw, payload) {
    const after = contracts_1.PlannerAttemptV2Schema.parse(raw);
    const errors = (0, contracts_1.validateAttemptTransition)(before, after);
    if (errors.length)
        (0, database_1.reject)("INVALID_OUTPUT", errors.join("; "));
    if ((0, contracts_1.plannerSerializedBytes)({ artifact: after, payload }) > contracts_1.PLANNER_V2_ENVELOPE.serializedBytes)
        (0, database_1.reject)("PAYLOAD_TOO_LARGE", "The durable checkpoint exceeds its transport budget.");
    if (payload) {
        await (0, accounting_1.recordUnknown)(sql, after.ownerId, payload.calls ?? []);
        if (payload.quotaReceipt?.state === "RESERVED" && ["SUCCEEDED", "FAILED", "CANCELLED", "SUPERSEDED", "NEEDS_DECISION"].includes(after.state)) {
            payload = { ...payload, quotaReceipt: await (0, accounting_1.finalizeAttemptQuota)(sql, payload.quotaReceipt, (payload.calls ?? []).some(call => ["DISPATCHED", "UNKNOWN_SPEND", "SETTLED"].includes(call.state)), await (0, database_1.clock)(sql)) };
        }
    }
    await sql.query('UPDATE "PlannerAttempt" SET state=$2,kind=$3,fence=$4,"leaseOwner"=$5,"leaseExpiresAt"=$6,"executionDeadlineAt"=$7,artifact=$8,payload=COALESCE($9::jsonb,payload),"updatedAt"=clock_timestamp() WHERE id=$1', [after.attemptId, after.state, after.kind, after.fence, after.lease?.owner ?? null, after.lease?.expiresAt ?? null, after.budget.executionDeadlineAt, after, payload ?? null]);
    return after;
}
async function assertAttemptCurrent(sql, attempt) {
    for (const target of [...attempt.targets].sort((a, b) => a.planId.localeCompare(b.planId))) {
        const plan = await (0, intents_1.ownedPlan)(sql, attempt.ownerId, target.planId);
        if (plan.contractVersion !== 2 || plan.state === "ARCHIVED" || plan.state === "COMPLETED" ||
            plan.workingIntentVersionId !== (target.resolvedIntentVersionId ?? target.requestedIntentVersionId) ||
            plan.version !== (target.resolvedPlanningVersion ?? target.planningVersion) || plan.activeRevisionId !== target.baseActiveRevisionId)
            (0, database_1.reject)("SUPERSEDED", "The accepted goal or active plan changed.");
    }
}
async function assertLease(sql, attempt, token, allowExpiredDeadline = false) {
    const now = await (0, database_1.clock)(sql);
    if (attempt.state !== "RUNNING" || !attempt.lease || attempt.lease.owner !== token.workerId || attempt.fence !== token.fence || Date.parse(attempt.lease.expiresAt) <= now.getTime())
        (0, database_1.reject)("LEASE_EXPIRED", "This worker no longer owns the operation.", attempt.stage);
    if (!allowExpiredDeadline && attempt.budget.executionDeadlineAt && Date.parse(attempt.budget.executionDeadlineAt) <= now.getTime())
        (0, database_1.reject)("BUDGET_EXHAUSTED", "The operation exceeded its processing deadline.", attempt.stage);
    await assertAttemptCurrent(sql, attempt);
    return now;
}
/** Undispatched calls cost nothing. Dispatched uncertainty keeps its token
 * reservation and call counters until actual accounting can be reconciled. */
function stopAccounting(attempt, payload) {
    const budget = structuredClone(attempt.budget);
    const calls = payload.calls?.map(call => {
        if (call.state === "RESERVED") {
            budget.reserved.modelCalls--;
            budget.reserved.inputTokens -= call.reservedInputTokens;
            budget.reserved.outputTokens -= call.reservedOutputTokens;
            return { ...call, state: "CANCELLED_BEFORE_DISPATCH", actualInputTokens: 0, actualOutputTokens: 0, costUsd: 0, pricing: "KNOWN" };
        }
        return call.state === "DISPATCHED" ? { ...call, state: "UNKNOWN_SPEND", costUsd: null, pricing: "UNKNOWN" } : call;
    });
    return { budget, payload: { ...payload, calls } };
}
async function supersedePlanAttempts(sql, ownerId, planIds) {
    // Caller already owns all target Plan locks, in stable identity order.
    const existing = await (0, database_1.rows)(sql, `SELECT artifact,payload FROM "PlannerAttempt" WHERE "userId"=$1 AND state IN ('QUEUED','RUNNING','NEEDS_DECISION')
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(artifact->'targets') t WHERE t->>'planId'=ANY($2::text[])) ORDER BY id FOR UPDATE`, [ownerId, [...planIds]]);
    for (const row of existing) {
        const attempt = contracts_1.PlannerAttemptV2Schema.parse(row.artifact);
        const stopped = stopAccounting(attempt, row.payload ?? {});
        await persistAttempt(sql, attempt, { ...attempt, state: "SUPERSEDED", lease: null, question: null, budget: stopped.budget }, stopped.payload);
    }
}
function newBudget(profile, rootRequestId = (0, node_crypto_1.randomUUID)()) {
    return contracts_1.RuntimeBudgetV2Schema.parse({ rootRequestId, profile, foregroundProcessingMs: 0, processingStartedAt: null, executionDeadlineAt: null,
        consumed: { modelCalls: 0, inputTokens: 0, outputTokens: 0, planningCalls: 0, researchSynthesisCalls: 0, researchQueries: 0, fetchAttempts: 0, selectedSourceCharacters: 0, extractedPages: 0, ocrPages: 0, followUps: 0 },
        reserved: { modelCalls: 0, inputTokens: 0, outputTokens: 0 } });
}
class AttemptService {
    db;
    constructor(db) {
        this.db = db;
    }
    async enqueue(ownerId, request) {
        return this.db.coordinated(ownerId, sql => this.enqueueAccepted(sql, ownerId, request));
    }
    /** Compose admission and enqueue under the same existing owner transaction. */
    async enqueueAccepted(sql, ownerId, request) {
        const requestHash = (0, database_1.hash)("accepted-request", request);
        const existing = (await (0, database_1.rows)(sql, 'SELECT artifact FROM "PlannerAttempt" WHERE "userId"=$1 AND "requestKey"=$2', [ownerId, request.key]))[0];
        if (existing) {
            const attempt = contracts_1.PlannerAttemptV2Schema.parse(existing.artifact);
            if (attempt.requestHash !== requestHash)
                (0, database_1.reject)("IDEMPOTENCY_MISMATCH", "This request identity belongs to different input.");
            return attempt;
        }
        if ((await (0, database_1.rows)(sql, 'SELECT id FROM "PlannerAttempt" WHERE artifact->\'budget\'->>\'rootRequestId\'=$1', [request.budget.rootRequestId])).length)
            (0, database_1.reject)("IDEMPOTENCY_MISMATCH", "A request budget cannot be transferred into two attempts.");
        if (request.parentAttemptId) {
            const parent = await loadAttempt(sql, ownerId, request.parentAttemptId);
            if (!["FAILED", "CANCELLED", "SUPERSEDED", "NEEDS_DECISION"].includes(parent.attempt.state))
                (0, database_1.reject)("INTENT_CONFLICT", "Only a stopped operation can be explicitly retried.");
        }
        const attempt = contracts_1.PlannerAttemptV2Schema.parse({ schemaVersion: 2, attemptId: (0, node_crypto_1.randomUUID)(), ownerId, kind: request.kind, state: "QUEUED", stage: "QUEUED",
            idempotencyKey: request.key, requestHash, requestedAt: (await (0, database_1.clock)(sql)).toISOString(), parentAttemptId: request.parentAttemptId ?? null,
            acceptedRequest: { text: request.text, authorization: request.kind === "RESEARCH_ADVICE" ? "RESEARCH_ONLY" : "PLAN_ACTION", researchRequested: request.budget.profile === "RESEARCH", targetAuthorizationDigest: (0, database_1.hash)("authorized-targets", request.targets) },
            targets: request.targets.map(target => ({ planId: target.planId, requestedIntentVersionId: target.intentId, resolvedIntentVersionId: null, resolution: null,
                baseActiveRevisionId: target.baseRevisionId, sourceCandidateRevisionId: target.sourceCandidateId ?? null, planningVersion: target.planningVersion, resolvedPlanningVersion: null, contextDigest: null })),
            budget: request.budget, fence: 0, lease: null, checkpoint: null, question: null, error: null, result: null, applyReceipt: null });
        await assertAttemptCurrent(sql, attempt);
        for (const target of attempt.targets) {
            const plan = await (0, intents_1.ownedPlan)(sql, ownerId, target.planId);
            if (target.sourceCandidateRevisionId && target.sourceCandidateRevisionId !== plan.latestDraftRevisionId)
                (0, database_1.reject)("STALE_CONTEXT", "The candidate being regenerated is no longer current.");
            if (target.sourceCandidateRevisionId && !(await (0, database_1.rows)(sql, 'SELECT id FROM "PlannerRevision" WHERE id=$1 AND "planId"=$2 AND "schemaVersion"=2 AND "resolvedIntentVersionId"=$3', [target.sourceCandidateRevisionId, target.planId, target.requestedIntentVersionId])).length)
                (0, database_1.reject)("REFERENCE_NOT_OWNED", "The candidate does not belong to this accepted intent.");
        }
        // An initial root may transfer foreground accounting, but never another root's worker deadline.
        if (attempt.budget.processingStartedAt !== null)
            (0, database_1.reject)("INVALID_OUTPUT", "Enqueue requires unbound worker processing time.");
        const foreground = await (0, accounting_1.transferForegroundAccounting)(sql, ownerId, attempt.attemptId, attempt.budget);
        await supersedePlanAttempts(sql, ownerId, attempt.targets.map(target => target.planId));
        for (const target of attempt.targets)
            await sql.query('UPDATE "PlannerPlan" SET "latestDraftRevisionId"=NULL,"updatedAt"=clock_timestamp() WHERE id=$1', [target.planId]);
        await sql.query('INSERT INTO "PlannerAttempt" (id,"userId",kind,state,"requestKey","requestHash",artifact,payload,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp())', [attempt.attemptId, ownerId, attempt.kind, attempt.state, attempt.idempotencyKey, requestHash, attempt, foreground]);
        return attempt;
    }
    async read(ownerId, attemptId) {
        return this.db.coordinated(ownerId, async (sql) => (await loadAttempt(sql, ownerId, attemptId)).attempt);
    }
    async cancel(ownerId, attemptId) {
        return this.db.coordinated(ownerId, async (sql) => {
            const { attempt, payload } = await loadAttempt(sql, ownerId, attemptId);
            if (["SUCCEEDED", "FAILED", "CANCELLED", "SUPERSEDED"].includes(attempt.state))
                return attempt;
            const stopped = stopAccounting(attempt, payload);
            return persistAttempt(sql, attempt, { ...attempt, state: "CANCELLED", lease: null, question: null, budget: stopped.budget }, stopped.payload);
        });
    }
    async claim(workerId, allowedKinds = ["PLAN", "REPLAN", "EXPAND", "JOINT", "RESEARCH_ADVICE"]) {
        if (!/^[A-Za-z0-9_-]{1,100}$/.test(workerId))
            (0, database_1.reject)("INVALID_OUTPUT", "Invalid worker identity.");
        if (!allowedKinds.length)
            return null;
        // No queue-row locks while acquiring user admission. Prioritize users with the oldest work.
        const candidates = await (0, database_1.rows)(this.db.pool, 'SELECT id,"userId" FROM (SELECT DISTINCT ON ("userId",(kind=\'RESEARCH_ADVICE\')) id,"userId","createdAt" FROM "PlannerAttempt" WHERE state=\'QUEUED\' AND kind=ANY($1::text[]) ORDER BY "userId",(kind=\'RESEARCH_ADVICE\'),"createdAt",id) fair ORDER BY "createdAt",id LIMIT 100', [[...allowedKinds]]);
        for (const candidate of candidates) {
            const token = await this.db.coordinated(candidate.userId, async (sql) => {
                const { attempt } = await loadAttempt(sql, candidate.userId, candidate.id, false);
                for (const target of [...attempt.targets].sort((a, b) => a.planId.localeCompare(b.planId)))
                    await (0, intents_1.ownedPlan)(sql, attempt.ownerId, target.planId);
                const locked = await (0, database_1.rows)(sql, 'SELECT id FROM "PlannerAttempt" WHERE id=$1 AND state=\'QUEUED\' FOR UPDATE SKIP LOCKED', [candidate.id]);
                if (!locked.length)
                    return null;
                const readOnly = attempt.kind === "RESEARCH_ADVICE";
                if ((await (0, database_1.rows)(sql, 'SELECT id FROM "PlannerAttempt" WHERE "userId"=$1 AND state=\'RUNNING\' AND (kind=\'RESEARCH_ADVICE\')=$2', [attempt.ownerId, readOnly])).length)
                    return null;
                const now = await (0, database_1.clock)(sql);
                try {
                    await assertAttemptCurrent(sql, attempt);
                }
                catch (error) {
                    if (!(error instanceof database_1.DurablePlannerError) || error.detail.code !== "SUPERSEDED")
                        throw error;
                    await persistAttempt(sql, attempt, { ...attempt, state: "SUPERSEDED" });
                    return null;
                }
                if (now.getTime() - Date.parse(attempt.requestedAt) >= 600_000 || (attempt.budget.executionDeadlineAt && Date.parse(attempt.budget.executionDeadlineAt) <= now.getTime())) {
                    const failure = new database_1.DurablePlannerError(attempt.budget.executionDeadlineAt ? "BUDGET_EXHAUSTED" : "WORKER_UNAVAILABLE", "The queued operation expired; retry explicitly.", attempt.stage);
                    await persistAttempt(sql, attempt, { ...attempt, state: "FAILED", error: failure.detail });
                    return null;
                }
                const budget = { ...attempt.budget };
                if (!budget.processingStartedAt) {
                    budget.processingStartedAt = now.toISOString();
                    budget.executionDeadlineAt = new Date(now.getTime() + contracts_1.PLANNER_V2_BUDGETS[budget.profile].executionSeconds * 1000 - budget.foregroundProcessingMs).toISOString();
                }
                const fence = attempt.fence + 1;
                await persistAttempt(sql, attempt, { ...attempt, state: "RUNNING", stage: attempt.checkpoint?.stage ?? "PREFLIGHT", fence, budget,
                    lease: { owner: workerId, fence, expiresAt: new Date(now.getTime() + 45_000).toISOString() } });
                return { ownerId: attempt.ownerId, attemptId: attempt.attemptId, workerId, fence };
            });
            if (token)
                return token;
        }
        return null;
    }
    async mutate(token, work) {
        return this.db.coordinated(token.ownerId, async (sql) => {
            const { attempt, payload } = await loadAttempt(sql, token.ownerId, token.attemptId);
            const now = await assertLease(sql, attempt, token);
            return work(sql, attempt, payload, now);
        });
    }
    async renew(token) {
        await this.mutate(token, async (sql, attempt, _payload, now) => {
            await persistAttempt(sql, attempt, { ...attempt, lease: { owner: token.workerId, fence: token.fence, expiresAt: new Date(now.getTime() + 45_000).toISOString() } });
        });
    }
    async release(token) {
        await this.mutate(token, async (sql, attempt, payload) => {
            const stopped = stopAccounting(attempt, payload);
            await persistAttempt(sql, attempt, { ...attempt, state: "QUEUED", lease: null, budget: stopped.budget }, stopped.payload);
        });
    }
    async checkpoint(token, stage, value) {
        await this.mutate(token, async (sql, attempt, payload, now) => {
            await persistAttempt(sql, attempt, { ...attempt, stage, checkpoint: { stage, digest: (0, database_1.hash)("checkpoint", value), persistedAt: now.toISOString() } }, { ...payload, checkpoint: value });
        });
    }
    async fail(token, error) {
        await this.db.coordinated(token.ownerId, async (sql) => {
            const { attempt, payload } = await loadAttempt(sql, token.ownerId, token.attemptId);
            await assertLease(sql, attempt, token, true);
            const stopped = stopAccounting(attempt, payload);
            await persistAttempt(sql, attempt, { ...attempt, state: "FAILED", stage: error.detail.stage, lease: null, error: error.detail, budget: stopped.budget }, stopped.payload);
        });
    }
    async needsDecision(token, question) {
        await this.mutate(token, async (sql, attempt, payload) => {
            const stopped = stopAccounting(attempt, payload);
            await persistAttempt(sql, attempt, { ...attempt, state: "NEEDS_DECISION", question, lease: null, budget: stopped.budget }, stopped.payload);
        });
    }
    async escalate(token, profile, reason) {
        if (!reason.trim() || reason.length > 1000)
            (0, database_1.reject)("INVALID_OUTPUT", "Profile escalation requires a consequential reason.");
        await this.mutate(token, async (sql, attempt, payload) => {
            const profiles = ["ADVICE", "CALENDAR_ONLY", "EDUCATIONAL", "RESEARCH"];
            if (profiles.indexOf(profile) < profiles.indexOf(attempt.budget.profile))
                (0, database_1.reject)("INVALID_OUTPUT", "The root profile cannot downgrade.");
            if (profile === attempt.budget.profile)
                return;
            const budget = { ...attempt.budget, profile,
                executionDeadlineAt: new Date(Date.parse(attempt.budget.processingStartedAt) + contracts_1.PLANNER_V2_BUDGETS[profile].executionSeconds * 1000 - attempt.budget.foregroundProcessingMs).toISOString() };
            await persistAttempt(sql, attempt, { ...attempt, budget }, { ...payload, profileEscalations: [...payload.profileEscalations ?? [], { profile, reason }] });
        });
    }
    async sweep() {
        const candidates = await (0, database_1.rows)(this.db.pool, 'SELECT id,"userId" FROM "PlannerAttempt" WHERE (state=\'RUNNING\' AND ("leaseExpiresAt" AT TIME ZONE \'UTC\')<=clock_timestamp()) OR (state=\'QUEUED\' AND ("createdAt" AT TIME ZONE \'UTC\')<clock_timestamp()-interval \'10 minutes\') ORDER BY id LIMIT 100');
        let recovered = 0;
        for (const candidate of candidates)
            await this.db.coordinated(candidate.userId, async (sql) => {
                const { attempt, payload } = await loadAttempt(sql, candidate.userId, candidate.id);
                const now = await (0, database_1.clock)(sql);
                if (attempt.state === "RUNNING" && Date.parse(attempt.lease.expiresAt) > now.getTime() || !["RUNNING", "QUEUED"].includes(attempt.state))
                    return;
                let state = "QUEUED";
                let error = null;
                try {
                    await assertAttemptCurrent(sql, attempt);
                }
                catch (e) {
                    if (!(e instanceof database_1.DurablePlannerError))
                        throw e;
                    state = "SUPERSEDED";
                }
                if (state !== "SUPERSEDED" && ((attempt.budget.executionDeadlineAt && Date.parse(attempt.budget.executionDeadlineAt) <= now.getTime()) ||
                    (!attempt.budget.processingStartedAt && now.getTime() - Date.parse(attempt.requestedAt) >= 600_000))) {
                    state = "FAILED";
                    error = new database_1.DurablePlannerError(attempt.budget.processingStartedAt ? "BUDGET_EXHAUSTED" : "WORKER_UNAVAILABLE", "The operation expired; its checkpoint remains available.", attempt.stage).detail;
                }
                // Dispatch uncertainty remains accounted; an obsolete worker cannot settle this reservation.
                const stopped = stopAccounting(attempt, payload);
                await persistAttempt(sql, attempt, { ...attempt, state, lease: null, error, budget: stopped.budget }, stopped.payload);
                recovered++;
            });
        return recovered;
    }
    async reserveCall(token, input) {
        return this.mutate(token, async (sql, attempt, payload, now) => {
            const calls = payload.calls ?? [];
            const callId = (0, node_crypto_1.randomUUID)();
            const budget = structuredClone(attempt.budget);
            budget.reserved.modelCalls++;
            budget.reserved.inputTokens += input.inputTokens;
            budget.reserved.outputTokens += input.outputTokens;
            const checked = contracts_1.RuntimeBudgetV2Schema.safeParse(budget);
            const reservedCategory = calls.filter(call => call.state === "RESERVED" && payload.callCategories?.[call.callId] === input.category).length;
            if (!checked.success || input.category === "PLANNING" && (budget.consumed.planningCalls + reservedCategory >= 5 || attempt.kind === "RESEARCH_ADVICE") || input.category === "RESEARCH" && budget.consumed.researchSynthesisCalls + reservedCategory >= 2)
                (0, database_1.reject)("BUDGET_EXHAUSTED", "The root call/token allowance is exhausted.", attempt.stage);
            const call = contracts_1.ProviderCallReservationV2Schema.parse({ schemaVersion: 2, callId, rootRequestId: budget.rootRequestId, attemptId: attempt.attemptId, fence: attempt.fence, stage: attempt.stage,
                provider: input.provider, model: input.model, reservedInputTokens: input.inputTokens, reservedOutputTokens: input.outputTokens, state: "RESERVED", actualInputTokens: null, actualOutputTokens: null, costUsd: null, pricing: "UNKNOWN", settlementKey: callId });
            if (input.policy && (0, provider_policy_1.providerCategory)(input.policy.purpose) !== input.category)
                (0, database_1.reject)("INVALID_OUTPUT", "Provider purpose and budget category disagree.");
            const providerGuard = input.policy ? (0, provider_policy_1.reserveProviderCapacity)(budget, payload.providerGuard ?? {}, input.policy, now, ["EDUCATIONAL", "RESEARCH"].includes(budget.profile) && attempt.kind !== "RESEARCH_ADVICE", [...calls, call].filter(c => c.state === "RESERVED" && (c.callId === callId ? input.category : payload.callCategories?.[c.callId]) === "PLANNING").length) : payload.providerGuard;
            // Specialized counters are consumed on dispatch; category is retained in the immutable checkpoint metadata.
            const quotaReceipt = payload.quotaReceipt ?? await (0, accounting_1.reserveAttemptQuota)(sql, attempt.ownerId, attempt.kind === "RESEARCH_ADVICE" ? "chat" : attempt.kind === "EXPAND" ? "plannerExpansion" : ["REPLAN", "JOINT"].includes(attempt.kind) ? "plannerRebalance" : "planner", await (0, database_1.clock)(sql));
            await persistAttempt(sql, attempt, { ...attempt, budget }, { ...payload, quotaReceipt, calls: [...calls, call], callCategories: { ...payload.callCategories, [callId]: input.category },
                ...(providerGuard ? { providerGuard } : {}), ...(input.policy ? { providerCalls: { ...payload.providerCalls, [callId]: { purpose: input.policy.purpose, reservedAt: now.toISOString() } } } : {}) });
            return callId;
        });
    }
    async dispatchCall(token, callId, category) {
        await this.mutate(token, async (sql, attempt, payload, now) => {
            const calls = structuredClone(payload.calls ?? []);
            const call = calls.find(call => call.callId === callId);
            if (!call || call.fence !== token.fence)
                (0, database_1.reject)("LEASE_EXPIRED", "Call reservation belongs to another lease.", attempt.stage);
            if (payload.callCategories?.[callId] !== category)
                (0, database_1.reject)("IDEMPOTENCY_MISMATCH", "The call category cannot change after reservation.");
            if (call.state === "DISPATCHED")
                return;
            if (call.state !== "RESERVED")
                (0, database_1.reject)("INVALID_OUTPUT", "This call cannot be dispatched again.");
            call.state = "DISPATCHED";
            await (0, accounting_1.recordDispatch)(sql, attempt.ownerId, call);
            const quotaReceipt = payload.quotaReceipt ? await (0, accounting_1.finalizeAttemptQuota)(sql, payload.quotaReceipt, true, await (0, database_1.clock)(sql)) : undefined;
            const budget = structuredClone(attempt.budget);
            budget.reserved.modelCalls--;
            budget.consumed.modelCalls++;
            if (category === "PLANNING")
                budget.consumed.planningCalls++;
            if (category === "RESEARCH")
                budget.consumed.researchSynthesisCalls++;
            await persistAttempt(sql, attempt, { ...attempt, budget }, { ...payload, quotaReceipt, calls, ...(payload.providerCalls?.[callId] ? { providerCalls: { ...payload.providerCalls, [callId]: { ...payload.providerCalls[callId], dispatchedAt: now.toISOString() } } } : {}) });
        });
    }
    async settleCall(token, callId, usage) {
        await this.mutate(token, async (sql, attempt, payload) => {
            const calls = structuredClone(payload.calls ?? []);
            const call = calls.find(call => call.callId === callId);
            if (!call || call.fence !== token.fence)
                (0, database_1.reject)("LEASE_EXPIRED", "Call reservation belongs to another lease.");
            if (call.state === "SETTLED") {
                if (call.actualInputTokens !== usage.inputTokens || call.actualOutputTokens !== usage.outputTokens || call.costUsd !== usage.costUsd)
                    (0, database_1.reject)("IDEMPOTENCY_MISMATCH", "Call usage has already been settled differently.");
                return;
            }
            if (call.state !== "DISPATCHED")
                (0, database_1.reject)("INVALID_OUTPUT", "Only dispatched calls can settle usage.");
            await (0, accounting_1.recordActualUsage)(sql, attempt.ownerId, call, usage);
            Object.assign(call, { state: "SETTLED", actualInputTokens: usage.inputTokens, actualOutputTokens: usage.outputTokens, costUsd: usage.costUsd, pricing: usage.costUsd === null ? "UNKNOWN" : "KNOWN" });
            contracts_1.ProviderCallReservationV2Schema.parse(call);
            const budget = structuredClone(attempt.budget);
            budget.reserved.inputTokens -= call.reservedInputTokens;
            budget.reserved.outputTokens -= call.reservedOutputTokens;
            budget.consumed.inputTokens += usage.inputTokens;
            budget.consumed.outputTokens += usage.outputTokens;
            const limit = contracts_1.PLANNER_V2_BUDGETS[budget.profile];
            const overrun = budget.consumed.inputTokens > limit.inputTokens || budget.consumed.outputTokens > limit.outputTokens;
            if (overrun && (budget.reserved.inputTokens > 0 || budget.reserved.outputTokens > 0 || budget.reserved.modelCalls > 0)) {
                // The frozen budget cannot serialize actual overrun alongside remaining
                // uncertain reservations. Keep actual spend in its dispatched finance
                // receipt and terminate using the existing conservative stop semantics.
                const stopped = stopAccounting(attempt, payload);
                await persistAttempt(sql, attempt, { ...attempt, state: "FAILED", lease: null, budget: stopped.budget,
                    error: new database_1.DurablePlannerError("BUDGET_EXHAUSTED", "Provider usage exceeded the remaining allowance.", attempt.stage).detail }, stopped.payload);
                return;
            }
            await persistAttempt(sql, attempt, { ...attempt, budget, ...(overrun ? { state: "FAILED", lease: null,
                    error: new database_1.DurablePlannerError("BUDGET_EXHAUSTED", "Provider usage exceeded the remaining allowance.", attempt.stage).detail } : {}) }, { ...payload, calls });
        });
    }
    async recordLateUsage(ownerId, attemptId, callId, usage) {
        await this.db.coordinated(ownerId, async (sql) => {
            const { payload } = await loadAttempt(sql, ownerId, attemptId);
            const call = payload.calls?.find(candidate => candidate.callId === callId);
            if (!call || !["DISPATCHED", "UNKNOWN_SPEND", "SETTLED"].includes(call.state))
                (0, database_1.reject)("REFERENCE_NOT_OWNED", "No owned provider dispatch can be reconciled.");
            await (0, accounting_1.recordActualUsage)(sql, ownerId, call, usage);
        });
    }
    async closeProviderCall(token, callId, result) {
        await this.db.coordinated(token.ownerId, async (sql) => {
            const { attempt, payload } = await loadAttempt(sql, token.ownerId, token.attemptId);
            const now = await assertLease(sql, attempt, token, !result.accepted);
            if (!result.accepted && attempt.budget.executionDeadlineAt && Date.parse(attempt.budget.executionDeadlineAt) <= now.getTime()) {
                const stopped = stopAccounting(attempt, payload);
                await persistAttempt(sql, attempt, { ...attempt, state: "FAILED", lease: null, budget: stopped.budget,
                    error: new database_1.DurablePlannerError("BUDGET_EXHAUSTED", "The model processing deadline expired.", attempt.stage).detail }, stopped.payload);
                return;
            }
            const calls = structuredClone(payload.calls ?? []);
            const call = calls.find(c => c.callId === callId);
            const metadata = payload.providerCalls?.[callId];
            if (!call || !metadata || call.fence !== token.fence)
                (0, database_1.reject)("LEASE_EXPIRED", "Provider result belongs to another lease.");
            const budget = structuredClone(attempt.budget);
            if (call.state === "RESERVED") {
                budget.reserved.modelCalls--;
                budget.reserved.inputTokens -= call.reservedInputTokens;
                budget.reserved.outputTokens -= call.reservedOutputTokens;
                Object.assign(call, { state: "CANCELLED_BEFORE_DISPATCH", actualInputTokens: 0, actualOutputTokens: 0, costUsd: 0, pricing: "KNOWN" });
            }
            else if (call.state === "DISPATCHED")
                call.state = "UNKNOWN_SPEND";
            const providerGuard = { ...payload.providerGuard };
            if (result.accepted && result.finishReason === "STOP" && call.state === "SETTLED") {
                if (metadata.purpose === "REVIEW")
                    providerGuard.reviewCompleted = true;
                if (metadata.purpose === "VERIFICATION")
                    delete providerGuard.verificationReserve;
            }
            await persistAttempt(sql, attempt, { ...attempt, budget }, { ...payload, calls, providerGuard,
                providerCalls: { ...payload.providerCalls, [callId]: { ...metadata, completedAt: metadata.completedAt ?? now.toISOString(), ...(result.finishReason ? { finishReason: result.finishReason } : {}),
                        ...(result.errorCode ? { errorCode: result.errorCode.slice(0, 80) } : {}) } } });
        });
    }
    async providerWindow(token, purpose) {
        return this.mutate(token, async (_sql, attempt, payload, now) => ({ now: now.getTime(), deadline: Math.min(Date.parse(attempt.budget.executionDeadlineAt), ["RESEARCH", "OCR"].includes(purpose) && payload.providerGuard?.researchDeadlineAt ? Date.parse(payload.providerGuard.researchDeadlineAt) : Infinity) }));
    }
    /** Charge each search/fetch hop and extraction before work; failures and lease
     * takeover never refund or reset root research counters. */
    async consumeResearch(token, delta) {
        return this.mutate(token, async (sql, attempt, payload, now) => {
            if (attempt.budget.profile !== "RESEARCH" || !payload.providerGuard?.researchDeadlineAt || Date.parse(payload.providerGuard.researchDeadlineAt) <= now.getTime())
                (0, database_1.reject)("BUDGET_EXHAUSTED", "Research processing is not authorized or its window expired.", "RESEARCH");
            const allowed = ["researchQueries", "fetchAttempts", "selectedSourceCharacters", "extractedPages", "ocrPages", "followUps"];
            const budget = structuredClone(attempt.budget);
            for (const [key, amount] of Object.entries(delta)) {
                if (!allowed.includes(key) || !Number.isSafeInteger(amount) || amount < 0)
                    (0, database_1.reject)("INVALID_OUTPUT", "Invalid research charge.", "RESEARCH");
                const field = key;
                budget.consumed[field] += amount;
            }
            if (!contracts_1.RuntimeBudgetV2Schema.safeParse(budget).success)
                (0, database_1.reject)("BUDGET_EXHAUSTED", "The shared research processing allowance is exhausted.", "RESEARCH");
            await persistAttempt(sql, attempt, { ...attempt, budget }, payload);
            return budget;
        });
    }
    async startResearchWindow(token) {
        return this.mutate(token, async (sql, attempt, payload, now) => {
            if (attempt.budget.profile !== "RESEARCH")
                (0, database_1.reject)("BUDGET_EXHAUSTED", "Research requires an explicit research profile escalation.", "RESEARCH");
            const providerGuard = { ...payload.providerGuard, researchDeadlineAt: payload.providerGuard?.researchDeadlineAt ??
                    new Date(Math.min(Date.parse(attempt.budget.executionDeadlineAt), now.getTime() + 120000)).toISOString() };
            if (Date.parse(providerGuard.researchDeadlineAt) <= now.getTime())
                (0, database_1.reject)("BUDGET_EXHAUSTED", "The research processing window expired.", "RESEARCH");
            await persistAttempt(sql, attempt, attempt, { ...payload, providerGuard });
            return { now: now.getTime(), deadline: Date.parse(providerGuard.researchDeadlineAt) };
        });
    }
}
exports.AttemptService = AttemptService;
const attemptPayloadDigest = (payload) => (0, database_1.hash)("attempt-payload", JSON.parse((0, database_1.canonicalJson)(payload)));
exports.attemptPayloadDigest = attemptPayloadDigest;
