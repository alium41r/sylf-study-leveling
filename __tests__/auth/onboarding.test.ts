/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as completeOnboarding } from "@/app/api/user/onboarding/route";
import { signToken, verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    userCosmetic: {
      upsert: vi.fn(),
    },
    $transaction: vi.fn((callback) =>
      callback({
        userCosmetic: { upsert: vi.fn() },
        user: {
          update: vi.fn().mockResolvedValue({
            id: 1,
            email: "scholar@system.dev",
            username: "scholar_1",
            name: "Scholar",
            scholarId: "#000001",
            verificationStatus: "UNVERIFIED",
            hunterRank: "E",
            level: 1,
            currentXP: 0,
            hp: 100,
            maxHp: 100,
            streakDays: 0,
            totalStudyMinutes: 0,
            hasCompletedOnboarding: true,
            createdAt: new Date(),
            avatarUrl: null,
          }),
        },
      })
    ),
  },
}));

describe("Onboarding Flow & Token Re-issuance", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("completes onboarding and issues fresh token with hasCompletedOnboarding: true", async () => {
    const token = await signToken({
      userId: 1,
      email: "scholar@system.dev",
      username: "scholar_1",
      hasCompletedOnboarding: false,
    });

    (prisma.user.findUnique as any).mockResolvedValueOnce({
      id: 1,
      email: "scholar@system.dev",
      username: "scholar_1",
      name: "Scholar",
      hasCompletedOnboarding: false,
    });

    const req = new NextRequest("http://localhost:3000/api/user/onboarding", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        themeId: "cyberpunk",
        backgroundId: "void",
        avatarId: "avatar_default",
      }),
    });

    const res = await completeOnboarding(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.user.hasCompletedOnboarding).toBe(true);
    expect(data.token).toBeDefined();

    const verified = await verifyToken(data.token);
    expect(verified?.hasCompletedOnboarding).toBe(true);

    const cookieHeader = res.headers.get("set-cookie");
    expect(cookieHeader).toContain("hunter_token=");
  });

  it("handles already completed onboarding idempotently without error", async () => {
    const token = await signToken({
      userId: 1,
      email: "scholar@system.dev",
      username: "scholar_1",
      hasCompletedOnboarding: true,
    });

    (prisma.user.findUnique as any).mockResolvedValueOnce({
      id: 1,
      email: "scholar@system.dev",
      username: "scholar_1",
      name: "Scholar",
      hasCompletedOnboarding: true,
    });

    const req = new NextRequest("http://localhost:3000/api/user/onboarding", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        themeId: "cyberpunk",
        backgroundId: "void",
        avatarId: "avatar_default",
      }),
    });

    const res = await completeOnboarding(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.user.hasCompletedOnboarding).toBe(true);
    expect(data.token).toBeDefined();
  });
});
