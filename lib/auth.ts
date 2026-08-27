import { SignJWT, jwtVerify, type JWTPayload } from "jose";

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
 * Pure cookie-only session extraction (no database access). Used by the
 * middleware (edge runtime) and by lib/auth-server as the first step.
 * Browser sessions are cookie-only; the Authorization: Bearer path was
 * removed in S3.
 */
export async function getCookieSession(req: Request): Promise<AuthTokenPayload | null> {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
  if (!match) return null;
  const token = match.substring(`${AUTH_COOKIE_NAME}=`.length);
  return verifyToken(token);
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
