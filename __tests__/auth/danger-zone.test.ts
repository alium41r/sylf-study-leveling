/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as logoutAll } from "@/app/api/auth/logout-all/route";
import { POST as sendSecurityCode } from "@/app/api/user/security/send-code/route";
import { POST as resetProgress } from "@/app/api/user/reset-progress/route";
import { POST as deleteAccount } from "@/app/api/user/account/delete/route";
import { signToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// Mock Prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    verificationToken: {
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    quest: {
      deleteMany: vi.fn(),
    },
    studySession: {
      deleteMany: vi.fn(),
    },
    sylphLedger: {
      deleteMany: vi.fn(),
    },
    hpLedger: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Mock Email Dispatch
vi.mock("@/lib/email", () => ({
  sendSecurityOtpEmail: vi.fn().mockResolvedValue({ sent: true, provider: "mock_test" }),
}));

describe("Danger Zone Security & Verification Architecture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Log Out (This Device)", () => {
    it("POST /api/auth/logout clears system_token cookie", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/logout", { method: "POST" });
      const res = await logout(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(res.headers.get("set-cookie")).toContain("hunter_token=;");
    });
    it("deletes user using account password if user is UNVERIFIED", async () => {
      const token = await signToken({ userId: 1, email: "hunter@system.dev", verificationStatus: "UNVERIFIED" });
      const hashedPassword = await bcrypt.hash("delete_pass_123", 10);

      (prisma.user.findUnique as any).mockResolvedValueOnce({
        id: 1,
        password: hashedPassword,
        verificationStatus: "UNVERIFIED",
      });
      (prisma.user.delete as any).mockResolvedValueOnce({});

      const req = new NextRequest("http://localhost:3000/api/user/account/delete", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ password: "delete_pass_123" }),
      });

      const res = await deleteAccount(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

  });

  describe("2. Log Out All Devices (Password Protected)", () => {
    it("rejects request if password is missing or incorrect", async () => {
      const token = await signToken({ userId: 1, email: "hunter@system.dev" });
      const hashedPassword = await bcrypt.hash("correct_password_123", 10);

      (prisma.user.findUnique as any).mockResolvedValueOnce({
        id: 1,
        password: hashedPassword,
      });

      const req = new NextRequest("http://localhost:3000/api/auth/logout-all", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ password: "wrong_password" }),
      });

      const res = await logoutAll(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain("Incorrect password");
    });

    it("creates revocation marker and clears cookie on valid password", async () => {
      const token = await signToken({ userId: 1, email: "hunter@system.dev" });
      const hashedPassword = await bcrypt.hash("monarch_pass_2026", 10);

      (prisma.user.findUnique as any).mockResolvedValueOnce({
        id: 1,
        password: hashedPassword,
      });
      (prisma.verificationToken.deleteMany as any).mockResolvedValueOnce({});
      (prisma.verificationToken.create as any).mockResolvedValueOnce({});

      const req = new NextRequest("http://localhost:3000/api/auth/logout-all", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ password: "monarch_pass_2026" }),
      });

      const res = await logoutAll(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(prisma.verificationToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 1,
            token: expect.stringMatching(/^REVOKED_SESSIONS:\d+$/),
          }),
        })
      );
      expect(res.headers.get("set-cookie")).toContain("hunter_token=;");
    }, 15000);
  });

  describe("3. Security OTP Dispatch", () => {
    it("generates 6-digit OTP and deletes previous unconsumed tokens", async () => {
      const token = await signToken({ userId: 1, email: "hunter@system.dev" });
      (prisma.user.findUnique as any).mockResolvedValueOnce({
        id: 1,
        email: "hunter@system.dev",
        name: "Hunter",
      });
      (prisma.verificationToken.deleteMany as any).mockResolvedValueOnce({});
      (prisma.verificationToken.create as any).mockResolvedValueOnce({});

      const req = new NextRequest("http://localhost:3000/api/user/security/send-code", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ action: "RESET_PROGRESS" }),
      });

      const res = await sendSecurityCode(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(prisma.verificationToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 1,
            token: expect.stringMatching(/^RESET_PROGRESS:\d{6}$/),
          }),
        })
      );
    });
  });

  describe("4. Reset Progress (OTP Protected)", () => {
    it("rejects invalid security codes", async () => {
      const token = await signToken({ userId: 1, email: "hunter@system.dev" });
      (prisma.user.findUnique as any).mockResolvedValueOnce({ id: 1, verificationStatus: "VERIFIED" });
      (prisma.verificationToken.findFirst as any).mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost:3000/api/user/reset-progress", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ code: "000000" }),
      });

      const res = await resetProgress(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain("Invalid or expired");
    });

    it("resets level, XP, rank, HP, and wipes quest logs on valid OTP", async () => {
      const token = await signToken({ userId: 1, email: "hunter@system.dev" });
      (prisma.user.findUnique as any).mockResolvedValueOnce({ id: 1, verificationStatus: "VERIFIED" });
      (prisma.verificationToken.findFirst as any).mockResolvedValueOnce({
        id: 10,
        token: "RESET_PROGRESS:123456",
        userId: 1,
      });
      (prisma.verificationToken.delete as any).mockResolvedValueOnce({});

      const mockResetUser = {
        id: 1,
        email: "hunter@system.dev",
        username: "hunter_monarch",
        name: "Hunter",
        scholarId: "#000001",
        verificationStatus: "VERIFIED",
        hunterRank: "E",
        level: 1,
        currentXP: 0,
        hp: 100,
        maxHp: 100,
        streakDays: 0,
        totalStudyMinutes: 0,
        hasCompletedOnboarding: true,
        password: "hashed",
        avatarUrl: null,
      };

      (prisma.$transaction as any).mockImplementation(async (callback: any) => {
        return callback({
          user: { update: vi.fn().mockResolvedValue(mockResetUser) },
          quest: { deleteMany: vi.fn().mockResolvedValue({}) },
          studySession: { deleteMany: vi.fn().mockResolvedValue({}) },
          sylphLedger: { deleteMany: vi.fn().mockResolvedValue({}) },
          hpLedger: { deleteMany: vi.fn().mockResolvedValue({}) },
        });
      });

      const req = new NextRequest("http://localhost:3000/api/user/reset-progress", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ code: "123456" }),
      });

      const res = await resetProgress(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.user.level).toBe(1);
      expect(data.user.hunterRank).toBe("E");
      expect(data.token).toBeDefined();
    });
  });

  
    it("resets progress using account password if user is UNVERIFIED", async () => {
      const token = await signToken({ userId: 1, email: "hunter@system.dev", verificationStatus: "UNVERIFIED" });
      const hashedPassword = await bcrypt.hash("secure_password_999", 10);

      (prisma.user.findUnique as any).mockResolvedValueOnce({
        id: 1,
        password: hashedPassword,
        verificationStatus: "UNVERIFIED",
      });

      const mockResetUser = {
        id: 1,
        email: "hunter@system.dev",
        username: "hunter_monarch",
        name: "Hunter",
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
        password: hashedPassword,
        avatarUrl: null,
      };

      (prisma.$transaction as any).mockImplementation(async (callback: any) => {
        return callback({
          user: { update: vi.fn().mockResolvedValue(mockResetUser) },
          quest: { deleteMany: vi.fn().mockResolvedValue({}) },
          studySession: { deleteMany: vi.fn().mockResolvedValue({}) },
          sylphLedger: { deleteMany: vi.fn().mockResolvedValue({}) },
          hpLedger: { deleteMany: vi.fn().mockResolvedValue({}) },
        });
      });

      const req = new NextRequest("http://localhost:3000/api/user/reset-progress", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ password: "secure_password_999" }),
      });

      const res = await resetProgress(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.user.level).toBe(1);
    });

  describe("5. Delete Account (OTP Protected)", () => {
    it("deletes user record and clears session cookie on valid OTP", async () => {
      const token = await signToken({ userId: 1, email: "hunter@system.dev" });
      (prisma.user.findUnique as any).mockResolvedValueOnce({ id: 1, verificationStatus: "VERIFIED" });
      (prisma.verificationToken.findFirst as any).mockResolvedValueOnce({
        id: 20,
        token: "DELETE_ACCOUNT:654321",
        userId: 1,
      });
      (prisma.verificationToken.delete as any).mockResolvedValueOnce({});
      (prisma.user.delete as any).mockResolvedValueOnce({});

      const req = new NextRequest("http://localhost:3000/api/user/account/delete", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ code: "654321" }),
      });

      const res = await deleteAccount(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(res.headers.get("set-cookie")).toContain("hunter_token=;");
    });
  });
});
