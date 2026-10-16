/**
 * AI Usage Limiter — Database-backed Atomic Quota Engine
 *
 * Daily usage quotas per user + feature ("chat" | "planner" | "compile")
 * are stored in the dedicated `UserQuota` table keyed by
 * (userId, feature, dateKey) where dateKey is the user's LOCAL date.
 *
 * Consumption is enforced ATOMICALLY in Postgres via a guarded upsert
 * (`INSERT ... ON CONFLICT DO UPDATE ... WHERE used < limit`), which
 * closes the parallel-request bypass that a check-then-record sequence
 * is vulnerable to. S4: the unit is RESERVED before generation begins
 * (reserveQuota) and refunded via releaseQuota on failure/timeout/abort,
 * so parallel requests either reserve or receive 429 before any spend.
 *
 * ENTITLEMENT: a configured owner account (lib/ai/entitlements) bypasses this
 * product quota entirely. Its operations are permitted without consuming a
 * unit, and its capacity is reported as explicitly unlimited (`limit` and
 * `remaining` are `null`) rather than as an artificial finite number. Usage is
 * still counted and reported for observability — it simply never blocks.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { AI_QUOTAS, type QuotaFeature } from "./config";
import { TimezoneService } from "../timezone-service";
import { getUserTimezone } from "../timezone-server";
import {
  getCognitiveEffects,
  normalizeCognitiveStats,
} from "@/lib/cognitive-stats";
import { isUnlimitedAiUser } from "./entitlements";
import { reserveOwnedQuota, settleOwnedQuota, type QuotaReservationReceipt } from "./quota-accounting";

export type { QuotaFeature } from "./config";

export interface QuotaCheckResult {
  allowed: boolean;
  used: number;
  /** Configured cap, or `null` when the account holds the unlimited entitlement. */
  limit: number | null;
  /** Units left, or `null` when the account holds the unlimited entitlement. */
  remaining: number | null;
  resetsAt: string; // ISO string of the next reset time
  /**
   * Explicit unlimited semantics for a configured owner account. `limit` and
   * `remaining` are `null` in this state — never a large sentinel number, which
   * would only reintroduce a finite cap with its own overflow edge cases.
   */
  unlimited: boolean;
}

export interface QuotaConsumeResult extends QuotaCheckResult {
  /** True when this call actually incremented the usage counter. */
  charged: boolean;
}

async function getQuotaContext(
  userId: number,
  feature: QuotaFeature
): Promise<{ dateKey: string; resetsAt: string }> {
  const config = AI_QUOTAS[feature];
  const tz = await getUserTimezone(userId);

  // Weekly quotas (AI planner) bucket by the user's local Monday-based week
  // instead of the local calendar day. The key is stored in the same
  // `dateKey` column — it is opaque to the DB.
  if (config.window === "week") {
    const { weekKey, resetsAt } = TimezoneService.getUserLocalWeekKey(tz);
    return { dateKey: weekKey, resetsAt: resetsAt.toISOString() };
  }

  const dateKey = TimezoneService.getUserLocalDate(tz);
  const resetsAt = TimezoneService.getNextMidnightUTC(tz).toISOString();
  return { dateKey, resetsAt };
}

function toResult(used: number, limit: number, resetsAt: string): QuotaCheckResult {
  return {
    allowed: used < limit,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetsAt,
    unlimited: false,
  };
}

/**
 * Result for an account holding the unlimited entitlement: capacity is
 * explicitly absent, so the operation is always permitted and no threshold can
 * ever reject it. `used` remains the REAL recorded count, because "unlimited"
 * must not mean "untracked" — the number is informational only.
 */
function unlimitedResult(used: number, resetsAt: string): QuotaCheckResult {
  return { allowed: true, used, limit: null, remaining: null, resetsAt, unlimited: true };
}

/** The user's real recorded usage for a bucket — observability, never a gate. */
async function currentUsed(
  userId: number,
  feature: QuotaFeature,
  dateKey: string
): Promise<number> {
  const row = await prisma.userQuota.findUnique({
    where: { userId_feature_dateKey: { userId, feature, dateKey } },
    select: { used: true },
  });
  return row?.used ?? 0;
}

/**
 * Effective daily limit for a feature. Discipline (Regimen ability) grants
 * +1 AI chat message per ability tier — applied here so every chat quota
 * check and reservation uses the boosted number consistently.
 */
async function getEffectiveLimit(userId: number, feature: QuotaFeature): Promise<number> {
  const base = AI_QUOTAS[feature].limit;
  if (feature !== "chat") return base;
  try {
    const stats = await prisma.userStats.findUnique({
      where: { userId },
      select: { discipline: true },
    });
    const effects = getCognitiveEffects(normalizeCognitiveStats(stats ?? undefined));
    return base + effects.bonusChatQuota;
  } catch {
    return base;
  }
}

/**
 * Non-charging read of the user's current usage for a feature.
 *
 * For an unlimited account this still reads and reports the real `used` count,
 * but answers `allowed: true` with `limit`/`remaining` of `null` — capacity is
 * unlimited, not merely large.
 */
export async function checkQuota(userId: number, feature: QuotaFeature): Promise<QuotaCheckResult> {
  const { dateKey, resetsAt } = await getQuotaContext(userId, feature);

  if (isUnlimitedAiUser(userId)) {
    return unlimitedResult(await currentUsed(userId, feature, dateKey), resetsAt);
  }

  const limit = await getEffectiveLimit(userId, feature);
  return toResult(await currentUsed(userId, feature, dateKey), limit, resetsAt);
}

/**
 * Atomically RESERVE one unit of quota for a feature. This is the charging
 * operation and it runs BEFORE any expensive generation: concurrent requests
 * serialize on the unique (userId, feature, dateKey) row and the guarded
 * upsert only increments while `used` is still below the limit, so N parallel
 * requests can never collectively exceed the cap — they either reserve or get
 * 429 before spending a token. Callers MUST call releaseQuota on failure,
 * timeout, or client abort to refund the reservation.
 *
 * ENTITLEMENT: for an unlimited account the reservation is skipped outright —
 * no counter is incremented and no synthetic reservation row is written — and
 * the operation is permitted. That is why `charged` stays FALSE in this state:
 * nothing was charged. Callers must therefore gate on
 * `!result.charged && !result.unlimited`.
 */
export async function reserveQuota(userId: number, feature: QuotaFeature): Promise<QuotaConsumeResult> {
  const { dateKey, resetsAt } = await getQuotaContext(userId, feature);

  if (isUnlimitedAiUser(userId)) {
    return {
      ...unlimitedResult(await currentUsed(userId, feature, dateKey), resetsAt),
      charged: false,
    };
  }

  const limit = await getEffectiveLimit(userId, feature);

  const rows = await prisma.$queryRawUnsafe<Array<{ used: number }>>(
    `INSERT INTO "UserQuota" ("userId", "feature", "dateKey", "used", "createdAt", "updatedAt")
     VALUES ($1::int, $2::text, $3::text, 1, NOW(), NOW())
     ON CONFLICT ("userId", "feature", "dateKey")
     DO UPDATE SET "used" = "UserQuota"."used" + 1, "updatedAt" = NOW()
     WHERE "UserQuota"."used" < $4::int
     RETURNING "used"`,
    userId,
    feature,
    dateKey,
    limit
  );

  // No returned row ⇒ the guarded update was skipped (limit reached).
  if (!rows || rows.length === 0) {
    const current = await checkQuota(userId, feature);
    return { ...current, allowed: false, remaining: 0, charged: false };
  }

  const used = rows[0].used;
  return { ...toResult(used, limit, resetsAt), charged: true };
}

/**
 * Refund a reservation (failed/timed-out/aborted generation). Guarded so a
 * double-release can never push `used` below zero.
 *
 * ENTITLEMENT: symmetric with reserveQuota — an unlimited account never
 * consumed a unit, so there is nothing to refund and the real (observability)
 * counter must not be decremented by an unconditional error-path call.
 */
export async function releaseQuota(userId: number, feature: QuotaFeature): Promise<void> {
  if (isUnlimitedAiUser(userId)) return;

  const { dateKey } = await getQuotaContext(userId, feature);
  try {
    await prisma.$queryRawUnsafe(
      `UPDATE "UserQuota" SET "used" = "UserQuota"."used" - 1, "updatedAt" = NOW()
       WHERE "userId" = $1::int AND "feature" = $2::text AND "dateKey" = $3::text
         AND "used" > 0`,
      userId,
      feature,
      dateKey
    );
  } catch {
    console.warn("[quota] release unavailable");
  }
}

/**
 * Get full usage report for all features.
 * Used by the /api/ai-usage endpoint.
 */
export async function getUsageReport(userId: number): Promise<Record<QuotaFeature, QuotaCheckResult>> {
  const [chat, planner, plannerExpansion, plannerRebalance, compile, scope] =
    await Promise.all([
      checkQuota(userId, "chat"),
      checkQuota(userId, "planner"),
      checkQuota(userId, "plannerExpansion"),
      checkQuota(userId, "plannerRebalance"),
      checkQuota(userId, "compile"),
      checkQuota(userId, "scope"),
    ]);

  return { chat, planner, plannerExpansion, plannerRebalance, compile, scope };
}

// Durable receipts and their counter changes share the same policy/SQL owner
// with worker attempts. Legacy foreground reserveQuota/releaseQuota stay intact.
export { quotaReceiptBucket } from "./quota-accounting";
export type { QuotaReservationReceipt } from "./quota-accounting";
function quotaSql(tx: Prisma.TransactionClient) {
  return { query: async (text: string, values: unknown[] = []) => ({ rows: await tx.$queryRawUnsafe<Record<string, unknown>[]>(text, ...values) }) };
}
async function reserveQuotaReceipt(tx: Prisma.TransactionClient, userId: number, feature: QuotaFeature, now: Date) {
  return reserveOwnedQuota(quotaSql(tx), userId, feature, now);
}
async function settleQuotaReceipt(tx: Prisma.TransactionClient, receipt: QuotaReservationReceipt, outcome: "SETTLED" | "RELEASED", now: Date) {
  return settleOwnedQuota(quotaSql(tx), receipt, outcome, now);
}

async function lockedQuotaOperation(tx: Prisma.TransactionClient, userId: number, revisionId: string) {
  await tx.$queryRaw`SELECT r.id FROM "PlannerRevision" r JOIN "PlannerPlan" p ON p.id = r."planId"
    WHERE r.id = ${revisionId}::uuid AND p."userId" = ${userId} FOR UPDATE OF r`;
  const operation = await tx.plannerRevision.findFirst({ where: { id: revisionId, plan: { userId } } });
  if (!operation) throw new Error("QUOTA_OPERATION_NOT_FOUND");
  return operation;
}
/** Receipt storage and quota counter are inseparable. Always re-read the locked
 * operation, so even a caller retrying with a stale in-memory receipt cannot refund twice.
 * Call from the same transaction that creates/seals/fails the operation envelope.
 */
export async function reserveRevisionQuota(tx: Prisma.TransactionClient, userId: number, revisionId: string, feature: QuotaFeature, now = new Date()) {
  const operation = await lockedQuotaOperation(tx, userId, revisionId);
  if (operation.quotaReceipt) {
    const prior = operation.quotaReceipt as unknown as QuotaReservationReceipt;
    if (prior.feature !== feature) throw new Error("QUOTA_RECEIPT_MISMATCH");
    return prior;
  }
  if (operation.operationState !== "PREPARING" || !operation.leaseExpiresAt || operation.leaseExpiresAt <= now) throw new Error("QUOTA_OPERATION_EXPIRED");
  const receipt = await reserveQuotaReceipt(tx, userId, feature, now);
  if (receipt) await tx.plannerRevision.update({ where: { id: revisionId }, data: { quotaReceipt: JSON.parse(JSON.stringify(receipt)) } });
  return receipt;
}
export async function settleRevisionQuota(tx: Prisma.TransactionClient, userId: number, revisionId: string, outcome: "SETTLED" | "RELEASED", now = new Date()) {
  const operation = await lockedQuotaOperation(tx, userId, revisionId);
  if (!operation.quotaReceipt) throw new Error("QUOTA_RECEIPT_MISSING");
  const receipt = await settleQuotaReceipt(tx, operation.quotaReceipt as unknown as QuotaReservationReceipt, outcome, now);
  await tx.plannerRevision.update({ where: { id: revisionId }, data: { quotaReceipt: JSON.parse(JSON.stringify(receipt)) } });
  return receipt;
}
