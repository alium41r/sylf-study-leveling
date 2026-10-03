"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceService = void 0;
const contracts_1 = require("../contracts");
const database_1 = require("./database");
const intents_1 = require("./intents");
const attempts_1 = require("./attempts");
const revisions_1 = require("./revisions");
const context_1 = require("./context");
const execution_validation_1 = require("./execution-validation");
const summary = (revision, version) => ({
    revisionId: revision.revisionId, resolvedIntentVersionId: revision.resolvedIntentVersionId, resolvedPlanningVersion: version,
    digest: revision.digest, title: revision.blueprint.strategy.outcome, policy: revision.blueprint.strategy.policy,
    recommendedEffort: revision.blueprint.strategy.recommendedEffort,
    committedMinutes: revision.executable.reduce((sum, spec) => sum + spec.effort.remainingMinutesEstimate, 0),
    primaryFinishDate: revision.executable.length ? revision.executable.map(spec => spec.placement.date).sort().at(-1) : null,
});
function liveSummary(active, planId, context) {
    if (!context)
        return;
    const open = context.quests.filter(quest => quest.plannerSpec &&
        quest.plannerSpec.planId === planId && quest.status !== "COMPLETED" && quest.remainingDisposition === "OPEN");
    active.committedMinutes = open.reduce((sum, quest) => sum + (0, context_1.liveExecution)(quest, context.sessions).remainingMinutesEstimate, 0);
    active.primaryFinishDate = open.length ? open.map(quest => quest.scheduledFor).sort().at(-1) : null;
}
/** One owned derived projection; neither this view nor its allowedActions grant
 * mutation authority. Apply and execution always recheck live facts. */
class WorkspaceService {
    db;
    constructor(db) {
        this.db = db;
    }
    async read(ownerId, planId) {
        return this.db.coordinated(ownerId, async (sql) => {
            const plan = await (0, intents_1.ownedPlan)(sql, ownerId, planId);
            if (plan.contractVersion !== 2 || !plan.workingIntentVersionId)
                (0, database_1.reject)("INTENT_CONFLICT", "This legacy plan needs reviewed adoption before opening its V2 workspace.");
            const intent = await (0, intents_1.loadIntent)(sql, ownerId, plan.workingIntentVersionId);
            let context = null;
            let scheduleHealth = plan.activeRevisionId ? "HEALTHY" : "NOT_SCHEDULED";
            let requiresReestimate = false;
            try {
                context = await (0, context_1.loadExecutionContext)(sql, ownerId, [plan], intent.intent);
                requiresReestimate = context.requiresReestimate;
                if (context.legacyExceptions.length || requiresReestimate)
                    scheduleHealth = "UPDATE_SUGGESTED";
            }
            catch (error) {
                if (!(error instanceof database_1.DurablePlannerError))
                    throw error;
                scheduleHealth = "CONFLICT";
            }
            let active = null;
            if (plan.activeRevisionId) {
                const row = (await (0, database_1.rows)(sql, 'SELECT "v2Artifact","baseVersion" FROM "PlannerRevision" WHERE id=$1 AND "planId"=$2 AND "confirmedAt" IS NOT NULL', [plan.activeRevisionId, planId]))[0];
                if (!row)
                    (0, database_1.reject)("INVALID_OUTPUT", "The active pointer has no confirmed owned revision.");
                if (row.v2Artifact) {
                    const revision = await (0, revisions_1.loadRevision)(sql, ownerId, plan.activeRevisionId);
                    active = summary(revision, row.baseVersion);
                    if (context)
                        try {
                            (0, context_1.verifyPlacement)(context, [{ plan, intent: (await (0, intents_1.loadIntent)(sql, ownerId, revision.resolvedIntentVersionId)).intent, specs: revision.executable }]);
                        }
                        catch (error) {
                            if (!(error instanceof database_1.DurablePlannerError))
                                throw error;
                            scheduleHealth = "UPDATE_SUGGESTED";
                        }
                }
                else {
                    // Imported live baselines are explicitly legacy/unreviewed. No V2
                    // quality report or fabricated educational blueprint is created.
                    const migration = plan.migrationEvidence;
                    if (!migration?.baselineDigest || !migration.baselineSpecs)
                        (0, database_1.reject)("INVALID_OUTPUT", "The imported active baseline is unavailable.");
                    const minutes = migration.baselineSpecs.reduce((sum, spec) => sum + spec.effort.remainingMinutesEstimate, 0);
                    const importedIntent = await (0, intents_1.loadIntent)(sql, ownerId, migration.receipt?.intentVersionId ?? intent.intentVersionId);
                    active = { revisionId: plan.activeRevisionId, resolvedIntentVersionId: importedIntent.intentVersionId, resolvedPlanningVersion: row.baseVersion,
                        digest: migration.baselineDigest, title: importedIntent.intent.title, policy: importedIntent.intent.policy,
                        recommendedEffort: { lowMinutes: minutes, likelyMinutes: minutes, highMinutes: minutes }, committedMinutes: minutes,
                        primaryFinishDate: migration.baselineSpecs.length ? migration.baselineSpecs.map(spec => spec.placement.date).sort().at(-1) : null };
                }
                liveSummary(active, planId, context);
            }
            const latest = (await (0, database_1.rows)(sql, `SELECT artifact FROM "PlannerAttempt" WHERE "userId"=$1
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(artifact->'targets') t WHERE t->>'planId'=$2)
        ORDER BY "createdAt" DESC,id DESC LIMIT 1`, [ownerId, planId]))[0];
            const operation = latest ? contracts_1.PlannerAttemptV2Schema.parse(latest.artifact) : null;
            const attempt = operation && operation.kind !== "RESEARCH_ADVICE" ? { attemptId: operation.attemptId, kind: operation.kind, state: operation.state, stage: operation.stage,
                error: operation.error, question: operation.question, requestedAt: operation.requestedAt } : null;
            let candidate = null;
            if (plan.latestDraftRevisionId) {
                const revision = await (0, revisions_1.loadRevision)(sql, ownerId, plan.latestDraftRevisionId);
                const result = await (0, attempts_1.loadAttempt)(sql, ownerId, revision.attemptId);
                const changeSet = contracts_1.PlanChangeSetV2Schema.parse(result.payload.changeSet);
                const target = changeSet.targets.find(target => target.planId === planId);
                const reasons = [];
                try {
                    if (result.attempt.applyReceipt)
                        (0, database_1.reject)("STALE_CONTEXT", "This proposal has already been confirmed.");
                    await (0, attempts_1.assertAttemptCurrent)(sql, result.attempt);
                    const plans = [];
                    const revisions = [];
                    const targets = [];
                    for (const selected of [...changeSet.targets].sort((a, b) => a.planId.localeCompare(b.planId))) {
                        const selectedPlan = await (0, intents_1.ownedPlan)(sql, ownerId, selected.planId);
                        if (selectedPlan.latestDraftRevisionId !== selected.revisionId)
                            (0, database_1.reject)("STALE_CONTEXT", "Another selected plan has a newer candidate.");
                        plans.push(selectedPlan);
                        revisions.push(await (0, revisions_1.loadRevision)(sql, ownerId, selected.revisionId));
                    }
                    for (const sealed of revisions) {
                        const accepted = await (0, intents_1.loadIntent)(sql, ownerId, sealed.resolvedIntentVersionId);
                        const fresh = await (0, context_1.loadExecutionContext)(sql, ownerId, plans, accepted.intent);
                        (0, context_1.verifyContextCorrespondence)(sealed.context, fresh.dependencies, fresh.quests);
                        targets.push({ plan: plans.find(plan => plan.id === sealed.planId), intent: accepted.intent, specs: sealed.executable });
                    }
                    const fresh = await (0, context_1.loadExecutionContext)(sql, ownerId, plans, targets[0].intent);
                    (0, context_1.verifyPlacement)(fresh, targets);
                    (0, execution_validation_1.verifyExecutionGraph)(fresh, revisions);
                }
                catch (error) {
                    if (!(error instanceof database_1.DurablePlannerError))
                        throw error;
                    reasons.push(error.detail.message);
                    if (error.detail.code === "SCHEDULE_CONFLICT")
                        scheduleHealth = "CONFLICT";
                }
                candidate = { ...summary(revision, target.resolvedPlanningVersion), attemptId: revision.attemptId, changeSetId: changeSet.changeSetId,
                    confirmed: false, freshness: reasons.length ? "STALE" : "CURRENT", staleReasons: reasons, qualityStatus: "PASSED" };
            }
            let phase = "READY";
            let nextAction = "GENERATE";
            let allowedActions = ["GENERATE", "ADVICE", "ARCHIVE"];
            if (active) {
                phase = "IDLE";
                nextAction = "STUDY";
                allowedActions = ["STUDY", "UPDATE", "ADVICE", "ARCHIVE"];
            }
            if (intent.intent.unresolvedQuestions.length && !active) {
                phase = "INTAKE";
                nextAction = "ANSWER";
                allowedActions = ["ANSWER", "ADVICE", "ARCHIVE"];
            }
            if (attempt && ["QUEUED", "RUNNING"].includes(attempt.state)) {
                phase = "PLANNING";
                nextAction = "WAIT";
                allowedActions = ["CANCEL", "ADVICE", "ARCHIVE"];
            }
            else if (attempt?.state === "NEEDS_DECISION") {
                phase = "NEEDS_DECISION";
                nextAction = "ANSWER";
                allowedActions = ["ANSWER", "CANCEL", "ADVICE", "ARCHIVE"];
            }
            else if (candidate) {
                if (candidate.freshness === "CURRENT" && !requiresReestimate) {
                    phase = "REVIEW";
                    nextAction = "REVIEW";
                    allowedActions = ["REVIEW", "CONFIRM", "GENERATE", "ADVICE", "ARCHIVE"];
                }
                else {
                    phase = "UPDATE_REQUIRED";
                    nextAction = "UPDATE";
                    allowedActions = ["UPDATE", "ADVICE", "ARCHIVE"];
                }
            }
            else if (attempt?.state === "FAILED") {
                phase = "RECOVERY";
                nextAction = "RETRY";
                allowedActions = ["RETRY", "ADVICE", "ARCHIVE"];
            }
            else if (active && scheduleHealth !== "HEALTHY") {
                phase = "UPDATE_REQUIRED";
                nextAction = "UPDATE";
            }
            if (["ARCHIVED", "COMPLETED"].includes(plan.state)) {
                phase = "IDLE";
                nextAction = "NONE";
                allowedActions = ["ADVICE"];
                candidate = null;
            }
            return contracts_1.PlannerWorkspaceV2Schema.parse({ schemaVersion: 2, planId, ownerId, planState: plan.state, planningVersion: plan.version, conversationVersion: plan.conversationVersion,
                workingIntentVersionId: plan.workingIntentVersionId, phase, active, candidate, attempt, scheduleHealth, requiresReestimate, locallyDirty: false, nextAction, allowedActions });
        });
    }
}
exports.WorkspaceService = WorkspaceService;
