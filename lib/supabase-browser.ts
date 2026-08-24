// ============================================================================
// Supabase Realtime browser client (client-safe module).
// ============================================================================
// The app authenticates with its own JWT, not Supabase Auth — so this module
// minted-JWT approach is used: the server signs a Supabase-format JWT for the
// logged-in user (see /api/realtime/token), and this singleton attaches it to
// a createClient() instance so Realtime presence + postgres_changes channels
// run as `authenticated` with the user's real id.
//
// Everything degrades gracefully: if NEXT_PUBLIC_SUPABASE_URL /
// NEXT_PUBLIC_SUPABASE_ANON_KEY are not set, or the token route reports
// `enabled: false` (no SUPABASE_JWT_SECRET), every hook that uses this module
// becomes a no-op and the app falls back to its REST polling + heartbeat.
// ============================================================================
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

const JWT_STORAGE_KEY = "sylf_realtime_jwt";
const JWT_CACHE_MS = 50 * 60 * 1000; // minted tokens live 1h; refresh at 50min

export function isRealtimeConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/** Lazily create the browser Supabase client (auth persistence disabled — we attach our own JWT). */
export function getSupabaseBrowser(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (!isRealtimeConfigured()) return null;
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );
  }
  return client;
}

/**
 * Obtain a Supabase-format JWT for the current user. The server route returns
 * `{ enabled: false }` when Realtime isn't configured — callers treat that as
 * "stay on polling".
 */
export async function getRealtimeJwt(appToken: string): Promise<string | null> {
  if (typeof window === "undefined") return null;

  // 1. Reuse a still-valid cached token (survives client-side navigations
  //    and full reloads, so we only re-mint once per hour).
  try {
    const raw = window.localStorage.getItem(JWT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { token?: string; expiresAt?: number };
      if (parsed?.token && parsed?.expiresAt && parsed.expiresAt > Date.now()) {
        return parsed.token;
      }
    }
  } catch {
    // Ignore corrupt cache.
  }

  try {
    const res = await fetch("/api/realtime/token", {
      headers: { Authorization: `Bearer ${appToken}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { enabled?: boolean; token?: string };
    if (!data?.enabled || !data?.token) return null;
    try {
      window.localStorage.setItem(
        JWT_STORAGE_KEY,
        JSON.stringify({ token: data.token, expiresAt: Date.now() + JWT_CACHE_MS })
      );
    } catch {
      // Quota — non-fatal.
    }
    return data.token;
  } catch (err) {
    console.warn("[realtime] failed to fetch minted JWT — staying on polling:", err);
    return null;
  }
}

/** Attach the minted JWT to the client so Realtime authenticates as the user. */
export async function attachRealtimeAuth(appToken: string): Promise<SupabaseClient | null> {
  const sb = getSupabaseBrowser();
  if (!sb) return null;
  const jwt = await getRealtimeJwt(appToken);
  if (!jwt) return null;
  try {
    await sb.auth.setSession({ access_token: jwt, refresh_token: jwt });
    return sb;
  } catch (err) {
    console.warn("[realtime] setSession failed:", err);
    return null;
  }
}
