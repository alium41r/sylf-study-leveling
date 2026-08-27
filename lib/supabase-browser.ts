// ============================================================================
// Supabase Realtime browser client (client-safe module).
// ============================================================================
// The app authenticates with its own JWT, not Supabase Auth — so this module
// minted-JWT approach is used: the server signs a Supabase-format JWT for the
// logged-in user (see /api/realtime/token), and this singleton attaches it to
// a createClient() instance so Realtime presence + postgres_changes channels
// run as `authenticated` with the user's real id.
//
// S3: the minted token is held IN MEMORY ONLY (never localStorage) and is
// requested with the httpOnly session cookie (credentials: "include").
//
// Everything degrades gracefully: if NEXT_PUBLIC_SUPABASE_URL /
// NEXT_PUBLIC_SUPABASE_ANON_KEY are not set, or the token route reports
// `enabled: false` (no SUPABASE_JWT_SECRET), every hook that uses this module
// becomes a no-op and the app falls back to its REST polling + heartbeat.
// ============================================================================
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

// In-memory minted-JWT cache (module scope). Survives client-side navigations
// but NOT page reloads — a reload simply re-mints through the cookie session.
let cachedJwt: { token: string; expiresAt: number } | null = null;
const JWT_CACHE_MS = 25 * 60 * 1000; // minted tokens live 30min; refresh at 25min

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
 * Obtain a Supabase-format JWT for the current user from the server.
 * Authenticates with the httpOnly session cookie; the result is cached in
 * memory only. Returns null when Realtime isn't configured or the user is
 * not authenticated.
 */
export async function getRealtimeJwt(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  // 1. Reuse a still-valid in-memory token (survives client-side navigations).
  if (cachedJwt && cachedJwt.expiresAt > Date.now() && cachedJwt.token) {
    return cachedJwt.token;
  }

  try {
    const res = await fetch("/api/realtime/token", {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { enabled?: boolean; token?: string };
    if (!data?.enabled || !data?.token) return null;
    cachedJwt = { token: data.token, expiresAt: Date.now() + JWT_CACHE_MS };
    return data.token;
  } catch (err) {
    console.warn("[realtime] failed to fetch minted JWT — staying on polling:", err);
    return null;
  }
}

/** Attach the minted JWT to the client so Realtime authenticates as the user. */
export async function attachRealtimeAuth(): Promise<SupabaseClient | null> {
  const sb = getSupabaseBrowser();
  if (!sb) return null;
  const jwt = await getRealtimeJwt();
  if (!jwt) return null;
  try {
    await sb.auth.setSession({ access_token: jwt, refresh_token: jwt });
    return sb;
  } catch (err) {
    console.warn("[realtime] setSession failed:", err);
    return null;
  }
}
