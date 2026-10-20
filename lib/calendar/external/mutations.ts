import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserTimezone } from "@/lib/timezone-server";
import { CalendarError } from "../personal-service";
import {
  calendarWriteSchema,
  calendarDeleteSchema,
  eventInputSchema,
  type CalendarEvent,
} from "../contracts";
import { type z } from "zod";
import { connectionToken } from "./connections";
import {
  calendarEventURL,
  providerEventBody,
  normalizeProviderEvent,
  providerRecurrence,
  type ProviderEvent,
} from "./providers";
import { digest, type CalendarProvider } from "./security";
import { providerRequest, ProviderError } from "./http";
import {
  claimCalendar,
  releaseCalendar,
  publishProviderEvent,
  readExternalOwnedEvent,
  rangeMonths,
} from "./service";
type Command =
  | Extract<z.infer<typeof calendarWriteSchema>, { kind: "event" }>
  | z.infer<typeof calendarDeleteSchema>;
export async function freshExternalEvent(
  userId: number,
  id: string,
  scope: "event" | "occurrence" | "series" = "occurrence"
): Promise<CalendarEvent | null> {
  const found = await readExternalOwnedEvent(userId, id);
  if (!found) return null;
  if (found.event.external!.provider === "ics") return found.event;
  const calendar = await prisma.connectedCalendar.findFirstOrThrow({
    where: { id: found.row.calendarId, connection: { userId } },
    include: { connection: true },
  });
  const metadata = found.row.data as unknown as ProviderEvent;
  if (scope === "series" && !metadata.seriesId && !metadata.recurring)
    throw new CalendarError("This event is not a recurring series.", 400);
  const remoteId =
      scope === "series"
        ? metadata.seriesId || found.row.remoteId
        : found.row.remoteId,
    provider = calendar.connection.provider as CalendarProvider;
  const raw = await providerRequest(
    calendarEventURL(provider, calendar.remoteId, remoteId),
    await connectionToken(calendar.connection)
  );
  const current = normalizeProviderEvent(
    provider,
    raw,
    await getUserTimezone(userId)
  );
  if (current.deleted)
    throw new CalendarError("The provider event was cancelled.", 409);
  let recurrence = current.data!.recurrence,
    unsupportedRecurrence = false;
  if (scope === "series") {
    const rule = providerRecurrence(provider, raw, current.data!);
    unsupportedRecurrence = rule === undefined;
    recurrence = rule ?? null;
  }
  return {
    ...found.event,
    ...current.data!,
    recurrence,
    external: {
      ...found.event.external!,
      etag: current.etag,
      unsupportedRecurrence,
    },
  };
}
export async function submitExternalMutation(
  userId: number,
  command: Command,
  create: boolean
) {
  if (command.kind !== "event" || !command.external || !command.mutationId)
    throw new CalendarError(
      "External event changes require an exact retry identity and destination.",
      400
    );
  const payload = JSON.parse(
      JSON.stringify({ command, create })
    ) as Prisma.InputJsonValue,
    hash = digest(JSON.stringify(payload));
  const prior = await prisma.externalCalendarMutation.findUnique({
    where: { id: command.mutationId },
    include: {
      calendar: { select: { connection: { select: { userId: true } } } },
    },
  });
  if (
    prior &&
    (prior.calendar.connection.userId !== userId || prior.hash !== hash)
  )
    throw new CalendarError("This retry identity has different details.", 409);
  if (prior?.state === "SUCCEEDED")
    return { ...(prior.result as object), calendarChanged: true };
  const calendar = await prisma.connectedCalendar.findFirst({
    where: {
      id: command.external.calendarId,
      connection: { userId, status: "ACTIVE" },
    },
  });
  if (!calendar?.writable)
    throw new CalendarError(
      "This connected calendar is read-only or needs reconnection.",
      403
    );
  const found = create
    ? null
    : await readExternalOwnedEvent(userId, command.id);
  if (!create && !prior && (!found || found.row.calendarId !== calendar.id))
    throw new CalendarError("External event not found.", 404);
  if (!prior && command.occurrenceDate)
    throw new CalendarError(
      "External occurrences use their provider event ID, not a Sylf recurrence date.",
      400
    );
  if (!prior && found) {
    const meta = found.row.data as unknown as ProviderEvent;
    if (
      meta.recurring
        ? command.external.scope === "event"
        : command.external.scope !== "event"
    )
      throw new CalendarError(
        "Choose one occurrence or the entire series explicitly for repeating external events.",
        400
      );
  }
  if (!prior) {
    if (found && found.row.revision !== command.revision)
      throw new CalendarError("Event changed. Refresh before saving.", 409);
    await prisma.externalCalendarMutation.createMany({
      data: [
        { id: command.mutationId, calendarId: calendar.id, payload, hash },
      ],
      skipDuplicates: true,
    });
  }
  const receipt = await prisma.externalCalendarMutation.findUniqueOrThrow({
    where: { id: command.mutationId },
    include: {
      calendar: { select: { connection: { select: { userId: true } } } },
    },
  });
  if (receipt.hash !== hash || receipt.calendar.connection.userId !== userId)
    throw new CalendarError("This retry identity has different details.", 409);
  await processExternalMutation(command.mutationId);
  const result = await prisma.externalCalendarMutation.findUniqueOrThrow({
    where: { id: command.mutationId },
  });
  if (result.state === "SUCCEEDED")
    return { ...(result.result as object), calendarChanged: true };
  if (["CONFLICT", "FAILED"].includes(result.state))
    throw new CalendarError(
      result.error ||
        "Provider could not apply this change. Refresh before trying again.",
      result.state === "CONFLICT" ? 409 : 422
    );
  return {
    pending: true,
    operationId: result.id,
    message:
      "Your approved change is queued. The provider has not confirmed it yet; check Calendar settings or retry the same change.",
  };
}
export async function processExternalMutation(id: string) {
  const operation = await prisma.externalCalendarMutation.findUnique({
    where: { id },
    include: { calendar: { include: { connection: true } } },
  });
  if (
    !operation ||
    !["PENDING", "RUNNING"].includes(operation.state) ||
    operation.nextRunAt > new Date()
  )
    return;
  const calendar = operation.calendar,
    connection = calendar.connection,
    provider = connection.provider as CalendarProvider,
    leaseId = await claimCalendar(calendar.id);
  if (!leaseId) return;
  try {
    if (!calendar.writable || provider === "ics")
      throw new CalendarError("This connected calendar is read-only.", 403);
    const payload = operation.payload as unknown as {
      command: Command;
      create: boolean;
      wire?: {
        remoteId?: string;
        body?: Record<string, unknown>;
        fields?: string[];
        remove: boolean;
      };
    };
    const command = payload.command;
    if (!command.external || command.kind !== "event")
      throw new CalendarError("Invalid external operation.", 400);
    const found = payload.create
      ? null
      : await readExternalOwnedEvent(connection.userId, command.id);
    if (!payload.create && !found && !payload.wire?.remoteId)
      throw new CalendarError(
        "Event no longer exists. Refresh the calendar.",
        409
      );
    const metadata = found?.row.data as unknown as ProviderEvent | undefined;
    const remoteId =
      payload.wire?.remoteId ||
      (payload.create
        ? undefined
        : command.external.scope === "series"
          ? metadata?.seriesId || found!.row.remoteId
          : found!.row.remoteId);
    const token = await connectionToken(connection),
      remove = !("data" in command);
    const expected = command.external.etag || found?.row.etag;
    let raw: Record<string, unknown> | null = null,
      absent = false;
    if (remoteId)
      try {
        raw = await providerRequest(
          calendarEventURL(provider, calendar.remoteId, remoteId),
          token
        );
      } catch (error) {
        if (
          remove &&
          operation.attempts > 0 &&
          error instanceof ProviderError &&
          [404, 410].includes(error.providerStatus)
        )
          absent = true;
        else throw error;
      }
    let response: Record<string, unknown> = {},
      alreadyApplied = absent;
    const current = raw
      ? normalizeProviderEvent(
          provider,
          raw,
          await getUserTimezone(connection.userId)
        ).data
      : undefined;
    if (current && command.external.scope === "series")
      current.recurrence = providerRecurrence(provider, raw!, current) ?? null;
    if (raw && String(raw.etag ?? raw["@odata.etag"]) !== expected) {
      // A lost acknowledgement is reconciled by an authenticated provider read.
      // Only fields in the persisted wire patch are compared; no second overwrite.
      if (
        operation.attempts > 0 &&
        !remove &&
        payload.wire?.fields?.length &&
        current &&
        "data" in command
      ) {
        alreadyApplied = payload.wire.fields.every((field) => {
          const key = field as keyof typeof current,
            a = current[key],
            b = command.data[key];
          return ["startsAt", "endsAt"].includes(key) && a && b
            ? Date.parse(String(a)) === Date.parse(String(b))
            : JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
        });
      }
      if (!alreadyApplied)
        throw new CalendarError(
          "The provider event changed since review. Refresh it before proposing changes again.",
          409
        );
      response = raw;
    }
    if (remoteId && !expected)
      throw new CalendarError(
        "Read the provider event before changing it.",
        409
      );
    let body: Record<string, unknown> | undefined = payload.wire?.body;
    if (!remove && !body && "data" in command) {
      const data = eventInputSchema.parse(command.data);
      body = providerEventBody(provider, data, payload.create, id);
      const keys: Record<string, (keyof typeof data)[]> =
        provider === "google"
          ? {
              summary: ["title"],
              description: ["description"],
              start: ["startsAt", "startDate", "allDay", "timezone"],
              end: ["endsAt", "endDate", "allDay", "timezone"],
              recurrence: ["recurrence"],
              reminders: ["reminders"],
            }
          : {
              subject: ["title"],
              body: ["description"],
              isAllDay: ["allDay"],
              start: ["startsAt", "startDate", "allDay"],
              end: ["endsAt", "endDate", "allDay"],
              recurrence: ["recurrence"],
              isReminderOn: ["reminders"],
              reminderMinutesBeforeStart: ["reminders"],
            };
      if (
        !payload.create &&
        current &&
        command.external.scope === "series" &&
        providerRecurrence(provider, raw!, current) === undefined &&
        [
          "startDate",
          "endDate",
          "startsAt",
          "endsAt",
          "allDay",
          "timezone",
          "recurrence",
        ].some(
          (field) =>
            JSON.stringify(data[field as keyof typeof data] ?? null) !==
            JSON.stringify(current[field as keyof typeof current] ?? null)
        )
      )
        throw new CalendarError(
          "Edit timing or repeat rules for this complex series in its calendar provider. Other details can be edited here.",
          422
        );
      if (!payload.create && current)
        for (const key of Object.keys(body))
          if (
            keys[key] &&
            !keys[key].some(
              (field) =>
                JSON.stringify(data[field] ?? null) !==
                JSON.stringify(current[field] ?? null)
            )
          )
            delete body[key];
      if (command.external.scope === "occurrence") delete body.recurrence;
      payload.wire = {
        remoteId,
        remove,
        body,
        fields: [...new Set(Object.keys(body).flatMap((k) => keys[k] || []))],
      };
    } else if (!payload.wire) payload.wire = { remoteId, remove };
    await prisma.externalCalendarMutation.update({
      where: { id },
      data: {
        state: "RUNNING",
        attempts: { increment: 1 },
        payload: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue,
      },
    });
    if (!alreadyApplied) {
      if (remove)
        await providerRequest(
          calendarEventURL(provider, calendar.remoteId, remoteId),
          token,
          { method: "DELETE", headers: { "If-Match": expected! } }
        );
      else
        try {
          response = await providerRequest(
            calendarEventURL(provider, calendar.remoteId, remoteId),
            token,
            {
              method: payload.create ? "POST" : "PATCH",
              ...(expected ? { headers: { "If-Match": expected } } : {}),
              body: JSON.stringify(body),
            }
          );
        } catch (error) {
          if (
            payload.create &&
            provider === "google" &&
            error instanceof ProviderError &&
            error.providerStatus === 409
          )
            response = await providerRequest(
              calendarEventURL(
                provider,
                calendar.remoteId,
                id.replace(/-/g, "")
              ),
              token
            );
          else throw error;
        }
    }
    await prisma.$transaction(async (tx) => {
      const fenced = await tx.connectedCalendar.updateMany({
        where: { id: calendar.id, leaseId },
        data: { leaseUntil: new Date(Date.now() + 90000) },
      });
      if (!fenced.count)
        throw new CalendarError(
          "Calendar connection changed during this operation. Inspect the provider before retrying.",
          409
        );
      if (remove) {
        if (command.external!.scope === "series")
          await tx.externalCalendarEvent.deleteMany({
            where: {
              calendarId: calendar.id,
              OR: [
                { remoteId },
                { data: { path: ["seriesId"], equals: remoteId! } },
              ],
            },
          });
        else
          await tx.externalCalendarEvent.deleteMany({
            where: { id: command.id, calendarId: calendar.id },
          });
      } else {
        const event = normalizeProviderEvent(
          provider,
          response,
          await getUserTimezone(connection.userId)
        );
        if (!event.etag)
          throw new CalendarError(
            "Provider did not confirm an event version. Inspect the provider before retrying.",
            409
          );
        // Series masters are not expanded as a second competing recurrence owner.
        if (!event.recurring || event.seriesId) {
          const eventId = await publishProviderEvent(tx, calendar.id, event);
          const months = rangeMonths(
            event.data!.startDate,
            event.data!.endDate > event.data!.startDate
              ? event.data!.endDate
              : new Date(
                  Date.parse(event.data!.startDate + "T12:00:00Z") + 86400000
                )
                  .toISOString()
                  .slice(0, 10)
          );
          for (const month of months.slice(0, 4)) {
            const window = await tx.calendarSyncWindow.upsert({
              where: { calendarId_month: { calendarId: calendar.id, month } },
              create: { id: randomUUID(), calendarId: calendar.id, month },
              update: { nextRunAt: new Date() },
            });
            await tx.calendarSyncMember.upsert({
              where: { windowId_eventId: { windowId: window.id, eventId } },
              create: { windowId: window.id, eventId, scanId: "mutation" },
              update: { scanId: "mutation" },
            });
          }
        }
      }
      await tx.calendarSyncWindow.updateMany({
        where: { calendarId: calendar.id },
        data: { nextRunAt: new Date() },
      });
      await tx.externalCalendarMutation.update({
        where: { id },
        data: {
          state: "SUCCEEDED",
          payload: {},
          error: null,
          result: {
            ...(remove ? { deleted: true } : { saved: true }),
            message: remove
              ? "Deleted the external event."
              : "The calendar provider confirmed your event change.",
          },
        },
      });
    });
  } catch (error) {
    if (error instanceof ProviderError && error.providerStatus === 401)
      await prisma.calendarConnection.updateMany({
        where: { id: connection.id },
        data: { status: "RECONNECT" },
      });
    const conflict = error instanceof CalendarError && error.status === 409,
      permanent =
        conflict || (error instanceof CalendarError && error.status < 500);
    await prisma.externalCalendarMutation.updateMany({
      where: { id, calendar: { leaseId } },
      data: {
        state: conflict ? "CONFLICT" : permanent ? "FAILED" : "PENDING",
        error:
          error instanceof CalendarError
            ? error.message
            : "Provider response was interrupted. The same approved operation will retry.",
        nextRunAt: new Date(
          Date.now() +
            (error instanceof ProviderError
              ? error.retrySeconds
              : Math.min(3600, 30 * 2 ** Math.min(operation.attempts, 7))) *
              1000
        ),
      },
    });
  } finally {
    await releaseCalendar(calendar.id, leaseId);
  }
}
