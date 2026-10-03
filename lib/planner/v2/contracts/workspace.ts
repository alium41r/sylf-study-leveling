import { z } from "zod";
import { withPlannerEnvelope } from "./envelope";
import { PlannerErrorV2Schema, PlannerStageV2Schema } from "./operations";
import {
  DateV2Schema, DigestV2Schema, DurableIdV2Schema, EffortRangeV2Schema, EntityIdV2Schema,
  InstantV2Schema, PolicyV2Schema, SummaryV2Schema, VersionV2Schema, issue,
} from "./primitives";

const revisionView = z.strictObject({
  revisionId: DurableIdV2Schema,
  resolvedIntentVersionId: DurableIdV2Schema,
  resolvedPlanningVersion: z.number().int().nonnegative(),
  digest: DigestV2Schema,
  title: SummaryV2Schema,
  policy: PolicyV2Schema,
  recommendedEffort: EffortRangeV2Schema,
  committedMinutes: z.number().int().nonnegative(),
  primaryFinishDate: DateV2Schema.nullable(),
});

export const PlannerWorkspaceV2Schema = withPlannerEnvelope(z.strictObject({
  schemaVersion: VersionV2Schema,
  planId: DurableIdV2Schema,
  ownerId: EntityIdV2Schema,
  planState: z.enum(["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"]),
  planningVersion: z.number().int().nonnegative(),
  conversationVersion: z.number().int().nonnegative(),
  workingIntentVersionId: DurableIdV2Schema,
  phase: z.enum(["INTAKE", "READY", "PLANNING", "NEEDS_DECISION", "REVIEW", "UPDATE_REQUIRED", "RECOVERY", "IDLE"]),
  active: revisionView.nullable(),
  candidate: revisionView.extend({
    attemptId: DurableIdV2Schema,
    changeSetId: DurableIdV2Schema,
    confirmed: z.literal(false),
    freshness: z.enum(["CURRENT", "STALE"]),
    staleReasons: z.array(SummaryV2Schema).max(20),
    qualityStatus: z.literal("PASSED"),
  }).nullable(),
  attempt: z.strictObject({
    attemptId: DurableIdV2Schema,
    kind: z.enum(["PLAN", "REPLAN", "EXPAND", "JOINT"]),
    state: z.enum(["QUEUED", "RUNNING", "NEEDS_DECISION", "SUCCEEDED", "FAILED", "CANCELLED", "SUPERSEDED"]),
    stage: PlannerStageV2Schema,
    error: PlannerErrorV2Schema.nullable(),
    question: SummaryV2Schema.nullable(),
    requestedAt: InstantV2Schema,
  }).nullable(),
  scheduleHealth: z.enum(["HEALTHY", "CONFLICT", "UPDATE_SUGGESTED", "NOT_SCHEDULED"]),
  requiresReestimate: z.boolean(),
  locallyDirty: z.boolean(),
  nextAction: z.enum(["ANSWER", "GENERATE", "WAIT", "REVIEW", "CONFIRM", "UPDATE", "RETRY", "STUDY", "NONE"]),
  allowedActions: z.array(z.enum(["ANSWER", "GENERATE", "CANCEL", "REVIEW", "CONFIRM", "UPDATE", "RETRY", "STUDY", "ADVICE", "ARCHIVE"])).max(10),
}).superRefine((workspace, ctx) => {
  if (new Set(workspace.allowedActions).size !== workspace.allowedActions.length) issue(ctx, ["allowedActions"], "Duplicate workspace action");
  if (workspace.planState === "ACTIVE" && workspace.active === null) issue(ctx, ["active"], "An active Plan requires its confirmed revision");
  if (workspace.planState === "DRAFT" && workspace.active !== null) issue(ctx, ["active"], "A draft cannot present a confirmed active revision");
  if (workspace.active && workspace.candidate?.revisionId === workspace.active.revisionId) issue(ctx, ["candidate"], "An active revision is never an unconfirmed candidate");
  if (workspace.candidate?.freshness === "CURRENT" && workspace.candidate.resolvedIntentVersionId !== workspace.workingIntentVersionId) {
    issue(ctx, ["candidate"], "A current candidate must belong to the working intent");
  }
  if (workspace.candidate?.freshness === "CURRENT" && workspace.candidate.resolvedPlanningVersion !== workspace.planningVersion) issue(ctx, ["candidate"], "A current candidate must match the accepted planning version");
  if (workspace.candidate?.freshness === "CURRENT" && workspace.candidate.staleReasons.length > 0) issue(ctx, ["candidate", "staleReasons"], "Current candidates cannot have stale reasons");
  if (workspace.candidate?.freshness === "STALE" && workspace.candidate.staleReasons.length === 0) issue(ctx, ["candidate", "staleReasons"], "Stale candidates require a truthful explanation");
  const confirmable = workspace.candidate?.freshness === "CURRENT" && !workspace.locallyDirty && workspace.phase === "REVIEW" &&
    !workspace.requiresReestimate && workspace.planState !== "ARCHIVED" && workspace.planState !== "COMPLETED";
  if (workspace.requiresReestimate && workspace.scheduleHealth === "HEALTHY") issue(ctx, ["scheduleHealth"], "Unresolved remaining effort cannot be presented as a healthy schedule");
  if ((workspace.allowedActions.includes("CONFIRM") || workspace.nextAction === "CONFIRM") && !confirmable) issue(ctx, ["allowedActions"], "Only the current reviewed candidate can be confirmed");
  if (workspace.phase === "REVIEW" && workspace.candidate?.freshness !== "CURRENT") issue(ctx, ["phase"], "Review requires a current sealed candidate");
  if (workspace.phase === "PLANNING" && (!workspace.attempt || !["QUEUED", "RUNNING"].includes(workspace.attempt.state))) {
    issue(ctx, ["attempt"], "Planning phase requires a live durable attempt");
  }
  if (workspace.phase === "NEEDS_DECISION" && (workspace.attempt?.state !== "NEEDS_DECISION" || !workspace.attempt.question)) {
    issue(ctx, ["attempt"], "Decision phase requires a material paused question");
  }
  if (workspace.phase === "RECOVERY" && (workspace.attempt?.state !== "FAILED" || !workspace.attempt.error)) {
    issue(ctx, ["attempt"], "Recovery must identify a failed stage");
  }
}));

export type PlannerWorkspaceV2 = z.infer<typeof PlannerWorkspaceV2Schema>;
