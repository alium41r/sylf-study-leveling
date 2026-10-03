import { z } from "zod";
import { PlannerValidationError } from "./errors";
import { dateOrdinal } from "./dates";
import { isSecure } from "./preparedness";

/**
 * Shared spaced retrieval policy (A2).
 *
 * Exam and Mastery already each express a "retrieval happens again later, after the
 * learning it revisits" rule in their own vocabulary. This module extracts the parts
 * those two modes genuinely share — a closed purpose vocabulary, a bounded spacing
 * ladder, and the deterministic invariants a retrieval touch must satisfy — into one
 * pure place, so a third mode (a Roadmap period expansion) does not have to re-derive
 * them a third time.
 *
 * It is deliberately NOT a second scheduler stacked on top of the existing mode rules:
 * the modes keep their own floors (see `exam-policy.ts` and `mastery-policy.ts`) and
 * this module only *serves* them with shared maths and shared invariant checks. It
 * never adds a Quest column, never touches a database and never schedules anything
 * outside the horizon it is given.
 */

/** Planner-side retrieval schema version. The enclosing draft carries `schemaVersion: 1`. */
export const RETRIEVAL_SCHEMA_VERSION = 1;

/**
 * Closed purpose vocabulary. The names align with the intents the modes already use,
 * so a purpose can be mapped onto the intent a generated item should carry without
 * inventing a new Quest intent:
 *   RECALL           → active recall / consolidation recall (RECALL, REVIEW)
 *   REINFORCEMENT    → a shorter, optional consolidation touch (REVIEW, RECALL)
 *   PRACTICE         → apply-and-recall practice (PRACTICE, TIMED_PRACTICE)
 *   MISTAKE_REVIEW   → re-attempt recorded errors (MISTAKE_REVIEW)
 */
export const RETRIEVAL_PURPOSES = [
  "RECALL",
  "REINFORCEMENT",
  "PRACTICE",
  "MISTAKE_REVIEW",
] as const;
export const RetrievalPurposeSchema = z.enum(RETRIEVAL_PURPOSES);
export type RetrievalPurpose = z.infer<typeof RetrievalPurposeSchema>;

/** The intents a purpose may be materialized as, reusing the existing vocabularies. */
export const RETRIEVAL_PURPOSE_INTENTS: Record<RetrievalPurpose, readonly string[]> = {
  RECALL: ["RECALL", "REVIEW"],
  REINFORCEMENT: ["REVIEW", "RECALL"],
  PRACTICE: ["PRACTICE", "TIMED_PRACTICE"],
  MISTAKE_REVIEW: ["MISTAKE_REVIEW"],
};

/** Bounds for the planner-side stamp. Conservative, never a Quest column. */
export const RETRIEVAL_LIMITS = {
  /** Largest minimum gap the ladder ever returns. */
  maxMinimumGapDays: 90,
  /** One retrieval group may hold at most this many touches. */
  maxIndex: 60,
  /** Model-side group token length ceiling (`rgN`). */
  maxGroupRefLength: 32,
} as const;

/**
 * The versioned, bounded stamp a generated item may carry. It is planner metadata
 * only: it lives in the sealed revision, exactly like `stage`/`masteryStage`, and is
 * never written to a Quest row.
 *
 * `retrievalGroupRef` is the model-side token (e.g. `rg1`) used during generation;
 * `retrievalGroupId` is the durable identity minted at normalization, in exactly the
 * pattern of the existing proposal `ref` → draft `key` translation. `retrievalIndex`
 * orders touches within one group (1-based), `minimumGapDays` records the spacing the
 * touch was placed against, and `retrievalPurpose` names why it exists.
 */
export const RetrievalStampSchema = z.strictObject({
  retrievalGroupRef: z
    .string()
    .regex(/^rg[1-9][0-9]*$/)
    .max(RETRIEVAL_LIMITS.maxGroupRefLength)
    .optional(),
  retrievalGroupId: z.string().uuid().nullable().optional(),
  retrievalIndex: z.number().int().min(1).max(RETRIEVAL_LIMITS.maxIndex).optional(),
  minimumGapDays: z
    .number()
    .int()
    .min(1)
    .max(RETRIEVAL_LIMITS.maxMinimumGapDays)
    .optional(),
  retrievalPurpose: RetrievalPurposeSchema.optional(),
});
export type RetrievalStamp = z.infer<typeof RetrievalStampSchema>;

/**
 * Item-content metadata, spread into the shared item schema so a retrieval stamp can
 * travel on a proposal item (model refs) and survive on a draft item (durable ids).
 * Every field is optional, so every sealed Phase 1–5 snapshot without retrieval
 * metadata keeps parsing unchanged.
 */
export const retrievalMetadata = {
  retrievalGroupRef: z
    .string()
    .regex(/^rg[1-9][0-9]*$/)
    .max(RETRIEVAL_LIMITS.maxGroupRefLength)
    .optional(),
  retrievalGroupId: z.string().uuid().nullable().optional(),
  retrievalIndex: z.number().int().min(1).max(RETRIEVAL_LIMITS.maxIndex).optional(),
  minimumGapDays: z
    .number()
    .int()
    .min(1)
    .max(RETRIEVAL_LIMITS.maxMinimumGapDays)
    .optional(),
  retrievalPurpose: RetrievalPurposeSchema.optional(),
};

/**
 * Model-side retrieval metadata for proposal items (a Roadmap period expansion
 * included). `retrievalGroupId` is deliberately absent: a durable identity is minted
 * at normalization and is never supplied by the model.
 */
export const retrievalProposalMetadata = {
  retrievalGroupRef: z
    .string()
    .regex(/^rg[1-9][0-9]*$/)
    .max(RETRIEVAL_LIMITS.maxGroupRefLength)
    .optional(),
  retrievalIndex: z.number().int().min(1).max(RETRIEVAL_LIMITS.maxIndex).optional(),
  minimumGapDays: z
    .number()
    .int()
    .min(1)
    .max(RETRIEVAL_LIMITS.maxMinimumGapDays)
    .optional(),
  retrievalPurpose: RetrievalPurposeSchema.optional(),
};

/**
 * Reuse the signal the modes already model — a unit the student has covered with
 * confidence is "secure" — instead of inventing a new one. Identical to Mastery's
 * `topic.covered && topic.confidence >= 4`.
 */
export function isSecureScopeTopic(topic: {
  covered: boolean;
  confidence: number;
}): boolean {
  return isSecure(topic);
}

/**
 * The conservative, deterministic spacing ladder.
 *
 * These are bounded integer-day floors chosen to be defensible and reproducible, NOT
 * claims of scientific optimality. The only invariant that is truly required by the
 * mode rules is "strictly after the learning it revisits" (gap >= 1); everything else
 * is a conservative compression that scales with the remaining horizon so a 7-day plan
 * and a 60-day plan do not silently share the same spacing.
 *
 * A shorter horizon compresses the gap but never below one day, so the "after
 * learning" rule can never be violated.
 */
function baseGapDays(horizonDays: number): number {
  const h = Math.max(1, Math.trunc(horizonDays));
  if (h <= 6) return 1; // very short: one full day after learning
  if (h <= 13) return 2; // about one to two weeks
  if (h <= 27) return 3; // about three to four weeks — Mastery's fixed later-retrieval floor
  if (h <= 55) return 5; // about five to eight weeks
  return 7; // longer horizons, bounded at seven days
}

/**
 * The minimum gap (in whole days) a retrieval touch of the given purpose must observe
 * after the learning it revisits. `secure` material may receive shorter reinforcement,
 * but a secure unit is never allowed a same-day touch.
 */
export function minimumRetrievalGapDays(
  horizonDays: number,
  purpose: RetrievalPurpose,
  options: { secure?: boolean } = {}
): number {
  const base = baseGapDays(horizonDays);
  switch (purpose) {
    case "RECALL":
      // Primary active recall: the full ladder.
      return base;
    case "REINFORCEMENT":
      // A shorter consolidation touch; secure material may compress by one step.
      return options.secure ? Math.max(1, base - 1) : base;
    case "PRACTICE":
      // Practice follows learning more closely than recall; still strictly after.
      return Math.max(1, base - 1);
    case "MISTAKE_REVIEW":
      // Mistake review inspects the practice it directly follows: one day.
      return 1;
  }
}

/**
 * Whether a later retrieval touch of the given purpose is REQUIRED on this horizon.
 * The RECALL gate is the same `>= 14` days Mastery already uses, so the mode's gate
 * can route through this function with identical behaviour. The other purposes are
 * only required once the horizon genuinely has room for a separated touch.
 */
export function requiresLaterRetrieval(
  horizonDays: number,
  purpose: RetrievalPurpose
): boolean {
  switch (purpose) {
    case "RECALL":
      return horizonDays >= 14;
    case "REINFORCEMENT":
      return horizonDays >= 7;
    case "PRACTICE":
      return horizonDays >= 4;
    case "MISTAKE_REVIEW":
      return horizonDays >= 4;
  }
}

/* ------------------------------------------------------------------------- *
 * Deterministic scheduling policy
 * ------------------------------------------------------------------------- */

/** One confirmed scope unit, expressed for the retrieval policy. */
export interface RetrievalScopeUnit {
  ref: string;
  label?: string;
  /** Reuses the existing `covered && confidence >= 4` signal. */
  secure: boolean;
  /** The last learning/review date this unit's retrieval revisits. */
  learnedOn: string;
}

/** One usable day inside the horizon, with the capacity it still has. */
export interface RetrievalDayCapacity {
  date: string;
  remainingMinutes: number;
}

/** The horizon and capacity the policy schedules against. */
export interface RetrievalSchedule {
  startDate: string;
  endDate: string;
  days: RetrievalDayCapacity[];
  /** Retrieval touches are short and specific; the policy caps each touch here. */
  touchMinutes: number;
  /** HARD session ceiling, or null when the user set none. */
  sessionCapMinutes: number | null;
}

/** One decided retrieval touch. */
export interface RetrievalTouchDecision {
  purpose: RetrievalPurpose;
  requirement: "REQUIRED" | "OPTIONAL";
  minimumGapDays: number;
  unitRef: string;
  secure: boolean;
  /**
   * The earliest in-horizon date that satisfies the gap and still has capacity, or
   * null when no such date exists — the policy never schedules a touch outside the
   * horizon and never places it on the same day as (or before) the learning it
   * revisits.
   */
  placeOn: string | null;
}

/**
 * Decides the later retrieval touches a horizon warrants: which purposes are
 * REQUIRED vs OPTIONAL, what minimum gap each must observe, and the earliest in-horizon
 * date each can land on given the capacity that remains. Deterministic and pure.
 *
 * A short horizon compresses the gap but never below one day; a touch whose learning
 * sits too close to the horizon end reports `placeOn: null` rather than being moved
 * outside the horizon.
 */
export function planRetrievalTouches(
  schedule: RetrievalSchedule,
  scope: readonly RetrievalScopeUnit[]
): RetrievalTouchDecision[] {
  const horizonDays = dateOrdinal(schedule.endDate) - dateOrdinal(schedule.startDate);
  const touchMinutes = Math.max(
    15,
    Math.min(schedule.touchMinutes, schedule.sessionCapMinutes ?? 240)
  );
  const days = schedule.days
    .filter((day) => day.date >= schedule.startDate && day.date <= schedule.endDate)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  // Capacity already claimed by a touch placed earlier in the same pass, so touches
  // do not all pile onto the first available day when a later day has room.
  const used = new Map<string, number>();
  const placeOn = (learnedOn: string, minGap: number): string | null => {
    for (const day of days) {
      const gap = dateOrdinal(day.date) - dateOrdinal(learnedOn);
      if (gap < minGap) continue;
      const remaining = Math.max(0, day.remainingMinutes - (used.get(day.date) ?? 0));
      if (remaining < touchMinutes) continue;
      used.set(day.date, (used.get(day.date) ?? 0) + touchMinutes);
      return day.date;
    }
    return null;
  };
  const touches: RetrievalTouchDecision[] = [];
  for (const unit of scope) {
    for (const purpose of RETRIEVAL_PURPOSES) {
      const gap = minimumRetrievalGapDays(horizonDays, purpose, {
        secure: unit.secure,
      });
      touches.push({
        purpose,
        requirement: requiresLaterRetrieval(horizonDays, purpose)
          ? "REQUIRED"
          : "OPTIONAL",
        minimumGapDays: gap,
        unitRef: unit.ref,
        secure: unit.secure,
        placeOn: placeOn(unit.learnedOn, gap),
      });
    }
  }
  return touches;
}

/* ------------------------------------------------------------------------- *
 * Deterministic invariant validation
 * ------------------------------------------------------------------------- */

/** One explicitly stamped retrieval touch, in the validator's currency. */
export interface RetrievalTouchView {
  ref: string;
  topicRef: string;
  date: string;
  purpose: RetrievalPurpose;
  minimumGapDays?: number;
  groupId?: string | null;
  index?: number;
}

export const RETRIEVAL_VIOLATION_CODES = [
  "RETRIEVAL_BEFORE_LEARNING",
  "RETRIEVAL_GAP_TOO_SHORT",
  "RETRIEVAL_DUPLICATE",
  "RETRIEVAL_OUTSIDE_HORIZON",
  "RETRIEVAL_CLUSTERED",
] as const;
export type RetrievalViolationCode = (typeof RETRIEVAL_VIOLATION_CODES)[number];

/**
 * Deterministic retrieval invariants, reported as closed error codes. A mode
 * validator calls this for its *stamped* retrieval touches; unstamped items are
 * invisible to it, so a mode's own floors remain authoritative for anything the model
 * did not explicitly mark as retrieval.
 */
export function retrievalViolations(args: {
  startDate: string;
  endDate: string;
  retrievals: readonly RetrievalTouchView[];
  /** Last learning/review date for a topic ref, or null when none is known. */
  learningDateOf: (topicRef: string) => string | null;
}): RetrievalViolationCode[] {
  const codes: RetrievalViolationCode[] = [];
  for (const touch of args.retrievals) {
    // No retrieval may fall outside the plan horizon.
    if (touch.date < args.startDate || touch.date > args.endDate) {
      codes.push("RETRIEVAL_OUTSIDE_HORIZON");
      continue;
    }
    const learning = args.learningDateOf(touch.topicRef);
    if (learning === null) continue;
    const gap = dateOrdinal(touch.date) - dateOrdinal(learning);
    // Retrieval must occur strictly after the learning it revisits: never before,
    // never on the same day.
    if (gap <= 0) {
      codes.push("RETRIEVAL_BEFORE_LEARNING");
      continue;
    }
    if (touch.minimumGapDays !== undefined && gap < touch.minimumGapDays) {
      codes.push("RETRIEVAL_GAP_TOO_SHORT");
    }
  }
  // Duplicate-purpose work: the same unit revisited for the same purpose on the same
  // day, or the same group position stated twice.
  const seenPurpose = new Set<string>();
  const seenGroupIndex = new Set<string>();
  for (const touch of args.retrievals) {
    const purposeKey = `${touch.topicRef}|${touch.purpose}|${touch.date}`;
    if (seenPurpose.has(purposeKey)) codes.push("RETRIEVAL_DUPLICATE");
    seenPurpose.add(purposeKey);
    if (touch.groupId && touch.index !== undefined) {
      const groupKey = `${touch.groupId}|${touch.index}`;
      if (seenGroupIndex.has(groupKey)) codes.push("RETRIEVAL_DUPLICATE");
      seenGroupIndex.add(groupKey);
    }
  }
  // Clustering: two different retrieval purposes for the same unit stacked on one day.
  const byTopicDate = new Map<string, RetrievalPurpose[]>();
  for (const touch of args.retrievals) {
    const key = `${touch.topicRef}|${touch.date}`;
    const purposes = byTopicDate.get(key) ?? [];
    for (const prior of purposes)
      if (prior !== touch.purpose) codes.push("RETRIEVAL_CLUSTERED");
    purposes.push(touch.purpose);
    byTopicDate.set(key, purposes);
  }
  return codes;
}

/**
 * Throws the first retrieval invariant violation as a `PlannerValidationError`, or
 * returns silently when every stamp satisfies the invariants.
 */
export function assertRetrievalInvariants(args: {
  startDate: string;
  endDate: string;
  retrievals: readonly RetrievalTouchView[];
  learningDateOf: (topicRef: string) => string | null;
}): void {
  const violations = retrievalViolations(args);
  if (violations.length) throw new PlannerValidationError(violations[0]);
}

/* ------------------------------------------------------------------------- *
 * Stamping: model references during generation, durable ids after normalization
 * ------------------------------------------------------------------------- */

/**
 * Stamps a generated (proposal) item with the model-side retrieval identity. The
 * group token is a plan-local `rgN`, exactly like a proposal's `iN` item refs; the
 * durable `retrievalGroupId` is minted later at normalization.
 */
export function stampProposalRetrieval(
  purpose: RetrievalPurpose,
  groupRef: string,
  index: number,
  minimumGapDays: number
): RetrievalStamp {
  return {
    retrievalGroupRef: groupRef,
    retrievalIndex: index,
    minimumGapDays,
    retrievalPurpose: purpose,
  };
}

/**
 * Converts model-side `retrievalGroupRef` tokens into durable `retrievalGroupId`
 * identities at normalization, in the same pattern the server mints `ref` → `key`.
 * A shared token maps to one stable id, and the token is dropped from the stored item.
 * Items without a token are returned untouched.
 */
export function normalizeRetrievalStamps<
  T extends { retrievalGroupRef?: string; retrievalGroupId?: string | null }
>(items: readonly T[], mint: (groupRef: string) => string): T[] {
  const ids = new Map<string, string>();
  return items.map((item) => {
    if (!item.retrievalGroupRef) return item;
    const { retrievalGroupRef, ...rest } = item;
    let id = ids.get(retrievalGroupRef);
    if (!id) {
      id = mint(retrievalGroupRef);
      ids.set(retrievalGroupRef, id);
    }
    return { ...rest, retrievalGroupId: id } as T;
  });
}

/**
 * The last learning date per topic, from items of the given learning intents. Used by
 * callers to build the `learningDateOf` argument for `assertRetrievalInvariants`; the
 * default intents are the items a retrieval touch revisits (LEARN, then the
 * consolidation/practice it follows).
 */
export function learningDatesOf(
  items: readonly { topicRef: string; type: string; date: string }[],
  learningTypes: readonly string[] = ["LEARN", "REVIEW", "PRACTICE", "TIMED_PRACTICE"]
): Map<string, string> {
  const last = new Map<string, string>();
  for (const item of items) {
    if (!learningTypes.includes(item.type)) continue;
    const existing = last.get(item.topicRef);
    if (!existing || item.date > existing) last.set(item.topicRef, item.date);
  }
  return last;
}
