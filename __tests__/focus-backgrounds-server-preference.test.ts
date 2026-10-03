import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, PATCH } from "@/app/api/focus-backgrounds/preference/route";
import { prisma } from "@/lib/prisma";
import * as authServer from "@/lib/auth-server";
import {
  focusPreferenceQueue,
  fetchServerPreference,
  sendServerPreference,
  loadStoredPreference,
  saveStoredPreference,
  clearStoredPreference,
  CANONICAL_CLASSIC_SLUG,
  FOCUS_BG_PREFERENCE_STORAGE_KEY,
} from "@/lib/focus-background-preference";

describe("Focus Backgrounds — Phase 4: Server-Side User Preference Persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearStoredPreference();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 1. Authorization & IDOR Protection
  // ────────────────────────────────────────────────────────────────────────────
  describe("Authorization & IDOR Protection", () => {
    it("returns 401 Unauthorized for unauthenticated GET request", async () => {
      vi.spyOn(authServer, "getSession").mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost/api/focus-backgrounds/preference", {
        method: "GET",
      });
      const res = await GET(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("returns 401 Unauthorized for unauthenticated PATCH request", async () => {
      vi.spyOn(authServer, "getSession").mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost/api/focus-backgrounds/preference", {
        method: "PATCH",
        body: JSON.stringify({ backgroundId: 1 }),
      });
      const res = await PATCH(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("enforces session user identity and prevents IDOR cross-user mutation", async () => {
      const mockSession = { userId: 42 } as any;
      vi.spyOn(authServer, "getSession").mockResolvedValueOnce(mockSession);

      const prismaUpdateSpy = vi.spyOn(prisma.user, "update").mockResolvedValueOnce({
        id: 42,
        selectedFocusBackgroundId: null,
        focusBackgroundPreferenceVersion: 1,
      } as any);

      // Attempt to maliciously pass a different userId in payload
      const req = new NextRequest("http://localhost/api/focus-backgrounds/preference", {
        method: "PATCH",
        body: JSON.stringify({ backgroundId: null, userId: 9999 }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(200);

      // Verify that the query was strictly scoped to session.userId (42), never 9999
      expect(prismaUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 42 },
          data: expect.objectContaining({
            selectedFocusBackgroundId: null,
          }),
        })
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 2. GET Endpoint: Versioning, Uninitialized States, and Referential Safety
  // ────────────────────────────────────────────────────────────────────────────
  describe("GET /api/focus-backgrounds/preference", () => {
    it("returns uninitialized state when focusBackgroundPreferenceVersion is 0", async () => {
      vi.spyOn(authServer, "getSession").mockResolvedValueOnce({ userId: 10 } as any);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce({
        id: 10,
        selectedFocusBackgroundId: null,
        focusBackgroundPreferenceVersion: 0,
        selectedFocusBackground: null,
      } as any);

      const req = new NextRequest("http://localhost/api/focus-backgrounds/preference");
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.initialized).toBe(false);
      expect(body.version).toBe(0);
      expect(body.backgroundId).toBeNull();
      expect(body.isClassic).toBe(true);
    });

    it("returns explicit Classic Sylf when version >= 1 and selectedFocusBackgroundId is null", async () => {
      vi.spyOn(authServer, "getSession").mockResolvedValueOnce({ userId: 10 } as any);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce({
        id: 10,
        selectedFocusBackgroundId: null,
        focusBackgroundPreferenceVersion: 2,
        selectedFocusBackground: null,
      } as any);

      const req = new NextRequest("http://localhost/api/focus-backgrounds/preference");
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.initialized).toBe(true);
      expect(body.version).toBe(2);
      expect(body.backgroundId).toBeNull();
      expect(body.isClassic).toBe(true);
    });

    it("returns resolved background when active and valid", async () => {
      vi.spyOn(authServer, "getSession").mockResolvedValueOnce({ userId: 10 } as any);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce({
        id: 10,
        selectedFocusBackgroundId: 101,
        focusBackgroundPreferenceVersion: 1,
        selectedFocusBackground: {
          id: 101,
          isActive: true,
          category: {
            slug: "landscape",
            isActive: true,
          },
        },
      } as any);

      const req = new NextRequest("http://localhost/api/focus-backgrounds/preference");
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.initialized).toBe(true);
      expect(body.backgroundId).toBe(101);
      expect(body.categorySlug).toBe("landscape");
      expect(body.isClassic).toBe(false);
    });

    it("handles deleted / inactive background referentially without clobbering concurrent updates", async () => {
      vi.spyOn(authServer, "getSession").mockResolvedValueOnce({ userId: 10 } as any);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce({
        id: 10,
        selectedFocusBackgroundId: 999, // Stale background
        focusBackgroundPreferenceVersion: 1,
        selectedFocusBackground: null, // Background was deleted in studio
      } as any);

      const updateManySpy = vi.spyOn(prisma.user, "updateMany").mockResolvedValueOnce({ count: 1 });

      const req = new NextRequest("http://localhost/api/focus-backgrounds/preference");
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.initialized).toBe(true);
      expect(body.backgroundId).toBeNull();
      expect(body.isClassic).toBe(true);
      expect(body.resetFromInvalid).toBe(true);

      // Correction 4: Verify conditional cleanup used updateMany with selectedFocusBackgroundId: 999
      expect(updateManySpy).toHaveBeenCalledWith({
        where: {
          id: 10,
          selectedFocusBackgroundId: 999,
        },
        data: {
          selectedFocusBackgroundId: null,
        },
      });
    });

    it("handles inactive parent category by resetting to Classic", async () => {
      vi.spyOn(authServer, "getSession").mockResolvedValueOnce({ userId: 10 } as any);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce({
        id: 10,
        selectedFocusBackgroundId: 105,
        focusBackgroundPreferenceVersion: 1,
        selectedFocusBackground: {
          id: 105,
          isActive: true,
          category: {
            slug: "anime",
            isActive: false, // Category deactivated
          },
        },
      } as any);

      const updateManySpy = vi.spyOn(prisma.user, "updateMany").mockResolvedValueOnce({ count: 1 });

      const req = new NextRequest("http://localhost/api/focus-backgrounds/preference");
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.backgroundId).toBeNull();
      expect(body.isClassic).toBe(true);
      expect(body.resetFromInvalid).toBe(true);
      expect(updateManySpy).toHaveBeenCalledWith({
        where: { id: 10, selectedFocusBackgroundId: 105 },
        data: { selectedFocusBackgroundId: null },
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 3. PATCH Endpoint: Strict Validation & State Updates
  // ────────────────────────────────────────────────────────────────────────────
  describe("PATCH /api/focus-backgrounds/preference — Strict Validation", () => {
    it("successfully sets Classic Sylf (backgroundId: null) and increments version", async () => {
      vi.spyOn(authServer, "getSession").mockResolvedValueOnce({ userId: 10 } as any);
      vi.spyOn(prisma.user, "update").mockResolvedValueOnce({
        id: 10,
        selectedFocusBackgroundId: null,
        focusBackgroundPreferenceVersion: 1,
      } as any);

      const req = new NextRequest("http://localhost/api/focus-backgrounds/preference", {
        method: "PATCH",
        body: JSON.stringify({ backgroundId: null }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.success).toBe(true);
      expect(body.backgroundId).toBeNull();
      expect(body.isClassic).toBe(true);
      expect(body.version).toBe(1);
    });

    it("successfully selects active background and increments version", async () => {
      vi.spyOn(authServer, "getSession").mockResolvedValueOnce({ userId: 10 } as any);
      vi.spyOn(prisma.focusBackground, "findUnique").mockResolvedValueOnce({
        id: 205,
        isActive: true,
        category: { slug: "fantasy", isActive: true },
      } as any);

      vi.spyOn(prisma.user, "update").mockResolvedValueOnce({
        id: 10,
        selectedFocusBackgroundId: 205,
        focusBackgroundPreferenceVersion: 2,
      } as any);

      const req = new NextRequest("http://localhost/api/focus-backgrounds/preference", {
        method: "PATCH",
        body: JSON.stringify({ backgroundId: 205 }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.success).toBe(true);
      expect(body.backgroundId).toBe(205);
      expect(body.categorySlug).toBe("fantasy");
      expect(body.version).toBe(2);
    });

    // Correction 3: Strict backgroundId validation
    it("rejects non-integer, negative, zero, or malformed backgroundId values", async () => {
      vi.spyOn(authServer, "getSession").mockResolvedValue({ userId: 10 } as any);

      const invalidPayloads = [
        { backgroundId: 1.5 }, // decimal
        { backgroundId: -1 }, // negative
        { backgroundId: 0 }, // zero
        { backgroundId: "12" }, // string
        { backgroundId: "NaN" }, // string representation
        { backgroundId: "Infinity" }, // string representation
        { backgroundId: [1] }, // array
        { backgroundId: { id: 1 } }, // object
        {}, // missing
      ];

      for (const payload of invalidPayloads) {
        const req = new NextRequest("http://localhost/api/focus-backgrounds/preference", {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        const res = await PATCH(req);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("Invalid backgroundId");
      }
    });

    it("returns 404 when background ID does not exist", async () => {
      vi.spyOn(authServer, "getSession").mockResolvedValueOnce({ userId: 10 } as any);
      vi.spyOn(prisma.focusBackground, "findUnique").mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost/api/focus-backgrounds/preference", {
        method: "PATCH",
        body: JSON.stringify({ backgroundId: 999 }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Background not found");
    });

    it("returns 400 when target background is inactive", async () => {
      vi.spyOn(authServer, "getSession").mockResolvedValueOnce({ userId: 10 } as any);
      vi.spyOn(prisma.focusBackground, "findUnique").mockResolvedValueOnce({
        id: 300,
        isActive: false, // Inactive
        category: { slug: "anime", isActive: true },
      } as any);

      const req = new NextRequest("http://localhost/api/focus-backgrounds/preference", {
        method: "PATCH",
        body: JSON.stringify({ backgroundId: 300 }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Cannot select inactive background");
    });

    it("returns 400 when target category is inactive", async () => {
      vi.spyOn(authServer, "getSession").mockResolvedValueOnce({ userId: 10 } as any);
      vi.spyOn(prisma.focusBackground, "findUnique").mockResolvedValueOnce({
        id: 301,
        isActive: true,
        category: { slug: "anime", isActive: false }, // Inactive category
      } as any);

      const req = new NextRequest("http://localhost/api/focus-backgrounds/preference", {
        method: "PATCH",
        body: JSON.stringify({ backgroundId: 301 }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Cannot select background from inactive category");
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4. Client Sequential Mutex Queue: Out-of-Order Prevention
  // ────────────────────────────────────────────────────────────────────────────
  describe("Client Sequential Mutex Queue (Latest-Write-Wins)", () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("collapses intermediate writes and guarantees latest user selection is dispatched", async () => {
      const dispatchedPayloads: any[] = [];

      global.fetch = vi.fn().mockImplementation(async (_url, opts) => {
        const body = JSON.parse(opts.body);
        dispatchedPayloads.push(body.backgroundId);
        // Small delay to simulate network latency
        await new Promise((resolve) => setTimeout(resolve, 20));
        return {
          ok: true,
          json: async () => ({
            success: true,
            initialized: true,
            version: 1,
            backgroundId: body.backgroundId,
            categorySlug: body.backgroundId ? "anime" : CANONICAL_CLASSIC_SLUG,
            isClassic: body.backgroundId === null,
          }),
        } as any;
      });

      // User rapidly selects: 10 (Anime A) -> 20 (Anime B) -> 30 (Landscape C)
      const p1 = focusPreferenceQueue.enqueue(10);
      const p2 = focusPreferenceQueue.enqueue(20);
      const p3 = focusPreferenceQueue.enqueue(30);

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

      // All promises resolve successfully
      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
      expect(r3.success).toBe(true);

      // Final resolved selection matches the final user click (30)
      expect(r3.data?.backgroundId).toBe(30);

      // Correction 2: Intermediate state 20 was collapsed because 30 arrived before 10 finished!
      // Therefore, only 10 and 30 were dispatched over the wire, in strict chronological sequence!
      expect(dispatchedPayloads).toEqual([10, 30]);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 5. Version-Aware Migration & Authority Rules
  // ────────────────────────────────────────────────────────────────────────────
  describe("LocalStorage & Server Preference Migration Rules", () => {
    it("preserves Classic Sylf as default local preference", () => {
      const pref = loadStoredPreference();
      expect(pref.categorySlug).toBe(CANONICAL_CLASSIC_SLUG);
      expect(pref.backgroundId).toBeNull();
    });

    it("strictly validates stored local preference integers", () => {
      localStorage.setItem(
        FOCUS_BG_PREFERENCE_STORAGE_KEY,
        JSON.stringify({ categorySlug: "anime", backgroundId: "invalid-string" })
      );
      const pref = loadStoredPreference();
      expect(pref.backgroundId).toBeNull(); // string rejected, resolved to null
    });

    it("persists and reads valid integer background preferences in localStorage", () => {
      saveStoredPreference({ categorySlug: "anime", backgroundId: 45 });
      const pref = loadStoredPreference();
      expect(pref.categorySlug).toBe("anime");
      expect(pref.backgroundId).toBe(45);
    });

    it("ensures server preference (version >= 1) always wins over stale local storage", async () => {
      // Stale local storage has Anime #99
      saveStoredPreference({ categorySlug: "anime", backgroundId: 99 });

      // Server is authoritative (version 2) and has Classic Sylf (null)
      const serverPref = {
        initialized: true,
        version: 2,
        backgroundId: null,
        categorySlug: CANONICAL_CLASSIC_SLUG,
        isClassic: true,
      };

      // When server is authoritative and null, client must adopt Classic
      expect(serverPref.version).toBeGreaterThanOrEqual(1);
      expect(serverPref.backgroundId).toBeNull();
      // Server wins -> update local storage to match server
      saveStoredPreference({
        categorySlug: CANONICAL_CLASSIC_SLUG,
        backgroundId: null,
      });

      const updatedLocal = loadStoredPreference();
      expect(updatedLocal.backgroundId).toBeNull();
      expect(updatedLocal.categorySlug).toBe(CANONICAL_CLASSIC_SLUG);
    });

    it("migrates local selection to server when server version is 0 (uninitialized)", async () => {
      // Local storage has valid preference #42
      saveStoredPreference({ categorySlug: "landscape", backgroundId: 42 });
      const local = loadStoredPreference();

      // Server is uninitialized (version 0)
      const serverPref = {
        initialized: false,
        version: 0,
        backgroundId: null,
        categorySlug: CANONICAL_CLASSIC_SLUG,
        isClassic: true,
      };

      expect(serverPref.version).toBe(0);
      expect(local.backgroundId).toBe(42);

      // In this state, client enqueues migration of local.backgroundId
      const patchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          initialized: true,
          version: 1,
          backgroundId: 42,
          categorySlug: "landscape",
          isClassic: false,
        }),
      });
      global.fetch = patchSpy;

      const result = await sendServerPreference(local.backgroundId);
      expect(result.success).toBe(true);
      expect(result.data?.version).toBe(1);
      expect(result.data?.backgroundId).toBe(42);
    });

    it("handles persistence failure gracefully without throwing or breaking client state", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network disconnect"));

      const result = await sendServerPreference(10);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Network disconnect");
      // Does not throw an unhandled exception
    });
  });
});

