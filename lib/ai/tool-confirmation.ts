// ============================================================
// Tool Confirmation Tokens — 2-Phase Destructive Mutation Guard
// ============================================================
// Stateless HMAC-signed tokens issued by the tool executor when a
// bulk-destructive tool call needs explicit user confirmation.
// The assistant surfaces the confirmation request to the user and
// echoes the token back on the confirming tool call; the executor
// verifies signature, action binding, user binding and expiry
// before executing any deletion.
// ============================================================

import crypto from "crypto";

const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface ConfirmationPayload {
  action: string;
  userId: number;
  exp: number;
}

function secret(): string {
  // S4: fail closed — no fallback secret. Confirmation tokens simply cannot
  // be minted/verified until a real secret is configured.
  const value = process.env.TOOL_CONFIRMATION_SECRET || process.env.JWT_SECRET;
  if (!value) {
    throw new Error(
      "TOOL_CONFIRMATION_SECRET (or JWT_SECRET) is not configured. Refusing to sign confirmation tokens."
    );
  }
  return value;
}

/**
 * Sign a short-lived confirmation token bound to (action, userId).
 */
export function signConfirmationToken(action: string, userId: number): string {
  const payload = Buffer.from(
    JSON.stringify({ action, userId, exp: Date.now() + TOKEN_TTL_MS })
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

/**
 * Verify a confirmation token: signature, action binding, user
 * binding and expiry must ALL match. Returns false on any mismatch
 * or malformed input — no exceptions escape.
 */
export function verifyConfirmationToken(token: string, action: string, userId: number): boolean {
  try {
    if (typeof token !== "string" || token.length === 0) return false;
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return false;

    const expected = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return false;
    }

    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ConfirmationPayload;
    return (
      typeof data === "object" &&
      data !== null &&
      data.action === action &&
      data.userId === userId &&
      typeof data.exp === "number" &&
      data.exp > Date.now()
    );
  } catch {
    return false;
  }
}
