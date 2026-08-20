import { prisma } from "@/lib/prisma";
import {
  NotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  sanitizeNotificationPreferences,
} from "./notification-preferences";

/**
 * Robust database getter for user notification preferences.
 * Uses raw SQL to bypass any in-memory Prisma client model cache mismatches.
 */
export async function getDbNotificationPreferences(userId: number): Promise<NotificationPreferences> {
  try {
    const rows = await prisma.$queryRaw<Array<{ notificationPreferences: any }>>`
      SELECT "notificationPreferences" FROM "User" WHERE id = ${userId} LIMIT 1
    `;
    if (rows && rows.length > 0 && rows[0].notificationPreferences !== undefined && rows[0].notificationPreferences !== null) {
      return sanitizeNotificationPreferences(rows[0].notificationPreferences);
    }
  } catch (error) {
    console.error("getDbNotificationPreferences error, falling back to defaults:", error);
  }
  return { ...DEFAULT_NOTIFICATION_PREFERENCES };
}

/**
 * Robust database setter for user notification preferences.
 * Persists directly via SQL to guarantee zero validation schema errors.
 */
export async function setDbNotificationPreferences(
  userId: number,
  preferences: NotificationPreferences
): Promise<NotificationPreferences> {
  const sanitized = sanitizeNotificationPreferences(preferences);
  const jsonString = JSON.stringify(sanitized);

  await prisma.$executeRaw`
    UPDATE "User"
    SET "notificationPreferences" = ${jsonString}::jsonb
    WHERE id = ${userId}
  `;

  return sanitized;
}
