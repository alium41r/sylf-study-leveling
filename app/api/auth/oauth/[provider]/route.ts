import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getOAuthAuthorizationUrl, isOAuthProvider, type OAuthProvider } from "@/lib/oauth";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ provider: string }> }
) {
  const origin = req.nextUrl.origin;
  try {
    const params = await props.params;
    const providerStr = params.provider.toLowerCase();

    if (!isOAuthProvider(providerStr)) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(`Unsupported provider '${providerStr}'. Only Google is supported.`)}`
      );
    }

    const provider = providerStr as OAuthProvider;
    const redirectUri = `${origin}/api/auth/callback/${provider}`;

    // Generate cryptographic state for CSRF mitigation (Directive 3)
    const state = crypto.randomBytes(32).toString("hex");
    const authUrl = getOAuthAuthorizationUrl(provider, state, redirectUri);

    const response = NextResponse.redirect(authUrl);

    // Save state in a secure short-lived HTTP-only cookie (10 minutes)
    response.cookies.set({
      name: `oauth_state_${provider}`,
      value: state,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 10 * 60, // 10 minutes
      path: "/",
    });

    return response;
  } catch (error: any) {
    console.error("OAuth Init Error:", error);
    const msg = encodeURIComponent(
      error?.message || "Failed to initialize Google authentication."
    );
    return NextResponse.redirect(`${origin}/login?error=${msg}`);
  }
}
