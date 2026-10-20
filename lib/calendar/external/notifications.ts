import "server-only";
import { randomUUID, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { connectionToken } from "./connections";
import { publicOrigin, equalSecret } from "./security";
import { providerRequest } from "./http";
export async function renewCalendarWatch(calendarId: string) {
  const calendar = await prisma.connectedCalendar.findUnique({
    where: { id: calendarId },
    include: { connection: true },
  });
  if (
    !calendar ||
    calendar.connection.provider === "ics" ||
    calendar.connection.status !== "ACTIVE" ||
    (calendar.watchExpiresAt?.getTime() || 0) > Date.now() + 86400000
  )
    return;
  const provider = calendar.connection.provider;
  if (provider === "microsoft") {
    const existing = await prisma.connectedCalendar.findFirst({
      where: {
        connectionId: calendar.connectionId,
        watchResource: "me/events",
        watchExpiresAt: { gt: new Date(Date.now() + 86400000) },
      },
    });
    if (existing) return;
  }
  const watchId = randomUUID(),
    secret = randomBytes(32).toString("base64url"),
    token = await connectionToken(calendar.connection);
  const old = { watchId: calendar.watchId, resource: calendar.watchResource };
  await prisma.connectedCalendar.update({
    where: { id: calendar.id },
    data: {
      watchId,
      watchSecret: secret,
      watchResource: null,
      watchExpiresAt: null,
    },
  });
  try {
    const google = provider === "google";
    const response = await providerRequest(
      google
        ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.remoteId)}/events/watch`
        : "https://graph.microsoft.com/v1.0/subscriptions",
      token,
      {
        method: "POST",
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify(
          google
            ? {
                id: watchId,
                type: "web_hook",
                address: `${publicOrigin()}/api/calendar/connections/notifications/google`,
                token: secret,
                expiration: String(Date.now() + 6 * 86400000),
              }
            : {
                changeType: "created,updated,deleted",
                notificationUrl: `${publicOrigin()}/api/calendar/connections/notifications/microsoft`,
                resource: "me/events",
                expirationDateTime: new Date(
                  Date.now() + 6 * 86400000
                ).toISOString(),
                clientState: secret,
              }
        ),
      }
    );
    await prisma.connectedCalendar.updateMany({
      where: { id: calendar.id, watchId },
      data: {
        watchId: google ? watchId : String(response.id),
        watchResource: google ? String(response.resourceId) : "me/events",
        watchExpiresAt: google
          ? new Date(Number(response.expiration))
          : new Date(String(response.expirationDateTime)),
      },
    });
    if (old.watchId && old.resource)
      try {
        await providerRequest(
          google
            ? "https://www.googleapis.com/calendar/v3/channels/stop"
            : `https://graph.microsoft.com/v1.0/subscriptions/${encodeURIComponent(old.watchId)}`,
          token,
          {
            method: google ? "POST" : "DELETE",
            signal: AbortSignal.timeout(3000),
            ...(google
              ? {
                  body: JSON.stringify({
                    id: old.watchId,
                    resourceId: old.resource,
                  }),
                }
              : {}),
          }
        );
      } catch {
        /* Old watch expires; notifications only queue coalesced reads. */
      }
  } catch {
    await prisma.connectedCalendar.updateMany({
      where: { id: calendar.id, watchId },
      data: {
        watchId: null,
        watchSecret: null,
        watchResource: null,
        watchExpiresAt: null,
      },
    });
  }
}
export async function receiveCalendarNotification(
  provider: string,
  headers: Headers,
  body: unknown
) {
  const entries =
    provider === "google"
      ? [
          {
            id: headers.get("x-goog-channel-id"),
            secret: headers.get("x-goog-channel-token"),
            resource: headers.get("x-goog-resource-id"),
          },
        ]
      : body &&
          typeof body === "object" &&
          "value" in body &&
          Array.isArray(body.value)
        ? body.value.slice(0, 100).map((raw: Record<string, unknown>) => ({
            id: raw.subscriptionId,
            secret: raw.clientState,
            resource: null,
          }))
        : [];
  const owners = new Set<number>();
  for (const entry of entries) {
    if (typeof entry.id !== "string" || typeof entry.secret !== "string")
      continue;
    const calendar = await prisma.connectedCalendar.findFirst({
      where: { watchId: entry.id, connection: { provider, status: "ACTIVE" } },
      include: { connection: { select: { userId: true } } },
    });
    if (
      !calendar?.watchSecret ||
      !equalSecret(calendar.watchSecret, entry.secret) ||
      (provider === "google" &&
        calendar.watchResource &&
        calendar.watchResource !== entry.resource)
    )
      continue;
    owners.add(calendar.connection.userId);
    await prisma.calendarSyncWindow.updateMany({
      where: {
        calendar:
          provider === "google"
            ? { id: calendar.id }
            : { connectionId: calendar.connectionId },
        nextRunAt: { gt: new Date() },
      },
      data: { nextRunAt: new Date() },
    });
  }
  return [...owners];
}
