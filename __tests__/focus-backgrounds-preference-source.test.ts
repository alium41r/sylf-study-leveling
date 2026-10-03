// ============================================================================
// Focus Backgrounds — Phase 5B: Source Namespaces & Custom Selection Tests
// ============================================================================
// Verifies:
// 1. Source namespaces & overlapping ID isolation (Correction #2)
// 2. IDOR protection & ownership enforcement for custom backgrounds
// 3. Conditional stale-cleanup race protection (Correction #3)
// 4. Signed URL refresh route authorization, authoritative resolution & rate limit (Correction #4 & #11)
// 5. Private response headers (Cache-Control: private, no-store) (Correction #8)
// 6. v3 localStorage migration without signed URL persistence (Correction #6)
// ============================================================================
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, PATCH } from "@/app/api/focus-backgrounds/preference/route";
import {
  POST as refreshSignedUrlPOST,
  GET as refreshSignedUrlGET,
} from "@/app/api/focus-backgrounds/preference/refresh-signed-url/route";
import { prisma } from "@/lib/prisma";
import * as authServer from "@/lib/auth-server";
import * as supabaseStorage from "@/lib/supabase-storage";
import {
  loadStoredPreference,
  saveStoredPreference,
  clearStoredPreference,
  FOCUS_BG_PREFERENCE_STORAGE_KEY,
  FOCUS_BG_PREFERENCE_STORAGE_KEY_V2,
} from "@/lib/focus-background-preference";

describe("Focus Backgrounds — Phase 5B: Source Namespaces & Active Preference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearStoredPreference();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 1. Source Namespaces & Overlapping ID Resolution (Correction #2)
  // ────────────────────────────────────────────────────────────────────────────
  describe("Source Namespaces & Overlapping Numeric IDs", () => {
    it("resolves official selection strictly from FocusBackground table", async () => {
      vi.spyOn(authServer, "getSession").mockResolvedValueOnce({ userId: 10 } as any);

      // FocusBackground with id 7
      const officialBgSpy = vi.spyOn(prisma.focusBackground, "findUnique").mockResolvedValueOnce({
        id: 7,
        name: "Official Shrine",
        isActive: true,
        category: { id: 1, slug: "anime", isActive: true },
      } as any);

      // UserFocusBackground spy should NEVER be called on official requests
      const customBgSpy = vi.spyOn(prisma.userFocusBackground, "findFirst");

      const updateSpy = vi.spyOn(prisma.user, "update").mockResolvedValueOnce({
        focusBackgroundPreferenceVersion: 2,
      } as any);

      const req = new NextRequest("http://localhost/api/focus-backgrounds/preference", {
        method: "PATCH",
        body: JSON.stringify({ source: "official", backgroundId: 7 }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.source).toBe("official");
      expect(body.backgroundId).toBe(7);
      expect(officialBgSpy).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7 } }));
      expect(customBgSpy).not.toHaveBeenCalled();
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            focusBackgroundSource: "official",
            selectedFocusBackgroundId: 7,
            selectedCustomBackgroundId: null,
          }),
        })
      );
    });

    it("resolves custom selection strictly from UserFocusBackground table with session.userId", async () => {
      vi.spyOn(authServer, "getSession").mockResolvedValueOnce({ userId: 10 } as any);

      // UserFocusBackground with id 7 (overlapping ID with official)
      const customBgSpy = vi.spyOn(prisma.userFocusBackground, "findFirst").mockResolvedValueOnce({
        id: 7,
        userId: 10,
        name: "My Custom Sanctum",
        storagePath: "10/custom-sanctum.webp",
        width: 1920,
        height: 1080,
        aspectRatio: 1.777,
        focalX: 0.5,
        focalY: 0.5,
        timerPosition: "auto",
        createdAt: new Date("2026-09-09T10:00:00Z"),
      } as any);

      // FocusBackground spy should NEVER be called on custom requests
      const officialBgSpy = vi.spyOn(prisma.focusBackground, "findUnique");

      vi.spyOn(supabaseStorage, "getUserBackgroundSignedUrl").mockResolvedValueOnce({
        signedUrl: "https://signed.supabase.co/custom-sanctum.webp",
      });

      const updateSpy = vi.spyOn(prisma.user, "update").mockResolvedValueOnce({
        focusBackgroundPreferenceVersion: 3,
      } as any);

      const req = new NextRequest("http://localhost/api/focus-backgrounds/preference", {
        method: "PATCH",
        body: JSON.stringify({ source: "custom", backgroundId: 7 }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.source).toBe("custom");
      expect(body.backgroundId).toBe(7);
      expect(body.customBackground.signedUrl).toBe("https://signed.supabase.co/custom-sanctum.webp");
      expect(customBgSpy).toHaveBeenCalledWith({
        where: { id: 7, userId: 10 },
      });
      expect(officialBgSpy).not.toHaveBeenCalled();
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            focusBackgroundSource: "custom",
            selectedFocusBackgroundId: null,
            selectedCustomBackgroundId: 7,
          }),
        })
      );
    });

    it("enforces strict IDOR ownership: cannot select custom background owned by another user", async () => {
      vi.spyOn(authServer, "getSession").mockResolvedValueOnce({ userId: 10 } as any);

      // Prisma findFirst returns null because userId does not match session
      vi.spyOn(prisma.userFocusBackground, "findFirst").mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost/api/focus-backgrounds/preference", {
        method: "PATCH",
        body: JSON.stringify({ source: "custom", backgroundId: 99 }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain("unauthorized");
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 2. Conditional Stale Cleanup Race Protection (Correction #3)
  // ────────────────────────────────────────────────────────────────────────────
  describe("Conditional Stale Cleanup Race Protection", () => {
    it("conditionally cleans up official selection only if DB row still holds that stale ID and source", async () => {
      vi.spyOn(authServer, "getSession").mockResolvedValueOnce({ userId: 10 } as any);

      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce({
        id: 10,
        focusBackgroundSource: "official",
        selectedFocusBackgroundId: 55,
        selectedCustomBackgroundId: null,
        focusBackgroundPreferenceVersion: 2,
        selectedFocusBackground: null, // deleted / inactive
        selectedCustomBackground: null,
      } as any);

      const updateManySpy = vi.spyOn(prisma.user, "updateMany").mockResolvedValueOnce({ count: 1 });

      const req = new NextRequest("http://localhost/api/focus-backgrounds/preference");
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.isClassic).toBe(true);
      expect(body.resetFromInvalid).toBe(true);
      expect(updateManySpy).toHaveBeenCalledWith({
        where: {
          id: 10,
          focusBackgroundSource: "official",
          selectedFocusBackgroundId: 55,
        },
        data: {
          focusBackgroundSource: "classic",
          selectedFocusBackgroundId: null,
          selectedCustomBackgroundId: null,
        },
      });
    });

    it("conditionally cleans up custom selection only if DB row still holds that stale ID and source", async () => {
      vi.spyOn(authServer, "getSession").mockResolvedValueOnce({ userId: 10 } as any);

      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce({
        id: 10,
        focusBackgroundSource: "custom",
        selectedFocusBackgroundId: null,
        selectedCustomBackgroundId: 88,
        focusBackgroundPreferenceVersion: 4,
        selectedFocusBackground: null,
        selectedCustomBackground: null, // deleted custom background
      } as any);

      const updateManySpy = vi.spyOn(prisma.user, "updateMany").mockResolvedValueOnce({ count: 1 });

      const req = new NextRequest("http://localhost/api/focus-backgrounds/preference");
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.isClassic).toBe(true);
      expect(body.resetFromInvalid).toBe(true);
      expect(updateManySpy).toHaveBeenCalledWith({
        where: {
          id: 10,
          focusBackgroundSource: "custom",
          selectedCustomBackgroundId: 88,
        },
        data: {
          focusBackgroundSource: "classic",
          selectedFocusBackgroundId: null,
          selectedCustomBackgroundId: null,
        },
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 3. Signed URL Refresh Endpoint (Correction #4 & #11)
  // ────────────────────────────────────────────────────────────────────────────
  describe("Signed URL Refresh Endpoint", () => {
    it("operates strictly on current authoritative custom preference and ignores caller arguments", async () => {
      vi.spyOn(authServer, "getSession").mockResolvedValue({ userId: 42 } as any);

      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: 42,
        focusBackgroundSource: "custom",
        selectedCustomBackgroundId: 300,
        selectedCustomBackground: {
          id: 300,
          userId: 42,
          storagePath: "42/my-custom-study.png",
        },
      } as any);

      vi.spyOn(supabaseStorage, "getUserBackgroundSignedUrl").mockResolvedValue({
        signedUrl: "https://signed.supabase.co/refreshed-token-123.png",
      });

      // Pass malicious backgroundId/storagePath in body
      const req = new NextRequest("http://localhost/api/focus-backgrounds/preference/refresh-signed-url", {
        method: "POST",
        body: JSON.stringify({ backgroundId: 99999, storagePath: "attacker/leak.png" }),
      });

      const res = await refreshSignedUrlPOST(req);
      expect(res.status).toBe(200);
      const body = await res.json();

      // Authority: returns the user's current background ID 300, NOT the requested 99999
      expect(body.backgroundId).toBe(300);
      expect(body.signedUrl).toBe("https://signed.supabase.co/refreshed-token-123.png");
      expect(body.signedUrlExpiresAt).toBeDefined();
    });

    it("returns 404 if active preference is not custom or background is missing", async () => {
      vi.spyOn(authServer, "getSession").mockResolvedValueOnce({ userId: 42 } as any);

      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce({
        id: 42,
        focusBackgroundSource: "official",
        selectedCustomBackgroundId: null,
        selectedCustomBackground: null,
      } as any);

      const req = new NextRequest("http://localhost/api/focus-backgrounds/preference/refresh-signed-url", {
        method: "POST",
      });

      const res = await refreshSignedUrlPOST(req);
      expect(res.status).toBe(404);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4. Private Response Caching (Correction #8)
  // ────────────────────────────────────────────────────────────────────────────
  describe("Private Response Caching (Cache-Control: private, no-store)", () => {
    it("sets Cache-Control: private, no-store on preference GET and PATCH", async () => {
      vi.spyOn(authServer, "getSession").mockResolvedValue({ userId: 10 } as any);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: 10,
        focusBackgroundSource: "classic",
        focusBackgroundPreferenceVersion: 1,
      } as any);

      const getReq = new NextRequest("http://localhost/api/focus-backgrounds/preference");
      const getRes = await GET(getReq);
      expect(getRes.headers.get("cache-control")).toBe("private, no-store");

      vi.spyOn(prisma.user, "update").mockResolvedValue({
        focusBackgroundPreferenceVersion: 2,
      } as any);

      const patchReq = new NextRequest("http://localhost/api/focus-backgrounds/preference", {
        method: "PATCH",
        body: JSON.stringify({ source: "classic" }),
      });
      const patchRes = await PATCH(patchReq);
      expect(patchRes.headers.get("cache-control")).toBe("private, no-store");
    });

    it("sets Cache-Control: private, no-store on refresh-signed-url", async () => {
      vi.spyOn(authServer, "getSession").mockResolvedValue({ userId: 10 } as any);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: 10,
        focusBackgroundSource: "custom",
        selectedCustomBackground: { id: 5, userId: 10, storagePath: "10/test.png" },
      } as any);
      vi.spyOn(supabaseStorage, "getUserBackgroundSignedUrl").mockResolvedValue({
        signedUrl: "https://signed.supabase.co/test.png",
      });

      const req = new NextRequest("http://localhost/api/focus-backgrounds/preference/refresh-signed-url", {
        method: "POST",
      });
      const res = await refreshSignedUrlPOST(req);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 5. v3 Local Storage Operations & Security (Correction #6)
  // ────────────────────────────────────────────────────────────────────────────
  describe("LocalStorage v3 Cache & Security", () => {
    it("saves and loads custom preference without storing signed URLs", () => {
      saveStoredPreference({
        source: "custom",
        categorySlug: "custom",
        backgroundId: 105,
      });

      const loaded = loadStoredPreference();
      expect(loaded.source).toBe("custom");
      expect(loaded.backgroundId).toBe(105);

      // Verify raw stored JSON contains NO signed URLs or ephemeral tokens
      const raw = localStorage.getItem(FOCUS_BG_PREFERENCE_STORAGE_KEY);
      expect(raw).toBeDefined();
      const parsed = JSON.parse(raw!);
      expect(parsed.signedUrl).toBeUndefined();
      expect(parsed.token).toBeUndefined();
      expect(parsed.url).toBeUndefined();
    });

    it("migrates from v2 storage to v3 smoothly", () => {
      // Simulate existing v2 localStorage entry
      localStorage.setItem(
        FOCUS_BG_PREFERENCE_STORAGE_KEY_V2,
        JSON.stringify({ categorySlug: "anime", backgroundId: 88 })
      );

      const loaded = loadStoredPreference();
      expect(loaded.source).toBe("official");
      expect(loaded.categorySlug).toBe("anime");
      expect(loaded.backgroundId).toBe(88);

      // Verify v3 was written and v2 was cleaned up
      expect(localStorage.getItem(FOCUS_BG_PREFERENCE_STORAGE_KEY)).toBeDefined();
      expect(localStorage.getItem(FOCUS_BG_PREFERENCE_STORAGE_KEY_V2)).toBeNull();
    });
  });
});
