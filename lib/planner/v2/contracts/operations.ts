import { z } from "zod";
import { PLANNER_V2_BUDGETS, PLANNER_V2_ENVELOPE as E, withPlannerEnvelope } from "./envelope";
import {
  DateV2Schema, DigestV2Schema, DurableIdV2Schema, EntityIdV2Schema, InstantV2Schema,
  LocalIdV2Schema, ProseV2Schema, SummaryV2Schema, VersionV2Schema, issue, unique,
} from "./primitives";

export const PlannerStageV2Schema = z.enum([
  "INTAKE", "INTERPRETATION", "QUEUED", "RESEARCH", "PREFLIGHT", "BLUEPRINT", "ALLOCATION",
  "ADAPTATION", "REVIEW", "REPAIR", "VERIFICATION", "PERSISTENCE", "APPLY", "RECOVERY",
]);
export const PlannerErrorV2Schema = z.strictObject({
  schemaVersion: VersionV2Schema,
  code: z.enum([
    "REFERENCE_NOT_OWNED", "PLAN_NOT_FOUND", "INTENT_CONFLICT", "IDEMPOTENCY_MISMATCH", "STALE_CONTEXT",
    "SCHEDULE_CONFLICT", "CAPACITY_SHORTFALL", "ALLOCATION_UNRESOLVED", "PROTECTED_EXECUTION",
    "QUALITY_BLOCKED", "QUALITY_INCOMPLETE", "PROVIDER_TIMEOUT", "PROVIDER_FAILURE", "OUTPUT_TRUNCATED",
    "INVALID_OUTPUT", "BUDGET_EXHAUSTED", "WORKER_UNAVAILABLE", "LEASE_EXPIRED", "SUPERSEDED",
    "CANCELLED", "PAYLOAD_TOO_LARGE", "SAVE_FAILED", "ALREADY_APPLIED",
  ]),
  stage: PlannerStageV2Schema,
  message: SummaryV2Schema,
  retryable: z.boolean(),
  resumable: z.boolean(),
  fieldRefs: z.array(z.string().min(1).max(200)).max(60),
  activityRefs: z.array(LocalIdV2Schema).max(E.newlyDetailedActivities),
  dates: z.array(DateV2Schema).max(E.newlyDetailedActivities),
  recoveryAction: z.enum([
    "RETRY_STAGE", "REFRESH_PLACEMENT", "REVIEW_CHANGED_INTENT", "ANSWER_QUESTION", "RESOLVE_CONFLICT",
    "OPEN_ACTIVE_PLAN", "WAIT_FOR_WORKER", "NONE",
  ]),
  traceId: DurableIdV2Schema,
});

export const RuntimeBudgetV2Schema = z.strictObject({
  rootRequestId: DurableIdV2Schema,
  profile: z.enum(["ADVICE", "CALENDAR_ONLY", "EDUCATIONAL", "RESEARCH"]),
  foregroundProcessingMs: z.number().int().nonnegative(),
  processingStartedAt: InstantV2Schema.nullable(),
  executionDeadlineAt: InstantV2Schema.nullable(),
  consumed: z.strictObject({
    modelCalls: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    planningCalls: z.number().int().min(0).max(5),
    researchSynthesisCalls: z.number().int().min(0).max(2),
    researchQueries: z.number().int().min(0).max(E.researchQueries),
    fetchAttempts: z.number().int().min(0).max(E.fetchAttempts),
    selectedSourceCharacters: z.number().int().min(0).max(E.sourceCharacters),
    extractedPages: z.number().int().min(0).max(E.extractedPages),
    ocrPages: z.number().int().min(0).max(E.ocrPages),
    followUps: z.number().int().min(0).max(E.followUps),
  }),
  reserved: z.strictObject({
    modelCalls: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
  }),
}).superRefine((budget, ctx) => {
  const limit = PLANNER_V2_BUDGETS[budget.profile];
  if (budget.foregroundProcessingMs > limit.executionSeconds * 1000) issue(ctx, ["foregroundProcessingMs"], "Foreground processing exceeds the execution budget");
  for (const field of ["modelCalls", "inputTokens", "outputTokens"] as const) {
    const hasReservation = Object.values(budget.reserved).some(value => value > 0);
    // Actual provider usage may exceed its estimate; retain that fact in a terminal
    // failure rather than making truthful accounting impossible to serialize.
    if ((field === "modelCalls" || hasReservation) && budget.consumed[field] + budget.reserved[field] > limit[field]) issue(ctx, ["consumed", field], "ROOT_BUDGET_EXHAUSTED");
  }
  if (budget.consumed.planningCalls + budget.consumed.researchSynthesisCalls > budget.consumed.modelCalls) {
    issue(ctx, ["consumed"], "Specialized calls are included in the root model-call counter");
  }
  if ((budget.processingStartedAt === null) !== (budget.executionDeadlineAt === null)) {
    issue(ctx, ["executionDeadlineAt"], "Processing start and deadline must be bound together");
  }
  if (budget.processingStartedAt && budget.executionDeadlineAt) {
    const duration = Date.parse(budget.executionDeadlineAt) - Date.parse(budget.processingStartedAt);
    if (duration <= 0 || duration > limit.executionSeconds * 1000 - budget.foregroundProcessingMs) issue(ctx, ["executionDeadlineAt"], "Execution deadline exceeds the selected root profile after foreground processing");
  }
});

export const AttemptTargetV2Schema = z.strictObject({
  planId: DurableIdV2Schema,
  requestedIntentVersionId: DurableIdV2Schema,
  resolvedIntentVersionId: DurableIdV2Schema.nullable(),
  resolution: z.enum(["UNCHANGED", "RESEARCH_ADOPTION"]).nullable(),
  baseActiveRevisionId: DurableIdV2Schema.nullable(),
  sourceCandidateRevisionId: DurableIdV2Schema.nullable(),
  planningVersion: z.number().int().nonnegative(),
  resolvedPlanningVersion: z.number().int().nonnegative().nullable(),
  contextDigest: DigestV2Schema.nullable(),
}).superRefine((target, ctx) => {
  if ((target.resolvedIntentVersionId === null) !== (target.resolution === null)) issue(ctx, ["resolution"], "Resolved identity and reason are bound together");
  if ((target.resolvedIntentVersionId === null) !== (target.resolvedPlanningVersion === null)) issue(ctx, ["resolvedPlanningVersion"], "Resolved intent and planning version are bound atomically");
  if (target.resolution === "UNCHANGED" && target.resolvedIntentVersionId !== target.requestedIntentVersionId) {
    issue(ctx, ["resolvedIntentVersionId"], "Unchanged resolution must retain the requested identity");
  }
  if (target.resolution === "UNCHANGED" && target.resolvedPlanningVersion !== target.planningVersion) issue(ctx, ["resolvedPlanningVersion"], "Unchanged resolution keeps the requested planning version");
  if (target.resolution === "RESEARCH_ADOPTION" && target.resolvedPlanningVersion !== target.planningVersion + 1) issue(ctx, ["resolvedPlanningVersion"], "Atomic research adoption advances the planning version once");
  if (target.resolution === "RESEARCH_ADOPTION" && target.resolvedIntentVersionId === target.requestedIntentVersionId) {
    issue(ctx, ["resolvedIntentVersionId"], "Research adoption creates a derived intent version");
  }
});

export const ApplyReceiptV2Schema = z.strictObject({
  receiptId: DurableIdV2Schema,
  changeSetId: DurableIdV2Schema,
  confirmedAt: InstantV2Schema,
  targets: z.array(z.strictObject({ planId: DurableIdV2Schema, revisionId: DurableIdV2Schema, revisionDigest: DigestV2Schema })).min(1).max(E.targets),
}).superRefine((receipt, ctx) => unique(receipt.targets.map(target => target.planId), ctx, ["targets"]));

/** Artifact on the existing accounting path; not a second queue or new entity. */
export const ProviderCallReservationV2Schema = z.strictObject({
  schemaVersion: VersionV2Schema, callId: DurableIdV2Schema, rootRequestId: DurableIdV2Schema,
  attemptId: DurableIdV2Schema.nullable(), fence: z.number().int().nonnegative(), stage: PlannerStageV2Schema,
  provider: z.string().min(1).max(100), model: z.string().min(1).max(100),
  reservedInputTokens: z.number().int().nonnegative(), reservedOutputTokens: z.number().int().nonnegative(),
  state: z.enum(["RESERVED", "DISPATCHED", "SETTLED", "UNKNOWN_SPEND", "CANCELLED_BEFORE_DISPATCH"]),
  actualInputTokens: z.number().int().nonnegative().nullable(), actualOutputTokens: z.number().int().nonnegative().nullable(),
  costUsd: z.number().nonnegative().nullable(), pricing: z.enum(["KNOWN", "UNKNOWN"]),
  settlementKey: z.string().min(8).max(100),
}).superRefine((call, ctx) => {
  if (call.pricing === "UNKNOWN" && call.costUsd !== null) issue(ctx, ["costUsd"], "Unknown pricing is never recorded as zero cost");
  if (call.state === "SETTLED" && (call.actualInputTokens === null || call.actualOutputTokens === null)) issue(ctx, [], "Settled calls retain actual token usage even when pricing is unknown");
  if (call.state === "SETTLED" && call.pricing === "KNOWN" && call.costUsd === null) issue(ctx, ["costUsd"], "Known settled pricing retains the actual charge");
  if (call.state === "UNKNOWN_SPEND" && call.costUsd !== null) issue(ctx, ["costUsd"], "Unknown spend cannot pretend an actual charge is known");
  if (call.state === "CANCELLED_BEFORE_DISPATCH" && (call.actualInputTokens !== 0 || call.actualOutputTokens !== 0 || call.costUsd !== 0 || call.pricing !== "KNOWN")) issue(ctx, [], "A proven undispatched cancellation has zero spend");
});

export const PlannerAttemptV2Schema = withPlannerEnvelope(z.strictObject({
  schemaVersion: VersionV2Schema,
  attemptId: DurableIdV2Schema,
  ownerId: EntityIdV2Schema,
  kind: z.enum(["PLAN", "REPLAN", "EXPAND", "JOINT", "RESEARCH_ADVICE"]),
  state: z.enum(["QUEUED", "RUNNING", "NEEDS_DECISION", "SUCCEEDED", "FAILED", "CANCELLED", "SUPERSEDED"]),
  stage: PlannerStageV2Schema,
  idempotencyKey: z.string().min(8).max(100).regex(/^[A-Za-z0-9_-]+$/),
  requestHash: DigestV2Schema,
  requestedAt: InstantV2Schema,
  parentAttemptId: DurableIdV2Schema.nullable(),
  acceptedRequest: z.strictObject({
    text: ProseV2Schema,
    authorization: z.enum(["PLAN_ACTION", "RESEARCH_ONLY"]),
    researchRequested: z.boolean(),
    targetAuthorizationDigest: DigestV2Schema,
  }),
  targets: z.array(AttemptTargetV2Schema).max(E.targets),
  budget: RuntimeBudgetV2Schema,
  fence: z.number().int().nonnegative(),
  lease: z.strictObject({ owner: z.string().min(1).max(100), fence: z.number().int().positive(), expiresAt: InstantV2Schema }).nullable(),
  checkpoint: z.strictObject({ stage: PlannerStageV2Schema, digest: DigestV2Schema, persistedAt: InstantV2Schema }).nullable(),
  question: SummaryV2Schema.nullable(),
  error: PlannerErrorV2Schema.nullable(),
  result: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("RESEARCH_ANSWER"), answer: ProseV2Schema, evidenceDigest: DigestV2Schema }),
    z.strictObject({
      kind: z.literal("REVISIONS"),
      revisions: z.array(z.strictObject({ planId: DurableIdV2Schema, revisionId: DurableIdV2Schema, digest: DigestV2Schema })).min(1).max(E.targets),
    }),
  ]).nullable(),
  applyReceipt: ApplyReceiptV2Schema.nullable(),
}).superRefine((attempt, ctx) => {
  unique(attempt.targets.map(target => target.planId), ctx, ["targets"]);
  const readOnly = attempt.kind === "RESEARCH_ADVICE";
  const rootLimit = PLANNER_V2_BUDGETS[attempt.budget.profile];
  if ((attempt.budget.consumed.inputTokens > rootLimit.inputTokens || attempt.budget.consumed.outputTokens > rootLimit.outputTokens) &&
    !["FAILED", "CANCELLED", "SUPERSEDED"].includes(attempt.state)) issue(ctx, ["budget"], "Actual token overrun must terminate before further work or publication");
  if (readOnly && (attempt.targets.length !== 0 || attempt.applyReceipt !== null || attempt.result?.kind === "REVISIONS" ||
    attempt.acceptedRequest.authorization !== "RESEARCH_ONLY" || attempt.budget.profile !== "RESEARCH")) {
    issue(ctx, [], "Read-only research has zero mutation targets, no revisions/receipt and a research budget");
  }
  if (readOnly && (attempt.budget.consumed.planningCalls > 0 || ["BLUEPRINT", "ALLOCATION", "ADAPTATION", "REPAIR", "APPLY"].includes(attempt.stage))) {
    issue(ctx, ["stage"], "Read-only research cannot run educational compilation or apply");
  }
  if (!readOnly && (attempt.targets.length === 0 || attempt.acceptedRequest.authorization !== "PLAN_ACTION" ||
    attempt.result?.kind === "RESEARCH_ANSWER" || attempt.budget.profile === "ADVICE")) issue(ctx, [], "Planning requires authorized Plan targets");
  if (attempt.kind === "JOINT" && attempt.targets.length !== 2) issue(ctx, ["targets"], "Joint planning requires two targets");
  if (attempt.kind !== "JOINT" && !readOnly && attempt.targets.length !== 1) issue(ctx, ["targets"], "Use the joint operation for two targets");
  if (attempt.state === "SUCCEEDED" && attempt.result === null) issue(ctx, ["result"], "Successful attempts require a durable result");
  if (attempt.state !== "SUCCEEDED" && attempt.result !== null) issue(ctx, ["result"], "Only successful attempts publish results");
  if (attempt.state === "FAILED" && attempt.error === null) issue(ctx, ["error"], "Failed attempts require specific recovery information");
  if (attempt.error && attempt.error.stage !== attempt.stage) issue(ctx, ["error", "stage"], "Failure and durable attempt stage must correspond");
  if (attempt.state === "NEEDS_DECISION" && attempt.question === null) issue(ctx, ["question"], "Decision-needed attempts require a material question");
  if (attempt.state === "RUNNING" && attempt.lease === null) issue(ctx, ["lease"], "Running attempts require a fenced lease");
  if (attempt.lease && attempt.lease.fence !== attempt.fence) issue(ctx, ["lease", "fence"], "Lease fence must match the durable attempt fence");
  if (attempt.state !== "RUNNING" && attempt.lease !== null) issue(ctx, ["lease"], "Only running attempts hold a lease");
  if (attempt.state !== "FAILED" && attempt.error !== null) issue(ctx, ["error"], "Only failed attempts carry a recovery error");
  if (attempt.state !== "NEEDS_DECISION" && attempt.question !== null) issue(ctx, ["question"], "Only decision-needed attempts carry a blocking question");
  const resolvedStages = ["BLUEPRINT", "ALLOCATION", "ADAPTATION", "REVIEW", "REPAIR", "VERIFICATION", "PERSISTENCE", "APPLY"];
  if (!readOnly && (resolvedStages.includes(attempt.stage) || attempt.state === "SUCCEEDED") &&
    attempt.targets.some(target => target.resolvedIntentVersionId === null || target.contextDigest === null)) {
    issue(ctx, ["targets"], "Educational work requires write-once resolved intent and pinned context");
  }
  if (attempt.result?.kind === "REVISIONS") {
    unique(attempt.result.revisions.map(revision => revision.planId), ctx, ["result", "revisions"]);
    const expected = [...attempt.targets.map(target => target.planId)].sort();
    if (JSON.stringify(expected) !== JSON.stringify(attempt.result.revisions.map(revision => revision.planId).sort())) {
      issue(ctx, ["result", "revisions"], "Results must cover exactly the selected targets");
    }
  }
  if (attempt.applyReceipt && (attempt.state !== "SUCCEEDED" || attempt.result?.kind !== "REVISIONS")) issue(ctx, ["applyReceipt"], "Only successful planning results can be applied");
  if (attempt.applyReceipt && attempt.result?.kind === "REVISIONS") {
    const revisions = new Map(attempt.result.revisions.map(revision => [revision.planId, revision]));
    if (attempt.applyReceipt.targets.length !== revisions.size || attempt.applyReceipt.targets.some(target => {
      const revision = revisions.get(target.planId);
      return !revision || revision.revisionId !== target.revisionId || revision.digest !== target.revisionDigest;
    })) issue(ctx, ["applyReceipt"], "Apply receipt must match every published revision");
  }
}));

export type PlannerAttemptV2 = z.infer<typeof PlannerAttemptV2Schema>;
export type RuntimeBudgetV2 = z.infer<typeof RuntimeBudgetV2Schema>;
export type PlannerErrorV2 = z.infer<typeof PlannerErrorV2Schema>;
export type ApplyReceiptV2 = z.infer<typeof ApplyReceiptV2Schema>;

/** Cross-snapshot invariants complement shape checks; they do not perform persistence. */
export function validateAttemptTransition(before: PlannerAttemptV2, after: PlannerAttemptV2): string[] {
  const errors: string[] = [];
  if (["FAILED", "CANCELLED", "SUPERSEDED"].includes(before.state) && JSON.stringify(before) !== JSON.stringify(after)) {
    errors.push("TERMINAL_ATTEMPT_IMMUTABLE");
  }
  if (before.state === "SUCCEEDED" && JSON.stringify({ ...before, applyReceipt: null }) !== JSON.stringify({ ...after, applyReceipt: null })) {
    errors.push("SUCCESSFUL_ATTEMPT_IMMUTABLE_EXCEPT_RECEIPT");
  }
  if (before.state === "NEEDS_DECISION" && JSON.stringify({ ...before, state: null, question: null }) !== JSON.stringify({ ...after, state: null, question: null })) {
    errors.push("PAUSED_ATTEMPT_BINDINGS_IMMUTABLE");
  }
  for (const key of ["attemptId", "ownerId", "kind", "idempotencyKey", "requestHash", "requestedAt", "parentAttemptId"] as const) {
    if (before[key] !== after[key]) errors.push(`IMMUTABLE_ATTEMPT_FIELD:${key}`);
  }
  if (JSON.stringify(before.acceptedRequest) !== JSON.stringify(after.acceptedRequest)) errors.push("IMMUTABLE_ACCEPTED_REQUEST");
  const allowed: Record<PlannerAttemptV2["state"], readonly PlannerAttemptV2["state"][]> = {
    QUEUED: ["QUEUED", "RUNNING", "CANCELLED", "SUPERSEDED", "FAILED"],
    RUNNING: ["RUNNING", "QUEUED", "NEEDS_DECISION", "SUCCEEDED", "FAILED", "CANCELLED", "SUPERSEDED"],
    NEEDS_DECISION: ["NEEDS_DECISION", "CANCELLED", "SUPERSEDED"],
    SUCCEEDED: ["SUCCEEDED"], FAILED: ["FAILED"], CANCELLED: ["CANCELLED"], SUPERSEDED: ["SUPERSEDED"],
  };
  if (!allowed[before.state].includes(after.state)) errors.push("INVALID_ATTEMPT_STATE_TRANSITION");
  if (before.targets.length !== after.targets.length) errors.push("IMMUTABLE_ATTEMPT_TARGETS");
  const afterTargets = new Map(after.targets.map(target => [target.planId, target]));
  for (const target of before.targets) {
    const next = afterTargets.get(target.planId);
    if (!next) { errors.push("IMMUTABLE_ATTEMPT_TARGETS"); continue; }
    for (const key of ["requestedIntentVersionId", "baseActiveRevisionId", "sourceCandidateRevisionId", "planningVersion"] as const) {
      if (target[key] !== next[key]) errors.push(`IMMUTABLE_TARGET_FIELD:${key}`);
    }
    if (target.resolvedIntentVersionId !== null && (target.resolvedIntentVersionId !== next.resolvedIntentVersionId || target.resolution !== next.resolution || target.resolvedPlanningVersion !== next.resolvedPlanningVersion)) {
      errors.push("RESOLVED_INTENT_ALREADY_BOUND");
    }
    if (target.contextDigest !== null && target.contextDigest !== next.contextDigest) errors.push("PINNED_CONTEXT_ALREADY_BOUND");
  }
  if (before.targets.some(target => {
    const next = afterTargets.get(target.planId);
    return next && (target.contextDigest === null && next.contextDigest !== null || target.resolvedIntentVersionId === null && next.resolvedIntentVersionId !== null);
  }) && after.state !== "RUNNING") errors.push("RESOLUTION_REQUIRES_FENCED_RUNNING_ATTEMPT");
  if (before.result && JSON.stringify(before.result) !== JSON.stringify(after.result)) errors.push("PUBLISHED_RESULT_IMMUTABLE");
  if (before.applyReceipt && JSON.stringify(before.applyReceipt) !== JSON.stringify(after.applyReceipt)) errors.push("APPLY_RECEIPT_WRITE_ONCE");
  const profiles = ["ADVICE", "CALENDAR_ONLY", "EDUCATIONAL", "RESEARCH"];
  if (profiles.indexOf(after.budget.profile) < profiles.indexOf(before.budget.profile)) errors.push("ROOT_PROFILE_CANNOT_DOWNGRADE");
  if (before.budget.rootRequestId !== after.budget.rootRequestId) errors.push("ROOT_BUDGET_IDENTITY_IMMUTABLE");
  if (before.budget.processingStartedAt && before.budget.processingStartedAt !== after.budget.processingStartedAt) errors.push("PROCESSING_START_IMMUTABLE");
  if (after.budget.foregroundProcessingMs < before.budget.foregroundProcessingMs ||
    (before.budget.processingStartedAt && after.budget.foregroundProcessingMs !== before.budget.foregroundProcessingMs)) errors.push("FOREGROUND_PROCESSING_CANNOT_RESET");
  if (before.budget.executionDeadlineAt && before.budget.profile === after.budget.profile &&
    before.budget.executionDeadlineAt !== after.budget.executionDeadlineAt) errors.push("TAKEOVER_CANNOT_RESET_DEADLINE");
  for (const key of Object.keys(before.budget.consumed) as (keyof RuntimeBudgetV2["consumed"])[]) {
    if (after.budget.consumed[key] < before.budget.consumed[key]) errors.push(`ROOT_COUNTER_CANNOT_RESET:${key}`);
  }
  if (after.fence < before.fence) errors.push("FENCE_CANNOT_DECREASE");
  if (after.state === "RUNNING" && before.state !== "RUNNING" && after.fence <= before.fence) errors.push("CLAIM_REQUIRES_NEW_FENCE");
  if (before.lease && after.lease && before.lease.owner !== after.lease.owner && after.fence <= before.fence) errors.push("TAKEOVER_REQUIRES_NEW_FENCE");
  return [...new Set(errors)];
}
