import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST, PATCH, DELETE } from "@/app/api/calendar/personal/route";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import {
  readPersonalCalendar,
  writePersonalCalendar,
  deletePersonalCalendar,
  CalendarError,
} from "@/lib/calendar/personal-service";
vi.mock("next/server",async original=>({...await original<typeof import("next/server")>(),after:vi.fn()}));
vi.mock("@/lib/prisma", () => ({
  prisma: { calendarNote: { findFirst: vi.fn() } },
}));
vi.mock("@/lib/auth-server", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/calendar/personal-service", () => ({
  readPersonalCalendar: vi.fn(),
  writePersonalCalendar: vi.fn(),
  deletePersonalCalendar: vi.fn(),
  CalendarError: class extends Error {
    constructor(
      message: string,
      public status: number
    ) {
      super(message);
    }
  },
}));
const id = "548335cf-214b-41d5-a234-58b629929423";
const body = {
  kind: "note",
  id,
  revision: 1,
  data: {
    title: "Reflection",
    dateKey: "2026-10-18",
    document: { version: 1, text: "My private note" },
  },
};
const req = (
  method: string,
  data: unknown = body,
  headers: Record<string, string> = {}
) =>
  new NextRequest(
    "http://localhost/api/calendar/personal?start=2026-10-01&end=2026-11-01",
    {
      method,
      headers,
      ...(method === "GET" ? {} : { body: JSON.stringify(data) }),
    }
  );
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue({ userId: 7 });
});
describe("personal calendar authenticated routes", () => {
  it("requires a revocation-checked session for every method", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    for (const [method, handler] of [
      ["GET", GET],
      ["POST", POST],
      ["PATCH", PATCH],
      ["DELETE", DELETE],
    ] as const)
      expect((await handler(req(method))).status).toBe(401);
    expect(readPersonalCalendar).not.toHaveBeenCalled();
    expect(writePersonalCalendar).not.toHaveBeenCalled();
  });
  it("reads only the session owner's range and prevents browser caching", async () => {
    vi.mocked(readPersonalCalendar).mockResolvedValue({
      events: [],
      notes: [],
      sharedCount:0,
      externalCoverage: {complete:true,warnings:[],connected:0},
    });
    const response = await GET(req("GET"));
    expect(readPersonalCalendar).toHaveBeenCalledWith(
      7,
      "2026-10-01",
      "2026-11-01"
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("passes validated writes and distinguishes create from update", async () => {
    await POST(req("POST"));
    expect(writePersonalCalendar).toHaveBeenLastCalledWith(7, body, true);
    await PATCH(req("PATCH"));
    expect(writePersonalCalendar).toHaveBeenLastCalledWith(7, body, false);
  });
  it("refuses injected ownership, malformed JSON, and oversized content", async () => {
    expect((await POST(req("POST", { ...body, userId: 2 }))).status).toBe(400);
    expect(
      (
        await POST(
          new NextRequest("http://localhost/api/calendar/personal", {
            method: "POST",
            body: "{",
          })
        )
      ).status
    ).toBe(400);
    expect(
      (
        await POST(
          req("POST", {
            ...body,
            data: {
              ...body.data,
              document: { version: 1, text: "a".repeat(4100000) },
            },
          })
        )
      ).status
    ).toBe(413);
    expect(writePersonalCalendar).not.toHaveBeenCalled();
  });
  it("rejects cross-site mutation requests", async () => {
    expect(
      (await POST(req("POST", body, { "sec-fetch-site": "cross-site" }))).status
    ).toBe(403);
  });
  it("returns conflicts without claiming a save or delete succeeded", async () => {
    vi.mocked(writePersonalCalendar).mockRejectedValue(
      new CalendarError("Changed elsewhere", 409)
    );
    expect((await PATCH(req("PATCH"))).status).toBe(409);
    vi.mocked(deletePersonalCalendar).mockRejectedValue(
      new CalendarError("Changed elsewhere", 409)
    );
    expect(
      (await DELETE(req("DELETE", { kind: "note", id, revision: 1 }))).status
    ).toBe(409);
  });
  it("scopes direct note recovery reads to the authenticated owner", async () => {
    vi.mocked(prisma.calendarNote.findFirst).mockResolvedValueOnce(null);
    const response = await GET(
      new NextRequest(`http://localhost/api/calendar/personal?id=${id}`)
    );
    expect(response.status).toBe(404);
    expect(prisma.calendarNote.findFirst).toHaveBeenCalledWith({
      where: { id, userId: 7 },
    });
  });
});
