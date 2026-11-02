// ============================================================================
// Client-side stale-while-revalidate (SWR) fetch cache.
// ============================================================================
// The app's pages are client components that fetch API data on mount. Without
// a cache, every navigation pays the full network + DB cost before the page
// can paint. This helper stores the last successful JSON response in memory
// (and optionally localStorage) and replays it instantly on repeat visits,
// then refreshes it in the background — the same pattern recommended for
// scaling Next.js + Supabase apps (stale-while-revalidate + client caching).
// ============================================================================

import { resolveApiUrl } from "./api-transport";
import { invalidateNotesAccess } from "./notes/session";

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
  url?: string;
}

const memoryCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();
const inflightUrls = new Map<string, string>();
const generations = new Map<string, number>();
const subscribers = new Map<string, Set<(data: unknown) => void>>();
const inflightCallbacks = new Map<string, Set<(data: unknown) => void>>();

const MAX_MEMORY_ENTRIES = 200;

// S3: never persist these endpoints to localStorage — they contain private
// AI content (daily briefings, insights, system chat transcripts) that must not
// outlive the session on a shared device. They still benefit from the in-memory cache.
const NO_PERSIST_FRAGMENTS = [
  "briefing",
  "insights",
  "ai-memory",
  "ai-insight",
  "planner",
  "pixel-creations",
  "sys-msgs",
  "system-messages",
];

function isPersistable(key: string): boolean {
  const k = key.toLowerCase();
  return !NO_PERSIST_FRAGMENTS.some((f) => k.includes(f));
}

function isSamePayload(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/** Clear every client-side cache key that carries user data (S3 logout hygiene). */
let sessionEpoch = 0;
export function getClientSessionEpoch(): number { return sessionEpoch; }
export function clearClientCache(): void {
  sessionEpoch++;
  invalidateNotesAccess();
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("calendar-session-ended"));
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (
        key &&
        (key.startsWith("sylf_cache:") ||
          key === "sylf_cached_weekly_quest" ||
          key.startsWith("focus_scratchpad") ||
          key.startsWith("focus_notes") ||
          key.startsWith("pixel_studio:") ||
          key.startsWith("sylf_calendar_recognition_draft:") || key.startsWith("sylf_calendar_draft:") || key.startsWith("sylf_calendar_event:"))
      ) {
        doomed.push(key);
      }
    }
    for (const key of doomed) window.localStorage.removeItem(key);
  } catch {
    // Quota/corruption — nothing critical.
  }
  memoryCache.clear();
  for (const key of inflight.keys()) generations.set(key, (generations.get(key) ?? 0) + 1);
  inflight.clear();
  inflightUrls.clear();
  inflightCallbacks.clear();
}

function pruneMemory() {
  if (memoryCache.size <= MAX_MEMORY_ENTRIES) return;
  const entries = [...memoryCache.entries()].sort(
    (a, b) => a[1].fetchedAt - b[1].fetchedAt
  );
  for (const [key] of entries.slice(0, memoryCache.size - MAX_MEMORY_ENTRIES)) {
    memoryCache.delete(key);
  }
}

function readStorage(key: string): CacheEntry | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(`sylf_cache:${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (parsed && typeof parsed.fetchedAt === "number" && "data" in parsed) {
      return parsed;
    }
  } catch {
    // Quota exceeded / corrupt JSON — treat as a miss.
  }
  return null;
}

function writeStorage(key: string, entry: CacheEntry) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(`sylf_cache:${key}`, JSON.stringify(entry));
  } catch {
    // Quota exceeded — memory cache still works.
  }
}

export interface FetchCachedOptions<T = unknown> {
  /** Responses younger than this are returned without any network request. */
  ttlMs?: number;
  /** Responses older than `ttlMs` but younger than this are replayed instantly and revalidated in the background. */
  staleMs?: number;
  /** Optional localStorage key so the first paint is instant even after a full page reload. */
  storageKey?: string;
  /** Bypass the cache completely and fetch fresh from network. */
  forceFresh?: boolean;
  /** Optional callback invoked if a background stale-while-revalidate refresh produces updated data. */
  onUpdate?: (data: T) => void;
}

/**
 * Subscribe to cache updates for a given cacheKey (`storageKey || url`).
 * Returns an unsubscribe function.
 */
export function subscribeClientCache<T = unknown>(
  keyOrUrl: string,
  listener: (data: T) => void
): () => void {
  let set = subscribers.get(keyOrUrl);
  if (!set) {
    set = new Set();
    subscribers.set(keyOrUrl, set);
  }
  const wrapped = listener as (data: unknown) => void;
  set.add(wrapped);
  return () => {
    const current = subscribers.get(keyOrUrl);
    if (!current) return;
    current.delete(wrapped);
    if (current.size === 0) subscribers.delete(keyOrUrl);
  };
}

/**
 * Synchronously read a warm cached value (from memory or localStorage) without
 * starting a network request. Useful for seeding initial component state.
 */
export function readCachedJSON<T = unknown>(
  url: string,
  opts: Pick<FetchCachedOptions<T>, "staleMs" | "storageKey"> = {}
): T | null {
  const { staleMs = 60_000, storageKey } = opts;
  const cacheKey = storageKey || url;
  const memoryHit = memoryCache.get(cacheKey);
  const entry: CacheEntry | null =
    memoryHit ?? (storageKey && isPersistable(storageKey) && isPersistable(url) ? readStorage(storageKey) : null);
  if (!entry) return null;
  if (!memoryHit) memoryCache.set(cacheKey, entry);
  if (Date.now() - entry.fetchedAt < staleMs) {
    return entry.data as T;
  }
  return null;
}

/** Share only an outstanding read, retaining neither a stale value nor storage.
 * Reuses the same logout/invalidation generations as cached application reads. */
export function shareClientRead<T>(key: string, load: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const epoch = sessionEpoch, generation = generations.get(key) ?? 0;
  const request = Promise.resolve().then(load).then(value => {
    if (sessionEpoch !== epoch || (generations.get(key) ?? 0) !== generation)
      throw new Error("CLIENT_READ_INVALIDATED");
    return value;
  }).finally(() => {
    if (inflight.get(key) === request) inflight.delete(key);
  });
  inflight.set(key, request);
  return request;
}

/** Invalidate client-side cache entries matching a URL or key fragment. */
export function invalidateClientCache(urlOrPrefix: string): void {
  invalidateClientCaches([urlOrPrefix]);
}

/** One invalidation pass; never starts a fetch. Ignore stale in-flight responses. */
export function invalidateClientCaches(fragments: readonly string[]): void {
  if (typeof window === "undefined") return;
  try {
    for (const key of new Set([...memoryCache.keys(), ...inflight.keys()])) {
      const associatedUrl = memoryCache.get(key)?.url ?? inflightUrls.get(key) ?? "";
      if (fragments.some(fragment => key.includes(fragment) || associatedUrl.includes(fragment))) {
        memoryCache.delete(key);
        generations.set(key, (generations.get(key) ?? 0) + 1);
        inflight.delete(key);
        inflightUrls.delete(key);
        inflightCallbacks.delete(key);
      }
    }
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith("sylf_cache:")) continue;
      if (fragments.some(fragment => key.includes(fragment))) {
        doomed.push(key);
        continue;
      }
      try {
        const raw = window.localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw) as CacheEntry;
          if (parsed?.url && fragments.some(fragment => parsed.url!.includes(fragment))) {
            doomed.push(key);
          }
        }
      } catch {
        // ignore
      }
    }
    for (const key of doomed) window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * Fetch JSON with a stale-while-revalidate cache. Returns the cached payload
 * immediately when available (and revalidates in the background), otherwise
 * waits for the network. Returns `null` only when the request fails and there
 * is no cached fallback — callers should keep their previous state in that case.
 */
export async function fetchCachedJSON<T = unknown>(
  url: string,
  init?: RequestInit,
  opts: FetchCachedOptions<T> = {}
): Promise<T | null> {
  const { ttlMs = 10_000, staleMs = 60_000, storageKey, forceFresh = false, onUpdate } = opts;
  const now = Date.now();
  const cacheKey = storageKey || url;

  if (!forceFresh) {
    const memoryHit = memoryCache.get(cacheKey);
    const entry: CacheEntry | null =
      memoryHit ?? (storageKey && isPersistable(storageKey) && isPersistable(url) ? readStorage(storageKey) : null);
    if (entry) {
      if (!entry.url) entry.url = url;
      if (!memoryHit) memoryCache.set(cacheKey, entry);
      const age = now - entry.fetchedAt;
      if (age < ttlMs) {
        return entry.data as T;
      }
      if (age < staleMs) {
        // Stale but usable: paint now, refresh in the background and notify if changed.
        void doFetch(url, init, storageKey, onUpdate as ((data: unknown) => void) | undefined);
        return entry.data as T;
      }
    }
  } else if (inflight.has(cacheKey)) {
    generations.set(cacheKey, (generations.get(cacheKey) ?? 0) + 1);
    inflight.delete(cacheKey);
    inflightUrls.delete(cacheKey);
    inflightCallbacks.delete(cacheKey);
  }

  return (await doFetch(url, init, storageKey)) as T | null;
}

function registerInflightCallback(cacheKey: string, cb?: (data: unknown) => void) {
  if (!cb) return;
  let set = inflightCallbacks.get(cacheKey);
  if (!set) {
    set = new Set();
    inflightCallbacks.set(cacheKey, set);
  }
  set.add(cb);
}

function doFetch(
  url: string,
  init?: RequestInit,
  storageKey?: string,
  onBackgroundUpdate?: (data: unknown) => void
): Promise<unknown> {
  const cacheKey = storageKey || url;
  registerInflightCallback(cacheKey, onBackgroundUpdate);
  const existing = inflight.get(cacheKey);
  if (existing) return existing; // Single-flight: share in-flight requests.
  const epoch = sessionEpoch;
  const generation = generations.get(cacheKey) ?? 0;
  const previousEntry = memoryCache.get(cacheKey);
  inflightUrls.set(cacheKey, url);

  const request = (async () => {
    try {
      const resolvedUrl = resolveApiUrl(url);
      const res = await fetch(resolvedUrl, { credentials: "include", ...init, cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }
      const data = await res.json();
      const entry: CacheEntry = { data, fetchedAt: Date.now(), url };
      if (sessionEpoch !== epoch || (generations.get(cacheKey) ?? 0) !== generation) return null;
      memoryCache.set(cacheKey, entry);
      // S3: sensitive endpoints stay memory-only even when a storageKey was
      // requested.
      if (storageKey && isPersistable(storageKey) && isPersistable(url)) {
        writeStorage(storageKey, entry);
      }
      pruneMemory();

      const changed = !previousEntry || !isSamePayload(previousEntry.data, data);
      const callbacks = inflightCallbacks.get(cacheKey);
      inflightCallbacks.delete(cacheKey);
      if (changed && callbacks) {
        for (const cb of callbacks) {
          try {
            cb(data);
          } catch {
            // ignore listener error
          }
        }
      }
      if (changed) {
        const keysToNotify = cacheKey === url ? [cacheKey] : [cacheKey, url];
        for (const notifyKey of keysToNotify) {
          const subs = subscribers.get(notifyKey);
          if (!subs) continue;
          for (const sub of subs) {
            try {
              sub(data);
            } catch {
              // ignore listener error
            }
          }
        }
      }
      return data;
    } catch {
      // Errors are never cached. Callers fall back to their previous state.
      return null;
    } finally {
      if (sessionEpoch === epoch && (generations.get(cacheKey) ?? 0) === generation) {
        inflight.delete(cacheKey);
        inflightUrls.delete(cacheKey);
        inflightCallbacks.delete(cacheKey);
      }
    }
  })();

  inflight.set(cacheKey, request);
  return request;
}
