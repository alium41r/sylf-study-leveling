import { NextRequest, after } from "next/server";
import { receiveCalendarNotification } from "@/lib/calendar/external/notifications";
import { runCalendarSyncBatch } from "@/lib/calendar/external/worker";
export const maxDuration = 60;
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ provider: string }> }
) {
  const { provider } = await props.params;
  if (!["google", "microsoft"].includes(provider))
    return new Response(null, { status: 404 });
  const validation = req.nextUrl.searchParams.get("validationToken");
  if (provider === "microsoft" && validation && validation.length <= 1024)
    return new Response(validation, {
      headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
    });
  if (Number(req.headers.get("content-length") || 0) > 100000)
    return new Response(null, { status: 413 });
  try {
    const text = provider === "microsoft" ? await req.text() : "";
    if (text.length > 100000) return new Response(null, { status: 413 });
    const owners = await receiveCalendarNotification(
      provider,
      req.headers,
      text ? JSON.parse(text) : {}
    );
    if (owners.length)
      after(async () => {
        // All authenticated notices are durably queued. Drain one owner here;
        // the secured scheduler drains the remainder within request limits.
        await runCalendarSyncBatch(owners[0], 20000);
      });
    return new Response(null, { status: 202 });
  } catch {
    return new Response(null, { status: 503 });
  }
}
