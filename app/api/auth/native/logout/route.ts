import { NextRequest } from "next/server";
import { nativeError, nativeJson, refuseBrowser } from "@/lib/auth-native";
import { endNativeSession } from "@/lib/auth-session-service";
import { nativeLogoutRequestSchema } from "@/lib/native-auth-contract";

/** Ends this device. It answers the same whether or not the token matched, so it cannot be used to test one. */
export async function POST(req: NextRequest) {
  const refused = refuseBrowser(req);
  if (refused) return refused;
  const parsed = nativeLogoutRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return nativeError(400, "invalid_request", "Invalid data");
  try {
    await endNativeSession(parsed.data.refreshToken);
    return nativeJson({ success: true });
  } catch (error) {
    console.error("[auth-native] logout failed:", error instanceof Error ? error.message : "unknown");
    return nativeError(503, "invalid_request", "Could not reach your session. Try again.");
  }
}
