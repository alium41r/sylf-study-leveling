/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH as patchConversation } from "@/app/api/conversations/[id]/route";
import { POST as createConversation } from "@/app/api/conversations/route";
import { POST as sendMessage } from "@/app/api/conversations/[id]/messages/route";
import { PATCH as patchMessage } from "@/app/api/conversations/[id]/messages/[messageId]/route";
import { POST as sendFriendRequest } from "@/app/api/friends/requests/route";
import { blockUser } from "@/lib/block-service";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { NextRequest } from "next/server";

const CREATOR = 101;
const MEMBER = 202;
const OUTSIDER = 303;
const conversationId = 9001;

async function authedReq(userId: number, url: string, method: string, body?: unknown) {
  const token = await signToken({ userId, email: `u${userId}@system.dev`, tokenVersion: 1 });
  return new NextRequest(url, {
    method,
    headers: { cookie: `hunter_token=${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("S3: group administration is creator-only (server-enforced)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(prisma.conversationParticipant, "findUnique").mockResolvedValue({
      userId: MEMBER,
      conversationId,
    } as any);
    vi.spyOn(prisma.conversation, "findUnique").mockResolvedValue({
      id: conversationId,
      isGroup: true,
      createdBy: CREATOR,
      name: "Study Group",
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
  });

  it("rejects a non-creator participant renaming the group", async () => {
    const updateSpy = vi.spyOn(prisma.conversation, "update");
    const req = await authedReq(MEMBER, "http://localhost/api/conversations/9001", "PATCH", { name: "Hacked" });
    const res = await patchConversation(req, { params: Promise.resolve({ id: "9001" }) } as any);
    expect(res.status).toBe(403);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("rejects a non-creator participant adding members", async () => {
    const upsertSpy = vi.spyOn(prisma.conversationParticipant, "upsert");
    const req = await authedReq(MEMBER, "http://localhost/api/conversations/9001", "PATCH", { addMemberIds: [OUTSIDER] });
    const res = await patchConversation(req, { params: Promise.resolve({ id: "9001" }) } as any);
    expect(res.status).toBe(403);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("allows the creator to rename the group", async () => {
    vi.spyOn(prisma.conversationParticipant, "findUnique").mockResolvedValue({ userId: CREATOR, conversationId } as any);
    vi.spyOn(prisma.conversation, "update").mockResolvedValue({} as any);
    const req = await authedReq(CREATOR, "http://localhost/api/conversations/9001", "PATCH", { name: "Renamed" });
    const res = await patchConversation(req, { params: Promise.resolve({ id: "9001" }) } as any);
    expect(res.status).toBe(200);
    expect(prisma.conversation.update).toHaveBeenCalled();
  });
});

describe("S3: DM privacy (allowDirectMessages) is enforced server-side", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  async function dmAttempt(targetPrivacy: string, friendshipExists: boolean) {
    const target = { id: OUTSIDER, username: "target" } as any;
    vi.spyOn(prisma.conversation, "findFirst").mockResolvedValue(null as any);
    vi.spyOn(prisma.friendship, "findFirst").mockResolvedValue(friendshipExists ? ({ id: 1 } as any) : null);
    vi.spyOn(prisma.userPrivacy, "findUnique").mockResolvedValue({
      allowDirectMessages: targetPrivacy,
    } as any);
    // block-service raw query returns []
    vi.spyOn(prisma, "$queryRaw").mockResolvedValue([] as any);
    const req = await authedReq(CREATOR, "http://localhost/api/conversations", "POST", { participantIds: [OUTSIDER] });
    return createConversation(req);
  }

  it("PRIVATE recipients reject DMs with 403", async () => {
    const createSpy = vi.spyOn(prisma.conversation, "create");
    const res = await dmAttempt("PRIVATE", false);
    expect(res.status).toBe(403);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("FRIENDS-only recipients reject DMs from non-friends with 403", async () => {
    const createSpy = vi.spyOn(prisma.conversation, "create");
    const res = await dmAttempt("FRIENDS", false);
    expect(res.status).toBe(403);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("FRIENDS-only recipients accept DMs from existing friends", async () => {
    vi.spyOn(prisma.conversation, "create").mockResolvedValue({ id: 42 } as any);
    const res = await dmAttempt("FRIENDS", true);
    expect(res.status).toBe(201);
  });
});

describe("S3: blocks prevent messaging through stale memberships", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("blocking severs both memberships from shared DMs", async () => {
    const exec = vi.spyOn(prisma, "$executeRaw").mockResolvedValue(0 as any);
    await blockUser(CREATOR, MEMBER);
    // friendship removal + request removal + block insert + DM membership purge
    expect(exec).toHaveBeenCalledTimes(4);
    // $executeRaw is called with tagged-template args: [templateArray, ...values].
    const lastCall = (exec.mock.calls[3][0] as unknown as TemplateStringsArray).join("");
    expect(lastCall).toContain('"ConversationParticipant"');
    expect(lastCall).toContain('"isGroup" = false');
  });

  it("rejects sending into a conversation where either party blocks the other", async () => {
    vi.spyOn(prisma.conversationParticipant, "findUnique").mockResolvedValue({ userId: CREATOR, conversationId } as any);
    vi.spyOn(prisma.conversationParticipant, "findMany").mockResolvedValue([{ userId: MEMBER }] as any);
    // block-service areUsersBlocked returns true
    vi.spyOn(prisma, "$queryRaw").mockResolvedValue([{ id: 1 }] as any);
    const req = await authedReq(CREATOR, "http://localhost/api/conversations/9001/messages", "POST", { content: "hi" });
    const createSpy = vi.spyOn(prisma.message, "create");
    const res = await sendMessage(req, { params: Promise.resolve({ id: "9001" }) } as any);
    expect(res.status).toBe(403);
    expect(createSpy).not.toHaveBeenCalled();
  });
});

describe("S3: message mutation requires current membership/ownership", () => {
  it("rejects PATCH by a non-participant", async () => {
    vi.spyOn(prisma.conversationParticipant, "findUnique").mockResolvedValue(null as any);
    const req = await authedReq(OUTSIDER, "http://localhost/api/conversations/9001/messages/7", "PATCH", { content: "x" });
    const res = await patchMessage(req, { params: Promise.resolve({ id: "9001", messageId: "7" }) } as any);
    expect(res.status).toBe(403);
  });
});

describe("S3: allowFriendRequests is enforced server-side", () => {
  it("rejects requests to PRIVATE-policy users", async () => {
    vi.restoreAllMocks();
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue({ id: OUTSIDER, username: "target" } as any);
    vi.spyOn(prisma.friendship, "findFirst").mockResolvedValue(null as any);
    vi.spyOn(prisma.userPrivacy, "findUnique").mockResolvedValue({ allowFriendRequests: "PRIVATE" } as any);
    vi.spyOn(prisma, "$queryRaw").mockResolvedValue([] as any);
    const req = await authedReq(CREATOR, "http://localhost/api/friends/requests", "POST", { username: "target" });
    const createSpy = vi.spyOn(prisma.friendRequest, "create");
    const res = await sendFriendRequest(req);
    expect(res.status).toBe(403);
    expect(createSpy).not.toHaveBeenCalled();
  });
});
