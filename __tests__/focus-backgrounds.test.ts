import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  extractImageDimensions,
  validateDesktopBackgroundDimensions,
  MIN_DESKTOP_WIDTH,
  MIN_DESKTOP_HEIGHT,
} from "@/lib/image-dimensions";
import {
  isValidLayoutKey,
  normalizeLayoutKey,
  VALID_LAYOUT_KEYS,
  DEFAULT_LAYOUT_KEY,
} from "@/lib/focus-background-types";
import { isEmailInAdminBootstrap } from "@/lib/auth-admin";
import { getBackgroundPublicUrl, FOCUS_BACKGROUNDS_BUCKET } from "@/lib/supabase-storage";

describe("Focus Backgrounds — Image Dimensions & Aspect Ratio Parser", () => {
  it("correctly decodes PNG 1080p dimensions and detects 16:9 ratio", () => {
    // Construct standard PNG header with IHDR chunk for 1920x1080
    const png = Buffer.alloc(32);
    png[0] = 0x89;
    png[1] = 0x50;
    png[2] = 0x4e;
    png[3] = 0x47;
    png[4] = 0x0d;
    png[5] = 0x0a;
    png[6] = 0x1a;
    png[7] = 0x0a;
    png.writeUInt32BE(1920, 16);
    png.writeUInt32BE(1080, 20);

    const result = extractImageDimensions(png);
    expect(result).not.toBeNull();
    expect(result?.width).toBe(1920);
    expect(result?.height).toBe(1080);
    expect(result?.aspectRatio).toBeCloseTo(1.7778, 3);
    expect(result?.isRecommended16x9).toBe(true);

    const validation = validateDesktopBackgroundDimensions(result);
    expect(validation.ok).toBe(true);
  });

  it("correctly decodes 4K PNG dimensions (3840x2160)", () => {
    const png4k = Buffer.alloc(32);
    png4k[0] = 0x89;
    png4k[1] = 0x50;
    png4k[2] = 0x4e;
    png4k[3] = 0x47;
    png4k[4] = 0x0d;
    png4k[5] = 0x0a;
    png4k[6] = 0x1a;
    png4k[7] = 0x0a;
    png4k.writeUInt32BE(3840, 16);
    png4k.writeUInt32BE(2160, 20);

    const result = extractImageDimensions(png4k);
    expect(result?.width).toBe(3840);
    expect(result?.height).toBe(2160);
    expect(result?.isRecommended16x9).toBe(true);
  });

  it("correctly decodes GIF dimensions (1920x1080)", () => {
    const gif = Buffer.alloc(16);
    gif.write("GIF89a", 0, "latin1");
    gif.writeUInt16LE(1920, 6);
    gif.writeUInt16LE(1080, 8);

    const result = extractImageDimensions(gif);
    expect(result?.width).toBe(1920);
    expect(result?.height).toBe(1080);
    expect(result?.isRecommended16x9).toBe(true);
  });

  it("correctly decodes JPEG baseline SOF0 dimensions", () => {
    // SOI (2 bytes) + SOF0 marker (0xFF, 0xC0) + length (2 bytes) + precision (1 byte) + H (2 bytes) + W (2 bytes)
    const jpeg = Buffer.alloc(32);
    jpeg[0] = 0xff;
    jpeg[1] = 0xd8;
    jpeg[2] = 0xff;
    jpeg[3] = 0xc0; // SOF0
    jpeg.writeUInt16BE(17, 4); // marker length
    jpeg[6] = 8; // precision
    jpeg.writeUInt16BE(1080, 7); // height
    jpeg.writeUInt16BE(1920, 9); // width

    const result = extractImageDimensions(jpeg);
    expect(result).not.toBeNull();
    expect(result?.width).toBe(1920);
    expect(result?.height).toBe(1080);
    expect(result?.aspectRatio).toBeCloseTo(1.7778, 3);
  });

  it("rejects undersized low-resolution images (<1280x720)", () => {
    const smallPng = Buffer.alloc(32);
    smallPng[0] = 0x89;
    smallPng[1] = 0x50;
    smallPng[2] = 0x4e;
    smallPng[3] = 0x47;
    smallPng[4] = 0x0d;
    smallPng[5] = 0x0a;
    smallPng[6] = 0x1a;
    smallPng[7] = 0x0a;
    smallPng.writeUInt32BE(800, 16);
    smallPng.writeUInt32BE(600, 20);

    const result = extractImageDimensions(smallPng);
    expect(result?.width).toBe(800);
    expect(result?.height).toBe(600);

    const validation = validateDesktopBackgroundDimensions(result);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.status).toBe(422);
      expect(validation.error).toContain("Resolution too low");
    }
  });

  it("handles null and corrupted buffers safely", () => {
    expect(extractImageDimensions(Buffer.alloc(0))).toBeNull();
    expect(extractImageDimensions(Buffer.from("not an image binary"))).toBeNull();
    expect(validateDesktopBackgroundDimensions(null).ok).toBe(false);
  });
});

describe("Focus Backgrounds — Layout Key Registry & Safety", () => {
  it("validates official layout keys", () => {
    for (const key of VALID_LAYOUT_KEYS) {
      expect(isValidLayoutKey(key)).toBe(true);
      expect(normalizeLayoutKey(key)).toBe(key);
    }
  });

  it("safely falls back unknown or corrupted layout keys to 'classic'", () => {
    expect(normalizeLayoutKey("unknown_future_key")).toBe(DEFAULT_LAYOUT_KEY);
    expect(normalizeLayoutKey("cyberpunk-theme")).toBe("classic");
    expect(normalizeLayoutKey(null)).toBe("classic");
    expect(normalizeLayoutKey(undefined)).toBe("classic");
    expect(normalizeLayoutKey("")).toBe("classic");
  });
});

describe("Focus Backgrounds — Admin Bootstrap Verification", () => {
  const originalEnv = process.env.ADMIN_EMAILS;

  beforeEach(() => {
    process.env.ADMIN_EMAILS = "owner@sylf.app, admin@sylf.local";
  });

  afterEach(() => {
    process.env.ADMIN_EMAILS = originalEnv;
  });

  it("identifies authorized admin bootstrap emails case-insensitively", () => {
    expect(isEmailInAdminBootstrap("owner@sylf.app")).toBe(true);
    expect(isEmailInAdminBootstrap("OWNER@SYLF.APP")).toBe(true);
    expect(isEmailInAdminBootstrap("admin@sylf.local")).toBe(true);
  });

  it("rejects non-allowlisted emails", () => {
    expect(isEmailInAdminBootstrap("hacker@malicious.com")).toBe(false);
    expect(isEmailInAdminBootstrap("regular_student@gmail.com")).toBe(false);
    expect(isEmailInAdminBootstrap(null)).toBe(false);
    expect(isEmailInAdminBootstrap("")).toBe(false);
  });
});

describe("Focus Backgrounds — Storage Path & Public URL Normalization", () => {
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mock-sylf.supabase.co";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
  });

  it("generates correct clean CDN URL without duplicating bucket name in path", () => {
    const storagePath = "classic-sylf/bg_1788789000_abc123.jpg";
    const url = getBackgroundPublicUrl(storagePath);
    expect(url).toBe(
      "https://mock-sylf.supabase.co/storage/v1/object/public/focus-backgrounds/classic-sylf/bg_1788789000_abc123.jpg"
    );
  });

  it("strips accidental bucket prefix if present", () => {
    const prefixedPath = "focus-backgrounds/anime/bg_sample.png";
    const url = getBackgroundPublicUrl(prefixedPath);
    expect(url).toBe(
      "https://mock-sylf.supabase.co/storage/v1/object/public/focus-backgrounds/anime/bg_sample.png"
    );
  });
});

describe("Focus Backgrounds — Upload Security & Rate Limiting", () => {
  it("enforces sliding-window rate limiting for upload actions", async () => {
    const { rateLimit } = await import("@/lib/rate-limit");
    const testKey = `test-admin-upload-${Date.now()}`;
    const opts = { limit: 3, windowMs: 10_000 };

    const res1 = await rateLimit(testKey, opts);
    expect(res1.allowed).toBe(true);

    const res2 = await rateLimit(testKey, opts);
    expect(res2.allowed).toBe(true);

    const res3 = await rateLimit(testKey, opts);
    expect(res3.allowed).toBe(true);

    const res4 = await rateLimit(testKey, opts);
    expect(res4.allowed).toBe(false);
    expect(res4.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("enforces sliding-window rate limiting for replace actions", async () => {
    const { rateLimit } = await import("@/lib/rate-limit");
    const testKey = `test-admin-replace-${Date.now()}`;
    const opts = { limit: 2, windowMs: 10_000 };

    expect((await rateLimit(testKey, opts)).allowed).toBe(true);
    expect((await rateLimit(testKey, opts)).allowed).toBe(true);
    const blocked = await rateLimit(testKey, opts);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("detects genuine magic bytes and rejects spoofed extensions", async () => {
    const { detectImageType } = await import("@/lib/upload-security");

    // Valid JPEG SOI
    const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectImageType(validJpeg)).toBe("image/jpeg");

    // Valid PNG signature
    const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectImageType(validPng)).toBe("image/png");

    // Spoofed executable or script disguised as image
    const phpScript = Buffer.from("<?php echo 'malicious'; ?>");
    expect(detectImageType(phpScript)).toBeNull();

    const htmlScript = Buffer.from("<html><script>alert(1)</script></html>");
    expect(detectImageType(htmlScript)).toBeNull();
  });
});

