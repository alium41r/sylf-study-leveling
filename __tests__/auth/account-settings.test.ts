/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH as updateAccount } from "@/app/api/user/account/route";
import { POST as sendVerification } from "@/app/api/auth/verify-email/send/route";
import { POST as confirmVerification } from "@/app/api/auth/verify-email/confirm/route";
import { GET as getConnections } from "@/app/api/user/connections/route";
import { DELETE as deleteConnection } from "@/app/api/user/connections/[provider]/route";
import { signToken, verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    verificationToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    connectedAccount: {
      findMany: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe("Phase 3: Account Settings Data Binding & Profile Management", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("PATCH /api/user/account", () => {
    it("rejects unauthenticated request with 401", async () => {
      const req = new NextRequest("http://localhost:3000/api/user/account", {
        method: "PATCH",
        body: JSON.stringify({ name: "Sung Jin-Woo" }),
      });

      const res = await updateAccount(req);
      expect(res.status).toBe(401);
    });

    it("rejects invalid username format with 400", async () => {
      const token = await signToken({ userId: 1, email: "user@system.dev", username: "valid_name" });
      const req = new NextRequest("http://localhost:3000/api/user/account", {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ username: "invalid-user-name!" }),
      });

      const res = await updateAccount(req);
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain("Username must be 3-20 characters");
    });

    it("rejects duplicate username with 409 conflict", async () => {
      const token = await signToken({ userId: 1, email: "user@system.dev", username: "current_user" });
      
      (prisma.user.findUnique as any)
        .mockResolvedValueOnce({ id: 1, email: "user@system.dev", username: "current_user" }) // current user
        .mockResolvedValueOnce({ id: 2, username: "taken_user" }); // duplicate check

      const req = new NextRequest("http://localhost:3000/api/user/account", {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ username: "taken_user" }),
      });

      const res = await updateAccount(req);
      const data = await res.json();
      expect(res.status).toBe(409);
      expect(data.error).toBe("This username is already taken.");
    });

    it("successfully updates username & name, signs fresh session token, and sets cookie", async () => {
      const token = await signToken({
        userId: 1,
        email: "scholar@system.dev",
        username: "old_user",
        name: "Old Name",
        verificationStatus: "VERIFIED",
        hunterRank: "E",
        level: 1,
      });

      (prisma.user.findUnique as any)
        .mockResolvedValueOnce({ id: 1, email: "scholar@system.dev", username: "old_user", name: "Old Name" }) // current user
        .mockResolvedValueOnce(null); // username duplicate check is free

      (prisma.user.update as any).mockResolvedValueOnce({
        id: 1,
        email: "scholar@system.dev",
        username: "monarch_hunter",
        name: "Sung Jin-Woo",
        scholarId: "#000001",
        verificationStatus: "VERIFIED",
        hunterRank: "S",
        level: 100,
        currentXP: 500,
        hp: 100,
        maxHp: 100,
        streakDays: 10,
        totalStudyMinutes: 300,
        hasCompletedOnboarding: true,
        createdAt: new Date(),
        avatarUrl: null,
      });

      const req = new NextRequest("http://localhost:3000/api/user/account", {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          username: "monarch_hunter",
          name: "Sung Jin-Woo",
        }),
      });

      const res = await updateAccount(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.user.username).toBe("monarch_hunter");
      expect(data.user.name).toBe("Sung Jin-Woo");
      expect(data.token).toBeDefined();

      // Verify token contains fresh username and name
      const verified = await verifyToken(data.token);
      expect(verified?.username).toBe("monarch_hunter");
      expect(verified?.name).toBe("Sung Jin-Woo");

      // Verify cookie was set
      const cookieHeader = res.headers.get("set-cookie");
      expect(cookieHeader).toContain("hunter_token=");
    });

    it("resets verificationStatus to UNVERIFIED when email address changes", async () => {
      const token = await signToken({
        userId: 1,
        email: "old_email@system.dev",
        username: "scholar_1",
        verificationStatus: "VERIFIED",
      });

      (prisma.user.findUnique as any)
        .mockResolvedValueOnce({ id: 1, email: "old_email@system.dev", username: "scholar_1", verificationStatus: "VERIFIED" }) // current
        .mockResolvedValueOnce(null); // email duplicate check free

      (prisma.user.update as any).mockResolvedValueOnce({
        id: 1,
        email: "new_email@system.dev",
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
      });

      const req = new NextRequest("http://localhost:3000/api/user/account", {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "new_email@system.dev",
        }),
      });

      const res = await updateAccount(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.user.verificationStatus).toBe("UNVERIFIED");

      // Check that token also reflects UNVERIFIED
      const verified = await verifyToken(data.token);
      expect(verified?.verificationStatus).toBe("UNVERIFIED");
    });
  });

  describe("Email Verification Trigger & Confirmation", () => {
    it("POST /api/auth/verify-email/send creates token for unverified user", async () => {
      const token = await signToken({ userId: 1, email: "hunter@system.dev" });
      (prisma.user.findUnique as any).mockResolvedValueOnce({
        id: 1,
        email: "hunter@system.dev",
        name: "Hunter",
        verificationStatus: "UNVERIFIED",
      });
      (prisma.verificationToken.create as any).mockResolvedValueOnce({
        token: "mock-uuid-token",
        userId: 1,
        expiresAt: new Date(Date.now() + 86400000),
      });

      const req = new NextRequest("http://localhost:3000/api/auth/verify-email/send", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });

      const res = await sendVerification(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain("Verification link sent");
    });

    it("POST /api/auth/verify-email/confirm verifies user with valid token", async () => {
      (prisma.verificationToken.findUnique as any).mockResolvedValueOnce({
        token: "valid-token",
        userId: 1,
        expiresAt: new Date(Date.now() + 3600000),
        user: { id: 1, email: "hunter@system.dev" },
      });

      (prisma.user.update as any).mockResolvedValueOnce({
        id: 1,
        email: "hunter@system.dev",
        verificationStatus: "VERIFIED",
      });
      (prisma.verificationToken.delete as any).mockResolvedValueOnce({});

      const req = new NextRequest("http://localhost:3000/api/auth/verify-email/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "valid-token" }),
      });

      const res = await confirmVerification(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain("Email verified successfully");
    });
  });

  describe("Connected Accounts & Disconnect Safety Guard", () => {
    it("GET /api/user/connections returns providers and connection status", async () => {
      const token = await signToken({ userId: 1 });
      (prisma.connectedAccount.findMany as any).mockResolvedValueOnce([
        { provider: "GOOGLE", providerEmail: "hunter@gmail.com", createdAt: new Date() },
      ]);

      const req = new NextRequest("http://localhost:3000/api/user/connections", {
        headers: { authorization: `Bearer ${token}` },
      });

      const res = await getConnections(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.connections).toBeDefined();
      const google = data.connections.find((c: any) => c.provider === "GOOGLE");
      expect(google.isLinked).toBe(true);
      expect(google.email).toBe("hunter@gmail.com");
    });

    it("DELETE /api/user/connections/[provider] rejects if it is the sole authentication method", async () => {
      const token = await signToken({ userId: 1 });
      (prisma.user.findUnique as any).mockResolvedValueOnce({
        id: 1,
        password: null, // No password set
        connectedAccounts: [{ id: 10, provider: "GOOGLE" }], // Only one OAuth account
      });

      const req = new NextRequest("http://localhost:3000/api/user/connections/google", {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });

      const res = await deleteConnection(req, { params: Promise.resolve({ provider: "google" }) });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain("cannot disconnect your only login method");
    });

    it("DELETE /api/user/connections/[provider] succeeds if user has a password configured", async () => {
      const token = await signToken({ userId: 1 });
      (prisma.user.findUnique as any).mockResolvedValueOnce({
        id: 1,
        password: "hashed_secure_password", // Password is present
        connectedAccounts: [{ id: 10, provider: "GOOGLE" }],
      });
      (prisma.connectedAccount.delete as any).mockResolvedValueOnce({});

      const req = new NextRequest("http://localhost:3000/api/user/connections/google", {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });

      const res = await deleteConnection(req, { params: Promise.resolve({ provider: "google" }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain("disconnected successfully");
    });
  });
});
