import { z } from "zod";
import type { ValidatedDraftV1, PlannerItem } from "./contracts";
import { activeItems } from "./contracts";
import { DateKeySchema, KeySchema } from "./contracts";

/**
 * Re-offering work the student released: the deliberate, explicit half of Phase 4's tombstone.
 *
 * Phase 4 made a release durable so no replan could quietly resurrect it. That is only half a
 * conversation. A student who removes "the Vectors recall session" because the plan is heavy in
 * week two may well want a *shorter* version of it once the exam is four weeks away — and the
 * planner is the thing that knows the gap is still there. So Sylf is allowed to say so, once,
 * plainly, with the student's own decision named in the sentence:
 *
 * > You previously removed the Vectors recall session. Because the exam is now closer, Sylf
 * > recommends adding a shorter replacement. [Add replacement] [Leave it out]
 *
 * Four properties make this a re-offer rather than a resurrection:
 *
 * 1. **The need is re-derived, not remembered.** The offer exists only while the *current*
 *    draft still has the gap the released item used to fill — the same deterministic
 *    predicates the mode validators use. If a later replan puts an equivalent session back on
 *    its own, the offer disappears by itself, because the gap closed. Nothing here consults
 *    the tombstone to decide whether work is needed; the tombstone only says what was removed.
 * 2. **The replacement is a new item, never the old one.** It carries
 *    `replacementForReleasedItemKey`, a distinct title and a shorter duration, and the
 *    tombstone keeps its `USER_RELEASED` disposition for good. Nothing in this module can
 *    write `disposition`.
 * 3. **Nothing is materialised until the student says so.** Deriving an offer is a read. The
 *    replacement becomes a Quest only through an explicit acceptance, and then through the
 *    same path stretch promotion uses: an ordinary Quest with an ordinary link.
 * 4. **A decline is final.** One bounded record on the tombstone stops Sylf making the same
 *    suggestion twice. There is no offer history, no scoring and no ranking — a single closed
 *    state per released item.
 */

/** Closed states for the one bounded piece of re-offer bookkeeping. */
export const REOFFER_STATES = ["OFFERED", "ACCEPTED", "DECLINED"] as const;
export const ReofferStateSchema = z.enum(REOFFER_STATES);
export type ReofferState = (typeof REOFFER_STATES)[number];

export const REOFFER_LIMITS = {
  /** Offers shown at once. A plan with twenty released items is not twenty questions. */
  offers: 3,
  /**
   * A replacement is deliberately shorter than what it replaces.
   *
   * The most common reason to release a session is that it was too much, so handing the same
   * amount back would be to ignore why it went. Six tenths keeps the shape of the original
   * while making the offer a real compromise, and the engine's own 15–240 minute bounds clamp
   * it at both ends — never shorter than a session can be, never longer than the original.
   */
  replacementFactor: 0.6,
  /** Characters of the original title carried into the replacement's title. */
  titleChars: 160,
} as const;

/**
 * The item as it was frozen into a link's `baseline` when the planner created it.
 *
 * Shared, because two features need the same fact for different reasons: a re-offer has to
 * know what was released in order to shape a replacement, and the release path needs it to
 * describe work whose item is no longer in the current draft. A replacement Quest is created
 * *outside* the reviewed revision — the plan the student confirmed did not contain it — so its
 * only durable description is the baseline written with its link, and reading it here is what
 * keeps the two features from disagreeing about what the item is.
 *
 * Returns null for anything that is not a recognisable item: a baseline is stored JSON, and a
 * malformed one must produce "unknown", never a half-built Quest.
 */
export function baselineItem(baseline: unknown): PlannerItem | null {
  const record = baseline as { item?: unknown } | null;
  const candidate = record?.item as Partial<PlannerItem> | undefined;
  if (!candidate || typeof candidate !== "object") return null;
  if (typeof candidate.key !== "string" || typeof candidate.topicKey !== "string") return null;
  if (typeof candidate.title !== "string" || typeof candidate.type !== "string") return null;
  if (typeof candidate.minutes !== "number" || typeof candidate.date !== "string") return null;
  return candidate as PlannerItem;
}

/** The minimum a release tombstone has to tell us for a re-offer to be possible. */
export interface ReleasedBaseline {
  itemKey: string;
  removedAt: string | null;
  /** The item as it was when the planner created it, frozen inside the link's baseline. */
  item: Pick<PlannerItem, "key" | "topicKey" | "title" | "type" | "minutes" | "date"> | null;
  reofferState: ReofferState | null;
}

export interface ReofferOffer {
  /** The tombstone this offer belongs to. */
  releasedItemKey: string;
  /** What the student removed, in their own plan's words. */
  releasedTitle: string;
  releasedMinutes: number;
  releasedType: string;
  /** The unit the released work was for, as the current draft names it. */
  unitLabel: string | null;
  /** The replacement, fully described and not yet created. */
  replacement: {
    title: string;
    minutes: number;
    type: string;
  };
  /** Why Sylf is raising it again, in one sentence the surface can show verbatim. */
  because: string;
}

/** The replacement's title: the original, marked as a replacement so the two are never confused. */
export function replacementTitle(original: string): string {
  const trimmed = original.trim().slice(0, REOFFER_LIMITS.titleChars);
  return trimmed ? `${trimmed} (shorter replacement)` : "Shorter replacement";
}

/**
 * The replacement's length: shorter than the original, inside the engine's own bounds.
 *
 * Exported because the offer the student reads and the Quest that is eventually created must
 * agree, and one function is the only way to guarantee that.
 */
export function replacementMinutes(originalMinutes: number): number {
  const scaled = Math.round(originalMinutes * REOFFER_LIMITS.replacementFactor);
  return Math.min(240, Math.max(15, scaled));
}

/**
 * Does the plan still have the gap this released item used to fill?
 *
 * The comparison is against the draft *as executed*, which is not the same list as the draft
 * on its own: releasing a session removes its Quest but deliberately leaves the item in the
 * frozen revision — the reviewed plan is not rewritten by a release — so the released items
 * must be taken out here or every released session would look like the work that fills its own
 * gap. Every tombstone is excluded, not just the one being considered, because two released
 * recalls of the same unit leave the same gap twice.
 */
function gapRemains(
  draft: ValidatedDraftV1,
  released: PlannerItem,
  releasedKeys: ReadonlySet<string>
): boolean {
  const left = activeItems(draft.items).filter(
    (item) => item.topicKey === released.topicKey && !releasedKeys.has(item.key)
  );
  // A unit with no work at all is a bigger gap than a missing recall session, and it is the
  // same predicate `releaseFindings` uses when it reports `MISSING_SCOPE_TOPIC`.
  if (!left.length) return true;
  /**
   * Types are compared in the two families the planner actually distinguishes: retrieval
   * (RECALL/REVIEW) and practice (PRACTICE/TIMED_PRACTICE/ASSESS). A released RECALL is not
   * re-offered because a REVIEW took its place, and a released PRACTICE is not re-offered
   * because a TIMED_PRACTICE did — those are the same educational job.
   */
  const family = (type: string): string => {
    if (["RECALL", "REVIEW"].includes(type)) return "RETRIEVAL";
    if (["PRACTICE", "TIMED_PRACTICE", "ASSESS"].includes(type)) return "PRACTICE";
    return type;
  };
  return !left.some((item) => family(item.type) === family(released.type));
}

/**
 * Every released item of a plan that the planner still believes is worth offering back.
 *
 * Read-only and deterministic: the same plan and the same draft always produce the same
 * offers, in the same order. The order is oldest release first, because the gap a student
 * created longest ago is the one most likely to matter by now.
 */
export function reoffersFor(
  draft: ValidatedDraftV1,
  released: readonly ReleasedBaseline[],
  limit: number = REOFFER_LIMITS.offers
): ReofferOffer[] {
  const titleOf = new Map(draft.topics.map((topic) => [topic.key, topic.title]));
  const out: ReofferOffer[] = [];
  const releasedKeys = new Set(released.map((entry) => entry.itemKey));
  const ordered = [...released].sort((a, b) => (a.removedAt ?? "").localeCompare(b.removedAt ?? ""));

  for (const entry of ordered) {
    if (out.length >= limit) break;
    // A declined or already-accepted offer is answered. Sylf does not ask again.
    if (entry.reofferState !== null) continue;
    if (!entry.item) continue;
    // Only a *gap* justifies an offer. Work that the plan replaced on its own needs nothing.
    if (!gapRemains(draft, entry.item as PlannerItem, releasedKeys)) continue;
    // A replacement that already exists — however it got there — closes the offer.
    if (activeItems(draft.items).some((item) => item.replacementForReleasedItemKey === entry.itemKey))
      continue;

    const minutes = replacementMinutes(entry.item.minutes);
    /**
     * A replacement that cannot actually be shorter is not an offer.
     *
     * The engine's own floor is 15 minutes, so a session already at the floor has no reduced
     * version to suggest: offering the same length back would be to ignore the reason it went
     * and to pretend the student has a choice they do not. Saying nothing is the honest answer.
     */
    if (minutes >= entry.item.minutes) continue;
    out.push({
      releasedItemKey: entry.itemKey,
      releasedTitle: entry.item.title,
      releasedMinutes: entry.item.minutes,
      releasedType: entry.item.type,
      unitLabel: titleOf.get(entry.item.topicKey) ?? null,
      replacement: {
        title: replacementTitle(entry.item.title),
        minutes,
        type: entry.item.type,
      },
      /**
       * Why now, in words. Deliberately about *the plan*, not about the student: Sylf can see
       * that the unit still has no retrieval session, and it cannot see why the session went.
       * The disclosure the goal requires — that this was the student's own decision and that
       * declining is allowed — travels with the offer in the surface copy.
       */
      because: titleOf.has(entry.item.topicKey)
        ? `${titleOf.get(entry.item.topicKey)} still has no session of this kind in the plan.`
        : "The plan still has nothing of this kind for that unit.",
    });
  }
  return out;
}

/**
 * The disclosure every re-offer surface must show, as one sentence.
 *
 * Stated once, here, so no surface can present a re-offer without saying who removed the work
 * and that saying no is allowed.
 */
export function reofferDisclosure(offer: ReofferOffer): string {
  return `You removed “${offer.releasedTitle}” yourself. ${offer.because} A shorter replacement would take ${offer.replacement.minutes} minutes instead of the ${offer.releasedMinutes} minutes you had. You can leave it out.`;
}

export const ReofferAcceptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  expectedVersion: z.number().int().nonnegative(),
  releasedItemKey: KeySchema,
  requestKey: z.string().min(8).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  today: DateKeySchema.optional(),
});

export const ReofferDeclineSchema = z.strictObject({
  schemaVersion: z.literal(1),
  expectedVersion: z.number().int().nonnegative(),
  releasedItemKey: KeySchema,
});

/** What one acceptance produced, so a retry can be answered with the same Quest. */
export interface ReofferAcceptance {
  schemaVersion: 1;
  planId: string;
  version: number;
  releasedItemKey: string;
  replacementItemKey: string;
  questId: number;
  created: boolean;
  acceptedAt: string;
}
