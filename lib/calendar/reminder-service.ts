import "server-only";
import { prisma } from "@/lib/prisma";
import { readPersonalEvents } from "./personal-service";
import { TimezoneService } from "@/lib/timezone-service";
import { addDays, eventTime } from "./dates";
import { sanitizeNotificationPreferences } from "@/lib/notification-preferences";
import type { CalendarEvent } from "./contracts";

export function dueReminders(events: CalendarEvent[], now: number) {
  return events.flatMap((event) => {
    const start = event.allDay
      ? TimezoneService.getStartOfLocalDateUTC(
          event.timezone,
          event.startDate
        ).getTime()
      : Date.parse(event.startsAt!);
    const due = (event.reminders || [])
      .map((minutes) => ({ minutes, at: start - minutes * 60000 }))
      .filter((item) => item.at <= now && item.at > now - 5 * 60000)
      .sort((a, b) => b.at - a.at);
    // Waking a suspended browser produces one alert per occurrence, even when
    // more than one configured offset falls inside the catch-up window.
    return due.length ? [{ event, start, due }] : [];
  });
}
export async function deliverCalendarReminders(
  userId: number,
  now = new Date()
) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true, notificationPreferences: true },
  });
  const preferences = sanitizeNotificationPreferences(
    user.notificationPreferences
  );
  if (!preferences.masterEnabled || !preferences.scheduledFocusReminders)
    return { reminders: [] };
  const zone = TimezoneService.validateTimezone(user.timezone)
    ? user.timezone
    : "UTC";
  const today = TimezoneService.getUserLocalDate(zone, now);
  const events = await readPersonalEvents(
    userId,
    addDays(today, -2),
    addDays(today, 30),
    zone,
    true
  );
  const pending = dueReminders(events, now.getTime());
  if (!pending.length) return { reminders: [] };
  const keyFor = (event: CalendarEvent, start: number, minutes: number) =>
    `${event.occurrenceDate || event.startDate}:${start}:${minutes}`;
  const receipts = await prisma.calendarReminderReceipt.findMany({
    where: {
      OR: pending.map(({ event, start, due }) => ({
        eventId: event.id,
        key: keyFor(event, start, due[0].minutes),
      })),
    },
    select: { eventId: true, key: true },
  });
  const claimedKeys = new Set(
    receipts.map((receipt) => `${receipt.eventId}|${receipt.key}`)
  );
  const delivered = [];
  // Previously claimed entries must not occupy every batch slot and starve
  // later reminders during the catch-up window. The transaction still arbitrates races.
  for (const { event, start, due } of pending
    .filter(
      (item) =>
        !claimedKeys.has(
          `${item.event.id}|${keyFor(item.event, item.start, item.due[0].minutes)}`
        )
    )
    .slice(0, 20)) {
    const result = await prisma.$transaction(async (tx) => {
      // Coordinate the claim with edits/deletion and other tabs/devices.
      const rows = await tx.$queryRaw<
        Array<{ revision: number }>
      >`SELECT "revision" FROM "CalendarEvent" WHERE "id" = ${event.id} AND "userId" = ${userId} FOR UPDATE`;
      if (rows[0]?.revision !== event.revision) return null;
      let claimed = false;
      for (const item of due) {
        const claim = await tx.calendarReminderReceipt.createMany({
          data: [
            {
              eventId: event.id,
              key: keyFor(event, start, item.minutes),
            },
          ],
          skipDuplicates: true,
        });
        if (item === due[0]) claimed = !!claim.count;
      }
      if (!claimed) return null;
      const content = `Calendar reminder · ${event.title} · ${event.startDate} · ${eventTime(event, zone)}`;
      await tx.systemMessage.create({
        data: { userId, type: "INFO", content },
      });
      return {
        id: `${event.id}:${event.occurrenceDate || event.startDate}:${start}:${due[0].minutes}`,
        title: event.title,
        date: event.startDate,
        time: eventTime(event, zone),
        minutes: due[0].minutes,
      };
    });
    if (result) delivered.push(result);
  }
  return { reminders: delivered };
}
