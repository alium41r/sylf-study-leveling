/**
 * Server-only Timezone Service helper for database operations.
 */

import { prisma } from "@/lib/prisma";
import { TimezoneService } from "./timezone-service";

/**
 * Fetches the user's validated IANA timezone from the database.
 * If the timezone is missing or invalid, falls back safely to 'UTC'.
 */
export async function getUserTimezone(userId: number): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });

  const tz = user?.timezone || "UTC";
  return TimezoneService.validateTimezone(tz) ? tz : "UTC";
}

export const TimezoneServerService = {
  getUserTimezone,
};
