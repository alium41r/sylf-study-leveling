import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CalendarError } from "./personal-service";
import { sharedCommandSchema } from "./shared-contracts";
/** This predicate can only expose event containers, never notes/providers/study. */
export const sharedAccess = (userId: number) => ({
  OR: [
    { ownerId: userId },
    { members: { some: { userId, status: "ACTIVE" } } },
  ],
});
export function calendarEventAccess(userId: number) {
  return {
    OR: [
      { userId, sharedCalendarId: null },
      { sharedCalendar: sharedAccess(userId) },
    ],
  };
}
export async function sharedCatalog(userId: number, management = false) {
  const calendars = await prisma.sharedCalendar.findMany({
    where: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
    include: {
      owner: { select: { username: true } },
      members: {
        where: management ? {} : { userId },
        select: {
          userId: true,
          role: true,
          status: true,
          user: { select: { username: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 51,
  });
  if (calendars.length > 50)
    throw new CalendarError(
      "Too many shared calendars. Leave an unused calendar before adding another.",
      422
    );
  return calendars.map((c) => {
    const membership = c.members.find((m) => m.userId === userId);
    return {
      id: c.id,
      name: c.name,
      revision: c.revision,
      owner: c.owner,
      role:
        c.ownerId === userId
          ? ("OWNER" as const)
          : (membership!.role as "EDITOR" | "VIEWER"),
      status:
        c.ownerId === userId
          ? ("ACTIVE" as const)
          : (membership!.status as "ACTIVE" | "PENDING"),
      ...(management && c.ownerId === userId ? { members: c.members } : {}),
    };
  });
}
/** Lock the calendar before checking current membership. Removal/role changes and
 * all event writes serialize through this same lock, closing authorization races. */
export async function sharedWriteScope(
  tx: Prisma.TransactionClient,
  userId: number,
  calendarId: string
) {
  await tx.$queryRaw`SELECT "id" FROM "SharedCalendar" WHERE "id"=${calendarId} FOR UPDATE`;
  const calendar = await tx.sharedCalendar.findFirst({
    where: { id: calendarId, ...sharedAccess(userId) },
    include: { members: { where: { userId, status: "ACTIVE" } } },
  });
  if (!calendar)
    throw new CalendarError(
      "Shared calendar is unavailable or your access was removed.",
      403
    );
  const role =
    calendar.ownerId === userId ? "OWNER" : calendar.members[0]?.role;
  if (role !== "OWNER" && role !== "EDITOR")
    throw new CalendarError(
      "You can view this shared calendar, but cannot change its events.",
      403
    );
  return {
    userId: calendar.ownerId,
    sharedCalendarId: calendar.id,
    shared: {
      calendarId: calendar.id,
      name: calendar.name,
      role: role as "OWNER" | "EDITOR",
      revision: calendar.revision,
    },
  };
}
export async function changeSharedCalendar(userId: number, raw: unknown) {
  const input = sharedCommandSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    if (input.action === "create") {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR UPDATE`;
      const existing = await tx.sharedCalendar.findUnique({
        where: { id: input.id },
      });
      if (existing) {
        if (existing.ownerId === userId && existing.name === input.name)
          return { accepted: true };
        throw new CalendarError("Calendar identity is already in use.", 409);
      }
      const ownedCount = await tx.sharedCalendar.count({
        where: { ownerId: userId },
      });
      if (ownedCount >= 10)
        throw new CalendarError("You can own up to ten shared calendars.", 422);
      if (
        ownedCount +
          (await tx.sharedCalendarMember.count({ where: { userId } })) >=
        50
      )
        throw new CalendarError(
          "Leave an unused calendar before creating another.",
          422
        );
      await tx.sharedCalendar.create({
        data: { id: input.id, ownerId: userId, name: input.name },
      });
      return { accepted: true };
    }
    await tx.$queryRaw`SELECT "id" FROM "SharedCalendar" WHERE "id"=${input.id} FOR UPDATE`;
    const calendar = await tx.sharedCalendar.findFirst({
      where: {
        id: input.id,
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
      include: { members: true },
    });
    if (!calendar) throw new CalendarError("Shared calendar not found.", 404);
    if (["respond", "leave"].includes(input.action)) {
      if (calendar.ownerId === userId)
        throw new CalendarError(
          "Owners can delete a calendar; other members can leave it.",
          400
        );
      const member = calendar.members.find((m) => m.userId === userId);
      if (!member) throw new CalendarError("Invitation not found.", 404);
      if (input.action === "respond" && input.accept) {
        if (member.status === "ACTIVE") return { accepted: true };
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR UPDATE`;
        if (
          (await tx.sharedCalendarMember.count({
            where: { userId, status: "ACTIVE" },
          })) >= 40
        )
          throw new CalendarError(
            "Leave an unused calendar before accepting another.",
            422
          );
        await tx.sharedCalendarMember.update({
          where: { calendarId_userId: { calendarId: input.id, userId } },
          data: { status: "ACTIVE" },
        });
      } else
        await tx.sharedCalendarMember.delete({
          where: { calendarId_userId: { calendarId: input.id, userId } },
        });
      await tx.sharedCalendar.update({
        where: { id: input.id },
        data: { revision: { increment: 1 } },
      });
      return { accepted: true };
    }
    if (calendar.ownerId !== userId)
      throw new CalendarError(
        "Only the calendar owner can manage sharing.",
        403
      );
    if (!("revision" in input) || calendar.revision !== input.revision)
      throw new CalendarError(
        "Sharing changed. Reload before managing this calendar.",
        409
      );
    if (input.action === "delete") {
      await tx.sharedCalendar.delete({ where: { id: input.id } });
      return { deleted: true };
    }
    if (input.action === "rename")
      await tx.sharedCalendar.update({
        where: { id: input.id },
        data: { name: input.name },
      });
    if (input.action === "invite") {
      const invited = await tx.user.findFirst({
        where: { username: { equals: input.username, mode: "insensitive" } },
        select: { id: true },
      });
      if (!invited || invited.id === userId)
        throw new CalendarError("Choose another Sylf username to invite.", 400);
      if (calendar.members.some((m) => m.userId === invited.id))
        throw new CalendarError(
          "This person already has membership or a pending invitation.",
          409
        );
      if (calendar.members.length >= 20)
        throw new CalendarError(
          "A shared calendar supports up to twenty invited members.",
          422
        );
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${invited.id} FOR UPDATE`;
      if (
        (await tx.sharedCalendarMember.count({
          where: { userId: invited.id },
        })) +
          (await tx.sharedCalendar.count({ where: { ownerId: invited.id } })) >=
        50
      )
        throw new CalendarError(
          "This person cannot receive another calendar invitation yet.",
          422
        );
      await tx.sharedCalendarMember.create({
        data: { calendarId: input.id, userId: invited.id, role: input.role },
      });
    }
    if (input.action === "member") {
      if (!calendar.members.some((m) => m.userId === input.userId))
        throw new CalendarError("Member no longer exists.", 409);
      if (input.role)
        await tx.sharedCalendarMember.update({
          where: {
            calendarId_userId: { calendarId: input.id, userId: input.userId },
          },
          data: { role: input.role },
        });
      else
        await tx.sharedCalendarMember.delete({
          where: {
            calendarId_userId: { calendarId: input.id, userId: input.userId },
          },
        });
    }
    await tx.sharedCalendar.update({
      where: { id: input.id },
      data: { revision: { increment: 1 } },
    });
    return { accepted: true };
  });
}
