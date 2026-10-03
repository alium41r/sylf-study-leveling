"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlannerAttemptV2Schema = exports.ProviderCallReservationV2Schema = exports.ApplyReceiptV2Schema = exports.AttemptTargetV2Schema = exports.RuntimeBudgetV2Schema = exports.PlannerErrorV2Schema = exports.PlannerStageV2Schema = void 0;
exports.validateAttemptTransition = validateAttemptTransition;
const zod_1 = require("zod");
const envelope_1 = require("./envelope");
const primitives_1 = require("./primitives");
exports.PlannerStageV2Schema = zod_1.z.enum([
    "INTAKE", "INTERPRETATION", "QUEUED", "RESEARCH", "PREFLIGHT", "BLUEPRINT", "ALLOCATION",
    "ADAPTATION", "REVIEW", "REPAIR", "VERIFICATION", "PERSISTENCE", "APPLY", "RECOVERY",
]);
exports.PlannerErrorV2Schema = zod_1.z.strictObject({
    schemaVersion: primitives_1.VersionV2Schema,
    code: zod_1.z.enum([
        "REFERENCE_NOT_OWNED", "PLAN_NOT_FOUND", "INTENT_CONFLICT", "IDEMPOTENCY_MISMATCH", "STALE_CONTEXT",
        "SCHEDULE_CONFLICT", "CAPACITY_SHORTFALL", "ALLOCATION_UNRESOLVED", "PROTECTED_EXECUTION",
        "QUALITY_BLOCKED", "QUALITY_INCOMPLETE", "PROVIDER_TIMEOUT", "PROVIDER_FAILURE", "OUTPUT_TRUNCATED",
        "INVALID_OUTPUT", "BUDGET_EXHAUSTED", "WORKER_UNAVAILABLE", "LEASE_EXPIRED", "SUPERSEDED",
        "CANCELLED", "PAYLOAD_TOO_LARGE", "SAVE_FAILED", "ALREADY_APPLIED",
    ]),
    stage: exports.PlannerStageV2Schema,
    message: primitives_1.SummaryV2Schema,
    retryable: zod_1.z.boolean(),
    resumable: zod_1.z.boolean(),
    fieldRefs: zod_1.z.array(zod_1.z.string().min(1).max(200)).max(60),
    activityRefs: zod_1.z.array(primitives_1.LocalIdV2Schema).max(envelope_1.PLANNER_V2_ENVELOPE.newlyDetailedActivities),
    dates: zod_1.z.array(primitives_1.DateV2Schema).max(envelope_1.PLANNER_V2_ENVELOPE.newlyDetailedActivities),
    recoveryAction: zod_1.z.enum([
        "RETRY_STAGE", "REFRESH_PLACEMENT", "REVIEW_CHANGED_INTENT", "ANSWER_QUESTION", "RESOLVE_CONFLICT",
        "OPEN_ACTIVE_PLAN", "WAIT_FOR_WORKER", "NONE",
    ]),
    traceId: primitives_1.DurableIdV2Schema,
});
exports.RuntimeBudgetV2Schema = zod_1.z.strictObject({
    rootRequestId: primitives_1.DurableIdV2Schema,
    profile: zod_1.z.enum(["ADVICE", "CALENDAR_ONLY", "EDUCATIONAL", "RESEARCH"]),
    foregroundProcessingMs: zod_1.z.number().int().nonnegative(),
    processingStartedAt: primitives_1.InstantV2Schema.nullable(),
    executionDeadlineAt: primitives_1.InstantV2Schema.nullable(),
    consumed: zod_1.z.strictObject({
        modelCalls: zod_1.z.number().int().nonnegative(),
        inputTokens: zod_1.z.number().int().nonnegative(),
        outputTokens: zod_1.z.number().int().nonnegative(),
        planningCalls: zod_1.z.number().int().min(0).max(5),
        researchSynthesisCalls: zod_1.z.number().int().min(0).max(2),
        researchQueries: zod_1.z.number().int().min(0).max(envelope_1.PLANNER_V2_ENVELOPE.researchQueries),
        fetchAttempts: zod_1.z.number().int().min(0).max(envelope_1.PLANNER_V2_ENVELOPE.fetchAttempts),
        selectedSourceCharacters: zod_1.z.number().int().min(0).max(envelope_1.PLANNER_V2_ENVELOPE.sourceCharacters),
        extractedPages: zod_1.z.number().int().min(0).max(envelope_1.PLANNER_V2_ENVELOPE.extractedPages),
        ocrPages: zod_1.z.number().int().min(0).max(envelope_1.PLANNER_V2_ENVELOPE.ocrPages),
        followUps: zod_1.z.number().int().min(0).max(envelope_1.PLANNER_V2_ENVELOPE.followUps),
    }),
    reserved: zod_1.z.strictObject({
        modelCalls: zod_1.z.number().int().nonnegative(),
        inputTokens: zod_1.z.number().int().nonnegative(),
        outputTokens: zod_1.z.number().int().nonnegative(),
    }),
}).superRefine((budget, ctx) => {
    const limit = envelope_1.PLANNER_V2_BUDGETS[budget.profile];
    if (budget.foregroundProcessingMs > limit.executionSeconds * 1000)
        (0, primitives_1.issue)(ctx, ["foregroundProcessingMs"], "Foreground processing exceeds the execution budget");
    for (const field of ["modelCalls", "inputTokens", "outputTokens"]) {
        const hasReservation = Object.values(budget.reserved).some(value => value > 0);
        // Actual provider usage may exceed its estimate; retain that fact in a terminal
        // failure rather than making truthful accounting impossible to serialize.
        if ((field === "modelCalls" || hasReservation) && budget.consumed[field] + budget.reserved[field] > limit[field])
            (0, primitives_1.issue)(ctx, ["consumed", field], "ROOT_BUDGET_EXHAUSTED");
    }
    if (budget.consumed.planningCalls + budget.consumed.researchSynthesisCalls > budget.consumed.modelCalls) {
        (0, primitives_1.issue)(ctx, ["consumed"], "Specialized calls are included in the root model-call counter");
    }
    if ((budget.processingStartedAt === null) !== (budget.executionDeadlineAt === null)) {
        (0, primitives_1.issue)(ctx, ["executionDeadlineAt"], "Processing start and deadline must be bound together");
    }
    if (budget.processingStartedAt && budget.executionDeadlineAt) {
        const duration = Date.parse(budget.executionDeadlineAt) - Date.parse(budget.processingStartedAt);
        if (duration <= 0 || duration > limit.executionSeconds * 1000 - budget.foregroundProcessingMs)
            (0, primitives_1.issue)(ctx, ["executionDeadlineAt"], "Execution deadline exceeds the selected root profile after foreground processing");
    }
});
exports.AttemptTargetV2Schema = zod_1.z.strictObject({
    planId: primitives_1.DurableIdV2Schema,
    requestedIntentVersionId: primitives_1.DurableIdV2Schema,
    resolvedIntentVersionId: primitives_1.DurableIdV2Schema.nullable(),
    resolution: zod_1.z.enum(["UNCHANGED", "RESEARCH_ADOPTION"]).nullable(),
    baseActiveRevisionId: primitives_1.DurableIdV2Schema.nullable(),
    sourceCandidateRevisionId: primitives_1.DurableIdV2Schema.nullable(),
    planningVersion: zod_1.z.number().int().nonnegative(),
    resolvedPlanningVersion: zod_1.z.number().int().nonnegative().nullable(),
    contextDigest: primitives_1.DigestV2Schema.nullable(),
}).superRefine((target, ctx) => {
    if ((target.resolvedIntentVersionId === null) !== (target.resolution === null))
        (0, primitives_1.issue)(ctx, ["resolution"], "Resolved identity and reason are bound together");
    if ((target.resolvedIntentVersionId === null) !== (target.resolvedPlanningVersion === null))
        (0, primitives_1.issue)(ctx, ["resolvedPlanningVersion"], "Resolved intent and planning version are bound atomically");
    if (target.resolution === "UNCHANGED" && target.resolvedIntentVersionId !== target.requestedIntentVersionId) {
        (0, primitives_1.issue)(ctx, ["resolvedIntentVersionId"], "Unchanged resolution must retain the requested identity");
    }
    if (target.resolution === "UNCHANGED" && target.resolvedPlanningVersion !== target.planningVersion)
        (0, primitives_1.issue)(ctx, ["resolvedPlanningVersion"], "Unchanged resolution keeps the requested planning version");
    if (target.resolution === "RESEARCH_ADOPTION" && target.resolvedPlanningVersion !== target.planningVersion + 1)
        (0, primitives_1.issue)(ctx, ["resolvedPlanningVersion"], "Atomic research adoption advances the planning version once");
    if (target.resolution === "RESEARCH_ADOPTION" && target.resolvedIntentVersionId === target.requestedIntentVersionId) {
        (0, primitives_1.issue)(ctx, ["resolvedIntentVersionId"], "Research adoption creates a derived intent version");
    }
});
exports.ApplyReceiptV2Schema = zod_1.z.strictObject({
    receiptId: primitives_1.DurableIdV2Schema,
    changeSetId: primitives_1.DurableIdV2Schema,
    confirmedAt: primitives_1.InstantV2Schema,
    targets: zod_1.z.array(zod_1.z.strictObject({ planId: primitives_1.DurableIdV2Schema, revisionId: primitives_1.DurableIdV2Schema, revisionDigest: primitives_1.DigestV2Schema })).min(1).max(envelope_1.PLANNER_V2_ENVELOPE.targets),
}).superRefine((receipt, ctx) => (0, primitives_1.unique)(receipt.targets.map(target => target.planId), ctx, ["targets"]));
/** Artifact on the existing accounting path; not a second queue or new entity. */
exports.ProviderCallReservationV2Schema = zod_1.z.strictObject({
    schemaVersion: primitives_1.VersionV2Schema, callId: primitives_1.DurableIdV2Schema, rootRequestId: primitives_1.DurableIdV2Schema,
    attemptId: primitives_1.DurableIdV2Schema.nullable(), fence: zod_1.z.number().int().nonnegative(), stage: exports.PlannerStageV2Schema,
    provider: zod_1.z.string().min(1).max(100), model: zod_1.z.string().min(1).max(100),
    reservedInputTokens: zod_1.z.number().int().nonnegative(), reservedOutputTokens: zod_1.z.number().int().nonnegative(),
    state: zod_1.z.enum(["RESERVED", "DISPATCHED", "SETTLED", "UNKNOWN_SPEND", "CANCELLED_BEFORE_DISPATCH"]),
    actualInputTokens: zod_1.z.number().int().nonnegative().nullable(), actualOutputTokens: zod_1.z.number().int().nonnegative().nullable(),
    costUsd: zod_1.z.number().nonnegative().nullable(), pricing: zod_1.z.enum(["KNOWN", "UNKNOWN"]),
    settlementKey: zod_1.z.string().min(8).max(100),
}).superRefine((call, ctx) => {
    if (call.pricing === "UNKNOWN" && call.costUsd !== null)
        (0, primitives_1.issue)(ctx, ["costUsd"], "Unknown pricing is never recorded as zero cost");
    if (call.state === "SETTLED" && (call.actualInputTokens === null || call.actualOutputTokens === null))
        (0, primitives_1.issue)(ctx, [], "Settled calls retain actual token usage even when pricing is unknown");
    if (call.state === "SETTLED" && call.pricing === "KNOWN" && call.costUsd === null)
        (0, primitives_1.issue)(ctx, ["costUsd"], "Known settled pricing retains the actual charge");
    if (call.state === "UNKNOWN_SPEND" && call.costUsd !== null)
        (0, primitives_1.issue)(ctx, ["costUsd"], "Unknown spend cannot pretend an actual charge is known");
    if (call.state === "CANCELLED_BEFORE_DISPATCH" && (call.actualInputTokens !== 0 || call.actualOutputTokens !== 0 || call.costUsd !== 0 || call.pricing !== "KNOWN"))
        (0, primitives_1.issue)(ctx, [], "A proven undispatched cancellation has zero spend");
});
exports.PlannerAttemptV2Schema = (0, envelope_1.withPlannerEnvelope)(zod_1.z.strictObject({
    schemaVersion: primitives_1.VersionV2Schema,
    attemptId: primitives_1.DurableIdV2Schema,
    ownerId: primitives_1.EntityIdV2Schema,
    kind: zod_1.z.enum(["PLAN", "REPLAN", "EXPAND", "JOINT", "RESEARCH_ADVICE"]),
    state: zod_1.z.enum(["QUEUED", "RUNNING", "NEEDS_DECISION", "SUCCEEDED", "FAILED", "CANCELLED", "SUPERSEDED"]),
    stage: exports.PlannerStageV2Schema,
    idempotencyKey: zod_1.z.string().min(8).max(100).regex(/^[A-Za-z0-9_-]+$/),
    requestHash: primitives_1.DigestV2Schema,
    requestedAt: primitives_1.InstantV2Schema,
    parentAttemptId: primitives_1.DurableIdV2Schema.nullable(),
    acceptedRequest: zod_1.z.strictObject({
        text: primitives_1.ProseV2Schema,
        authorization: zod_1.z.enum(["PLAN_ACTION", "RESEARCH_ONLY"]),
        researchRequested: zod_1.z.boolean(),
        targetAuthorizationDigest: primitives_1.DigestV2Schema,
    }),
    targets: zod_1.z.array(exports.AttemptTargetV2Schema).max(envelope_1.PLANNER_V2_ENVELOPE.targets),
    budget: exports.RuntimeBudgetV2Schema,
    fence: zod_1.z.number().int().nonnegative(),
    lease: zod_1.z.strictObject({ owner: zod_1.z.string().min(1).max(100), fence: zod_1.z.number().int().positive(), expiresAt: primitives_1.InstantV2Schema }).nullable(),
    checkpoint: zod_1.z.strictObject({ stage: exports.PlannerStageV2Schema, digest: primitives_1.DigestV2Schema, persistedAt: primitives_1.InstantV2Schema }).nullable(),
    question: primitives_1.SummaryV2Schema.nullable(),
    error: exports.PlannerErrorV2Schema.nullable(),
    result: zod_1.z.discriminatedUnion("kind", [
        zod_1.z.strictObject({ kind: zod_1.z.literal("RESEARCH_ANSWER"), answer: primitives_1.ProseV2Schema, evidenceDigest: primitives_1.DigestV2Schema }),
        zod_1.z.strictObject({
            kind: zod_1.z.literal("REVISIONS"),
            revisions: zod_1.z.array(zod_1.z.strictObject({ planId: primitives_1.DurableIdV2Schema, revisionId: primitives_1.DurableIdV2Schema, digest: primitives_1.DigestV2Schema })).min(1).max(envelope_1.PLANNER_V2_ENVELOPE.targets),
        }),
    ]).nullable(),
    applyReceipt: exports.ApplyReceiptV2Schema.nullable(),
}).superRefine((attempt, ctx) => {
    (0, primitives_1.unique)(attempt.targets.map(target => target.planId), ctx, ["targets"]);
    const readOnly = attempt.kind === "RESEARCH_ADVICE";
    const rootLimit = envelope_1.PLANNER_V2_BUDGETS[attempt.budget.profile];
    if ((attempt.budget.consumed.inputTokens > rootLimit.inputTokens || attempt.budget.consumed.outputTokens > rootLimit.outputTokens) &&
        !["FAILED", "CANCELLED", "SUPERSEDED"].includes(attempt.state))
        (0, primitives_1.issue)(ctx, ["budget"], "Actual token overrun must terminate before further work or publication");
    if (readOnly && (attempt.targets.length !== 0 || attempt.applyReceipt !== null || attempt.result?.kind === "REVISIONS" ||
        attempt.acceptedRequest.authorization !== "RESEARCH_ONLY" || attempt.budget.profile !== "RESEARCH")) {
        (0, primitives_1.issue)(ctx, [], "Read-only research has zero mutation targets, no revisions/receipt and a research budget");
    }
    if (readOnly && (attempt.budget.consumed.planningCalls > 0 || ["BLUEPRINT", "ALLOCATION", "ADAPTATION", "REPAIR", "APPLY"].includes(attempt.stage))) {
        (0, primitives_1.issue)(ctx, ["stage"], "Read-only research cannot run educational compilation or apply");
    }
    if (!readOnly && (attempt.targets.length === 0 || attempt.acceptedRequest.authorization !== "PLAN_ACTION" ||
        attempt.result?.kind === "RESEARCH_ANSWER" || attempt.budget.profile === "ADVICE"))
        (0, primitives_1.issue)(ctx, [], "Planning requires authorized Plan targets");
    if (attempt.kind === "JOINT" && attempt.targets.length !== 2)
        (0, primitives_1.issue)(ctx, ["targets"], "Joint planning requires two targets");
    if (attempt.kind !== "JOINT" && !readOnly && attempt.targets.length !== 1)
        (0, primitives_1.issue)(ctx, ["targets"], "Use the joint operation for two targets");
    if (attempt.state === "SUCCEEDED" && attempt.result === null)
        (0, primitives_1.issue)(ctx, ["result"], "Successful attempts require a durable result");
    if (attempt.state !== "SUCCEEDED" && attempt.result !== null)
        (0, primitives_1.issue)(ctx, ["result"], "Only successful attempts publish results");
    if (attempt.state === "FAILED" && attempt.error === null)
        (0, primitives_1.issue)(ctx, ["error"], "Failed attempts require specific recovery information");
    if (attempt.error && attempt.error.stage !== attempt.stage)
        (0, primitives_1.issue)(ctx, ["error", "stage"], "Failure and durable attempt stage must correspond");
    if (attempt.state === "NEEDS_DECISION" && attempt.question === null)
        (0, primitives_1.issue)(ctx, ["question"], "Decision-needed attempts require a material question");
    if (attempt.state === "RUNNING" && attempt.lease === null)
        (0, primitives_1.issue)(ctx, ["lease"], "Running attempts require a fenced lease");
    if (attempt.lease && attempt.lease.fence !== attempt.fence)
        (0, primitives_1.issue)(ctx, ["lease", "fence"], "Lease fence must match the durable attempt fence");
    if (attempt.state !== "RUNNING" && attempt.lease !== null)
        (0, primitives_1.issue)(ctx, ["lease"], "Only running attempts hold a lease");
    if (attempt.state !== "FAILED" && attempt.error !== null)
        (0, primitives_1.issue)(ctx, ["error"], "Only failed attempts carry a recovery error");
    if (attempt.state !== "NEEDS_DECISION" && attempt.question !== null)
        (0, primitives_1.issue)(ctx, ["question"], "Only decision-needed attempts carry a blocking question");
    const resolvedStages = ["BLUEPRINT", "ALLOCATION", "ADAPTATION", "REVIEW", "REPAIR", "VERIFICATION", "PERSISTENCE", "APPLY"];
    if (!readOnly && (resolvedStages.includes(attempt.stage) || attempt.state === "SUCCEEDED") &&
        attempt.targets.some(target => target.resolvedIntentVersionId === null || target.contextDigest === null)) {
        (0, primitives_1.issue)(ctx, ["targets"], "Educational work requires write-once resolved intent and pinned context");
    }
    if (attempt.result?.kind === "REVISIONS") {
        (0, primitives_1.unique)(attempt.result.revisions.map(revision => revision.planId), ctx, ["result", "revisions"]);
        const expected = [...attempt.targets.map(target => target.planId)].sort();
        if (JSON.stringify(expected) !== JSON.stringify(attempt.result.revisions.map(revision => revision.planId).sort())) {
            (0, primitives_1.issue)(ctx, ["result", "revisions"], "Results must cover exactly the selected targets");
        }
    }
    if (attempt.applyReceipt && (attempt.state !== "SUCCEEDED" || attempt.result?.kind !== "REVISIONS"))
        (0, primitives_1.issue)(ctx, ["applyReceipt"], "Only successful planning results can be applied");
    if (attempt.applyReceipt && attempt.result?.kind === "REVISIONS") {
        const revisions = new Map(attempt.result.revisions.map(revision => [revision.planId, revision]));
        if (attempt.applyReceipt.targets.length !== revisions.size || attempt.applyReceipt.targets.some(target => {
            const revision = revisions.get(target.planId);
            return !revision || revision.revisionId !== target.revisionId || revision.digest !== target.revisionDigest;
        }))
            (0, primitives_1.issue)(ctx, ["applyReceipt"], "Apply receipt must match every published revision");
    }
}));
/** Cross-snapshot invariants complement shape checks; they do not perform persistence. */
function validateAttemptTransition(before, after) {
    const errors = [];
    if (["FAILED", "CANCELLED", "SUPERSEDED"].includes(before.state) && JSON.stringify(before) !== JSON.stringify(after)) {
        errors.push("TERMINAL_ATTEMPT_IMMUTABLE");
    }
    if (before.state === "SUCCEEDED" && JSON.stringify({ ...before, applyReceipt: null }) !== JSON.stringify({ ...after, applyReceipt: null })) {
        errors.push("SUCCESSFUL_ATTEMPT_IMMUTABLE_EXCEPT_RECEIPT");
    }
    if (before.state === "NEEDS_DECISION" && JSON.stringify({ ...before, state: null, question: null }) !== JSON.stringify({ ...after, state: null, question: null })) {
        errors.push("PAUSED_ATTEMPT_BINDINGS_IMMUTABLE");
    }
    for (const key of ["attemptId", "ownerId", "kind", "idempotencyKey", "requestHash", "requestedAt", "parentAttemptId"]) {
        if (before[key] !== after[key])
            errors.push(`IMMUTABLE_ATTEMPT_FIELD:${key}`);
    }
    if (JSON.stringify(before.acceptedRequest) !== JSON.stringify(after.acceptedRequest))
        errors.push("IMMUTABLE_ACCEPTED_REQUEST");
    const allowed = {
        QUEUED: ["QUEUED", "RUNNING", "CANCELLED", "SUPERSEDED", "FAILED"],
        RUNNING: ["RUNNING", "QUEUED", "NEEDS_DECISION", "SUCCEEDED", "FAILED", "CANCELLED", "SUPERSEDED"],
        NEEDS_DECISION: ["NEEDS_DECISION", "CANCELLED", "SUPERSEDED"],
        SUCCEEDED: ["SUCCEEDED"], FAILED: ["FAILED"], CANCELLED: ["CANCELLED"], SUPERSEDED: ["SUPERSEDED"],
    };
    if (!allowed[before.state].includes(after.state))
        errors.push("INVALID_ATTEMPT_STATE_TRANSITION");
    if (before.targets.length !== after.targets.length)
        errors.push("IMMUTABLE_ATTEMPT_TARGETS");
    const afterTargets = new Map(after.targets.map(target => [target.planId, target]));
    for (const target of before.targets) {
        const next = afterTargets.get(target.planId);
        if (!next) {
            errors.push("IMMUTABLE_ATTEMPT_TARGETS");
            continue;
        }
        for (const key of ["requestedIntentVersionId", "baseActiveRevisionId", "sourceCandidateRevisionId", "planningVersion"]) {
            if (target[key] !== next[key])
                errors.push(`IMMUTABLE_TARGET_FIELD:${key}`);
        }
        if (target.resolvedIntentVersionId !== null && (target.resolvedIntentVersionId !== next.resolvedIntentVersionId || target.resolution !== next.resolution || target.resolvedPlanningVersion !== next.resolvedPlanningVersion)) {
            errors.push("RESOLVED_INTENT_ALREADY_BOUND");
        }
        if (target.contextDigest !== null && target.contextDigest !== next.contextDigest)
            errors.push("PINNED_CONTEXT_ALREADY_BOUND");
    }
    if (before.targets.some(target => {
        const next = afterTargets.get(target.planId);
        return next && (target.contextDigest === null && next.contextDigest !== null || target.resolvedIntentVersionId === null && next.resolvedIntentVersionId !== null);
    }) && after.state !== "RUNNING")
        errors.push("RESOLUTION_REQUIRES_FENCED_RUNNING_ATTEMPT");
    if (before.result && JSON.stringify(before.result) !== JSON.stringify(after.result))
        errors.push("PUBLISHED_RESULT_IMMUTABLE");
    if (before.applyReceipt && JSON.stringify(before.applyReceipt) !== JSON.stringify(after.applyReceipt))
        errors.push("APPLY_RECEIPT_WRITE_ONCE");
    const profiles = ["ADVICE", "CALENDAR_ONLY", "EDUCATIONAL", "RESEARCH"];
    if (profiles.indexOf(after.budget.profile) < profiles.indexOf(before.budget.profile))
        errors.push("ROOT_PROFILE_CANNOT_DOWNGRADE");
    if (before.budget.rootRequestId !== after.budget.rootRequestId)
        errors.push("ROOT_BUDGET_IDENTITY_IMMUTABLE");
    if (before.budget.processingStartedAt && before.budget.processingStartedAt !== after.budget.processingStartedAt)
        errors.push("PROCESSING_START_IMMUTABLE");
    if (after.budget.foregroundProcessingMs < before.budget.foregroundProcessingMs ||
        (before.budget.processingStartedAt && after.budget.foregroundProcessingMs !== before.budget.foregroundProcessingMs))
        errors.push("FOREGROUND_PROCESSING_CANNOT_RESET");
    if (before.budget.executionDeadlineAt && before.budget.profile === after.budget.profile &&
        before.budget.executionDeadlineAt !== after.budget.executionDeadlineAt)
        errors.push("TAKEOVER_CANNOT_RESET_DEADLINE");
    for (const key of Object.keys(before.budget.consumed)) {
        if (after.budget.consumed[key] < before.budget.consumed[key])
            errors.push(`ROOT_COUNTER_CANNOT_RESET:${key}`);
    }
    if (after.fence < before.fence)
        errors.push("FENCE_CANNOT_DECREASE");
    if (after.state === "RUNNING" && before.state !== "RUNNING" && after.fence <= before.fence)
        errors.push("CLAIM_REQUIRES_NEW_FENCE");
    if (before.lease && after.lease && before.lease.owner !== after.lease.owner && after.fence <= before.fence)
        errors.push("TAKEOVER_REQUIRES_NEW_FENCE");
    return [...new Set(errors)];
}
