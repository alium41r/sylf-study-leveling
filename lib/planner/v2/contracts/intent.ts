import { z } from "zod";
import { PLANNER_V2_ENVELOPE as E, withPlannerEnvelope } from "./envelope";
import { AssessmentProfileV2Schema, LearningEvidenceV2Schema, ResearchEvidenceV2Schema } from "./evidence";
import {
  DateV2Schema, DurableIdV2Schema, EntityIdV2Schema, InstantV2Schema, LocalIdV2Schema,
  PolicyV2Schema, SummaryV2Schema, TimeboxV2Schema, TimezoneV2Schema, TitleV2Schema,
  VersionV2Schema, issue, unique, validateDag,
} from "./primitives";

export const AvailabilityIntentV2Schema = z.strictObject({
  timezone: TimezoneV2Schema,
  dailyCeilingMinutes: z.array(z.number().int().min(0).max(E.dailyCapacityMinutes)).length(7),
  weeklyCeilingMinutes: z.number().int().min(0).max(E.weeklyCapacityMinutes).optional(),
  perGoalWeeklyCeilingMinutes: z.number().int().min(0).max(E.weeklyCapacityMinutes).optional(),
  restWeekdays: z.array(z.number().int().min(0).max(6)).max(7),
  blockedDates: z.array(DateV2Schema).max(E.scopeNodes),
  recoveryPercent: z.number().min(0).max(50),
  basis: z.enum(["CONFIRMED_AVAILABILITY", "DISCLOSED_PROVISIONAL_CEILING"]),
}).superRefine((value, ctx) => {
  unique(value.restWeekdays.map(String), ctx, ["restWeekdays"]);
  unique(value.blockedDates, ctx, ["blockedDates"]);
});

export const CanonicalIntentV2Schema = withPlannerEnvelope(z.strictObject({
  schemaVersion: VersionV2Schema,
  title: TitleV2Schema,
  outcome: SummaryV2Schema,
  policy: PolicyV2Schema,
  policySelection: z.enum(["INFERRED", "USER_OVERRIDE"]),
  subjectId: EntityIdV2Schema.optional(),
  goalId: EntityIdV2Schema.optional(),
  assessment: AssessmentProfileV2Schema.optional(),
  deadline: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("NONE") }),
    z.strictObject({ kind: z.literal("FIXED"), date: DateV2Schema, examDayStudyAllowed: z.boolean() }),
    z.strictObject({ kind: z.literal("SOFT"), date: DateV2Schema }),
  ]),
  scope: z.array(z.strictObject({
    scopeKey: DurableIdV2Schema,
    modelRef: LocalIdV2Schema,
    title: TitleV2Schema,
    parentKey: DurableIdV2Schema.nullable(),
    inclusion: z.enum(["REQUESTED", "SUPPORTING_PREREQUISITE", "EXCLUDED"]),
    sourceClaimIds: z.array(LocalIdV2Schema).max(E.referencesPerActivity),
  })).max(E.scopeNodes),
  evidence: z.array(LearningEvidenceV2Schema).max(E.evidenceRecords),
  research: ResearchEvidenceV2Schema.optional(),
  availability: AvailabilityIntentV2Schema.optional(),
  preferences: z.strictObject({
    pacing: z.enum(["COMFORTABLE_EARLY", "SPREAD"]),
    desiredIntensity: z.enum(["LIGHT", "MODERATE", "INTENSIVE"]),
    preferredTimeboxMinutes: TimeboxV2Schema,
    maximumTimeboxMinutes: TimeboxV2Schema.optional(),
  }),
  assumptions: z.array(z.strictObject({
    assumptionId: LocalIdV2Schema,
    statement: SummaryV2Schema,
    consequential: z.boolean(),
    basis: z.enum(["EXPLICIT", "SAVED", "INFERRED", "UNKNOWN"]),
  })).max(30),
  unresolvedQuestions: z.array(SummaryV2Schema).max(10),
}).superRefine((intent, ctx) => {
  unique(intent.scope.map(scope => scope.scopeKey), ctx, ["scope"]);
  unique(intent.scope.map(scope => scope.modelRef), ctx, ["scope"]);
  unique(intent.evidence.map(evidence => evidence.evidenceId), ctx, ["evidence"]);
  unique(intent.assumptions.map(assumption => assumption.assumptionId), ctx, ["assumptions"]);
  const scopeKeys = new Set(intent.scope.map(scope => scope.scopeKey));
  const adoptedClaims = new Set(intent.research?.claims.filter(claim => claim.status === "ADOPTED").map(claim => claim.claimId) ?? []);
  intent.scope.forEach((scope, i) => {
    if (scope.parentKey && !scopeKeys.has(scope.parentKey)) issue(ctx, ["scope", i, "parentKey"], "UNKNOWN_SCOPE_PARENT");
    scope.sourceClaimIds.forEach((claim, j) => {
      if (!adoptedClaims.has(claim)) issue(ctx, ["scope", i, "sourceClaimIds", j], "Scope can reference only adopted research claims");
    });
  });
  intent.evidence.forEach((evidence, i) => {
    if (evidence.scopeKeys.some(key => !scopeKeys.has(key))) issue(ctx, ["evidence", i, "scopeKeys"], "UNKNOWN_SCOPE_REFERENCE");
  });
  validateDag(intent.scope.map(scope => ({ id: scope.scopeKey, dependencies: scope.parentKey ? [scope.parentKey] : [] })), ctx, ["scope"]);
  if (intent.preferences.maximumTimeboxMinutes !== undefined &&
    intent.preferences.preferredTimeboxMinutes > intent.preferences.maximumTimeboxMinutes) {
    issue(ctx, ["preferences", "preferredTimeboxMinutes"], "Preferred session cannot exceed explicit maximum");
  }
}), E.intentBytes);

export const IntentVersionV2Schema = withPlannerEnvelope(z.strictObject({
  schemaVersion: VersionV2Schema,
  intentVersionId: DurableIdV2Schema,
  planId: DurableIdV2Schema,
  ownerId: EntityIdV2Schema,
  parentIntentVersionId: DurableIdV2Schema.nullable(),
  version: z.number().int().positive(),
  acceptedAt: InstantV2Schema,
  changeReason: z.enum(["INITIAL", "USER_EDIT", "AUTHORIZED_CHANGE", "RESEARCH_ADOPTION", "MIGRATION"]),
  intent: CanonicalIntentV2Schema,
}));

export type CanonicalIntentV2 = z.infer<typeof CanonicalIntentV2Schema>;
export type IntentVersionV2 = z.infer<typeof IntentVersionV2Schema>;
