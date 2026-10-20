import { NextRequest, NextResponse, after } from "next/server";
import { getSession } from "@/lib/auth-server";
import { finishCalendarOAuth } from "@/lib/calendar/external/connections";
import { publicOrigin } from "@/lib/calendar/external/security";
import { runCalendarSyncBatch } from "@/lib/calendar/external/worker";
export const maxDuration = 60;
export async function GET(
  req: NextRequest,
  props: { params: Promise<{ provider: string }> }
) {
  const session = await getSession(req);
  if (!session) return NextResponse.redirect(new URL("/login", req.url));
  const { provider } = await props.params;
  try {
    const state = req.nextUrl.searchParams.get("state"),
      code = req.nextUrl.searchParams.get("code");
    if (!state || !code || state.length > 200 || code.length > 6000)
      throw new Error("Consent cancelled");
    await finishCalendarOAuth(session.userId, req, provider, state, code);
    after(() => runCalendarSyncBatch(session.userId).then(() => {}));
    return NextResponse.redirect(
      `${publicOrigin()}/calendar?connections=connected`
    );
  } catch {
    return NextResponse.redirect(
      new URL("/calendar?connections=failed", req.url)
    );
  }
}
