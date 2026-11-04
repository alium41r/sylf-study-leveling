// ============================================================================
// Password reset: a neutral request, and a single-use 30 minute link.
// ============================================================================
// The request answers the same way whether or not an account matches, so it cannot be used to find out who has one. The token is random, only its
// hash is stored, it works once, and using it signs every device out. Only an account that has a password can be reset this way: an account made with
// Google or Apple has none to forget, and giving it one by email alone would change how it is protected.
// ============================================================================
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { clearAuthSessions } from "@/lib/auth-session-service";
import { sendPasswordChangedNotice, sendPasswordResetEmail } from "@/lib/email";

export const RESET_ACTION = "RESET_PASSWORD";
export const RESET_TTL_MS = 30 * 60_000;
export const MIN_PASSWORD_LENGTH = 6;

const digest = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

/**
 * Where the link points. It comes from configuration, never from the request's own Host header, which a caller controls and could use to send a victim
 * a link to somewhere else. Development may fall back to the request, and production without configuration sends no link at all.
 */
export function publicOrigin(request: Request): string | null {
  const configured = process.env.APP_PUBLIC_URL?.trim() || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  if (configured) {
    try { const url = new URL(configured); return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null; } catch { return null; }
  }
  return process.env.NODE_ENV === "production" ? null : new URL(request.url).origin;
}

/** Issues a link and mails it, when there is an account that can use one. Never throws, and says nothing about whether it did anything. */
export async function requestPasswordReset(request: Request, email: string): Promise<void> {
  try {
    const user = await prisma.user.findFirst({ where: { email: { equals: email.trim(), mode: "insensitive" } }, select: { id: true, email: true, name: true, password: true } });
    if (!user?.password) return;
    const origin = publicOrigin(request);
    if (!origin) { console.warn("[password-reset] APP_PUBLIC_URL is not set, so no link was sent."); return; }
    const token = crypto.randomBytes(32).toString("base64url");
    await prisma.$transaction([
      prisma.verificationToken.deleteMany({ where: { userId: user.id, action: RESET_ACTION } }),
      prisma.verificationToken.create({ data: { userId: user.id, token: digest(token), action: RESET_ACTION, expiresAt: new Date(Date.now() + RESET_TTL_MS) } }),
    ]);
    await sendPasswordResetEmail({ to: user.email, name: user.name, url: `${origin}/reset-password#token=${token}` });
  } catch (error) {
    console.error("[password-reset] request failed:", error instanceof Error ? error.message : "unknown");
  }
}

export type ResetOutcome = { ok: true } | { ok: false; status: 400; error: string };
const INVALID: ResetOutcome = { ok: false, status: 400, error: "This link has expired or was already used. Ask for a new one." };

/**
 * Uses the link once. Deleting the token is the claim: two requests with the same token cannot both succeed, because only one delete finds a row. The
 * new password, the revoked sessions and the used token all land in one transaction, or none of them do.
 */
export async function completePasswordReset(token: string, password: string): Promise<ResetOutcome> {
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return INVALID;
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) return { ok: false, status: 400, error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  if (password.length > 200) return { ok: false, status: 400, error: "That password is too long." };
  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.$transaction(async (tx) => {
    const row = await tx.verificationToken.findUnique({ where: { token: digest(token) } });
    if (!row || row.action !== RESET_ACTION || row.expiresAt.getTime() <= Date.now()) return null;
    const claimed = await tx.verificationToken.deleteMany({ where: { id: row.id } });
    if (claimed.count !== 1) return null;
    await tx.verificationToken.deleteMany({ where: { userId: row.userId, action: RESET_ACTION } });
    // A new password invalidates every token already issued, on every device.
    return tx.user.update({ where: { id: row.userId }, data: { password: hashed, tokenVersion: { increment: 1 } }, select: { id: true, email: true, name: true } });
  });
  if (!user) return INVALID;
  await clearAuthSessions(user.id);
  await sendPasswordChangedNotice({ to: user.email, name: user.name }).catch(() => undefined);
  return { ok: true };
}
