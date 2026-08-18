/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getOAuthAuthorizationUrl,
  exchangeOAuthCode,
  isOAuthProvider,
} from "@/lib/oauth";
import { handleOAuthSignInOrRegister } from "@/lib/auth-service";
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
      upsert: vi.fn(),
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

describe("Google OAuth 2.0 Flow & Account Linking", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("identifies Google as valid OAuth provider and rejects others", () => {
    expect(isOAuthProvider("google")).toBe(true);
    expect(isOAuthProvider("GOOGLE")).toBe(true);
    expect(isOAuthProvider("github")).toBe(false);
    expect(isOAuthProvider("discord")).toBe(false);
  });

  it("throws error when Google client ID is not configured", () => {
    const origId = process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID;

    expect(() =>
      getOAuthAuthorizationUrl("google", "test-state", "http://localhost:3000/callback")
    ).toThrowError(/Google OAuth is not configured/);

    process.env.GOOGLE_CLIENT_ID = origId;
  });

  it("generates correct accounts.google.com authorization URL with prompt=select_account", () => {
    process.env.GOOGLE_CLIENT_ID = "mock_client_id.apps.googleusercontent.com";

    const urlStr = getOAuthAuthorizationUrl(
      "google",
      "secure-random-state-123",
      "http://localhost:3000/api/auth/callback/google"
    );

    const url = new URL(urlStr);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.pathname).toBe("/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("mock_client_id.apps.googleusercontent.com");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/auth/callback/google");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("state")).toBe("secure-random-state-123");
    expect(url.searchParams.get("prompt")).toBe("select_account");
    expect(url.searchParams.get("access_type")).toBe("offline");
  });

  it("exchanges Google authorization code for verified user profile", async () => {
    process.env.GOOGLE_CLIENT_ID = "mock_client_id";
    process.env.GOOGLE_CLIENT_SECRET = "mock_client_secret";

    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "mock_access_token_xyz" }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sub: "google_11223344",
          email: "ali.umair@gmail.com",
          name: "Ali Umair",
          picture: "https://lh3.googleusercontent.com/avatar.jpg",
          email_verified: true,
        }),
      } as any);

    const user = await exchangeOAuthCode(
      "google",
      "valid_auth_code",
      "http://localhost:3000/api/auth/callback/google"
    );

    expect(user.provider).toBe("google");
    expect(user.providerAccountId).toBe("google_11223344");
    expect(user.email).toBe("ali.umair@gmail.com");
    expect(user.name).toBe("Ali Umair");
    expect(user.username).toBe("ali_umair");
    expect(user.avatarUrl).toBe("https://lh3.googleusercontent.com/avatar.jpg");
    expect(user.emailVerified).toBe(true);
  });

  describe("Directive 2: Email Collision & Safe Account Linking", () => {
    it("links Google provider to existing email/password account and elevates status to VERIFIED", async () => {
      (prisma.connectedAccount.findUnique as any).mockResolvedValueOnce(null);

      // Existing user with same email registered via password
      (prisma.user.findUnique as any).mockResolvedValueOnce({
        id: 42,
        email: "ali.umair@gmail.com",
        username: "shadow_scholar",
        name: "Ali Umair",
        verificationStatus: "UNVERIFIED",
        hunterRank: "E",
        level: 1,
        hasCompletedOnboarding: true,
      });

      (prisma.connectedAccount.upsert as any).mockResolvedValueOnce({ id: 1 });
      (prisma.user.update as any).mockResolvedValueOnce({
        id: 42,
        email: "ali.umair@gmail.com",
        username: "shadow_scholar",
        name: "Ali Umair",
        scholarId: "#000042",
        verificationStatus: "VERIFIED",
        hunterRank: "E",
        level: 1,
        hasCompletedOnboarding: true,
      });

      const { user, token, isNewUser } = await handleOAuthSignInOrRegister({
        provider: "google",
        providerAccountId: "google_11223344",
        email: "ali.umair@gmail.com",
        name: "Ali Umair",
        username: "ali_umair",
        avatarUrl: null,
        emailVerified: true,
      });

      expect(isNewUser).toBe(false);
      expect(user.id).toBe(42);
      expect(user.verificationStatus).toBe("VERIFIED");
      expect(token).toBeDefined();
      expect(prisma.connectedAccount.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_provider: {
              userId: 42,
              provider: "GOOGLE",
            },
          },
        })
      );
    });
  });

  describe("Directive 3: CSRF State Cookie Verification", () => {
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
