import { NextRequest, NextResponse } from "next/server";
import { getOAuthAuthorizationUrl } from "@/lib/oauth";
import { isPrelaunchMode } from "@/lib/prelaunch";
import { signNativeOAuthState } from "@/lib/auth-native";
import { isNativeOAuthRedirect, nativeOAuthStartSchema } from "@/lib/native-auth-contract";

/**
 * Opened in the system browser by Sylf Native. A navigation, so a browser is exactly what is expected here. Issues no token, reads no cookie
 * and sets none: it signs a state naming the app's PKCE challenge and hands the person to the provider.
 */
export async function GET(req: NextRequest) {
  if (isPrelaunchMode()) return NextResponse.json({ error: "Sign-in is closed right now." }, { status: 403 });
  const parsed = nativeOAuthStartSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success || !isNativeOAuthRedirect(parsed.data.redirect)) return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  const { provider, challenge, redirect } = parsed.data;
  try {
    const state = await signNativeOAuthState({ provider, challenge, redirect });
    return NextResponse.redirect(getOAuthAuthorizationUrl(provider, state, `${req.nextUrl.origin}/api/auth/callback/${provider}`));
  } catch (error) {
    console.error("[auth-native] OAuth start failed:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "This provider is not available." }, { status: 503 });
  }
}
