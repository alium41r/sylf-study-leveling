/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH as settleSession } from "@/app/api/sessions/route";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { NextRequest } from "next/server";

describe("S4: study-session settle flood guard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a final settle when the user settled 6+ sessions in the last minute", async () => {
    const token = await signToken({ userId: 1, email: "h@system.dev" });
    vi.spyOn(prisma.studySession, "count").mockResolvedValue(6);

    const req = new NextRequest("http://localhost/api/sessions", {
      method: "PATCH",
      headers: { cookie: `hunter_token=${token}`, "content-type": "application/json" },
      body: JSON.stringify({ id: 42, durationMinutes: 2, final: true }),
    });

    const res = await settleSession(req);
    expect(res.status).toBe(429);
  });

  it("allows a final settle under the flood threshold (count < 6)", async () => {
    const token = await signToken({ userId: 1, email: "h@system.dev" });
    vi.spyOn(prisma.studySession, "count").mockResolvedValue(2);
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue(null);
    // The RPC itself will fail without a real DB — that failure proves the
    // guard did NOT fire (we reach the settlement stage, not the 429).
    vi.spyOn(prisma, "$queryRaw").mockRejectedValue(new Error("no live RPC in tests"));

    const req = new NextRequest("http://localhost/api/sessions", {
      method: "PATCH",
      headers: { cookie: `hunter_token=${token}`, "content-type": "application/json" },
      body: JSON.stringify({ id: 42, durationMinutes: 2, final: true }),
    });

    const res = await settleSession(req);
    expect(res.status).not.toBe(429);
  });
});
