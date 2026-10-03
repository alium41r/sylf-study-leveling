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
    subject: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockImplementation(({ create }) => ({
        id: 101,
        ...create,
      })),
    },
    subjectNode: {
      createMany: vi.fn().mockResolvedValue({ count: 48 }),
    },
    $transaction: vi.fn((callback) =>
      callback({
        $queryRaw: vi.fn().mockResolvedValue([]),
        userCosmetic: { upsert: vi.fn() },
        subject: {
          findMany: vi.fn().mockResolvedValue([]),
          upsert: vi.fn().mockImplementation(({ create }) => ({
            id: 101,
            ...create,
          })),
        },
        subjectNode: {
          createMany: vi.fn().mockResolvedValue({ count: 48 }),
        },
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
    // S3: session is cookie-only — the body must not carry the JWT.
    expect(data.token).toBeUndefined();

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
    // S3: session is cookie-only — the body must not carry the JWT.
    expect(data.token).toBeUndefined();
  });

  it("provisions subjects without syllabus code by safely generating unique codes", async () => {
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

    const upsertSpy = vi.fn().mockImplementation(({ create }) => ({
      id: 101,
      ...create,
    }));

    (prisma.$transaction as any).mockImplementationOnce((callback: any) =>
      callback({
        $queryRaw: vi.fn().mockResolvedValue([]),
        userCosmetic: { upsert: vi.fn() },
        subject: {
          findMany: vi.fn().mockResolvedValue([{ code: "EXISTING" }]),
          upsert: upsertSpy,
        },
        subjectNode: {
          createMany: vi.fn().mockResolvedValue({ count: 48 }),
        },
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
    );

    const req = new NextRequest("http://localhost:3000/api/user/onboarding", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        themeId: "#7c3aed",
        backgroundId: "void",
        subjects: [
          { name: "Mathematics" }, // No syllabus code!
          { name: "Physics", code: "PHYS-101" }, // Explicit code
          { name: "Mathematics" }, // Duplicate name without code - must not collide!
        ],
      }),
    });

    const res = await completeOnboarding(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    // Verify upsert calls generated non-empty unique codes
    expect(upsertSpy).toHaveBeenCalledTimes(3);
    const calls = upsertSpy.mock.calls;

    // Call 1: "Mathematics" -> generated slug "MATHEMAT"
    expect(calls[0][0].create.code).toBe("MATHEMAT");
    expect(calls[0][0].where.userId_code.code).toBe("MATHEMAT");

    // Call 2: "Physics" with code "PHYS-101"
    expect(calls[1][0].create.code).toBe("PHYS-101");
    expect(calls[1][0].where.userId_code.code).toBe("PHYS-101");

    // Call 3: "Mathematics" duplicate -> unique suffix "MATHEM-1"
    expect(calls[2][0].create.code).toBe("MATHEM-1");
    expect(calls[2][0].where.userId_code.code).toBe("MATHEM-1");
  });

  it("persists custom appearance presets and updates user record", async () => {
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

    let capturedUserUpdate: any = null;
    (prisma.$transaction as any).mockImplementationOnce((callback: any) =>
      callback({
        $queryRaw: vi.fn().mockResolvedValue([]),
        userCosmetic: { upsert: vi.fn() },
        subject: {
          findMany: vi.fn().mockResolvedValue([]),
          upsert: vi.fn(),
        },
        subjectNode: { createMany: vi.fn() },
        user: {
          update: vi.fn().mockImplementation(({ data }) => {
            capturedUserUpdate = data;
            return {
              id: 1,
              email: "scholar@system.dev",
              username: "shadow_monarch",
              name: "Jin-Woo",
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
            };
          }),
        },
      })
    );

    const req = new NextRequest("http://localhost:3000/api/user/onboarding", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        themeId: "#10b981",
        backgroundId: "simple",
        username: "shadow_monarch",
        name: "Jin-Woo",
      }),
    });

    const res = await completeOnboarding(req);
    expect(res.status).toBe(200);
    expect(capturedUserUpdate).toBeDefined();
    expect(capturedUserUpdate.activeTheme).toBe("#10b981");
    expect(capturedUserUpdate.activeBackground).toBe("simple");
    expect(capturedUserUpdate.username).toBe("shadow_monarch");
    expect(capturedUserUpdate.name).toBe("Jin-Woo");
    expect(capturedUserUpdate.hasCompletedOnboarding).toBe(true);
  });
});
