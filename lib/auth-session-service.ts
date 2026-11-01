// ============================================================================
// Device sessions (Phase 11). AuthSession is the one record of who is signed in where.
// ============================================================================
// A session token carries `sid`, the id of its AuthSession row, and keeps it when a route reissues the token after a profile change.
// `getSession` rejects a token whose row is gone or has reached `expiresAt`, so ending a device takes effect on its next request.
// tokenVersion stays the account-wide switch: logout-all and a password change still end everything at once.
//
// Tokens issued before this have no `sid`. They are found by the hash of the token instead, and a row they do not have allows them, so
// nobody was signed out by the change. Those tokens expire within 30 days, and `tokenHash` is then only a tombstone.
//
// Recording a session is best effort: a sign-in must not fail because a device row could not be written. Such a token has no `sid`, and
// behaves like an older token. Revocation checks are not best effort: `getSession` fails closed.
//
// Native sign-ins (ADR 0009) are rows here too: `kind: NATIVE`, with a rotating refresh token kept only as a hash. Unlike a browser row, a native
// row is required: it is the only thing that can revoke the token, so a native sign-in that cannot write one fails.
// ============================================================================
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS, getCookieToken, isNativeSession, signNativeToken, signToken, verifyToken, type AuthTokenPayload } from "@/lib/auth";
import { hashToken, parseUserAgent } from "@/lib/session-service";
import { getClientIp } from "@/lib/rate-limit";
import { NATIVE_ACCESS_SECONDS, NATIVE_REFRESH_GRACE_SECONDS, type NativeSession } from "@/lib/native-auth-contract";

const SESSION_LIFETIME_MS = AUTH_COOKIE_OPTIONS.maxAge * 1000;
/** A revoked older token stays valid to its signature for up to 30 days, so its tombstone must outlive that. */
const TOMBSTONE_MS = SESSION_LIFETIME_MS + 24 * 60 * 60 * 1000;

const expiry = (now = Date.now()) => new Date(now + SESSION_LIFETIME_MS);

/** Records a sign-in and returns the session id for the token. Undefined when it could not be written. */
export async function openAuthSession(userId: number, req: Request): Promise<string | undefined> {
  try {
    const userAgent = req.headers.get("user-agent") || "";
    const { device, platform } = parseUserAgent(userAgent);
    const ip = getClientIp(req);
    const row = await prisma.authSession.create({
      data: { userId, kind: "BROWSER", device, platform, userAgent, ipAddress: ip === "unknown" ? null : ip, expiresAt: expiry() },
      select: { id: true },
    });
    return row.id;
  } catch (error) {
    console.warn("[auth-session] sign-in recorded without a device row:", error instanceof Error ? error.message : "unknown");
    return undefined;
  }
}

/** What identifies the session a verified token belongs to. */
export const sessionLookup = (payload: AuthTokenPayload, token: string) => {
  if (isNativeSession(payload)) return { id: payload.sid, kind: "NATIVE" };
  return payload.sid ? { id: payload.sid } : { tokenHash: hashToken(token) };
};

/** The revocation rule, in one place. `row` is the session a token resolved to, or undefined. */
export function authSessionAllows(payload: AuthTokenPayload, row: { expiresAt: Date | null } | undefined, now = new Date()): boolean {
  if (!row) return !payload.sid;
  return !row.expiresAt || row.expiresAt > now;
}

/** Signs a replacement for the current token, keeping the same device session. */
export async function reissueToken(current: AuthTokenPayload, payload: AuthTokenPayload): Promise<string> {
  const token = await signToken({ ...payload, ...(current.sid ? { sid: current.sid } : {}) });
  if (current.sid) {
    try { await prisma.authSession.updateMany({ where: { id: current.sid, userId: current.userId }, data: { expiresAt: expiry(), lastActiveAt: new Date() } }); }
    catch { console.warn("[auth-session] could not extend a device session."); }
  }
  return token;
}

/**
 * Answers a route that has just changed something a session token carries. A browser gets a fresh cookie. A native client never gets one
 * (ADR 0009 decision 14): its next refresh picks the change up, and this only records the version it may refresh against, so the device
 * changing a password keeps its session while every other device loses theirs.
 */
export async function attachReissuedSession(response: NextResponse, current: AuthTokenPayload, payload: AuthTokenPayload): Promise<void> {
  if (isNativeSession(current)) {
    // The change has committed by now, so a failure here must not read as if it had not. This device would sign in again, and nothing leaks.
    try { await prisma.authSession.updateMany({ where: { id: current.sid, userId: current.userId, kind: "NATIVE" }, data: { tokenVersion: payload.tokenVersion ?? 1, lastActiveAt: new Date() } }); }
    catch { console.warn("[auth-session] could not carry a native session across a change."); }
    return;
  }
  response.cookies.set({ ...AUTH_COOKIE_OPTIONS, value: await reissueToken(current, payload) });
}

/** Clears the session cookie. A native client must never see a Set-Cookie: `session` says who this was, and with none, only a request that sent a cookie needs one cleared. */
export function expireSessionCookie(response: NextResponse, req: Request, session?: AuthTokenPayload): void {
  if (session ? isNativeSession(session) : !getCookieToken(req)) return;
  response.cookies.set(AUTH_COOKIE_NAME, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 0, path: "/" });
}

/** Ends one device by its row. Keeps the row as a tombstone, because an older token is only stopped by finding it. */
export async function endAuthSession(userId: number, id: string): Promise<boolean> {
  const result = await prisma.authSession.updateMany({ where: { id, userId }, data: { expiresAt: new Date() } });
  return result.count === 1;
}

/** Ends the device behind this request's cookie. Used by logout, so it verifies the token and never throws. */
export async function endCurrentAuthSession(req: Request): Promise<void> {
  try {
    const token = getCookieToken(req);
    const payload = token ? await verifyToken(token) : null;
    if (!token || !payload) return;
    if (payload.sid) { await endAuthSession(payload.userId, payload.sid); return; }
    const tokenHash = hashToken(token); const now = new Date();
    await prisma.authSession.upsert({ where: { tokenHash }, update: { expiresAt: now }, create: { userId: payload.userId, tokenHash, expiresAt: now } });
  } catch {
    console.warn("[auth-session] could not record a logout.");
  }
}

const sameHash = (left: string, right: string | null | undefined) => !!right && left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right));

/** `<session id>.<256 random bits>`. The id lets a stale token find its row, which is what makes reuse detectable however old the token is. */
const newRefreshToken = (sessionId: string) => `${sessionId}.${randomBytes(32).toString("base64url")}`;
const sessionIdOf = (refreshToken: string) => { const dot = refreshToken.indexOf("."); return dot > 0 ? refreshToken.slice(0, dot) : null; };

async function nativeCredentials(sessionId: string, userId: number, tokenVersion: number, refreshToken: string): Promise<NativeSession> {
  return { accessToken: await signNativeToken({ userId, sid: sessionId, tokenVersion }), accessExpiresAt: Date.now() + NATIVE_ACCESS_SECONDS * 1000, refreshToken, sessionId, userId };
}

/** Opens a native device session. Throws if the row cannot be written: unlike a browser, native has no older-token path to fall back on. */
export async function openNativeSession(user: { id: number; tokenVersion: number }, req: Request, clientName: string): Promise<NativeSession> {
  const sessionId = randomBytes(16).toString("hex");
  const refreshToken = newRefreshToken(sessionId);
  const userAgent = req.headers.get("user-agent") || "";
  const ip = getClientIp(req);
  await prisma.authSession.create({
    data: { id: sessionId, userId: user.id, kind: "NATIVE", clientName, device: clientName, platform: "Sylf app", userAgent, ipAddress: ip === "unknown" ? null : ip,
      refreshHash: hashToken(refreshToken), tokenVersion: user.tokenVersion, expiresAt: expiry() },
  });
  return nativeCredentials(sessionId, user.id, user.tokenVersion, refreshToken);
}

/**
 * Rotates a refresh token (ADR 0009 decision 8). The current token rotates. The one before it works once more, for 60 seconds, because a
 * response can be lost in transit. Anything else means two holders, one of them a thief, so the session ends. Returns null when refused.
 * Both writes are conditional on the hash they read, so racing callers cannot both move the same token forward.
 */
export async function rotateNativeSession(refreshToken: string): Promise<NativeSession | null> {
  const sessionId = sessionIdOf(refreshToken);
  if (!sessionId) return null;
  const presented = hashToken(refreshToken);
  for (let attempt = 0; attempt < 2; attempt++) {
    const row = await prisma.authSession.findFirst({
      where: { id: sessionId, kind: "NATIVE" },
      select: { id: true, userId: true, refreshHash: true, previousRefreshHash: true, rotatedAt: true, expiresAt: true, tokenVersion: true, user: { select: { tokenVersion: true } } },
    });
    if (!row) return null;
    const now = new Date();
    if (!row.expiresAt || row.expiresAt <= now) return null;
    // A version that moved means the account said "everyone out", and refresh answers to that like every other path.
    if (row.tokenVersion !== row.user.tokenVersion) { await endAuthSession(row.userId, row.id); return null; }
    const next = newRefreshToken(row.id);
    const renewed = { refreshHash: hashToken(next), expiresAt: expiry(now.getTime()), lastActiveAt: now };
    const live = { id: row.id, expiresAt: { gt: now } };
    if (sameHash(presented, row.refreshHash)) {
      const moved = await prisma.authSession.updateMany({ where: { ...live, refreshHash: presented }, data: { ...renewed, previousRefreshHash: presented, rotatedAt: now } });
      if (moved.count === 1) return nativeCredentials(row.id, row.userId, row.user.tokenVersion, next);
      continue; // Another caller moved it first. Read again: this token is now the previous one.
    }
    const inGrace = row.rotatedAt && now.getTime() - row.rotatedAt.getTime() <= NATIVE_REFRESH_GRACE_SECONDS * 1000;
    if (inGrace && sameHash(presented, row.previousRefreshHash)) {
      // Clearing the previous hash and leaving rotatedAt alone is what makes this once only, within the original window.
      const moved = await prisma.authSession.updateMany({ where: { ...live, previousRefreshHash: presented }, data: { ...renewed, previousRefreshHash: null } });
      if (moved.count === 1) return nativeCredentials(row.id, row.userId, row.user.tokenVersion, next);
      continue;
    }
    await endAuthSession(row.userId, row.id);
    return null;
  }
  return null;
}

/** Signs one device out. Answers to its refresh token, so an expired access token can still end it. A token that does not match changes nothing. */
export async function endNativeSession(refreshToken: string): Promise<void> {
  const sessionId = sessionIdOf(refreshToken);
  if (!sessionId) return;
  const presented = hashToken(refreshToken);
  await prisma.authSession.updateMany({ where: { id: sessionId, kind: "NATIVE", OR: [{ refreshHash: presented }, { previousRefreshHash: presented }] }, data: { expiresAt: new Date() } });
}

/** Removes every device row but one. tokenVersion has already ended them, so this only tidies the list. */
export async function clearAuthSessions(userId: number, keepId?: string): Promise<void> {
  try { await prisma.authSession.deleteMany({ where: { userId, ...(keepId ? { id: { not: keepId } } : {}) } }); }
  catch { console.warn("[auth-session] could not tidy device sessions."); }
}

/** Drops tombstones nothing can present any more. */
export async function pruneAuthSessions(userId: number): Promise<void> {
  try { await prisma.authSession.deleteMany({ where: { userId, expiresAt: { lt: new Date(Date.now() - TOMBSTONE_MS) } } }); }
  catch { console.warn("[auth-session] could not prune device sessions."); }
}
