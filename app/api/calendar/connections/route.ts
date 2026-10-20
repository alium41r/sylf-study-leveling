import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import { CalendarError } from "@/lib/calendar/personal-service";
import {
  integrationConfigured,
  seal,
  digest,
  publicOrigin,
} from "@/lib/calendar/external/security";
import {
  beginCalendarOAuth,
  disconnectCalendar,
  refreshCalendarList,
} from "@/lib/calendar/external/connections";
import { feedURL, fetchFeed } from "@/lib/calendar/external/subscriptions";
import { runCalendarSyncBatch } from "@/lib/calendar/external/worker";
import { processExternalMutation } from "@/lib/calendar/external/mutations";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
const command = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("connect"),
      provider: z.enum(["google", "microsoft"]),
    })
    .strict(),
  z
    .object({
      action: z.literal("subscribe"),
      url: z.string().max(3000),
      name: z.string().trim().min(1).max(180),
    })
    .strict(),
  z.object({ action: z.literal("disconnect"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("sync") }).strict(),
  z.object({ action: z.literal("refresh"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("retry"), id: z.uuid() }).strict(),
  z
    .object({
      action: z.literal("calendar"),
      id: z.uuid(),
      visible: z.boolean().optional(),
      planning: z.boolean().optional(),
    })
    .strict(),
]);
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return json({ error: "Unauthorized" }, 401);
  try {
    const connections = await prisma.calendarConnection.findMany({
      where: { userId: session.userId },
      select: {
        id: true,
        provider: true,
        label: true,
        status: true,
        calendars: {
          select: {
            id: true,
            name: true,
            writable: true,
            visible: true,
            planning: true,
            error: true,
            watchExpiresAt: true,
            windows: { select: { lastSuccessAt: true, nextPage: true } },
          },
        },
      },
    });
    const operations = await prisma.externalCalendarMutation.findMany({
      where: {
        calendar: { connection: { userId: session.userId } },
        state: { not: "SUCCEEDED" },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        state: true,
        error: true,
        createdAt: true,
        payload: true,
      },
    });
    let webConnectionURL: string | undefined;
    try {
      webConnectionURL = publicOrigin();
    } catch {}
    return json({
      webConnectionURL,
      configured: {
        google: integrationConfigured("google"),
        microsoft: integrationConfigured("microsoft"),
      },
      connections: connections.map((c) => ({
        ...c,
        calendars: c.calendars.map((cal) => ({
          ...cal,
          windows: undefined,
          syncing: cal.windows.some((w) => !!w.nextPage),
          lastSyncedAt:
            cal.windows
              .map((w) => w.lastSuccessAt)
              .filter(Boolean)
              .sort((a, b) => b!.getTime() - a!.getTime())[0] || null,
        })),
      })),
      operations: operations.map((op) => ({
        id: op.id,
        state: op.state,
        error: op.error,
        createdAt: op.createdAt,
        title:
          (op.payload as { command?: { data?: { title?: string } } }).command
            ?.data?.title || "External calendar change",
      })),
    });
  } catch {
    return json({ error: "Calendar connections could not be loaded." }, 503);
  }
}
export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return json({ error: "Unauthorized" }, 401);
  if (req.headers.get("sec-fetch-site") === "cross-site")
    return json({ error: "Cross-site request rejected." }, 403);
  try {
    const text = await req.text();
    if (text.length > 6000) return json({ error: "Request too large." }, 413);
    const input = command.parse(JSON.parse(text));
    if (input.action === "connect")
      return json({
        url: await beginCalendarOAuth(session.userId, req, input.provider),
      });
    if (input.action === "disconnect") {
      await disconnectCalendar(session.userId, input.id);
      return json({ disconnected: true });
    }
    if (input.action === "calendar") {
      const { id, action, ...patch } = input;
      void action;
      await prisma.connectedCalendar.updateMany({
        where: { id, connection: { userId: session.userId } },
        data: patch,
      });
    }
    if (input.action === "subscribe") {
      const url = feedURL(input.url).href;
      seal(null, "configuration-check");
      await fetchFeed(url);
      const accountId = digest(url),
        existing = await prisma.calendarConnection.findUnique({
          where: {
            userId_provider_accountId: {
              userId: session.userId,
              provider: "ics",
              accountId,
            },
          },
        });
      if (
        !existing &&
        (await prisma.calendarConnection.count({
          where: { userId: session.userId },
        })) >= 10
      )
        throw new CalendarError("Connect up to ten calendar accounts.", 400);
      const id = existing?.id || randomUUID();
      const subscribed = await prisma.calendarConnection.upsert({
        where: {
          userId_provider_accountId: {
            userId: session.userId,
            provider: "ics",
            accountId,
          },
        },
        create: {
          id,
          userId: session.userId,
          provider: "ics",
          accountId,
          label: input.name,
          credentials: seal({ url }, `connection:${id}`),
        },
        update: { label: input.name, status: "ACTIVE" },
      });
      await prisma.connectedCalendar.upsert({
        where: {
          connectionId_remoteId: {
            connectionId: subscribed.id,
            remoteId: "feed",
          },
        },
        create: {
          id: randomUUID(),
          connectionId: subscribed.id,
          remoteId: "feed",
          name: input.name,
          writable: false,
        },
        update: { name: input.name },
      });
    }
    if (input.action === "refresh") {
      const connection = await prisma.calendarConnection.findFirst({
        where: { id: input.id, userId: session.userId },
      });
      if (connection && connection.provider !== "ics")
        await refreshCalendarList(connection);
    }
    if (input.action === "retry") {
      const op = await prisma.externalCalendarMutation.findFirst({
        where: {
          id: input.id,
          calendar: { connection: { userId: session.userId } },
          state: { in: ["PENDING", "RUNNING"] },
        },
      });
      if (!op)
        throw new CalendarError(
          "Refresh the event before creating a new proposal.",
          409
        );
      await prisma.externalCalendarMutation.update({
        where: { id: op.id },
        data: { nextRunAt: new Date() },
      });
      await processExternalMutation(op.id);
    }
    if (input.action === "sync")
      await prisma.calendarSyncWindow.updateMany({
        where: {
          calendar: { connection: { userId: session.userId } },
          nextRunAt: { gt: new Date() },
        },
        data: { nextRunAt: new Date() },
      });
    after(() => runCalendarSyncBatch(session.userId).then(() => {}));
    return json({ accepted: true });
  } catch (error) {
    return json(
      {
        error:
          error instanceof CalendarError
            ? error.message
            : error instanceof z.ZodError
              ? "Check the connection details."
              : "This calendar connection could not be updated.",
      },
      error instanceof CalendarError ? error.status : 400
    );
  }
}
