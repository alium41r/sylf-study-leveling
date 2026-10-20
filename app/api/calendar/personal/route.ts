import { NextRequest, NextResponse, after } from "next/server";
import { getSession } from "@/lib/auth-server";
import {
  calendarWriteSchema,
  calendarDeleteSchema,
} from "@/lib/calendar/contracts";
import {
  CalendarError,
  readPersonalCalendar,
  writePersonalCalendar,
  deletePersonalCalendar,
} from "@/lib/calendar/personal-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
async function handle(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session?.userId) return json({ error: "Unauthorized" }, 401);
    if (req.method === "GET" && req.nextUrl.searchParams.has("id")) {
      const id = req.nextUrl.searchParams.get("id")!;
      if (!/^[0-9a-f-]{36}$/i.test(id))
        return json({ error: "Invalid note identity." }, 400);
      const { prisma } = await import("@/lib/prisma");
      if (req.nextUrl.searchParams.get("kind") === "event") {
        const { readPersonalEvent } =
          await import("@/lib/calendar/personal-service");
        try {
          return json({ event: await readPersonalEvent(session.userId, id) });
        } catch (error) {
          if (!(error instanceof CalendarError) || error.status !== 404)
            throw error;
        }
        const { freshExternalEvent } =
          await import("@/lib/calendar/external/mutations");
        const scope = req.nextUrl.searchParams.get("scope");
        const external = await freshExternalEvent(
          session.userId,
          id,
          scope === "series" ? "series" : "occurrence"
        );
        return external
          ? json({ event: external })
          : json({ error: "Event not found." }, 404);
      }
      const note = await prisma.calendarNote.findFirst({
        where: { id, userId: session.userId },
      });
      return note ? json({ note }) : json({ error: "Note not found." }, 404);
    }
    if (req.method === "GET") {
      after(async () => {
        const { runCalendarSyncBatch } =
          await import("@/lib/calendar/external/worker");
        await runCalendarSyncBatch(session.userId, 20000);
      });
      return json(
        await readPersonalCalendar(
          session.userId,
          req.nextUrl.searchParams.get("start") || "",
          req.nextUrl.searchParams.get("end") || ""
        )
      );
    }
    if (req.headers.get("sec-fetch-site") === "cross-site")
      return json({ error: "Cross-site request rejected." }, 403);
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 4000000)
      return json({ error: "Content is too large." }, 413);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Invalid JSON." }, 400);
    }
    if (req.method === "DELETE") {
      const parsed = calendarDeleteSchema.safeParse(body);
      if (!parsed.success)
        return json({ error: parsed.error.issues[0].message }, 400);
      return json(await deletePersonalCalendar(session.userId, parsed.data));
    }
    const parsed = calendarWriteSchema.safeParse(body);
    if (!parsed.success)
      return json({ error: parsed.error.issues[0].message }, 400);
    return json(
      await writePersonalCalendar(
        session.userId,
        parsed.data,
        req.method === "POST"
      )
    );
  } catch (error) {
    if (error instanceof CalendarError)
      return json({ error: error.message }, error.status);
    console.error("Personal calendar request failed", error);
    return json(
      {
        error:
          "Could not reach your calendar. Your draft is kept; please try again.",
      },
      500
    );
  }
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
