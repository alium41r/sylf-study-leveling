import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth-server";
import { CalendarError } from "@/lib/calendar/personal-service";
import {
  sharedCatalog,
  changeSharedCalendar,
} from "@/lib/calendar/shared-service";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
async function handle(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return json({ error: "Unauthorized" }, 401);
  try {
    if (req.method === "GET")
      return json({ calendars: await sharedCatalog(session.userId, true) });
    if (req.headers.get("sec-fetch-site") === "cross-site")
      return json({ error: "Cross-site request rejected." }, 403);
    const text = await req.text();
    if (text.length > 6000) return json({ error: "Request too large." }, 413);
    return json(await changeSharedCalendar(session.userId, JSON.parse(text)));
  } catch (error) {
    return json(
      {
        error:
          error instanceof CalendarError
            ? error.message
            : error instanceof z.ZodError
              ? "Check the sharing details."
              : "Sharing could not be updated. Reload before trying again.",
      },
      error instanceof CalendarError
        ? error.status
        : error instanceof z.ZodError || error instanceof SyntaxError
          ? 400
          : 503
    );
  }
}
export { handle as GET, handle as POST };
