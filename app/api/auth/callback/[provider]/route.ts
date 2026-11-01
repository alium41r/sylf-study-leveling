import { NextRequest, NextResponse } from "next/server";
import { exchangeOAuthCode, isOAuthProvider, type OAuthProvider } from "@/lib/oauth";
import { handleOAuthSignInOrRegister, linkOAuthAccountToUser } from "@/lib/auth-service";
import { completeNativeOAuth, readNativeOAuthState } from "@/lib/auth-native";
import { getSession } from "@/lib/auth-server";
import { AUTH_COOKIE_OPTIONS } from "@/lib/auth";
import { isPrelaunchMode } from "@/lib/prelaunch";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ provider: string }> }
) {
  // Prelaunch lockdown: OAuth sign-in would create accounts — not allowed yet.
  if (isPrelaunchMode()) {
    return NextResponse.redirect(new URL("/", req.url));
  }

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

    // Sylf Native's flow is named only by a state this server signed. It has no web session, cookie or link to consider.
    const nativeFlow = await readNativeOAuthState(state, provider);
    if (nativeFlow) return completeNativeOAuth(nativeFlow, origin, code, errorParam);

    // Check if this was a linking flow from settings. The verified session is the
    // only authority on who is linking: the cookie is readable and writable by
    // whoever holds the browser, so a value that disagrees with the session
    // (or arrives with no session) is an attempt to attach a provider to
    // someone else's account, and nothing is linked or signed in.
    const linkUserIdCookie = req.cookies.get(`oauth_link_user_${provider}`)?.value;
    const currentSession = await getSession(req);
    if (linkUserIdCookie && linkUserIdCookie !== String(currentSession?.userId)) {
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("Sign in again to connect this account.")}`);
    }
    const linkingUserId = currentSession?.userId;

    const failureRedirect = linkingUserId
      ? `${origin}/settings/account`
      : `${origin}/login`;

    if (errorParam) {
      const errMsg = encodeURIComponent(
        searchParams.get("error_description") || errorParam
      );
      return NextResponse.redirect(`${failureRedirect}?error=${errMsg}`);
    }

    if (!code) {
      return NextResponse.redirect(`${failureRedirect}?error=Missing%20authorization%20code`);
    }

    // Strict CSRF verification via state cookie
    const storedState = req.cookies.get(`oauth_state_${provider}`)?.value;
    if (!storedState || !state || storedState !== state) {
      return NextResponse.redirect(`${failureRedirect}?error=Invalid%20or%20expired%20OAuth%20state`);
    }

    const redirectUri = `${origin}/api/auth/callback/${provider}`;

    // Exchange authorization code for verified provider profile
    const oauthUser = await exchangeOAuthCode(provider, code, redirectUri);

    // Linking scenario (user was already logged in when clicking Connect in Settings)
    if (linkingUserId) {
      try {
        await linkOAuthAccountToUser(linkingUserId, oauthUser);
        const response = NextResponse.redirect(`${origin}/settings/account?connected=${provider}`);

        // Clear state & linking cookies
        response.cookies.set({
          name: `oauth_state_${provider}`,
          value: "",
          maxAge: 0,
          path: "/",
        });
        response.cookies.set({
          name: `oauth_link_user_${provider}`,
          value: "",
          maxAge: 0,
          path: "/",
        });

        return response;
      } catch (linkError: any) {
        console.error("Link Account Error:", linkError);
        const response = NextResponse.redirect(
          `${origin}/settings/account?error=${encodeURIComponent(linkError.message || "Failed to link account")}`
        );
        response.cookies.set({
          name: `oauth_state_${provider}`,
          value: "",
          maxAge: 0,
          path: "/",
        });
        response.cookies.set({
          name: `oauth_link_user_${provider}`,
          value: "",
          maxAge: 0,
          path: "/",
        });
        return response;
      }
    }

    // Guest scenario: Register, Login, or Link existing account
    const { user, token } = await handleOAuthSignInOrRegister(oauthUser, req);

    const destination = !user.hasCompletedOnboarding ? "/onboarding" : "/dashboard";
    const response = NextResponse.redirect(`${origin}${destination}`);

    // Set the authentication session cookie
    response.cookies.set({
      ...AUTH_COOKIE_OPTIONS,
      value: token,
    });

    // Clear state & linking cookies
    response.cookies.set({
      name: `oauth_state_${provider}`,
      value: "",
      maxAge: 0,
      path: "/",
    });
    response.cookies.set({
      name: `oauth_link_user_${provider}`,
      value: "",
      maxAge: 0,
      path: "/",
    });

    return response;
  } catch (err: any) {
    console.error("OAuth Callback Error:", err);
    const msg = encodeURIComponent(err?.message || "Authentication failed.");
    return NextResponse.redirect(`${origin}/settings/account?error=${msg}`);
  }
}
