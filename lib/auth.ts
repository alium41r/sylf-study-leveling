import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { type NextRequest } from "next/server";

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
  tokenVersion?: number;
  timezone?: string;
}

export function getAuthSecret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.JWT_SECRET || "hunter-system-secret-key-change-in-production"
  );
}

/**
 * Signs a new JWT session token with standard 30-day expiration.
 */
export async function signToken(
  payload: AuthTokenPayload,
  expiresIn: string = "30d"
): Promise<string> {
  const secret = getAuthSecret();
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

/**
 * Verifies a JWT token and returns the payload if valid.
 */
export async function verifyToken(token: string): Promise<AuthTokenPayload | null> {
  try {
    const secret = getAuthSecret();
    const { payload } = await jwtVerify(token, secret);
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
 * Extracts and verifies session token from either:
 * 1. Authorization: Bearer <token> header
 * 2. system_token cookie
 */
export async function getSession(
  req: NextRequest | Request
): Promise<AuthTokenPayload | null> {
  // 1. Check HTTP-only Cookie first (authoritative source for browser sessions)
  if ("cookies" in req && typeof req.cookies?.get === "function") {
    const cookieVal = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    if (cookieVal) {
      const payload = await verifyToken(cookieVal);
      if (payload) return payload;
    }
  } else {
    // Standard Request cookies header fallback
    const cookieHeader = req.headers.get("cookie");
    if (cookieHeader) {
      const match = cookieHeader
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
      if (match) {
        const token = match.substring(`${AUTH_COOKIE_NAME}=`.length);
        const payload = await verifyToken(token);
        if (payload) return payload;
      }
    }
  }

  // 2. Fallback to Authorization: Bearer <token> header (for API callers & integration tests)
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1]?.trim();
    if (token) {
      const payload = await verifyToken(token);
      if (payload) return payload;
    }
  }

  return null;
}

/**
 * Standard cookie configuration for the system_token cookie.
 */
export const AUTH_COOKIE_OPTIONS = {
  name: AUTH_COOKIE_NAME,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 30 * 24 * 60 * 60, // 30 days
  path: "/",
};
