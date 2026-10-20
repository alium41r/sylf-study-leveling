import "server-only";
import { createHash } from "node:crypto";
import { Prisma, type CalendarNote } from "@prisma/client";
import {
  expandEvent,
  recurrenceDates,
  recurrenceThrough,
  type EventException,
} from "./recurrence";
import { addDays } from "./dates";
import { eventFields } from "./scheduling";
import {
  eventInputSchema,
  type CalendarEvent,
  type EventInput,
} from "./contracts";
import { prisma } from "@/lib/prisma";
import {
  calendarWriteSchema,
  calendarDeleteSchema,
  dateKeySchema,
} from "./contracts";
import { TimezoneService } from "@/lib/timezone-service";
import type { z } from "zod";

function sameNoteDocument(a: unknown, b: unknown): boolean {
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    if (value && typeof value === "object")
      return (
        "{" +
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, val]) => JSON.stringify(key) + ":" + canonical(val))
          .join(",") +
        "}"
      );
    return JSON.stringify(value);
  };
  return canonical(a) === canonical(b);
}
export class CalendarError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}
export async function readPersonalCalendar(
  userId: number,
  start: string,
  end: string
) {
  if (
    !dateKeySchema.safeParse(start).success ||
    !dateKeySchema.safeParse(end).success ||
    end <= start ||
    Date.parse(end) - Date.parse(start) > 93 * 86400000
  )
    throw new CalendarError("Choose a range of up to 93 days.", 400);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true },
  });
  const timezone = TimezoneService.validateTimezone(user.timezone)
    ? user.timezone
    : "UTC";
  const [events, notes, sharedCount] = await Promise.all([
    readUnifiedCalendarEvents(userId, start, end, timezone, false, false),
    prisma.$queryRaw<
      Array<{
        id: string;
        title: string;
        dateKey: string;
        document: Prisma.JsonValue;
        revision: number;
        createdAt: Date;
        updatedAt: Date;
        preview: boolean;
        hasHandwriting: boolean;
      }>
    >(Prisma.sql`
      SELECT "id","title","dateKey","revision","createdAt","updatedAt", "documentMode"!='annotation' AS "preview", "hasInk" AS "hasHandwriting",
       CASE WHEN "documentMode"='annotation' THEN "document" ELSE jsonb_build_object('version',1,'text',"previewText") END AS "document"
      FROM "CalendarNote" WHERE "userId"=${userId} AND "dateKey">=${start} AND "dateKey"<${end} ORDER BY "createdAt" ASC
    `),
    prisma.sharedCalendar.count({
      where: {
        OR: [
          { ownerId: userId },
          { members: { some: { userId, status: "ACTIVE" } } },
        ],
      },
    }),
  ]);
  return {
    events: events.events,
    notes,
    externalCoverage: events.coverage,
    sharedCount,
  };
}
type CalendarWrite = z.infer<typeof calendarWriteSchema>;
type CalendarDelete = z.infer<typeof calendarDeleteSchema>;
export async function writePersonalCalendar(
  userId: number,
  input: CalendarWrite,
  create: boolean
): Promise<{
  event?: CalendarEvent;
  note?: CalendarNote;
  pending?: boolean;
  operationId?: string;
  message?: string;
  calendarChanged?: boolean;
}> {
  if (input.kind === "event" && input.external && input.sharedCalendarId)
    throw new CalendarError("Choose one calendar destination.", 400);
  if (input.kind === "event" && input.external) {
    const { submitExternalMutation } = await import("./external/mutations");
    return submitExternalMutation(userId, input, create);
  }
  // Owner and revision are included in the atomic write predicate. No client can
  // supply an owner or mutate a Quest/Goal through this API.
  return prisma.$transaction(async (tx) => {
    if (input.kind === "event") {
      const scope = input.sharedCalendarId
        ? await (
            await import("./shared-service")
          ).sharedWriteScope(tx, userId, input.sharedCalendarId)
        : null;
      const owner = {
        userId: scope?.userId ?? userId,
        sharedCalendarId: input.sharedCalendarId ?? null,
      };
      if (scope && input.data.reminders?.length)
        throw new CalendarError(
          "Shared event reminders are not supported. Use a personal event for your own reminder.",
          422
        );
      const decorate = (event: CalendarEvent): CalendarEvent =>
        scope ? { ...event, shared: scope.shared } : event;
      if (!create)
        await tx.$queryRaw`SELECT "id" FROM "CalendarEvent" WHERE "id" = ${input.id} AND "userId" = ${owner.userId} FOR UPDATE`;
      const hash = mutationHash(input);
      const previous = await tx.calendarEvent.findFirst({
        where: { id: input.id, ...owner },
      });
      if (
        !create &&
        previous?.lastMutationId &&
        previous.lastMutationId === input.mutationId
      ) {
        if (previous.lastMutationHash !== hash)
          throw new CalendarError("This retry has different details.", 409);
        return { event: decorate(eventDTO(previous)) };
      }
      if (input.occurrenceDate) {
        if (create || !previous)
          throw new CalendarError("Series not found.", 404);
        assertOccurrence(eventDTO(previous), input.occurrenceDate);
        if (input.data.recurrence)
          throw new CalendarError(
            "Change repeat rules on the whole series.",
            400
          );
        const result = await tx.calendarEvent.updateMany({
          where: { id: input.id, ...owner, revision: input.revision },
          data: {
            revision: { increment: 1 },
            lastMutationId: input.mutationId,
            lastMutationHash: hash,
          },
        });
        if (!result.count) missingOrConflict(previous);
        const data = eventInputSchema.parse(input.data);
        await tx.calendarEventException.upsert({
          where: {
            eventId_originalDate: {
              eventId: input.id,
              originalDate: input.occurrenceDate,
            },
          },
          create: {
            eventId: input.id,
            originalDate: input.occurrenceDate,
            cancelled: false,
            data: data as Prisma.InputJsonValue,
            startDate: data.startDate,
            endDate: data.endDate,
          },
          update: {
            cancelled: false,
            data: data as Prisma.InputJsonValue,
            startDate: data.startDate,
            endDate: data.endDate,
          },
        });
      } else {
        const data = eventDatabaseInput(input.data);
        if (create) {
          if (input.revision !== 1)
            throw new CalendarError(
              "New events must begin at revision 1.",
              400
            );
          await tx.calendarEvent.createMany({
            data: [
              {
                ...data,
                id: input.id,
                ...owner,
                lastMutationId: input.mutationId,
                lastMutationHash: hash,
              },
            ],
            skipDuplicates: true,
          });
        } else {
          const result = await tx.calendarEvent.updateMany({
            where: { id: input.id, ...owner, revision: input.revision },
            data: {
              ...data,
              revision: { increment: 1 },
              lastMutationId: input.mutationId,
              lastMutationHash: hash,
            },
          });
          if (!result.count) missingOrConflict(previous);
          // Retain occurrence edits when repeat rules change. The projection
          // applies only exceptions whose original dates still match the rule.
        }
      }
      const saved = await tx.calendarEvent.findFirst({
        where: { id: input.id, ...owner },
      });
      if (!saved) throw new CalendarError("Event not found.", 404);
      if (
        create &&
        !sameNoteDocument(
          eventFields(eventDTO(saved)),
          eventFields({
            ...input.data,
            startsAt: input.data.startsAt
              ? new Date(input.data.startsAt).toISOString()
              : null,
            endsAt: input.data.endsAt
              ? new Date(input.data.endsAt).toISOString()
              : null,
          })
        )
      )
        throw new CalendarError(
          "This event was already saved with different details. Your draft is kept.",
          409
        );
      return { event: decorate(eventDTO(saved)) };
    }
    if (create) {
      if (input.revision !== 1)
        throw new CalendarError("New notes must begin at revision 1.", 400);
      await tx.calendarNote.createMany({
        data: [{ ...input.data, id: input.id, userId }],
        skipDuplicates: true,
      });
    } else {
      const result = await tx.calendarNote.updateMany({
        where: { id: input.id, userId, revision: input.revision },
        data: { ...input.data, revision: { increment: 1 } },
      });
      if (!result.count)
        await missingOrConflict(
          await tx.calendarNote.findFirst({ where: { id: input.id, userId } })
        );
    }
    const note = await tx.calendarNote.findFirst({
      where: { id: input.id, userId },
    });
    if (!note) throw new CalendarError("Note not found.", 404);
    const document = note.document;
    if (
      create &&
      (note.title !== input.data.title ||
        note.dateKey !== input.data.dateKey ||
        !sameNoteDocument(document, input.data.document))
    )
      throw new CalendarError(
        "This note was already saved with different details. Your draft is kept; reopen the saved note to edit it.",
        409
      );
    await (
      await import("./notebook-service")
    ).pruneNoteRecognitions(tx, input.id, note.document);
    return { note };
  });
}
function missingOrConflict(record: unknown): never {
  throw new CalendarError(
    record
      ? "This item changed in another tab. Your draft is kept. Reopen the latest item before saving again."
      : "This item no longer exists.",
    record ? 409 : 404
  );
}
export async function deletePersonalCalendar(
  userId: number,
  input: CalendarDelete
) {
  if (input.external && input.sharedCalendarId)
    throw new CalendarError("Choose one calendar destination.", 400);
  if (input.external) {
    const { submitExternalMutation } = await import("./external/mutations");
    return submitExternalMutation(userId, input, false);
  }

  if (input.external && input.sharedCalendarId)
    throw new CalendarError("Choose one calendar destination.", 400);
  if (input.kind === "note" && input.sharedCalendarId)
    throw new CalendarError("Notebooks are private.", 400);
  return prisma.$transaction(async (tx) => {
    const scope = input.sharedCalendarId
      ? await (
          await import("./shared-service")
        ).sharedWriteScope(tx, userId, input.sharedCalendarId)
      : null;
    const owner = {
      userId: scope?.userId ?? userId,
      sharedCalendarId: input.sharedCalendarId ?? null,
    };
    if (input.kind === "event" && input.occurrenceDate) {
      await tx.$queryRaw`SELECT "id" FROM "CalendarEvent" WHERE "id" = ${input.id} AND "userId" = ${owner.userId} FOR UPDATE`;
      const previous = await tx.calendarEvent.findFirst({
        where: { id: input.id, ...owner },
      });
      if (!previous) throw new CalendarError("Series not found.", 404);
      const hash = mutationHash(input);
      if (
        previous.lastMutationId &&
        previous.lastMutationId === input.mutationId
      ) {
        if (previous.lastMutationHash !== hash)
          throw new CalendarError("This retry has different details.", 409);
        return { deleted: true };
      }
      assertOccurrence(eventDTO(previous), input.occurrenceDate!);
      const result = await tx.calendarEvent.updateMany({
        where: { id: input.id, ...owner, revision: input.revision },
        data: {
          revision: { increment: 1 },
          lastMutationId: input.mutationId,
          lastMutationHash: hash,
        },
      });
      if (!result.count) missingOrConflict(previous);
      await tx.calendarEventException.upsert({
        where: {
          eventId_originalDate: {
            eventId: input.id,
            originalDate: input.occurrenceDate!,
          },
        },
        create: {
          eventId: input.id,
          originalDate: input.occurrenceDate!,
          cancelled: true,
          startDate: input.occurrenceDate!,
          endDate: input.occurrenceDate!,
        },
        update: { cancelled: true, data: Prisma.DbNull },
      });
      return { deleted: true };
    }
    const result =
      input.kind === "event"
        ? await tx.calendarEvent.deleteMany({
            where: { id: input.id, ...owner, revision: input.revision },
          })
        : await tx.calendarNote.deleteMany({
            where: { id: input.id, userId, revision: input.revision },
          });
    if (!result.count) {
      const record =
        input.kind === "event"
          ? await tx.calendarEvent.findFirst({
              where: { id: input.id, ...owner },
            })
          : await tx.calendarNote.findFirst({
              where: { id: input.id, userId },
            });
      // Deletion is idempotent, including a retry after an uncertain acknowledgment.
      if (record) missingOrConflict(record);
    }
    return { deleted: true };
  });
}

function mutationHash(input: CalendarWrite | CalendarDelete) {
  const canonical = (value: unknown): string =>
    value && typeof value === "object"
      ? Array.isArray(value)
        ? `[${value.map(canonical).join(",")}]`
        : `{${Object.entries(value)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
            .join(",")}}`
      : JSON.stringify(value);
  return createHash("sha256").update(canonical(input)).digest("hex");
}
export function eventDTO(row: {
  id: string;
  title: string;
  description: string;
  color: string;
  category: string;
  allDay: boolean;
  startDate: string;
  endDate: string;
  startsAt: Date | null;
  endsAt: Date | null;
  timezone: string;
  recurrence: unknown;
  reminders: number[];
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  lastMutationId: string | null;
}): CalendarEvent {
  return {
    ...eventInputSchema.parse({
      title: row.title,
      description: row.description,
      color: row.color,
      category: row.category,
      allDay: row.allDay,
      startDate: row.startDate,
      endDate: row.endDate,
      startsAt: row.startsAt?.toISOString() || null,
      endsAt: row.endsAt?.toISOString() || null,
      timezone: row.timezone,
      recurrence: row.recurrence,
      reminders: row.reminders,
    }),
    id: row.id,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastMutationId: row.lastMutationId,
  };
}
function eventDatabaseInput(input: EventInput) {
  return {
    ...input,
    category: input.category || "personal",
    recurrence: input.recurrence
      ? (input.recurrence as Prisma.InputJsonValue)
      : Prisma.DbNull,
    reminders: input.reminders || [],
    recurrenceThrough: recurrenceThrough(input),
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
  };
}
function assertOccurrence(seed: CalendarEvent, date: string) {
  if (
    !seed.recurrence ||
    !recurrenceDates(
      seed.startDate,
      seed.recurrence,
      date,
      addDays(date, 1)
    ).includes(date)
  )
    throw new CalendarError(
      "This occurrence is no longer in the series. Reopen the latest event.",
      409
    );
}
/** Owner-scoped seed/occurrence lookup shared by the editor and Sylvie. */
export async function readPersonalEvent(
  userId: number,
  id: string,
  occurrenceDate?: string
) {
  const { calendarEventAccess } = await import("./shared-service");
  const row = await prisma.calendarEvent.findFirst({
    where: { id, ...calendarEventAccess(userId) },
    include: {
      sharedCalendar: {
        include: { members: { where: { userId, status: "ACTIVE" } } },
      },
      exceptions: occurrenceDate
        ? { where: { originalDate: occurrenceDate } }
        : false,
    },
  });
  if (!row) throw new CalendarError("Event not found.", 404);
  const seed = eventDTO(row);
  if (row.sharedCalendar)
    seed.shared = {
      calendarId: row.sharedCalendar.id,
      name: row.sharedCalendar.name,
      revision: row.sharedCalendar.revision,
      role:
        row.sharedCalendar.ownerId === userId
          ? "OWNER"
          : (row.sharedCalendar.members[0].role as "EDITOR" | "VIEWER"),
    };
  if (!occurrenceDate) return seed;
  assertOccurrence(seed, occurrenceDate);
  const exception = row.exceptions?.[0];
  if (exception?.cancelled)
    throw new CalendarError("This occurrence was cancelled.", 409);
  const date = exception?.startDate ?? occurrenceDate;
  const result = expandEvent(
    seed,
    row.exceptions as EventException[],
    date,
    addDays(date, 2),
    seed.timezone
  ).find((e) => e.occurrenceDate === occurrenceDate);
  if (!result)
    throw new CalendarError("This occurrence has no valid local time.", 409);
  return result;
}
/** Project an edited series with its retained sparse overrides. No writes. */
export async function previewPersonalEvent(
  userId: number,
  event: CalendarEvent,
  start: string,
  end: string,
  timezone: string
) {
  const { calendarEventAccess } = await import("./shared-service");
  const exceptions = event.recurrence
    ? await prisma.calendarEventException.findMany({
        where: {
          eventId: event.id,
          event: calendarEventAccess(userId),
          ...eventExceptionRange(start, end),
        },
      })
    : [];
  return expandEvent(
    event,
    exceptions as EventException[],
    start,
    end,
    timezone
  );
}
function eventExceptionRange(start: string, end: string) {
  return {
    OR: [
      { originalDate: { gte: addDays(start, -368), lt: addDays(end, 2) } },
      {
        startDate: { lt: addDays(end, 2) },
        endDate: { gte: addDays(start, -2) },
      },
    ],
  };
}
/** Bounded typed excerpts, extracted in PostgreSQL. Never load ink vectors into
 * an AI read. Search the full stored text, including beyond the excerpt. */
export async function readPersonalTypedNotes(
  userId: number,
  date: string,
  query?: string
) {
  dateKeySchema.parse(date);
  const search = query?.toLowerCase() || "";
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      title: string;
      revision: number;
      text: string;
      textTruncated: boolean;
      excerptStart: number;
      hasHandwriting: boolean;
      mode: string;
    }>
  >(Prisma.sql`
    SELECT "id", "title", "revision",
      substring(coalesce("document"->>'text', '') FROM greatest(1, strpos(lower(coalesce("document"->>'text', '')), ${search}) - 80) FOR 1600) AS "text",
      length(coalesce("document"->>'text', '')) > 1600 AS "textTruncated",
      greatest(1, strpos(lower(coalesce("document"->>'text', '')), ${search}) - 80) AS "excerptStart",
      CASE WHEN jsonb_typeof("document"->'ink'->'strokes') = 'array' THEN jsonb_array_length("document"->'ink'->'strokes') > 0 ELSE false END AS "hasHandwriting",
      coalesce("document"->>'mode', 'note') AS "mode",
      (SELECT left(string_agg(r."text", E'\n'),1600) FROM "CalendarNoteRecognition" r WHERE r."noteId"="CalendarNote"."id") AS "recognizedText"
    FROM "CalendarNote" WHERE "userId" = ${userId} AND "dateKey" = ${date}
      AND (${search} = '' OR strpos(lower("title"), ${search}) > 0 OR strpos(lower(coalesce("document"->>'text', '')), ${search}) > 0 OR EXISTS(SELECT 1 FROM "CalendarNoteRecognition" r WHERE r."noteId"="CalendarNote"."id" AND strpos(lower(r."text"),${search})>0))
    ORDER BY "createdAt", "id" LIMIT 9
  `);
  return {
    notes: rows.slice(0, 8),
    truncated: rows.length > 8 || rows.some((row) => row.textTruncated),
  };
}
export async function readPersonalEvents(
  userId: number,
  start: string,
  end: string,
  timezone: string,
  onlyReminders = false
) {
  const paddedEnd = addDays(end, 2);
  const exceptionRange = eventExceptionRange(start, end);
  const rows = await prisma.calendarEvent.findMany({
    where: {
      userId,
      sharedCalendarId: null,
      ...(onlyReminders
        ? {
            AND: [
              {
                OR: [
                  { reminders: { isEmpty: false } },
                  {
                    exceptions: {
                      some: {
                        cancelled: false,
                        data: { path: ["reminders"], not: [] },
                      },
                    },
                  },
                ],
              },
            ],
          }
        : {}),
      OR: [
        {
          recurrenceThrough: null,
          allDay: true,
          startDate: { lt: end },
          endDate: { gt: start },
        },
        {
          recurrenceThrough: null,
          allDay: false,
          startsAt: {
            lt: TimezoneService.getStartOfLocalDateUTC(timezone, end),
          },
          endsAt: {
            gt: TimezoneService.getStartOfLocalDateUTC(timezone, start),
          },
        },
        {
          recurrenceThrough: { gte: addDays(start, -2) },
          startDate: { lt: paddedEnd },
        },
        {
          exceptions: {
            some: {
              cancelled: false,
              startDate: { lt: paddedEnd },
              endDate: { gte: addDays(start, -2) },
            },
          },
        },
      ],
    },
    include: { exceptions: { where: exceptionRange } },
    orderBy: [{ startDate: "asc" }, { startsAt: "asc" }],
  });
  return rows.flatMap((row) =>
    expandEvent(
      eventDTO(row),
      row.exceptions.map((item) => ({
        originalDate: item.originalDate,
        cancelled: item.cancelled,
        data: item.data ? eventInputSchema.parse(item.data) : null,
      })) as EventException[],
      start,
      end,
      timezone
    )
  );
}

/** Display and planning share provider identities; local reminder delivery still
 * reads only readPersonalEvents, preventing duplicate external alerts. */
export async function readUnifiedCalendarEvents(
  userId: number,
  start: string,
  end: string,
  timezone: string,
  planning = true,
  strict = true
) {
  const { readExternalProjection } = await import("./external/service");
  const [personal, shared, external] = await Promise.all([
    readPersonalEvents(userId, start, end, timezone),
    (await import("./shared-projection")).readSharedEvents(
      userId,
      start,
      end,
      timezone
    ),
    readExternalProjection(
      userId,
      start,
      end,
      timezone,
      planning,
      strict
    ).catch((error) => {
      if (strict) throw error;
      return {
        events: [],
        complete: false,
        warnings: [
          "Connected calendar cache is unavailable. Check Calendar settings.",
        ],
        connected: 1,
      };
    }),
  ]);
  return {
    events: [...personal, ...shared, ...external.events],
    coverage: {
      complete: external.complete,
      warnings: external.warnings,
      connected: external.connected,
    },
  };
}
