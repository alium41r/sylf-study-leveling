import { NextRequest, NextResponse } from "next/server";
import { exchangeOAuthCode, isOAuthProvider, type OAuthProvider } from "@/lib/oauth";
import { handleOAuthSignInOrRegister } from "@/lib/auth-service";
import { AUTH_COOKIE_OPTIONS } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ provider: string }> }
) {
  const origin = req.nextUrl.origin;
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");

  try {
    const params = await props.params;
    const providerStr = params.provider.toLowerCase();

    if (!isOAuthProvider(providerStr)) {
      return NextResponse.redirect(`${origin}/login?error=Invalid%20OAuth%20provider`);
    }

    const provider = providerStr as OAuthProvider;

    if (errorParam) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(
          searchParams.get("error_description") || errorParam
        )}`
      );
    }

    if (!code) {
      return NextResponse.redirect(`${origin}/login?error=Missing%20authorization%20code`);
    }

    // Directive 3: Strict CSRF verification via state cookie
    const storedState = req.cookies.get(`oauth_state_${provider}`)?.value;
    if (!storedState || !state || storedState !== state) {
      return NextResponse.redirect(`${origin}/login?error=Invalid%20or%20expired%20OAuth%20state`);
    }

    const redirectUri = `${origin}/api/auth/callback/${provider}`;

    // Exchange authorization code for verified Google profile
    const oauthUser = await exchangeOAuthCode(provider, code, redirectUri);

    // Directive 2: Register, Login, or Link existing account without unique constraint crash
    const { user, token } = await handleOAuthSignInOrRegister(oauthUser);

    // Directive 1: New user (onboarding incomplete) -> /onboarding, Returning user -> /dashboard
    const destination = !user.hasCompletedOnboarding ? "/onboarding" : "/dashboard";
    const response = NextResponse.redirect(`${origin}${destination}`);

    // Set the authentication session cookie
    response.cookies.set({
      ...AUTH_COOKIE_OPTIONS,
      value: token,
    });

    // Clear state cookie
    response.cookies.set({
      name: `oauth_state_${provider}`,
      value: "",
      maxAge: 0,
      path: "/",
    });

    return response;
  } catch (err: any) {
    console.error("OAuth Callback Error:", err);
    const msg = encodeURIComponent(err?.message || "Authentication failed.");
    return NextResponse.redirect(`${origin}/login?error=${msg}`);
  }
}
