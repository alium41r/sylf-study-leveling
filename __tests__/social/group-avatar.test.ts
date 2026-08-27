/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getConversation, PATCH as patchConversation } from "@/app/api/conversations/[id]/route";
import { GET as getConversations, POST as createConversation } from "@/app/api/conversations/route";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { NextRequest } from "next/server";

describe("Group Profile Picture & Conversation Avatar System", () => {
  const currentUserId = 101;
  const conversationId = 55;
  let validToken: string;

  beforeEach(async () => {
    vi.restoreAllMocks();
    validToken = await signToken({ userId: currentUserId, email: "hunter101@system.dev" });
  });

  describe("GET /api/conversations/[id]", () => {
    it("returns conversation avatarUrl in response payload", async () => {
      vi.spyOn(prisma.conversationParticipant, "findUnique").mockResolvedValue({
        id: 1,
        userId: currentUserId,
        conversationId,
        joinedAt: new Date(),
        lastReadAt: new Date(),
      } as any);

      vi.spyOn(prisma.conversation, "findUnique").mockResolvedValue({
        id: conversationId,
        name: "Shadow Guild",
        avatarUrl: "data:image/webp;base64,mockAvatarData",
        isGroup: true,
        createdBy: currentUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
        participants: [
          {
            user: {
              id: currentUserId,
              name: "Ali",
              username: "ali",
              hunterRank: "S",
              level: 50,
              avatarUrl: null,
              activeAvatar: "class_scholar",
              activeFrame: "frame_default",
              activeTitle: "Shadow Monarch",
              characterConfig: null,
              bio: "Focusing",
              bannerUrl: null,
              createdAt: new Date(),
              lastSeenAt: new Date(),
            },
          },
        ],
      } as any);

      vi.spyOn(prisma.message, "findMany").mockResolvedValue([]);
      vi.spyOn(prisma.conversationParticipant, "update").mockResolvedValue({} as any);

      const req = new NextRequest(`http://localhost/api/conversations/${conversationId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${validToken}` },
      });

      const res = await getConversation(req, { params: Promise.resolve({ id: String(conversationId) }) });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.conversation).toBeDefined();
      expect(data.conversation.id).toBe(conversationId);
      expect(data.conversation.avatarUrl).toBe("data:image/webp;base64,mockAvatarData");
      expect(data.conversation.name).toBe("Shadow Guild");
    });
  });

  describe("PATCH /api/conversations/[id]", () => {
    it("updates group avatarUrl via PATCH", async () => {
      vi.spyOn(prisma.conversationParticipant, "findUnique").mockResolvedValue({
        id: 1,
        userId: currentUserId,
        conversationId,
      } as any);

      vi.spyOn(prisma.conversation, "findUnique").mockResolvedValue({
        id: conversationId,
        isGroup: true,
        createdBy: currentUserId,
        name: "Shadow Guild",
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const updateSpy = vi.spyOn(prisma.conversation, "update").mockResolvedValue({
        id: conversationId,
      } as any);

      const newAvatarUrl = "https://example.com/guild-avatar.webp";
      const req = new NextRequest(`http://localhost/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${validToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: newAvatarUrl }),
      });

      const res = await patchConversation(req, { params: Promise.resolve({ id: String(conversationId) }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: conversationId },
        data: { avatarUrl: newAvatarUrl },
      });
    });

    it("allows removing avatarUrl by passing null or empty string", async () => {
      vi.spyOn(prisma.conversationParticipant, "findUnique").mockResolvedValue({
        id: 1,
        userId: currentUserId,
        conversationId,
      } as any);

      vi.spyOn(prisma.conversation, "findUnique").mockResolvedValue({
        id: conversationId,
        isGroup: true,
        createdBy: currentUserId,
        name: "Shadow Guild",
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const updateSpy = vi.spyOn(prisma.conversation, "update").mockResolvedValue({
        id: conversationId,
      } as any);

      const req = new NextRequest(`http://localhost/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${validToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: null }),
      });

      const res = await patchConversation(req, { params: Promise.resolve({ id: String(conversationId) }) });
      expect(res.status).toBe(200);

      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: conversationId },
        data: { avatarUrl: null },
      });
    });
  });

  describe("POST /api/conversations (Create Group with Avatar)", () => {
    it("creates group conversation with specified avatarUrl", async () => {
      const createSpy = vi.spyOn(prisma.conversation, "create").mockResolvedValue({
        id: 77,
        name: "Research Cohort",
        avatarUrl: "data:image/webp;base64,initialAvatar",
        isGroup: true,
        createdBy: currentUserId,
      } as any);

      const req = new NextRequest("http://localhost/api/conversations", {
        method: "POST",
        headers: { Authorization: `Bearer ${validToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          participantIds: [202, 303],
          name: "Research Cohort",
          avatarUrl: "data:image/webp;base64,initialAvatar",
          isGroup: true,
        }),
      });

      const res = await createConversation(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.id).toBe(77);

      expect(createSpy).toHaveBeenCalledWith({
        data: {
          name: "Research Cohort",
          avatarUrl: "data:image/webp;base64,initialAvatar",
          isGroup: true,
          createdBy: currentUserId,
          participants: {
            create: [
              { userId: currentUserId },
              { userId: 202 },
              { userId: 303 },
            ],
          },
        },
      });
    });
  });

  describe("GET /api/conversations", () => {
    it("returns list of conversations containing avatarUrl", async () => {
      vi.spyOn(prisma.conversationParticipant, "findMany").mockResolvedValue([
        {
          userId: currentUserId,
          lastReadAt: new Date(),
          conversation: {
            id: 55,
            name: "Study Group Alpha",
            avatarUrl: "https://example.com/icon.png",
            isGroup: true,
            updatedAt: new Date(),
            participants: [
              {
                user: {
                  id: currentUserId,
                  name: "Ali",
                  username: "ali",
                  hunterRank: "S",
                  level: 50,
                  avatarUrl: null,
                  activeAvatar: "class_scholar",
                  activeFrame: "frame_default",
                  characterConfig: null,
                  lastSeenAt: new Date(),
                },
              },
            ],
            messages: [],
          },
        },
      ] as any);

      const req = new NextRequest("http://localhost/api/conversations", {
        method: "GET",
        headers: { Authorization: `Bearer ${validToken}` },
      });

      const res = await getConversations(req);
      expect(res.status).toBe(200);
      const convs = await res.json();
      expect(Array.isArray(convs)).toBe(true);
      expect(convs.length).toBe(1);
      expect(convs[0].avatarUrl).toBe("https://example.com/icon.png");
      expect(convs[0].isGroup).toBe(true);
    });
  });
});
