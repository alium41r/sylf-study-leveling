// ============================================================================
// Six-digit security codes for irreversible actions (reset progress, delete account).
// ============================================================================
// A code is small enough to guess, so it is drawn from the system's secure source and it survives only a few wrong tries. Those are counted
// per user and action, and passing the limit destroys the code, so it holds even when the counter falls back to one server's memory:
// the send route allows three codes per ten minutes, which bounds guessing at about 15 tries in ten minutes against 900,000 values.
//
// `token` is unique across all users, so two people can draw the same code. That is retried here and is never shown to anyone.
// ============================================================================
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

export type SecurityAction = "RESET_PROGRESS" | "DELETE_ACCOUNT";

const CODE_LIFETIME_MS = 10 * 60 * 1000;
const WRONG_ATTEMPTS = 5;
const DRAWS = 8;

// By code, not instanceof: lib/prisma.ts can reload the client in development, and the error class goes with it.
const collided = (error: unknown) => (error as { code?: string } | null)?.code === "P2002";

/** Replaces this user's code for this action and returns the new one. */
export async function issueSecurityCode(userId: number, action: SecurityAction): Promise<string> {
  await prisma.verificationToken.deleteMany({ where: { userId, token: { startsWith: `${action}:` } } });
  for (let draw = 1; ; draw++) {
    const code = crypto.randomInt(100000, 1000000).toString();
    try {
      await prisma.verificationToken.create({ data: { userId, token: `${action}:${code}`, expiresAt: new Date(Date.now() + CODE_LIFETIME_MS) } });
      return code;
    } catch (error) {
      if (!collided(error) || draw >= DRAWS) throw error;
    }
  }
}

export type SecurityCodeCheck = { valid: true; tokenId: number } | { valid: false; retryAfterSeconds?: number };

/** Looks a code up for one user only. Too many misses destroy the code, so a right guess afterwards finds nothing. */
export async function checkSecurityCode(userId: number, action: SecurityAction, code: string): Promise<SecurityCodeCheck> {
  const found = await prisma.verificationToken.findFirst({
    where: { userId, token: `${action}:${code}`, expiresAt: { gt: new Date() } },
  });
  if (found) return { valid: true, tokenId: found.id };
  const attempts = await rateLimit(`otp-verify:${action}:${userId}`, { limit: WRONG_ATTEMPTS, windowMs: CODE_LIFETIME_MS });
  if (attempts.allowed) return { valid: false };
  await prisma.verificationToken.deleteMany({ where: { userId, token: { startsWith: `${action}:` } } });
  return { valid: false, retryAfterSeconds: attempts.retryAfterSeconds };
}
