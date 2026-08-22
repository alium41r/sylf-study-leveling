/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as registerHandler } from "@/app/api/auth/register/route";
import { POST as loginHandler } from "@/app/api/auth/login/route";
import { POST as sendVerifyHandler } from "@/app/api/auth/verify-email/send/route";
import { POST as confirmVerifyHandler } from "@/app/api/auth/verify-email/confirm/route";
import { GET as userStatsHandler } from "@/app/api/user/stats/route";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";

describe("Phase 1: API Route Handlers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("POST /api/auth/register", () => {
    it("validates incoming registration data", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email: "invalid-email", password: "123", name: "", username: "a" }),
      });

      const res = await registerHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Invalid data");
    });
  });

  describe("POST /api/auth/login", () => {
    it("authenticates valid credentials and returns initialized Scholar identity", async () => {
      const hashedPassword = await bcrypt.hash("securePassword123", 10);
      const mockUser = {
        id: 42,
        email: "hunter@system.dev",
        username: "system_hunter",
        name: "Hunter Name",
        password: hashedPassword,
        scholarId: "#000042",
        verificationStatus: "UNVERIFIED" as const,
        hunterRank: "E",
        level: 1,
        currentXP: 0,
        hp: 100,
        maxHp: 100,
        streakDays: 0,
        totalStudyMinutes: 0,
        hasCompletedOnboarding: false,
        createdAt: new Date(),
        avatarUrl: null,
      };

      vi.spyOn(prisma.user, "findFirst").mockResolvedValue(mockUser as any);

      const req = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "hunter@system.dev", password: "securePassword123" }),
      });

      const res = await loginHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.user.scholarId).toBe("#000042");
      expect(data.user.verificationStatus).toBe("UNVERIFIED");
      expect(data.user.hunterRank).toBe("E");
      expect(data.user.level).toBe(1);
      expect(data.user.hp).toBe(100);
      expect(typeof data.token).toBe("string");
      expect(res.cookies.get("hunter_token")).toBeDefined();
    });

    it("rejects incorrect password", async () => {
      const hashedPassword = await bcrypt.hash("correctPassword", 10);
      const mockUser = {
        id: 42,
        email: "hunter@system.dev",
        username: "system_hunter",
        password: hashedPassword,
      };

      vi.spyOn(prisma.user, "findFirst").mockResolvedValue(mockUser as any);

      const req = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "hunter@system.dev", password: "wrongPassword" }),
      });

      const res = await loginHandler(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("Invalid credentials");
    });
  });

  describe("GET /api/user/stats", () => {
    it("returns authenticated user stats and formatted scholar ID", async () => {
      const token = await signToken({
        userId: 99,
        email: "hunter99@system.dev",
        username: "hunter99",
      });

      const mockDbUser = {
        id: 99,
        email: "hunter99@system.dev",
        username: "hunter99",
        name: "Hunter 99",
        scholarId: "#000099",
        verificationStatus: "VERIFIED",
        avatarUrl: null,
        hunterRank: "E",
        level: 1,
        currentXP: 0,
        hp: 100,
        maxHp: 100,
        streakDays: 0,
        totalStudyMinutes: 0,
        lastActiveDate: "",
        createdAt: new Date(),
        sylph: 0,
        hasCompletedOnboarding: false,
      };

      vi.spyOn(prisma.user, "findUnique").mockResolvedValue(mockDbUser as any);

      const req = new NextRequest("http://localhost:3000/api/user/stats", {
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      const res = await userStatsHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.scholarId).toBe("#000099");
      expect(data.verificationStatus).toBe("VERIFIED");
      expect(data.level).toBe(1);
      // Canonical Lv-1 bucket: XP_req(2) = floor(100 * 2^1.5) = 282
      expect(data.xpToNextLevel).toBe(282);
    });
  });

  describe("POST /api/auth/verify-email/confirm", () => {
    it("rejects missing or invalid token", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/verify-email/confirm", {
        method: "POST",
        body: JSON.stringify({}),
      });

      const res = await confirmVerifyHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Verification token is required.");
    });
  });
});
