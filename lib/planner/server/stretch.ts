import "server-only";
import { z } from "zod";
import {
  boundedParse,
  KeySchema,
  LIMITS,
  OperationKeySchema,
  UserInputV1Schema,
  ValidatedDraftV1Schema,
} from "../contracts";
import { validateCapacity } from "../capacity";
import { constraintCapacityInput } from "../exam-policy";
import { localToday } from "../dates";
import { PlannerError } from "../errors";
import { isStretch } from "../planner-role";
import {
  assertVersion,
  json,
  loadAvailability,
  ownedPlan,
  transaction,
} from "./core";
import { expansionWindow, mapQuest } from "./materialize";

/**
 * Promoting optional STRETCH work into the schedule (A2, Core + Stretch).
 *
 * Stretch is planner-owned optional work: it is generated, reviewed and stored, but
 * confirmation deliberately does not materialize it, so it can never turn into an
 * overdue Quest merely because the generator produced it. This is the only path that
 * turns a Stretch item into ordinary execution, and it is explicit — the student asks
 * for that item, by name.
 *
 * What it is NOT:
 * - not a provider call: an already-generated item needs no model, so promoting spends
 *   no quota and is instant;
 * - not a plan change: the revision, its digest, its snapshots and the plan's active
 *   pointer are untouched. Promotion adds execution the reviewed plan already
 *   described, and bumps the plan version so any sealed proposal built on the older
 *   reality is correctly refused as stale;
 * - not optional-after-the-fact: once promoted, the item is an ordinary Quest with
 *   ordinary rules and ordinary rewards.
 *
 * It is idempotent in the strongest available sense: the planner link is the record,
 * so promoting the same item twice returns the same Quest instead of creating a
 * second one.
 */
export const PromoteStretchSchema = z.strictObject({
  schemaVersion: z.literal(1),
  revisionId: KeySchema,
  itemKeys: z
    .array(KeySchema)
    .min(1)
    .max(LIMITS.items)
    .refine((keys) => new Set(keys).size === keys.length),
  expectedVersion: z.number().int().nonnegative(),
  /** Accepted so the caller can retry a lost response; the link state is the guard. */
  idempotencyKey: OperationKeySchema.optional(),
});

export interface StretchPromotion {
  schemaVersion: 1;
  planId: string;
  revisionId: string;
  version: number;
  /** Items already promoted are returned too, with the Quest they already own. */
  items: { itemKey: string; questId: number; created: boolean }[];
  promotedAt: string;
}

export async function promoteStretch(
  userId: number,
  planId: string,
  raw: unknown,
  now = new Date()
): Promise<StretchPromotion> {
  KeySchema.parse(planId);
  const body = boundedParse(PromoteStretchSchema, raw);
  return transaction(userId, async (tx) => {
    const plan = await ownedPlan(tx, userId, planId);
    assertVersion(plan, body.expectedVersion);
    const revision = await tx.plannerRevision.findFirst({
      where: { id: body.revisionId, planId },
    });
    // Only a confirmed revision may be promoted from: promoting a draft would let work
    // reach the schedule without the review the plan went through.
    if (
      !revision ||
      revision.operationState !== "SEALED" ||
      !revision.confirmationReceipt
    )
      throw new PlannerError(404, "NOT_FOUND");
    const input = boundedParse(UserInputV1Schema, revision.inputSnapshot, LIMITS.inputBytes);
    const draft = boundedParse(ValidatedDraftV1Schema, revision.outputSnapshot);
    const requested = draft.items.filter((item) =>
      body.itemKeys.includes(item.key)
    );
    if (requested.length !== body.itemKeys.length)
      throw new PlannerError(400, "UNKNOWN_ITEM");
    if (requested.some((item) => item.removed))
      throw new PlannerError(422, "STRETCH_REQUIRED");
    // Required work cannot arrive through this door: a CORE item is either already
    // scheduled by confirmation or its absence is a plan problem, not a promotion.
    if (requested.some((item) => !isStretch(item)))
      throw new PlannerError(422, "STRETCH_REQUIRED");

    const links = await tx.plannerQuestLink.findMany({ where: { planId } });
    const alreadyPromoted = new Map(
      links
        .filter((link) => link.questId !== null)
        .map((link) => [link.itemKey, link.questId as number])
    );
    const pending = requested.filter((item) => !alreadyPromoted.has(item.key));
    const state = await loadAvailability(
      tx,
      plan,
      input,
      draft.mode === "ROADMAP" && draft.expansion
        ? expansionWindow(draft, draft.expansion.milestoneKey)
        : undefined
    );
    // Promoting work into the past would create an overdue Quest by construction, which
    // is the one thing optional work must never do.
    for (const item of pending)
      if (item.date < localToday(state.timezone))
        throw new PlannerError(409, "PAST_DATE");
    // A promotion still has to fit: the schedule the student agreed to is authoritative,
    // so extra work is refused when the capacity it needs is not actually there.
    if (
      pending.length &&
      !validateCapacity(constraintCapacityInput(input), state, pending).feasible
    )
      throw new PlannerError(422, "INFEASIBLE_CAPACITY");

    const items: StretchPromotion["items"] = [];
    for (const item of requested) {
      const existing = alreadyPromoted.get(item.key);
      if (existing) {
        items.push({ itemKey: item.key, questId: existing, created: false });
        continue;
      }
      const fields = mapQuest(item, userId, plan.subjectId, plan.goalId);
      const quest = await tx.quest.create({ data: fields });
      await tx.plannerQuestLink.create({
        data: {
          planId,
          itemKey: item.key,
          questId: quest.id,
          createdRevisionId: revision.id,
          appliedRevisionId: revision.id,
          // Promotion is recorded in the immutable baseline, next to the item it
          // belongs to, so the Quest's own lineage says how it entered the schedule.
          baseline: json({
            item,
            quest: fields,
            promoted: {
              reason: "USER_PROMOTED_STRETCH",
              at: now.toISOString(),
            },
          }),
        },
      });
      items.push({ itemKey: item.key, questId: quest.id, created: true });
    }
    const promotedAt = now.toISOString();
    if (!items.some((item) => item.created))
      // Nothing changed: a replay returns the same receipt and leaves the version alone,
      // so a repeated request cannot invalidate a proposal by accident.
      return {
        schemaVersion: 1 as const,
        planId,
        revisionId: revision.id,
        version: plan.version,
        items,
        promotedAt,
      };
    await tx.plannerPlan.update({
      where: { id: planId },
      data: { version: { increment: 1 } },
    });
    return {
      schemaVersion: 1 as const,
      planId,
      revisionId: revision.id,
      version: plan.version + 1,
      items,
      promotedAt,
    };
  });
}
