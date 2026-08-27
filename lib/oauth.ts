export type OAuthProvider = "google" | "github" | "discord" | "instagram";

export interface NormalizedOAuthUser {
  provider: OAuthProvider;
  providerAccountId: string;
  email: string | null;
  name: string | null;
  username: string;
  providerUsername?: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
}

const SUPPORTED_PROVIDERS = new Set<string>(["google", "github", "discord", "instagram"]);

export function isOAuthProvider(provider: string): provider is OAuthProvider {
  return SUPPORTED_PROVIDERS.has(provider.toLowerCase());
}

/**
 * Generates the authorization URL for initiating OAuth flows.
 */
export function getOAuthAuthorizationUrl(
  provider: OAuthProvider,
  state: string,
  redirectUri: string
): string {
  switch (provider) {
    case "google": {
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

    case "github": {
      const clientId = process.env.GITHUB_CLIENT_ID;
      if (!clientId) {
        throw new Error(
          "GitHub OAuth is not configured. Please add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to your .env file."
        );
      }
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: "read:user user:email",
        state,
      });
      return `https://github.com/login/oauth/authorize?${params.toString()}`;
    }

    case "discord": {
      const clientId = process.env.DISCORD_CLIENT_ID;
      if (!clientId) {
        throw new Error(
          "Discord OAuth is not configured. Please add DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET to your .env file."
        );
      }
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "identify email",
        state,
        prompt: "consent",
      });
      return `https://discord.com/oauth2/authorize?${params.toString()}`;
    }

    case "instagram": {
      const clientId = process.env.INSTAGRAM_CLIENT_ID;
      if (!clientId) {
        throw new Error(
          "Instagram OAuth is not configured. Please add INSTAGRAM_CLIENT_ID and INSTAGRAM_CLIENT_SECRET to your .env file."
        );
      }
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "user_profile,user_media",
        state,
      });
      return `https://api.instagram.com/oauth/authorize?${params.toString()}`;
    }

    default:
      throw new Error(`Unsupported OAuth provider: ${provider}`);
  }
}

/**
 * Exchanges authorization code for verified provider user profile data.
 */
export async function exchangeOAuthCode(
  provider: OAuthProvider,
  code: string,
  redirectUri: string
): Promise<NormalizedOAuthUser> {
  switch (provider) {
    case "google": {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        throw new Error("Google OAuth credentials are not configured.");
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
        providerAccountId: String(profile.sub),
        email: profile.email || null,
        name: profile.name || null,
        username: emailPrefix.slice(0, 20),
        providerUsername: null,
        avatarUrl: profile.picture || null,
        emailVerified: Boolean(profile.email_verified),
      };
    }

    case "github": {
      const clientId = process.env.GITHUB_CLIENT_ID;
      const clientSecret = process.env.GITHUB_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        throw new Error("GitHub OAuth credentials are not configured.");
      }

      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        throw new Error(`GitHub token exchange failed: ${errText}`);
      }

      const tokenData = await tokenRes.json();
      if (tokenData.error) {
        throw new Error(`GitHub OAuth error: ${tokenData.error_description || tokenData.error}`);
      }
      const accessToken = tokenData.access_token;

      const userRes = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "Sylf-App",
          Accept: "application/json",
        },
      });

      if (!userRes.ok) {
        throw new Error("Failed to fetch GitHub profile.");
      }

      const profile = await userRes.json();

      // S3 fix (OAuth takeover): a GitHub email counts as verified ONLY when
      // /user/emails returns it with verified=true. The public profile email
      // and the old `emails[0]` fallback are attacker-influenceable and must
      // never authorize linking to an existing account.
      let email = profile.email || null;
      let emailVerified = false;
      try {
        const emailsRes = await fetch("https://api.github.com/user/emails", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "User-Agent": "Sylf-App",
            Accept: "application/json",
          },
        });
        if (emailsRes.ok) {
          const emails: { email: string; primary: boolean; verified: boolean }[] = await emailsRes.json();
          const verifiedPrimary =
            emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified);
          if (verifiedPrimary?.email) {
            email = verifiedPrimary.email;
            emailVerified = true;
          } else if (email && emails.some((e) => e.email === email && e.verified)) {
            // The public profile email is itself verified.
            emailVerified = true;
          }
          // Otherwise email may still be set, but stays unverified.
        }
      } catch {
        // Non-blocking fallback: email remains unverified.
      }

      const username = (profile.login || "").toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 20);

      return {
        provider: "github",
        providerAccountId: String(profile.id),
        email: email || null,
        name: profile.name || profile.login || null,
        username: username || "hunter",
        providerUsername: profile.login || null,
        avatarUrl: profile.avatar_url || null,
        emailVerified,
      };
    }

    case "discord": {
      const clientId = process.env.DISCORD_CLIENT_ID;
      const clientSecret = process.env.DISCORD_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        throw new Error("Discord OAuth credentials are not configured.");
      }

      const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        throw new Error(`Discord token exchange failed: ${errText}`);
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;

      const userRes = await fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!userRes.ok) {
        throw new Error("Failed to fetch Discord user profile.");
      }

      const profile = await userRes.json();
      const discordHandle = profile.username || "";
      const username = discordHandle.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 20);
      const avatarUrl = profile.avatar
        ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
        : null;

      return {
        provider: "discord",
        providerAccountId: String(profile.id),
        email: profile.email || null,
        name: profile.global_name || profile.username || null,
        username: username || "hunter",
        providerUsername: discordHandle || null,
        avatarUrl,
        emailVerified: Boolean(profile.verified),
      };
    }

    case "instagram": {
      const clientId = process.env.INSTAGRAM_CLIENT_ID;
      const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        throw new Error("Instagram OAuth credentials are not configured.");
      }

      const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          code,
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        throw new Error(`Instagram token exchange failed: ${errText}`);
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;
      const userId = tokenData.user_id;

      const userRes = await fetch(
        `https://graph.instagram.com/me?fields=id,username,account_type&access_token=${accessToken}`
      );

      if (!userRes.ok) {
        throw new Error("Failed to fetch Instagram user profile.");
      }

      const profile = await userRes.json();
      const igUsername = profile.username || "";
      const username = igUsername.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 20);

      return {
        provider: "instagram",
        providerAccountId: String(profile.id || userId),
        email: null,
        name: profile.username || null,
        username: username || "hunter",
        providerUsername: igUsername || null,
        avatarUrl: null,
        emailVerified: false,
      };
    }

    default:
      throw new Error(`Unsupported OAuth provider: ${provider}`);
  }
}
