import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const findMany = vi.fn();
vi.mock("@/lib/auth-server", () => ({ getSession: (...args: unknown[]) => getSession(...args) }));
vi.mock("@/lib/prisma", () => ({ prisma: { blockedUser: { findMany: (...args: unknown[]) => findMany(...args) } } }));

import { GET } from "@/app/api/friends/blocked/route";

const request = () => new Request("http://localhost/api/friends/blocked") as never;

describe("GET /api/friends/blocked", () => {
  beforeEach(() => { getSession.mockReset(); findMany.mockReset(); });

  it("refuses an anonymous caller", async () => {
    getSession.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("lists only the people the caller blocked, never who blocked the caller", async () => {
    getSession.mockResolvedValue({ userId: 7 });
    findMany.mockResolvedValue([{ blockedId: 9, createdAt: new Date("2026-11-01T00:00:00Z"), blocked: { username: "nine", name: "Nine" } }]);
    const response = await GET(request());
    expect(findMany.mock.calls[0][0].where).toEqual({ userId: 7 });
    expect(await response.json()).toEqual({ blocked: [{ id: 9, username: "nine", name: "Nine", blockedAt: "2026-11-01T00:00:00.000Z" }] });
  });

  it("returns no contact details beyond a name", async () => {
    getSession.mockResolvedValue({ userId: 7 });
    findMany.mockResolvedValue([]);
    await GET(request());
    expect(Object.keys(findMany.mock.calls[0][0].select.blocked.select).sort()).toEqual(["name", "username"]);
  });
});
