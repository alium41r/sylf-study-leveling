/**
 * The Coverage Map: where each confirmed unit of scope is actually covered.
 *
 * This is TRACEABILITY, not assessment. The four states answer exactly one question —
 * "has this unit been planned for, revisited and practised?" — and deliberately stop
 * there:
 *
 * - there is no MASTERED state, and there is no path in this module that could produce
 *   one. Quest completion is an execution fact, never an academic verdict;
 * - completed work is shown as history that counts towards coverage, so a replan over
 *   remaining work does not make finished coverage look missing;
 * - work that a later revision superseded is not counted as current scheduled coverage
 *   (that would double-count planned minutes) but is still listed, so the student can
 *   see what happened to it;
 * - a strategic Roadmap milestone is a strategic touch: it can make a unit SCHEDULED,
 *   and it can never make it REINFORCED or PRACTICED, because a milestone schedules a
 *   period rather than executing practice.
 *
 * Everything here is a pure function of the confirmed scope plus the revision's own
 * items and the execution facts the caller already has. Nothing is stored.
 */
export const COVERAGE_STATES = [
  "UNSCHEDULED",
  "SCHEDULED",
  "REINFORCED",
  "PRACTICED",
] as const;
export type CoverageState = (typeof COVERAGE_STATES)[number];

export const COVERAGE_STATE_LABEL: Record<CoverageState, string> = {
  UNSCHEDULED: "Not planned yet",
  SCHEDULED: "Planned",
  REINFORCED: "Revisited",
  PRACTICED: "Practised",
};

export const COVERAGE_STATE_COPY: Record<CoverageState, string> = {
  UNSCHEDULED: "No touch in this plan covers this unit yet.",
  SCHEDULED: "This unit is on the plan. It has not been revisited or practised yet.",
  REINFORCED: "This unit is on the plan and something later brings it back.",
  PRACTICED: "This unit is on the plan and has practice work, so recall is being used.",
};

/** What a single touch is for. Derived from the item's own intent and stage. */
export const COVERAGE_PURPOSES = [
  "LEARN",
  "REVIEW",
  "RECALL",
  "PRACTICE",
  "MISTAKE_REVIEW",
  "ASSESS",
  "STRATEGIC",
] as const;
export type CoveragePurpose = (typeof COVERAGE_PURPOSES)[number];

export const COVERAGE_PURPOSE_LABEL: Record<CoveragePurpose, string> = {
  LEARN: "Learn",
  REVIEW: "Review",
  RECALL: "Recall",
  PRACTICE: "Practice",
  MISTAKE_REVIEW: "Mistakes",
  ASSESS: "Check",
  STRATEGIC: "Milestone",
};

/** Intents that count as bringing material back. */
const RETRIEVAL_INTENTS = new Set(["RECALL", "REVIEW"]);
/** Intents that count as using recall rather than only meeting it again. */
const PRACTICE_INTENTS = new Set([
  "PRACTICE",
  "TIMED_PRACTICE",
  "MISTAKE_REVIEW",
  "MOCK_EXAM",
  "FINAL_REVIEW",
  "ASSESS",
]);
/** Mastery stages that carry the same meaning as the intents above. */
const RETRIEVAL_STAGES = new Set(["ACTIVE_RECALL", "REVIEW_MISTAKES"]);
const PRACTICE_STAGES = new Set(["PRACTICE", "MASTERY_CHECK"]);

export interface CoverageTouchInput {
  key: string;
  /** Durable topic key, or the scope ref the layer speaks in. */
  topicKey: string;
  type: string;
  stage?: string | null;
  masteryStage?: string | null;
  date: string;
  role?: "CORE" | "STRETCH";
  removed?: boolean;
  /** True when a later confirmed revision replaced this item. */
  superseded?: boolean;
  /**
   * Execution facts, when the plan has been materialized: whether a Quest exists for
   * this item, its status, and whether it finished. Absent before confirmation.
   */
  execution?: {
    linked: boolean;
    status?: string | null;
    completed?: boolean;
  } | null;
}

export interface CoverageMilestoneInput {
  key: string;
  date: string;
  topicKeys: string[];
  removed?: boolean;
}

export interface CoverageScopeUnit {
  key: string;
  title: string;
}

export interface CoverageTouch {
  itemKey: string;
  date: string;
  purpose: CoveragePurpose;
  stage: string | null;
  role: "CORE" | "STRETCH";
  /** PLAN: this revision will run it. HISTORY: it already ran. SUPERSEDED: replaced. */
  source: "PLAN" | "HISTORY" | "SUPERSEDED";
  executed: boolean;
  /** False once it can no longer change anything, so the UI can de-emphasise it. */
  current: boolean;
}

export interface CoverageUnitView {
  key: string;
  title: string;
  state: CoverageState;
  touches: CoverageTouch[];
  /** Counts the UI shows without exposing individual scheduling internals. */
  counts: { planned: number; history: number; superseded: number };
}

export interface CoverageMap {
  units: CoverageUnitView[];
  /** Units with no coverage at all — the gap the map exists to make obvious. */
  unscheduled: string[];
  totals: Record<CoverageState, number>;
}

const purposeOfItem = (item: CoverageTouchInput): CoveragePurpose => {
  const stage = item.masteryStage ?? item.stage ?? null;
  if (RETRIEVAL_INTENTS.has(item.type) || (stage && RETRIEVAL_STAGES.has(stage)))
    return item.type === "REVIEW" || stage === "ACTIVE_RECALL" ? "RECALL" : "REVIEW";
  if (PRACTICE_INTENTS.has(item.type) || (stage && PRACTICE_STAGES.has(stage))) {
    if (stage === "MASTERY_CHECK" || item.type === "ASSESS") return "ASSESS";
    if (item.type === "MISTAKE_REVIEW" || stage === "REVIEW_MISTAKES")
      return "MISTAKE_REVIEW";
    return "PRACTICE";
  }
  return "LEARN";
};

const isRetrieval = (purpose: CoveragePurpose) =>
  purpose === "RECALL" || purpose === "REVIEW";

const isPractice = (purpose: CoveragePurpose) =>
  purpose === "PRACTICE" || purpose === "MISTAKE_REVIEW" || purpose === "ASSESS";

/**
 * Where every unit of the confirmed scope stands.
 *
 * `superseded` touches are reported but never counted as current coverage, and an
 * unexecuted STRETCH touch counts as planned coverage at most: it is real traceability
 * (the unit is not orphaned) but it is not work the student has agreed to run.
 */
export function coverageMap(args: {
  units: readonly CoverageScopeUnit[];
  items: readonly CoverageTouchInput[];
  milestones?: readonly CoverageMilestoneInput[];
}): CoverageMap {
  const byUnit = new Map<string, CoverageUnitView>();
  for (const unit of args.units)
    byUnit.set(unit.key, {
      key: unit.key,
      title: unit.title,
      state: "UNSCHEDULED",
      touches: [],
      counts: { planned: 0, history: 0, superseded: 0 },
    });

  const push = (unitKey: string, touch: CoverageTouch) => {
    const unit = byUnit.get(unitKey);
    if (!unit) return;
    unit.touches.push(touch);
    if (touch.source === "PLAN") unit.counts.planned += 1;
    else if (touch.source === "HISTORY") unit.counts.history += 1;
    else unit.counts.superseded += 1;
  };

  for (const item of args.items) {
    if (item.removed) continue;
    const purpose = purposeOfItem(item);
    const executed = Boolean(item.execution?.completed);
    const linked = Boolean(item.execution?.linked);
    const source: CoverageTouch["source"] = item.superseded
      ? "SUPERSEDED"
      : executed || linked
        ? "HISTORY"
        : "PLAN";
    push(item.topicKey, {
      itemKey: item.key,
      date: item.date,
      purpose,
      stage: item.masteryStage ?? item.stage ?? null,
      role: item.role === "STRETCH" ? "STRETCH" : "CORE",
      source,
      executed,
      current: source === "PLAN",
    });
  }

  for (const milestone of args.milestones ?? []) {
    if (milestone.removed) continue;
    for (const topicKey of milestone.topicKeys)
      push(topicKey, {
        itemKey: milestone.key,
        date: milestone.date,
        purpose: "STRATEGIC",
        stage: null,
        role: "CORE",
        source: "PLAN",
        executed: false,
        current: true,
      });
  }

  const totals: Record<CoverageState, number> = {
    UNSCHEDULED: 0,
    SCHEDULED: 0,
    REINFORCED: 0,
    PRACTICED: 0,
  };
  for (const unit of byUnit.values()) {
    unit.touches.sort((a, b) =>
      a.date === b.date ? a.itemKey.localeCompare(b.itemKey) : a.date < b.date ? -1 : 1
    );
    // Superseded work cannot make a unit look covered today; it is history the student
    // can still see, so it counts only when nothing current or executed covers it.
    const current = unit.touches.filter(
      (touch) => touch.source === "PLAN" || touch.source === "HISTORY"
    );
    const effective = current.filter(
      (touch) => touch.source === "HISTORY" || touch.role === "CORE"
    );
    const learn = effective.find((touch) => touch.purpose === "LEARN");
    const retrieval = effective.find(
      (touch) => isRetrieval(touch.purpose) && (!learn || touch.date >= learn.date)
    );
    const practice = effective.find((touch) => isPractice(touch.purpose));
    unit.state = practice
      ? "PRACTICED"
      : retrieval
        ? "REINFORCED"
        : current.length
          ? "SCHEDULED"
          : "UNSCHEDULED";
    totals[unit.state] += 1;
  }

  const units = [...byUnit.values()];
  return {
    units,
    unscheduled: units
      .filter((unit) => unit.state === "UNSCHEDULED")
      .map((unit) => unit.key),
    totals,
  };
}

/**
 * The compact summary a review surface or a provider payload can carry: state counts
 * and the orphaned units, with no per-item detail and no academic content.
 */
export function coverageSummary(map: CoverageMap): {
  units: number;
  states: Record<CoverageState, number>;
  unscheduled: number;
} {
  return {
    units: map.units.length,
    states: map.totals,
    unscheduled: map.unscheduled.length,
  };
}
