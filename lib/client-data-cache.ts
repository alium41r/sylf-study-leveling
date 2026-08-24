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

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
}

const memoryCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

const MAX_MEMORY_ENTRIES = 200;

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

export interface FetchCachedOptions {
  /** Responses younger than this are returned without any network request. */
  ttlMs?: number;
  /** Responses older than `ttlMs` but younger than this are replayed instantly and revalidated in the background. */
  staleMs?: number;
  /** Optional localStorage key so the first paint is instant even after a full page reload. */
  storageKey?: string;
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
  opts: FetchCachedOptions = {}
): Promise<T | null> {
  const { ttlMs = 10_000, staleMs = 60_000, storageKey } = opts;
  const now = Date.now();

  const memoryHit = memoryCache.get(url);
  const entry: CacheEntry | null =
    memoryHit ?? (storageKey ? readStorage(storageKey) : null);
  if (entry) {
    if (!memoryHit) memoryCache.set(url, entry);
    const age = now - entry.fetchedAt;
    if (age < ttlMs) {
      return entry.data as T;
    }
    if (age < staleMs) {
      // Stale but usable: paint now, refresh in the background.
      void doFetch(url, init, storageKey);
      return entry.data as T;
    }
  }

  return (await doFetch(url, init, storageKey)) as T | null;
}

function doFetch(url: string, init?: RequestInit, storageKey?: string): Promise<unknown> {
  const existing = inflight.get(url);
  if (existing) return existing; // Single-flight: share in-flight requests.

  const request = (async () => {
    try {
      const res = await fetch(url, { ...init, cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }
      const data = await res.json();
      const entry: CacheEntry = { data, fetchedAt: Date.now() };
      memoryCache.set(url, entry);
      if (storageKey) writeStorage(storageKey, entry);
      pruneMemory();
      return data;
    } catch {
      // Errors are never cached. Callers fall back to their previous state.
      return null;
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, request);
  return request;
}
