/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  initializeUserProfile,
  handleOAuthSignInOrRegister,
  generateEmailVerificationToken,
  confirmEmailVerificationToken,
} from "@/lib/auth-service";
import { prisma } from "@/lib/prisma";

describe("Phase 1: Auth Service Profile Initialization & Logic", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes a credentials user with baseline RPG metrics and UNVERIFIED status", async () => {
    const mockCreatedUser = {
      id: 7,
      email: "newscholar@system.dev",
      username: "new_scholar",
      name: "New Scholar",
      password: "hashed_password",
      avatarUrl: null,
      scholarId: "#000007",
      verificationStatus: "UNVERIFIED",
      hunterRank: "E",
      level: 1,
      currentXP: 0,
      xpToNextLevel: 200,
      hp: 100,
      maxHp: 100,
      streakDays: 0,
      totalStudyMinutes: 0,
      hasCompletedOnboarding: false,
      createdAt: new Date(),
    };

    vi.spyOn(prisma.user, "findUnique").mockResolvedValue(null);
    vi.spyOn(prisma, "$transaction").mockImplementation(async (callback: any) => {
      const tx = {
        user: {
          create: vi.fn().mockResolvedValue({ id: 7 }),
          update: vi.fn().mockResolvedValue(mockCreatedUser),
        },
        systemMessage: {
          create: vi.fn().mockResolvedValue({ id: 1 }),
        },
      };
      return callback(tx);
    });

    const result = await initializeUserProfile({
      email: "newscholar@system.dev",
      username: "new_scholar",
      password: "password123",
      name: "New Scholar",
    });

    expect(result.user.scholarId).toBe("#000007");
    expect(result.user.hunterRank).toBe("E");
    expect(result.user.level).toBe(1);
    expect(result.user.currentXP).toBe(0);
    expect(result.user.hp).toBe(100);
    expect(result.user.maxHp).toBe(100);
    expect(result.user.verificationStatus).toBe("UNVERIFIED");
    expect(typeof result.token).toBe("string");
  });

  it("handles OAuth sign in with existing connected account", async () => {
    const mockUser = {
      id: 15,
      email: "oauth.user@gmail.com",
      username: "oauth_user",
      name: "OAuth User",
      scholarId: "#000015",
      verificationStatus: "VERIFIED" as const,
      hunterRank: "E",
      level: 1,
      avatarUrl: "https://avatar.dev/1",
    };

    vi.spyOn(prisma.connectedAccount, "findUnique").mockResolvedValue({
      id: 1,
      userId: 15,
      provider: "GOOGLE",
      providerAccountId: "google_12345",
      providerEmail: "oauth.user@gmail.com",
      createdAt: new Date(),
      updatedAt: new Date(),
      user: mockUser,
    } as any);

    const result = await handleOAuthSignInOrRegister({
      provider: "google",
      providerAccountId: "google_12345",
      email: "oauth.user@gmail.com",
      name: "OAuth User",
      username: "oauth_user",
      avatarUrl: "https://avatar.dev/1",
      emailVerified: true,
    });

    expect(result.isNewUser).toBe(false);
    expect(result.user.id).toBe(15);
    expect(typeof result.token).toBe("string");
  });

  it("generates and confirms email verification tokens", async () => {
    vi.spyOn(prisma.verificationToken, "deleteMany").mockResolvedValue({ count: 1 });
    vi.spyOn(prisma.verificationToken, "create").mockResolvedValue({
      id: 1,
      userId: 10,
      token: "mock_token_123",
      action: "VERIFY_EMAIL",
      expiresAt: new Date(Date.now() + 3600000),
      createdAt: new Date(),
    });

    const token = await generateEmailVerificationToken(10);
    expect(typeof token).toBe("string");
    expect(token.length).toBe(64); // 32 bytes hex = 64 chars

    vi.spyOn(prisma.verificationToken, "findUnique").mockResolvedValue({
      id: 1,
      userId: 10,
      token: "mock_token_123",
      expiresAt: new Date(Date.now() + 3600000),
      createdAt: new Date(),
      user: { email: "scholar@system.dev" },
    } as any);
    vi.spyOn(prisma.user, "update").mockResolvedValue({} as any);
    vi.spyOn(prisma.verificationToken, "delete").mockResolvedValue({} as any);

    const confirmResult = await confirmEmailVerificationToken("mock_token_123");
    expect(confirmResult.success).toBe(true);
    expect(confirmResult.email).toBe("scholar@system.dev");
  });
});
