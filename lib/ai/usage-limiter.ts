/**
 * AI Usage Limiter — Database-backed Quota Engine
 * 
 * Provides server-side enforcement of daily usage quotas for AI features.
 * Uses Prisma queries against SystemMessage records to count usage per day,
 * ensuring quota state persists across serverless cold starts and page reloads.
 * 
 * Usage markers are stored as SYSTEM-type messages with a distinctive content
 * prefix to avoid requiring schema migrations for new enum values.
 */

import { prisma } from "@/lib/prisma";
import { AI_QUOTAS } from "./config";
import { TimezoneService } from "../timezone-service";
import { getUserTimezone } from "../timezone-server";

export type QuotaFeature = "chat" | "planner";

export interface QuotaCheckResult {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string; // ISO string of the next reset time
}

// Content prefixes used to identify AI usage records
const USAGE_PREFIX_MAP: Record<QuotaFeature, string> = {
  chat: "[QUOTA:AI_CHAT]",
  planner: "[QUOTA:AI_PLANNER]",
};

/**
 * Get the start and end of the current day in the user's timezone,
 * returned as UTC Date objects for Prisma queries.
 */
async function getDayBoundsUTC(userId: number): Promise<{ dayStart: Date; dayEnd: Date; resetsAt: string }> {
  const tz = await getUserTimezone(userId);
  const dayStart = TimezoneService.getStartOfDayUTC(tz);
  const dayEnd = TimezoneService.getEndOfDayUTC(tz);
  const resetsAt = TimezoneService.getNextMidnightUTC(tz).toISOString();
  
  return { dayStart, dayEnd, resetsAt };
}

/**
 * Check if the user has remaining quota for a given feature.
 * Queries the database for usage records created today.
 */
export async function checkQuota(userId: number, feature: QuotaFeature): Promise<QuotaCheckResult> {
  const config = AI_QUOTAS[feature];
  const { dayStart, dayEnd, resetsAt } = await getDayBoundsUTC(userId);
  
  const used = await prisma.systemMessage.count({
    where: {
      userId,
      type: "SYSTEM",
      content: { startsWith: USAGE_PREFIX_MAP[feature] },
      createdAt: {
        gte: dayStart,
        lte: dayEnd,
      },
    },
  });
  
  const remaining = Math.max(0, config.limit - used);
  
  return {
    allowed: remaining > 0,
    used,
    limit: config.limit,
    remaining,
    resetsAt,
  };
}

/**
 * Record that the user consumed one unit of quota for a given feature.
 * Creates a lightweight SystemMessage record as a durable usage marker.
 */
export async function recordUsage(userId: number, feature: QuotaFeature): Promise<void> {
  await prisma.systemMessage.create({
    data: {
      userId,
      type: "SYSTEM",
      content: `${USAGE_PREFIX_MAP[feature]} usage recorded`,
      read: true, // Mark as read so it doesn't pollute unread counts
    },
  });
}

/**
 * Get full usage report for all features.
 * Used by the /api/ai-usage endpoint.
 */
export async function getUsageReport(userId: number): Promise<Record<QuotaFeature, QuotaCheckResult>> {
  const [chat, planner] = await Promise.all([
    checkQuota(userId, "chat"),
    checkQuota(userId, "planner"),
  ]);
  
  return { chat, planner };
}
