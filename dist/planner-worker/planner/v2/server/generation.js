"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenerationService = exports.GenerateRequestV2Schema = void 0;
const zod_1 = require("zod");
const contracts_1 = require("../contracts");
const attempts_1 = require("./attempts");
const intents_1 = require("./intents");
const documents_1 = require("./documents");
const database_1 = require("./database");
const target = zod_1.z.discriminatedUnion("kind", [
    zod_1.z.strictObject({ kind: zod_1.z.literal("NEW"), intent: contracts_1.CanonicalIntentV2Schema }),
    zod_1.z.strictObject({ kind: zod_1.z.literal("EXISTING"), planId: contracts_1.DurableIdV2Schema,
        expectedIntentVersionId: contracts_1.DurableIdV2Schema, expectedPlanningVersion: zod_1.z.number().int().nonnegative(),
        baseActiveRevisionId: contracts_1.DurableIdV2Schema.nullable(), intent: contracts_1.CanonicalIntentV2Schema.optional() }),
]);
/** Ready canonical input only. Budgets, permissions and execution are server-owned. */
exports.GenerateRequestV2Schema = (0, contracts_1.withPlannerEnvelope)(zod_1.z.strictObject({
    schemaVersion: zod_1.z.literal(2), requestKey: zod_1.z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
    text: contracts_1.ProseV2Schema, targets: zod_1.z.array(target).min(1).max(2),
    researchRequested: zod_1.z.boolean().default(false), documentIds: zod_1.z.array(contracts_1.DurableIdV2Schema).max(9).default([]), parentAttemptId: contracts_1.DurableIdV2Schema.optional(),
}).superRefine((request, ctx) => {
    if (new Set(request.documentIds).size !== request.documentIds.length || request.documentIds.length && !request.researchRequested)
        ctx.addIssue({ code: "custom", message: "Unique owned documents require an explicit research request" });
    const ids = request.targets.flatMap(t => t.kind === "EXISTING" ? [t.planId] : []);
    if (new Set(ids).size !== ids.length)
        ctx.addIssue({ code: "custom", message: "Duplicate generation target" });
    if (request.parentAttemptId && request.targets.some(t => t.kind === "NEW"))
        ctx.addIssue({ code: "custom", message: "Retry requires the original owned target" });
}));
/** Admission only: no provider, claim, process-local job or execution write. */
class GenerationService {
    db;
    attempts;
    intents;
    constructor(db) {
        this.db = db;
        this.attempts = new attempts_1.AttemptService(db);
        this.intents = new intents_1.IntentService(db);
    }
    async accept(ownerId, raw, signal) {
        const request = exports.GenerateRequestV2Schema.parse(raw), requestDigest = (0, database_1.hash)("generation-admission", request);
        signal?.throwIfAborted();
        return this.db.coordinated(ownerId, async (sql) => {
            signal?.throwIfAborted();
            const existing = (await (0, database_1.rows)(sql, 'SELECT id FROM "PlannerAttempt" WHERE "userId"=$1 AND "requestKey"=$2', [ownerId, request.requestKey]))[0];
            if (existing) {
                const stored = await (0, attempts_1.loadAttempt)(sql, ownerId, existing.id);
                if (stored.payload.generationRequestDigest !== requestDigest)
                    (0, database_1.reject)("IDEMPOTENCY_MISMATCH", "This generation key belongs to different accepted input.", "INTAKE");
                return { attempt: stored.attempt, replayed: true };
            }
            // All membership/base/CAS checks precede edits; a later failure rolls back
            // the complete save, supersession and enqueue across both selected Plans.
            for (const t of request.targets.filter(t => t.kind === "EXISTING").sort((a, b) => a.planId.localeCompare(b.planId))) {
                const plan = await (0, intents_1.ownedPlan)(sql, ownerId, t.planId);
                if (plan.contractVersion !== 2 || ["ARCHIVED", "COMPLETED"].includes(plan.state) || plan.workingIntentVersionId !== t.expectedIntentVersionId || plan.version !== t.expectedPlanningVersion || plan.activeRevisionId !== t.baseActiveRevisionId)
                    (0, database_1.reject)("INTENT_CONFLICT", "Reload the current owned intent, version and active baseline before generation.", "INTAKE");
            }
            for (const id of request.documentIds)
                await (0, documents_1.ownedDocumentMetadata)(sql, ownerId, id);
            const targets = [];
            for (const [i, t] of request.targets.entries()) {
                let planId;
                if (t.kind === "NEW") {
                    const key = (0, database_1.hash)("generation-plan", { ownerId, key: request.requestKey, index: i });
                    planId = (await this.intents.createAccepted(sql, ownerId, key, t.intent)).plan.id;
                }
                else {
                    planId = t.planId;
                    if (t.intent)
                        await this.intents.editAccepted(sql, ownerId, planId, t.expectedPlanningVersion, t.expectedIntentVersionId, t.intent);
                }
                const plan = await (0, intents_1.ownedPlan)(sql, ownerId, planId);
                targets.push({ planId, intentId: plan.workingIntentVersionId, planningVersion: plan.version, baseRevisionId: plan.activeRevisionId });
            }
            const h = (0, database_1.hash)("generation-root", { ownerId, key: request.requestKey }), rootId = `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
            const attempt = await this.attempts.enqueueAccepted(sql, ownerId, { key: request.requestKey, text: request.text,
                kind: targets.length === 2 ? "JOINT" : targets[0].baseRevisionId ? "REPLAN" : "PLAN", targets,
                budget: (0, attempts_1.newBudget)(request.researchRequested ? "RESEARCH" : "EDUCATIONAL", rootId), ...(request.parentAttemptId ? { parentAttemptId: request.parentAttemptId } : {}) });
            const stored = await (0, attempts_1.loadAttempt)(sql, ownerId, attempt.attemptId);
            const readTargets = [];
            if (request.researchRequested)
                for (const t of targets) {
                    const intent = await (0, intents_1.loadIntent)(sql, ownerId, t.intentId);
                    readTargets.push({ planId: t.planId, intentId: t.intentId, intentDigest: (0, database_1.hash)("research-intent", intent.intent) });
                }
            await (0, attempts_1.persistAttempt)(sql, attempt, attempt, { ...stored.payload, generationRequestDigest: requestDigest,
                ...(request.researchRequested ? { researchRequest: { readTargets, documentIds: request.documentIds } } : {}) });
            signal?.throwIfAborted();
            return { attempt, replayed: false };
        });
    }
}
exports.GenerationService = GenerationService;
