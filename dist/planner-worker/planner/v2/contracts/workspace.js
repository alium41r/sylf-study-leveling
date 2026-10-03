"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlannerWorkspaceV2Schema = void 0;
const zod_1 = require("zod");
const envelope_1 = require("./envelope");
const operations_1 = require("./operations");
const primitives_1 = require("./primitives");
const revisionView = zod_1.z.strictObject({
    revisionId: primitives_1.DurableIdV2Schema,
    resolvedIntentVersionId: primitives_1.DurableIdV2Schema,
    resolvedPlanningVersion: zod_1.z.number().int().nonnegative(),
    digest: primitives_1.DigestV2Schema,
    title: primitives_1.SummaryV2Schema,
    policy: primitives_1.PolicyV2Schema,
    recommendedEffort: primitives_1.EffortRangeV2Schema,
    committedMinutes: zod_1.z.number().int().nonnegative(),
    primaryFinishDate: primitives_1.DateV2Schema.nullable(),
});
exports.PlannerWorkspaceV2Schema = (0, envelope_1.withPlannerEnvelope)(zod_1.z.strictObject({
    schemaVersion: primitives_1.VersionV2Schema,
    planId: primitives_1.DurableIdV2Schema,
    ownerId: primitives_1.EntityIdV2Schema,
    planState: zod_1.z.enum(["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"]),
    planningVersion: zod_1.z.number().int().nonnegative(),
    conversationVersion: zod_1.z.number().int().nonnegative(),
    workingIntentVersionId: primitives_1.DurableIdV2Schema,
    phase: zod_1.z.enum(["INTAKE", "READY", "PLANNING", "NEEDS_DECISION", "REVIEW", "UPDATE_REQUIRED", "RECOVERY", "IDLE"]),
    active: revisionView.nullable(),
    candidate: revisionView.extend({
        attemptId: primitives_1.DurableIdV2Schema,
        changeSetId: primitives_1.DurableIdV2Schema,
        confirmed: zod_1.z.literal(false),
        freshness: zod_1.z.enum(["CURRENT", "STALE"]),
        staleReasons: zod_1.z.array(primitives_1.SummaryV2Schema).max(20),
        qualityStatus: zod_1.z.literal("PASSED"),
    }).nullable(),
    attempt: zod_1.z.strictObject({
        attemptId: primitives_1.DurableIdV2Schema,
        kind: zod_1.z.enum(["PLAN", "REPLAN", "EXPAND", "JOINT"]),
        state: zod_1.z.enum(["QUEUED", "RUNNING", "NEEDS_DECISION", "SUCCEEDED", "FAILED", "CANCELLED", "SUPERSEDED"]),
        stage: operations_1.PlannerStageV2Schema,
        error: operations_1.PlannerErrorV2Schema.nullable(),
        question: primitives_1.SummaryV2Schema.nullable(),
        requestedAt: primitives_1.InstantV2Schema,
    }).nullable(),
    scheduleHealth: zod_1.z.enum(["HEALTHY", "CONFLICT", "UPDATE_SUGGESTED", "NOT_SCHEDULED"]),
    requiresReestimate: zod_1.z.boolean(),
    locallyDirty: zod_1.z.boolean(),
    nextAction: zod_1.z.enum(["ANSWER", "GENERATE", "WAIT", "REVIEW", "CONFIRM", "UPDATE", "RETRY", "STUDY", "NONE"]),
    allowedActions: zod_1.z.array(zod_1.z.enum(["ANSWER", "GENERATE", "CANCEL", "REVIEW", "CONFIRM", "UPDATE", "RETRY", "STUDY", "ADVICE", "ARCHIVE"])).max(10),
}).superRefine((workspace, ctx) => {
    if (new Set(workspace.allowedActions).size !== workspace.allowedActions.length)
        (0, primitives_1.issue)(ctx, ["allowedActions"], "Duplicate workspace action");
    if (workspace.planState === "ACTIVE" && workspace.active === null)
        (0, primitives_1.issue)(ctx, ["active"], "An active Plan requires its confirmed revision");
    if (workspace.planState === "DRAFT" && workspace.active !== null)
        (0, primitives_1.issue)(ctx, ["active"], "A draft cannot present a confirmed active revision");
    if (workspace.active && workspace.candidate?.revisionId === workspace.active.revisionId)
        (0, primitives_1.issue)(ctx, ["candidate"], "An active revision is never an unconfirmed candidate");
    if (workspace.candidate?.freshness === "CURRENT" && workspace.candidate.resolvedIntentVersionId !== workspace.workingIntentVersionId) {
        (0, primitives_1.issue)(ctx, ["candidate"], "A current candidate must belong to the working intent");
    }
    if (workspace.candidate?.freshness === "CURRENT" && workspace.candidate.resolvedPlanningVersion !== workspace.planningVersion)
        (0, primitives_1.issue)(ctx, ["candidate"], "A current candidate must match the accepted planning version");
    if (workspace.candidate?.freshness === "CURRENT" && workspace.candidate.staleReasons.length > 0)
        (0, primitives_1.issue)(ctx, ["candidate", "staleReasons"], "Current candidates cannot have stale reasons");
    if (workspace.candidate?.freshness === "STALE" && workspace.candidate.staleReasons.length === 0)
        (0, primitives_1.issue)(ctx, ["candidate", "staleReasons"], "Stale candidates require a truthful explanation");
    const confirmable = workspace.candidate?.freshness === "CURRENT" && !workspace.locallyDirty && workspace.phase === "REVIEW" &&
        !workspace.requiresReestimate && workspace.planState !== "ARCHIVED" && workspace.planState !== "COMPLETED";
    if (workspace.requiresReestimate && workspace.scheduleHealth === "HEALTHY")
        (0, primitives_1.issue)(ctx, ["scheduleHealth"], "Unresolved remaining effort cannot be presented as a healthy schedule");
    if ((workspace.allowedActions.includes("CONFIRM") || workspace.nextAction === "CONFIRM") && !confirmable)
        (0, primitives_1.issue)(ctx, ["allowedActions"], "Only the current reviewed candidate can be confirmed");
    if (workspace.phase === "REVIEW" && workspace.candidate?.freshness !== "CURRENT")
        (0, primitives_1.issue)(ctx, ["phase"], "Review requires a current sealed candidate");
    if (workspace.phase === "PLANNING" && (!workspace.attempt || !["QUEUED", "RUNNING"].includes(workspace.attempt.state))) {
        (0, primitives_1.issue)(ctx, ["attempt"], "Planning phase requires a live durable attempt");
    }
    if (workspace.phase === "NEEDS_DECISION" && (workspace.attempt?.state !== "NEEDS_DECISION" || !workspace.attempt.question)) {
        (0, primitives_1.issue)(ctx, ["attempt"], "Decision phase requires a material paused question");
    }
    if (workspace.phase === "RECOVERY" && (workspace.attempt?.state !== "FAILED" || !workspace.attempt.error)) {
        (0, primitives_1.issue)(ctx, ["attempt"], "Recovery must identify a failed stage");
    }
}));
