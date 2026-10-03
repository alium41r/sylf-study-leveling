import type { ValidatedDraftV1 } from "./contracts";

/**
 * The audit behind flexible draft editing: which validation codes are structural
 * facts and which are educational recommendations a student may decline.
 *
 * The planner's validators were written to throw on the first breach. That is right
 * for a machine and wrong for a person: some of those rules describe a *tradeoff*
 * ("this removes the later retrieval session for Matrices") that a student is entitled
 * to accept, and some describe something no consent can make true ("this session is 4
 * hours long", "this Quest is not yours", "this revision has moved").
 *
 * The line drawn here is deliberately narrow and stated once:
 *
 * - **BLOCKER** — the draft is malformed (a duplicate key, a reference to a unit that
 *   does not exist, a session outside the engine's 15–240 minute bounds, an item on a
 *   weekday the student closed), it would drop confirmed scope silently, or it breaks a
 *   *mode's own architecture* (Mastery's stage progression, a Roadmap's milestone
 *   periods). Nothing here can be acknowledged, ever.
 * - **RECOMMENDATION** — the plan is well-formed and plannable, but it now gives up
 *   something educational: depth, spacing, a review, a mock, the order a preference
 *   asked for. These are listed below with the reason they are a recommendation rather
 *   than a fact, and the student may accept one while editing their own draft.
 *
 * This module is pure data plus pure helpers, so the server that enforces the classes
 * and the surface that explains them read *the same* table. That is what stops the two
 * from drifting into different opinions about the same code.
 *
 * Note what is absent: nothing here can turn a HARD constraint into a choice.
 * `validateHardConstraints`, authentication, ownership, version and staleness checks,
 * lineage, and Phase 5 reconciliation never consult this file.
 */

export type DraftRuleClass = "BLOCKER" | "RECOMMENDATION";

export interface DraftRuleAudit {
  code: string;
  class: DraftRuleClass;
  /** Why this class, in one line — the §34 audit, kept next to the code it governs. */
  reason: string;
}

/**
 * Every code the draft-edit path can surface, audited individually.
 *
 * Ordering follows the modules the codes come from so a reader can check the table
 * against the validators.
 */
export const DRAFT_RULE_AUDIT: readonly DraftRuleAudit[] = [
  // ── Engine structure (`contracts.ts`) ────────────────────────────────────────
  { code: "DUPLICATE_KEY", class: "BLOCKER", reason: "Two items or units share one identity, so the draft cannot be addressed." },
  { code: "UNKNOWN_REFERENCE", class: "BLOCKER", reason: "An item points at a unit or milestone that does not exist." },
  { code: "DUPLICATE_REFERENCE", class: "BLOCKER", reason: "The same dependency is listed twice; the graph is malformed." },
  { code: "DEPENDENCY_DATE", class: "BLOCKER", reason: "An item is dated before something it depends on." },
  { code: "OUTSIDE_HORIZON", class: "BLOCKER", reason: "An item falls outside the confirmed start and end dates." },
  { code: "MODE_MISMATCH", class: "BLOCKER", reason: "The draft and the plan disagree about the mode." },
  { code: "MODE_PAYLOAD_MISMATCH", class: "BLOCKER", reason: "The draft's mode-specific field does not match the input's." },
  { code: "INVALID_COMPLETION_CRITERIA", class: "BLOCKER", reason: "A stored completion condition is unbounded or unobservable." },

  // ── HARD constraints and capacity (`constraints.ts`, `capacity.ts`) ──────────
  { code: "HARD_UNAVAILABLE_DAY_USED", class: "BLOCKER", reason: "The student closed this weekday; §39 keeps an explicit hard weekday closed." },
  { code: "HARD_SESSION_LIMIT_EXCEEDED", class: "BLOCKER", reason: "An explicit HARD session ceiling the student themselves set." },
  { code: "HARD_WEEKLY_LIMIT_EXCEEDED", class: "BLOCKER", reason: "An explicit HARD weekly maximum — distinct from the weekly target, which is a warning." },
  { code: "INVALID_ITEM_CAPACITY", class: "BLOCKER", reason: "Outside the engine's absolute 15–240 minute session bounds." },
  { code: "INFEASIBLE_CAPACITY", class: "BLOCKER", reason: "The default: capacity failure is a blocker unless this module classifies it as a target overrun." },

  // ── Exam completeness (`exam-policy.ts`) ────────────────────────────────────
  { code: "EMPTY_EXAM_PLAN", class: "BLOCKER", reason: "A plan with no work in it is not a plan and cannot be displayed." },
  { code: "UNKNOWN_EXAM_TOPIC", class: "BLOCKER", reason: "An item references a unit outside the confirmed scope." },
  { code: "INVALID_EXAM_INTENT_STAGE", class: "BLOCKER", reason: "The stage/intent pairing is how every surface labels the item; an unpaired item cannot be shown truthfully." },
  { code: "EXAM_DATE_VIOLATION", class: "BLOCKER", reason: "An item is dated after the exam, or on the exam day when the student said not to." },
  { code: "EXAM_DEPENDENCY_ORDER", class: "BLOCKER", reason: "A dependency is scheduled at or after the work that depends on it." },
  { code: "MISSING_SCOPE_TOPIC", class: "BLOCKER", reason: "A confirmed unit has no work and was not explicitly removed, so the plan would silently drop scope." },
  { code: "CONFIRMED_SCOPE_MISMATCH", class: "BLOCKER", reason: "The draft's units are not the units the student confirmed." },
  { code: "MISSING_COVERAGE", class: "RECOMMENDATION", reason: "Removing the teaching session for a unit is a tradeoff: the student may already know it, and the honest alternative (saying so) is offered alongside." },
  { code: "UNJUSTIFIED_RELEARNING", class: "RECOMMENDATION", reason: "Re-teaching a unit the student said is covered may be a deliberate refresher." },
  { code: "MISSING_CONSOLIDATION_OR_PRACTICE", class: "RECOMMENDATION", reason: "A unit may deliberately be read through without recall or practice sessions." },
  { code: "MISSING_MISTAKE_REVIEW", class: "RECOMMENDATION", reason: "Dropping the mistake-review session reduces error correction without making the plan unplannable." },
  { code: "PRACTICE_BEFORE_COVERAGE", class: "RECOMMENDATION", reason: "Attempting questions before teaching is a legitimate diagnostic choice." },
  { code: "MISSING_SPACED_RECALL", class: "RECOMMENDATION", reason: "Spacing is a retention recommendation, not a structural requirement." },
  { code: "INSUFFICIENT_TOPIC_WORK", class: "RECOMMENDATION", reason: "A student may deliberately give a unit less time than the heuristic floor." },
  { code: "INSUFFICIENT_PRACTICE_ALLOCATION", class: "RECOMMENDATION", reason: "Priority changes the *recommended* practice allocation; the student may still reduce it." },
  { code: "PRIORITY_ORDER", class: "RECOMMENDATION", reason: "Treating a high-priority unit earlier is a scheduling preference." },
  { code: "MISSING_FINAL_REVIEW", class: "RECOMMENDATION", reason: "A final review near the exam is advised, not structurally required." },
  { code: "MISSING_MOCK_EXAM", class: "RECOMMENDATION", reason: "The student asked for a mock, but removing it is their decision to make." },
  { code: "MISSING_MIXED_PRACTICE", class: "RECOMMENDATION", reason: "Cross-unit practice is an interleaving recommendation." },
  { code: "STAGES_MUST_OVERLAP", class: "RECOMMENDATION", reason: "Overlapping consolidation with coverage is a pacing recommendation." },

  // ── Roadmap structure and effort (`roadmap-policy.ts`) ──────────────────────
  { code: "EMPTY_ROADMAP", class: "BLOCKER", reason: "A roadmap with no milestones has no structure to display." },
  { code: "ROADMAP_MILESTONE_LIMIT", class: "BLOCKER", reason: "An absolute engine bound on milestones." },
  { code: "ROADMAP_ITEMS_NOT_ALLOWED", class: "BLOCKER", reason: "A strategic roadmap is not an execution plan; daily items belong to an expansion." },
  { code: "ROADMAP_PERIOD_MISMATCH", class: "BLOCKER", reason: "The periods do not match the deterministic date grid." },
  { code: "ROADMAP_PERIODS_REQUIRED", class: "BLOCKER", reason: "No periods means no roadmap." },
  { code: "ROADMAP_DEPENDENCY_ORDER", class: "BLOCKER", reason: "A milestone depends on work in a later period." },
  { code: "UNKNOWN_PERIOD", class: "BLOCKER", reason: "A milestone names a period that does not exist." },
  { code: "MILESTONE_PERIOD_MISMATCH", class: "BLOCKER", reason: "A milestone's date is not its period's end date." },
  { code: "MISSING_MILESTONE_OUTCOME", class: "BLOCKER", reason: "A milestone with no stated outcome is not reviewable." },
  { code: "INVALID_MILESTONE_OUTCOME", class: "BLOCKER", reason: "The outcome is unbounded prose the engine cannot store." },
  { code: "MISSING_MILESTONE_SCOPE", class: "BLOCKER", reason: "A milestone that covers no unit delivers nothing." },
  { code: "MISSING_MILESTONE_EFFORT", class: "BLOCKER", reason: "Without effort the period cannot be checked against its capacity." },
  { code: "UNKNOWN_ROADMAP_TOPIC", class: "BLOCKER", reason: "A milestone references a unit outside the confirmed scope." },
  { code: "MISSING_ROADMAP_TOPIC", class: "BLOCKER", reason: "A confirmed unit is covered by no milestone, which would drop scope (removal must be explicit)." },
  { code: "MILESTONE_REMOVED", class: "BLOCKER", reason: "The milestone was removed; there is nothing to act on." },
  { code: "EMPTY_EXPANSION", class: "BLOCKER", reason: "An expansion with no items has nothing to execute." },
  { code: "EXPANSION_SCOPE_VIOLATION", class: "BLOCKER", reason: "An expansion item falls outside the period's committed units." },
  { code: "OUTSIDE_MILESTONE_PERIOD", class: "BLOCKER", reason: "An expansion item is dated outside its period." },
  { code: "MISSING_COMPLETION_CRITERIA", class: "BLOCKER", reason: "Every executable item must state how it is done." },
  { code: "MISSING_PERIOD_TOPIC", class: "BLOCKER", reason: "The period silently drops a unit it was planned for." },
  { code: "ROADMAP_PERIOD_UNPLANNED", class: "RECOMMENDATION", reason: "Leaving a period deliberately free (exams, holidays) is a legitimate plan shape." },
  { code: "INSUFFICIENT_PERIOD_CAPACITY", class: "RECOMMENDATION", reason: "A period holding more effort than its derived target is a target overrun, not an explicit maximum." },

  // ── Mastery progression (`mastery-policy.ts`) ───────────────────────────────
  { code: "EMPTY_MASTERY_PLAN", class: "BLOCKER", reason: "A mastery plan with no active items is not displayable." },
  { code: "MASTERY_ITEM_LIMIT", class: "BLOCKER", reason: "An absolute engine bound on items." },
  { code: "MASTERY_MILESTONES_NOT_ALLOWED", class: "BLOCKER", reason: "Mastery plans hold no milestones." },
  { code: "UNKNOWN_MASTERY_TOPIC", class: "BLOCKER", reason: "An item references a unit outside the confirmed focus." },
  { code: "MISSING_MASTERY_STAGE", class: "BLOCKER", reason: "The stage is the mode's progression; an item without one cannot be placed." },
  { code: "INVALID_MASTERY_INTENT_STAGE", class: "BLOCKER", reason: "The stage/intent pairing is the mode's contract and is how the surface groups items." },
  { code: "MISSING_UNDERSTAND", class: "BLOCKER", reason: "Orientation is the mode's first stage — its presence is architecture, not advice." },
  { code: "MISSING_LEARN", class: "BLOCKER", reason: "Learning is owed unless the student said the unit is covered; the mode's architecture." },
  { code: "MISSING_ACTIVE_RECALL", class: "BLOCKER", reason: "Active recall is a stage of the mode, not an optional depth." },
  { code: "MISSING_PRACTICE", class: "BLOCKER", reason: "Practice is a stage of the mode, not an optional depth." },
  { code: "MISSING_MASTERY_CHECK", class: "BLOCKER", reason: "The one bounded check is what the mode is for." },
  { code: "MASTERY_CHECK_NOT_TERMINAL", class: "BLOCKER", reason: "A check that is not last is not a check of what came before." },
  { code: "MASTERY_CHECK_TOO_LONG", class: "BLOCKER", reason: "An absolute bound on the check's length." },
  { code: "UNNECESSARY_RELEARNING", class: "RECOMMENDATION", reason: "Re-teaching a unit the student is secure in may still be deliberate." },
  { code: "RECALL_BEFORE_LEARNING", class: "RECOMMENDATION", reason: "The order of stages is a recommendation; the stages themselves are not." },
  { code: "PRACTICE_BEFORE_LEARNING", class: "RECOMMENDATION", reason: "Attempting before teaching can be a deliberate diagnostic." },
  { code: "MISTAKE_REVIEW_BEFORE_PRACTICE", class: "RECOMMENDATION", reason: "Reviewing mistakes before practice produces them is suboptimal, not invalid." },
  { code: "INSUFFICIENT_TOPIC_WORK", class: "RECOMMENDATION", reason: "Depth below the heuristic floor is the student's call." },
  { code: "INSUFFICIENT_PRIORITY_ALLOCATION", class: "RECOMMENDATION", reason: "Practice allocation follows priority as a recommendation." },
  { code: "PRIORITY_ORDER", class: "RECOMMENDATION", reason: "When a high-priority unit is treated is a scheduling preference." },
  { code: "MISSING_LATER_RETRIEVAL", class: "RECOMMENDATION", reason: "A later retrieval session aids retention; it is not structurally required." },
  { code: "CHECK_SCOPE_TOO_NARROW", class: "RECOMMENDATION", reason: "A narrower final check is a weaker check, not an impossible plan." },
  { code: "PRIORITY_MISSED_IN_CHECK", class: "RECOMMENDATION", reason: "Whether a high-priority unit is inside the check is the student's decision." },

  // ── Scheduling trades that were already advisory, now raised on draft edits ──
  { code: "WEEKLY_TARGET_OVERRUN", class: "RECOMMENDATION", reason: "The weekly figure is a target; §37 requires a warning unless an explicit HARD maximum exists." },
  { code: "DAILY_TARGET_OVERRUN", class: "RECOMMENDATION", reason: "A day's grid is derived from that target; a burst day is a pacing tradeoff." },
  { code: "SESSION_LONGER_THAN_PREFERRED", class: "RECOMMENDATION", reason: "§36: a SOFT session-length preference is a recommendation, unlike the HARD ceiling." },
  { code: "SCHEDULED_ON_REST_DAY", class: "RECOMMENDATION", reason: "A rest day is a fact about the student's week, not a prohibition on their own edit." },
  { code: "SOFT_PREFERENCE_UNHONORED", class: "RECOMMENDATION", reason: "Soft preferences are already advisory by construction." },
] as const;

const BY_CODE = new Map(DRAFT_RULE_AUDIT.map((entry) => [entry.code, entry]));

/** The recommendation codes, as the closed list the server will suppress. */
export const RECOMMENDATION_CODES: readonly string[] = [
  ...new Set(
    DRAFT_RULE_AUDIT.filter((entry) => entry.class === "RECOMMENDATION").map((entry) => entry.code)
  ),
];

const RECOMMENDATIONS = new Set(RECOMMENDATION_CODES);

/** Is this code a recommendation the student may accept while editing their draft? */
export function isRecommendation(code: string): boolean {
  return RECOMMENDATIONS.has(code);
}

/** The audit entry for a code, or `undefined` for a code this phase does not classify. */
export function draftRule(code: string): DraftRuleAudit | undefined {
  return BY_CODE.get(code);
}

/** The value the client sends back to accept exactly one recommendation. */
export const acknowledgementFor = (code: string): string => `ACK:${code}`;

/** The code an acknowledgement refers to, or `null` when it is not one. */
export function acknowledgedCode(value: string): string | null {
  return value.startsWith("ACK:") ? value.slice(4) : null;
}

/**
 * The sentence shown for a recommendation.
 *
 * `unit` names the affected unit when the draft makes that derivable without
 * re-implementing a validator (see `affectedUnitLabels`); otherwise the sentence stays
 * general rather than inventing which unit it was about.
 */
export function recommendationConsequence(code: string, unit: string | null = null): string {
  const of = unit ? ` for ${unit}` : "";
  const copy: Record<string, string> = {
    MISSING_COVERAGE: `No teaching session remains${of}. If you already know this, marking it as studied tells Sylf so — otherwise the plan assumes it still has to be taught.`,
    UNJUSTIFIED_RELEARNING: `This teaches ${unit ?? "a unit"} again even though you said it is covered. That is a deliberate refresher, or an answer to change.`,
    MISSING_CONSOLIDATION_OR_PRACTICE: `No recall or practice session remains${of}. Reading material without retrieving it is easier to forget.`,
    MISSING_MISTAKE_REVIEW: `This removes the mistake review${of}. That may reduce how well errors get corrected before the exam.`,
    PRACTICE_BEFORE_COVERAGE: `Practice${of} is scheduled before the teaching. That is a valid diagnostic, and it is also less efficient than teaching first.`,
    MISSING_SPACED_RECALL: `No second recall${of} is planned after the first. Spacing is what makes recall durable.`,
    INSUFFICIENT_TOPIC_WORK: `This gives${of} less time than the usual estimate for it.`,
    INSUFFICIENT_PRACTICE_ALLOCATION: `This unit receives less practice than its priority usually implies.`,
    PRIORITY_ORDER: "A unit you marked as high priority starts later than usual.",
    MISSING_FINAL_REVIEW: "There is no final review in the last days before the exam.",
    MISSING_MOCK_EXAM: "No full-length mock exam remains, though you asked for one.",
    MISSING_MIXED_PRACTICE: "No practice mixes units together. Mixed practice is what exams actually ask for.",
    STAGES_MUST_OVERLAP: "Consolidation now starts only after all teaching ends, which leaves less time to retrieve it.",
    MISSING_LATER_RETRIEVAL: "There is no later retrieval session for this learning. That may reduce retention.",
    CHECK_SCOPE_TOO_NARROW: "The final check no longer covers the units it was meant to check.",
    PRIORITY_MISSED_IN_CHECK: "A unit you marked as high priority is not in the final check.",
    RECALL_BEFORE_LEARNING: "Recall is scheduled before the teaching it is meant to retrieve.",
    PRACTICE_BEFORE_LEARNING: "Practice is scheduled before the teaching it is meant to follow.",
    MISTAKE_REVIEW_BEFORE_PRACTICE: "Mistake review comes before the practice that produces the mistakes.",
    INSUFFICIENT_PRIORITY_ALLOCATION: "A high-priority unit receives less practice than usual.",
    ROADMAP_PERIOD_UNPLANNED: "One period of this roadmap has no work planned.",
    INSUFFICIENT_PERIOD_CAPACITY: "A period holds more effort than the time available in it.",
    WEEKLY_TARGET_OVERRUN: "This plan is above your weekly target. The target is yours to exceed — nothing here is a hard limit.",
    DAILY_TARGET_OVERRUN: "This puts more work on one day than your usual daily amount.",
    SESSION_LONGER_THAN_PREFERRED: "One or more sessions are longer than the session length you said you prefer.",
    SCHEDULED_ON_REST_DAY: "Some work falls on a day you normally keep free.",
    SOFT_PREFERENCE_UNHONORED: "This departs from a scheduling preference you set.",
  };
  return copy[code] ?? "This edit trades away something the planner usually includes. It stays plannable.";
}

/**
 * The units a code is about, when the draft alone decides it.
 *
 * Strictly limited to predicates the draft fully determines. Two obvious candidates are
 * deliberately absent: `MISSING_MISTAKE_REVIEW` and `MISSING_COVERAGE` depend on the
 * student's preparedness (`needsMistakeReview`, `needsLearning`), so a draft-only
 * predicate would name units the validator is not complaining about — and a warning that
 * names the wrong unit is worse than one that names none.
 *
 * Where this returns nothing, `changedUnitLabels` answers the same question from the
 * edit itself: the units whose work the student just altered. That is derivable,
 * truthful, and exactly the specificity §35 asks for.
 */
export function affectedUnitLabels(
  code: string,
  draft: Pick<ValidatedDraftV1, "topics" | "items">,
  limit = 3
): string[] {
  const active = draft.items.filter((item) => !item.removed);
  const labelOf = (topicKey: string) =>
    draft.topics.find((topic) => topic.key === topicKey)?.title ?? null;
  const pick = (predicate: (topicKey: string) => boolean) =>
    [...new Set(active.map((item) => item.topicKey))]
      .filter(predicate)
      .map(labelOf)
      .filter((label): label is string => Boolean(label))
      .slice(0, limit);

  if (code === "MISSING_CONSOLIDATION_OR_PRACTICE")
    return pick(
      (key) =>
        !active.some((item) => item.topicKey === key && ["RECALL", "REVIEW"].includes(item.type)) ||
        !active.some(
          (item) => item.topicKey === key && ["PRACTICE", "TIMED_PRACTICE"].includes(item.type)
        )
    );
  return [];
}

/**
 * The units whose work this edit changed.
 *
 * Compared on the fields an edit can touch, so the answer is "what did you just do"
 * rather than a guess about why a rule fired. It makes a warning specific; it never
 * decides whether a warning is raised.
 */
export function changedUnitLabels(
  before: Pick<ValidatedDraftV1, "topics" | "items">,
  after: Pick<ValidatedDraftV1, "topics" | "items">,
  limit = 3
): string[] {
  const signature = (draft: Pick<ValidatedDraftV1, "items">): Map<string, string> => {
    const map = new Map<string, string>();
    for (const item of draft.items) {
      const entry = `${item.type}|${item.date}|${item.minutes}|${item.removed ? "x" : "o"}`;
      map.set(item.topicKey, `${map.get(item.topicKey) ?? ""}\n${entry}`);
    }
    return map;
  };
  const beforeMap = signature(before);
  const afterMap = signature(after);
  const changed: string[] = [];
  for (const key of new Set([...beforeMap.keys(), ...afterMap.keys()])) {
    if (beforeMap.get(key) === afterMap.get(key)) continue;
    const label =
      after.topics.find((topic) => topic.key === key)?.title ??
      before.topics.find((topic) => topic.key === key)?.title;
    if (label) changed.push(label);
    if (changed.length >= limit) break;
  }
  return changed;
}
