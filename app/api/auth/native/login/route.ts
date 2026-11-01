import { NextRequest } from "next/server";
import { authenticatePassword } from "@/lib/auth-password";
import { nativeError, nativeJson, nativeUser, refuseBrowser } from "@/lib/auth-native";
import { openNativeSession } from "@/lib/auth-session-service";
import { nativeLoginRequestSchema } from "@/lib/native-auth-contract";

/** Sylf Native's password sign-in. The same check as the web, answered with tokens and never a cookie. */
export async function POST(req: NextRequest) {
  const refused = refuseBrowser(req);
  if (refused) return refused;
  try {
    const parsed = nativeLoginRequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return nativeError(400, "invalid_request", "Invalid data");
    const attempt = await authenticatePassword(req, parsed.data.identifier, parsed.data.password);
    if (!attempt.ok) return nativeError(attempt.status, attempt.status === 429 ? "rate_limited" : "invalid_credentials", attempt.error, attempt.retryAfterSeconds);
    const session = await openNativeSession(attempt.user, req, parsed.data.clientName);
    return nativeJson({ session, user: nativeUser(attempt.user) });
  } catch (error) {
    console.error("[auth-native] login failed:", error instanceof Error ? error.message : "unknown");
    return nativeError(500, "invalid_request", "Internal server error");
  }
}
