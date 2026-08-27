import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { SignJWT } from "jose";

/**
 * GET /api/realtime/token
 * Mints a short-lived Supabase-format JWT for the authenticated user so the
 * browser can join Realtime presence + postgres_changes channels as
 * `authenticated` (sub = the app's integer user id).
 *
 * S3: authenticates via the httpOnly session cookie (no Bearer header) and
 * the minted token is held in memory only — never localStorage.
 *
 * Requires SUPABASE_JWT_SECRET (the "JWT secret" from Supabase → Settings →
 * API). Without it the route reports `enabled: false` and clients gracefully
 * stay on REST polling.
 */
export async function GET(req: NextRequest) {
  if (!process.env.SUPABASE_JWT_SECRET) {
    return NextResponse.json({ enabled: false, reason: "SUPABASE_JWT_SECRET not configured" });
  }

  const payload = await getSession(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET);

  const token = await new SignJWT({
    // Supabase Realtime requires the authenticated role for postgres_changes;
    // presence works either way. Sub carries the app's integer user id as a
    // string so SQL RLS policies can cast it: (auth.jwt() ->> 'sub')::bigint
    role: "authenticated",
    email: payload.email ?? "",
    username: payload.username ?? "",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(payload.userId))
    .setAudience("authenticated")
    .setIssuer("sylf")
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(secret);

  return NextResponse.json(
    { enabled: true, token, expiresIn: 1800 },
    { headers: { "Cache-Control": "no-store" } }
  );
}
