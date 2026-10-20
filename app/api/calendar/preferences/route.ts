import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import {
  defaultCalendarPreferences,
  preferenceWriteSchema,
  preferencesSchema,
} from "@/lib/calendar/preferences";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
async function handle(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session?.userId) return json({ error: "Unauthorized" }, 401);
    if (req.method === "GET") {
      const row = await prisma.calendarPreference.findUnique({
        where: { userId: session.userId },
      });
      return json({
        settings: row
          ? preferencesSchema.parse(row.settings)
          : defaultCalendarPreferences,
        revision: row?.revision || 0,
      });
    }
    if (req.headers.get("sec-fetch-site") === "cross-site")
      return json({ error: "Cross-site request rejected." }, 403);
    const raw = await req.text();
    if (raw.length > 5000)
      return json({ error: "Settings are too large." }, 413);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Invalid JSON." }, 400);
    }
    const parsed = preferenceWriteSchema.safeParse(body);
    if (!parsed.success)
      return json({ error: "Check your calendar preferences." }, 400);
    const result = await prisma.$transaction(async (tx) => {
      const previous = await tx.calendarPreference.findUnique({
        where: { userId: session.userId },
      });
      const settings = preferencesSchema.parse({
        ...((previous?.settings as object) || defaultCalendarPreferences),
        ...parsed.data.patch,
      });
      if (!previous) {
        if (parsed.data.revision !== 0) return null;
        const created = await tx.calendarPreference.createMany({
          data: [{ userId: session.userId, settings }],
          skipDuplicates: true,
        });
        return created.count ? { settings, revision: 1 } : null;
      }
      const updated = await tx.calendarPreference.updateMany({
        where: { userId: session.userId, revision: parsed.data.revision },
        data: { settings, revision: { increment: 1 } },
      });
      return updated.count
        ? { settings, revision: previous.revision + 1 }
        : null;
    });
    return result
      ? json(result)
      : json(
          {
            error: "Calendar settings changed elsewhere. Reload and try again.",
          },
          409
        );
  } catch {
    return json({ error: "Calendar settings could not be saved." }, 503);
  }
}
export { handle as GET, handle as PATCH };
