import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRedisInstance } from "@/lib/redis";
import { sendWaitlistWelcomeEmail } from "@/lib/email";
import { z } from "zod";
import crypto from "crypto";

// ─── Rate Limiter ─────────────────────────────────────────────
// Sliding 15-minute window, keyed by a salted SHA-256 hash of the
// client identifier (IP/UserAgent). Raw IPs are NEVER stored.
//  - With Upstash Redis configured: atomic INCR + NX-expire (survives
//    serverless instance recycling — a shared pool of instances would
//    otherwise each carry their own counter).
//  - Without Redis: in-process fallback (local dev / self-hosted).
interface RateLimitBucket {
  count: number;
  resetTime: number;
}

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_WINDOW_SECONDS = 900;
const MAX_REQUESTS_PER_WINDOW = 5; // Max 5 signup attempts per 15 minutes

// ─── In-memory fallback ───────────────────────────────────────
const rateLimitMap = new Map<string, RateLimitBucket>();

function checkInMemoryRateLimit(fingerprint: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = rateLimitMap.get(fingerprint);

  if (!bucket || now > bucket.resetTime) {
    rateLimitMap.set(fingerprint, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
    const retryAfter = Math.ceil((bucket.resetTime - now) / 1000);
    return { allowed: false, retryAfterSeconds: retryAfter };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

// Clean up stale in-memory entries periodically (fallback only).
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap.entries()) {
    if (now > val.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000);

// ─── Redis-backed check (atomic; falls back on any failure) ───
async function checkRateLimit(fingerprint: string): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const redis = getRedisInstance();

  if (!redis || process.env.NODE_ENV === "test") {
    return checkInMemoryRateLimit(fingerprint);
  }

  try {
    const key = `waitlist:rl:${fingerprint}`;
    // NX-set initializes the counter with a TTL; a concurrent first request
    // that already set it simply leaves the TTL untouched.
    await redis.set(key, 0, { ex: RATE_LIMIT_WINDOW_SECONDS, nx: true });
    const count = await redis.incr(key);

    if (count > MAX_REQUESTS_PER_WINDOW) {
      const ttl = await redis.ttl(key);
      return { allowed: false, retryAfterSeconds: Math.max(1, ttl) };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  } catch (err) {
    console.warn("[waitlist] Redis rate limit unavailable — using in-memory:", err);
    return checkInMemoryRateLimit(fingerprint);
  }
}

function getClientFingerprint(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  const ip = forwarded.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  const userAgent = req.headers.get("user-agent") || "unknown";
  return crypto.createHash("sha256").update(`${ip}-${userAgent}-sylf-waitlist-salt`).digest("hex");
}

// ─── Request Validation Schema ─────────────────────────────────
const WaitlistSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Email is too short")
    .max(255, "Email is too long")
    .email("Please provide a valid email address"),
  name: z.string().trim().max(100).optional().nullable(),
  targetExam: z.string().trim().max(100).optional().nullable(),
  scholarClass: z
    .enum([
      "SCHOLAR",
      "ANALYST",
      "ENGINEER",
      "SCIENTIST",
      "RESEARCHER",
      "PSYCHOLOGIST",
      "STRATEGIST",
      "CREATIVE",
    ])
    .optional()
    .nullable(),
  referredBy: z
    .string()
    .trim()
    .min(4)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, "Invalid referral code format")
    .optional()
    .nullable(),
});

function generateReferralCode(): string {
  // Generates e.g. "sylf-7f8a9b2c"
  const bytes = crypto.randomBytes(4).toString("hex");
  return `sylf-${bytes}`;
}

export async function POST(req: NextRequest) {
  try {
    const fingerprint = getClientFingerprint(req);
    const rateLimit = await checkRateLimit(fingerprint);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Too many requests. Please wait a few minutes before trying again.",
          retryAfter: rateLimit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const parsed = WaitlistSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Invalid input";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { email, name, targetExam, scholarClass, referredBy } = parsed.data;

    // ─── Atomic Database Transaction ───────────────────────────
    const result = await prisma.$transaction(async (tx) => {
      // 1. Check for existing registration (Idempotent & safe)
      const existing = await tx.waitlistEntry.findUnique({
        where: { email },
      });

      if (existing) {
        // Compute position without exposing other users' data
        const position = await tx.waitlistEntry.count({
          where: { createdAt: { lte: existing.createdAt } },
        });

        return {
          entry: existing,
          position,
          alreadyRegistered: true,
        };
      }

      // 2. Validate and atomically increment referrer's count if valid
      let validReferrerCode: string | null = null;
      if (referredBy) {
        const referrer = await tx.waitlistEntry.findUnique({
          where: { referralCode: referredBy },
        });

        if (referrer) {
          validReferrerCode = referrer.referralCode;
          await tx.waitlistEntry.update({
            where: { referralCode: referrer.referralCode },
            data: { referralCount: { increment: 1 } },
          });
        }
      }

      // 3. Generate unique referral code with retry if collision (near-zero probability)
      let uniqueCode = generateReferralCode();
      let attempts = 0;
      while (attempts < 3) {
        const collision = await tx.waitlistEntry.findUnique({
          where: { referralCode: uniqueCode },
        });
        if (!collision) break;
        uniqueCode = generateReferralCode();
        attempts++;
      }

      // 4. Create new waitlist entry
      const newEntry = await tx.waitlistEntry.create({
        data: {
          email,
          name: name || null,
          targetExam: targetExam || null,
          scholarClass: scholarClass || null,
          referralCode: uniqueCode,
          referredBy: validReferrerCode,
        },
      });

      const position = await tx.waitlistEntry.count({
        where: { createdAt: { lte: newEntry.createdAt } },
      });

      return {
        entry: newEntry,
        position,
        alreadyRegistered: false,
      };
    });

    // Send the thank-you email only for brand-new signups (never on
    // idempotent re-submits). A failure here must never fail the signup —
    // the entry is already committed, so we swallow and log the error.
    if (!result.alreadyRegistered) {
      try {
        const delivery = await sendWaitlistWelcomeEmail({
          to: result.entry.email,
          name: result.entry.name,
          queuePosition: result.position,
          referralCode: result.entry.referralCode,
          targetExam: result.entry.targetExam,
        });
        if (!delivery.sent) {
          console.error("[Waitlist] welcome email was not accepted (signup still succeeded):", {
            provider: delivery.provider,
            error: delivery.error,
          });
        }
      } catch (err) {
        console.error("[Waitlist] welcome email failed (signup still succeeded):", err);
      }
    }

    return NextResponse.json({
      success: true,
      referralCode: result.entry.referralCode,
      position: result.position,
      referralCount: result.entry.referralCount,
      scholarClass: result.entry.scholarClass,
      targetExam: result.entry.targetExam,
      alreadyRegistered: result.alreadyRegistered,
      message: result.alreadyRegistered
        ? "You're already on the waitlist! Here is your access pass."
        : "You've been added to the waitlist. We'll notify you as early access waves roll out.",
    });
  } catch (error: any) {
    // Race condition: two concurrent signups for the same new email can both
    // pass the existence check, then the second `create` hits the unique
    // constraint. Roll back gracefully instead of returning a 500 — the user
    // should still receive their pass. (The failed transaction also rolls back
    // the referrer increment, so the referrer is never double-counted.)
    const uniqueEmailViolation =
      error?.code === "P2002" &&
      (Array.isArray(error?.meta?.target)
        ? error.meta.target.includes("email")
        : String(error?.meta?.target ?? "").includes("email"));

    if (uniqueEmailViolation) {
      try {
        const email = (await req.json()).email as string;
        const existing = await prisma.waitlistEntry.findUnique({
          where: { email },
        });
        if (existing) {
          const position = await prisma.waitlistEntry.count({
            where: { createdAt: { lte: existing.createdAt } },
          });
          return NextResponse.json({
            success: true,
            referralCode: existing.referralCode,
            position,
            referralCount: existing.referralCount,
            scholarClass: existing.scholarClass,
            targetExam: existing.targetExam,
            alreadyRegistered: true,
            message: "You're already on the waitlist! Here is your access pass.",
          });
        }
      } catch {
        // fall through to the generic 500 below
      }
    }

    console.error("[Waitlist API Error]:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred while processing your request. Please try again." },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code")?.trim();

    if (!code || !/^[a-zA-Z0-9_-]{4,64}$/.test(code)) {
      return NextResponse.json({ error: "Valid referral code is required" }, { status: 400 });
    }

    const entry = await prisma.waitlistEntry.findUnique({
      where: { referralCode: code },
      select: {
        referralCode: true,
        referralCount: true,
        scholarClass: true,
        targetExam: true,
        createdAt: true,
      },
    });

    if (!entry) {
      return NextResponse.json({ error: "Access pass not found" }, { status: 404 });
    }

    const position = await prisma.waitlistEntry.count({
      where: { createdAt: { lte: entry.createdAt } },
    });

    return NextResponse.json({
      success: true,
      referralCode: entry.referralCode,
      referralCount: entry.referralCount,
      position,
      scholarClass: entry.scholarClass,
      targetExam: entry.targetExam,
    });
  } catch (error: any) {
    console.error("[Waitlist GET Error]:", error);
    return NextResponse.json(
      { error: "Failed to retrieve access pass" },
      { status: 500 }
    );
  }
}
