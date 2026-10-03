"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SealedSemanticDiffEntryV2Schema = exports.SemanticDiffEntryV2Schema = exports.SemanticChangeV2Schema = exports.ExecutionStateV2Schema = exports.ExecutionTaskSpecV2Schema = void 0;
exports.deriveRemainingWorkV2 = deriveRemainingWorkV2;
exports.validateExecutionDurationV2 = validateExecutionDurationV2;
exports.canonicalExecutionContent = canonicalExecutionContent;
exports.compareExecutionSpecs = compareExecutionSpecs;
exports.validateSealedDiffCorrespondenceV2 = validateSealedDiffCorrespondenceV2;
exports.validateProtectedExecutionChange = validateProtectedExecutionChange;
const zod_1 = require("zod");
const envelope_1 = require("./envelope");
const primitives_1 = require("./primitives");
exports.ExecutionTaskSpecV2Schema = (0, envelope_1.withPlannerEnvelope)(zod_1.z.strictObject({
    schemaVersion: primitives_1.VersionV2Schema,
    activityKey: primitives_1.DurableIdV2Schema,
    blueprintActivityId: primitives_1.LocalIdV2Schema,
    planId: primitives_1.DurableIdV2Schema,
    goalId: primitives_1.EntityIdV2Schema,
    content: zod_1.z.strictObject({
        title: primitives_1.TitleV2Schema,
        instructions: primitives_1.ProseV2Schema,
        completionCriterion: primitives_1.CriterionV2Schema,
        outcomeRefs: zod_1.z.array(primitives_1.LocalIdV2Schema).max(envelope_1.PLANNER_V2_ENVELOPE.referencesPerActivity),
        scopeRefs: zod_1.z.array(primitives_1.LocalIdV2Schema).max(envelope_1.PLANNER_V2_ENVELOPE.referencesPerActivity),
        activityType: zod_1.z.string().trim().min(1).max(80),
        purpose: primitives_1.SummaryV2Schema,
        stage: primitives_1.TitleV2Schema.optional(),
        resources: zod_1.z.array(zod_1.z.strictObject({ ref: primitives_1.LocalIdV2Schema, versionDigest: primitives_1.DigestV2Schema })).max(envelope_1.PLANNER_V2_ENVELOPE.referencesPerActivity),
        hardDependencies: zod_1.z.array(primitives_1.DurableIdV2Schema).max(envelope_1.PLANNER_V2_ENVELOPE.referencesPerActivity),
    }),
    effort: zod_1.z.strictObject({
        plannedMinutes: primitives_1.TimeboxV2Schema,
        remainingMinutesEstimate: primitives_1.RemainingMinutesV2Schema,
        remainingEstimateBasisActualSeconds: zod_1.z.number().int().nonnegative(),
    }),
    placement: zod_1.z.strictObject({ date: primitives_1.DateV2Schema, timezone: primitives_1.TimezoneV2Schema }),
    continuesActivityKey: primitives_1.DurableIdV2Schema.optional(),
}).superRefine((spec, ctx) => {
    for (const field of ["outcomeRefs", "scopeRefs", "hardDependencies"])
        (0, primitives_1.unique)(spec.content[field], ctx, ["content", field]);
    (0, primitives_1.unique)(spec.content.resources.map(resource => resource.ref), ctx, ["content", "resources"]);
    if (spec.content.hardDependencies.includes(spec.activityKey))
        (0, primitives_1.issue)(ctx, ["content", "hardDependencies"], "SELF_DEPENDENCY");
    if (spec.continuesActivityKey === spec.activityKey)
        (0, primitives_1.issue)(ctx, ["continuesActivityKey"], "An activity cannot continue itself");
}));
exports.ExecutionStateV2Schema = zod_1.z.strictObject({
    schemaVersion: primitives_1.VersionV2Schema,
    activityKey: primitives_1.DurableIdV2Schema,
    state: zod_1.z.enum(["UNSTARTED", "RUNNING", "PAUSED", "ENDED_INCOMPLETE", "COMPLETED"]),
    remainingDisposition: zod_1.z.enum(["OPEN", "WITHDRAWN", "COMPLETED"]),
    actualSeconds: zod_1.z.number().int().nonnegative(),
    executionVersion: zod_1.z.number().int().nonnegative(),
    remainingMinutesEstimate: primitives_1.RemainingMinutesV2Schema,
    requiresReestimate: zod_1.z.boolean(),
}).superRefine((execution, ctx) => {
    if (execution.state === "UNSTARTED" && execution.actualSeconds !== 0)
        (0, primitives_1.issue)(ctx, ["actualSeconds"], "Unstarted work cannot contain elapsed study");
    if (execution.remainingDisposition === "OPEN" && execution.remainingMinutesEstimate === 0 && execution.state !== "COMPLETED") {
        (0, primitives_1.issue)(ctx, ["remainingMinutesEstimate"], "Incomplete open work cannot silently reserve zero remaining effort");
    }
    if (execution.state === "COMPLETED" && execution.remainingDisposition !== "COMPLETED")
        (0, primitives_1.issue)(ctx, ["remainingDisposition"], "Completed work has a completed disposition");
    if (execution.remainingDisposition === "COMPLETED" && execution.state !== "COMPLETED")
        (0, primitives_1.issue)(ctx, ["state"], "Only completed work has a completed remaining disposition");
    if (execution.state === "UNSTARTED" && execution.remainingDisposition !== "OPEN")
        (0, primitives_1.issue)(ctx, ["remainingDisposition"], "Unstarted execution remains open");
    if (execution.remainingDisposition !== "OPEN" && execution.remainingMinutesEstimate !== 0)
        (0, primitives_1.issue)(ctx, ["remainingMinutesEstimate"], "Closed remaining work reserves no future minutes");
    if (execution.state === "RUNNING" && execution.remainingDisposition !== "OPEN")
        (0, primitives_1.issue)(ctx, ["state"], "Withdrawn/completed work cannot be running");
    if (execution.state !== "UNSTARTED" && execution.executionVersion === 0)
        (0, primitives_1.issue)(ctx, ["executionVersion"], "A zero-second start still advances execution protection");
    if (execution.requiresReestimate && (execution.remainingDisposition !== "OPEN" || execution.state === "UNSTARTED"))
        (0, primitives_1.issue)(ctx, ["requiresReestimate"], "Only started open work can require a new remaining estimate");
});
exports.SemanticChangeV2Schema = zod_1.z.enum(["KEPT", "MOVED", "SHORTENED", "EXPANDED", "CHANGED", "REMOVED", "ADDED"]);
/** Derive a live forecast from an approved estimate without modifying the sealed specification. */
function deriveRemainingWorkV2(effort, actualSeconds, disposition = "OPEN") {
    if (!Number.isInteger(actualSeconds) || actualSeconds < effort.remainingEstimateBasisActualSeconds) {
        throw new Error("ACTUAL_TIME_CANNOT_PRECEDE_ESTIMATE_BASIS");
    }
    if (disposition !== "OPEN")
        return { remainingMinutesEstimate: 0, requiresReestimate: false };
    const residual = effort.remainingMinutesEstimate - (actualSeconds - effort.remainingEstimateBasisActualSeconds) / 60;
    return { remainingMinutesEstimate: Math.max(1, Math.ceil(residual)), requiresReestimate: residual <= 0 };
}
function validateExecutionDurationV2(spec, execution) {
    if (spec.activityKey !== execution.activityKey)
        return ["EXECUTION_IDENTITY_MISMATCH"];
    const errors = [];
    if (spec.effort.remainingEstimateBasisActualSeconds > execution.actualSeconds)
        errors.push("ESTIMATE_BASIS_AHEAD_OF_ACTUAL_TIME");
    if (execution.state === "UNSTARTED" && (spec.effort.remainingEstimateBasisActualSeconds !== 0 ||
        spec.effort.remainingMinutesEstimate !== spec.effort.plannedMinutes || execution.remainingMinutesEstimate !== spec.effort.plannedMinutes)) {
        errors.push("UNSTARTED_RESERVE_MUST_EQUAL_APPROVED_TIMEBOX");
    }
    if (!errors.length) {
        const forecast = deriveRemainingWorkV2(spec.effort, execution.actualSeconds, execution.remainingDisposition);
        if (forecast.remainingMinutesEstimate !== execution.remainingMinutesEstimate)
            errors.push("LIVE_REMAINING_FORECAST_MISMATCH");
        if (forecast.requiresReestimate !== execution.requiresReestimate)
            errors.push("LIVE_REESTIMATE_DECISION_MISMATCH");
    }
    return errors;
}
/** Reference arrays are sets; instructions and criteria compare exactly after schema normalization. */
function canonicalExecutionContent(spec) {
    return JSON.stringify({
        planId: spec.planId, goalId: spec.goalId, blueprintActivityId: spec.blueprintActivityId, continuesActivityKey: spec.continuesActivityKey ?? null,
        title: spec.content.title, instructions: spec.content.instructions,
        completionCriterion: spec.content.completionCriterion, activityType: spec.content.activityType, purpose: spec.content.purpose,
        stage: spec.content.stage ?? null,
        outcomeRefs: [...spec.content.outcomeRefs].sort(), scopeRefs: [...spec.content.scopeRefs].sort(),
        resources: [...spec.content.resources].sort((a, b) => a.ref.localeCompare(b.ref)),
        hardDependencies: [...spec.content.hardDependencies].sort(),
    });
}
function compareExecutionSpecs(before, after) {
    if (!before && !after)
        throw new Error("A semantic comparison requires at least one specification");
    if (!before)
        return ["ADDED"];
    if (!after)
        return ["REMOVED"];
    if (before.activityKey !== after.activityKey)
        throw new Error("Replacement identities require separate removed/added entries");
    const changes = [];
    if (before.placement.date !== after.placement.date || before.placement.timezone !== after.placement.timezone)
        changes.push("MOVED");
    const plannedDelta = after.effort.plannedMinutes - before.effort.plannedMinutes;
    const remainingDelta = after.effort.remainingMinutesEstimate - before.effort.remainingMinutesEstimate;
    if (plannedDelta < 0 || remainingDelta < 0)
        changes.push("SHORTENED");
    if (plannedDelta > 0 || remainingDelta > 0)
        changes.push("EXPANDED");
    if (canonicalExecutionContent(before) !== canonicalExecutionContent(after))
        changes.push("CHANGED");
    if (changes.length === 0 && before.effort.remainingEstimateBasisActualSeconds !== after.effort.remainingEstimateBasisActualSeconds)
        changes.push("CHANGED");
    return changes.length ? changes : ["KEPT"];
}
exports.SemanticDiffEntryV2Schema = zod_1.z.strictObject({
    activityKey: primitives_1.DurableIdV2Schema,
    before: exports.ExecutionTaskSpecV2Schema.nullable(),
    after: exports.ExecutionTaskSpecV2Schema.nullable(),
    changes: zod_1.z.array(exports.SemanticChangeV2Schema).min(1).max(4),
    reason: primitives_1.SummaryV2Schema,
}).superRefine((entry, ctx) => {
    if (!entry.before && !entry.after) {
        (0, primitives_1.issue)(ctx, [], "An entry requires a before or after specification");
        return;
    }
    if ((entry.before && entry.before.activityKey !== entry.activityKey) || (entry.after && entry.after.activityKey !== entry.activityKey)) {
        (0, primitives_1.issue)(ctx, ["activityKey"], "Diff identity must match both specifications");
        return;
    }
    const expected = compareExecutionSpecs(entry.before, entry.after);
    if (JSON.stringify([...entry.changes].sort()) !== JSON.stringify([...expected].sort()))
        (0, primitives_1.issue)(ctx, ["changes"], "Diff labels must match semantic content, effort and placement");
});
const sealedSpecSummary = zod_1.z.strictObject({
    specDigest: primitives_1.DigestV2Schema,
    contentDigest: primitives_1.DigestV2Schema,
    date: primitives_1.DateV2Schema,
    timezone: primitives_1.TimezoneV2Schema,
    plannedMinutes: primitives_1.TimeboxV2Schema,
    remainingMinutesEstimate: primitives_1.RemainingMinutesV2Schema,
    remainingEstimateBasisActualSeconds: zod_1.z.number().int().nonnegative(),
});
/** Persist exact-spec pointers plus review facts; do not duplicate full instructions in every diff. */
exports.SealedSemanticDiffEntryV2Schema = zod_1.z.strictObject({
    activityKey: primitives_1.DurableIdV2Schema,
    planId: primitives_1.DurableIdV2Schema,
    before: sealedSpecSummary.nullable(),
    after: sealedSpecSummary.nullable(),
    changes: zod_1.z.array(exports.SemanticChangeV2Schema).min(1).max(4),
    reason: primitives_1.SummaryV2Schema,
}).superRefine((entry, ctx) => {
    if (!entry.before && !entry.after) {
        (0, primitives_1.issue)(ctx, [], "A sealed diff requires a specification pointer");
        return;
    }
    const expected = [];
    if (!entry.before)
        expected.push("ADDED");
    else if (!entry.after)
        expected.push("REMOVED");
    else {
        const before = entry.before;
        const after = entry.after;
        if (before.date !== after.date || before.timezone !== after.timezone)
            expected.push("MOVED");
        if (after.plannedMinutes < before.plannedMinutes || after.remainingMinutesEstimate < before.remainingMinutesEstimate)
            expected.push("SHORTENED");
        if (after.plannedMinutes > before.plannedMinutes || after.remainingMinutesEstimate > before.remainingMinutesEstimate)
            expected.push("EXPANDED");
        if (before.contentDigest !== after.contentDigest ||
            (expected.length === 0 && before.remainingEstimateBasisActualSeconds !== after.remainingEstimateBasisActualSeconds))
            expected.push("CHANGED");
        if (expected.length === 0)
            expected.push("KEPT");
        if ((expected[0] === "KEPT") !== (before.specDigest === after.specDigest))
            (0, primitives_1.issue)(ctx, [], "Specification digests and diff summaries must agree");
    }
    if (JSON.stringify([...entry.changes].sort()) !== JSON.stringify(expected.sort()))
        (0, primitives_1.issue)(ctx, ["changes"], "Sealed diff labels must match its specification summaries");
});
/** Trusted hashing and owned immutable lookup stay outside this client-safe module. */
function validateSealedDiffCorrespondenceV2(entry, before, after) {
    const errors = [];
    for (const [side, source] of [["before", before], ["after", after]]) {
        const summary = entry[side];
        if (!summary || !source) {
            if (summary !== null || source !== null)
                errors.push(`DIFF_POINTER_MISMATCH:${side}`);
            continue;
        }
        if (source.spec.activityKey !== entry.activityKey || source.spec.planId !== entry.planId ||
            source.specDigest !== summary.specDigest || source.contentDigest !== summary.contentDigest ||
            source.spec.placement.date !== summary.date || source.spec.placement.timezone !== summary.timezone ||
            source.spec.effort.plannedMinutes !== summary.plannedMinutes || source.spec.effort.remainingMinutesEstimate !== summary.remainingMinutesEstimate ||
            source.spec.effort.remainingEstimateBasisActualSeconds !== summary.remainingEstimateBasisActualSeconds)
            errors.push(`DIFF_SPECIFICATION_MISMATCH:${side}`);
    }
    if (before || after) {
        if (before && after && before.spec.activityKey !== after.spec.activityKey)
            errors.push("DIFF_IDENTITY_MISMATCH");
        else if (JSON.stringify(compareExecutionSpecs(before?.spec ?? null, after?.spec ?? null).sort()) !== JSON.stringify([...entry.changes].sort()))
            errors.push("DIFF_SEMANTIC_LABEL_MISMATCH");
    }
    return errors;
}
/** Pure precondition checks; actual sessions must be loaded and locked by the apply service. */
function validateProtectedExecutionChange(before, after, execution, action) {
    if (before.activityKey !== execution.activityKey)
        return ["EXECUTION_IDENTITY_MISMATCH"];
    if (execution.state === "RUNNING")
        return ["RUNNING_EXECUTION_PROTECTED"];
    if (execution.state === "COMPLETED" || execution.remainingDisposition !== "OPEN")
        return ["CLOSED_EXECUTION_PROTECTED"];
    if (execution.state === "UNSTARTED")
        return [];
    if (action === "REMOVE")
        return ["STARTED_HISTORY_CANNOT_BE_DELETED"];
    if (action === "WITHDRAW")
        return after === null ? [] : ["WITHDRAWAL_CANNOT_REWRITE_STARTED_CONTENT"];
    if (!after || canonicalExecutionContent(before) !== canonicalExecutionContent(after))
        return ["STARTED_CONTENT_PROTECTED"];
    if (before.effort.plannedMinutes !== after.effort.plannedMinutes)
        return ["STARTED_TIMEBOX_PROTECTED"];
    return [];
}
