import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit, getClientIp, ipKey } from "@/lib/rate-limit";
import { completePasswordReset } from "@/lib/password-reset";

const bodySchema = z.object({ token: z.string().min(20).max(200), password: z.string().min(1).max(200) });

/** POST /api/auth/reset-password. The link's token and a new password. The token works once, and a success signs every device out. */
export async function POST(req: NextRequest) {
  const ip = await rateLimit(`reset-use:ip:${ipKey(getClientIp(req))}`, { limit: 10, windowMs: 15 * 60_000 });
  if (!ip.allowed) return NextResponse.json({ error: "Too many attempts. Please wait a few minutes." }, { status: 429, headers: { "Retry-After": String(ip.retryAfterSeconds) } });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "This link isn't valid. Ask for a new one." }, { status: 400 });
  const outcome = await completePasswordReset(parsed.data.token, parsed.data.password);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ message: "Your password is changed. Sign in with it." }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
