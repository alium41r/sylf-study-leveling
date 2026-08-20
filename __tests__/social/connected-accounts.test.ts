/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getConnections } from "@/app/api/user/connections/route";
import { GET as getProfile } from "@/app/api/profile/[username]/route";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { signToken } from "@/lib/auth";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    connectedAccount: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    friendRequest: {
      findUnique: vi.fn(),
    },
    userBlock: {
      findFirst: vi.fn(),
    },
    timerSession: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { duration: 3600 } }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    quest: {
      count: vi.fn().mockResolvedValue(5),
    },
    $transaction: vi.fn((callback) => callback(prisma)),
  },
}));

vi.mock("@/lib/privacy-service", () => ({
  getRelationship: vi.fn().mockResolvedValue("PUBLIC"),
  isVisible: vi.fn().mockReturnValue(true),
  Relationship: {
    SELF: "SELF",
    FRIEND: "FRIEND",
    GROUP: "GROUP",
    PUBLIC: "PUBLIC",
  },
}));

describe("Connected Accounts & Public Dossier Privacy", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("GET /api/user/connections returns provider username and connection status", async () => {
    const mockToken = await signToken({ userId: 12, email: "scholar@sylf.dev", username: "scholar12" });

    (prisma.connectedAccount.findMany as any).mockResolvedValueOnce([
      {
        provider: "GITHUB",
        providerEmail: "scholar@github.com",
        providerUsername: "octocat_scholar",
        createdAt: new Date("2026-08-01"),
      },
      {
        provider: "DISCORD",
        providerEmail: "scholar@discord.com",
        providerUsername: "discord_master#0001",
        createdAt: new Date("2026-08-02"),
      },
      {
        provider: "GOOGLE",
        providerEmail: "scholar@gmail.com",
        providerUsername: null,
        createdAt: new Date("2026-08-03"),
      },
    ]);

    const req = new NextRequest("http://localhost:3000/api/user/connections", {
      headers: {
        Authorization: `Bearer ${mockToken}`,
      },
    });

    const res = await getConnections(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.connections).toBeDefined();

    const gh = json.connections.find((c: any) => c.provider === "GITHUB");
    expect(gh.isLinked).toBe(true);
    expect(gh.username).toBe("octocat_scholar");

    const discord = json.connections.find((c: any) => c.provider === "DISCORD");
    expect(discord.isLinked).toBe(true);
    expect(discord.username).toBe("discord_master#0001");

    const ig = json.connections.find((c: any) => c.provider === "INSTAGRAM");
    expect(ig.isLinked).toBe(false);
  });

  it("GET /api/profile/[username] returns verified connected accounts and STRICTLY omits Google email", async () => {
    (prisma.user.findUnique as any).mockResolvedValueOnce({
      id: 99,
      username: "master_scholar",
      name: "Master Scholar",
      scholarId: "#000099",
      verificationStatus: "VERIFIED",
      avatarUrl: "https://sylf.dev/avatar.png",
      bannerUrl: "https://sylf.dev/banner.png",
      bio: "Academic Research & Study",
      hunterRank: "S",
      level: 50,
      currentXP: 10000,
      xpToNextLevel: 15000,
      hp: 100,
      maxHp: 100,
      streakDays: 14,
      totalStudyMinutes: 2000,
      activeAvatar: "class_scholar",
      activeFrame: "frame_gold",
      activeTitle: "Grand Monarch",
      activeAura: "aura_monarch",
      activeNameColor: "gold",
      socialLinks: {},
      privacy: {
        profileVisibility: "PUBLIC",
        showRank: "PUBLIC",
        showStudyHours: "PUBLIC",
        showAchievements: "PUBLIC",
        showOnlineStatus: "PUBLIC",
      },
      achievements: [],
      connectedAccounts: [
        {
          provider: "GITHUB",
          providerAccountId: "12345",
          providerEmail: "githubber@gh.com",
          providerUsername: "gh_scholar",
        },
        {
          provider: "DISCORD",
          providerAccountId: "67890",
          providerEmail: "discordian@dc.com",
          providerUsername: "discord_scholar",
        },
        {
          provider: "GOOGLE",
          providerAccountId: "google_secret_id",
          providerEmail: "private_google_email@gmail.com",
          providerUsername: null,
        },
      ],
    });

    const req = new NextRequest("http://localhost:3000/api/profile/master_scholar");
    const res = await getProfile(req, { params: Promise.resolve({ username: "master_scholar" }) });

    expect(res.status).toBe(200);
    const json = await res.json();

    // Verify connectedAccounts structure
    expect(json.profile.connectedAccounts).toBeDefined();
    expect(json.profile.connectedAccounts.github).toBe("gh_scholar");
    expect(json.profile.connectedAccounts.discord).toBe("discord_scholar");
    expect(json.profile.connectedAccounts.instagram).toBeNull();
    expect((json.profile.connectedAccounts as any).google).toBeUndefined();

    // Verify socialLinks sanitized without Google
    expect(json.profile.socialLinks.github).toBe("gh_scholar");
    expect(json.profile.socialLinks.discord).toBe("discord_scholar");
    expect(json.profile.socialLinks.google).toBeUndefined();

    // Verify raw profile response does NOT expose private google email
    const stringified = JSON.stringify(json);
    expect(stringified).not.toContain("private_google_email@gmail.com");
    expect(stringified).not.toContain("google_secret_id");
  });

  it("GET /api/profile/[username] strictly ignores legacy unverified manual socialLinks", async () => {
    (prisma.user.findUnique as any).mockResolvedValueOnce({
      id: 100,
      username: "ali",
      name: "Ali",
      scholarId: "#000100",
      verificationStatus: "VERIFIED",
      hunterRank: "E",
      level: 1,
      currentXP: 0,
      xpToNextLevel: 1000,
      hp: 100,
      maxHp: 100,
      streakDays: 0,
      totalStudyMinutes: 0,
      socialLinks: { discord: ".aka.ali.", github: "old_manual_gh" },
      privacy: {
        profileVisibility: "PUBLIC",
        showRank: "PUBLIC",
        showStudyHours: "PUBLIC",
        showAchievements: "PUBLIC",
        showOnlineStatus: "PUBLIC",
      },
      achievements: [],
      connectedAccounts: [], // No verified OAuth accounts
    });

    const req = new NextRequest("http://localhost:3000/api/profile/ali");
    const res = await getProfile(req, { params: Promise.resolve({ username: "ali" }) });

    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.profile.connectedAccounts.github).toBeNull();
    expect(json.profile.connectedAccounts.discord).toBeNull();
    expect(json.profile.connectedAccounts.instagram).toBeNull();
    expect(json.profile.socialLinks).toEqual({});
  });
});
