import type { ModelProposalV1, UserInputV1 } from "./contracts";
import type { AvailabilitySnapshot } from "./capacity";
import type { FrozenItemView } from "./rebalance-policy";
import { PlannerValidationError } from "./errors";
import { examInput, validateExamProposal } from "./exam-policy";
import {
  roadmapInput,
  validateRoadmapProposal,
} from "./roadmap-policy";
import { masteryInput, validateMasteryProposal } from "./mastery-policy";
import { validateExpansionItems } from "./expansion-policy";
import type { ExpansionScope } from "./expansion-policy";

/**
 * Mode-specific replan validation.
 *
 * Each rule set reuses the mode's own deterministic validators through the
 * execution-aware view, so a replan is held to exactly the same educational
 * standard as a first plan while frozen history satisfies what it already proved.
 * Nothing here is a second, weaker validator.
 */

/**
 * History is not re-proposed.
 *
 * A replan adjusts what is left; proposing work that is already completed or in
 * progress would duplicate a Quest the student already has (and would quietly inflate
 * their plan). The server refuses such a proposal outright rather than de-duplicating
 * it, because only the user knows whether they meant to repeat something.
 */
export function assertNoHistoryDuplication(
  items: { topicRef: string; type: string; title: string }[],
  frozen: FrozenItemView[]
): void {
  if (!frozen.length) return;
  const history = new Set(
    frozen.map((item) => `${item.topicRef}|${item.type}|${item.title.trim().toLowerCase()}`)
  );
  for (const item of items)
    if (
      history.has(
        `${item.topicRef}|${item.type}|${item.title.trim().toLowerCase()}`
      )
    )
      throw new PlannerValidationError("REBALANCE_DUPLICATES_HISTORY");
}

export type RoadmapRebalanceOutcome = "STRATEGIC" | "PERIOD";
export const ROADMAP_REBALANCE_OUTCOMES: readonly RoadmapRebalanceOutcome[] = [
  "STRATEGIC",
  "PERIOD",
];

/** Exam: the remaining work plus frozen history must still be a whole exam plan. */
export function examRebalanceValidation(
  input: UserInputV1,
  proposal: ModelProposalV1,
  availability: AvailabilitySnapshot,
  frozen: FrozenItemView[],
  /** Proposal refs that keep an existing, unchanged item: not charged again. */
  retainedRefs: ReadonlySet<string> = new Set()
): void {
  examInput(input);
  if (proposal.mode !== "EXAM")
    throw new PlannerValidationError("EXAM_MODE_MISMATCH");
  assertNoHistoryDuplication(proposal.items, frozen);
  validateExamProposal(
    input,
    proposal,
    availability,
    frozen,
    proposal.items.filter((item) => !retainedRefs.has(item.ref))
  );
}

/** Mastery: completed stages count as progression; remaining stages must complete it. */
export function masteryRebalanceValidation(
  input: UserInputV1,
  proposal: ModelProposalV1,
  availability: AvailabilitySnapshot,
  frozen: FrozenItemView[],
  retainedRefs: ReadonlySet<string> = new Set()
): void {
  if (input.mode !== "MASTERY")
    throw new PlannerValidationError("MASTERY_DETAILS_REQUIRED");
  masteryInput(input);
  if (proposal.mode !== "MASTERY")
    throw new PlannerValidationError("MASTERY_MODE_MISMATCH");
  assertNoHistoryDuplication(proposal.items, frozen);
  validateMasteryProposal(
    input,
    proposal,
    availability,
    frozen,
    proposal.items.filter((item) => !retainedRefs.has(item.ref))
  );
}

/**
 * Roadmap strategic rebalance: expanded periods are anchors. Only unexpanded
 * milestones may be proposed, so the frozen set carries no effort and every covered
 * unit is accounted for exactly once.
 */
export function roadmapRebalanceValidation(
  input: UserInputV1,
  proposal: ModelProposalV1,
  availability: AvailabilitySnapshot,
  frozenMilestones: ReturnType<
    typeof import("./rebalance-scope").rebalanceFrozenMilestoneViews
  >
): void {
  if (input.mode !== "ROADMAP")
    throw new PlannerValidationError("ROADMAP_MODE_MISMATCH");
  const roadmap = roadmapInput(input);
  if (proposal.mode !== "ROADMAP")
    throw new PlannerValidationError("ROADMAP_MODE_MISMATCH");
  validateRoadmapProposal(input, proposal, availability, frozenMilestones);
  void roadmap;
}

/**
 * Roadmap period revision: the new items are validated against the period's own
 * window and capacity exactly like an expansion, while the period's frozen items
 * count as scope already covered.
 */
export function periodRebalanceValidation(
  input: UserInputV1,
  availability: AvailabilitySnapshot,
  scope: ExpansionScope,
  items: {
    ref?: string;
    topicRef?: string;
    topicKey?: string;
    type: string;
    title?: string;
    date: string;
    minutes: number;
    removed?: boolean;
  }[],
  frozen: FrozenItemView[],
  /** Refs that keep an existing, unchanged item: not charged again. */
  retainedRefs: ReadonlySet<string> = new Set()
): void {
  assertNoHistoryDuplication(
    items
      .filter((item) => !item.removed && item.topicRef && item.title)
      .map((item) => ({
        topicRef: item.topicRef!,
        type: item.type,
        title: item.title!,
      })),
    frozen
  );
  validateExpansionItems(
    input,
    availability,
    scope,
    items,
    frozen,
    items.filter((item) => !retainedRefs.has(item.ref ?? ""))
  );
}
