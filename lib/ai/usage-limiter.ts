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
 * is vulnerable to. Quota is only charged AFTER a successful generation
 * — callers invoke `checkQuota` up-front (non-charging) and
 * `consumeQuota` only once the generation completed successfully.
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

async function getQuotaContext(userId: number): Promise<{ dateKey: string; resetsAt: string }> {
  const tz = await getUserTimezone(userId);
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
  const { dateKey, resetsAt } = await getQuotaContext(userId);

  const row = await prisma.userQuota.findUnique({
    where: { userId_feature_dateKey: { userId, feature, dateKey } },
    select: { used: true },
  });

  return toResult(row?.used ?? 0, config.limit, resetsAt);
}

/**
 * Atomically consume one unit of quota for a feature.
 *
 * The guarded upsert increments `used` only while it is still below the
 * limit; concurrent requests serialize on the unique row and cannot
 * collectively exceed the daily cap. Call this ONLY after a generation
 * succeeded — never on model errors, timeouts, or client aborts.
 */
export async function consumeQuota(userId: number, feature: QuotaFeature): Promise<QuotaConsumeResult> {
  const config = AI_QUOTAS[feature];
  const { dateKey, resetsAt } = await getQuotaContext(userId);

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
 * Get full usage report for all features.
 * Used by the /api/ai-usage endpoint.
 */
export async function getUsageReport(userId: number): Promise<Record<QuotaFeature, QuotaCheckResult>> {
  const [chat, planner, compile] = await Promise.all([
    checkQuota(userId, "chat"),
    checkQuota(userId, "planner"),
    checkQuota(userId, "compile"),
  ]);

  return { chat, planner, compile };
}
