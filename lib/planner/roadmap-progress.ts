/**
 * Conservative Roadmap progress projection (PRD §21.3, Phase 3 §22).
 *
 * Reports only what the planner actually knows: a milestone is planned, expanded
 * or executed. It deliberately does NOT label anything "mastered" — a milestone
 * existing, a Quest existing, a Quest being completed or Focus time being recorded
 * are not evidence of academic mastery. There is no topic coverage map here; that
 * is a later phase's feature and is not implemented under another name.
 */
export const MILESTONE_STATES = [
  "NOT_EXPANDED",
  "EXPANSION_DRAFT",
  "EXPANDED",
  "EXECUTION_CHANGED",
  "PARTIALLY_REMOVED",
  "REMOVED",
  "CONFLICTED",
] as const;
export type MilestoneState = (typeof MILESTONE_STATES)[number];

export interface MilestoneProgressInput {
  milestones: { key: string; periodKey?: string; removed?: boolean }[];
  /**
   * Confirmed and unconfirmed expansion revisions for this plan, already bounded
   * and projected by the server. `confirmed` means the revision carries a
   * write-once confirmation receipt.
   */
  expansions: {
    revisionId: string;
    milestoneKey: string | null;
    confirmed: boolean;
  }[];
  /** Link dispositions for the items those expansions created. */
  links: { itemKey: string; disposition: string }[];
  /** Which expansion revision created each item, when known. */
  items: { key: string; expansionRevisionId?: string }[];
}

export interface MilestoneProgress {
  milestoneKey: string;
  periodKey: string | null;
  state: MilestoneState;
  expansionRevisionId: string | null;
  itemCount: number;
  liveCount: number;
  detachedCount: number;
  deletedCount: number;
}

export interface RoadmapProgressSummary {
  milestones: number;
  notExpanded: number;
  expansionDraft: number;
  expanded: number;
  needsReview: number;
  plannedItems: number;
}

export function roadmapProgress(
  input: MilestoneProgressInput
): MilestoneProgress[] {
  const linksByItem = new Map(input.links.map((link) => [link.itemKey, link.disposition]));
  const byMilestone = new Map<string, MilestoneProgressInput["expansions"]>();
  for (const expansion of input.expansions) {
    if (!expansion.milestoneKey) continue;
    byMilestone.set(expansion.milestoneKey, [
      ...(byMilestone.get(expansion.milestoneKey) ?? []),
      expansion,
    ]);
  }
  return input.milestones.map((milestone) => {
    const expansions = byMilestone.get(milestone.key) ?? [];
    const confirmed = expansions.filter((expansion) => expansion.confirmed);
    const drafts = expansions.filter((expansion) => !expansion.confirmed);
    const base: MilestoneProgress = {
      milestoneKey: milestone.key,
      periodKey: milestone.periodKey ?? null,
      state: "NOT_EXPANDED",
      expansionRevisionId: null,
      itemCount: 0,
      liveCount: 0,
      detachedCount: 0,
      deletedCount: 0,
    };
    if (milestone.removed) return { ...base, state: "REMOVED" };
    if (!expansions.length) return base;
    const active = confirmed[0] ?? drafts[0];
    const itemKeys = input.items
      .filter((item) => item.expansionRevisionId === active.revisionId)
      .map((item) => item.key);
    const dispositions = itemKeys.map((key) => linksByItem.get(key) ?? "LIVE");
    const progress: MilestoneProgress = {
      ...base,
      expansionRevisionId: active.revisionId,
      itemCount: itemKeys.length,
      liveCount: dispositions.filter((value) => value === "LIVE").length,
      detachedCount: dispositions.filter((value) => value === "DETACHED").length,
      deletedCount: dispositions.filter((value) => value === "DELETED").length,
    };
    // More than one confirmed expansion for the same milestone is a state the
    // guard is designed to prevent; surface it rather than pick one silently.
    if (confirmed.length > 1) return { ...progress, state: "CONFLICTED" };
    if (!confirmed.length) return { ...progress, state: "EXPANSION_DRAFT" };
    if (progress.itemCount > 0 && progress.deletedCount === progress.itemCount)
      return { ...progress, state: "REMOVED" };
    if (progress.deletedCount > 0) return { ...progress, state: "PARTIALLY_REMOVED" };
    if (progress.detachedCount > 0) return { ...progress, state: "EXECUTION_CHANGED" };
    return { ...progress, state: "EXPANDED" };
  });
}

export function roadmapProgressSummary(
  rows: MilestoneProgress[]
): RoadmapProgressSummary {
  return {
    milestones: rows.length,
    notExpanded: rows.filter((row) => row.state === "NOT_EXPANDED").length,
    expansionDraft: rows.filter((row) => row.state === "EXPANSION_DRAFT").length,
    expanded: rows.filter(
      (row) =>
        row.state === "EXPANDED" ||
        row.state === "EXECUTION_CHANGED" ||
        row.state === "PARTIALLY_REMOVED"
    ).length,
    needsReview: rows.filter(
      (row) => row.state === "CONFLICTED" || row.state === "PARTIALLY_REMOVED"
    ).length,
    plannedItems: rows.reduce((total, row) => total + row.itemCount, 0),
  };
}
