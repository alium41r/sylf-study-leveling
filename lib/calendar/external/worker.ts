import "server-only";
import { prisma } from "@/lib/prisma";
import { TimezoneService } from "@/lib/timezone-service";
import { addDays } from "../dates";
import {
  ensureWindows,
  syncCalendarWindow,
  pruneCalendarCache,
} from "./service";
import { processExternalMutation } from "./mutations";
import { renewCalendarWatch } from "./notifications";
/** Durable DB cursors/leases survive every request; this runner owns no timers or
 * study scheduling. A secured cron or provider notification can invoke it. */
export async function runCalendarSyncBatch(userId?: number, budgetMs = 30000) {
  await prisma.calendarOAuthState.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  const started = Date.now();
  let processed = 0;
  const owner = userId ? { userId } : {};
  const operations = await prisma.externalCalendarMutation.findMany({
    where: {
      state: { in: ["PENDING", "RUNNING"] },
      nextRunAt: { lte: new Date() },
      calendar: { connection: { ...owner, status: "ACTIVE" } },
    },
    orderBy: { nextRunAt: "asc" },
    take: 5,
    select: { id: true },
  });
  for (const operation of operations) {
    if (Date.now() - started > budgetMs) return { processed };
    await processExternalMutation(operation.id);
    processed++;
  }
  const calendars = await prisma.connectedCalendar.findMany({
    where: {
      connection: { ...owner, status: "ACTIVE" },
      nextMaintenanceAt: { lte: new Date() },
    },
    include: {
      connection: { select: { userId: true } },
      windows: { orderBy: { requestedAt: "desc" }, take: 10 },
    },
    orderBy: { nextMaintenanceAt: "asc" },
    take: userId ? 50 : 20,
  });
  for (const calendar of calendars) {
    if (Date.now() - started > budgetMs) break;
    const today = TimezoneService.getUserLocalDate("UTC");
    // Four current planning months, plus explicitly browsed windows. Retain
    // historical cache only while recently requested; never import whole history.
    await ensureWindows([calendar.id], today, addDays(today, 93), false);
    await prisma.connectedCalendar.updateMany({
      where: { id: calendar.id },
      data: { nextMaintenanceAt: new Date(Date.now() + 6 * 3600000) },
    });
    try {
      await renewCalendarWatch(calendar.id);
    } catch {
      /* Polling remains available when notification setup is unavailable. */
    }
  }
  const windows = await prisma.calendarSyncWindow.findMany({
    where: {
      nextRunAt: { lte: new Date() },
      calendar: {
        connection: { ...owner, status: "ACTIVE" },
      },
    },
    orderBy: { nextRunAt: "asc" },
    take: 100,
    select: { id: true },
  });
  for (const window of windows) {
    if (Date.now() - started > budgetMs) break;
    await syncCalendarWindow(window.id);
    processed++;
  }
  for (const calendar of calendars) await pruneCalendarCache(calendar.id);
  // Minimal successful receipts remain until disconnect so old retries cannot recreate events.
  return { processed };
}
