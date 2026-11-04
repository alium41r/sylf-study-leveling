import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: vi.fn().mockRejectedValue(new Error("db down")) } }));

import { areAnyUsersBlocked, areUsersBlocked } from "@/lib/block-service";

describe("S-15: a failed block check", () => {
  it("keeps reading as not blocked where nothing is at risk (profiles, media), as before", async () => {
    expect(await areUsersBlocked(1, 2)).toBe(false);
    expect(await areAnyUsersBlocked(1, [2, 3])).toBe(false);
  });
  it("reads as blocked for messaging, so a failed check never lets a message through", async () => {
    expect(await areUsersBlocked(1, 2, { failClosed: true })).toBe(true);
    expect(await areAnyUsersBlocked(1, [2], { failClosed: true })).toBe(true);
    expect(await areAnyUsersBlocked(1, [2, 3], { failClosed: true })).toBe(true);
  });
  it("still answers false for nobody to check", async () => {
    expect(await areAnyUsersBlocked(1, [], { failClosed: true })).toBe(false);
  });
});
