"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RevisionService = exports.qualityEvidenceDigest = exports.educationalDigest = exports.revisionDigest = void 0;
exports.loadRevision = loadRevision;
const contracts_1 = require("../contracts");
const database_1 = require("./database");
const attempts_1 = require("./attempts");
const intents_1 = require("./intents");
const context_1 = require("./context");
const execution_validation_1 = require("./execution-validation");
const revisionDigest = (revision) => {
    return (0, database_1.hash)("revision", Object.fromEntries(Object.entries(revision).filter(([key]) => key !== "digest")));
};
exports.revisionDigest = revisionDigest;
const educationalDigest = (revision) => (0, database_1.hash)("educational-content", { blueprint: revision.blueprint, externalDependencies: revision.context.externalActivityDependencies });
exports.educationalDigest = educationalDigest;
const qualityEvidenceDigest = (intent) => (0, database_1.hash)("quality-evidence", { evidence: intent.evidence, research: intent.research ?? null });
exports.qualityEvidenceDigest = qualityEvidenceDigest;
async function loadRevision(sql, ownerId, revisionId) {
    const row = (await (0, database_1.rows)(sql, 'SELECT r."v2Artifact" FROM "PlannerRevision" r JOIN "PlannerPlan" p ON p.id=r."planId" WHERE r.id=$1::uuid AND p."userId"=$2', [revisionId, ownerId]))[0];
    if (!row?.v2Artifact)
        (0, database_1.reject)("REFERENCE_NOT_OWNED", "A sealed V2 revision is unavailable.");
    const artifact = contracts_1.PlannerRevisionV2Schema.parse(row.v2Artifact);
    if (artifact.digest !== (0, exports.revisionDigest)(artifact))
        (0, database_1.reject)("INVALID_OUTPUT", "The sealed revision failed its integrity check.");
    return artifact;
}
/** Only trusted worker orchestration calls this. No public client may attest quality. */
class RevisionService {
    attempts;
    constructor(attempts) {
        this.attempts = attempts;
    }
    /** Trusted retrieval/orchestration supplies verified evidence. This method
     * provides only durable adoption/currentness; it does not perform research. */
    async resolveResearch(token, proposed) {
        const derived = proposed.map(value => ({ planId: value.planId, intent: contracts_1.CanonicalIntentV2Schema.parse(value.intent) }));
        const adoptionDigest = (0, database_1.hash)("research-adoption", [...derived].sort((a, b) => a.planId.localeCompare(b.planId)));
        await this.attempts.mutate(token, async (sql, attempt, payload) => {
            if (attempt.kind === "RESEARCH_ADVICE" || !attempt.acceptedRequest.researchRequested || attempt.budget.profile !== "RESEARCH")
                (0, database_1.reject)("INTENT_CONFLICT", "Research adoption was not authorized by this planning request.", "RESEARCH");
            if (payload.researchAdoptionDigest) {
                if (payload.researchAdoptionDigest !== adoptionDigest)
                    (0, database_1.reject)("IDEMPOTENCY_MISMATCH", "Research was already adopted from different findings.", "RESEARCH");
                return;
            }
            if (derived.length !== attempt.targets.length || new Set(derived.map(value => value.planId)).size !== derived.length || attempt.targets.some(target => !derived.some(value => value.planId === target.planId) || target.resolvedIntentVersionId))
                (0, database_1.reject)("INTENT_CONFLICT", "Research resolution must bind every selected target once.", "RESEARCH");
            const plans = [];
            for (const target of [...attempt.targets].sort((a, b) => a.planId.localeCompare(b.planId)))
                plans.push(await (0, intents_1.ownedPlan)(sql, attempt.ownerId, target.planId));
            const bindings = [];
            for (const target of attempt.targets) {
                const plan = plans.find(plan => plan.id === target.planId);
                const previous = await (0, intents_1.loadIntent)(sql, attempt.ownerId, target.requestedIntentVersionId);
                const next = derived.find(value => value.planId === target.planId).intent;
                const unchangedFacts = (intent) => Object.fromEntries(Object.entries(intent).filter(([key]) => !["scope", "research", "assessment"].includes(key)));
                if ((0, database_1.hash)("research-protected-facts", unchangedFacts(previous.intent)) !== (0, database_1.hash)("research-protected-facts", unchangedFacts(next)))
                    (0, database_1.reject)("INTENT_CONFLICT", "Research cannot change deadlines, availability, goals, preferences or learning history.", "RESEARCH");
                for (const [key, value] of Object.entries(previous.intent.assessment ?? {}))
                    if (Reflect.get(next.assessment ?? {}, key) !== value)
                        (0, database_1.reject)("INTENT_CONFLICT", "Research conflicts with the accepted assessment identity; ask the student first.", "RESEARCH");
                for (const excluded of previous.intent.scope.filter(scope => scope.inclusion === "EXCLUDED"))
                    if (!next.scope.some(scope => scope.scopeKey === excluded.scopeKey && scope.inclusion === "EXCLUDED"))
                        (0, database_1.reject)("INTENT_CONFLICT", "Research cannot undo an explicit scope exclusion.", "RESEARCH");
                if (!next.research)
                    (0, database_1.reject)("INVALID_OUTPUT", "Research adoption requires its provenance bundle.", "RESEARCH");
                const artifact = await (0, intents_1.appendIntent)(sql, plan, next, "RESEARCH_ADOPTION");
                await sql.query('UPDATE "PlannerPlan" SET version=version+1 WHERE id=$1', [plan.id]);
                bindings.push({ ...target, resolvedIntentVersionId: artifact.intentVersionId, resolution: "RESEARCH_ADOPTION", resolvedPlanningVersion: target.planningVersion + 1 });
            }
            const refreshedPlans = [];
            for (const plan of plans)
                refreshedPlans.push(await (0, intents_1.ownedPlan)(sql, attempt.ownerId, plan.id));
            const targets = [];
            for (const target of bindings) {
                const next = derived.find(value => value.planId === target.planId).intent;
                const context = await (0, context_1.loadExecutionContext)(sql, attempt.ownerId, refreshedPlans, next);
                targets.push({ ...target, contextDigest: (0, context_1.contextInputDigest)(context.dependencies) });
            }
            await (0, attempts_1.persistAttempt)(sql, attempt, { ...attempt, targets }, { ...payload, researchAdoptionDigest: adoptionDigest });
        });
    }
    async publishResearchAnswer(token, answer, evidence) {
        const bundle = contracts_1.ResearchEvidenceV2Schema.parse(evidence);
        if (bundle.sources.some(source => source.location.kind === "OWNED_DOCUMENT"))
            (0, database_1.reject)("REFERENCE_NOT_OWNED", "Verified document storage is required before publishing uploaded research.", "RESEARCH");
        await this.attempts.mutate(token, async (sql, attempt, payload) => {
            if (attempt.kind !== "RESEARCH_ADVICE")
                (0, database_1.reject)("INTENT_CONFLICT", "This operation was authorized to prepare a plan, not publish a research answer.", "RESEARCH");
            await (0, attempts_1.persistAttempt)(sql, attempt, { ...attempt, state: "SUCCEEDED", stage: "RESEARCH", lease: null,
                result: { kind: "RESEARCH_ANSWER", answer, evidenceDigest: (0, database_1.hash)("research-evidence", bundle) } }, { ...payload, researchEvidence: bundle });
        });
    }
    async resolveUnchanged(token) {
        await this.attempts.mutate(token, async (sql, attempt, payload) => {
            if (attempt.kind === "RESEARCH_ADVICE")
                (0, database_1.reject)("INTENT_CONFLICT", "Read-only research cannot bind educational targets.", "RESEARCH");
            const plans = [];
            for (const target of [...attempt.targets].sort((a, b) => a.planId.localeCompare(b.planId)))
                plans.push(await (0, intents_1.ownedPlan)(sql, attempt.ownerId, target.planId));
            const targets = [];
            for (const target of attempt.targets) {
                const intent = await (0, intents_1.loadIntent)(sql, attempt.ownerId, target.requestedIntentVersionId);
                const context = await (0, context_1.loadExecutionContext)(sql, attempt.ownerId, plans, intent.intent);
                const resolved = { ...target, resolvedIntentVersionId: target.requestedIntentVersionId, resolution: "UNCHANGED", resolvedPlanningVersion: target.planningVersion,
                    contextDigest: (0, context_1.contextInputDigest)(context.dependencies) };
                if (target.resolvedIntentVersionId && JSON.stringify(target) !== JSON.stringify(resolved))
                    (0, database_1.reject)("STALE_CONTEXT", "This operation is already bound to a different context.");
                targets.push(resolved);
            }
            await (0, attempts_1.persistAttempt)(sql, attempt, { ...attempt, targets }, payload);
        });
    }
    async publish(token, rawRevisions, rawChangeSet) {
        const revisions = rawRevisions.map(raw => contracts_1.PlannerRevisionV2Schema.parse(raw));
        const changeSet = contracts_1.PlanChangeSetV2Schema.parse(rawChangeSet);
        return this.attempts.mutate(token, async (sql, attempt, payload) => {
            const successful = { ...attempt, state: "SUCCEEDED", stage: "PERSISTENCE", lease: null,
                result: { kind: "REVISIONS", revisions: revisions.map(revision => ({ planId: revision.planId, revisionId: revision.revisionId, digest: revision.digest })) } };
            const errors = (0, contracts_1.validateChangeSetCorrespondenceV2)(changeSet, successful, revisions);
            if (errors.length || changeSet.applyReceipt)
                (0, database_1.reject)("INVALID_OUTPUT", errors.join("; ") || "A new proposal cannot have an apply receipt.");
            const plans = [];
            for (const target of [...attempt.targets].sort((a, b) => a.planId.localeCompare(b.planId)))
                plans.push(await (0, intents_1.ownedPlan)(sql, attempt.ownerId, target.planId));
            for (const revision of revisions) {
                const target = attempt.targets.find(target => target.planId === revision.planId);
                const intent = (await (0, intents_1.loadIntent)(sql, attempt.ownerId, revision.resolvedIntentVersionId)).intent;
                const context = await (0, context_1.loadExecutionContext)(sql, attempt.ownerId, plans, intent);
                if (target.contextDigest !== (0, context_1.contextInputDigest)(revision.context))
                    (0, database_1.reject)("STALE_CONTEXT", "The proposal belongs to a different operation context.");
                (0, context_1.verifyContextCorrespondence)(revision.context, context.dependencies, context.quests);
                const referenceErrors = (0, contracts_1.validateBlueprintReferences)(revision.blueprint, {
                    scopeRefs: intent.scope.map(scope => scope.modelRef), excludedScopeRefs: intent.scope.filter(scope => scope.inclusion === "EXCLUDED").map(scope => scope.modelRef),
                    evidenceRefs: intent.evidence.map(evidence => evidence.evidenceId), resourceRefs: intent.research?.sources.map(source => source.sourceId) ?? [],
                    externalActivityRefs: revision.context.externalActivityDependencies.map(dependency => (0, context_1.externalActivityAlias)(dependency.activityKey)),
                });
                if (referenceErrors.length)
                    (0, database_1.reject)("REFERENCE_NOT_OWNED", referenceErrors.join("; "));
                for (const spec of revision.executable)
                    for (const resource of spec.content.resources) {
                        const source = intent.research?.sources.find(source => source.sourceId === resource.ref);
                        if (!source || resource.versionDigest !== source.contentHash)
                            (0, database_1.reject)("REFERENCE_NOT_OWNED", "An educational resource does not match its accepted owned source.");
                    }
                if (revision.digest !== (0, exports.revisionDigest)(revision) || revision.quality.educationalContentDigest !== (0, exports.educationalDigest)(revision) || revision.quality.evidenceDigest !== (0, exports.qualityEvidenceDigest)(intent))
                    (0, database_1.reject)("QUALITY_INCOMPLETE", "The quality review does not attest to this educational content and evidence.");
                const sequence = (await (0, database_1.rows)(sql, 'SELECT COALESCE(MAX(sequence),0)+1 AS sequence FROM "PlannerRevision" WHERE "planId"=$1', [revision.planId]))[0].sequence;
                await sql.query('INSERT INTO "PlannerRevision" (id,"planId",sequence,source,"baseRevisionId","baseVersion","schemaVersion","attemptId","requestedIntentVersionId","resolvedIntentVersionId","v2Artifact","inputSnapshot","availabilitySnapshot","outputSnapshot",digest,"operationKey","operationHash","operationState","sealedAt","updatedAt") VALUES ($1,$2,$3,\'GENERATE\',$4,$5,2,$6,$7,$8,$9,\'{}\',\'{}\',\'{}\',$10,$11,$12,\'SEALED\',$13,clock_timestamp())', [revision.revisionId, revision.planId, sequence, revision.baseActiveRevisionId, target.resolvedPlanningVersion, attempt.attemptId, revision.requestedIntentVersionId, revision.resolvedIntentVersionId, revision, revision.digest, attempt.idempotencyKey, attempt.requestHash, revision.sealedAt]);
                await sql.query('UPDATE "PlannerPlan" SET "latestDraftRevisionId"=$2,"updatedAt"=clock_timestamp() WHERE id=$1', [revision.planId, revision.revisionId]);
            }
            // All selected targets share one capacity check, including joint proposals.
            const targets = [];
            for (const revision of revisions)
                targets.push({ plan: plans.find(plan => plan.id === revision.planId), intent: (await (0, intents_1.loadIntent)(sql, attempt.ownerId, revision.resolvedIntentVersionId)).intent, specs: revision.executable });
            const context = await (0, context_1.loadExecutionContext)(sql, attempt.ownerId, plans, targets[0].intent);
            (0, context_1.verifyPlacement)(context, targets);
            (0, execution_validation_1.verifyExecutionGraph)(context, revisions);
            await (0, attempts_1.persistAttempt)(sql, attempt, successful, { ...payload, changeSet });
            return changeSet;
        });
    }
}
exports.RevisionService = RevisionService;
