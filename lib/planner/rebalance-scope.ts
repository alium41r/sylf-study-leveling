import type { UserInputV1, ValidatedDraftV1 } from "./contracts";
import type { ExecutionSnapshot, FrozenItemView } from "./rebalance-policy";
import type { RebalanceScope } from "./rebalance-fields";
import { PlannerValidationError } from "./errors";

/**
 * Mode-specific scope and eligibility rules for a replan.
 *
 * Pure functions over the confirmed revision plus the live execution snapshot, so
 * the server, the wizard and the tests all classify the same plan identically. The
 * model never sees a durable identifier: the tokens returned here are plan-local.
 */

/** The window a period revision reads its availability within. */
export function rebalanceScopeFor(
  _input: UserInputV1,
  draft: ValidatedDraftV1,
  milestoneKey: string
): { start: string; end: string } {
  if (draft.mode !== "ROADMAP")
    throw new PlannerValidationError("REBALANCE_SCOPE_NOT_APPLICABLE");
  const milestone = draft.milestones.find((entry) => entry.key === milestoneKey);
  if (!milestone) throw new PlannerValidationError("UNKNOWN_MILESTONE");
  const period = draft.periods?.find((entry) => entry.key === milestone.periodKey);
  if (!period) throw new PlannerValidationError("UNKNOWN_PERIOD");
  return { start: period.startDate, end: period.endDate };
}

/**
 * Which scope a mode may replan. Exam and Mastery reconcile the whole remaining
 * plan; Roadmap reconciles either its strategic layer or exactly one expanded
 * period. Nothing else is supported, and a mismatch is refused rather than guessed.
 */
export function assertPlannerModeScope(
  input: UserInputV1,
  draft: ValidatedDraftV1,
  scope: RebalanceScope
): void {
  if (draft.mode !== input.mode)
    throw new PlannerValidationError("MODE_MISMATCH");
  if (input.mode === "ROADMAP") {
    if (draft.mode !== "ROADMAP")
      throw new PlannerValidationError("MODE_MISMATCH");
    if (scope.milestoneKey === null) {
      // The strategic layer only: an expansion revision is not a plan to rebalance.
      if (draft.expansion)
        throw new PlannerValidationError("REBALANCE_SCOPE_NOT_APPLICABLE");
      return;
    }
    if (!draft.milestones.some((entry) => entry.key === scope.milestoneKey))
      throw new PlannerValidationError("UNKNOWN_MILESTONE");
    return;
  }
  if (scope.milestoneKey !== null)
    throw new PlannerValidationError("REBALANCE_SCOPE_NOT_APPLICABLE");
}

/** The executable items of the confirmed revision, in plan order. */
export function rebalanceItems(
  draft: ValidatedDraftV1
): ValidatedDraftV1["items"] {
  return draft.items.filter((item) => !item.removed);
}

/**
 * Items a replan may actually change, with their stable identity.
 *
 * Two rules compose here: the Quest must be provably unstarted (`execution.eligible`,
 * decided by the server from live state), and the student must not have locked the
 * item. A lock is an explicit instruction, so the planner respects it rather than
 * overriding it — an item the student locked is simply not part of a replan.
 */
export function rebalanceEligible(
  draft: ValidatedDraftV1,
  execution: ExecutionSnapshot
): { key: string; questId: number | null }[] {
  const items = new Map(rebalanceItems(draft).map((item) => [item.key, item]));
  return execution.eligible
    .filter((row) => {
      const item = items.get(row.itemKey);
      return Boolean(item) && item!.locked !== true;
    })
    .map((row) => ({ key: row.itemKey, questId: row.questId }));
}

/** Items the student locked: reported so the UI can explain why they are excluded. */
export function rebalanceLockedItems(
  draft: ValidatedDraftV1,
  execution: ExecutionSnapshot
): string[] {
  const items = new Map(rebalanceItems(draft).map((item) => [item.key, item]));
  return execution.eligible
    .filter((row) => items.get(row.itemKey)?.locked === true)
    .map((row) => row.itemKey);
}

/** The scope ref (`tN`) a durable topic key belongs to, for the validator's view. */
function scopeRefOf(
  input: UserInputV1,
  draft: ValidatedDraftV1,
  topicKey: string
): string {
  const topic = draft.topics.find((entry) => entry.key === topicKey);
  const ref = topic?.scopeRef ?? null;
  if (ref) return ref;
  const index = draft.topics.findIndex((entry) => entry.key === topicKey);
  if (index < 0) throw new PlannerValidationError("UNKNOWN_REFERENCE");
  void input;
  return `t${index + 1}`;
}

/**
 * Frozen history in the validator's currency. A completed stage satisfies the
 * progression, so a replan is never asked to recreate work that already happened.
 */
export function rebalanceFrozenViews(
  input: UserInputV1,
  draft: ValidatedDraftV1,
  execution: ExecutionSnapshot
): FrozenItemView[] {
  const items = new Map(rebalanceItems(draft).map((item) => [item.key, item]));
  const views: FrozenItemView[] = [];
  for (const row of execution.frozen) {
    const item = items.get(row.itemKey);
    if (!item) continue;
    views.push({
      key: item.key,
      topicRef: scopeRefOf(input, draft, item.topicKey),
      relatedTopicRefs: (item.relatedTopicKeys ?? []).map((key) =>
        scopeRefOf(input, draft, key)
      ),
      type: item.type,
      stage: item.stage,
      masteryStage: item.masteryStage,
      title: item.title,
      description: item.description,
      date: item.date,
      minutes: item.minutes,
    });
  }
  return views;
}

/**
 * Roadmap milestones that history has fixed: any milestone in a period that was
 * already expanded, plus any milestone whose own items are frozen. They satisfy
 * coverage and are never re-charged against remaining capacity.
 */
export function rebalanceFrozenMilestoneViews(
  draft: ValidatedDraftV1,
  expandedMilestoneKeys: string[],
  /**
   * `PROPOSAL` refs a model proposal (`tN`/`pN`); `DRAFT` refs a stored draft and
   * keeps the durable milestone key, because that key is what the milestone diff and
   * expansion lineage resolve against. In both currencies the *scope* of an anchor is
   * expressed positionally (`tN` units, `pN` periods): keys are minted per revision,
   * while the confirmed scope order and the deterministic period grid are what every
   * revision of a plan shares.
   */
  currency: "PROPOSAL" | "DRAFT" = "PROPOSAL"
): {
  ref: string;
  title: string;
  date: string;
  periodRef: string;
  outcome: string;
  topicRefs: string[];
  effortMinutes: number;
  dependsOn: string[];
}[] {
  if (draft.mode !== "ROADMAP") return [];
  const frozen = new Set(expandedMilestoneKeys);
  const specs = (draft.periods ?? []).map((period, index) => ({
    key: period.key,
    ref: `p${index + 1}`,
  }));
  const periodRefFor = (periodKey: string | undefined) =>
    specs.find((spec) => spec.key === periodKey)?.ref ?? "p1";
  const unitRefFor = (topicKey: string) =>
    `t${draft.topics.findIndex((topic) => topic.key === topicKey) + 1}`;
  return draft.milestones
    .filter((milestone) => frozen.has(milestone.key) && !milestone.removed)
    .map((milestone) => ({
      ref: currency === "DRAFT" ? milestone.key : `frozen:${milestone.key}`,
      title: milestone.title,
      date: milestone.date,
      periodRef: periodRefFor(milestone.periodKey),
      outcome: milestone.outcome ?? "",
      topicRefs: (milestone.topicKeys ?? []).map(unitRefFor),
      // The effort is history: it counts towards what the unit already received, and
      // is never charged against the remaining capacity (the effort check runs on the
      // proposed milestones alone).
      effortMinutes: milestone.effortMinutes ?? 0,
      dependsOn: [],
    }))
    .filter((milestone) => milestone.topicRefs.length > 0);
}

/**
 * The proposal refs that keep an existing item *unchanged*.
 *
 * These keep their durable identity and their Quest, so nothing is written for them
 * and nothing is charged against capacity a second time. A ref whose content differs
 * is a move: it is charged on its new date, and its old Quest is superseded.
 */
export function retainedIdenticalRefs(
  items: {
    ref: string;
    retainRef?: string | null;
    title: string;
    date: string;
    minutes: number;
    type: string;
  }[],
  tokens: { ref: string; itemKey: string }[],
  baseDraft: ValidatedDraftV1
): Set<string> {
  const byToken = new Map(tokens.map((token) => [token.ref, token.itemKey]));
  const base = new Map(
    baseDraft.items.filter((item) => !item.removed).map((item) => [item.key, item])
  );
  const retained = new Set<string>();
  for (const item of items) {
    if (!item.retainRef) continue;
    const itemKey = byToken.get(item.retainRef);
    if (!itemKey) continue;
    const original = base.get(itemKey);
    if (!original) continue;
    if (
      original.title === item.title &&
      original.date === item.date &&
      original.minutes === item.minutes &&
      original.type === item.type
    )
      retained.add(item.ref);
  }
  return retained;
}

/** The Mastery check item's key, when the confirmed revision carries one. */
export function plannerCheckItemKey(
  draft: ValidatedDraftV1
): string | null {
  if (draft.mode !== "MASTERY") return null;
  return (
    draft.items.find(
      (item) => !item.removed && item.masteryStage === "MASTERY_CHECK"
    )?.key ?? null
  );
}

/** True when a frozen item set already covers every confirmed scope unit. */
export function frozenCoversScope(
  input: UserInputV1,
  frozen: FrozenItemView[]
): boolean {
  const units =
    input.mode === "EXAM"
      ? input.exam?.topics.length ?? 0
      : input.mode === "MASTERY"
        ? input.mastery?.topics.length ?? 0
        : 0;
  if (!units) return false;
  return new Set(frozen.map((item) => item.topicRef)).size >= units;
}

export type { AvailabilitySnapshot } from "./capacity";
