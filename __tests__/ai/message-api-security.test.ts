/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/system-messages/route";
import { getSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { markOutputLimit } from "@/lib/ai/sylvie/completion";
vi.mock("@/lib/auth-server", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  chatSession: { findFirst: vi.fn(), create: vi.fn() },
  systemMessage: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
} }));
const request = (body: unknown) => new NextRequest("http://localhost/api/system-messages", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue({ userId: 7, email: "fixture@example.invalid" });
  vi.mocked(prisma.chatSession.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.systemMessage.findMany).mockResolvedValue([]);
  vi.mocked(prisma.systemMessage.count).mockResolvedValue(0);
});
describe("direct message ownership and bounds", () => {
  it("restores incomplete-response metadata without exposing its storage marker", async () => {
    vi.mocked(prisma.systemMessage.findMany).mockResolvedValue([{ id: 91, sessionId: 123, type: "INFO", content: markOutputLimit("Partial answer"), attachmentUrl: null }] as never);
    const response = await GET(new NextRequest("http://localhost/api/system-messages?sessionId=123"));
    const reply = await response.json();
    expect(reply.messages[0]).toMatchObject({ content: "Partial answer", truncated: true });
    expect(JSON.stringify(reply)).not.toContain("sylvie-incomplete");
  });
  it("rejects foreign or missing conversations before writing", async () => {
    expect((await POST(request({ content: "Fixture", sessionId: 123 }))).status).toBe(404);
    expect(prisma.chatSession.findFirst).toHaveBeenCalledWith({ where: { id: 123, userId: 7 }, select: { id: true } });
    expect(prisma.systemMessage.create).not.toHaveBeenCalled();
    expect(prisma.chatSession.create).not.toHaveBeenCalled();
  });
  it("accepts an owned conversation and derives the author from authentication", async () => {
    vi.mocked(prisma.chatSession.findFirst).mockResolvedValue({ id: 123 } as never);
    vi.mocked(prisma.systemMessage.create).mockResolvedValue({ id: 1 } as never);
    expect((await POST(request({ content: "Fixture", sessionId: 123, userId: 999 }))).status).toBe(200);
    expect(prisma.systemMessage.create).toHaveBeenCalledWith({ data: { userId: 7, sessionId: 123, content: "Fixture", type: "SYSTEM", read: false } });
  });
  it.each([{ content: "" }, { content: "x".repeat(20_001) }, { content: "x", sessionId: "123" }, { content: "x", type: "DAILY_BRIEFING" }])("rejects malformed direct messages without creating a conversation", async body => {
    expect((await POST(request(body))).status).toBe(400);
    expect(prisma.chatSession.create).not.toHaveBeenCalled();
  });
  it.each(["1000000", "-20", "NaN"])("bounds history size for limit=%s", async limit => {
    expect((await GET(new NextRequest(`http://localhost/api/system-messages?limit=${limit}`))).status).toBe(200);
    expect(prisma.systemMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 7 }, take: limit === "1000000" ? 100 : limit === "-20" ? 1 : 50 }));
  });
  it("rejects a partially numeric conversation ID", async () => {
    expect((await GET(new NextRequest("http://localhost/api/system-messages?sessionId=12oops"))).status).toBe(400);
    expect(prisma.systemMessage.findMany).not.toHaveBeenCalled();
  });
});
