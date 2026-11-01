import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { NATIVE_ACCESS_SECONDS, NATIVE_AUDIENCE } from "./native-auth-constants";

export const AUTH_COOKIE_NAME = "hunter_token";

export interface AuthTokenPayload extends JWTPayload {
  userId: number;
  email?: string;
  username?: string;
  name?: string | null;
  scholarId?: string | null;
  verificationStatus?: "UNVERIFIED" | "VERIFIED";
  hunterRank?: string;
  level?: number;
  hasCompletedOnboarding?: boolean;
  hasPassword?: boolean;
  /** Session-revocation counter: getSession rejects tokens whose version no
   *  longer matches the user's current tokenVersion. */
  tokenVersion?: number;
  /** AuthSession id, so one device can be ended on its own. Missing on tokens from before Phase 11. */
  sid?: string;
  timezone?: string;
}

// ─── JWT configuration (S3 hardening) ─────────────────────────────
// Issuer/audience come from environment (with stable defaults) so tokens are
// scoped to this application and cannot be accepted from another issuer.
// JWT_SECRET is REQUIRED: sign/verify fail closed when it is missing.

const JWT_ISSUER = () => process.env.JWT_ISSUER || "sylf";
const JWT_AUDIENCE = () => process.env.JWT_AUDIENCE || "sylf-app";

export function getJwtIssuer(): string {
  return JWT_ISSUER();
}

export function getJwtAudience(): string {
  return JWT_AUDIENCE();
}

export function getAuthSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET is not configured. Refusing to sign or verify session tokens."
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * Signs a new JWT session token with standard 30-day expiration.
 * Adds issuer + audience claims (validated on verify) and carries the
 * user's tokenVersion for revocation.
 */
export async function signToken(
  payload: AuthTokenPayload,
  expiresIn: string = "30d"
): Promise<string> {
  const secret = getAuthSecret();
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(getJwtIssuer())
    .setAudience(getJwtAudience())
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

/**
 * Verifies a JWT token and returns the payload if valid.
 * Enforces signature, issuer, audience and expiration. Returns null on any
 * failure (do not distinguish error types to callers).
 */
export async function verifyToken(token: string): Promise<AuthTokenPayload | null> {
  try {
    const secret = getAuthSecret();
    const { payload } = await jwtVerify(token, secret, {
      issuer: getJwtIssuer(),
      audience: getJwtAudience(),
    });
    if (!payload || !payload.userId) return null;
    return {
      ...payload,
      userId: Number(payload.userId),
    } as AuthTokenPayload;
  } catch {
    return null;
  }
}

/**
 * The native access token (ADR 0009): 15 minutes, its own audience, and only what revocation needs. The audiences do not cross: the cookie
 * path verifies `sylf-app`, this path verifies `sylf-native`, so neither token works in the other's place.
 */
export async function signNativeToken(payload: { userId: number; sid: string; tokenVersion: number }): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(getJwtIssuer())
    .setAudience(NATIVE_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${NATIVE_ACCESS_SECONDS}s`)
    .sign(getAuthSecret());
}

/** Verifies a native access token. `sid` and `tokenVersion` are required: a token that revocation cannot reach is no token at all. */
export async function verifyNativeToken(token: string): Promise<AuthTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret(), { issuer: getJwtIssuer(), audience: NATIVE_AUDIENCE });
    if (!payload.userId || typeof payload.sid !== "string" || !payload.sid || typeof payload.tokenVersion !== "number") return null;
    return { ...payload, userId: Number(payload.userId) } as AuthTokenPayload;
  } catch {
    return null;
  }
}

/** Whether a verified session came through the bearer path. Only verified payloads reach this, so the audience is trustworthy. */
export function isNativeSession(payload: Pick<AuthTokenPayload, "aud">): boolean {
  return payload.aud === NATIVE_AUDIENCE || (Array.isArray(payload.aud) && payload.aud.includes(NATIVE_AUDIENCE));
}

/** The raw bearer credential, unverified. */
export function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  const match = header?.match(/^Bearer ([A-Za-z0-9._~+/-]+=*)$/);
  return match ? match[1] : null;
}

/**
 * A browser, or a page inside one, cannot use the bearer path (ADR 0009 decision 6). Browsers add Sec-Fetch-Site to every request and script
 * cannot remove it, so a leaked native token cannot be replayed from a web page.
 */
export function isBrowserRequest(req: Request): boolean {
  return req.headers.has("sec-fetch-site");
}

/**
 * Pure cookie-only session extraction (no database access). Used by the
 * middleware (edge runtime) and by lib/auth-server as the first step.
 * Browser sessions are cookie-only; the Authorization: Bearer path was
 * removed in S3, and the native path in getSession accepts only native tokens.
 */
export async function getCookieSession(req: Request): Promise<AuthTokenPayload | null> {
  const token = getCookieToken(req);
  return token ? verifyToken(token) : null;
}

/** The raw session cookie, unverified. Only for identifying a token that has already been verified. */
export function getCookieToken(req: Request): string | null {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
  return match ? match.substring(`${AUTH_COOKIE_NAME}=`.length) : null;
}

/**
 * Standard cookie configuration for the session cookie.
 */
export const AUTH_COOKIE_OPTIONS = {
  name: AUTH_COOKIE_NAME,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 30 * 24 * 60 * 60, // 30 days
  path: "/",
};
