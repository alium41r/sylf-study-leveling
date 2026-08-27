/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { reserveQuota, releaseQuota, checkQuota } from "@/lib/ai/usage-limiter";
import { validateUpload, detectImageType, generateSafeUploadName, MAX_UPLOAD_BYTES } from "@/lib/upload-security";
import { rateLimit, getClientIp, ipKey } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRawUnsafe: vi.fn(),
    userQuota: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/timezone-server", () => ({
  getUserTimezone: vi.fn().mockResolvedValue("UTC"),
}));

describe("S4: atomic quota reservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.userQuota.findUnique).mockResolvedValue(null);
  });

  it("reserves when the guarded upsert returns a row", async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValueOnce([{ used: 1 }]);
    const res = await reserveQuota(1, "chat");
    expect(res.allowed).toBe(true);
    expect(res.charged).toBe(true);
    expect(res.remaining).toBe(9);
  });

  it("rejects when the guarded upsert returns no row (limit reached)", async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValueOnce([]);
    vi.mocked(prisma.userQuota.findUnique).mockResolvedValueOnce({ used: 10 } as any);
    const res = await reserveQuota(1, "chat");
    expect(res.allowed).toBe(false);
    expect(res.charged).toBe(false);
  });

  it("releaseQuota decrements with a guard (never below zero)", async () => {
    await releaseQuota(1, "chat");
    const sql = String(vi.mocked(prisma.$queryRawUnsafe).mock.calls[0][0]);
    expect(sql).toContain('"used" = "UserQuota"."used" - 1');
    expect(sql).toContain('AND "used" > 0');
  });

  it("checkQuota reflects current usage for UI display", async () => {
    vi.mocked(prisma.userQuota.findUnique).mockResolvedValueOnce({ used: 3 } as any);
    const res = await checkQuota(1, "chat");
    expect(res.used).toBe(3);
    expect(res.remaining).toBe(7);
  });
});

describe("S4: upload validation", () => {
  it("detects real image types from magic bytes", () => {
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("image/jpeg");
    expect(
      detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))
    ).toBe("image/png");
    expect(detectImageType(Buffer.from("GIF89a", "latin1"))).toBe("image/gif");
    expect(detectImageType(Buffer.from("RIFF0000WEBP", "latin1"))).toBe("image/webp");
    expect(detectImageType(Buffer.from("plain text not an image"))).toBeNull();
  });

  it("rejects oversized uploads with 413", () => {
    const big = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0xff);
    big[0] = 0xff; big[1] = 0xd8; big[2] = 0xff;
    const res = validateUpload({ size: big.length, type: "image/jpeg" } as File, big);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(413);
  });

  it("rejects content whose bytes are not an allowed image type", () => {
    const res = validateUpload(
      { size: 100, type: "image/png" } as File,
      Buffer.from("<script>alert(1)</script>")
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });

  it("generates traversal-proof storage names (client filename never used)", () => {
    for (let i = 0; i < 20; i++) {
      const name = generateSafeUploadName("image/png");
      expect(name).toMatch(/^up_\d+_[0-9a-f]{12}\.png$/);
      expect(name).not.toContain("..");
      expect(name).not.toContain("/");
    }
  });

  it("accepts a valid PNG upload end-to-end", () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(64, 0x00),
    ]);
    const res = validateUpload({ size: png.length, type: "image/png" } as File, png);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.filename.endsWith(".png")).toBe(true);
  });
});

describe("S4: rate limiter (in-memory window)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows up to the limit then blocks with retry-after", async () => {
    const key = `t:${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect((await rateLimit(key, { limit: 3, windowMs: 60_000 })).allowed).toBe(true);
    }
    const blocked = await rateLimit(key, { limit: 3, windowMs: 60_000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("hashes IPs so raw addresses are never stored", () => {
    const k = ipKey("203.0.113.7");
    expect(k).not.toContain("203.0.113.7");
    expect(k).toMatch(/^[0-9a-f]{32}$/);
  });

  it("extracts Vercel-trusted IP first", () => {
    const req = new Request("http://x", {
      headers: {
        "x-vercel-forwarded-for": "8.8.8.8",
        "x-forwarded-for": "1.2.3.4",
      },
    });
    expect(getClientIp(req)).toBe("8.8.8.8");
  });
});

describe("S4: cron fail-closed behavior", () => {
  it("check-deadlines rejects when CRON_SECRET is missing", async () => {
    const original = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    const { GET } = await import("@/app/api/quests/check-deadlines/route");
    const res = await GET(new Request("http://localhost/api/quests/check-deadlines", {
      headers: { authorization: "Bearer anything" },
    }) as any);
    expect(res.status).toBe(401);
    process.env.CRON_SECRET = original;
  });

  it("daily-briefing cron reports 503 when CRON_SECRET is missing", async () => {
    const original = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    const { GET } = await import("@/app/api/cron/daily-briefing/route");
    const res = await GET(new Request("http://localhost/api/cron/daily-briefing", {
      headers: { authorization: "Bearer anything" },
    }) as any);
    expect(res.status).toBe(503);
    process.env.CRON_SECRET = original;
  });

  it("tool confirmation fails closed when no secret is configured", async () => {
    const original = process.env.TOOL_CONFIRMATION_SECRET;
    const originalJwt = process.env.JWT_SECRET;
    delete process.env.TOOL_CONFIRMATION_SECRET;
    delete process.env.JWT_SECRET;
    const mod = await import("@/lib/ai/tool-confirmation");
    expect(() => mod.signConfirmationToken("DELETE_ALL_GOALS", 1)).toThrow(/not configured/);
    process.env.TOOL_CONFIRMATION_SECRET = original;
    process.env.JWT_SECRET = originalJwt;
  });
});

describe("S5 regression: reservation 'charged' semantics (off-by-one guard)", () => {
  it("a successful reservation at the limit returns charged=true even when allowed=false", async () => {
    vi.clearAllMocks();
    // planner limit is 1; the guarded upsert returning used=1 means the FIRST
    // reservation succeeded. `allowed` (used < limit) is then false, but the
    // authoritative success flag is `charged`.
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValueOnce([{ used: 1 }]);
    const res = await reserveQuota(1, "planner");
    expect(res.charged).toBe(true);
    // Fix must gate routes on charged, not allowed — 1 < 1 is false.
    expect(res.allowed).toBe(false);
  });
});
