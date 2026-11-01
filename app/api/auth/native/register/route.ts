import { NextRequest } from "next/server";
import { registrationRefusal } from "@/lib/auth-password";
import { initializeUserProfile } from "@/lib/auth-service";
import { nativeError, nativeJson, nativeUser, refuseBrowser } from "@/lib/auth-native";
import { openNativeSession } from "@/lib/auth-session-service";
import { nativeRegisterRequestSchema } from "@/lib/native-auth-contract";

/** Sylf Native's registration. The profile is made by the same code as the web. It discards the web token and opens a native session instead. */
export async function POST(req: NextRequest) {
  const refused = refuseBrowser(req);
  if (refused) return refused;
  try {
    const refusal = await registrationRefusal(req);
    if (refusal) return nativeError(refusal.status, refusal.status === 429 ? "rate_limited" : "closed", refusal.error, refusal.retryAfterSeconds);
    const parsed = nativeRegisterRequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return nativeError(400, "invalid_request", parsed.error.issues[0]?.message ?? "Invalid data");
    const { clientName, ...profile } = parsed.data;
    const { user } = await initializeUserProfile({ ...profile, isOAuth: false });
    const session = await openNativeSession(user, req, clientName);
    return nativeJson({ session, user: nativeUser(user) }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("already exists") || message.includes("taken")) return nativeError(409, "conflict", message);
    console.error("[auth-native] register failed:", message || "unknown");
    return nativeError(500, "invalid_request", "Internal server error");
  }
}
