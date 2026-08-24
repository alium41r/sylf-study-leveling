import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { SignJWT } from "jose";

/**
 * GET /api/realtime/token
 * Mints a short-lived Supabase-format JWT for the authenticated user so the
 * browser can join Realtime presence + postgres_changes channels as
 * `authenticated` (sub = the app's integer user id).
 *
 * Requires SUPABASE_JWT_SECRET (the "JWT secret" from Supabase → Settings →
 * API). Without it the route reports `enabled: false` and clients gracefully
 * stay on REST polling.
 */
export async function GET(req: NextRequest) {
  if (!process.env.SUPABASE_JWT_SECRET) {
    return NextResponse.json({ enabled: false, reason: "SUPABASE_JWT_SECRET not configured" });
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const payload = await verifyToken(authHeader.split(" ")[1]);
  if (!payload) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
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
    .setExpirationTime("1h")
    .sign(secret);

  return NextResponse.json(
    { enabled: true, token, expiresIn: 3600 },
    { headers: { "Cache-Control": "no-store" } }
  );
}
