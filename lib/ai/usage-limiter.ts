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
 */

import { prisma } from "@/lib/prisma";
import { AI_QUOTAS, type QuotaFeature } from "./config";
import { TimezoneService } from "../timezone-service";
import { getUserTimezone } from "../timezone-server";

export type { QuotaFeature } from "./config";

export interface QuotaCheckResult {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string; // ISO string of the next reset time
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
  };
}

/**
 * Non-charging read of the user's current usage for a feature.
 */
export async function checkQuota(userId: number, feature: QuotaFeature): Promise<QuotaCheckResult> {
  const config = AI_QUOTAS[feature];
  const { dateKey, resetsAt } = await getQuotaContext(userId, feature);

  const row = await prisma.userQuota.findUnique({
    where: { userId_feature_dateKey: { userId, feature, dateKey } },
    select: { used: true },
  });

  return toResult(row?.used ?? 0, config.limit, resetsAt);
}

/**
 * Atomically RESERVE one unit of quota for a feature. This is the charging
 * operation and it runs BEFORE any expensive generation: concurrent requests
 * serialize on the unique (userId, feature, dateKey) row and the guarded
 * upsert only increments while `used` is still below the limit, so N parallel
 * requests can never collectively exceed the cap — they either reserve or get
 * 429 before spending a token. Callers MUST call releaseQuota on failure,
 * timeout, or client abort to refund the reservation.
 */
export async function reserveQuota(userId: number, feature: QuotaFeature): Promise<QuotaConsumeResult> {
  const config = AI_QUOTAS[feature];
  const { dateKey, resetsAt } = await getQuotaContext(userId, feature);

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
    config.limit
  );

  // No returned row ⇒ the guarded update was skipped (limit reached).
  if (!rows || rows.length === 0) {
    const current = await checkQuota(userId, feature);
    return { ...current, allowed: false, remaining: 0, charged: false };
  }

  const used = rows[0].used;
  return { ...toResult(used, config.limit, resetsAt), charged: true };
}

/**
 * Refund a reservation (failed/timed-out/aborted generation). Guarded so a
 * double-release can never push `used` below zero.
 */
export async function releaseQuota(userId: number, feature: QuotaFeature): Promise<void> {
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
  } catch (err) {
    console.warn(`[quota] releaseQuota failed for user ${userId} (${feature}):`, err);
  }
}

/**
 * Get full usage report for all features.
 * Used by the /api/ai-usage endpoint.
 */
export async function getUsageReport(userId: number): Promise<Record<QuotaFeature, QuotaCheckResult>> {
  const [chat, planner, compile, scope] = await Promise.all([
    checkQuota(userId, "chat"),
    checkQuota(userId, "planner"),
    checkQuota(userId, "compile"),
    checkQuota(userId, "scope"),
  ]);

  return { chat, planner, compile, scope };
}
