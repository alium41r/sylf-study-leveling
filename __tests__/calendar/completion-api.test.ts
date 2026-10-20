/** @vitest-environment node */
import { beforeEach, describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  GET as notebookGet,
  POST as notebookPost,
  DELETE as notebookDelete,
} from "@/app/api/calendar/notebooks/route";
import {
  GET as sharedGet,
  POST as sharedPost,
} from "@/app/api/calendar/shared/route";
import { getSession } from "@/lib/auth-server";
const m = vi.hoisted(() => ({
  read: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  search: vi.fn(),
  catalog: vi.fn(),
  change: vi.fn(),
}));
vi.mock("@/lib/auth-server", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/calendar/notebook-service", () => ({
  readNoteRecognitions: m.read,
  saveNoteRecognition: m.save,
  deleteNoteRecognition: m.remove,
  searchNotebooks: m.search,
}));
vi.mock("@/lib/calendar/shared-service", () => ({
  sharedCatalog: m.catalog,
  changeSharedCalendar: m.change,
}));
const request = (
  path: string,
  method = "GET",
  body?: unknown,
  headers?: Record<string, string>
) =>
  new NextRequest("https://sylf.example/api/calendar/" + path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers,
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue({ userId: 7 });
  m.catalog.mockResolvedValue([]);
  m.search.mockResolvedValue({ notes: [], nextCursor: null });
});
describe("Phase 6 API boundaries", () => {
  it("requires cookie authentication for all notebook and collaboration operations", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    for (const [fn, req] of [
      [notebookGet, request("notebooks")],
      [notebookPost, request("notebooks", "POST", {})],
      [notebookDelete, request("notebooks", "DELETE", {})],
      [sharedGet, request("shared")],
      [sharedPost, request("shared", "POST", {})],
    ] as const)
      expect((await fn(req)).status).toBe(401);
    expect(m.search).not.toHaveBeenCalled();
    expect(m.change).not.toHaveBeenCalled();
  });
  it("rejects cross-site writes before invoking services", async () => {
    expect(
      (
        await notebookPost(
          request("notebooks", "POST", {}, { "sec-fetch-site": "cross-site" })
        )
      ).status
    ).toBe(403);
    expect(
      (
        await sharedPost(
          request("shared", "POST", {}, { "sec-fetch-site": "cross-site" })
        )
      ).status
    ).toBe(403);
    expect(m.save).not.toHaveBeenCalled();
    expect(m.change).not.toHaveBeenCalled();
  });
  it("uses the server session for owner scope and disables caching", async () => {
    const r = await notebookGet(
      request("notebooks?query=Maxwell&start=2026-09-01&end=2026-09-30")
    );
    expect(r.headers.get("Cache-Control")).toBe("private, no-store");
    expect(m.search).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        query: "Maxwell",
        start: "2026-09-01",
        end: "2026-09-30",
      })
    );
    await sharedGet(request("shared"));
    expect(m.catalog).toHaveBeenCalledWith(7, true);
  });
  it("rejects invalid identities and bounds payloads", async () => {
    expect(
      (await notebookGet(request("notebooks?noteId=invalid"))).status
    ).toBe(400);
    expect(
      (
        await notebookPost(
          request("notebooks", "POST", { text: "x".repeat(100001) })
        )
      ).status
    ).toBe(413);
    expect(
      (await sharedPost(request("shared", "POST", { name: "x".repeat(6001) })))
        .status
    ).toBe(413);
  });
});
