import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const prisma = vi.hoisted(() => ({
  conversationParticipant: { findUnique: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn(), upsert: vi.fn() },
  conversation: { findUnique: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/auth-server", () => ({ getSession: vi.fn().mockResolvedValue({ userId: 1 }) }));
vi.mock("@/lib/block-service", () => ({ mayAddToConversation: vi.fn().mockResolvedValue(true) }));

import { PATCH } from "@/app/api/conversations/[id]/route";

const call = (body: unknown) => PATCH(new NextRequest("http://localhost/api/conversations/7", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "7" }) });

describe("A-28: a group keeps a manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.conversationParticipant.findUnique.mockResolvedValue({ id: 1 });
    prisma.conversation.findUnique.mockResolvedValue({ id: 7, isGroup: true, createdBy: 1, name: "Maths" });
    prisma.conversation.update.mockImplementation(async ({ data }: { data: object }) => ({ id: 7, name: "Maths", avatarUrl: null, isGroup: true, ...data }));
  });
  it("hands management to the longest-standing member when the creator leaves", async () => {
    prisma.conversationParticipant.findFirst.mockResolvedValue({ userId: 4 });
    const response = await call({ removeMemberIds: [1] });
    expect(response.status).toBe(200);
    expect(prisma.conversationParticipant.findFirst).toHaveBeenCalledWith(expect.objectContaining({ orderBy: [{ joinedAt: "asc" }, { id: "asc" }] }));
    expect(prisma.conversation.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { createdBy: 4 } });
  });
  it("leaves the creator alone when someone else is removed", async () => {
    const response = await call({ removeMemberIds: [5] });
    expect(response.status).toBe(200);
    expect(prisma.conversationParticipant.findFirst).not.toHaveBeenCalled();
    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });
  it("changes nothing when the creator was the last member", async () => {
    prisma.conversationParticipant.findFirst.mockResolvedValue(null);
    await call({ removeMemberIds: [1] });
    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });
});
