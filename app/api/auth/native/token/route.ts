import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { nativeError, nativeJson, nativeUser, redeemNativeOAuthCode, refuseBrowser } from "@/lib/auth-native";
import { openNativeSession, rotateNativeSession } from "@/lib/auth-session-service";
import { getClientIp, ipKey, rateLimit } from "@/lib/rate-limit";
import { nativeTokenRequestSchema } from "@/lib/native-auth-contract";

const ENDED = "This session has ended. Sign in again.";

/** Trades a refresh token, or a one-time OAuth code with its verifier, for fresh credentials. Reads no cookie. */
export async function POST(req: NextRequest) {
  const refused = refuseBrowser(req);
  if (refused) return refused;
  try {
    const limit = await rateLimit(`native-token:ip:${ipKey(getClientIp(req))}`, { limit: 60, windowMs: 60_000 });
    if (!limit.allowed) return nativeError(429, "rate_limited", "Too many requests. Please wait a minute.", limit.retryAfterSeconds);
    const parsed = nativeTokenRequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return nativeError(400, "invalid_request", "Invalid data");
    if (parsed.data.grant === "refresh") {
      const session = await rotateNativeSession(parsed.data.refreshToken);
      return session ? nativeJson({ session }) : nativeError(401, "session_ended", ENDED);
    }
    const userId = await redeemNativeOAuthCode(parsed.data.code, parsed.data.verifier);
    if (!userId) return nativeError(401, "invalid_credentials", "This sign-in link has expired. Try again.");
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return nativeError(401, "invalid_credentials", "This sign-in link has expired. Try again.");
    const session = await openNativeSession(user, req, parsed.data.clientName);
    return nativeJson({ session, user: nativeUser(user) });
  } catch (error) {
    console.error("[auth-native] token failed:", error instanceof Error ? error.message : "unknown");
    return nativeError(500, "invalid_request", "Internal server error");
  }
}
