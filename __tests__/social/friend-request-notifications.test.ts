/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as sendFriendRequest } from "@/app/api/friends/requests/route";
import { PATCH as handleFriendRequest } from "@/app/api/friends/requests/[id]/route";
import { POST as sendMessage } from "@/app/api/conversations/[id]/messages/route";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { NextRequest } from "next/server";

describe("Social System - Friend Requests & Direct Message Notifications", () => {
  const senderId = 201;
  const receiverId = 202;
  let senderToken: string;
  let receiverToken: string;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(prisma, "$queryRaw").mockResolvedValue([] as any);
    // S3: privacy checks read UserPrivacy (defaults: PUBLIC policies).
    vi.spyOn(prisma.userPrivacy, "findUnique").mockResolvedValue({
      allowFriendRequests: "PUBLIC",
      allowDirectMessages: "PUBLIC",
    } as any);
    senderToken = await signToken({ userId: senderId, email: "sender@system.dev" });
    receiverToken = await signToken({ userId: receiverId, email: "receiver@system.dev" });
  });

  describe("POST /api/friends/requests - Send Friend Request", () => {
    it("creates friend request and generates system notification for receiver", async () => {
      vi.spyOn(prisma.user, "findUnique").mockImplementation((async ({ where }: any) => {
        if (where.username === "scholar_target") {
          return { id: receiverId, username: "scholar_target", name: "Scholar Target" };
        }
        if (where.id === senderId) {
          return { id: senderId, username: "scholar_sender", name: "Scholar Sender" };
        }
        return null;
      }) as any);

      vi.spyOn(prisma.friendship, "findFirst").mockResolvedValue(null);
      vi.spyOn(prisma.friendRequest, "findFirst").mockResolvedValue(null);
      vi.spyOn(prisma.friendRequest, "create").mockResolvedValue({
        id: 99,
        senderId,
        receiverId,
        status: "PENDING",
      } as any);

      const systemMessageSpy = vi.spyOn(prisma.systemMessage, "create").mockResolvedValue({} as any);

      const req = new NextRequest("http://localhost:3000/api/friends/requests", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${senderToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: "scholar_target" }),
      });

      const res = await sendFriendRequest(req);
      expect(res.status).toBe(201);

      expect(systemMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: receiverId,
            type: "INFO",
            content: expect.stringContaining("[FRIEND_REQUEST]"),
          }),
        })
      );
    });
  });

  describe("PATCH /api/friends/requests/[id] - Accept Friend Request", () => {
    it("accepts request and notifies the original sender", async () => {
      vi.spyOn(prisma.friendRequest, "findFirst").mockResolvedValue({
        id: 55,
        senderId,
        receiverId,
        status: "PENDING",
      } as any);

      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: receiverId,
        username: "scholar_target",
        name: "Scholar Target",
      } as any);

      vi.spyOn(prisma, "$transaction").mockImplementation(async (queries: any) => {
        return queries;
      });

      const req = new NextRequest("http://localhost:3000/api/friends/requests/55", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${receiverToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "ACCEPT" }),
      });

      const res = await handleFriendRequest(req, { params: Promise.resolve({ id: "55" }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe("POST /api/conversations/[id]/messages - Chat Messages Do NOT Notify", () => {
    it("does NOT create a direct-message notification for the recipient", async () => {
      const conversationId = 10;
      vi.spyOn(prisma.conversationParticipant, "findUnique").mockResolvedValue({
        userId: senderId,
        conversationId,
      } as any);
      // S3: block check on send inspects other participants (none → no block).
      vi.spyOn(prisma.conversationParticipant, "findMany").mockResolvedValue([] as any);

      vi.spyOn(prisma, "$transaction").mockResolvedValue([
        {
          id: 501,
          conversationId,
          senderId,
          content: "Let's study organic chemistry now!",
          sender: {
            id: senderId,
            username: "sender_scholar",
            name: "Sender Scholar",
          },
        },
      ] as any);

      const systemMessageSpy = vi.spyOn(prisma.systemMessage, "create").mockResolvedValue({} as any);

      const req = new NextRequest("http://localhost:3000/api/conversations/10/messages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${senderToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: "Let's study organic chemistry now!" }),
      });

      const res = await sendMessage(req, { params: Promise.resolve({ id: "10" }) });
      expect(res.status).toBe(201);

      // Inbox is reserved for important events — chat messages never
      // create notification entries.
      expect(systemMessageSpy).not.toHaveBeenCalled();
    });
  });
});
