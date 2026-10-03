import { getSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { localToday } from "@/lib/planner/dates";
export const dynamic = "force-dynamic";

/**
 * What the Planner Modes surfaces need from the server before they can render.
 *
 * There is no availability flag here any more. Planner Modes are a permanent product
 * feature that coexists with the Classic Planner, so *whether* they exist is not a
 * server decision: the only things a client cannot work out for itself are the
 * account's schedule facts, and this route reports exactly those.
 *
 * Authentication is unchanged — no cookie session, no facts.
 */
export async function GET(req: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const session = await getSession(req);
    if (!session)
      return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401, headers });
    const [user, subjects] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: session.userId },
        select: { timezone: true, restDays: true },
      }),
      prisma.subject.findMany({
        where: { userId: session.userId, archivedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return Response.json(
      {
        timezone: user.timezone,
        today: localToday(user.timezone),
        restDays: user.restDays,
        subjects,
      },
      { headers }
    );
  } catch {
    return Response.json({ error: { code: "PLANNER_UNAVAILABLE" } }, { status: 503, headers });
  }
}
