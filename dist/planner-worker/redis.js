"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRedisEnabled = isRedisEnabled;
exports.getRedisInstance = getRedisInstance;
exports.cachedWithRedis = cachedWithRedis;
exports.invalidateRedisKeys = invalidateRedisKeys;
// ============================================================================
// Redis cache layer for hot reads (Upstash REST — the same choice made in the
// "25,000 users" scaling video for offloading repeated DB reads).
// ============================================================================
// Server-only module. When UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
// are not configured, it silently degrades to a small in-process LRU cache so
// local development and self-hosted deployments keep working with zero setup.
// ============================================================================
const redis_1 = require("@upstash/redis");
let client = null;
let initAttempted = false;
function getRedisClient() {
    if (initAttempted)
        return client;
    initAttempted = true;
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token)
        return null;
    try {
        client = new redis_1.Redis({ url, token });
    }
    catch (err) {
        console.warn("[redis] failed to initialize Upstash client — falling back to memory:", err);
        client = null;
    }
    return client;
}
function isRedisEnabled() {
    return getRedisClient() !== null;
}
/**
 * The raw Redis client (or null when not configured). Exposed for
 * counter-style operations (e.g. rate limiting) that need atomic
 * INCR/EXPIRE rather than the read-through cache helper.
 */
function getRedisInstance() {
    return getRedisClient();
}
// ── In-process fallback cache (LRU-ish, bounded) ──────────────
const MAX_MEMORY_ENTRIES = 500;
const memoryCache = new Map();
function memGet(key) {
    const entry = memoryCache.get(key);
    if (!entry)
        return undefined;
    if (Date.now() > entry.expiresAt) {
        memoryCache.delete(key);
        return undefined;
    }
    return entry.value;
}
function memSet(key, value, ttlSeconds) {
    if (memoryCache.size >= MAX_MEMORY_ENTRIES) {
        const oldest = memoryCache.keys().next().value;
        if (oldest !== undefined)
            memoryCache.delete(oldest);
    }
    memoryCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}
function memDelete(key) {
    memoryCache.delete(key);
}
function decodeStoredValue(raw) {
    // Upstash may return the raw string we stored (JSON) or an already-parsed
    // object depending on payload/content-type detection. Normalize both.
    if (typeof raw === "string") {
        try {
            return JSON.parse(raw);
        }
        catch {
            return raw;
        }
    }
    return raw;
}
/**
 * Cache-through helper: returns the cached value when present, otherwise runs
 * `fn`, stores the result for `ttlSeconds`, and returns it. All failures
 * (network, quota, serialization) fall back to running `fn` directly so the
 * cache can never break a request path.
 */
async function cachedWithRedis(key, ttlSeconds, fn) {
    // In tests, bypass caching entirely so mocks never leak across test cases
    // through the shared in-process fallback cache.
    if (process.env.NODE_ENV === "test") {
        return fn();
    }
    const redis = getRedisClient();
    // ── No Redis configured: in-process cache only ──────────────
    if (!redis) {
        const hit = memGet(key);
        if (hit !== undefined)
            return hit;
        const value = await fn();
        memSet(key, value, ttlSeconds);
        return value;
    }
    // ── Redis read ──────────────────────────────────────────────
    try {
        const cached = await redis.get(key);
        if (cached !== null && cached !== undefined) {
            return decodeStoredValue(cached);
        }
    }
    catch (err) {
        console.warn(`[redis] GET ${key} failed — bypassing cache:`, err);
    }
    // ── Miss: compute + store ───────────────────────────────────
    const value = await fn();
    try {
        await redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
    }
    catch (err) {
        console.warn(`[redis] SET ${key} failed — value computed but not cached:`, err);
    }
    return value;
}
/**
 * Drop keys from both Redis and the in-process fallback.
 */
async function invalidateRedisKeys(...keys) {
    for (const key of keys)
        memDelete(key);
    const redis = getRedisClient();
    if (!redis)
        return;
    try {
        if (keys.length > 0)
            await redis.del(...keys);
    }
    catch (err) {
        console.warn("[redis] DEL failed:", err);
    }
}
