// Realtime, as a nudge and nothing more (Expansion Part 3 slice C, ADR 0012). A change in the database tells this device that something moved. It never
// carries content anyone trusts: the event invalidates a resource tag, and the screen re-reads through the same REST route as ever, which applies the
// server's block and membership checks. So a missed, late, duplicated or even forged event can cost a refresh and nothing else, and everything works
// with Realtime off, as the bounded polling fallbacks already do.
//
// What it does: mints the short-lived token the web already uses (GET /api/realtime/token), joins one channel of table changes, and reports "live" only
// once the server has confirmed the join. Row-level security decides what a subscriber can hear (Message: conversation participants, by the token's
// `sub`). It runs only while signed in and in front: backgrounding closes the socket, which is also what stops polling being doubled up.
import { z } from "zod";
import type { BackendClient } from "./client";
import type { ResourceStore } from "./resources";

export interface RealtimeConfig { /** The project's Realtime origin, e.g. https://abc.supabase.co. A public value. */ url: string; /** The project's anon (publishable) key. Public by design. */ key: string }
export type RealtimeLink = "off" | "connecting" | "live" | "retrying";

const tokenSchema = z.object({ enabled: z.boolean(), token: z.string().optional(), expiresIn: z.number().optional() });

/** What the app needs of a Realtime channel and socket. The real ones come from @supabase/realtime-js, and tests bring their own. */
export interface RealtimeChannelLike {
  on(type: "postgres_changes", filter: { event: "*" | "INSERT" | "UPDATE" | "DELETE"; schema: string; table: string }, callback: () => void): RealtimeChannelLike;
  subscribe(callback: (status: string) => void): RealtimeChannelLike;
}
export interface RealtimeSocketLike { channel(topic: string): RealtimeChannelLike; connect(): void; disconnect(): Promise<unknown> | unknown }
export type RealtimeSocketFactory = (config: RealtimeConfig, token: () => Promise<string | null>) => RealtimeSocketLike;

/** The tables that matter, and which resource tag each one nudges. */
export const REALTIME_TABLES: readonly { table: string; tag: string }[] = [
  { table: "Message", tag: "messages" },
  { table: "FocusSessionMember", tag: "party" },
  { table: "FocusSession", tag: "party" },
  { table: "FocusPartyMember", tag: "party" },
  { table: "Friendship", tag: "circle" },
  { table: "FriendRequest", tag: "circle" },
];

const REFRESH_MS = 25 * 60_000;
const COALESCE_MS = 250;
const RETRY_MS = [5_000, 15_000, 45_000, 120_000] as const;

export interface Realtime {
  state(): RealtimeLink;
  subscribe(listener: () => void): () => void;
  /** Hears which tags moved, so a screen holding its own request (an open conversation) can read again at once. */
  onNudge(listener: (tags: ReadonlySet<string>) => void): () => void;
  /** Starts when someone is signed in and the app is in front, and closes the socket otherwise. */
  setActive(active: boolean): void;
  dispose(): void;
}

export function createRealtime({ client, resources, config, socket, timers = { set: (work, ms) => setTimeout(work, ms), clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) } }: {
  client: BackendClient;
  resources: ResourceStore;
  /** Null when this build has no Realtime address. Then it is permanently "off" and nothing is requested. */
  config: RealtimeConfig | null;
  socket: RealtimeSocketFactory;
  timers?: { set: (work: () => void, ms: number) => unknown; clear: (handle: unknown) => void };
}): Realtime {
  const listeners = new Set<() => void>();
  const nudges = new Set<(tags: ReadonlySet<string>) => void>();
  let link: RealtimeLink = "off";
  let active = false;
  let generation = 0;
  let current: RealtimeSocketLike | null = null;
  let token: string | null = null;
  let tokenTimer: unknown;
  let retryTimer: unknown;
  let flushTimer: unknown;
  let failures = 0;
  const pending = new Set<string>();

  const setLink = (next: RealtimeLink) => { if (next === link) return; link = next; listeners.forEach((listener) => listener()); };
  const flush = () => {
    flushTimer = undefined;
    const tags = new Set(pending);
    pending.clear();
    tags.forEach((tag) => resources.invalidate(tag));
    nudges.forEach((listener) => listener(tags));
  };
  const nudge = (tag: string) => { pending.add(tag); if (flushTimer === undefined) flushTimer = timers.set(flush, COALESCE_MS); };

  async function mint(signal?: AbortSignal): Promise<string | null> {
    const answer = await client.get("/api/realtime/token", tokenSchema, signal ? { signal } : {});
    return answer.enabled && answer.token ? answer.token : null;
  }

  function close() {
    generation++;
    if (tokenTimer !== undefined) { timers.clear(tokenTimer); tokenTimer = undefined; }
    if (retryTimer !== undefined) { timers.clear(retryTimer); retryTimer = undefined; }
    const old = current;
    current = null;
    token = null;
    if (old) void Promise.resolve(old.disconnect()).catch(() => undefined);
  }

  function retry() {
    if (!active || retryTimer !== undefined) return;
    setLink("retrying");
    retryTimer = timers.set(() => { retryTimer = undefined; void open(); }, RETRY_MS[Math.min(failures, RETRY_MS.length - 1)]);
    failures++;
  }

  async function open() {
    if (!config || !active || current) return;
    const mine = ++generation;
    setLink("connecting");
    try {
      token = await mint();
      if (mine !== generation || !active) return;
      // The server has no Realtime configured, or no secret to sign with. That is the normal state of a fresh install: stay on the fallbacks, quietly.
      if (!token) { setLink("off"); return; }
      const sock = socket(config, async () => token);
      const channel = sock.channel(`sylf-native-${mine}`);
      for (const { table, tag } of REALTIME_TABLES) channel.on("postgres_changes", { event: "*", schema: "public", table }, () => nudge(tag));
      channel.subscribe((status) => {
        if (mine !== generation) return;
        if (status === "SUBSCRIBED") { failures = 0; setLink("live"); }
        // The socket rejoins by itself. Say so, so a screen goes back to its fallback until it does.
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setLink("retrying");
      });
      current = sock;
      sock.connect();
      // Tokens live thirty minutes. Mint the next one early and hand it over through the same callback the socket already uses.
      const renew = () => {
        tokenTimer = timers.set(async () => {
          tokenTimer = undefined;
          if (mine !== generation) return;
          try { const next = await mint(); if (next && mine === generation) token = next; } catch { /* The old token still has minutes in it, and the next attempt follows. */ }
          if (mine === generation) renew();
        }, REFRESH_MS);
      };
      renew();
    } catch {
      if (mine === generation) { current = null; retry(); }
    }
  }

  return {
    state: () => link,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    onNudge(listener) { nudges.add(listener); return () => { nudges.delete(listener); }; },
    setActive(next) {
      if (next === active) return;
      active = next;
      if (next) { failures = 0; void open(); }
      else { close(); setLink("off"); }
    },
    dispose() { active = false; close(); if (flushTimer !== undefined) timers.clear(flushTimer); listeners.clear(); nudges.clear(); },
  };
}
