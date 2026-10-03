import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { boundedParse, KeySchema } from "../contracts";
import { PlannerError } from "../errors";
import {
  FrictionReasonSchema,
  FRICTION_REASONS,
  FRICTION_REASON_LABEL,
  type FrictionReason,
} from "../friction-fields";
import { ownedPlan, transaction } from "./core";

export { FrictionReasonSchema, FRICTION_REASONS, FRICTION_REASON_LABEL };
export type { FrictionReason };

/**
 * Planner friction feedback (Phase 6).
 *
 * One optional, user-reported friction reason attached to a planner draft item.
 * The signal is a single closed code — there is deliberately no free-text note
 * column, so nothing a user types can reach this store. `itemKey` is the planner
 * draft item key (a canonical lowercase UUID), NOT a Quest id: friction is
 * reported against a draft item, which may predate (or never become) a Quest.
 *
 * Recording is side-effect free: it never calls a provider, never spends quota,
 * never creates a revision, and never creates/moves/deletes a Quest. It is
 * idempotent under the per-(user, plan, revision, item, reason) unique constraint.
 */

/** Bounded read/aggregate ceilings: a plan carries at most 60 items, 6 reasons each. */
export const FRICTION_LIMITS = {
  listRows: 200,
  summaryRows: 200,
} as const;

const FrictionItemKeySchema = z
  .string()
  .regex(
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
    "itemKey must be a canonical lowercase UUID"
  );

const RecordFrictionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  revisionId: KeySchema.nullable().optional(),
  itemKey: FrictionItemKeySchema,
  reasonCode: FrictionReasonSchema,
});

export interface FrictionSummary {
  total: number;
  byReasonCode: Record<string, number>;
  byItemKey: Record<string, number>;
}

/**
 * Records one friction reason for a draft item.
 *
 * Idempotent: if the same user has already recorded the same reason for the same
 * item in the same revision, the existing row is returned instead of a duplicate.
 * An optional revisionId must belong to this plan; anything else surfaces as
 * NOT_FOUND without revealing whether the revision exists elsewhere.
 */
export async function recordFriction(userId: number, planId: string, raw: unknown) {
  KeySchema.parse(planId);
  const body = boundedParse(RecordFrictionSchema, raw);
  return transaction(userId, async tx => {
    await ownedPlan(tx, userId, planId);
    if (body.revisionId) {
      const revision = await tx.plannerRevision.findFirst({
        where: { id: body.revisionId, planId },
        select: { id: true },
      });
      if (!revision) throw new PlannerError(404, "NOT_FOUND");
    }
    const revisionId = body.revisionId ?? null;
    const existing = await tx.plannerFrictionEvent.findFirst({
      where: { userId, planId, revisionId, itemKey: body.itemKey, reasonCode: body.reasonCode },
    });
    if (existing) return existing;
    return tx.plannerFrictionEvent.create({
      data: { planId, revisionId, itemKey: body.itemKey, userId, reasonCode: body.reasonCode },
    });
  });
}

/** Owner-scoped, projected list of recorded friction events for a plan (or one revision). */
export async function frictionEventsForPlan(
  userId: number,
  planId: string,
  revisionId?: string
) {
  KeySchema.parse(planId);
  await ownedPlan(prisma, userId, planId);
  if (revisionId) KeySchema.parse(revisionId);
  return prisma.plannerFrictionEvent.findMany({
    where: { planId, ...(revisionId ? { revisionId } : {}) },
    orderBy: { createdAt: "asc" },
    take: FRICTION_LIMITS.listRows,
    select: { itemKey: true, revisionId: true, reasonCode: true, createdAt: true },
  });
}

/**
 * Compact, bounded, content-free summary of recorded friction: counts by reason
 * code and by item key. It carries no titles and no notes, so a future explicit
 * replan can consume it as context without ever reading plan content here.
 */
export async function frictionSummary(
  userId: number,
  planId: string,
  revisionId?: string
): Promise<FrictionSummary> {
  KeySchema.parse(planId);
  await ownedPlan(prisma, userId, planId);
  if (revisionId) KeySchema.parse(revisionId);
  const where = { planId, ...(revisionId ? { revisionId } : {}) };
  const [byReason, byItem] = await Promise.all([
    prisma.plannerFrictionEvent.groupBy({
      by: ["reasonCode"],
      where,
      _count: true,
    }),
    prisma.plannerFrictionEvent.groupBy({
      by: ["itemKey"],
      where,
      _count: true,
      orderBy: { itemKey: "asc" },
      take: FRICTION_LIMITS.summaryRows,
    }),
  ]);
  const byReasonCode: Record<string, number> = {};
  for (const row of byReason) byReasonCode[row.reasonCode] = row._count;
  const byItemKey: Record<string, number> = {};
  for (const row of byItem) byItemKey[row.itemKey] = row._count;
  return {
    total: Object.values(byReasonCode).reduce((sum, count) => sum + count, 0),
    byReasonCode,
    byItemKey,
  };
}
