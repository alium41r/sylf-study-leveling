"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LearningCompilerService = void 0;
exports.learningEnvelope = learningEnvelope;
const contracts_1 = require("../contracts");
const capacity_1 = require("../intelligence/capacity");
const allocator_1 = require("../intelligence/allocator");
const blueprint_1 = require("../intelligence/blueprint");
const forecast_1 = require("../intelligence/forecast");
const context_1 = require("../intelligence/context");
const checkpoints_1 = require("../intelligence/checkpoints");
const provider_1 = require("../intelligence/provider");
const checkpoint_1 = require("../intelligence/schemas/checkpoint");
const planning_1 = require("../intelligence/schemas/planning");
const scheduling_1 = require("../intelligence/schemas/scheduling");
const attempts_1 = require("./attempts");
const compilation_1 = require("./compilation");
const quality_1 = require("../intelligence/schemas/quality");
const intents_1 = require("./intents");
const revisions_1 = require("./revisions");
const context_2 = require("./context");
const database_1 = require("./database");
const documents_1 = require("./documents");
const dayAfter = (date, days) => new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);
/** A discretionary recovery change is explicit educational output. Recompute
 * it once from hard ceilings; never subtract a second "safety" factor. */
function learningEnvelope(owned, days, adjustment) {
    if (adjustment && adjustment.percent > owned.recoveryPercent)
        (0, database_1.reject)('INVALID_OUTPUT', 'A recovery adjustment cannot alter hard availability.', 'ADAPTATION');
    const recoveryPercent = adjustment?.percent ?? owned.recoveryPercent, end = dayAfter(owned.window.start, days - 1);
    return scheduling_1.SchedulingEnvelopeSchema.parse({ ...owned, window: { start: owned.window.start, end }, recoveryPercent, days: owned.days.filter(d => d.date <= end).map(day => { const recoveryMinutes = Math.ceil(day.ceilingMinutes * recoveryPercent / 100); return { ...day, recoveryMinutes, availableMinutes: day.excluded ? 0 : Math.max(0, day.ceilingMinutes - day.otherCommittedMinutes - day.protectedTargetMinutes - recoveryMinutes) }; }) });
}
/** Step 4 ends at allocated education. Step 5 owns independent review, repair,
 * sealing, publication and production handler composition. No Quest writes. */
class LearningCompilerService {
    attempts;
    dependencies;
    constructor(attempts, dependencies = {}) {
        this.attempts = attempts;
        this.dependencies = dependencies;
    }
    async capture(token) { return this.attempts.mutate(token, (sql, attempt, payload) => this.captureOwned(sql, attempt, payload)); }
    async captureOwned(sql, attempt, payload) {
        if (!['PLAN', 'REPLAN', 'JOINT'].includes(attempt.kind) || !attempt.targets.length)
            (0, database_1.reject)('INTENT_CONFLICT', 'This operation does not authorize educational compilation.', 'PREFLIGHT');
        if (attempt.targets.some(t => !t.resolvedIntentVersionId))
            (0, database_1.reject)('INTENT_CONFLICT', 'Resolve every selected intent before compilation.', 'PREFLIGHT');
        const plans = [];
        for (const target of attempt.targets)
            plans.push(await (0, intents_1.ownedPlan)(sql, attempt.ownerId, target.planId));
        const intents = [];
        for (const target of attempt.targets) {
            const version = await (0, intents_1.loadIntent)(sql, attempt.ownerId, target.resolvedIntentVersionId);
            if (version.planId !== target.planId)
                (0, database_1.reject)('REFERENCE_NOT_OWNED', 'Resolved intent belongs to another Plan.', 'PREFLIGHT');
            if (version.intent.research)
                await (0, documents_1.verifyOwnedResearchDocuments)(sql, attempt.ownerId, version.intent.research);
            intents.push(version.intent);
        }
        const first = await (0, context_2.loadExecutionContext)(sql, attempt.ownerId, plans, intents[0]);
        if (first.requiresReestimate)
            (0, database_1.reject)('PROTECTED_EXECUTION', 'Unfinished work needs a reviewed remaining estimate before allocation.', 'PREFLIGHT');
        const requested = attempt.targets.map((t, i) => ({ planId: t.planId, planRef: `plan_${i + 1}`, intentId: t.resolvedIntentVersionId }));
        const projection = await (0, context_1.loadPlannerModelContext)(sql, attempt.ownerId, requested, { start: first.today, end: dayAfter(first.today, 27) });
        for (const [i, target] of attempt.targets.entries())
            if ((0, context_2.contextInputDigest)(projection.contexts[i].context.dependencies) !== target.contextDigest)
                (0, database_1.reject)('STALE_CONTEXT', 'Consequential execution/evidence changed before compilation.', 'PREFLIGHT');
        const forecastProjection = await (0, context_1.loadPlannerModelContext)(sql, attempt.ownerId, requested, { start: first.today, end: dayAfter(first.today, 364) });
        const byQuest = new Map(projection.registry.map(r => [r.questId, r]));
        const selected = new Map(attempt.targets.map((t, i) => [t.planId, `plan_${i + 1}`]));
        const refs = new Map();
        const relevant = first.quests.filter(q => byQuest.has(q.id) && q.plannerSpec).map(q => ({ q, spec: contracts_1.ExecutionTaskSpecV2Schema.parse(q.plannerSpec), live: (0, context_2.liveExecution)(q, first.sessions) }));
        for (const { spec } of relevant)
            if (selected.has(spec.planId))
                refs.set(spec.activityKey, { planRef: selected.get(spec.planId), activityRef: spec.blueprintActivityId });
        // Original educational content comes from an owned sealed revision, including
        // older completed dependencies. Do not reconstruct it from generic templates.
        const originals = await this.originals(sql, attempt.ownerId, relevant.filter(r => selected.has(r.spec.planId)).map(r => r.spec));
        const facts = { weeks: projection.view.weeks, pins: [], externalActivities: [], preferences: intents.map((intent, i) => ({ planRef: `plan_${i + 1}`, pacing: intent.preferences.pacing, ...(intent.preferences.maximumTimeboxMinutes ? { maximumTimeboxMinutes: intent.preferences.maximumTimeboxMinutes } : {}) })) };
        const targets = intents.map((intent, i) => ({ planRef: `plan_${i + 1}`, intent, kept: [], keptPhases: [], readiness: new Map(intent.scope.map(s => [s.modelRef, intent.evidence.filter(e => e.demonstratesReadiness && e.scopeKeys.includes(s.scopeKey)).map(e => e.evidenceId)])),
            allowed: { scopeRefs: intent.scope.map(s => s.modelRef), excludedScopeRefs: intent.scope.filter(s => s.inclusion === 'EXCLUDED').map(s => s.modelRef), evidenceRefs: [...intent.evidence.map(e => e.evidenceId), ...intent.research?.claims.map(c => c.claimId) ?? [], ...projection.view.plans[i].savedChecks.map(c => c.ref)], resourceRefs: intent.research?.sources.map(s => s.sourceId) ?? [], externalActivityRefs: [] } }));
        const sharedDependencies = [];
        for (const { q, spec, live } of relevant) {
            const ref = refs.get(spec.activityKey);
            facts.externalActivities.push({ ref: (0, context_2.externalActivityAlias)(spec.activityKey), date: q.completedAt ? (0, context_2.civilDate)(q.completedAt, first.timezone) : q.scheduledFor, available: live.state === 'COMPLETED' || live.remainingDisposition === 'OPEN', contentDigest: (0, context_2.contentDigest)(spec) });
            if (!ref)
                continue;
            const target = targets.find(t => t.planRef === ref.planRef);
            const original = originals.get(spec.activityKey);
            if (!original)
                (0, database_1.reject)('PROTECTED_EXECUTION', 'Retained educational provenance is unavailable; do not substitute or discard it.', 'PREFLIGHT');
            if (target.kept.some(a => a.localId === original.activity.localId))
                (0, database_1.reject)('PROTECTED_EXECUTION', 'Retained activity aliases collide across revisions.', 'PREFLIGHT');
            const activity = structuredClone(original.activity);
            if (activity.commitment.category !== 'COMMITTED')
                (0, database_1.reject)('PROTECTED_EXECUTION', 'An executable retained activity lacks its committed educational owner.', 'PREFLIGHT');
            target.kept.push(activity);
            for (const phase of original.phases.filter(p => activity.outcomeRefs.includes(p.localId))) {
                const old = target.keptPhases.find(p => p.localId === phase.localId);
                if (old && (0, database_1.hash)('phase', old) !== (0, database_1.hash)('phase', phase))
                    (0, database_1.reject)('PROTECTED_EXECUTION', 'Retained phase aliases have different historical content.', 'PREFLIGHT');
                if (!old)
                    target.keptPhases.push(phase);
            }
            target.allowed.resourceRefs = [...new Set([...target.allowed.resourceRefs, ...activity.resourceRefs ?? []])];
            target.allowed.evidenceRefs = [...new Set([...target.allowed.evidenceRefs, ...activity.evidenceRefs ?? []])];
            facts.pins.push({ planRef: ref.planRef, activityRef: ref.activityRef, date: q.scheduledFor, ...(q.completedAt ? { completionDate: (0, context_2.civilDate)(q.completedAt, first.timezone) } : {}), remainingMinutes: live.remainingMinutesEstimate, alreadyReserved: live.state !== 'UNSTARTED', contentDigest: (0, context_2.contentDigest)(spec), state: live.state, remainingDisposition: live.remainingDisposition, actualSeconds: live.actualSeconds, executionVersion: live.executionVersion });
            // Execution is the authority for cross-plan prerequisites. Restore shared
            // educational ownership instead of counting the prerequisite for both goals.
            for (const dependency of spec.content.hardDependencies) {
                const endpoint = refs.get(dependency);
                if (endpoint && endpoint.planRef !== ref.planRef) {
                    sharedDependencies.push({ prerequisite: { planRef: endpoint.planRef, activityId: endpoint.activityRef }, dependent: { planRef: ref.planRef, activityId: ref.activityRef }, strength: 'HARD', reason: 'Preserve the owned execution prerequisite' });
                }
            }
        }
        for (const target of targets)
            target.allowed.externalActivityRefs = [...facts.externalActivities.map(a => a.ref), ...target.kept.map(a => a.localId)];
        const normalize = (envelope) => scheduling_1.SchedulingEnvelopeSchema.parse({ ...envelope, protectedExecution: envelope.protectedExecution.map(p => { const quest = projection.registry.find(r => r.ref === p.activityRef); const endpoint = quest?.activityKey ? refs.get(quest.activityKey) : undefined; if (!endpoint || endpoint.planRef !== p.planRef)
                (0, database_1.reject)('PROTECTED_EXECUTION', 'A protected execution alias cannot be resolved.', 'PREFLIGHT'); return { ...p, activityRef: endpoint.activityRef }; }) });
        const envelope = normalize(projection.view.envelope), forecastEnvelope = normalize(forecastProjection.view.envelope);
        const saved = payload.checkpoint ? checkpoint_1.CompilerCheckpointSchema.parse(payload.checkpoint) : null;
        const research = saved?.payload.research ?? null;
        const sourceDigests = research?.selectedSources.map(({ sourceId, contentHash }) => ({ sourceId, contentHash })) ?? [];
        if (sourceDigests.some(s => !intents.some(intent => intent.research?.sources.some(owned => owned.sourceId === s.sourceId && owned.contentHash === s.contentHash))))
            (0, database_1.reject)('STALE_CONTEXT', 'Research source pins are not present in the resolved owned intents.', 'PREFLIGHT');
        const binding = { attemptId: attempt.attemptId, ownerId: attempt.ownerId, requestHash: attempt.requestHash, rootRequestId: attempt.budget.rootRequestId, targetAuthorizationDigest: attempt.acceptedRequest.targetAuthorizationDigest,
            targets: await Promise.all(attempt.targets.map(async (t, i) => ({ ...t, planRef: `plan_${i + 1}`, requestedIntentDigest: (0, database_1.hash)('canonical-intent', (await (0, intents_1.loadIntent)(sql, attempt.ownerId, t.requestedIntentVersionId)).intent), resolvedIntentDigest: (0, database_1.hash)('canonical-intent', intents[i]), qualityEvidenceDigest: (0, revisions_1.qualityEvidenceDigest)(intents[i]), context: projection.contexts[i].context.dependencies }))), sourceDigests, envelopeDigest: null };
        const liveSpecs = first.quests.filter(q => q.plannerSpec).map(q => contracts_1.ExecutionTaskSpecV2Schema.parse(q.plannerSpec));
        const compilationTargets = plans.map((plan, i) => ({ planRef: `plan_${i + 1}`, planId: plan.id, goalId: plan.goalId ?? plan.reservedGoalId, context: projection.contexts[i].context.dependencies, sources: intents[i].research?.sources ?? [] }));
        const identities = payload.compilerIdentities ? quality_1.CompilerIdentitiesSchema.parse(payload.compilerIdentities) : [];
        if (saved && 'reviewSupport' in saved.payload && saved.payload.reviewSupport && saved.payload.reviewSupport.identityDigest !== (0, database_1.hash)('compiler-identities', identities))
            (0, database_1.reject)('STALE_CONTEXT', 'Reviewed execution identity correspondence changed.', 'RECOVERY');
        if (saved && 'allocation' in saved.payload && identities.length) {
            const compiled = (0, compilation_1.compileExecution)(saved.payload, compilationTargets, liveSpecs, identities);
            for (const target of binding.targets)
                target.context = compiled.find(p => p.planRef === target.planRef).context;
        }
        planning_1.AllocationFactsSchema.parse(facts);
        const factsDigest = (0, database_1.hash)('learning-owned-facts', { facts, forecastWeeks: forecastProjection.view.weeks, envelope, forecastEnvelope });
        if (payload.learningFactsDigest && payload.learningFactsDigest !== factsDigest)
            (0, database_1.reject)('STALE_CONTEXT', 'The pinned allocation calendar or owned execution facts changed.', 'PREFLIGHT');
        let checkpoint = null;
        if (saved && saved.payload.stage !== 'RESEARCH') {
            const days = 'planning' in saved.payload && saved.payload.planning ? saved.payload.planning.detail.days : 28;
            const adjustment = 'planning' in saved.payload ? saved.payload.planning?.recoveryAdjustment : undefined;
            if (adjustment && saved.adaptations !== 1)
                (0, database_1.reject)('INVALID_OUTPUT', 'A discretionary margin change lacks its adaptation receipt.', 'ADAPTATION');
            const expected = { ...binding, envelopeDigest: (0, database_1.hash)('scheduling-envelope', learningEnvelope(envelope, days, adjustment)) };
            const read = (0, checkpoints_1.readCompilerCheckpoint)(payload.checkpoint, attempt, expected);
            if (!read.ok)
                (0, database_1.reject)('STALE_CONTEXT', read.reason, 'PREFLIGHT');
            checkpoint = read.checkpoint;
        }
        else if (saved) {
            const read = (0, checkpoints_1.readCompilerCheckpoint)(payload.checkpoint, attempt, { ...binding, envelopeDigest: null });
            if (!read.ok)
                (0, database_1.reject)('STALE_CONTEXT', read.reason, 'PREFLIGHT');
        }
        const retry = payload.compilerRetry ? quality_1.CompilerRetrySchema.parse(payload.compilerRetry) : null;
        if (retry) {
            const parent = await (0, attempts_1.loadAttempt)(sql, attempt.ownerId, retry.sourceAttemptId, false);
            if (attempt.parentAttemptId !== parent.attempt.attemptId || parent.attempt.checkpoint?.digest !== retry.sourceCheckpointDigest || retry.originalIntents.length !== attempt.targets.length || (0, database_1.hash)('retry-originals', retry.originalIntents) !== (0, database_1.hash)('retry-originals', parent.payload.compilerRetry?.originalIntents ?? parent.attempt.targets.map((t, i) => ({ planRef: `plan_${i + 1}`, intentVersionId: t.requestedIntentVersionId }))))
                (0, database_1.reject)('STALE_CONTEXT', 'Retry provenance no longer corresponds to the owned parent checkpoint.', 'RECOVERY');
        }
        const requestedIntents = [];
        for (const [i, t] of attempt.targets.entries()) {
            const version = await (0, intents_1.loadIntent)(sql, attempt.ownerId, retry?.originalIntents.find(p => p.planRef === `plan_${i + 1}`)?.intentVersionId ?? t.requestedIntentVersionId);
            if (version.planId !== t.planId)
                (0, database_1.reject)('REFERENCE_NOT_OWNED', 'Original review goal belongs to another Plan.', 'REVIEW');
            requestedIntents.push(version.intent);
        }
        return { attempt, targets, plans, intents, requestedIntents, rawContexts: projection.contexts.map(c => c.context), compilationTargets, liveSpecs, identities, facts, forecastFacts: { ...facts, weeks: forecastProjection.view.weeks }, envelope, forecastEnvelope, binding, research, checkpoint, factsDigest, view: { ...projection.view, keptResources: relevant.filter(r => selected.has(r.spec.planId)).flatMap(r => r.spec.content.resources) }, sharedDependencies,
            dispatchedAdaptation: Object.values(payload.providerCalls ?? {}).some(c => c.purpose === 'ADAPTATION'),
            dispatchedRepair: (payload.calls ?? []).some(c => payload.providerCalls?.[c.callId]?.purpose === 'REPAIR' && ['DISPATCHED', 'UNKNOWN_SPEND', 'SETTLED'].includes(c.state)) };
    }
    /** Rebuild every binding inside the same fenced writer transaction. */
    async saveCheckpoint(token, raw, identities, metadata) {
        return this.attempts.mutate(token, async (sql, attempt, payload, now) => {
            const owned = await this.captureOwned(sql, attempt, payload);
            const next = checkpoint_1.CompilerCheckpointSchema.parse(raw);
            const selected = identities ?? owned.identities;
            if ('reviewSupport' in next.payload && next.payload.reviewSupport && next.payload.reviewSupport.identityDigest !== (0, database_1.hash)('compiler-identities', selected))
                (0, database_1.reject)('STALE_CONTEXT', 'The checkpoint must pin its exact execution identities.', next.payload.stage);
            const binding = this.bindingFor(owned, next.payload, selected);
            const read = (0, checkpoints_1.readCompilerCheckpoint)(next, { ...attempt, checkpoint: { stage: next.payload.stage, digest: (0, database_1.hash)('checkpoint', next), persistedAt: now.toISOString() } }, binding);
            if (!read.ok)
                (0, database_1.reject)('STALE_CONTEXT', read.reason, next.payload.stage);
            if (owned.checkpoint && (next.adaptations < owned.checkpoint.adaptations || next.repairs < owned.checkpoint.repairs))
                (0, database_1.reject)('INVALID_OUTPUT', 'Compiler pass counters cannot reset within a root.', next.payload.stage);
            await (0, attempts_1.persistAttempt)(sql, attempt, { ...attempt, stage: next.payload.stage, checkpoint: { stage: next.payload.stage, digest: (0, database_1.hash)('checkpoint', next), persistedAt: now.toISOString() } }, { ...payload, ...metadata, checkpoint: next, compilerIdentities: [...selected], learningFactsDigest: owned.factsDigest });
            return next;
        });
    }
    bindingFor(owned, payload, identities) {
        const binding = structuredClone(owned.binding);
        binding.sourceDigests = payload.research?.selectedSources.map(({ sourceId, contentHash }) => ({ sourceId, contentHash })) ?? [];
        if (binding.sourceDigests.some(s => !owned.intents.some(i => i.research?.sources.some(v => v.sourceId === s.sourceId && v.contentHash === s.contentHash))))
            (0, database_1.reject)('STALE_CONTEXT', 'Checkpoint research is not in the accepted owned intents.', 'RESEARCH');
        if ('envelope' in payload)
            binding.envelopeDigest = (0, database_1.hash)('scheduling-envelope', payload.envelope);
        if ('allocation' in payload) {
            const compiled = (0, compilation_1.compileExecution)(payload, owned.compilationTargets, owned.liveSpecs, identities);
            for (const target of binding.targets)
                target.context = compiled.find(p => p.planRef === target.planRef).context;
        }
        return binding;
    }
    async originals(sql, ownerId, specs) {
        const keys = specs.map(s => s.activityKey), expected = new Map(specs.map(s => [s.activityKey, (0, context_2.specDigest)(s)]));
        const found = new Map();
        if (!keys.length)
            return found;
        const revisions = await (0, database_1.rows)(sql, `SELECT r.id FROM "PlannerRevision" r JOIN "PlannerPlan" p ON p.id=r."planId" WHERE p."userId"=$1 AND r."schemaVersion"=2 AND EXISTS (SELECT 1 FROM jsonb_array_elements(r."v2Artifact"->'executable') s WHERE s->>'activityKey'=ANY($2::text[])) ORDER BY r."createdAt" DESC,r.id`, [ownerId, keys]);
        for (const row of revisions) {
            if (found.size === keys.length)
                break;
            const revision = await (0, revisions_1.loadRevision)(sql, ownerId, row.id);
            for (const spec of revision.executable)
                if (expected.get(spec.activityKey) === (0, context_2.specDigest)(spec) && !found.has(spec.activityKey)) {
                    const activity = revision.blueprint.activities.find(a => a.localId === spec.blueprintActivityId);
                    if (activity)
                        found.set(spec.activityKey, { activity, phases: revision.blueprint.strategy.phases });
                }
        }
        return found;
    }
    async run(token, signal) {
        signal.throwIfAborted();
        const attempt = await this.attempts.read(token.ownerId, token.attemptId);
        if (!['PLAN', 'REPLAN', 'JOINT'].includes(attempt.kind))
            (0, database_1.reject)('INTENT_CONFLICT', 'This operation does not authorize learning generation.', 'PREFLIGHT');
        if (attempt.acceptedRequest.researchRequested && attempt.targets.some(t => !t.resolvedIntentVersionId))
            (0, database_1.reject)('INTENT_CONFLICT', 'Authorized research must be verified/adopted by Step 3 before learning generation.', 'PREFLIGHT');
        if (attempt.targets.every(t => !t.resolvedIntentVersionId))
            await new revisions_1.RevisionService(this.attempts).resolveUnchanged(token);
        const owned = await this.capture(token);
        let checkpoint = owned.checkpoint;
        const save = async (payload, adaptations = checkpoint?.adaptations ?? 0) => {
            signal.throwIfAborted();
            const bound = { ...owned.binding, envelopeDigest: (0, database_1.hash)('scheduling-envelope', 'envelope' in payload ? payload.envelope : owned.envelope) };
            const next = checkpoint_1.CompilerCheckpointSchema.parse({ schemaVersion: 2, compilerVersion: 1, binding: bound, adaptations, repairs: 0, repairIssueIds: [], payload });
            await this.attempts.mutate(token, async (sql, current, stored, now) => {
                const plans = [];
                for (const t of current.targets)
                    plans.push(await (0, intents_1.ownedPlan)(sql, current.ownerId, t.planId));
                for (const t of current.targets) {
                    const intent = (await (0, intents_1.loadIntent)(sql, current.ownerId, t.resolvedIntentVersionId)).intent;
                    const context = await (0, context_2.loadExecutionContext)(sql, current.ownerId, plans, intent);
                    if (context.today !== owned.envelope.today || (0, context_2.contextInputDigest)(context.dependencies) !== t.contextDigest)
                        (0, database_1.reject)('STALE_CONTEXT', 'Execution facts changed while generating education.', 'PREFLIGHT');
                }
                await (0, attempts_1.persistAttempt)(sql, current, { ...current, stage: payload.stage, checkpoint: { stage: payload.stage, digest: (0, database_1.hash)('checkpoint', next), persistedAt: now.toISOString() } }, { ...stored, checkpoint: next, learningFactsDigest: owned.factsDigest });
            });
            checkpoint = next;
            return next;
        };
        const meter = (0, provider_1.workerProviderMeter)(this.attempts, token);
        const input = { acceptedRequest: { text: owned.attempt.acceptedRequest.text, authorization: "PLAN_ACTION" }, plans: owned.targets, context: owned.view, envelope: owned.envelope, sharedDependencies: owned.sharedDependencies };
        if (!checkpoint)
            await save({ stage: 'PREFLIGHT', research: owned.research, envelope: owned.envelope });
        if (checkpoint.payload.stage === 'PREFLIGHT') {
            const response = await (0, blueprint_1.generateLearningBlueprint)(meter, input, signal, this.dependencies.provider);
            if (response.decision !== 'REVISE')
                (0, database_1.reject)('INVALID_OUTPUT', 'Initial blueprint missing.', 'BLUEPRINT');
            const envelope = learningEnvelope(owned.envelope, response.detail.days);
            const maximums = new Map(owned.targets.map(t => [t.planRef, (0, capacity_1.maximumNewTimebox)(envelope, owned.facts, t.planRef)]));
            const expanded = (0, blueprint_1.expandDeclaredSplits)(response.snapshot, envelope, response.kept, maximums);
            const planning = planning_1.PlanningSupportSchema.parse({ detail: response.detail, tradeOffExplanation: response.tradeOffExplanation, splits: expanded.splits, unreviewedPhaseRefs: response.unreviewedPhaseRefs, forecasts: [], adaptation: 'NOT_REQUESTED' });
            await save({ stage: 'BLUEPRINT', research: owned.research, envelope, blueprints: expanded.snapshot, planning });
        }
        if (checkpoint.payload.stage === 'BLUEPRINT') {
            const p = checkpoint.payload;
            const report = (0, allocator_1.allocateLearning)(p.blueprints, p.envelope, owned.facts, { maximumSearchNodes: this.dependencies.maximumSearchNodes });
            const planning = p.planning;
            // The forecast uses all 365 owned calendar days; the detailed selector must
            // never truncate the strategic forecast to the booked segment.
            planning.forecasts = (0, forecast_1.forecastLearning)(p.blueprints, report, this.forecastEnvelope(owned.forecastEnvelope, planning.recoveryAdjustment), owned.forecastFacts, planning.unreviewedPhaseRefs);
            await save({ ...p, stage: 'ALLOCATION', planning, allocation: { report, digest: (0, database_1.hash)('allocation', report) } });
        }
        if (checkpoint.payload.stage === 'ALLOCATION' && checkpoint.adaptations === 0) {
            const p = checkpoint.payload;
            if (p.allocation.report.status !== 'FEASIBLE' || p.allocation.report.findings.some(f => f.consequential))
                await save({ ...p, stage: 'ADAPTATION', planning: { ...p.planning, adaptation: 'PENDING' } }, 1);
        }
        if (checkpoint.payload.stage === 'ADAPTATION') {
            if (owned.dispatchedAdaptation)
                (0, database_1.reject)('PROVIDER_FAILURE', 'The single adaptation was dispatched without a durable accepted result. Use an explicit linked retry; it cannot be repeated on takeover.', 'ADAPTATION');
            const p = checkpoint.payload;
            let bindingConstraints = [];
            const explained = (0, allocator_1.allocateLearning)(p.blueprints, p.envelope, owned.facts, { maximumSearchNodes: this.dependencies.maximumSearchNodes, onBindingConstraints: constraints => { bindingConstraints = constraints; } });
            if ((0, database_1.hash)('allocation', explained) !== p.allocation.digest)
                (0, database_1.reject)('STALE_CONTEXT', 'Allocation facts changed before educational adaptation.', 'ADAPTATION');
            const response = await (0, blueprint_1.generateLearningBlueprint)(meter, { ...input, envelope: p.envelope, previous: p.blueprints, feedback: p.allocation.report, bindingConstraints, splitReceipts: p.planning?.splits }, signal, this.dependencies.provider, true);
            if (response.decision === 'KEEP') {
                const report = (0, allocator_1.allocateLearning)(p.blueprints, p.envelope, owned.facts, { maximumSearchNodes: this.dependencies.maximumSearchNodes });
                await save({ ...p, stage: 'ALLOCATION', allocation: { report, digest: (0, database_1.hash)('allocation', report) }, planning: { ...p.planning, adaptation: 'KEPT', adaptationReason: response.reason } }, 1);
            }
            else {
                const envelope = learningEnvelope(owned.envelope, response.detail.days, response.recoveryAdjustment);
                const expanded = (0, blueprint_1.expandDeclaredSplits)(response.snapshot, envelope, response.kept, new Map(owned.targets.map(t => [t.planRef, (0, capacity_1.maximumNewTimebox)(envelope, owned.facts, t.planRef)])));
                const planning = { detail: response.detail, tradeOffExplanation: response.tradeOffExplanation, recoveryAdjustment: response.recoveryAdjustment, splits: expanded.splits, unreviewedPhaseRefs: response.unreviewedPhaseRefs, forecasts: [], adaptation: 'REVISED' };
                await save({ stage: 'BLUEPRINT', research: owned.research, envelope, blueprints: expanded.snapshot, planning }, 1);
                const report = (0, allocator_1.allocateLearning)(expanded.snapshot, envelope, owned.facts, { maximumSearchNodes: this.dependencies.maximumSearchNodes });
                planning.forecasts = (0, forecast_1.forecastLearning)(expanded.snapshot, report, this.forecastEnvelope(owned.forecastEnvelope, response.recoveryAdjustment), owned.forecastFacts, planning.unreviewedPhaseRefs);
                await save({ stage: 'ALLOCATION', research: owned.research, envelope, blueprints: expanded.snapshot, allocation: { report, digest: (0, database_1.hash)('allocation', report) }, planning }, 1);
            }
        }
        const result = checkpoint;
        if (result.payload.stage !== 'ALLOCATION')
            (0, database_1.reject)('INVALID_OUTPUT', 'Step 4 can resume only its learning/allocation checkpoints.', 'ALLOCATION');
        if (result.payload.allocation.report.status !== 'FEASIBLE')
            await this.attempts.needsDecision(token, `${result.payload.allocation.report.status === 'CAPACITY_SHORTFALL' ? 'The required work exceeds the capacity available within the selected dates.' : 'I could not place all required work while preserving its prerequisites, learning windows and existing commitments.'} ${result.payload.allocation.report.capacityProof?.explanation ?? 'This does not establish an impossible deadline.'} Choose whether to adjust the learning strategy or your available time.`.slice(0, 1000));
        return result;
    }
    forecastEnvelope(owned, adjustment) {
        if (!adjustment)
            return owned;
        return scheduling_1.SchedulingEnvelopeSchema.parse({ ...owned, recoveryPercent: adjustment.percent, days: owned.days.map(d => { const recoveryMinutes = Math.ceil(d.ceilingMinutes * adjustment.percent / 100); return { ...d, recoveryMinutes, availableMinutes: d.excluded ? 0 : Math.max(0, d.ceilingMinutes - d.otherCommittedMinutes - d.protectedTargetMinutes - recoveryMinutes) }; }) });
    }
}
exports.LearningCompilerService = LearningCompilerService;
