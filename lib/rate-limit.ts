// ============================================================================
// Server-side rate limiter (S4) — fixed sliding window, per-key.
// ============================================================================
// Keys are opaque strings assembled by callers (never raw IPs): this module
// only counts. Uses Upstash Redis (atomic INCR + NX-expire) when configured;
// otherwise falls back to an in-process fixed window (local dev / self-host).
// ============================================================================
import crypto from "crypto";
import { getRedisInstance } from "@/lib/redis";

const WINDOW_SECONDS = 60;

interface Bucket {
  count: number;
  resetAt: number;
}

const memory = new Map<string, Bucket>();

function pruneMemory(now: number) {
  if (memory.size < 10_000) return;
  for (const [key, b] of memory) {
    if (now > b.resetAt) memory.delete(key);
  }
}

export interface RateLimitOptions {
  /** Max allowed requests per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export async function rateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions
): Promise<RateLimitResult> {
  const redis = getRedisInstance();

  if (redis && process.env.NODE_ENV !== "test") {
    try {
      const redisKey = `rl:${key}`;
      const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
      await redis.set(redisKey, 0, { ex: windowSeconds, nx: true });
      const count = await redis.incr(redisKey);
      if (count > limit) {
        const ttl = await redis.ttl(redisKey);
        return { allowed: false, retryAfterSeconds: Math.max(1, ttl) };
      }
      return { allowed: true, retryAfterSeconds: 0 };
    } catch (err) {
      console.warn("[rate-limit] Redis unavailable — using in-memory fallback:", err);
    }
  }

  const now = Date.now();
  pruneMemory(now);
  const bucket = memory.get(key);
  if (!bucket || now >= bucket.resetAt) {
    memory.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (bucket.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }
  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Extracts the best-effort client IP for rate limiting. Prefers Vercel's
 * trusted header, then x-real-ip, then the first x-forwarded-for hop.
 * NOTE: on self-hosted setups without a trusted proxy this value is
 * spoofable — always pair IP limits with per-user quotas.
 */
export function getClientIp(req: Request): string {
  return (
    req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/** One-way hash so raw IPs are never stored (Redis keys / memory). */
export function ipKey(ip: string): string {
  return crypto.createHash("sha256").update(`${ip}-sylf-ip-salt`).digest("hex").slice(0, 32);
}
