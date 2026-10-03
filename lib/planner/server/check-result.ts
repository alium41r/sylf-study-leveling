import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { boundedParse, KeySchema, ValidatedDraftV1Schema } from "../contracts";
import { MasteryCheckResultSchema, masteryCheckResultLabel } from "../rebalance-fields";
import { PlannerError } from "../errors";
import { ownedPlan, transaction } from "./core";

/**
 * User-reported Mastery Check reflection (Phase 5).
 *
 * This is the one place a reflection is persisted, and it stores ONLY the fixed
 * closed vocabulary — no reflection text, no score, no academic inference. It
 * writes nothing else: no Quest change, no SubjectNode progress, no revision
 * change, no goal change, and it never touches the quota system (zero provider
 * calls, zero quota rows). The value is editable/resettable, not append-only.
 */

const SetCheckResultSchema = z.strictObject({
  schemaVersion: z.literal(1),
  itemKey: KeySchema,
  revisionId: KeySchema,
  result: MasteryCheckResultSchema,
});

const ResetCheckResultSchema = z.strictObject({
  schemaVersion: z.literal(1),
  itemKey: KeySchema,
});

/**
 * Records (or replaces) the user's reflection for one Mastery Check item.
 *
 * The referenced revision must be the one that actually carried the check: owned
 * by this plan, SEALED (so its draft exists) and confirmed (so it is the plan the
 * user is executing). A foreign plan/revision is indistinguishable from one that
 * never materialized, so both surface as NOT_FOUND; an item that is not this
 * plan's MASTERY_CHECK item is UNKNOWN_CHECK_ITEM.
 */
export async function setCheckResult(userId: number, planId: string, raw: unknown) {
  KeySchema.parse(planId);
  const body = boundedParse(SetCheckResultSchema, raw);
  return transaction(userId, async tx => {
    await ownedPlan(tx, userId, planId);
    const revision = await tx.plannerRevision.findFirst({ where: { id: body.revisionId, planId } });
    if (!revision || revision.operationState !== "SEALED" || !revision.confirmationReceipt)
      throw new PlannerError(404, "NOT_FOUND");
    const draft = boundedParse(ValidatedDraftV1Schema, revision.outputSnapshot);
    const item = draft.items.find(item => item.key === body.itemKey);
    if (!item || item.masteryStage !== "MASTERY_CHECK")
      throw new PlannerError(422, "UNKNOWN_CHECK_ITEM");
    // Deterministic per check item: a second report replaces the first instead of
    // growing history, so upsert on the unique plan/item key.
    const row = await tx.plannerCheckResult.upsert({
      where: { planId_itemKey: { planId, itemKey: body.itemKey } },
      create: { planId, userId, revisionId: body.revisionId, itemKey: body.itemKey, result: body.result },
      update: { revisionId: body.revisionId, result: body.result },
    });
    // The database CHECK constraint already guarantees the closed set; re-parsing
    // gives the returned `result` its enum type instead of a bare string.
    const result = MasteryCheckResultSchema.parse(row.result);
    return { ...row, result, label: masteryCheckResultLabel(result) };
  });
}

/**
 * Clears the user's reflection for one Mastery Check item. Deleting an absent row
 * is a no-op, so reset is idempotent and never surfaces a missing-record error.
 */
export async function resetCheckResult(userId: number, planId: string, raw: unknown) {
  KeySchema.parse(planId);
  const body = boundedParse(ResetCheckResultSchema, raw);
  return transaction(userId, async tx => {
    await ownedPlan(tx, userId, planId);
    await tx.plannerCheckResult.deleteMany({ where: { planId, itemKey: body.itemKey } });
    return { reset: true, itemKey: body.itemKey };
  });
}

/**
 * Owner-scoped read of every recorded reflection for one plan. A projection, not
 * the full rows: no account-adjacent fields cross this boundary.
 */
export async function checkResultsForPlan(userId: number, planId: string) {
  KeySchema.parse(planId);
  await ownedPlan(prisma, userId, planId);
  return prisma.plannerCheckResult.findMany({
    where: { planId },
    orderBy: { itemKey: "asc" },
    select: { itemKey: true, revisionId: true, result: true, updatedAt: true },
  });
}
