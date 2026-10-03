import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { boundedParse, DateKeySchema, KeySchema, LIMITS, UserInputV1Schema, ValidatedDraftV1Schema } from "../contracts";
import { PlannerError } from "../errors";
import { activeItems, type ValidatedDraftV1 } from "../contracts";
import { finding, type PlannerFinding } from "../intake/findings";
import { recommendationConsequence } from "../draft-rules";
import { baselineItem } from "../reoffer";
import { transaction, type Tx } from "../server/core";
import { readExecution } from "../server/rebalance";
import { classifyExecution, isPlannerQuestReplannable } from "../rebalance-policy";
import { ownedPlan } from "../server/core";
import { plannerTelemetry } from "../telemetry";

/**
 * Releasing planner-generated work: the student's own decision to stop being responsible
 * for one specific piece of unstarted work.
 *
 * This is not deletion. Deleting a Quest says "this task is gone"; releasing says "I am
 * not doing this, and I want the planner to remember that it made this task for me". The
 * difference is the whole point: a release is durable evidence, so no later replan,
 * rebalance, refresh or regeneration can quietly hand the same responsibility back.
 *
 * Four properties hold the feature together:
 *
 * 1. **Eligibility is derived, never asserted.** The decision comes from the same
 *    execution classification the replan engine uses — pending, unstarted, unedited,
 *    planner-owned — and is re-checked inside the transaction against a locked row, so a
 *    Quest that starts between the preview and the confirmation is refused rather than
 *    silently released.
 * 2. **The tombstone is written before the Quest is removed.** The link is detached and
 *    marked `USER_RELEASED` first, which is what makes the row-level SQL guard treat the
 *    following delete as an ordinary unlinked Quest. If the delete then fails, the
 *    transaction rolls back and nothing was released.
 * 3. **Findings, not refusals.** If releasing the item leaves an educational gap — no
 *    later retrieval, no mistake review, no mock, no final review, a unit with no work —
 *    the service returns the same warning codes and wording the flexible-draft path uses.
 *    The student may accept the tradeoff; structural invariants still block.
 * 4. **Lineage survives.** The link keeps its `itemKey`, `baseline` and `createdRevisionId`
 *    (both frozen by the migration's guard), so the planner can always say that *it*
 *    created this work and that the student released it.
 */

/** Why a release was refused, as a closed code with a different next action each time. */
export const RELEASE_BLOCK_CODES = [
  "RELEASE_NOT_FOUND",
  "RELEASE_NOT_OWNED",
  "RELEASE_NOT_PLANNER_OWNED",
  "RELEASE_ALREADY_RELEASED",
  "RELEASE_STARTED",
  "RELEASE_IN_PROGRESS",
  "RELEASE_COMPLETED",
  "RELEASE_FAILED",
  "RELEASE_PROTECTED",
  "RELEASE_CONFLICTED",
  "RELEASE_STALE_REVISION",
  "RELEASE_NO_MATCH",
] as const;
export type ReleaseBlockCode = (typeof RELEASE_BLOCK_CODES)[number];

export const RELEASE_REASONS = [
  "NOT_NEEDED",
  "NO_TIME",
  "ALREADY_KNOW_IT",
  "TOO_MUCH_WORK",
  "OTHER",
] as const;
export const ReleaseReasonSchema = z.enum(RELEASE_REASONS);
export type ReleaseReason = (typeof RELEASE_REASONS)[number];

export const ReleaseRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  expectedVersion: z.number().int().nonnegative(),
  requestKey: z.string().min(8).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  /** The exact plan items to release, by durable key. Bounded like every planner list. */
  itemKeys: z.array(KeySchema).min(1).max(5),
  reason: ReleaseReasonSchema,
  today: DateKeySchema.optional(),
});

export interface ReleaseOutcome {
  released: {
    itemKey: string;
    label: string;
    minutes: number;
    type: string;
  }[];
  /** Educational consequences the student is entitled to accept, not refusals. */
  findings: PlannerFinding[];
  /** True when the same request key had already been applied. */
  replayed: boolean;
}

/** One release candidate, as the Copilot and the UI see it before deciding. */
export interface ReleaseCandidate {
  itemKey: string;
  questId: number;
  title: string;
  minutes: number;
  type: string;
  date: string;
  unitLabels: string[];
  locked: boolean;
}

/**
 * The closed refusal for one item, or null when it may be released.
 *
 * Written as one function so the preview the student sees and the enforcement in the
 * transaction cannot disagree about eligibility.
 */
function blockFor(row: {
  disposition: string;
  className: string;
  locked: boolean;
}): ReleaseBlockCode | null {
  if (row.disposition === "USER_RELEASED") return "RELEASE_ALREADY_RELEASED";
  if (row.disposition === "DELETED") return "RELEASE_ALREADY_RELEASED";
  if (row.disposition === "DETACHED") return "RELEASE_CONFLICTED";
  if (row.disposition !== "LIVE") return "RELEASE_CONFLICTED";
  if (row.className === "COMPLETED") return "RELEASE_COMPLETED";
  if (row.className === "FAILED") return "RELEASE_FAILED";
  if (row.className === "IN_PROGRESS") return "RELEASE_IN_PROGRESS";
  if (row.className === "STARTED") return "RELEASE_STARTED";
  if (row.className === "DELETED") return "RELEASE_ALREADY_RELEASED";
  if (row.className === "DETACHED") return "RELEASE_CONFLICTED";
  if (row.className === "CONFLICTED") return "RELEASE_CONFLICTED";
  // A locked item is the student's own protection; release must not override it silently.
  if (row.locked) return "RELEASE_PROTECTED";
  return null;
}

/**
 * Every item of a confirmed plan that may currently be released.
 *
 * Read-only: this is what the Copilot offers and what the release preview is built from.
 */
export async function releaseCandidates(
  userId: number,
  planId: string,
  today: string,
  tx: Tx | typeof prisma = prisma
): Promise<ReleaseCandidate[]> {
  KeySchema.parse(planId);
  const plan = await ownedPlan(tx as Tx, userId, planId);
  if (!plan.activeRevisionId) return [];
  const revision = await tx.plannerRevision.findUnique({
    where: { id: plan.activeRevisionId },
    select: { outputSnapshot: true },
  });
  if (!revision?.outputSnapshot) return [];
  const draft = boundedParse(ValidatedDraftV1Schema, revision.outputSnapshot);
  const execution = await readExecution(tx as Tx, planId, today);
  const titleOf = new Map(draft.topics.map((topic) => [topic.key, topic.title]));
  const drafts = new Map(activeItems(draft.items).map((item) => [item.key, item]));
  /**
   * An item the current draft does not contain is still describable.
   *
   * A replacement the student accepted after a release is created outside the reviewed
   * revision — the plan they confirmed did not contain it — so its only durable description is
   * the baseline written with its link. Refusing to release it because the frozen draft has
   * never heard of it would be an arbitrary restriction on work the student is plainly
   * responsible for; the baseline is the item exactly as the planner created it, which is what
   * every label here needs. Anything unreadable is skipped rather than half-described.
   */
  const orphanKeys = execution.rows
    .filter((row) => !drafts.has(row.itemKey))
    .map((row) => row.itemKey);
  const baselineItems = new Map<string, ReturnType<typeof baselineItem>>();
  if (orphanKeys.length) {
    const links = await tx.plannerQuestLink.findMany({
      where: { planId, itemKey: { in: orphanKeys } },
      select: { itemKey: true, baseline: true },
    });
    for (const link of links) baselineItems.set(link.itemKey, baselineItem(link.baseline));
  }
  const out: ReleaseCandidate[] = [];
  for (const row of execution.rows) {
    const className = classifyExecution(row, today);
    const item = drafts.get(row.itemKey) ?? baselineItems.get(row.itemKey) ?? undefined;
    if (!item) continue;
    const locked = item.locked === true;
    if (blockFor({ disposition: row.disposition, className, locked })) continue;
    if (!isPlannerQuestReplannable(row, className)) continue;
    if (row.questId === null) continue;
    out.push({
      itemKey: row.itemKey,
      questId: row.questId,
      title: item.title,
      minutes: item.minutes,
      type: item.type,
      date: item.date,
      unitLabels: [item.topicKey, ...(item.relatedTopicKeys ?? [])]
        .map((key) => titleOf.get(key))
        .filter((label): label is string => Boolean(label)),
      locked,
    });
  }
  return out;
}

/**
 * Educational consequences of removing one item from a draft.
 *
 * Deterministic and closed: the same predicates the mode validators use, expressed as the
 * recommendation codes the draft-edit path already surfaces, so a release talks about gaps
 * in exactly the same vocabulary as an edit and the student sees one warning system rather
 * than two.
 */
export function releaseFindings(
  draft: ValidatedDraftV1,
  itemKeys: readonly string[]
): PlannerFinding[] {
  const released = new Set(itemKeys);
  const remaining = activeItems(draft.items).filter((item) => !released.has(item.key));
  const releasedItems = activeItems(draft.items).filter((item) => released.has(item.key));
  const findings: PlannerFinding[] = [];
  const titleOf = new Map(draft.topics.map((topic) => [topic.key, topic.title]));
  const push = (code: string, where: string | null) =>
    findings.push(
      finding(code, where ? { kind: "UNIT", ref: where } : { kind: "DRAFT" }, recommendationConsequence(code, where))
    );

  const units = [...new Set(releasedItems.map((item) => item.topicKey))];
  for (const topicKey of units) {
    const label = titleOf.get(topicKey) ?? null;
    const left = remaining.filter((item) => item.topicKey === topicKey);
    if (!left.length) {
      // The unit has no work at all now: that is the same consequence as deleting every
      // item of a unit by hand, and it is reported in the same terms.
      push("MISSING_SCOPE_TOPIC", label);
      continue;
    }
    if (!left.some((item) => ["RECALL", "REVIEW"].includes(item.type)))
      push("MISSING_SPACED_RECALL", label);
    if (
      !left.some((item) => ["RECALL", "REVIEW"].includes(item.type)) ||
      !left.some((item) => ["PRACTICE", "TIMED_PRACTICE"].includes(item.type))
    )
      push("MISSING_CONSOLIDATION_OR_PRACTICE", label);
  }

  if (
    releasedItems.some((item) => item.type === "MOCK_EXAM") &&
    !remaining.some((item) => item.type === "MOCK_EXAM")
  )
    push("MISSING_MOCK_EXAM", null);
  if (
    releasedItems.some((item) => item.type === "FINAL_REVIEW") &&
    !remaining.some((item) => item.type === "FINAL_REVIEW")
  )
    push("MISSING_FINAL_REVIEW", null);
  if (
    releasedItems.some((item) => item.type === "MISTAKE_REVIEW") &&
    !remaining.some((item) => item.type === "MISTAKE_REVIEW")
  )
    push("MISSING_MISTAKE_REVIEW", null);
  if (
    releasedItems.some((item) => ["PRACTICE", "TIMED_PRACTICE"].includes(item.type)) &&
    !remaining.some(
      (item) =>
        ["PRACTICE", "TIMED_PRACTICE"].includes(item.type) &&
        item.relatedTopicKeys?.some((key) => key !== item.topicKey)
    )
  )
    push("MISSING_MIXED_PRACTICE", null);

  // One finding per code, in a stable order: the same release always reports the same set.
  const seen = new Set<string>();
  return findings.filter((entry) => {
    const key = `${entry.code}:${entry.scope.ref ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Release planner-generated pending work.
 *
 * The whole operation is one transaction: eligibility is re-checked against locked rows,
 * the tombstones are written, the Quests are removed, and only then is anything reported.
 * A failure anywhere leaves no half-released plan.
 */
export async function releaseGeneratedItem(
  userId: number,
  planId: string,
  raw: unknown,
  today: string
): Promise<ReleaseOutcome> {
  KeySchema.parse(planId);
  const body = boundedParse(ReleaseRequestSchema, raw);
  return transaction(userId, async (tx) => {
    const plan = await ownedPlan(tx, userId, planId, true);
    if (!plan.activeRevisionId) throw new PlannerError(409, "PLAN_NOT_CONFIRMED");
    if (plan.version !== body.expectedVersion) throw new PlannerError(409, "COPILOT_PROPOSAL_STALE");

    const revision = await tx.plannerRevision.findUnique({
      where: { id: plan.activeRevisionId },
      select: { outputSnapshot: true },
    });
    if (!revision?.outputSnapshot) throw new PlannerError(409, "PLAN_NOT_CONFIRMED");
    const draft = boundedParse(ValidatedDraftV1Schema, revision.outputSnapshot);
    const execution = await readExecution(tx, planId, today);
    const byKey = new Map(execution.rows.map((row) => [row.itemKey, row]));
    const drafts = new Map(activeItems(draft.items).map((item) => [item.key, item]));

    const targets: { itemKey: string; questId: number }[] = [];
    for (const itemKey of body.itemKeys) {
      const row = byKey.get(itemKey);
      if (!row) throw new PlannerError(404, "RELEASE_NOT_FOUND");
      let item = drafts.get(itemKey);
      // Same fallback as the preview: an accepted replacement lives outside the frozen draft,
      // so its own baseline is what describes it. Preview and enforcement resolve the item
      // through the same rule, which is what stops them disagreeing about eligibility.
      if (!item) {
        const link = await tx.plannerQuestLink.findUnique({
          where: { planId_itemKey: { planId, itemKey } },
          select: { baseline: true },
        });
        item = baselineItem(link?.baseline) ?? undefined;
      }
      if (!item) throw new PlannerError(404, "RELEASE_NOT_FOUND");
      /**
       * The disposition decides first, before the Quest is even read.
       *
       * An item the student already released has no Quest left — that is the whole point of
       * releasing it — so asking the database for one would report "not planner-owned" and
       * lose the true reason. The tombstone is consulted first, and it says what happened.
       */
      const dispositionBlock = blockFor({
        disposition: row.disposition,
        className: "PENDING_FUTURE",
        locked: item.locked === true,
      });
      if (dispositionBlock) throw new PlannerError(409, dispositionBlock);
      // Re-checked here, against the row we are about to change, so a Quest that started
      // while the student was reading the preview is refused rather than released.
      const quest = row.questId
        ? await tx.quest.findFirst({
            where: { id: row.questId, userId },
            select: { id: true, status: true, elapsedSeconds: true, completedAt: true, sessions: { select: { id: true, endedAt: true } } },
          })
        : null;
      if (!quest) throw new PlannerError(409, "RELEASE_NOT_PLANNER_OWNED");
      const guarded = {
        disposition: row.disposition,
        className: classifyExecution(
          {
            ...row,
            status: quest.status,
            elapsedSeconds: quest.elapsedSeconds,
            completedAt: quest.completedAt?.toISOString() ?? null,
            sessions: quest.sessions.length,
            activeSession: quest.sessions.some((session) => session.endedAt === null),
          },
          today
        ),
        locked: item.locked === true,
      };
      const block = blockFor(guarded);
      if (block) throw new PlannerError(block === "RELEASE_ALREADY_RELEASED" ? 409 : 422, block);
      if (quest.status === "COMPLETED" || quest.status === "FAILED")
        throw new PlannerError(422, "RELEASE_PROTECTED");
      targets.push({ itemKey, questId: quest.id });
    }

    const findings = releaseFindings(draft, body.itemKeys);
    const released: ReleaseOutcome["released"] = [];
    const titleOf = new Map(draft.topics.map((topic) => [topic.key, topic.title]));
    void titleOf;

    for (const target of targets) {
      /**
       * The tombstone first, deliberately.
       *
       * Detaching the link is what makes the following Quest delete an ordinary, unlinked
       * delete — the row-level guard then has nothing to protect — and it means the record
       * of the student's decision exists before the work disappears. Both statements are in
       * this transaction, so either both happen or neither does.
       */
      await tx.plannerQuestLink.update({
        where: { planId_itemKey: { planId, itemKey: target.itemKey } },
        data: {
          disposition: "USER_RELEASED",
          questId: null,
          removedAt: new Date(),
          removalReason: "USER_RELEASED",
          changedAt: new Date(),
        },
      });
      await tx.$queryRaw`SELECT set_config('sylf.planner_manual_quest', ${String(target.questId)}, true)`;
      await tx.quest.delete({ where: { id: target.questId } });
      const item = activeItems(draft.items).find((entry) => entry.key === target.itemKey)!;
      released.push({
        itemKey: target.itemKey,
        label: item.title,
        minutes: item.minutes,
        type: item.type,
      });
    }

    plannerTelemetry("generated_item_released", {
      mode: plan.mode as "EXAM" | "ROADMAP" | "MASTERY",
      released: released.length,
      findings: findings.length,
    });
    return { released, findings, replayed: false };
  });
}

/**
 * The releases a plan has recorded.
 *
 * Read-only, bounded and content-free apart from the item keys: this is what lets an
 * explanation say "you released this" instead of pretending the work never existed, and
 * what a later re-offer would have to consult before proposing a replacement.
 */
export async function releasedItems(
  userId: number,
  planId: string,
  tx: Tx | typeof prisma = prisma
): Promise<{ itemKey: string; removedAt: string | null }[]> {
  KeySchema.parse(planId);
  await ownedPlan(tx as Tx, userId, planId);
  const rows = await tx.plannerQuestLink.findMany({
    where: { planId, disposition: "USER_RELEASED" },
    select: { itemKey: true, removedAt: true },
    take: LIMITS.items,
  });
  return rows.map((row) => ({
    itemKey: row.itemKey,
    removedAt: row.removedAt?.toISOString() ?? null,
  }));
}

export { UserInputV1Schema };
