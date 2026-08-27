/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getOAuthAuthorizationUrl,
  exchangeOAuthCode,
  isOAuthProvider,
} from "@/lib/oauth";
import { handleOAuthSignInOrRegister, linkOAuthAccountToUser } from "@/lib/auth-service";
import { GET as oauthCallback } from "@/app/api/auth/callback/[provider]/route";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    connectedAccount: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
    },
    userPrivacy: {
      create: vi.fn(),
    },
    systemMessage: {
      create: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(prisma)),
  },
}));

describe("OAuth 2.0 Providers & Account Linking", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("identifies supported OAuth providers and rejects unsupported ones", () => {
    expect(isOAuthProvider("google")).toBe(true);
    expect(isOAuthProvider("GOOGLE")).toBe(true);
    expect(isOAuthProvider("github")).toBe(true);
    expect(isOAuthProvider("GITHUB")).toBe(true);
    expect(isOAuthProvider("discord")).toBe(true);
    expect(isOAuthProvider("DISCORD")).toBe(true);
    expect(isOAuthProvider("instagram")).toBe(true);
    expect(isOAuthProvider("INSTAGRAM")).toBe(true);

    expect(isOAuthProvider("twitter")).toBe(false);
    expect(isOAuthProvider("facebook")).toBe(false);
  });

  it("generates correct GitHub authorization URL with read:user scope", () => {
    process.env.GITHUB_CLIENT_ID = "mock_gh_client_id";

    const urlStr = getOAuthAuthorizationUrl(
      "github",
      "secure-gh-state-123",
      "http://localhost:3000/api/auth/callback/github"
    );

    const url = new URL(urlStr);
    expect(url.origin).toBe("https://github.com");
    expect(url.pathname).toBe("/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("mock_gh_client_id");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/auth/callback/github");
    expect(url.searchParams.get("scope")).toBe("read:user user:email");
    expect(url.searchParams.get("state")).toBe("secure-gh-state-123");
  });

  it("generates correct Discord authorization URL with identify scope", () => {
    process.env.DISCORD_CLIENT_ID = "mock_discord_client_id";

    const urlStr = getOAuthAuthorizationUrl(
      "discord",
      "secure-discord-state-123",
      "http://localhost:3000/api/auth/callback/discord"
    );

    const url = new URL(urlStr);
    expect(url.origin).toBe("https://discord.com");
    expect(url.pathname).toBe("/oauth2/authorize");
    expect(url.searchParams.get("client_id")).toBe("mock_discord_client_id");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/auth/callback/discord");
    expect(url.searchParams.get("scope")).toBe("identify email");
    expect(url.searchParams.get("state")).toBe("secure-discord-state-123");
  });

  it("exchanges GitHub authorization code for verified user profile with handle", async () => {
    process.env.GITHUB_CLIENT_ID = "mock_gh_id";
    process.env.GITHUB_CLIENT_SECRET = "mock_gh_secret";

    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "mock_gh_token_xyz" }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 998877,
          login: "octocat_scholar",
          name: "The Octocat",
          email: "octocat@github.com",
          avatar_url: "https://avatars.githubusercontent.com/u/998877",
        }),
      } as any);

    const user = await exchangeOAuthCode(
      "github",
      "valid_gh_code",
      "http://localhost:3000/api/auth/callback/github"
    );

    expect(user.provider).toBe("github");
    expect(user.providerAccountId).toBe("998877");
    expect(user.username).toBe("octocat_scholar");
    expect(user.email).toBe("octocat@github.com");
    expect(user.name).toBe("The Octocat");
  });

  it("exchanges Discord authorization code for verified user profile with handle", async () => {
    process.env.DISCORD_CLIENT_ID = "mock_discord_id";
    process.env.DISCORD_CLIENT_SECRET = "mock_discord_secret";

    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "mock_discord_token_xyz" }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "33445566778899",
          username: "discord_hunter",
          global_name: "Shadow Hunter",
          email: "hunter@discord.gg",
          avatar: "abc123avatarhash",
          verified: true,
        }),
      } as any);

    const user = await exchangeOAuthCode(
      "discord",
      "valid_discord_code",
      "http://localhost:3000/api/auth/callback/discord"
    );

    expect(user.provider).toBe("discord");
    expect(user.providerAccountId).toBe("33445566778899");
    expect(user.username).toBe("discord_hunter");
    expect(user.email).toBe("hunter@discord.gg");
    expect(user.name).toBe("Shadow Hunter");
  });

  it("links OAuth account to logged in user without collision", async () => {
    (prisma.connectedAccount.findFirst as any).mockResolvedValueOnce(null);
    (prisma.connectedAccount.upsert as any).mockResolvedValueOnce({
      id: 101,
      userId: 7,
      provider: "GITHUB",
      providerAccountId: "998877",
      providerUsername: "octocat_scholar",
    });

    const result = await linkOAuthAccountToUser(7, {
      provider: "github",
      providerAccountId: "998877",
      email: "octocat@github.com",
      name: "The Octocat",
      username: "octocat_scholar",
      avatarUrl: "https://avatars.githubusercontent.com/u/998877",
      emailVerified: true,
    });

    expect(result.provider).toBe("GITHUB");
    expect(result.providerUsername).toBe("octocat_scholar");
    expect(prisma.connectedAccount.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_provider: {
            userId: 7,
            provider: "GITHUB",
          },
        },
        create: expect.objectContaining({
          userId: 7,
          provider: "GITHUB",
          providerAccountId: "998877",
          providerUsername: "octocat_scholar",
        }),
      })
    );
  });

  describe("CSRF State Cookie Verification", () => {
    it("rejects callback if state cookie does not match query state", async () => {
      const req = new NextRequest(
        "http://localhost:3000/api/auth/callback/google?code=auth_code&state=mismatched_state",
        {
          headers: {
            cookie: "oauth_state_google=original_state_cookie",
          },
        }
      );

      const res = await oauthCallback(req, { params: Promise.resolve({ provider: "google" }) });
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("error=Invalid%20or%20expired%20OAuth%20state");
    });
  });
});

describe("S3: OAuth unverified-email account takeover protection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  const existingUser = {
    id: 7,
    email: "victim@system.dev",
    username: "victim",
    name: "Victim Scholar",
    scholarId: "#000007",
    verificationStatus: "UNVERIFIED",
    hunterRank: "E",
    level: 1,
    password: "hash",
    tokenVersion: 1,
    timezone: "UTC",
    hasCompletedOnboarding: false,
  } as any;

  it("verified provider email links and signs in the existing user", async () => {
    (prisma.connectedAccount.findUnique as any).mockResolvedValueOnce(null);
    (prisma.user.findUnique as any).mockResolvedValueOnce(existingUser); // email match
    (prisma.connectedAccount.upsert as any).mockResolvedValueOnce({});
    (prisma.user.update as any).mockResolvedValueOnce(existingUser); // UNVERIFIED -> VERIFIED

    const result = await handleOAuthSignInOrRegister({
      provider: "google",
      providerAccountId: "g-123",
      email: "victim@system.dev",
      name: "Victim Scholar",
      username: "victim",
      avatarUrl: null,
      emailVerified: true,
    });

    expect(result.isNewUser).toBe(false);
    expect(result.user.id).toBe(7);
    expect(result.token).toBeTruthy();
    expect(prisma.connectedAccount.upsert).toHaveBeenCalled();
  });

  it("unverified provider email matching an existing user is REJECTED (takeover blocked)", async () => {
    (prisma.connectedAccount.findUnique as any).mockResolvedValueOnce(null);
    (prisma.user.findUnique as any).mockResolvedValueOnce(existingUser); // email match

    await expect(
      handleOAuthSignInOrRegister({
        provider: "github",
        providerAccountId: "gh-attacker",
        email: "victim@system.dev",
        name: "Attacker",
        username: "attacker",
        avatarUrl: null,
        emailVerified: false,
      })
    ).rejects.toThrow(/not verified/i);

    expect(prisma.connectedAccount.upsert).not.toHaveBeenCalled();
  });

  it("unverified email with NO matching user still creates a fresh account", async () => {
    (prisma.connectedAccount.findUnique as any).mockResolvedValueOnce(null);
    (prisma.user.findUnique as any).mockResolvedValue(null);
    (prisma.user.create as any).mockResolvedValueOnce({ ...existingUser, id: 8, email: "fresh@system.dev" });
    (prisma.user.update as any).mockResolvedValueOnce({ ...existingUser, id: 8, email: "fresh@system.dev" });
    (prisma.systemMessage.create as any).mockResolvedValueOnce({});

    const result = await handleOAuthSignInOrRegister({
      provider: "discord",
      providerAccountId: "d-fresh",
      email: "fresh@system.dev",
      name: "Fresh Scholar",
      username: "fresh",
      avatarUrl: null,
      emailVerified: false,
    });

    expect(result.isNewUser).toBe(true);
    expect(result.user.id).toBe(8);
    expect(prisma.connectedAccount.upsert).not.toHaveBeenCalled();
  });
});
