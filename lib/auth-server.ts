// ============================================================================
// Server-only session resolution (S3).
// ============================================================================
// Browser sessions are cookie-only (the Authorization: Bearer fallback was
// removed in S3). In addition to signature/issuer/audience/expiry checks in
// lib/auth, this module enforces SESSION REVOCATION: the token's tokenVersion
// must equal the user's current tokenVersion in the database. logout-all and
// password changes bump tokenVersion, instantly invalidating every previously
// issued token.
//
// This module imports Prisma — it must NEVER be imported by the edge
// middleware (proxy.ts). The middleware uses the pure cookie verification in
// lib/auth only.
// ============================================================================
import { prisma } from "@/lib/prisma";
import { getCookieSession, type AuthTokenPayload } from "@/lib/auth";

/**
 * Server-side session resolution for API routes.
 * Returns the verified payload only when the token is valid AND its
 * tokenVersion matches the user's current value (not revoked).
 */
export async function getSession(req: Request): Promise<AuthTokenPayload | null> {
  const payload = await getCookieSession(req);
  if (!payload) return null;

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { tokenVersion: true },
    });
    if (!user) return null;
    if (user.tokenVersion !== (payload.tokenVersion ?? 1)) return null;
  } catch (err) {
    console.error("[auth-server] tokenVersion check failed:", err);
    // Fail closed on infrastructure errors rather than accepting the token.
    return null;
  }

  return payload;
}
