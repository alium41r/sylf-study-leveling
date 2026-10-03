"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntentVersionV2Schema = exports.CanonicalIntentV2Schema = exports.AvailabilityIntentV2Schema = void 0;
const zod_1 = require("zod");
const envelope_1 = require("./envelope");
const evidence_1 = require("./evidence");
const primitives_1 = require("./primitives");
exports.AvailabilityIntentV2Schema = zod_1.z.strictObject({
    timezone: primitives_1.TimezoneV2Schema,
    dailyCeilingMinutes: zod_1.z.array(zod_1.z.number().int().min(0).max(envelope_1.PLANNER_V2_ENVELOPE.dailyCapacityMinutes)).length(7),
    weeklyCeilingMinutes: zod_1.z.number().int().min(0).max(envelope_1.PLANNER_V2_ENVELOPE.weeklyCapacityMinutes).optional(),
    perGoalWeeklyCeilingMinutes: zod_1.z.number().int().min(0).max(envelope_1.PLANNER_V2_ENVELOPE.weeklyCapacityMinutes).optional(),
    restWeekdays: zod_1.z.array(zod_1.z.number().int().min(0).max(6)).max(7),
    blockedDates: zod_1.z.array(primitives_1.DateV2Schema).max(envelope_1.PLANNER_V2_ENVELOPE.scopeNodes),
    recoveryPercent: zod_1.z.number().min(0).max(50),
    basis: zod_1.z.enum(["CONFIRMED_AVAILABILITY", "DISCLOSED_PROVISIONAL_CEILING"]),
}).superRefine((value, ctx) => {
    (0, primitives_1.unique)(value.restWeekdays.map(String), ctx, ["restWeekdays"]);
    (0, primitives_1.unique)(value.blockedDates, ctx, ["blockedDates"]);
});
exports.CanonicalIntentV2Schema = (0, envelope_1.withPlannerEnvelope)(zod_1.z.strictObject({
    schemaVersion: primitives_1.VersionV2Schema,
    title: primitives_1.TitleV2Schema,
    outcome: primitives_1.SummaryV2Schema,
    policy: primitives_1.PolicyV2Schema,
    policySelection: zod_1.z.enum(["INFERRED", "USER_OVERRIDE"]),
    subjectId: primitives_1.EntityIdV2Schema.optional(),
    goalId: primitives_1.EntityIdV2Schema.optional(),
    assessment: evidence_1.AssessmentProfileV2Schema.optional(),
    deadline: zod_1.z.discriminatedUnion("kind", [
        zod_1.z.strictObject({ kind: zod_1.z.literal("NONE") }),
        zod_1.z.strictObject({ kind: zod_1.z.literal("FIXED"), date: primitives_1.DateV2Schema, examDayStudyAllowed: zod_1.z.boolean() }),
        zod_1.z.strictObject({ kind: zod_1.z.literal("SOFT"), date: primitives_1.DateV2Schema }),
    ]),
    scope: zod_1.z.array(zod_1.z.strictObject({
        scopeKey: primitives_1.DurableIdV2Schema,
        modelRef: primitives_1.LocalIdV2Schema,
        title: primitives_1.TitleV2Schema,
        parentKey: primitives_1.DurableIdV2Schema.nullable(),
        inclusion: zod_1.z.enum(["REQUESTED", "SUPPORTING_PREREQUISITE", "EXCLUDED"]),
        sourceClaimIds: zod_1.z.array(primitives_1.LocalIdV2Schema).max(envelope_1.PLANNER_V2_ENVELOPE.referencesPerActivity),
    })).max(envelope_1.PLANNER_V2_ENVELOPE.scopeNodes),
    evidence: zod_1.z.array(evidence_1.LearningEvidenceV2Schema).max(envelope_1.PLANNER_V2_ENVELOPE.evidenceRecords),
    research: evidence_1.ResearchEvidenceV2Schema.optional(),
    availability: exports.AvailabilityIntentV2Schema.optional(),
    preferences: zod_1.z.strictObject({
        pacing: zod_1.z.enum(["COMFORTABLE_EARLY", "SPREAD"]),
        desiredIntensity: zod_1.z.enum(["LIGHT", "MODERATE", "INTENSIVE"]),
        preferredTimeboxMinutes: primitives_1.TimeboxV2Schema,
        maximumTimeboxMinutes: primitives_1.TimeboxV2Schema.optional(),
    }),
    assumptions: zod_1.z.array(zod_1.z.strictObject({
        assumptionId: primitives_1.LocalIdV2Schema,
        statement: primitives_1.SummaryV2Schema,
        consequential: zod_1.z.boolean(),
        basis: zod_1.z.enum(["EXPLICIT", "SAVED", "INFERRED", "UNKNOWN"]),
    })).max(30),
    unresolvedQuestions: zod_1.z.array(primitives_1.SummaryV2Schema).max(10),
}).superRefine((intent, ctx) => {
    (0, primitives_1.unique)(intent.scope.map(scope => scope.scopeKey), ctx, ["scope"]);
    (0, primitives_1.unique)(intent.scope.map(scope => scope.modelRef), ctx, ["scope"]);
    (0, primitives_1.unique)(intent.evidence.map(evidence => evidence.evidenceId), ctx, ["evidence"]);
    (0, primitives_1.unique)(intent.assumptions.map(assumption => assumption.assumptionId), ctx, ["assumptions"]);
    const scopeKeys = new Set(intent.scope.map(scope => scope.scopeKey));
    const adoptedClaims = new Set(intent.research?.claims.filter(claim => claim.status === "ADOPTED").map(claim => claim.claimId) ?? []);
    intent.scope.forEach((scope, i) => {
        if (scope.parentKey && !scopeKeys.has(scope.parentKey))
            (0, primitives_1.issue)(ctx, ["scope", i, "parentKey"], "UNKNOWN_SCOPE_PARENT");
        scope.sourceClaimIds.forEach((claim, j) => {
            if (!adoptedClaims.has(claim))
                (0, primitives_1.issue)(ctx, ["scope", i, "sourceClaimIds", j], "Scope can reference only adopted research claims");
        });
    });
    intent.evidence.forEach((evidence, i) => {
        if (evidence.scopeKeys.some(key => !scopeKeys.has(key)))
            (0, primitives_1.issue)(ctx, ["evidence", i, "scopeKeys"], "UNKNOWN_SCOPE_REFERENCE");
    });
    (0, primitives_1.validateDag)(intent.scope.map(scope => ({ id: scope.scopeKey, dependencies: scope.parentKey ? [scope.parentKey] : [] })), ctx, ["scope"]);
    if (intent.preferences.maximumTimeboxMinutes !== undefined &&
        intent.preferences.preferredTimeboxMinutes > intent.preferences.maximumTimeboxMinutes) {
        (0, primitives_1.issue)(ctx, ["preferences", "preferredTimeboxMinutes"], "Preferred session cannot exceed explicit maximum");
    }
}), envelope_1.PLANNER_V2_ENVELOPE.intentBytes);
exports.IntentVersionV2Schema = (0, envelope_1.withPlannerEnvelope)(zod_1.z.strictObject({
    schemaVersion: primitives_1.VersionV2Schema,
    intentVersionId: primitives_1.DurableIdV2Schema,
    planId: primitives_1.DurableIdV2Schema,
    ownerId: primitives_1.EntityIdV2Schema,
    parentIntentVersionId: primitives_1.DurableIdV2Schema.nullable(),
    version: zod_1.z.number().int().positive(),
    acceptedAt: primitives_1.InstantV2Schema,
    changeReason: zod_1.z.enum(["INITIAL", "USER_EDIT", "AUTHORIZED_CHANGE", "RESEARCH_ADOPTION", "MIGRATION"]),
    intent: exports.CanonicalIntentV2Schema,
}));
