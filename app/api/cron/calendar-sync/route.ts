import { NextRequest, NextResponse } from "next/server";
import { equalSecret } from "@/lib/calendar/external/security";
import { runCalendarSyncBatch } from "@/lib/calendar/external/worker";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret)
    return NextResponse.json(
      { error: "Calendar sync scheduler is not configured." },
      { status: 503 }
    );
  if (!equalSecret(req.headers.get("authorization") || "", `Bearer ${secret}`))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await runCalendarSyncBatch());
}
