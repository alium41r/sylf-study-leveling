import type { UserInputV1, ValidatedDraftV1 } from "./contracts";
import type { AvailabilitySnapshot } from "./capacity";
import type { FrozenItemView } from "./rebalance-policy";
import { validateCapacity } from "./capacity";
import { dateOrdinal, datesBetween } from "./dates";
import { PlannerValidationError } from "./errors";
import { hardWeeklyLimit, hardSessionLimit, unavailableWeekdays } from "./constraints";
import { weekday } from "./dates";
import {
  periodFor,
  periodSpecsFor,
  roadmapInput,
  type PeriodSpec,
  type RoadmapDraft,
  type RoadmapInput,
} from "./roadmap-policy";
import {
  assertRetrievalInvariants,
  learningDatesOf,
  type RetrievalPurpose,
  type RetrievalTouchView,
} from "./retrieval";

/**
 * Expansion scope and deterministic rules.
 *
 * An expansion inherits the roadmap's stable identities and adds only bounded
 * day-level work for ONE selected milestone. Everything here is pure so the
 * generator, the seal path, the edit path and the confirmation transaction all
 * apply exactly the same rules.
 */
export interface ExpansionScope {
  milestoneKey: string;
  milestoneTitle: string;
  milestoneOutcome: string;
  period: PeriodSpec;
  /** `tN` tokens for the milestone's own topics, in confirmed order. */
  topics: { ref: string; key: string; label: string }[];
}

export function expansionScope(
  draft: RoadmapDraft,
  milestoneKey: string,
  input?: RoadmapInput
): ExpansionScope {
  const milestone = draft.milestones.find((entry) => entry.key === milestoneKey);
  if (!milestone) throw new PlannerValidationError("UNKNOWN_MILESTONE");
  if (milestone.removed) throw new PlannerValidationError("MILESTONE_REMOVED");
  const roadmap = input ?? roadmapInput(input as never);
  const period =
    draft.periods?.find((entry) => entry.key === milestone.periodKey) ??
    periodFor(milestone.date, periodSpecsFor(roadmap));
  if (!period) throw new PlannerValidationError("UNKNOWN_PERIOD");
  const topics = (milestone.topicKeys ?? []).map((key, index) => ({
    ref: `t${index + 1}`,
    key,
    label: draft.topics.find((topic) => topic.key === key)?.title ?? "",
  }));
  if (!topics.length) throw new PlannerValidationError("MISSING_MILESTONE_SCOPE");
  return {
    milestoneKey,
    milestoneTitle: milestone.title,
    milestoneOutcome: milestone.outcome ?? "",
    period: {
      ref: "p1",
      title: period.title,
      granularity: period.granularity,
      startDate: period.startDate,
      endDate: period.endDate,
      order: period.order,
      days: dateOrdinal(period.endDate) - dateOrdinal(period.startDate) + 1,
    },
    topics,
  };
}

/**
 * Capacity available inside the expanded period only. Scoping the shared capacity
 * model to the period keeps an expansion cheap and honest: it cannot consume
 * capacity another period has already claimed.
 */
export function periodDays(
  input: UserInputV1,
  state: AvailabilitySnapshot,
  scope: ExpansionScope
) {
  const view: UserInputV1 = { ...input, startDate: scope.period.startDate, endDate: scope.period.endDate };
  const closed = new Set(unavailableWeekdays(view));
  const scoped: UserInputV1 = closed.size
    ? {
        ...view,
        availability: {
          ...view.availability,
          dailyMinutes: view.availability.dailyMinutes.map((minutes, day) =>
            closed.has(day) ? 0 : minutes
          ),
        },
      }
    : view;
  return validateCapacity(scoped, state, []).days;
}

/**
 * HARD weekly enforcement belongs here, where the days are actually known. A
 * strategic roadmap expresses the same limit as a per-period ceiling instead.
 */
export function validateRollingWeeklyLimit(
  input: UserInputV1,
  items: { date: string; minutes: number; removed?: boolean }[]
): void {
  const limit = hardWeeklyLimit(input);
  if (limit === null) return;
  const active = items.filter((item) => !item.removed);
  if (!active.length) return;
  const minutesOf = (date: string) =>
    active
      .filter((item) => item.date === date)
      .reduce((total, item) => total + item.minutes, 0);
  // Every seven-day window that contains work is checked, so a cluster shorter
  // than a week cannot slip through.
  const anchors = [...new Set(active.map((item) => item.date))];
  for (const anchor of anchors) {
    const start = dateOrdinal(anchor);
    let total = 0;
    for (let offset = 0; offset < 7; offset += 1)
      total += minutesOf(
        new Date((start + offset) * 86400000).toISOString().slice(0, 10)
      );
    if (total > limit) throw new PlannerValidationError("HARD_WEEKLY_LIMIT_EXCEEDED");
  }
}

/**
 * The complete deterministic rule set for one expansion's items: scope, dates,
 * intent vocabulary, session limit, rolling weekly limit and period capacity.
 */
export function validateExpansionItems(
  input: UserInputV1,
  state: AvailabilitySnapshot,
  scope: ExpansionScope,
  items: {
    ref?: string;
    topicRef?: string;
    topicKey?: string;
    type: string;
    date: string;
    minutes: number;
    removed?: boolean;
    retrievalPurpose?: RetrievalPurpose;
    minimumGapDays?: number;
    retrievalGroupRef?: string;
    retrievalGroupId?: string | null;
    retrievalIndex?: number;
  }[],
  /**
   * Frozen executed history (a period revision only). Those items already happened
   * and already consumed their capacity, so they satisfy scope coverage but are
   * never re-charged against the remaining period.
   */
  frozen: FrozenItemView[] = [],
  /**
   * What to charge against the period's capacity. A revision passes the items it
   * will actually write: a retained item already exists as a Quest on its date and
   * is already counted as existing work.
   */
  capacityItems: typeof items = items
): void {
  const active = items.filter((item) => !item.removed);
  const charged = capacityItems.filter((item) => !item.removed);
  if (!active.length && !frozen.length)
    throw new PlannerValidationError("EMPTY_EXPANSION");
  // A period revision proposes the work that is left, so the capacity it is charged
  // is what remains after the period's own completed work — that work already
  // consumed its dates, and charging it again would refuse an honest revision.
  const spent = new Map<string, number>();
  for (const item of frozen)
    spent.set(item.date, (spent.get(item.date) ?? 0) + item.minutes);
  const allowedRefs = new Set(scope.topics.map((topic) => topic.ref));
  const allowedKeys = new Set(scope.topics.map((topic) => topic.key));
  const sessionLimit = hardSessionLimit(input);
  const days = periodDays(input, state, scope);
  const budget = new Map(days.map((day) => [day.date, day.remaining]));
  const planned = new Map<string, number>();
  for (const item of charged) {
    const topicRef = item.topicRef ?? item.topicKey ?? "";
    if (!allowedRefs.has(topicRef) && !allowedKeys.has(topicRef))
      throw new PlannerValidationError("EXPANSION_SCOPE_VIOLATION");
    if (item.date < scope.period.startDate || item.date > scope.period.endDate)
      throw new PlannerValidationError("OUTSIDE_MILESTONE_PERIOD");
    if (!Number.isInteger(item.minutes) || item.minutes < 15 || item.minutes > 240)
      throw new PlannerValidationError("INVALID_ITEM_CAPACITY");
    if (sessionLimit !== null && item.minutes > sessionLimit)
      throw new PlannerValidationError("HARD_SESSION_LIMIT_EXCEEDED");
    if (unavailableWeekdays(input).includes(weekday(item.date)))
      throw new PlannerValidationError("HARD_UNAVAILABLE_DAY_USED");
    planned.set(item.date, (planned.get(item.date) ?? 0) + item.minutes);
  }
  for (const [date, minutes] of planned)
    if (minutes > Math.max(0, (budget.get(date) ?? 0) - (spent.get(date) ?? 0)))
      throw new PlannerValidationError("INSUFFICIENT_PERIOD_CAPACITY");
  validateRollingWeeklyLimit(input, charged);
  // Every unit of the period must be represented once history and remaining work are
  // taken together: a revision may not quietly drop a unit the period was planned for.
  const covered = new Set<string>([
    ...active.map((item) => item.topicRef ?? item.topicKey ?? ""),
    ...frozen.map((item) => item.topicRef),
  ]);
  for (const topic of scope.topics)
    if (!covered.has(topic.ref) && !covered.has(topic.key))
      throw new PlannerValidationError("MISSING_PERIOD_TOPIC");
  // Shared spaced-retrieval invariants (A2). This is an *additional* deterministic
  // check over items the model explicitly stamped as retrieval; an unstamped item is
  // invisible to it, so an expansion that predates retrieval metadata still validates
  // exactly as before. Learning dates come from the LEARN/consolidation items the
  // touches revisit, history included: a frozen retrieval already satisfies its gap
  // and is never asked to be re-placed.
  const stamped: RetrievalTouchView[] = active
    .filter((item) => Boolean(item.retrievalPurpose))
    .map((item) => ({
      ref: item.ref ?? "",
      topicRef: item.topicRef ?? item.topicKey ?? "",
      date: item.date,
      purpose: item.retrievalPurpose!,
      minimumGapDays: item.minimumGapDays,
      groupId: item.retrievalGroupId ?? item.retrievalGroupRef ?? null,
      index: item.retrievalIndex,
    }));
  if (stamped.length) {
    const learning = learningDatesOf(
      [
        ...active
          .filter((item) => !item.retrievalPurpose)
          .map((item) => ({
            topicRef: item.topicRef ?? item.topicKey ?? "",
            type: item.type,
            date: item.date,
          })),
        ...frozen.map((item) => ({
          topicRef: item.topicRef,
          type: item.type,
          date: item.date,
        })),
      ],
      ["LEARN", "REVIEW", "PRACTICE", "TIMED_PRACTICE"]
    );
    assertRetrievalInvariants({
      startDate: scope.period.startDate,
      endDate: scope.period.endDate,
      retrievals: stamped,
      learningDateOf: (topicRef) => learning.get(topicRef) ?? null,
    });
  }
}

/** Days the expansion may actually use, for the generator payload. */
export function expansionDays(
  input: UserInputV1,
  state: AvailabilitySnapshot,
  scope: ExpansionScope
) {
  return periodDays(input, state, scope)
    .filter((day) => day.remaining >= 15)
    .map((day) => ({ date: day.date, remainingMinutes: day.remaining }));
}

/** Every date in the period, so the UI can show a bounded window. */
export function periodDateRange(scope: ExpansionScope): string[] {
  return datesBetween(scope.period.startDate, scope.period.endDate);
}

export type { ValidatedDraftV1 };
