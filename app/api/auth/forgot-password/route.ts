import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { rateLimit, getClientIp, ipKey } from "@/lib/rate-limit";
import { requestPasswordReset } from "@/lib/password-reset";

const NEUTRAL = { message: "If an account uses that email address, a link to choose a new password is on its way. It works once, for 30 minutes." };

const bodySchema = z.object({ email: z.string().trim().min(3).max(254).email() });

/**
 * POST /api/auth/forgot-password. Unauthenticated, and neutral: the answer is the same whether or not an account matches. The work happens after the
 * answer is sent, so how long it takes says nothing either. Limited by address and by the email asked about, and a limit on the email is also silent.
 */
export async function POST(req: NextRequest) {
  const ip = await rateLimit(`reset:ip:${ipKey(getClientIp(req))}`, { limit: 5, windowMs: 15 * 60_000 });
  if (!ip.allowed) return NextResponse.json({ error: "Too many requests. Please wait a few minutes." }, { status: 429, headers: { "Retry-After": String(ip.retryAfterSeconds) } });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the email address you signed up with." }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  const perEmail = await rateLimit(`reset:email:${ipKey(email)}`, { limit: 3, windowMs: 30 * 60_000 });
  if (perEmail.allowed) after(() => requestPasswordReset(req, email));
  return NextResponse.json(NEUTRAL, { status: 200, headers: { "Cache-Control": "no-store" } });
}
