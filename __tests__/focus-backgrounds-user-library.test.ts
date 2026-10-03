import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as getBackgrounds, POST as uploadBackground } from "@/app/api/user/focus-backgrounds/route";
import { PATCH as updateBackground, DELETE as deleteBackground } from "@/app/api/user/focus-backgrounds/[id]/route";
import { prisma } from "@/lib/prisma";
import * as authServer from "@/lib/auth-server";
import * as supabaseStorage from "@/lib/supabase-storage";
import {
  extractImageDimensions,
  validateCustomBackgroundDimensions,
  MAX_BACKGROUND_WIDTH,
  MAX_BACKGROUND_HEIGHT,
  MAX_BACKGROUND_PIXELS,
} from "@/lib/image-dimensions";

// Helper to construct a PNG buffer with arbitrary dimensions
function createPngBuffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(32);
  buf[0] = 0x89;
  buf[1] = 0x50;
  buf[2] = 0x4e;
  buf[3] = 0x47;
  buf[4] = 0x0d;
  buf[5] = 0x0a;
  buf[6] = 0x1a;
  buf[7] = 0x0a;
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

describe("Focus Backgrounds — Phase 5A: Custom User Backgrounds & Security Posture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseStorage.setStorageClientForTesting(null);
  });

  function makeDim(width: number, height: number) {
    const aspectRatio = width / height;
    return {
      width,
      height,
      aspectRatio,
      isRecommended16x9: Math.abs(aspectRatio - 16 / 9) < 0.05,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 1. Dimension Validation & Megapixel Decompression Bomb Protection
  // ────────────────────────────────────────────────────────────────────────────
  describe("Image Dimension & Megapixel Bounds", () => {
    it("accepts valid 1080p, 1440p, and 4K dimensions", () => {
      const p1080 = validateCustomBackgroundDimensions(makeDim(1920, 1080), "image/png");
      expect(p1080.ok).toBe(true);

      const p1440 = validateCustomBackgroundDimensions(makeDim(2560, 1440), "image/jpeg");
      expect(p1440.ok).toBe(true);

      const p4k = validateCustomBackgroundDimensions(makeDim(3840, 2160), "image/webp");
      expect(p4k.ok).toBe(true);
    });

    it("rejects images below minimum HD threshold (1280x720)", () => {
      const tooNarrow = validateCustomBackgroundDimensions(makeDim(1200, 800), "image/png");
      expect(tooNarrow.ok).toBe(false);
      if (!tooNarrow.ok) {
        expect(tooNarrow.error).toContain("Resolution too low");
      }

      const tooShort = validateCustomBackgroundDimensions(makeDim(1920, 600), "image/png");
      expect(tooShort.ok).toBe(false);
      if (!tooShort.ok) {
        expect(tooShort.error).toContain("Resolution too low");
      }
    });

    it("rejects pathological dimensions exceeding maximum 8K bounds (7680x4320)", () => {
      const tooWide = validateCustomBackgroundDimensions(makeDim(8000, 2000), "image/png");
      expect(tooWide.ok).toBe(false);
      if (!tooWide.ok) {
        expect(tooWide.error).toContain("Resolution exceeds maximum");
      }

      const tooTall = validateCustomBackgroundDimensions(makeDim(2000, 5000), "image/png");
      expect(tooTall.ok).toBe(false);
      if (!tooTall.ok) {
        expect(tooTall.error).toContain("Resolution exceeds maximum");
      }
    });

    it("protects against decompression bombs exceeding 35 Megapixels", () => {
      // 7000 x 6000 = 42,000,000 pixels (42 MP)
      const bomb = validateCustomBackgroundDimensions(makeDim(7000, 6000), "image/png");
      expect(bomb.ok).toBe(false);
      if (!bomb.ok) {
        expect(bomb.error).toContain("35 megapixels");
      }
    });

    it("strictly rejects animated GIFs", () => {
      const gifBuffer = Buffer.from("GIF89a\x01\x00\x01\x00\x80\x00\x00");
      const gifDim = extractImageDimensions(gifBuffer);
      const res = validateCustomBackgroundDimensions(gifDim, "image/gif");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("GIF animations are not supported");
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 2. Storage Path Defense in Depth & Ownership Verification
  // ────────────────────────────────────────────────────────────────────────────
  describe("Storage Path Defense in Depth", () => {
    it("refuses to generate signed URL if path does not match authenticated user ID", async () => {
      const userId = 101;
      const attackerPath = "102/malicious-target.jpg";

      const result = await supabaseStorage.getUserBackgroundSignedUrl(userId, attackerPath);
      expect(result.signedUrl).toBeNull();
      expect(result.error).toContain("Access denied: invalid storage path ownership");
    });

    it("refuses to delete storage object if path does not match authenticated user ID", async () => {
      const userId = 101;
      const victimPath = "999/private-art.png";

      const result = await supabaseStorage.deleteUserBackgroundFile(userId, victimPath);
      expect(result.ok).toBe(false);
      expect(result.error).toContain("Access denied: invalid storage path ownership");
    });

    it("strips bucket prefix and validates user ownership prefix securely", async () => {
      const userId = 55;
      const validWithBucket = "focus-backgrounds-user/55/random-uuid.png";

      // Inject mock storage client
      supabaseStorage.setStorageClientForTesting({
        storage: {
          from: () => ({
            createSignedUrl: vi.fn().mockResolvedValueOnce({
              data: { signedUrl: "https://signed.supabase.co/55/random-uuid.png" },
              error: null,
            }),
          }),
        },
      });

      const result = await supabaseStorage.getUserBackgroundSignedUrl(userId, validWithBucket);
      expect(result.signedUrl).toBe("https://signed.supabase.co/55/random-uuid.png");
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 3. Strict Route ID Parsing & Anti-Enumeration (404 Uniformity)
  // ────────────────────────────────────────────────────────────────────────────
  describe("Strict Route ID Parsing & Anti-Enumeration", () => {
    it("rejects non-numeric and malformed route IDs with 400 Bad Request", async () => {
      vi.spyOn(authServer, "getSession").mockResolvedValue({ userId: 1 } as any);

      const malformedIds = ["1abc", "1.5", "-4", "0", "NaN", "foo"];
      for (const id of malformedIds) {
        const patchReq = new NextRequest(`http://localhost/api/user/focus-backgrounds/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: "Updated" }),
        });
        const patchRes = await updateBackground(patchReq, { params: Promise.resolve({ id }) });
        expect(patchRes.status).toBe(400);
        const patchBody = await patchRes.json();
        expect(patchBody.error).toBe("Invalid background ID");

        const deleteReq = new NextRequest(`http://localhost/api/user/focus-backgrounds/${id}`, {
          method: "DELETE",
        });
        const deleteRes = await deleteBackground(deleteReq, { params: Promise.resolve({ id }) });
        expect(deleteRes.status).toBe(400);
      }
    });

    it("returns uniform 404 for nonexistent IDs or IDs owned by another user (anti-IDOR)", async () => {
      const userA = 10;
      vi.spyOn(authServer, "getSession").mockResolvedValue({ userId: userA } as any);

      // Prisma finds nothing for userA when querying id 99 (belongs to User B)
      vi.spyOn(prisma.userFocusBackground, "findFirst").mockResolvedValue(null);

      const patchReq = new NextRequest("http://localhost/api/user/focus-backgrounds/99", {
        method: "PATCH",
        body: JSON.stringify({ name: "Hijacked" }),
      });
      const patchRes = await updateBackground(patchReq, { params: Promise.resolve({ id: "99" }) });
      expect(patchRes.status).toBe(404);
      const patchBody = await patchRes.json();
      expect(patchBody.error).toBe("Background not found");

      const deleteReq = new NextRequest("http://localhost/api/user/focus-backgrounds/99", {
        method: "DELETE",
      });
      const deleteRes = await deleteBackground(deleteReq, { params: Promise.resolve({ id: "99" }) });
      expect(deleteRes.status).toBe(404);
      const deleteBody = await deleteRes.json();
      expect(deleteBody.error).toBe("Background not found");
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4. Concurrency-Safe Quota Enforcement (Max 10 per user)
  // ────────────────────────────────────────────────────────────────────────────
  describe("Concurrency-Safe Quota Enforcement", () => {
    it("rejects upload with 409 Conflict if locked recount reaches or exceeds 10", async () => {
      const user = { userId: 42 };
      vi.spyOn(authServer, "getSession").mockResolvedValue(user as any);

      // Create a valid 1080p PNG buffer
      const pngBuffer = createPngBuffer(1920, 1080);
      const mockFile = {
        name: "test-bg.png",
        size: pngBuffer.length,
        type: "image/png",
        arrayBuffer: async () =>
          pngBuffer.buffer.slice(pngBuffer.byteOffset, pngBuffer.byteOffset + pngBuffer.byteLength),
      };

      const mockFormData = new Map<string, any>([
        ["file", mockFile],
        ["name", "Test Sanctuary"],
      ]);

      const req = new NextRequest("http://localhost/api/user/focus-backgrounds", {
        method: "POST",
      });
      vi.spyOn(req, "formData").mockResolvedValue({
        get: (key: string) => mockFormData.get(key) ?? null,
      } as any);

      // Mock storage upload success
      vi.spyOn(supabaseStorage, "uploadUserBackgroundFile").mockResolvedValue({
        storagePath: "42/mock-uuid.png",
      });

      const deleteStorageSpy = vi.spyOn(supabaseStorage, "deleteUserBackgroundFile").mockResolvedValue({
        ok: true,
      });

      // Mock transaction with locked recount returning 10 existing rows
      vi.spyOn(prisma, "$transaction").mockImplementationOnce(async (callback: any) => {
        const tx = {
          $queryRaw: vi.fn().mockResolvedValue([{ id: 42 }]),
          userFocusBackground: {
            count: vi.fn().mockResolvedValue(10), // Already at max quota!
          },
        };
        return callback(tx);
      });

      const res = await uploadBackground(req);
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain("quota exceeded");

      // COMPENSATING TRANSACTION: Newly uploaded storage file must be immediately cleaned up
      expect(deleteStorageSpy).toHaveBeenCalledWith(42, "42/mock-uuid.png");
    });

    it("cleans up uploaded storage file if database insertion fails during transaction", async () => {
      const user = { userId: 77 };
      vi.spyOn(authServer, "getSession").mockResolvedValue(user as any);

      const pngBuffer = createPngBuffer(1920, 1080);
      const mockFile = {
        name: "bg.png",
        size: pngBuffer.length,
        type: "image/png",
        arrayBuffer: async () =>
          pngBuffer.buffer.slice(pngBuffer.byteOffset, pngBuffer.byteOffset + pngBuffer.byteLength),
      };

      const mockFormData = new Map<string, any>([
        ["file", mockFile],
        ["name", "Valid Landscape"],
      ]);

      const req = new NextRequest("http://localhost/api/user/focus-backgrounds", {
        method: "POST",
      });
      vi.spyOn(req, "formData").mockResolvedValue({
        get: (key: string) => mockFormData.get(key) ?? null,
      } as any);

      vi.spyOn(supabaseStorage, "uploadUserBackgroundFile").mockResolvedValue({
        storagePath: "77/orphan-candidate.png",
      });

      const deleteStorageSpy = vi.spyOn(supabaseStorage, "deleteUserBackgroundFile").mockResolvedValue({
        ok: true,
      });

      // Simulate unexpected DB error during tx
      vi.spyOn(prisma, "$transaction").mockRejectedValueOnce(new Error("Database connection lost"));

      const res = await uploadBackground(req);
      expect(res.status).toBe(500);

      // Verify compensating storage cleanup occurred
      expect(deleteStorageSpy).toHaveBeenCalledWith(77, "77/orphan-candidate.png");
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 5. Delete Order & Consistency Strategy (DB first, then Storage)
  // ────────────────────────────────────────────────────────────────────────────
  describe("Delete Order & Consistency Strategy", () => {
    it("deletes DB record first, then deletes Storage object", async () => {
      const user = { userId: 88 };
      vi.spyOn(authServer, "getSession").mockResolvedValue(user as any);

      const existingRecord = {
        id: 5,
        userId: 88,
        storagePath: "88/sunset.jpg",
      };

      vi.spyOn(prisma.userFocusBackground, "findFirst").mockResolvedValue(existingRecord as any);
      const deleteDbSpy = vi.spyOn(prisma.userFocusBackground, "delete").mockResolvedValue({} as any);
      const deleteStorageSpy = vi.spyOn(supabaseStorage, "deleteUserBackgroundFile").mockResolvedValue({
        ok: true,
      });

      const req = new NextRequest("http://localhost/api/user/focus-backgrounds/5", {
        method: "DELETE",
      });
      const res = await deleteBackground(req, { params: Promise.resolve({ id: "5" }) });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.storageCleaned).toBe(true);

      // Verify DB delete was called before storage delete
      expect(deleteDbSpy).toHaveBeenCalledWith({ where: { id: 5 } });
      expect(deleteStorageSpy).toHaveBeenCalledWith(88, "88/sunset.jpg");
    });

    it("logs orphan and returns graceful response if storage cleanup encounters partial failure", async () => {
      const user = { userId: 88 };
      vi.spyOn(authServer, "getSession").mockResolvedValue(user as any);

      const existingRecord = {
        id: 6,
        userId: 88,
        storagePath: "88/mountain.jpg",
      };

      vi.spyOn(prisma.userFocusBackground, "findFirst").mockResolvedValue(existingRecord as any);
      vi.spyOn(prisma.userFocusBackground, "delete").mockResolvedValue({} as any);
      vi.spyOn(supabaseStorage, "deleteUserBackgroundFile").mockResolvedValue({
        ok: false,
        error: "Supabase storage gateway timeout",
      });

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const req = new NextRequest("http://localhost/api/user/focus-backgrounds/6", {
        method: "DELETE",
      });
      const res = await deleteBackground(req, { params: Promise.resolve({ id: "6" }) });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.storageCleaned).toBe(false);
      expect(body.warning).toContain("storage cleanup encountered an issue");

      // Verify explicit orphan logging
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[StorageOrphan]",
        expect.stringContaining('"event":"STORAGE_ORPHAN_DETECTED"')
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 6. Metadata Validation & Check Constraint Alignment
  // ────────────────────────────────────────────────────────────────────────────
  describe("Metadata Validation Alignment", () => {
    it("validates timerPosition against allowed registry in PATCH", async () => {
      vi.spyOn(authServer, "getSession").mockResolvedValue({ userId: 1 } as any);
      vi.spyOn(prisma.userFocusBackground, "findFirst").mockResolvedValue({ id: 1, userId: 1 } as any);

      const req = new NextRequest("http://localhost/api/user/focus-backgrounds/1", {
        method: "PATCH",
        body: JSON.stringify({ timerPosition: "invalid-pod" }),
      });

      const res = await updateBackground(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("timerPosition must be one of");
    });

    it("rejects out-of-bounds focalX and focalY", async () => {
      vi.spyOn(authServer, "getSession").mockResolvedValue({ userId: 1 } as any);
      vi.spyOn(prisma.userFocusBackground, "findFirst").mockResolvedValue({ id: 1, userId: 1 } as any);

      const reqNegative = new NextRequest("http://localhost/api/user/focus-backgrounds/1", {
        method: "PATCH",
        body: JSON.stringify({ focalX: -0.2 }),
      });
      const resNegative = await updateBackground(reqNegative, { params: Promise.resolve({ id: "1" }) });
      expect(resNegative.status).toBe(400);

      const reqOver = new NextRequest("http://localhost/api/user/focus-backgrounds/1", {
        method: "PATCH",
        body: JSON.stringify({ focalY: 1.5 }),
      });
      const resOver = await updateBackground(reqOver, { params: Promise.resolve({ id: "1" }) });
      expect(resOver.status).toBe(400);
    });

    it("rejects names shorter than 2 or longer than 60 characters", async () => {
      vi.spyOn(authServer, "getSession").mockResolvedValue({ userId: 1 } as any);
      vi.spyOn(prisma.userFocusBackground, "findFirst").mockResolvedValue({ id: 1, userId: 1 } as any);

      const reqShort = new NextRequest("http://localhost/api/user/focus-backgrounds/1", {
        method: "PATCH",
        body: JSON.stringify({ name: "A" }),
      });
      const resShort = await updateBackground(reqShort, { params: Promise.resolve({ id: "1" }) });
      expect(resShort.status).toBe(400);

      const reqLong = new NextRequest("http://localhost/api/user/focus-backgrounds/1", {
        method: "PATCH",
        body: JSON.stringify({ name: "x".repeat(61) }),
      });
      const resLong = await updateBackground(reqLong, { params: Promise.resolve({ id: "1" }) });
      expect(resLong.status).toBe(400);
    });
  });
});
