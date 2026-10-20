import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CalendarError, eventDTO } from "./personal-service";
import { sharedAccess } from "./shared-service";
import { addDays } from "./dates";
import { expandEvent, type EventException } from "./recurrence";
import { eventInputSchema } from "./contracts";
export async function readSharedEvents(
  userId: number,
  start: string,
  end: string,
  timezone: string
) {
  const rows = await prisma.calendarEvent.findMany({
    where: {
      sharedCalendar: { ...sharedAccess(userId) },
      OR: [
        {
          recurrence: { equals: Prisma.DbNull },
          startDate: { lt: addDays(end, 2) },
          endDate: { gte: addDays(start, -2) },
        },
        {
          recurrence: { not: Prisma.DbNull },
          startDate: { lt: addDays(end, 2) },
          OR: [
            { recurrenceThrough: null },
            { recurrenceThrough: { gte: addDays(start, -368) } },
            {
              exceptions: {
                some: {
                  cancelled: false,
                  startDate: { lt: addDays(end, 2) },
                  endDate: { gte: addDays(start, -2) },
                },
              },
            },
          ],
        },
      ],
    },
    include: {
      sharedCalendar: {
        include: { members: { where: { userId, status: "ACTIVE" } } },
      },
      exceptions: {
        where: {
          OR: [
            {
              originalDate: { gte: addDays(start, -368), lt: addDays(end, 2) },
            },
            {
              startDate: { lt: addDays(end, 2) },
              endDate: { gte: addDays(start, -2) },
            },
          ],
        },
      },
    },
    take: 2001,
  });
  if (rows.length > 2000)
    throw new CalendarError(
      "Too many shared commitments. Choose a shorter calendar period.",
      422
    );
  return rows.flatMap((row) => {
    const calendar = row.sharedCalendar!,
      role =
        calendar.ownerId === userId
          ? ("OWNER" as const)
          : (calendar.members[0].role as "EDITOR" | "VIEWER");
    const event = {
      ...eventDTO(row),
      shared: {
        calendarId: calendar.id,
        name: calendar.name,
        role,
        revision: calendar.revision,
      },
    };
    return expandEvent(
      event,
      row.exceptions.map((e) => ({
        originalDate: e.originalDate,
        cancelled: e.cancelled,
        data: e.data ? eventInputSchema.parse(e.data) : null,
      })) as EventException[],
      start,
      end,
      timezone
    );
  });
}
