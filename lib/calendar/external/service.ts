import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserTimezone } from "@/lib/timezone-server";
import { CalendarError } from "../personal-service";
import { eventInputSchema, type CalendarEvent } from "../contracts";
import { addDays, eventsOnDate } from "../dates";
import { connectionToken } from "./connections";
import {
  readProviderPage,
  normalizeProviderEvent,
  type ProviderEvent,
} from "./providers";
import {
  unseal,
  seal,
  stableExternalId,
  type CalendarProvider,
} from "./security";
import { ProviderError } from "./http";
import { fetchFeed, expandSubscription } from "./subscriptions";
export function rangeMonths(start: string, end: string) {
  const result: string[] = [];
  for (let date = start; date < end; date = addDays(date, 1))
    if (!result.includes(date.slice(0, 7))) result.push(date.slice(0, 7));
  return result;
}
export function monthBounds(month: string) {
  const start = month + "-01",
    d = new Date(start + "T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + 1);
  return { start, end: d.toISOString().slice(0, 10) };
}
export async function ensureWindows(
  calendarIds: string[],
  start: string,
  end: string,
  request = true
) {
  const months = rangeMonths(start, end);
  for (const calendarId of calendarIds) {
    await prisma.calendarSyncWindow.createMany({
      data: months.map((month) => ({ id: randomUUID(), calendarId, month })),
      skipDuplicates: true,
    });
    if (request)
      await prisma.calendarSyncWindow.updateMany({
        where: {
          calendarId,
          month: { in: months },
          requestedAt: { lt: new Date(Date.now() - 3600000) },
        },
        data: { requestedAt: new Date() },
      });
    await pruneCalendarCache(calendarId, months);
  }
}
export async function pruneCalendarCache(
  calendarId: string,
  protect: string[] = []
) {
  const windows = await prisma.calendarSyncWindow.findMany({
    where: { calendarId },
    orderBy: { requestedAt: "desc" },
    select: { id: true, month: true },
  });
  if (windows.length <= 12) return;
  const current = new Date().toISOString().slice(0, 7),
    future = new Date(current + "-01T12:00Z");
  future.setUTCMonth(future.getUTCMonth() + 4);
  const end = future.toISOString().slice(0, 7);
  const keep = windows
    .filter(
      (w) => protect.includes(w.month) || (w.month >= current && w.month < end)
    )
    .map((w) => w.id);
  for (const window of windows)
    if (keep.length < 12 && !keep.includes(window.id)) keep.push(window.id);
  await prisma.calendarSyncWindow.deleteMany({
    where: { calendarId, id: { notIn: keep } },
  });
  await prisma.externalCalendarEvent.deleteMany({
    where: { calendarId, members: { none: {} } },
  });
}

export function externalEventDTO(
  row: { id: string; revision: number; data: unknown; updatedAt: Date },
  calendar: {
    id: string;
    name: string;
    writable: boolean;
    visible?: boolean;
    planning?: boolean;
    connection: { provider: string };
  }
): CalendarEvent {
  const raw = row.data as unknown as ProviderEvent;
  const data = eventInputSchema.parse(raw.data);
  return {
    ...data,
    id: row.id,
    revision: row.revision,
    createdAt: row.updatedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    external: {
      calendarId: calendar.id,
      calendarName: calendar.name,
      provider: calendar.connection.provider as CalendarProvider,
      writable: calendar.writable,
      seriesId: raw.seriesId,
      recurring: raw.recurring || false,
      originalStart: raw.originalStart,
      busy: raw.busy !== false,
      meeting: raw.meeting || false,
      etag: raw.etag,
      visible: calendar.visible,
      planning: calendar.planning,
    },
  };
}
export async function readExternalProjection(
  userId: number,
  start: string,
  end: string,
  timezone: string,
  planning = false,
  strict = false,
  selectedCalendarId?: string
) {
  const calendars = await prisma.connectedCalendar.findMany({
    where: {
      connection: { userId },
      ...(selectedCalendarId
        ? { id: selectedCalendarId }
        : { OR: [{ visible: true }, { planning: true }] }),
    },
    include: {
      connection: { select: { provider: true, status: true } },
      windows: { where: { month: { in: rangeMonths(start, end) } } },
    },
  });
  if (!calendars.length && selectedCalendarId)
    throw new CalendarError("Connected calendar not found.", 404);
  if (!calendars.length)
    return {
      events: [] as CalendarEvent[],
      warnings: [] as string[],
      complete: true,
      connected: 0,
    };
  await ensureWindows(
    calendars
      .filter((c) =>
        rangeMonths(start, end).some(
          (month) =>
            !c.windows.some(
              (w) =>
                w.month === month &&
                w.requestedAt.getTime() > Date.now() - 3600000
            )
        )
      )
      .map((c) => c.id),
    start,
    end
  );
  const warnings: string[] = [];
  for (const c of calendars) {
    const complete =
      (planning && c.planning === false && !selectedCalendarId) ||
      (c.connection.status === "ACTIVE" &&
        rangeMonths(start, end).every((month) =>
          c.windows.some(
            (w) =>
              w.month === month &&
              w.lastSuccessAt &&
              w.lastSuccessAt.getTime() > Date.now() - 30 * 60000
          )
        ));
    if (!complete)
      warnings.push(
        `${c.name}: calendar coverage is incomplete or over 30 minutes old. Sync or reconnect in Calendar settings before relying on free-time estimates.`
      );
  }
  if (strict && warnings.length) throw new CalendarError(warnings[0], 409);
  const rows = await prisma.externalCalendarEvent.findMany({
    where: {
      calendarId: { in: calendars.map((c) => c.id) },
      members: { some: { window: { month: { in: rangeMonths(start, end) } } } },
    },
    take: 5001,
  });
  if (rows.length > 5000)
    throw new CalendarError(
      "Too many external events. Choose a smaller period.",
      422
    );
  const events = rows.map((row) =>
    externalEventDTO(row, calendars.find((c) => c.id === row.calendarId)!)
  );
  const included = new Map<string, CalendarEvent>();
  for (let date = start; date < end; date = addDays(date, 1))
    for (const e of eventsOnDate(events, date, timezone)) included.set(e.id, e);
  return {
    events: [...included.values()],
    warnings,
    complete: !warnings.length,
    connected: calendars.length,
  };
}
export async function readExternalOwnedEvent(userId: number, id: string) {
  const row = await prisma.externalCalendarEvent.findFirst({
    where: { id, calendar: { connection: { userId } } },
    include: {
      calendar: {
        include: { connection: { select: { provider: true, status: true } } },
      },
    },
  });
  if (!row) return null;
  return { row, event: externalEventDTO(row, row.calendar) };
}
export async function claimCalendar(calendarId: string) {
  const leaseId = randomUUID();
  const claimed = await prisma.connectedCalendar.updateMany({
    where: {
      id: calendarId,
      connection: { status: "ACTIVE" },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
    },
    data: { leaseId, leaseUntil: new Date(Date.now() + 90000) },
  });
  return claimed.count ? leaseId : null;
}
export async function releaseCalendar(calendarId: string, leaseId: string) {
  await prisma.connectedCalendar.updateMany({
    where: { id: calendarId, leaseId },
    data: { leaseId: null, leaseUntil: null },
  });
}
export async function publishProviderEvent(
  tx: Prisma.TransactionClient,
  calendarId: string,
  event: ProviderEvent
) {
  const id = stableExternalId(calendarId, event.remoteId);
  if (event.deleted) return id;
  const data = eventInputSchema.parse(event.data);
  const previous = await tx.externalCalendarEvent.findUnique({
    where: { id },
    select: { etag: true },
  });
  const input = {
    etag: event.etag,
    data: JSON.parse(
      JSON.stringify({ ...event, data })
    ) as Prisma.InputJsonValue,
    startDate: data.startDate,
    endDate: data.endDate,
    startsAt: data.startsAt ? new Date(data.startsAt) : null,
    endsAt: data.endsAt ? new Date(data.endsAt) : null,
  };
  await tx.externalCalendarEvent.upsert({
    where: { id },
    create: { id, calendarId, remoteId: event.remoteId, ...input },
    update:
      previous?.etag === event.etag
        ? {}
        : { ...input, revision: { increment: 1 } },
  });
  return id;
}
export async function syncCalendarWindow(windowId: string) {
  const window = await prisma.calendarSyncWindow.findUnique({
    where: { id: windowId },
    include: { calendar: { include: { connection: true } } },
  });
  if (!window) return { processed: false };
  const calendar = window.calendar,
    connection = calendar.connection,
    leaseId = await claimCalendar(calendar.id);
  if (!leaseId) return { processed: false };
  try {
    const timezone = await getUserTimezone(connection.userId),
      bounds = monthBounds(window.month),
      start = addDays(bounds.start, -2),
      end = addDays(bounds.end, 2),
      provider = connection.provider as CalendarProvider;
    let events: ProviderEvent[],
      nextPage: string | null = null,
      cursor: string | null = null;
    const scanId = window.scanId || randomUUID();
    if (provider === "ics") {
      const credentials = unseal<{ url: string }>(
        connection.credentials,
        `connection:${connection.id}`
      );
      const saved = window.cursor
        ? unseal<string>(window.cursor, `cursor:${window.id}`)
        : undefined;
      const feed = await fetchFeed(credentials.url, saved);
      if (feed.unchanged && window.lastSuccessAt) {
        await prisma.$transaction(async (tx) => {
          if (
            !(await tx.connectedCalendar.findFirst({
              where: { id: calendar.id, leaseId },
            }))
          )
            throw new CalendarError("Sync lease changed.", 409);
          await tx.calendarSyncWindow.update({
            where: { id: window.id },
            data: {
              lastSuccessAt: new Date(),
              nextRunAt: new Date(Date.now() + 30 * 60000),
              attempts: 0,
            },
          });
        });
        return { processed: true };
      }
      events = expandSubscription(feed.text, start, end, timezone);
      cursor = feed.etag;
    } else {
      const page = await readProviderPage(
        provider,
        calendar.remoteId,
        await connectionToken(connection),
        start,
        end,
        window.cursor
          ? unseal<string>(window.cursor, `cursor:${window.id}`)
          : null,
        window.nextPage
          ? unseal<string>(window.nextPage, `page:${window.id}`)
          : null,
        calendar.incremental
      );
      events = page.events.map((raw) =>
        normalizeProviderEvent(provider, raw, timezone)
      );
      nextPage = page.nextPage;
      cursor = page.cursor;
    }
    await prisma.$transaction(async (tx) => {
      const locked = await tx.connectedCalendar.updateMany({
        where: { id: calendar.id, leaseId },
        data: { leaseUntil: new Date(Date.now() + 90000), error: null },
      });
      if (!locked.count) throw new CalendarError("Sync lease changed.", 409);
      for (const event of events) {
        const id = stableExternalId(calendar.id, event.remoteId);
        if (event.deleted) {
          await tx.calendarSyncMember.deleteMany({
            where: {
              windowId: window.id,
              event: {
                calendarId: calendar.id,
                OR: [
                  { id },
                  { data: { path: ["seriesId"], equals: event.remoteId } },
                ],
              },
            },
          });
          continue;
        }
        // Incremental providers may report changes outside this fixed cache window.
        const d = event.data!;
        if (d.endDate < start || d.startDate >= end) {
          await tx.calendarSyncMember.deleteMany({
            where: { windowId: window.id, eventId: id },
          });
          continue;
        }
        await publishProviderEvent(tx, calendar.id, event);
        await tx.calendarSyncMember.upsert({
          where: { windowId_eventId: { windowId: window.id, eventId: id } },
          create: { windowId: window.id, eventId: id, scanId },
          update: { scanId },
        });
      }
      if (
        (await tx.calendarSyncMember.count({
          where: { windowId: window.id },
        })) > 2000
      )
        throw new CalendarError(
          "This calendar exceeds 2,000 occurrences per month. Reduce its calendar contents before syncing.",
          422
        );
      if (
        !nextPage &&
        (!window.cursor || provider === "ics" || !calendar.incremental)
      )
        await tx.calendarSyncMember.deleteMany({
          where: { windowId: window.id, scanId: { not: scanId } },
        });
      await tx.calendarSyncWindow.update({
        where: { id: window.id },
        data: {
          scanId: nextPage ? scanId : null,
          nextPage: nextPage ? seal(nextPage, `page:${window.id}`) : null,
          ...(!nextPage
            ? {
                cursor: cursor
                  ? seal(cursor, `cursor:${window.id}`)
                  : provider === "ics"
                    ? null
                    : calendar.incremental
                      ? window.cursor
                      : null,
                lastSuccessAt: new Date(),
              }
            : {}),
          nextRunAt: new Date(
            Date.now() +
              (nextPage ? 1000 : provider === "ics" ? 30 * 60000 : 5 * 60000)
          ),
          attempts: 0,
        },
      });
      // Sparse cache retention: no orphan projection rows after cancellation/reset.
      await tx.externalCalendarEvent.deleteMany({
        where: { calendarId: calendar.id, members: { none: {} } },
      });
    });
    return { processed: true };
  } catch (error) {
    const reset =
      error instanceof ProviderError &&
      (error.providerStatus === 410 || error.providerStatus === 404);
    const seconds = error instanceof ProviderError ? error.retrySeconds : 60;
    await prisma.$transaction(async (tx) => {
      if (
        !(await tx.connectedCalendar.findFirst({
          where: { id: calendar.id, leaseId },
        }))
      )
        return;
      const message =
        error instanceof CalendarError
          ? error.message
          : "Calendar sync failed. It will retry; check the subscription or reconnect if this continues.";
      await tx.connectedCalendar.update({
        where: { id: calendar.id },
        data: { error: message },
      });
      await tx.calendarSyncWindow.update({
        where: { id: window.id },
        data: {
          ...(reset
            ? {
                cursor: null,
                nextPage: null,
                scanId: null,
                lastSuccessAt: null,
              }
            : {}),
          attempts: { increment: 1 },
          nextRunAt: new Date(
            Date.now() +
              Math.max(
                seconds,
                Math.min(3600, 30 * 2 ** Math.min(window.attempts, 7))
              ) *
                1000
          ),
        },
      });
      if (error instanceof ProviderError && error.providerStatus === 401)
        await tx.calendarConnection.update({
          where: { id: connection.id },
          data: { status: "RECONNECT" },
        });
    });
    return { processed: false };
  } finally {
    await releaseCalendar(calendar.id, leaseId);
  }
}
