/**
 * Server-only Timezone Service helper for database operations.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { TimezoneService } from "./timezone-service";

const TIMEZONE_CACHE_TTL_MS = 30_000;
const timezoneCache = new Map<number, { tz: string; expiresAt: number }>();

export function primeUserTimezoneCache(userId: number, rawTimezone: string | null | undefined): void {
  if (!Number.isFinite(userId) || userId <= 0) return;
  const tz = rawTimezone && TimezoneService.validateTimezone(rawTimezone) ? rawTimezone : "UTC";
  timezoneCache.set(userId, { tz, expiresAt: Date.now() + TIMEZONE_CACHE_TTL_MS });
}

export function invalidateUserTimezoneCache(userId?: number): void {
  if (typeof userId === "number") {
    timezoneCache.delete(userId);
  } else {
    timezoneCache.clear();
  }
}

/**
 * Fetches the user's validated IANA timezone from the database.
 * If the timezone is missing or invalid, falls back safely to 'UTC'.
 */
export async function getUserTimezone(userId: number, client: Prisma.TransactionClient = prisma): Promise<string> {
  if (client === prisma) {
    const cached = timezoneCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.tz;
    }
  }

  const user = await client.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });

  const tz = user?.timezone || "UTC";
  const validated = TimezoneService.validateTimezone(tz) ? tz : "UTC";
  if (client === prisma && !process.env.VITEST) {
    timezoneCache.set(userId, { tz: validated, expiresAt: Date.now() + TIMEZONE_CACHE_TTL_MS });
  }
  return validated;
}

export const TimezoneServerService = {
  getUserTimezone,
  primeUserTimezoneCache,
  invalidateUserTimezoneCache,
};
