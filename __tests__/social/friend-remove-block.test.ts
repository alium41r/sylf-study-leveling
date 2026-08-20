/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as removeFriend } from "@/app/api/friends/remove/route";
import { POST as blockUser, DELETE as deleteBlock } from "@/app/api/friends/block/route";
import { POST as unblockUser } from "@/app/api/friends/unblock/route";
import { GET as getFriends } from "@/app/api/friends/route";
import { POST as sendFriendRequest } from "@/app/api/friends/requests/route";
import { GET as getProfile } from "@/app/api/profile/[username]/route";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { NextRequest } from "next/server";

describe("Friend Remove, Block & Unblock System", () => {
  const currentUserId = 101;
  const targetUserId = 202;
  let validToken: string;

  beforeEach(async () => {
    vi.restoreAllMocks();
    validToken = await signToken({ userId: currentUserId, email: "hunter101@system.dev" });
  });

  describe("POST /api/friends/remove", () => {
    it("rejects unauthorized requests with 401", async () => {
      const req = new NextRequest("http://localhost/api/friends/remove", {
        method: "POST",
        body: JSON.stringify({ targetUserId }),
      });
      const res = await removeFriend(req);
      expect(res.status).toBe(401);
    });

    it("rejects request without targetUserId with 400", async () => {
      const req = new NextRequest("http://localhost/api/friends/remove", {
        method: "POST",
        headers: { Authorization: `Bearer ${validToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const res = await removeFriend(req);
      expect(res.status).toBe(400);
    });

    it("successfully removes friendship and friend requests", async () => {
      vi.spyOn(prisma, "$executeRaw").mockResolvedValue(1 as any);

      const req = new NextRequest("http://localhost/api/friends/remove", {
        method: "POST",
        headers: { Authorization: `Bearer ${validToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });
      const res = await removeFriend(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.message).toContain("Friend removed");
    });
  });

  describe("POST /api/friends/block", () => {
    it("rejects unauthorized requests with 401", async () => {
      const req = new NextRequest("http://localhost/api/friends/block", {
        method: "POST",
        body: JSON.stringify({ targetUserId }),
      });
      const res = await blockUser(req);
      expect(res.status).toBe(401);
    });

    it("prevents blocking oneself with 400", async () => {
      const req = new NextRequest("http://localhost/api/friends/block", {
        method: "POST",
        headers: { Authorization: `Bearer ${validToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: currentUserId }),
      });
      const res = await blockUser(req);
      expect(res.status).toBe(400);
    });

    it("successfully blocks user, deletes friendship and creates BlockedUser record", async () => {
      vi.spyOn(prisma, "$executeRaw").mockResolvedValue(1 as any);

      const req = new NextRequest("http://localhost/api/friends/block", {
        method: "POST",
        headers: { Authorization: `Bearer ${validToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });
      const res = await blockUser(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.isBlocked).toBe(true);
    });
  });

  describe("POST /api/friends/unblock & DELETE /api/friends/block", () => {
    it("successfully unblocks user via POST /api/friends/unblock", async () => {
      vi.spyOn(prisma, "$executeRaw").mockResolvedValue(1 as any);

      const req = new NextRequest("http://localhost/api/friends/unblock", {
        method: "POST",
        headers: { Authorization: `Bearer ${validToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });
      const res = await unblockUser(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.isBlocked).toBe(false);
    });

    it("successfully unblocks user via DELETE /api/friends/block", async () => {
      vi.spyOn(prisma, "$executeRaw").mockResolvedValue(1 as any);

      const req = new NextRequest("http://localhost/api/friends/block", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${validToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });
      const res = await deleteBlock(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.isBlocked).toBe(false);
    });
  });

  describe("POST /api/friends/requests with blocked users", () => {
    it("prevents sending friend request if users are blocked", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce({
        id: targetUserId,
        username: "rival_hunter",
      } as any);

      vi.spyOn(prisma, "$queryRaw").mockResolvedValueOnce([{ id: 1 }] as any);

      const req = new NextRequest("http://localhost/api/friends/requests", {
        method: "POST",
        headers: { Authorization: `Bearer ${validToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ username: "rival_hunter" }),
      });

      const res = await sendFriendRequest(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("Unable to send friend request");
    });
  });

  describe("GET /api/friends filtering", () => {
    it("excludes blocked users from friends list", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce({ timezone: "UTC" } as any);
      vi.spyOn(prisma.friendship, "findMany").mockResolvedValueOnce([
        {
          id: 1,
          userId: currentUserId,
          friendId: targetUserId,
          friend: {
            id: targetUserId,
            name: "Blocked Friend",
            username: "blocked_guy",
            sessions: [],
          },
        },
      ] as any);

      // Return targetUserId as blocked
      vi.spyOn(prisma, "$queryRaw").mockResolvedValueOnce([
        { blockedId: targetUserId, userId: currentUserId },
      ] as any);

      const req = new NextRequest("http://localhost/api/friends", {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      const res = await getFriends(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveLength(0);
    });
  });

  describe("GET /api/profile/[username] relationship and permissions", () => {
    it("returns BLOCKED relationship and canUnblock permission when viewer blocked target", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce({
        id: targetUserId,
        username: "test7",
        privacy: null,
        achievements: [],
      } as any);

      vi.spyOn(prisma.friendship, "findFirst").mockResolvedValueOnce(null);
      vi.spyOn(prisma.conversationParticipant, "findFirst").mockResolvedValueOnce(null);

      // Viewer blocked target
      vi.spyOn(prisma, "$queryRaw")
        .mockResolvedValueOnce([{ id: 1 }] as any) // isUserBlocked(viewer, target) -> true
        .mockResolvedValueOnce([] as any); // isUserBlocked(target, viewer) -> false

      vi.spyOn(prisma.quest, "count").mockResolvedValueOnce(0);

      const req = new NextRequest("http://localhost/api/profile/test7", {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      const res = await getProfile(req, { params: Promise.resolve({ username: "test7" }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.relationship).toBe("BLOCKED");
      expect(data.permissions.canUnblock).toBe(true);
      expect(data.permissions.canSendFriendRequest).toBe(false);
      expect(data.permissions.canSendMessage).toBe(false);
    });
  });
});
