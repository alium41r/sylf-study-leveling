import {
  CanonicalIntentV2Schema, ExecutionTaskSpecV2Schema, LearningBlueprintV2Schema,
  PlannerAttemptV2Schema, PlannerWorkspaceV2Schema, PlanChangeSetV2Schema,
  QualityReportV2Schema, RuntimeBudgetV2Schema, PlannerRevisionV2Schema,
} from "@/lib/planner/v2/contracts";

export const id = (value: number) => `${value.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
export const digest = (character = "a") => character.repeat(64);
export const instant = "2026-10-02T10:00:00Z";

export function intentFixture() {
  return CanonicalIntentV2Schema.parse({
    schemaVersion: 2, title: "Physics preparation", outcome: "Solve electricity questions confidently",
    policy: "EXAM", policySelection: "INFERRED", deadline: { kind: "FIXED", date: "2026-10-23", examDayStudyAllowed: false },
    scope: [{ scopeKey: id(10), modelRef: "scope_electricity", title: "Electricity", parentKey: null, inclusion: "REQUESTED", sourceClaimIds: [] }],
    evidence: [], preferences: { pacing: "COMFORTABLE_EARLY", desiredIntensity: "MODERATE", preferredTimeboxMinutes: 30 },
    assumptions: [], unresolvedQuestions: [],
  });
}

export function blueprintFixture() {
  return LearningBlueprintV2Schema.parse({
    schemaVersion: 2,
    strategy: {
      policy: "EXAM", outcome: "Solve electricity questions confidently", explanation: "Prioritize identifying the circuit method before timed work.",
      recommendedEffort: { lowMinutes: 15, likelyMinutes: 30, highMinutes: 45 },
      phases: [{ localId: "phase_practice", title: "Choose the method", outcome: "Identify the relevant circuit law" }],
    },
    scope: [{ scopeRef: "scope_electricity", disposition: "INCLUDED", contribution: "Apply circuit laws to assessed questions" }],
    activities: [{
      localId: "practice01", outcomeRefs: ["phase_practice"], scopeRefs: ["scope_electricity"], title: "Choose circuit methods",
      activityType: "DELIBERATE_PRACTICE", purpose: "Expose method-selection errors", instructions: "Solve three circuit questions, then compare the choice of method.",
      completionCriterion: "Explain the selected law and correct each method-selection error.",
      effort: { lowMinutes: 15, likelyMinutes: 30, highMinutes: 45 }, timeboxMinutes: 30,
      commitment: { category: "COMMITTED" }, hardDependencies: [],
    }],
    decisions: { assumptions: [], tradeOffs: [], unresolvedUncertainty: [], stoppingConditions: [] },
  });
}

export function executionFixture() {
  return ExecutionTaskSpecV2Schema.parse({
    schemaVersion: 2, activityKey: id(20), blueprintActivityId: "practice01", planId: id(1), goalId: 1,
    content: {
      title: "Choose circuit methods", instructions: "Solve three circuit questions, then compare the choice of method.",
      completionCriterion: "Explain the selected law and correct each method-selection error.",
      outcomeRefs: ["phase_practice"], scopeRefs: ["scope_electricity"], activityType: "DELIBERATE_PRACTICE", purpose: "Expose method-selection errors", resources: [], hardDependencies: [],
    },
    effort: { plannedMinutes: 30, remainingMinutesEstimate: 30, remainingEstimateBasisActualSeconds: 0 },
    placement: { date: "2026-10-05", timezone: "Asia/Karachi" },
  });
}

export function budgetFixture() {
  return RuntimeBudgetV2Schema.parse({
    rootRequestId: id(50), profile: "EDUCATIONAL", foregroundProcessingMs: 0, processingStartedAt: null, executionDeadlineAt: null,
    consumed: { modelCalls: 0, inputTokens: 0, outputTokens: 0, planningCalls: 0, researchSynthesisCalls: 0,
      researchQueries: 0, fetchAttempts: 0, selectedSourceCharacters: 0, extractedPages: 0, ocrPages: 0, followUps: 0 },
    reserved: { modelCalls: 0, inputTokens: 0, outputTokens: 0 },
  });
}

export function attemptFixture() {
  return PlannerAttemptV2Schema.parse({
    schemaVersion: 2, attemptId: id(4), ownerId: 1133, kind: "PLAN", state: "QUEUED", stage: "QUEUED",
    idempotencyKey: "plan-create-001", requestHash: digest(), requestedAt: instant, parentAttemptId: null,
    acceptedRequest: { text: "Prepare my physics exam plan", authorization: "PLAN_ACTION", researchRequested: false, targetAuthorizationDigest: digest() },
    targets: [{ planId: id(1), requestedIntentVersionId: id(2), resolvedIntentVersionId: null, resolution: null,
      baseActiveRevisionId: null, sourceCandidateRevisionId: null, planningVersion: 0, resolvedPlanningVersion: null, contextDigest: null }],
    budget: budgetFixture(), fence: 0, lease: null, checkpoint: null, question: null, error: null, result: null, applyReceipt: null,
  });
}

export function qualityFixture() {
  return QualityReportV2Schema.parse({ schemaVersion: 2, reportId: id(60), status: "PASSED", evidenceDigest: digest(), educationalContentDigest: digest("b"), issues: [], requiredAcknowledgements: [] });
}

export function workspaceFixture() {
  return PlannerWorkspaceV2Schema.parse({
    schemaVersion: 2, planId: id(1), ownerId: 1133, planState: "DRAFT", planningVersion: 0, conversationVersion: 0,
    workingIntentVersionId: id(2), phase: "REVIEW", active: null,
    candidate: { revisionId: id(3), resolvedIntentVersionId: id(2), resolvedPlanningVersion: 0, digest: digest("b"), title: "Physics preparation", policy: "EXAM",
      recommendedEffort: { lowMinutes: 15, likelyMinutes: 30, highMinutes: 45 }, committedMinutes: 30, primaryFinishDate: "2026-10-05",
      attemptId: id(4), changeSetId: id(5), confirmed: false, freshness: "CURRENT", staleReasons: [], qualityStatus: "PASSED" },
    attempt: null, scheduleHealth: "NOT_SCHEDULED", requiresReestimate: false, locallyDirty: false, nextAction: "CONFIRM", allowedActions: ["CONFIRM", "ADVICE"],
  });
}

export function changeSetFixture() {
  const spec = executionFixture();
  return PlanChangeSetV2Schema.parse({
    schemaVersion: 2, changeSetId: id(5), attemptId: id(4), requestDigest: digest(),
    targets: [{ planId: id(1), requestedIntentVersionId: id(2), resolvedIntentVersionId: id(2), baseActiveRevisionId: null,
      planningVersion: 0, resolvedPlanningVersion: 0, revisionId: id(3), revisionDigest: digest("b") }],
    entries: [{ activityKey: spec.activityKey, planId: spec.planId, before: null, after: {
      specDigest: digest("b"), contentDigest: digest(), date: spec.placement.date, timezone: spec.placement.timezone,
      ...spec.effort,
    }, changes: ["ADDED"], reason: "Practice the weak assessed skill" }],
    aggregate: { maximumCapacityMinutes: 600, availableForTargetsMinutes: 480, committedTargetMinutes: 30,
      recommendedEffort: { lowMinutes: 15, likelyMinutes: 30, highMinutes: 45 }, feasible: true, requiresReestimate: false, compromises: [] },
    quality: qualityFixture(), applyReceipt: null,
  });
}

export function revisionFixture() {
  return PlannerRevisionV2Schema.parse({
    schemaVersion: 2, revisionId: id(3), planId: id(1), ownerId: 1133, attemptId: id(4),
    requestedIntentVersionId: id(2), resolvedIntentVersionId: id(2), baseActiveRevisionId: null,
    sealedAt: instant, digest: digest("b"), blueprint: blueprintFixture(), executable: [executionFixture()],
    context: { intentDigest: digest(), capacityDigest: digest(), evidence: [], quests: [],
      planBases: [{ planId: id(1), revisionId: null, planningVersion: 0 }], externalActivityDependencies: [] },
    quality: qualityFixture(), forecast: [],
  });
}

export function successfulAttemptFixture() {
  const attempt = attemptFixture();
  return PlannerAttemptV2Schema.parse({ ...attempt, state: "SUCCEEDED", stage: "PERSISTENCE",
    targets: attempt.targets.map(target => ({ ...target, resolvedIntentVersionId: target.requestedIntentVersionId,
      resolvedPlanningVersion: target.planningVersion, resolution: "UNCHANGED", contextDigest: digest() })),
    result: { kind: "REVISIONS", revisions: [{ planId: id(1), revisionId: id(3), digest: digest("b") }] },
  });
}
