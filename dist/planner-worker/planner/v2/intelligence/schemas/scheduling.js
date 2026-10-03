"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AllocationReportSchema = exports.SchedulingEnvelopeSchema = void 0;
const zod_1 = require("zod");
const envelope_1 = require("../../contracts/envelope");
const primitives_1 = require("../../contracts/primitives");
const minutes = zod_1.z.number().int().nonnegative();
const targetRefs = zod_1.z.array(primitives_1.LocalIdV2Schema).min(1).max(envelope_1.PLANNER_V2_ENVELOPE.targets);
const deadline = zod_1.z.discriminatedUnion("kind", [
    zod_1.z.strictObject({ kind: zod_1.z.literal("NONE") }),
    zod_1.z.strictObject({ kind: zod_1.z.literal("FIXED"), date: primitives_1.DateV2Schema, examDayStudyAllowed: zod_1.z.boolean() }),
    zod_1.z.strictObject({ kind: zod_1.z.literal("SOFT"), date: primitives_1.DateV2Schema }),
]);
/** A bounded detailed window is independent of the student's goal deadline. */
exports.SchedulingEnvelopeSchema = (0, envelope_1.withPlannerEnvelope)(zod_1.z.strictObject({
    schemaVersion: primitives_1.VersionV2Schema,
    timezone: primitives_1.TimezoneV2Schema,
    today: primitives_1.DateV2Schema,
    window: zod_1.z.strictObject({ start: primitives_1.DateV2Schema, end: primitives_1.DateV2Schema }),
    capacityDigest: primitives_1.DigestV2Schema,
    basis: zod_1.z.enum(["CONFIRMED_AVAILABILITY", "DISCLOSED_PROVISIONAL_CEILING"]),
    weeklyCeilingMinutes: zod_1.z.number().int().min(0).max(envelope_1.PLANNER_V2_ENVELOPE.weeklyCapacityMinutes),
    recoveryPercent: zod_1.z.number().min(0).max(50),
    targets: zod_1.z.array(zod_1.z.strictObject({
        planRef: primitives_1.LocalIdV2Schema, deadline,
        perGoalWeeklyCeilingMinutes: zod_1.z.number().int().min(0).max(envelope_1.PLANNER_V2_ENVELOPE.weeklyCapacityMinutes).nullable(),
    })).min(1).max(envelope_1.PLANNER_V2_ENVELOPE.targets),
    days: zod_1.z.array(zod_1.z.strictObject({
        date: primitives_1.DateV2Schema, ceilingMinutes: zod_1.z.number().int().min(0).max(envelope_1.PLANNER_V2_ENVELOPE.dailyCapacityMinutes),
        otherCommittedMinutes: minutes, protectedTargetMinutes: minutes, recoveryMinutes: minutes,
        availableMinutes: zod_1.z.number().int().min(0).max(envelope_1.PLANNER_V2_ENVELOPE.dailyCapacityMinutes),
        excluded: zod_1.z.boolean(),
    })).max(envelope_1.PLANNER_V2_ENVELOPE.scopeNodes),
    protectedExecution: zod_1.z.array(zod_1.z.strictObject({
        planRef: primitives_1.LocalIdV2Schema, activityRef: primitives_1.LocalIdV2Schema, contentDigest: primitives_1.DigestV2Schema,
        executionVersion: minutes, actualSeconds: minutes, remainingMinutes: minutes,
        state: zod_1.z.enum(["UNSTARTED", "RUNNING", "PAUSED", "ENDED_INCOMPLETE", "COMPLETED"]),
        remainingDisposition: zod_1.z.enum(["OPEN", "WITHDRAWN", "COMPLETED"]), date: primitives_1.DateV2Schema,
    })).max(envelope_1.PLANNER_V2_ENVELOPE.outstandingActivitiesPerPlan * envelope_1.PLANNER_V2_ENVELOPE.targets),
    timeboxRange: zod_1.z.strictObject({ minMinutes: primitives_1.TimeboxV2Schema, maxMinutes: primitives_1.TimeboxV2Schema }),
}).superRefine((envelope, ctx) => {
    (0, primitives_1.unique)(envelope.targets.map(target => target.planRef), ctx, ["targets"]);
    (0, primitives_1.unique)(envelope.days.map(day => day.date), ctx, ["days"]);
    (0, primitives_1.unique)(envelope.protectedExecution.map(task => `${task.planRef}/${task.activityRef}`), ctx, ["protectedExecution"]);
    if (envelope.window.start < envelope.today || envelope.window.end < envelope.window.start)
        (0, primitives_1.issue)(ctx, ["window"], "INVALID_DETAILED_WINDOW");
    if (envelope.timeboxRange.maxMinutes < envelope.timeboxRange.minMinutes)
        (0, primitives_1.issue)(ctx, ["timeboxRange"], "INVALID_TIMEBOX_RANGE");
    envelope.days.forEach((day, i) => {
        if (day.date < envelope.window.start || day.date > envelope.window.end)
            (0, primitives_1.issue)(ctx, ["days", i], "DATE_OUTSIDE_DETAILED_WINDOW");
        const available = day.excluded ? 0 : Math.max(0, day.ceilingMinutes - day.otherCommittedMinutes - day.protectedTargetMinutes - day.recoveryMinutes);
        if (available !== day.availableMinutes)
            (0, primitives_1.issue)(ctx, ["days", i, "availableMinutes"], "CAPACITY_ACCOUNTING_MISMATCH");
    });
    const plans = new Set(envelope.targets.map(target => target.planRef));
    envelope.protectedExecution.forEach((task, i) => {
        if (!plans.has(task.planRef))
            (0, primitives_1.issue)(ctx, ["protectedExecution", i], "UNKNOWN_TARGET");
        if (task.state === "UNSTARTED" && task.actualSeconds !== 0)
            (0, primitives_1.issue)(ctx, ["protectedExecution", i], "UNSTARTED_EXECUTION_MISMATCH");
        if (task.state !== "UNSTARTED" && task.executionVersion === 0)
            (0, primitives_1.issue)(ctx, ["protectedExecution", i], "STARTED_EXECUTION_REQUIRES_VERSION");
        if ((task.state === "COMPLETED") !== (task.remainingDisposition === "COMPLETED"))
            (0, primitives_1.issue)(ctx, ["protectedExecution", i], "COMPLETION_DISPOSITION_MISMATCH");
        if ((task.state === "RUNNING" || task.state === "UNSTARTED") && task.remainingDisposition !== "OPEN")
            (0, primitives_1.issue)(ctx, ["protectedExecution", i], "OPEN_EXECUTION_REQUIRED");
        if (task.remainingDisposition === "OPEN" ? task.remainingMinutes === 0 : task.remainingMinutes !== 0)
            (0, primitives_1.issue)(ctx, ["protectedExecution", i], "REMAINING_DISPOSITION_MISMATCH");
    });
}));
const activity = zod_1.z.strictObject({ planRef: primitives_1.LocalIdV2Schema, activityRef: primitives_1.LocalIdV2Schema, minutes: primitives_1.TimeboxV2Schema });
/** A mathematical capacity bound proves shortfall; failed heuristic search does not. */
exports.AllocationReportSchema = (0, envelope_1.withPlannerEnvelope)(zod_1.z.strictObject({
    schemaVersion: primitives_1.VersionV2Schema,
    status: zod_1.z.enum(["FEASIBLE", "CAPACITY_SHORTFALL", "ALLOCATION_UNRESOLVED"]),
    placements: zod_1.z.array(activity.extend({ date: primitives_1.DateV2Schema })).max(envelope_1.PLANNER_V2_ENVELOPE.outstandingActivitiesPerPlan * envelope_1.PLANNER_V2_ENVELOPE.targets),
    unscheduled: zod_1.z.array(activity).max(envelope_1.PLANNER_V2_ENVELOPE.outstandingActivitiesPerPlan * envelope_1.PLANNER_V2_ENVELOPE.targets),
    committedMinutes: minutes,
    capacityProof: zod_1.z.strictObject({
        planRefs: targetRefs, dates: zod_1.z.array(primitives_1.DateV2Schema).min(1).max(envelope_1.PLANNER_V2_ENVELOPE.scopeNodes),
        requiredMinutes: zod_1.z.number().int().positive(), availableMinutes: minutes,
        explanation: primitives_1.SummaryV2Schema,
    }).nullable(),
    findings: zod_1.z.array(zod_1.z.strictObject({
        findingId: primitives_1.LocalIdV2Schema,
        category: zod_1.z.enum(["SHORTFALL", "LEARNING_WINDOW", "DENSITY", "SWITCHING", "FINISH", "ESTIMATE_RISK", "ADVISORY_ORDER"]),
        consequential: zod_1.z.boolean(), planRefs: targetRefs, activityRefs: zod_1.z.array(primitives_1.LocalIdV2Schema).max(envelope_1.PLANNER_V2_ENVELOPE.newlyDetailedActivities),
        evidence: primitives_1.SummaryV2Schema, consequence: primitives_1.SummaryV2Schema,
    })).max(envelope_1.PLANNER_V2_ENVELOPE.qualityIssues),
}).superRefine((report, ctx) => {
    const all = [...report.placements, ...report.unscheduled];
    (0, primitives_1.unique)(all.map(task => `${task.planRef}/${task.activityRef}`), ctx, ["placements"]);
    (0, primitives_1.unique)(report.findings.map(finding => finding.findingId), ctx, ["findings"]);
    if (all.reduce((sum, task) => sum + task.minutes, 0) !== report.committedMinutes)
        (0, primitives_1.issue)(ctx, ["committedMinutes"], "COMMITTED_MINUTES_MISMATCH");
    if (report.status === "FEASIBLE" && report.unscheduled.length)
        (0, primitives_1.issue)(ctx, ["unscheduled"], "FEASIBLE_REQUIRES_ALL_COMMITTED_WORK");
    if ((report.status === "CAPACITY_SHORTFALL") !== (report.capacityProof !== null))
        (0, primitives_1.issue)(ctx, ["capacityProof"], "SHORTFALL_REQUIRES_CAPACITY_PROOF");
    if (report.capacityProof) {
        (0, primitives_1.unique)(report.capacityProof.planRefs, ctx, ["capacityProof", "planRefs"]);
        (0, primitives_1.unique)(report.capacityProof.dates, ctx, ["capacityProof", "dates"]);
        if (report.capacityProof.requiredMinutes <= report.capacityProof.availableMinutes)
            (0, primitives_1.issue)(ctx, ["capacityProof"], "CAPACITY_BOUND_DOES_NOT_PROVE_SHORTFALL");
    }
}));
