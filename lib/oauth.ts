export type OAuthProvider = "google";

export interface NormalizedOAuthUser {
  provider: OAuthProvider;
  providerAccountId: string;
  email: string;
  name: string | null;
  username: string;
  avatarUrl: string | null;
  emailVerified: boolean;
}

export function isOAuthProvider(provider: string): provider is OAuthProvider {
  return provider.toLowerCase() === "google";
}

/**
 * Generates the authorization URL for initiating the Google OAuth flow.
 * Throws a clear error if credentials are not configured.
 */
export function getOAuthAuthorizationUrl(
  provider: OAuthProvider,
  state: string,
  redirectUri: string
): string {
  if (provider === "google") {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new Error(
        "Google OAuth is not configured. Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file."
      );
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "offline",
      prompt: "select_account",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  throw new Error(`Unsupported OAuth provider: ${provider}`);
}

/**
 * Exchanges the Google authorization code for verified user profile data.
 */
export async function exchangeOAuthCode(
  provider: OAuthProvider,
  code: string,
  redirectUri: string
): Promise<NormalizedOAuthUser> {
  if (provider === "google") {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error(
        "Google OAuth credentials are not configured in environment variables."
      );
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Google token exchange failed: ${errText}`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) {
      throw new Error("Failed to fetch verified Google user profile.");
    }

    const profile = await userRes.json();
    const email = profile.email;
    const emailPrefix = email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "_");

    return {
      provider: "google",
      providerAccountId: profile.sub,
      email: profile.email,
      name: profile.name || null,
      username: emailPrefix.slice(0, 20),
      avatarUrl: profile.picture || null,
      emailVerified: Boolean(profile.email_verified),
    };
  }

  throw new Error(`Unsupported OAuth provider: ${provider}`);
}
