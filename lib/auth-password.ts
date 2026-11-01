// ============================================================================
// Password sign-in and the registration gate, shared by the web and native routes (ADR 0009 decision 7).
// ============================================================================
// The rate limits, prelaunch rule and error messages exist once. Each route only decides what a success means for its kind of client.
// ============================================================================
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { isPrelaunchMode } from "@/lib/prelaunch";
import { rateLimit, getClientIp, ipKey } from "@/lib/rate-limit";

export interface AuthRefusal { status: number; error: string; retryAfterSeconds?: number }
type PasswordResult = { ok: true; user: NonNullable<Awaited<ReturnType<typeof findAccount>>> } | ({ ok: false } & AuthRefusal);

function findAccount(loginTarget: string) {
  return prisma.user.findFirst({
    where: {
      OR: [
        { email: { equals: loginTarget, mode: "insensitive" } },
        { username: { equals: loginTarget, mode: "insensitive" } },
      ],
    },
  });
}

/** The whole of a password check: per-address and per-account limits, the lookup, and bcrypt. */
export async function authenticatePassword(req: Request, loginTarget: string, password: string): Promise<PasswordResult> {
  // S4: brute-force protection — per-IP window plus per-identifier window.
  const ipLimit = await rateLimit(`login:ip:${ipKey(getClientIp(req))}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!ipLimit.allowed) return { ok: false, status: 429, error: "Too many login attempts. Please wait a minute.", retryAfterSeconds: ipLimit.retryAfterSeconds };

  const idLimit = await rateLimit(`login:id:${ipKey(loginTarget.toLowerCase())}`, {
    limit: 10,
    windowMs: 15 * 60_000,
  });
  if (!idLimit.allowed) return { ok: false, status: 429, error: "Too many login attempts for this account. Please wait a few minutes.", retryAfterSeconds: idLimit.retryAfterSeconds };

  // Find user by email OR username (case-insensitive)
  const user = await findAccount(loginTarget);
  if (!user) return { ok: false, status: 401, error: "Invalid credentials" };

  // Handle OAuth-only accounts without passwords
  if (!user.password) return { ok: false, status: 401, error: "This account was registered with Google or GitHub. Please sign in with OAuth." };

  // Verify password
  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) return { ok: false, status: 401, error: "Invalid credentials" };

  return { ok: true, user };
}

/** Why registration is closed for this request, if it is. Prelaunch lockdown first, then the per-address throttle. */
export async function registrationRefusal(req: Request): Promise<AuthRefusal | null> {
  // Prelaunch lockdown: no new accounts while the landing page is live.
  if (isPrelaunchMode()) {
    return { status: 403, error: "Registration is closed right now. Join the waitlist and we'll email you when the app is ready." };
  }

  // S4: per-IP registration throttle (account-farming friction).
  const ipLimit = await rateLimit(`register:ip:${ipKey(getClientIp(req))}`, {
    limit: 5,
    windowMs: 15 * 60_000,
  });
  if (!ipLimit.allowed) return { status: 429, error: "Too many registration attempts. Please wait a few minutes.", retryAfterSeconds: ipLimit.retryAfterSeconds };
  return null;
}
