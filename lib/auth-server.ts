// ============================================================================
// Server-only session resolution (S3).
// ============================================================================
// Browser sessions are cookie-only (the Authorization: Bearer fallback was
// removed in S3). In addition to signature/issuer/audience/expiry checks in
// lib/auth, this module enforces SESSION REVOCATION: the token's tokenVersion
// must equal the user's current tokenVersion in the database. logout-all and
// password changes bump tokenVersion, instantly invalidating every previously
// issued token. One device is ended through its AuthSession row
// (lib/auth-session-service).
//
// Sylf Native (ADR 0009) is the one bearer client. Its branch sits here so that
// it runs exactly the same revocation check, and a route cannot forget it. It
// accepts only a native token, and only when the request carries no session
// cookie and did not come from a browser. A web token is never a bearer token.
//
// This module imports Prisma — it must NEVER be imported by the edge
// middleware (proxy.ts). The middleware uses the pure cookie verification in
// lib/auth only.
// ============================================================================
import { prisma } from "@/lib/prisma";
import { getBearerToken, getCookieSession, getCookieToken, isBrowserRequest, verifyNativeToken, type AuthTokenPayload } from "@/lib/auth";
import { authSessionAllows, sessionLookup } from "@/lib/auth-session-service";
import { primeUserTimezoneCache } from "@/lib/timezone-server";

const inflightSessionByRequest = new WeakMap<Request, Promise<AuthTokenPayload | null>>();

/**
 * Server-side session resolution for API routes.
 * Returns the verified payload only when the token is valid, its tokenVersion
 * matches the user's current value, and its device session has not been ended.
 * Concurrent calls on the same Request instance share a single in-flight lookup.
 */
export async function getSession(req: Request): Promise<AuthTokenPayload | null> {
  if (req && typeof req === "object") {
    const existing = inflightSessionByRequest.get(req);
    if (existing) return existing;
    const promise = resolveSessionInternal(req).finally(() => {
      inflightSessionByRequest.delete(req);
    });
    inflightSessionByRequest.set(req, promise);
    return promise;
  }
  return resolveSessionInternal(req);
}

async function resolveSessionInternal(req: Request): Promise<AuthTokenPayload | null> {
  const payload = (await getCookieSession(req)) ?? (await getNativeSession(req));
  if (!payload) return null;

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        tokenVersion: true,
        timezone: true,
        authSessions: { where: sessionLookup(payload, getCookieToken(req) ?? ""), select: { expiresAt: true }, take: 1 },
      },
    });
    if (!user) return null;
    if (user.tokenVersion !== (payload.tokenVersion ?? 1)) return null;
    if (!authSessionAllows(payload, user.authSessions?.[0])) return null;
    if (typeof (user as { timezone?: string | null }).timezone === "string") {
      primeUserTimezoneCache(payload.userId, (user as { timezone?: string | null }).timezone);
    }
  } catch (err) {
    console.error("[auth-server] tokenVersion check failed:", err);
    // Fail closed on infrastructure errors rather than accepting the token.
    return null;
  }

  return payload;
}

/** The bearer path. A cookie wins when both arrive, valid or not, so a bad cookie cannot fall through to a stale bearer token. */
async function getNativeSession(req: Request): Promise<AuthTokenPayload | null> {
  if (getCookieToken(req) || isBrowserRequest(req)) return null;
  const token = getBearerToken(req);
  return token ? verifyNativeToken(token) : null;
}
