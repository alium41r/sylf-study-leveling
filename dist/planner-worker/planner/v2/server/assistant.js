"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssistantService = exports.AssistantTurnRequestSchema = void 0;
const node_crypto_1 = require("node:crypto");
const zod_1 = require("zod");
const contracts_1 = require("../contracts");
const assistant_1 = require("../intelligence/assistant");
const conversation_1 = require("../intelligence/schemas/conversation");
const provider_1 = require("../intelligence/provider");
const context_1 = require("../intelligence/context");
const context_2 = require("./context");
const accounting_1 = require("./accounting");
const attempts_1 = require("./attempts");
const research_1 = require("./research");
const intents_1 = require("./intents");
const database_1 = require("./database");
exports.AssistantTurnRequestSchema = zod_1.z.strictObject({ key: zod_1.z.string().regex(/^[A-Za-z0-9_-]{8,100}$/), text: contracts_1.ProseV2Schema,
    expectedConversationVersion: zod_1.z.number().int().nonnegative(), readPlanIds: zod_1.z.array(contracts_1.DurableIdV2Schema).min(1).max(2),
    mode: zod_1.z.enum(["ADVICE", "PLAN_ACTION"]).default("ADVICE"), researchRequested: zod_1.z.boolean().default(false) });
const reviewReserve = { inputTokens: 8192, outputTokens: 4096 };
function boundConversation(conversation) {
    while (conversation.events.length > 24 || (0, contracts_1.plannerSerializedBytes)(conversation) > 128 * 1024) {
        if (conversation.events.length <= 1)
            (0, database_1.reject)("PAYLOAD_TOO_LARGE", "The conversation event exceeds its storage allowance.", "INTAKE");
        const removed = conversation.events.shift();
        conversation.omittedEvents++;
        conversation.recommendations = conversation.recommendations.filter(r => r.eventKey !== removed.key);
    }
    conversation.recommendations = conversation.recommendations.slice(-8);
    return conversation_1.ConversationSchema.parse(conversation);
}
class AssistantService {
    db;
    dependencies;
    attempts;
    constructor(db, dependencies = {}) {
        this.db = db;
        this.dependencies = dependencies;
        this.attempts = new attempts_1.AttemptService(db);
    }
    async snapshot(sql, ownerId, destination, ids) {
        if (!ids.length || ids.length > 2 || new Set(ids).size !== ids.length)
            (0, database_1.reject)("INVALID_OUTPUT", "Read one or two explicitly selected owned Plans.", "INTAKE");
        const plans = [];
        for (const id of [...new Set([...ids, destination])].sort())
            plans.push(await (0, intents_1.ownedPlan)(sql, ownerId, id));
        const plan = plans.find(p => p.id === destination);
        if (plans.some(p => p.contractVersion !== 2 || !p.workingIntentVersionId || p.state === "ARCHIVED"))
            (0, database_1.reject)("INTENT_CONFLICT", "Choose current owned V2 Plans.", "INTAKE");
        const today = (await (0, database_1.rows)(sql, 'SELECT to_char(clock_timestamp() AT TIME ZONE timezone,\'YYYY-MM-DD\') AS today FROM "User" WHERE id=$1', [ownerId]))[0].today;
        const requested = ids.map((id, i) => ({ planId: id, planRef: `plan_${i + 1}`, intentId: plans.find(p => p.id === id).workingIntentVersionId }));
        const context = await (0, context_1.loadPlannerInterviewContext)(sql, ownerId, requested, { start: today, end: new Date(Date.parse(today) + 13 * 86400000).toISOString().slice(0, 10) }, { maxBytes: 10 * 1024, historyExamples: 0 });
        const targets = requested.map(r => {
            const current = plans.find(p => p.id === r.planId);
            return { planId: current.id, intentId: r.intentId, planningVersion: current.version, baseRevisionId: current.activeRevisionId,
                contextDigest: (0, context_2.contextInputDigest)(context.contexts.find(c => c.planRef === r.planRef).context.dependencies) };
        });
        return { plan, context, targets, requested, conversation: conversation_1.ConversationSchema.parse(plan.conversation ?? (0, conversation_1.emptyConversation)()) };
    }
    async read(ownerId, planId) {
        return this.db.coordinated(ownerId, async (sql) => { const plan = await (0, intents_1.ownedPlan)(sql, ownerId, planId); return { conversationVersion: plan.conversationVersion, conversation: conversation_1.ConversationSchema.parse(plan.conversation ?? (0, conversation_1.emptyConversation)()) }; });
    }
    async respond(ownerId, planId, raw, signal) {
        const request = exports.AssistantTurnRequestSchema.parse(raw);
        const requestDigest = (0, database_1.hash)("assistant-turn", { text: request.text, readPlanIds: request.readPlanIds, mode: request.mode, researchRequested: request.researchRequested });
        const h = (0, database_1.hash)("assistant-root", { ownerId, planId, key: request.key });
        const rootId = `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
        const snapshot = await this.db.coordinated(ownerId, async (sql) => {
            const snap = await this.snapshot(sql, ownerId, planId, request.readPlanIds);
            const old = snap.conversation.events.find(e => e.key === request.key);
            if (old && old.requestDigest !== requestDigest)
                (0, database_1.reject)("IDEMPOTENCY_MISMATCH", "This conversation key belongs to different input.", "INTAKE");
            if (!old && snap.plan.conversationVersion !== request.expectedConversationVersion)
                (0, database_1.reject)("INTENT_CONFLICT", "The conversation changed; reload before appending.", "INTAKE");
            if (!old && (await (0, database_1.rows)(sql, 'SELECT id FROM "AiUsageLog" WHERE "userId"=$1 AND "rootRequestId"=$2 LIMIT 1', [ownerId, rootId])).length)
                (0, database_1.reject)("INTENT_CONFLICT", "This assistant turn already dispatched without a saved reply. Start an explicit new turn to retry.", "INTAKE");
            return { ...snap, old };
        });
        if (snapshot.old)
            return { event: snapshot.old, conversationVersion: snapshot.plan.conversationVersion, recommendationId: snapshot.conversation.recommendations.find(r => r.eventKey === snapshot.old.key)?.id ?? null, replayed: true };
        const foreground = (0, provider_1.foregroundProviderMeter)(new accounting_1.ForegroundAccountingService(this.db), ownerId, (0, attempts_1.newBudget)(request.researchRequested ? "RESEARCH" : request.mode === "PLAN_ACTION" ? "EDUCATIONAL" : "ADVICE", rootId), request.mode === "ADVICE" ? "chat" : snapshot.targets.length === 2 || snapshot.targets.some(t => t.baseRevisionId) ? "plannerRebalance" : "planner", 30000);
        const meter = { ...foreground.meter, reserve: async (...args) => {
                const budget = foreground.budget();
                if (budget.consumed.modelCalls + budget.reserved.modelCalls >= 2)
                    (0, database_1.reject)("BUDGET_EXHAUSTED", "The assistant shares a maximum of two external calls, including fallback.", "INTAKE");
                return foreground.meter.reserve(...args);
            } };
        const plans = await this.db.coordinated(ownerId, async (sql) => Promise.all(snapshot.requested.map(async (r) => ({ planRef: r.planRef, intent: (await (0, intents_1.loadIntent)(sql, ownerId, r.intentId)).intent }))));
        const recent = snapshot.conversation.events.slice(-2).map(e => ({ text: e.text, response: e.response }));
        const result = await (0, assistant_1.reasonAssistant)({ meter, text: request.text, plans, signal, availabilityKnown: snapshot.context.contexts.some(context => !!context.context.globalAvailability),
            context: { model: snapshot.context.view, mode: request.mode, researchAuthorized: request.researchRequested, conversation: recent, omittedConversation: snapshot.conversation.omittedEvents + snapshot.conversation.events.length - recent.length },
            policy: { purpose: "INTERPRETATION", ...(["EDUCATIONAL", "RESEARCH"].includes(foreground.budget().profile) ? { reviewReserve } : {}) },
            lookup: requests => this.db.coordinated(ownerId, async (sql) => Promise.all(requests.map(async (r) => {
                const target = snapshot.requested.find(p => p.planRef === r.planRef);
                const plan = await (0, intents_1.ownedPlan)(sql, ownerId, target.planId);
                if (r.kind === "SUBJECT_DETAILS") {
                    const nodes = plan.subjectId ? await (0, database_1.rows)(sql, 'SELECT title,description,difficulty FROM "SubjectNode" WHERE "subjectId"=$1 ORDER BY id LIMIT 30', [plan.subjectId]) : [];
                    const count = plan.subjectId ? (await (0, database_1.rows)(sql, 'SELECT count(*) FROM "SubjectNode" WHERE "subjectId"=$1', [plan.subjectId]))[0].count : "0";
                    return { planRef: r.planRef, nodes, omittedNodes: Number(count) - nodes.length, authority: "SAVED_UNVERIFIED_HINT" };
                }
                const revisions = await (0, database_1.rows)(sql, 'SELECT sequence,"inputSnapshot", "outputSnapshot", "v2Artifact" FROM "PlannerRevision" WHERE "planId"=$1 ORDER BY sequence DESC LIMIT 2', [plan.id]);
                const decisions = revisions.map(row => ({ sequence: row.sequence, artifactDigest: (0, database_1.hash)("prior-decision", row), strategy: Reflect.get(row.v2Artifact?.blueprint ?? {}, "strategy") ?? null }));
                return { planRef: r.planRef, decisions, selection: "TWO_RECENT_IMMUTABLE_REVISIONS" };
            }))) }, this.dependencies);
        return this.db.coordinated(ownerId, async (sql) => {
            const current = await this.snapshot(sql, ownerId, planId, request.readPlanIds);
            const old = current.conversation.events.find(e => e.key === request.key);
            if (old) {
                if (old.requestDigest !== requestDigest)
                    (0, database_1.reject)("IDEMPOTENCY_MISMATCH", "This conversation key changed.");
                return { event: old, conversationVersion: current.plan.conversationVersion, recommendationId: current.conversation.recommendations.find(r => r.eventKey === old.key)?.id ?? null, replayed: true };
            }
            if (current.plan.conversationVersion !== request.expectedConversationVersion)
                (0, database_1.reject)("INTENT_CONFLICT", "A concurrent conversation append won; reload.", "INTAKE");
            if ((0, database_1.hash)("assistant-targets", current.targets) !== (0, database_1.hash)("assistant-targets", snapshot.targets))
                (0, database_1.reject)("STALE_CONTEXT", "Consequential context changed while the assistant answered.", "INTAKE");
            const response = result.response.kind === "PROPOSAL" && request.mode === "ADVICE" ? { kind: "SUGGESTED_CHANGE", message: result.response.message, planRefs: result.response.planRefs, change: result.response.change } : result.response.kind === "PROPOSAL" ? { ...result.response, researchRequested: request.researchRequested } : result.response;
            const event = { key: request.key, requestDigest, at: (await (0, database_1.clock)(sql)).toISOString(), text: request.text, response, budget: foreground.budget(), mode: request.mode, targetBindings: current.targets, questions: result.questions, ...(result.intentPatch ? { intentPatch: result.intentPatch } : {}) };
            const conversation = structuredClone(current.conversation);
            conversation.events.push(event);
            let recommendationId = null;
            if ("planRefs" in response && response.planRefs.length) {
                recommendationId = (0, node_crypto_1.randomUUID)();
                conversation.recommendations.push({ id: recommendationId, eventKey: event.key, change: response.change,
                    targets: current.targets.filter((_, i) => response.planRefs.includes(`plan_${i + 1}`)), researchRequested: request.researchRequested });
            }
            await sql.query('UPDATE "PlannerPlan" SET conversation=$2,"conversationVersion"="conversationVersion"+1 WHERE id=$1', [planId, boundConversation(conversation)]);
            return { event, conversationVersion: current.plan.conversationVersion + 1, recommendationId, replayed: false };
        });
    }
    /** This separate server operation is invoked only by an explicit user action,
     * never from a model response, diagnostic, note or trigger. */
    async prepare(ownerId, planId, input) {
        if (!/^[A-Za-z0-9_-]{8,100}$/.test(input.key))
            (0, database_1.reject)("INVALID_OUTPUT", "Invalid preparation identity.", "INTAKE");
        return this.db.coordinated(ownerId, async (sql) => {
            const admissionHash = (0, database_1.hash)("assistant-admission", { planId, ...input });
            const prior = (await (0, database_1.rows)(sql, 'SELECT artifact,payload FROM "PlannerAttempt" WHERE "userId"=$1 AND "requestKey"=$2', [ownerId, input.key]))[0];
            if (prior) {
                if (prior.payload?.assistantAdmissionDigest !== admissionHash)
                    (0, database_1.reject)("IDEMPOTENCY_MISMATCH", "The preparation key belongs to another user action.");
                return contracts_1.PlannerAttemptV2Schema.parse(prior.artifact);
            }
            const current = await this.snapshot(sql, ownerId, planId, input.selectedPlanIds);
            const recommendation = current.conversation.recommendations.find(r => r.id === input.recommendationId);
            if (!recommendation)
                (0, database_1.reject)("INTENT_CONFLICT", "The recommendation is ambiguous or expired; request a new one.", "INTAKE");
            if ((0, database_1.hash)("assistant-targets", recommendation.targets) !== (0, database_1.hash)("assistant-targets", current.targets))
                (0, database_1.reject)("STALE_CONTEXT", "The recommendation's targets or consequential facts changed; review a new recommendation.", "INTAKE");
            const event = current.conversation.events.find(e => e.key === recommendation.eventKey);
            const profile = input.researchRequested ? "RESEARCH" : "EDUCATIONAL";
            if (event.mode === "PLAN_ACTION" && event.budget.profile !== profile)
                (0, database_1.reject)("INTENT_CONFLICT", "Changed research authorization requires a fresh request.", "INTAKE");
            const budget = event.mode === "PLAN_ACTION" ? await (0, accounting_1.restoreForegroundBudget)(sql, ownerId, event.budget) : (0, attempts_1.newBudget)(profile);
            const attempt = await this.attempts.enqueueAccepted(sql, ownerId, { key: input.key, text: recommendation.change, kind: current.targets.length === 2 ? "JOINT" : current.targets[0].baseRevisionId ? "REPLAN" : "PLAN",
                targets: current.targets.map(t => ({ planId: t.planId, intentId: t.intentId, planningVersion: t.planningVersion, baseRevisionId: t.baseRevisionId })), budget });
            await sql.query('UPDATE "PlannerAttempt" SET payload=payload || $2::jsonb WHERE id=$1', [attempt.attemptId, { assistantAdmissionDigest: admissionHash }]);
            return attempt;
        });
    }
    async prepareResearchAdvice(ownerId, planId, input) {
        return this.db.coordinated(ownerId, async (sql) => {
            const plan = await (0, intents_1.ownedPlan)(sql, ownerId, planId);
            const conversation = conversation_1.ConversationSchema.parse(plan.conversation ?? (0, conversation_1.emptyConversation)());
            const event = conversation.events.find(e => e.key === input.eventKey);
            if (!event || event.budget.profile !== "RESEARCH" || event.targetBindings.length !== 1 || event.targetBindings[0].planId !== planId)
                (0, database_1.reject)("INTENT_CONFLICT", "Choose a current research-authorized conversation turn.", "INTAKE");
            const service = new research_1.ResearchService(this.attempts);
            const prior = (await (0, database_1.rows)(sql, 'SELECT id FROM "PlannerAttempt" WHERE "userId"=$1 AND "requestKey"=$2', [ownerId, input.key]))[0];
            if (!prior) {
                const snapshot = await this.snapshot(sql, ownerId, planId, [planId]);
                if ((0, database_1.hash)("assistant-targets", snapshot.targets) !== (0, database_1.hash)("assistant-targets", event.targetBindings))
                    (0, database_1.reject)("STALE_CONTEXT", "The research conversation refers to older consequential facts.", "INTAKE");
            }
            return service.enqueueAdviceAccepted(sql, ownerId, { key: input.key, text: input.text, readPlanIds: [planId], documentIds: input.documentIds, budget: prior ? event.budget : await (0, accounting_1.restoreForegroundBudget)(sql, ownerId, event.budget), parentAttemptId: input.parentAttemptId });
        });
    }
    async acceptIntake(ownerId, planId, input) {
        const preview = await this.db.coordinated(ownerId, async (sql) => {
            const plan = await (0, intents_1.ownedPlan)(sql, ownerId, planId);
            const event = conversation_1.ConversationSchema.parse(plan.conversation ?? (0, conversation_1.emptyConversation)()).events.find(e => e.key === input.eventKey);
            if (!event?.intentPatch)
                (0, database_1.reject)("INTENT_CONFLICT", "No current intake interpretation was selected.", "INTAKE");
            const accepted = await (0, intents_1.loadIntent)(sql, ownerId, input.expectedIntentId);
            if (accepted.planId !== planId || plan.workingIntentVersionId !== input.expectedIntentId || plan.version !== input.expectedPlanningVersion)
                (0, database_1.reject)("INTENT_CONFLICT", "The accepted goal changed.", "INTAKE");
            const binding = event.targetBindings.find(t => t.planId === planId);
            if (event.targetBindings.length !== 1 || !binding || binding.intentId !== input.expectedIntentId || binding.planningVersion !== input.expectedPlanningVersion || binding.baseRevisionId !== plan.activeRevisionId)
                (0, database_1.reject)("STALE_CONTEXT", "The interpretation belongs to an older or ambiguous goal.", "INTAKE");
            const next = structuredClone(accepted.intent);
            const freshRef = (prefix, used) => { let n = 1; while (used.includes(`${prefix}_${n}`))
                n++; return `${prefix}_${n}`; };
            if (!input.fields.length || new Set(input.fields).size !== input.fields.length || input.fields.some(field => !(field in event.intentPatch)))
                (0, database_1.reject)("INVALID_OUTPUT", "Select exact interpreted fields to accept.", "INTAKE");
            for (const field of input.fields) {
                const value = Reflect.get(event.intentPatch, field);
                if (field === "scopeSuggestions") {
                    for (const title of value)
                        if (!next.scope.some(s => s.title === title))
                            next.scope.push({ scopeKey: (0, node_crypto_1.randomUUID)(), modelRef: freshRef("scope", next.scope.map(s => s.modelRef)), title, parentKey: null, inclusion: "REQUESTED", sourceClaimIds: [] });
                }
                else if (field === "studentNotes") {
                    const notes = value;
                    for (const note of notes)
                        next.evidence.push({ evidenceId: freshRef("note", next.evidence.map(e => e.evidenceId)), scopeKeys: note.scopeRefs.map(ref => { const scope = next.scope.find(s => s.modelRef === ref); if (!scope)
                                (0, database_1.reject)("REFERENCE_NOT_OWNED", "The selected note references unavailable scope."); return scope.scopeKey; }), source: "STUDENT_NOTE", observedAt: (await (0, database_1.clock)(sql)).toISOString(), reliability: "SELF_REPORTED", statement: note.statement, demonstratesReadiness: false });
                }
                else if (field === "assessment") {
                    next.assessment = { ...next.assessment, ...value };
                }
                else {
                    Reflect.set(next, field, value);
                    if (field === "policy")
                        next.policySelection = "USER_OVERRIDE";
                }
            }
            return contracts_1.CanonicalIntentV2Schema.parse(next);
        });
        return new intents_1.IntentService(this.db).edit(ownerId, planId, input.expectedPlanningVersion, input.expectedIntentId, preview);
    }
}
exports.AssistantService = AssistantService;
