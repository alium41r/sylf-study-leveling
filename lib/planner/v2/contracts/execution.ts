import { z } from "zod";
import { PLANNER_V2_ENVELOPE as E, withPlannerEnvelope } from "./envelope";
import {
  CriterionV2Schema, DateV2Schema, DigestV2Schema, DurableIdV2Schema, EntityIdV2Schema,
  LocalIdV2Schema, ProseV2Schema, RemainingMinutesV2Schema, SummaryV2Schema,
  TimeboxV2Schema, TimezoneV2Schema, TitleV2Schema, VersionV2Schema, issue, unique,
} from "./primitives";

export const ExecutionTaskSpecV2Schema = withPlannerEnvelope(z.strictObject({
  schemaVersion: VersionV2Schema,
  activityKey: DurableIdV2Schema,
  blueprintActivityId: LocalIdV2Schema,
  planId: DurableIdV2Schema,
  goalId: EntityIdV2Schema,
  content: z.strictObject({
    title: TitleV2Schema,
    instructions: ProseV2Schema,
    completionCriterion: CriterionV2Schema,
    outcomeRefs: z.array(LocalIdV2Schema).max(E.referencesPerActivity),
    scopeRefs: z.array(LocalIdV2Schema).max(E.referencesPerActivity),
    activityType: z.string().trim().min(1).max(80),
    purpose: SummaryV2Schema,
    stage: TitleV2Schema.optional(),
    resources: z.array(z.strictObject({ ref: LocalIdV2Schema, versionDigest: DigestV2Schema })).max(E.referencesPerActivity),
    hardDependencies: z.array(DurableIdV2Schema).max(E.referencesPerActivity),
  }),
  effort: z.strictObject({
    plannedMinutes: TimeboxV2Schema,
    remainingMinutesEstimate: RemainingMinutesV2Schema,
    remainingEstimateBasisActualSeconds: z.number().int().nonnegative(),
  }),
  placement: z.strictObject({ date: DateV2Schema, timezone: TimezoneV2Schema }),
  continuesActivityKey: DurableIdV2Schema.optional(),
}).superRefine((spec, ctx) => {
  for (const field of ["outcomeRefs", "scopeRefs", "hardDependencies"] as const) unique(spec.content[field], ctx, ["content", field]);
  unique(spec.content.resources.map(resource => resource.ref), ctx, ["content", "resources"]);
  if (spec.content.hardDependencies.includes(spec.activityKey)) issue(ctx, ["content", "hardDependencies"], "SELF_DEPENDENCY");
  if (spec.continuesActivityKey === spec.activityKey) issue(ctx, ["continuesActivityKey"], "An activity cannot continue itself");
}));

export const ExecutionStateV2Schema = z.strictObject({
  schemaVersion: VersionV2Schema,
  activityKey: DurableIdV2Schema,
  state: z.enum(["UNSTARTED", "RUNNING", "PAUSED", "ENDED_INCOMPLETE", "COMPLETED"]),
  remainingDisposition: z.enum(["OPEN", "WITHDRAWN", "COMPLETED"]),
  actualSeconds: z.number().int().nonnegative(),
  executionVersion: z.number().int().nonnegative(),
  remainingMinutesEstimate: RemainingMinutesV2Schema,
  requiresReestimate: z.boolean(),
}).superRefine((execution, ctx) => {
  if (execution.state === "UNSTARTED" && execution.actualSeconds !== 0) issue(ctx, ["actualSeconds"], "Unstarted work cannot contain elapsed study");
  if (execution.remainingDisposition === "OPEN" && execution.remainingMinutesEstimate === 0 && execution.state !== "COMPLETED") {
    issue(ctx, ["remainingMinutesEstimate"], "Incomplete open work cannot silently reserve zero remaining effort");
  }
  if (execution.state === "COMPLETED" && execution.remainingDisposition !== "COMPLETED") issue(ctx, ["remainingDisposition"], "Completed work has a completed disposition");
  if (execution.remainingDisposition === "COMPLETED" && execution.state !== "COMPLETED") issue(ctx, ["state"], "Only completed work has a completed remaining disposition");
  if (execution.state === "UNSTARTED" && execution.remainingDisposition !== "OPEN") issue(ctx, ["remainingDisposition"], "Unstarted execution remains open");
  if (execution.remainingDisposition !== "OPEN" && execution.remainingMinutesEstimate !== 0) issue(ctx, ["remainingMinutesEstimate"], "Closed remaining work reserves no future minutes");
  if (execution.state === "RUNNING" && execution.remainingDisposition !== "OPEN") issue(ctx, ["state"], "Withdrawn/completed work cannot be running");
  if (execution.state !== "UNSTARTED" && execution.executionVersion === 0) issue(ctx, ["executionVersion"], "A zero-second start still advances execution protection");
  if (execution.requiresReestimate && (execution.remainingDisposition !== "OPEN" || execution.state === "UNSTARTED")) issue(ctx, ["requiresReestimate"], "Only started open work can require a new remaining estimate");
});

export const SemanticChangeV2Schema = z.enum(["KEPT", "MOVED", "SHORTENED", "EXPANDED", "CHANGED", "REMOVED", "ADDED"]);
export type ExecutionTaskSpecV2 = z.infer<typeof ExecutionTaskSpecV2Schema>;
export type ExecutionStateV2 = z.infer<typeof ExecutionStateV2Schema>;
export type SemanticChangeV2 = z.infer<typeof SemanticChangeV2Schema>;

/** Derive a live forecast from an approved estimate without modifying the sealed specification. */
export function deriveRemainingWorkV2(
  effort: ExecutionTaskSpecV2["effort"],
  actualSeconds: number,
  disposition: ExecutionStateV2["remainingDisposition"] = "OPEN",
): { remainingMinutesEstimate: number; requiresReestimate: boolean } {
  if (!Number.isInteger(actualSeconds) || actualSeconds < effort.remainingEstimateBasisActualSeconds) {
    throw new Error("ACTUAL_TIME_CANNOT_PRECEDE_ESTIMATE_BASIS");
  }
  if (disposition !== "OPEN") return { remainingMinutesEstimate: 0, requiresReestimate: false };
  const residual = effort.remainingMinutesEstimate - (actualSeconds - effort.remainingEstimateBasisActualSeconds) / 60;
  return { remainingMinutesEstimate: Math.max(1, Math.ceil(residual)), requiresReestimate: residual <= 0 };
}

export function validateExecutionDurationV2(spec: ExecutionTaskSpecV2, execution: ExecutionStateV2): string[] {
  if (spec.activityKey !== execution.activityKey) return ["EXECUTION_IDENTITY_MISMATCH"];
  const errors: string[] = [];
  if (spec.effort.remainingEstimateBasisActualSeconds > execution.actualSeconds) errors.push("ESTIMATE_BASIS_AHEAD_OF_ACTUAL_TIME");
  if (execution.state === "UNSTARTED" && (spec.effort.remainingEstimateBasisActualSeconds !== 0 ||
    spec.effort.remainingMinutesEstimate !== spec.effort.plannedMinutes || execution.remainingMinutesEstimate !== spec.effort.plannedMinutes)) {
    errors.push("UNSTARTED_RESERVE_MUST_EQUAL_APPROVED_TIMEBOX");
  }
  if (!errors.length) {
    const forecast = deriveRemainingWorkV2(spec.effort, execution.actualSeconds, execution.remainingDisposition);
    if (forecast.remainingMinutesEstimate !== execution.remainingMinutesEstimate) errors.push("LIVE_REMAINING_FORECAST_MISMATCH");
    if (forecast.requiresReestimate !== execution.requiresReestimate) errors.push("LIVE_REESTIMATE_DECISION_MISMATCH");
  }
  return errors;
}

/** Reference arrays are sets; instructions and criteria compare exactly after schema normalization. */
export function canonicalExecutionContent(spec: ExecutionTaskSpecV2): string {
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

export function compareExecutionSpecs(before: ExecutionTaskSpecV2 | null, after: ExecutionTaskSpecV2 | null): SemanticChangeV2[] {
  if (!before && !after) throw new Error("A semantic comparison requires at least one specification");
  if (!before) return ["ADDED"];
  if (!after) return ["REMOVED"];
  if (before.activityKey !== after.activityKey) throw new Error("Replacement identities require separate removed/added entries");
  const changes: SemanticChangeV2[] = [];
  if (before.placement.date !== after.placement.date || before.placement.timezone !== after.placement.timezone) changes.push("MOVED");
  const plannedDelta = after.effort.plannedMinutes - before.effort.plannedMinutes;
  const remainingDelta = after.effort.remainingMinutesEstimate - before.effort.remainingMinutesEstimate;
  if (plannedDelta < 0 || remainingDelta < 0) changes.push("SHORTENED");
  if (plannedDelta > 0 || remainingDelta > 0) changes.push("EXPANDED");
  if (canonicalExecutionContent(before) !== canonicalExecutionContent(after)) changes.push("CHANGED");
  if (changes.length === 0 && before.effort.remainingEstimateBasisActualSeconds !== after.effort.remainingEstimateBasisActualSeconds) changes.push("CHANGED");
  return changes.length ? changes : ["KEPT"];
}

export const SemanticDiffEntryV2Schema = z.strictObject({
  activityKey: DurableIdV2Schema,
  before: ExecutionTaskSpecV2Schema.nullable(),
  after: ExecutionTaskSpecV2Schema.nullable(),
  changes: z.array(SemanticChangeV2Schema).min(1).max(4),
  reason: SummaryV2Schema,
}).superRefine((entry, ctx) => {
  if (!entry.before && !entry.after) { issue(ctx, [], "An entry requires a before or after specification"); return; }
  if ((entry.before && entry.before.activityKey !== entry.activityKey) || (entry.after && entry.after.activityKey !== entry.activityKey)) {
    issue(ctx, ["activityKey"], "Diff identity must match both specifications"); return;
  }
  const expected = compareExecutionSpecs(entry.before, entry.after);
  if (JSON.stringify([...entry.changes].sort()) !== JSON.stringify([...expected].sort())) issue(ctx, ["changes"], "Diff labels must match semantic content, effort and placement");
});

const sealedSpecSummary = z.strictObject({
  specDigest: DigestV2Schema,
  contentDigest: DigestV2Schema,
  date: DateV2Schema,
  timezone: TimezoneV2Schema,
  plannedMinutes: TimeboxV2Schema,
  remainingMinutesEstimate: RemainingMinutesV2Schema,
  remainingEstimateBasisActualSeconds: z.number().int().nonnegative(),
});

/** Persist exact-spec pointers plus review facts; do not duplicate full instructions in every diff. */
export const SealedSemanticDiffEntryV2Schema = z.strictObject({
  activityKey: DurableIdV2Schema,
  planId: DurableIdV2Schema,
  before: sealedSpecSummary.nullable(),
  after: sealedSpecSummary.nullable(),
  changes: z.array(SemanticChangeV2Schema).min(1).max(4),
  reason: SummaryV2Schema,
}).superRefine((entry, ctx) => {
  if (!entry.before && !entry.after) { issue(ctx, [], "A sealed diff requires a specification pointer"); return; }
  const expected: SemanticChangeV2[] = [];
  if (!entry.before) expected.push("ADDED");
  else if (!entry.after) expected.push("REMOVED");
  else {
    const before = entry.before; const after = entry.after;
    if (before.date !== after.date || before.timezone !== after.timezone) expected.push("MOVED");
    if (after.plannedMinutes < before.plannedMinutes || after.remainingMinutesEstimate < before.remainingMinutesEstimate) expected.push("SHORTENED");
    if (after.plannedMinutes > before.plannedMinutes || after.remainingMinutesEstimate > before.remainingMinutesEstimate) expected.push("EXPANDED");
    if (before.contentDigest !== after.contentDigest ||
      (expected.length === 0 && before.remainingEstimateBasisActualSeconds !== after.remainingEstimateBasisActualSeconds)) expected.push("CHANGED");
    if (expected.length === 0) expected.push("KEPT");
    if ((expected[0] === "KEPT") !== (before.specDigest === after.specDigest)) issue(ctx, [], "Specification digests and diff summaries must agree");
  }
  if (JSON.stringify([...entry.changes].sort()) !== JSON.stringify(expected.sort())) issue(ctx, ["changes"], "Sealed diff labels must match its specification summaries");
});

export type SealedSemanticDiffEntryV2 = z.infer<typeof SealedSemanticDiffEntryV2Schema>;

/** Trusted hashing and owned immutable lookup stay outside this client-safe module. */
export function validateSealedDiffCorrespondenceV2(
  entry: SealedSemanticDiffEntryV2,
  before: { spec: ExecutionTaskSpecV2; specDigest: string; contentDigest: string } | null,
  after: { spec: ExecutionTaskSpecV2; specDigest: string; contentDigest: string } | null,
): string[] {
  const errors: string[] = [];
  for (const [side, source] of [["before", before], ["after", after]] as const) {
    const summary = entry[side];
    if (!summary || !source) {
      if (summary !== null || source !== null) errors.push(`DIFF_POINTER_MISMATCH:${side}`);
      continue;
    }
    if (source.spec.activityKey !== entry.activityKey || source.spec.planId !== entry.planId ||
      source.specDigest !== summary.specDigest || source.contentDigest !== summary.contentDigest ||
      source.spec.placement.date !== summary.date || source.spec.placement.timezone !== summary.timezone ||
      source.spec.effort.plannedMinutes !== summary.plannedMinutes || source.spec.effort.remainingMinutesEstimate !== summary.remainingMinutesEstimate ||
      source.spec.effort.remainingEstimateBasisActualSeconds !== summary.remainingEstimateBasisActualSeconds) errors.push(`DIFF_SPECIFICATION_MISMATCH:${side}`);
  }
  if (before || after) {
    if (before && after && before.spec.activityKey !== after.spec.activityKey) errors.push("DIFF_IDENTITY_MISMATCH");
    else if (JSON.stringify(compareExecutionSpecs(before?.spec ?? null, after?.spec ?? null).sort()) !== JSON.stringify([...entry.changes].sort())) errors.push("DIFF_SEMANTIC_LABEL_MISMATCH");
  }
  return errors;
}

/** Pure precondition checks; actual sessions must be loaded and locked by the apply service. */
export function validateProtectedExecutionChange(
  before: ExecutionTaskSpecV2,
  after: ExecutionTaskSpecV2 | null,
  execution: ExecutionStateV2,
  action: "UPDATE" | "WITHDRAW" | "REMOVE",
): string[] {
  if (before.activityKey !== execution.activityKey) return ["EXECUTION_IDENTITY_MISMATCH"];
  if (execution.state === "RUNNING") return ["RUNNING_EXECUTION_PROTECTED"];
  if (execution.state === "COMPLETED" || execution.remainingDisposition !== "OPEN") return ["CLOSED_EXECUTION_PROTECTED"];
  if (execution.state === "UNSTARTED") return [];
  if (action === "REMOVE") return ["STARTED_HISTORY_CANNOT_BE_DELETED"];
  if (action === "WITHDRAW") return after === null ? [] : ["WITHDRAWAL_CANNOT_REWRITE_STARTED_CONTENT"];
  if (!after || canonicalExecutionContent(before) !== canonicalExecutionContent(after)) return ["STARTED_CONTENT_PROTECTED"];
  if (before.effort.plannedMinutes !== after.effort.plannedMinutes) return ["STARTED_TIMEBOX_PROTECTED"];
  return [];
}
