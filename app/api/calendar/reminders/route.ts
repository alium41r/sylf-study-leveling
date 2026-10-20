import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { deliverCalendarReminders } from "@/lib/calendar/reminder-service";

export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  const respond = (body: unknown, status = 200) =>
    NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
  try {
    const session = await getSession(req);
    if (!session?.userId) return respond({ error: "Unauthorized" }, 401);
    if (req.headers.get("sec-fetch-site") === "cross-site")
      return respond({ error: "Cross-site request rejected." }, 403);
    return respond(await deliverCalendarReminders(session.userId));
  } catch (error) {
    console.error("Calendar reminders failed", error);
    return respond({ error: "Reminders could not be checked." }, 503);
  }
}
