"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlannerCompilerService = void 0;
exports.createCompilerHandlers = createCompilerHandlers;
const json_extractor_1 = require("../../../ai/json-extractor");
const contracts_1 = require("../contracts");
const allocator_1 = require("../intelligence/allocator");
const blueprint_1 = require("../intelligence/blueprint");
const capacity_1 = require("../intelligence/capacity");
const forecast_1 = require("../intelligence/forecast");
const provider_1 = require("../intelligence/provider");
const quality_1 = require("../intelligence/quality");
const planning_1 = require("../intelligence/schemas/planning");
const provider_policy_1 = require("../intelligence/provider-policy");
const attempts_1 = require("./attempts");
const intents_1 = require("./intents");
const checkpoints_1 = require("../intelligence/checkpoints");
const checkpoint_1 = require("../intelligence/schemas/checkpoint");
const learning_1 = require("./learning");
const research_1 = require("./research");
const revisions_1 = require("./revisions");
const compilation_1 = require("./compilation");
const database_1 = require("./database");
/** Orchestrates the existing Attempt and repositories; never applies execution. */
class PlannerCompilerService {
    attempts;
    dependencies;
    learning;
    research;
    constructor(attempts, dependencies = {}) {
        this.attempts = attempts;
        this.dependencies = dependencies;
        this.learning = new learning_1.LearningCompilerService(attempts, dependencies);
        this.research = dependencies.research ?? new research_1.ResearchService(attempts, { provider: dependencies.provider });
    }
    allocated(checkpoint) {
        if (!("allocation" in checkpoint.payload))
            (0, database_1.reject)("QUALITY_INCOMPLETE", "Independent review requires allocation.", "REVIEW");
        const { stage: _stage, ...payload } = checkpoint.payload;
        void _stage;
        // Review metadata is not generator context and is not duplicated in the proposal.
        Reflect.deleteProperty(payload, "quality");
        Reflect.deleteProperty(payload, "reviewSupport");
        Reflect.deleteProperty(payload, "reviewedAllocationDigest");
        return { ...payload, stage: "ALLOCATION" };
    }
    input(owned, checkpoint, verification = false) {
        const context = { ...owned.view };
        Reflect.deleteProperty(context, "projectedAt");
        const p = checkpoint.payload;
        return (0, quality_1.buildReviewInput)(owned.targets.map((t, i) => ({ planRef: t.planRef,
            requested: (0, quality_1.goalForReview)(owned.requestedIntents[i]), resolved: (0, quality_1.goalForReview)(owned.intents[i]) })), context, this.allocated(checkpoint), verification && "reviewSupport" in p ? p.reviewSupport.findings : undefined, verification ? checkpoint.repairIssueIds : undefined);
    }
    async sources(owned, signal) {
        for (const intent of owned.intents)
            for (const source of intent.research?.sources ?? [])
                if (source.location.kind === "OWNED_DOCUMENT") {
                    signal.throwIfAborted();
                    const actual = await this.research.documents.read(owned.attempt.ownerId, source.location.documentId);
                    if (actual.metadata.contentHash !== source.contentHash)
                        (0, database_1.reject)("STALE_CONTEXT", "An owned source changed before independent review/publication.", "REVIEW");
                }
    }
    async save(token, owned, checkpoint, payload, identities = owned.identities, repairs = checkpoint.repairs, repairIssueIds = checkpoint.repairIssueIds) {
        return this.learning.saveCheckpoint(token, { ...checkpoint, binding: this.learning.bindingFor(owned, payload, identities),
            repairs, repairIssueIds, payload }, identities);
    }
    async run(token, signal) {
        signal.throwIfAborted();
        let attempt = await this.attempts.read(token.ownerId, token.attemptId);
        if (attempt.state === "SUCCEEDED")
            return;
        if (!["PLAN", "REPLAN", "JOINT"].includes(attempt.kind))
            (0, database_1.reject)("INTENT_CONFLICT", "This compiler requires explicit educational targets.", "PREFLIGHT");
        if (!attempt.checkpoint && attempt.parentAttemptId) {
            await new revisions_1.RevisionService(this.attempts).resolveUnchanged(token);
            await this.resumeParent(token, signal);
            attempt = await this.attempts.read(token.ownerId, token.attemptId);
        }
        if (attempt.acceptedRequest.researchRequested && attempt.targets.some(t => !t.resolvedIntentVersionId)) {
            await this.research.complete(token, signal);
            attempt = await this.attempts.read(token.ownerId, token.attemptId);
            if (attempt.state !== "RUNNING")
                return;
        }
        if (attempt.acceptedRequest.researchRequested && attempt.checkpoint?.stage === "RESEARCH" && attempt.targets.every(t => t.resolution === "RESEARCH_ADOPTION"))
            await this.research.finishResolvedAdoption(token, signal);
        // Resume quality directly. Calling generation again cannot overwrite review.
        let owned;
        if (!attempt.targets.every(t => t.resolvedIntentVersionId) || !["REVIEW", "REPAIR", "VERIFICATION"].includes(attempt.checkpoint?.stage ?? ""))
            await this.learning.run(token, signal);
        attempt = await this.attempts.read(token.ownerId, token.attemptId);
        if (attempt.state !== "RUNNING")
            return;
        owned = await this.learning.capture(token);
        let checkpoint = owned.checkpoint;
        if (!checkpoint || !("allocation" in checkpoint.payload))
            (0, database_1.reject)("QUALITY_INCOMPLETE", "No allocated educational artifact is available.", "REVIEW");
        if (checkpoint.payload.allocation.report.status !== "FEASIBLE")
            (0, database_1.reject)("QUALITY_INCOMPLETE", "Unallocated work cannot be reviewed as feasible.", "REVIEW");
        if (checkpoint.payload.stage === "ALLOCATION") {
            const identities = (0, compilation_1.assignCompilerIdentities)(checkpoint.payload.blueprints, owned.compilationTargets, owned.liveSpecs, owned.identities);
            checkpoint = await this.save(token, owned, checkpoint, checkpoint.payload, identities);
            owned = await this.learning.capture(token);
            await this.sources(owned, signal);
            const input = this.input(owned, checkpoint);
            const payload = { ...this.allocated(checkpoint), stage: "REVIEW", reviewedAllocationDigest: this.allocated(checkpoint).allocation.digest,
                quality: (0, quality_1.incompleteQuality)(checkpoint), reviewSupport: { phase: "REVIEW_PENDING", identityDigest: (0, database_1.hash)("compiler-identities", owned.identities), reviewInputDigest: (0, database_1.hash)("quality-input", input), findings: [] } };
            checkpoint = await this.save(token, owned, checkpoint, payload);
        }
        if (checkpoint.payload.stage === "REVIEW" && checkpoint.payload.reviewSupport?.phase === "REVIEW_PENDING") {
            owned = await this.learning.capture(token);
            await this.sources(owned, signal);
            const input = this.input(owned, checkpoint);
            if ((0, database_1.hash)("quality-input", input) !== checkpoint.payload.reviewSupport.reviewInputDigest)
                (0, database_1.reject)("STALE_CONTEXT", "The independent review inputs changed.", "REVIEW");
            const reviewed = await (0, quality_1.reviewLearning)((0, provider_1.workerProviderMeter)(this.attempts, token), input, checkpoint.payload.quality, signal, this.dependencies.provider);
            signal.throwIfAborted();
            checkpoint = await this.save(token, owned, checkpoint, { ...checkpoint.payload, quality: reviewed.reports,
                reviewSupport: { ...checkpoint.payload.reviewSupport, phase: "REVIEWED", findings: reviewed.findings } });
        }
        if (checkpoint.payload.stage === "REVIEW" && checkpoint.payload.quality.some(q => q.report.status === "BLOCKED")) {
            if (checkpoint.repairs)
                (0, database_1.reject)("QUALITY_BLOCKED", "The single repair has already been used; the specific issues remain available.", "REVIEW");
            owned = await this.learning.capture(token);
            const ids = checkpoint.payload.quality.flatMap(q => q.report.issues.filter(i => i.severity === "BLOCKING").map(i => i.issueId));
            const input = this.input(owned, checkpoint, true);
            input.repairIssueIds = ids;
            const reserve = (0, quality_1.verificationHoldback)(input, signal);
            const repair = this.repairRequest(owned, checkpoint, signal, reserve);
            // Prove repair plus a separate verification allowance fits before marking
            // the only repair opportunity. The dispatcher repeats this atomically.
            await this.attempts.mutate(token, async (_sql, current, stored, now) => {
                const budget = structuredClone(current.budget);
                budget.reserved.modelCalls++;
                budget.reserved.inputTokens += (0, provider_1.boundedProviderInput)(repair);
                budget.reserved.outputTokens += repair.outputTokens;
                (0, provider_policy_1.reserveProviderCapacity)(budget, stored.providerGuard ?? {}, repair.policy, now, true, 1);
            });
            const quality = checkpoint.payload.quality.map(q => ({ ...q, report: { ...q.report, status: "INCOMPLETE" } }));
            checkpoint = await this.save(token, owned, checkpoint, { ...checkpoint.payload, stage: "REPAIR", quality,
                reviewSupport: { ...checkpoint.payload.reviewSupport, phase: "REPAIR_PENDING", verificationReserve: reserve, repairInputDigest: (0, database_1.hash)("repair-input", repair.messages) } }, owned.identities, 1, ids);
        }
        if (checkpoint.payload.stage === "REPAIR" && checkpoint.payload.reviewSupport?.phase === "REPAIR_PENDING") {
            owned = await this.learning.capture(token);
            if (owned.dispatchedRepair)
                (0, database_1.reject)("PROVIDER_FAILURE", "The single repair was dispatched without a saved response. An explicit linked retry is required; takeover cannot repeat it.", "REPAIR");
            const request = this.repairRequest(owned, checkpoint, signal, checkpoint.payload.reviewSupport.verificationReserve);
            if ((0, database_1.hash)("repair-input", request.messages) !== checkpoint.payload.reviewSupport.repairInputDigest)
                (0, database_1.reject)("STALE_CONTEXT", "Repair input correspondence changed.", "REPAIR");
            const result = await (0, provider_1.dispatchMeteredProvider)((0, provider_1.workerProviderMeter)(this.attempts, token), request, this.dependencies.provider);
            signal.throwIfAborted();
            checkpoint = await this.save(token, owned, checkpoint, { ...checkpoint.payload,
                reviewSupport: { ...checkpoint.payload.reviewSupport, phase: "REPAIR_ACCEPTED", acceptedRepair: result.value,
                    acceptedRepairDigest: (0, database_1.hash)("accepted-repair", result.value) } });
        }
        if (checkpoint.payload.stage === "REPAIR" && checkpoint.payload.reviewSupport?.phase === "REPAIR_ACCEPTED") {
            owned = await this.learning.capture(token);
            const p = checkpoint.payload, support = p.reviewSupport;
            if ((0, database_1.hash)("accepted-repair", support.acceptedRepair) !== support.acceptedRepairDigest)
                (0, database_1.reject)("INVALID_OUTPUT", "The saved repair response changed.", "REPAIR");
            const response = (0, blueprint_1.validateLearningProposal)(JSON.parse(support.acceptedRepair), this.blueprintInput(owned, checkpoint), false);
            if (response.decision !== "REVISE")
                (0, database_1.reject)("INVALID_OUTPUT", "Repair must return a complete revised proposal.", "REPAIR");
            const envelope = (0, learning_1.learningEnvelope)(owned.envelope, response.detail.days, p.planning?.recoveryAdjustment);
            const expanded = (0, blueprint_1.expandDeclaredSplits)(response.snapshot, envelope, response.kept, new Map(owned.targets.map(t => [t.planRef, (0, capacity_1.maximumNewTimebox)(envelope, owned.facts, t.planRef)])));
            const report = (0, allocator_1.allocateLearning)(expanded.snapshot, envelope, owned.facts, { maximumSearchNodes: this.dependencies.maximumSearchNodes });
            if (report.status !== "FEASIBLE") {
                await this.save(token, owned, checkpoint, { ...p, reviewSupport: { ...support, repairAllocationFailure: report } });
                (0, database_1.reject)("QUALITY_BLOCKED", "The repaired education could not be placed within the accepted constraints. Its response and allocation feedback are retained; no second repair is permitted.", "REPAIR");
            }
            const planning = planning_1.PlanningSupportSchema.parse({ ...p.planning, detail: response.detail, tradeOffExplanation: response.tradeOffExplanation,
                unreviewedPhaseRefs: response.unreviewedPhaseRefs, splits: expanded.splits,
                forecasts: (0, forecast_1.forecastLearning)(expanded.snapshot, report, this.learning.forecastEnvelope(owned.forecastEnvelope, p.planning?.recoveryAdjustment), owned.forecastFacts, response.unreviewedPhaseRefs) });
            const identities = (0, compilation_1.assignCompilerIdentities)(expanded.snapshot, owned.compilationTargets, owned.liveSpecs, owned.identities);
            const allocation = { report, digest: (0, database_1.hash)("allocation", report) };
            const { acceptedRepair: _accepted, ...receipt } = support;
            void _accepted;
            const payload = { ...p, envelope, blueprints: expanded.snapshot, allocation, planning, reviewedAllocationDigest: allocation.digest,
                reviewSupport: { ...receipt, identityDigest: (0, database_1.hash)("compiler-identities", identities), phase: "REPAIRED" } };
            const rebound = { ...checkpoint, binding: this.learning.bindingFor(owned, payload, identities), payload };
            payload.quality = (0, quality_1.incompleteQuality)(rebound).map(q => ({ ...q, report: { ...q.report,
                    issues: p.quality.find(old => old.planRef === q.planRef).report.issues,
                    requiredAcknowledgements: p.quality.find(old => old.planRef === q.planRef).report.requiredAcknowledgements } }));
            checkpoint = await this.save(token, owned, checkpoint, payload, identities);
        }
        if (checkpoint.payload.stage === "REPAIR" && checkpoint.payload.reviewSupport?.phase === "REPAIRED") {
            if (checkpoint.payload.allocation.report.status !== "FEASIBLE")
                (0, database_1.reject)("QUALITY_BLOCKED", "The repaired education cannot be placed within the accepted constraints; no further adaptation/repair is permitted.", "REPAIR");
            owned = await this.learning.capture(token);
            await this.sources(owned, signal);
            const input = this.input(owned, checkpoint, true);
            const needed = (0, provider_1.boundedProviderInput)((0, quality_1.qualityRequest)(input, signal, () => null));
            if (needed > checkpoint.payload.reviewSupport.verificationReserve.inputTokens)
                (0, database_1.reject)("BUDGET_EXHAUSTED", "The repaired proposal exceeds the reserved verification input; retain it for an explicit retry.", "VERIFICATION");
            checkpoint = await this.save(token, owned, checkpoint, { ...checkpoint.payload, stage: "VERIFICATION",
                reviewSupport: { ...checkpoint.payload.reviewSupport, phase: "VERIFICATION_PENDING", verificationInputDigest: (0, database_1.hash)("quality-input", input) } });
        }
        if (checkpoint.payload.stage === "VERIFICATION" && checkpoint.payload.reviewSupport?.phase === "VERIFICATION_PENDING") {
            owned = await this.learning.capture(token);
            await this.sources(owned, signal);
            const input = this.input(owned, checkpoint, true);
            if ((0, database_1.hash)("quality-input", input) !== checkpoint.payload.reviewSupport.verificationInputDigest)
                (0, database_1.reject)("STALE_CONTEXT", "Verification inputs changed.", "VERIFICATION");
            // Re-establish the same hold if a completed response was lost before its
            // checkpoint. A repeated verification still consumes this root's budget.
            const meter = (0, provider_1.workerProviderMeter)(this.attempts, token), previous = checkpoint.payload.quality;
            const reserve = checkpoint.payload.reviewSupport.verificationReserve;
            const guarded = { ...meter, reserve: (route, inputTokens, outputTokens, policy, abort) => meter.reserve(route, inputTokens, outputTokens, { ...policy, verificationReserve: reserve }, abort) };
            const verified = await (0, quality_1.verifyLearning)(guarded, input, previous, (0, quality_1.incompleteQuality)(checkpoint), new Date().toISOString(), signal, this.dependencies.provider);
            signal.throwIfAborted();
            checkpoint = await this.save(token, owned, checkpoint, { ...checkpoint.payload, quality: verified.reports,
                reviewSupport: { ...checkpoint.payload.reviewSupport, phase: "VERIFIED", findings: [...checkpoint.payload.reviewSupport.findings, ...verified.findings] } });
        }
        if (!("quality" in checkpoint.payload) || checkpoint.payload.quality.some(q => q.report.status !== "PASSED")) {
            const failure = new database_1.DurablePlannerError("QUALITY_BLOCKED", "Concrete quality issues remain unresolved. Review the named issues before requesting another attempt.", checkpoint.payload.stage);
            if ("quality" in checkpoint.payload)
                failure.detail.activityRefs = [...new Set(checkpoint.payload.quality.flatMap(q => q.report.issues.filter(i => i.severity === "BLOCKING").flatMap(i => i.affectedRefs)))].slice(0, 60);
            throw failure;
        }
        owned = await this.learning.capture(token);
        await this.sources(owned, signal);
        signal.throwIfAborted();
        const baseline = await this.attempts.mutate(token, async (sql) => {
            const specs = [];
            for (const plan of owned.plans)
                if (plan.activeRevisionId) {
                    if (plan.migrationEvidence && !(await sql.query('SELECT "v2Artifact" FROM "PlannerRevision" WHERE id=$1', [plan.activeRevisionId])).rows[0]?.v2Artifact)
                        specs.push(...(plan.migrationEvidence.baselineSpecs).map(s => contracts_1.ExecutionTaskSpecV2Schema.parse(s)));
                    else
                        specs.push(...(await (0, revisions_1.loadRevision)(sql, token.ownerId, plan.activeRevisionId)).executable);
                }
            return specs;
        });
        const sealed = (0, compilation_1.sealCompilerCandidate)(checkpoint, owned.compilationTargets.map(t => ({ ...t,
            ...owned.attempt.targets.find(a => a.planId === t.planId), resolvedIntentVersionId: owned.attempt.targets.find(a => a.planId === t.planId).resolvedIntentVersionId,
            resolvedPlanningVersion: owned.attempt.targets.find(a => a.planId === t.planId).resolvedPlanningVersion })), owned.liveSpecs, baseline, owned.identities, new Map(owned.targets.map((t, i) => [t.planRef, owned.intents[i].research?.sources ?? []])), new Date().toISOString());
        await new revisions_1.RevisionService(this.attempts).publish(token, sealed.revisions, sealed.changeSet);
    }
    async resumeParent(token, signal) {
        const owned = await this.learning.capture(token);
        const source = await this.attempts.mutate(token, async (sql, current) => {
            const parent = await (0, attempts_1.loadAttempt)(sql, current.ownerId, current.parentAttemptId);
            const checkpoint = checkpoint_1.CompilerCheckpointSchema.parse(parent.payload.checkpoint);
            if (!["FAILED", "CANCELLED", "NEEDS_DECISION"].includes(parent.attempt.state) || !("allocation" in checkpoint.payload) ||
                !["REVIEW", "REPAIR", "VERIFICATION"].includes(checkpoint.payload.stage) || parent.attempt.targets.length !== current.targets.length ||
                parent.attempt.targets.some((t, i) => t.planId !== current.targets[i].planId || t.resolvedIntentVersionId !== current.targets[i].resolvedIntentVersionId ||
                    t.baseActiveRevisionId !== current.targets[i].baseActiveRevisionId || t.resolvedPlanningVersion !== current.targets[i].resolvedPlanningVersion) ||
                parent.payload.learningFactsDigest !== owned.factsDigest)
                (0, database_1.reject)("STALE_CONTEXT", "The retained stage does not match this explicitly retried intent, baseline and calendar.", "RECOVERY");
            const expected = this.learning.bindingFor(owned, checkpoint.payload, parent.payload.compilerIdentities ?? []);
            expected.attemptId = parent.attempt.attemptId;
            expected.requestHash = parent.attempt.requestHash;
            expected.rootRequestId = parent.attempt.budget.rootRequestId;
            expected.targetAuthorizationDigest = parent.attempt.acceptedRequest.targetAuthorizationDigest;
            for (const [i, target] of expected.targets.entries())
                Object.assign(target, parent.attempt.targets[i], { requestedIntentDigest: (0, database_1.hash)("canonical-intent", (await (0, intents_1.loadIntent)(sql, current.ownerId, parent.attempt.targets[i].requestedIntentVersionId)).intent) });
            const read = (0, checkpoints_1.readCompilerCheckpoint)(parent.payload.checkpoint, parent.attempt, expected);
            if (!read.ok)
                (0, database_1.reject)("STALE_CONTEXT", read.reason, "RECOVERY");
            const originalIntents = parent.payload.compilerRetry?.originalIntents ?? parent.attempt.targets.map((t, i) => ({ planRef: `plan_${i + 1}`, intentVersionId: t.requestedIntentVersionId }));
            const originals = [];
            for (const original of originalIntents)
                originals.push((await (0, intents_1.loadIntent)(sql, current.ownerId, original.intentVersionId)).intent);
            return { ...parent, checkpoint, originalIntents, originals };
        });
        signal.throwIfAborted();
        await this.sources(owned, signal);
        let checkpoint = structuredClone(source.checkpoint);
        // A lost repair response can only be attempted again by this explicit new
        // root. Ordinary takeover above never resets its one-repair counter.
        if (checkpoint.payload.stage === "REPAIR" && checkpoint.payload.reviewSupport?.phase === "REPAIR_PENDING") {
            const p = checkpoint.payload;
            checkpoint = { ...checkpoint, repairs: 0, repairIssueIds: [], payload: { ...p, stage: "REVIEW",
                    quality: p.quality.map(q => ({ ...q, report: { ...q.report, status: q.report.issues.some(i => i.severity === "BLOCKING") ? "BLOCKED" : "PASSED" } })),
                    reviewSupport: { phase: "REVIEWED", identityDigest: p.reviewSupport.identityDigest, reviewInputDigest: p.reviewSupport.reviewInputDigest, findings: p.reviewSupport.findings } } };
        }
        checkpoint.binding = this.learning.bindingFor(owned, checkpoint.payload, source.payload.compilerIdentities ?? []);
        owned.requestedIntents = source.originals;
        if ("reviewSupport" in checkpoint.payload && checkpoint.payload.reviewSupport) {
            const support = checkpoint.payload.reviewSupport;
            if (support.phase === "REVIEW_PENDING")
                support.reviewInputDigest = (0, database_1.hash)("quality-input", this.input(owned, checkpoint));
            if (support.phase === "VERIFICATION_PENDING")
                support.verificationInputDigest = (0, database_1.hash)("quality-input", this.input(owned, checkpoint, true));
        }
        const providerGuard = { reviewReserve: source.payload.providerGuard?.reviewReserve ?? { inputTokens: 8192, outputTokens: 4096 },
            reviewCompleted: source.payload.providerGuard?.reviewCompleted ?? false,
            ...("reviewSupport" in checkpoint.payload && checkpoint.payload.reviewSupport?.verificationReserve ? { verificationReserve: checkpoint.payload.reviewSupport.verificationReserve } : {}) };
        // Review and lineage metadata are saved atomically with the rebound artifact.
        await this.learning.saveCheckpoint(token, checkpoint, source.payload.compilerIdentities ?? [], { providerGuard,
            compilerRetry: { sourceAttemptId: source.attempt.attemptId, sourceCheckpointDigest: source.attempt.checkpoint.digest, originalIntents: source.originalIntents } });
    }
    blueprintInput(owned, checkpoint) {
        const p = this.allocated(checkpoint);
        return { plans: owned.targets, context: owned.view, envelope: p.envelope, previous: p.blueprints,
            feedback: p.allocation.report, sharedDependencies: owned.sharedDependencies };
    }
    repairRequest(owned, checkpoint, signal, reserve) {
        const input = this.blueprintInput(owned, checkpoint), p = checkpoint.payload;
        if (!("quality" in p))
            (0, database_1.reject)("QUALITY_INCOMPLETE", "Repair requires the original grounded findings.", "REPAIR");
        const review = this.input(owned, checkpoint);
        const messages = [{ role: "user", content: JSON.stringify({ stage: "REPAIR", plans: input.plans.map(t => ({ planRef: t.planRef,
                        policy: t.intent.policy, allowlist: t.allowed, kept: t.kept, keptPhases: t.keptPhases })), context: (0, quality_1.modelReviewInput)(review),
                    issues: p.quality.flatMap(q => q.report.issues.filter(i => i.severity === "BLOCKING")),
                    groundedFindings: p.reviewSupport?.findings.filter(f => f.finding.basis === "CONCRETE_VIOLATION" && f.finding.severity === "BLOCKING") }) }];
        return { policy: { purpose: "REPAIR", verificationReserve: reserve }, outputTokens: 8192, signal, messages,
            systemInstruction: blueprint_1.blueprintInstruction + `\nThis is the only named quality REPAIR. Resolve the supplied concrete blocking issues, preserve owned kept education/exclusions/hard facts and useful specificity; do not add workload for advisory preference. Return REVISE with the complete new-work proposal. Recovery margin is already accepted and cannot change here. Return at most ${quality_1.MAX_REPAIR_BYTES} UTF-8 bytes; overflow fails explicitly.`,
            validate: (r) => {
                if (Buffer.byteLength(r.text ?? "") > quality_1.MAX_REPAIR_BYTES)
                    (0, database_1.reject)("PAYLOAD_TOO_LARGE", "Repair exceeded its verification-supported byte limit.", "REPAIR");
                const value = (0, json_extractor_1.extractJsonValue)(r.text);
                const response = (0, blueprint_1.validateLearningProposal)(value, input, false);
                if (response.decision !== "REVISE")
                    (0, database_1.reject)("INVALID_OUTPUT", "Repair requires revised education.", "REPAIR");
                return JSON.stringify(value);
            } };
    }
    handler() { return async ({ token, signal }) => { await this.run(token, signal); }; }
}
exports.PlannerCompilerService = PlannerCompilerService;
function createCompilerHandlers(attempts, dependencies = {}) {
    const compiler = new PlannerCompilerService(attempts, dependencies), handler = compiler.handler();
    return { PLAN: handler, REPLAN: handler, JOINT: handler, RESEARCH_ADVICE: compiler.research.adviceHandler() };
}
