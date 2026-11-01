// Cached server data, and the states a screen shows for it. One object per read, created once, watched through useSyncExternalStore.
//
// What it guarantees. A read runs only while someone is watching, and walking away cancels it. What was loaded stays on screen while a
// fresher copy arrives, and stays through a failure, marked stale. A refresh that returns the same data keeps the same snapshot, so nothing
// re-renders. Nothing polls: reads repeat on invalidation, on reconnection and on return to the foreground, and only once they are older
// than their `ttlMs`. Nothing here is ever written to disk, and `clear` drops everything, including answers still in flight, at sign-out.
import { BackendError } from "./errors";
import type { Connectivity } from "./connectivity";

export type ResourceStatus = "idle" | "loading" | "ready" | "empty" | "offline" | "failed" | "signed-out";

export interface ResourceState<T> {
  status: ResourceStatus;
  /** The last good value, kept through refreshes and failures. */
  data: T | null;
  error: BackendError | null;
  /** True while `data` is older than what the server may hold: a refresh is running, or the last one failed. */
  stale: boolean;
  updatedAt: number | null;
}

export interface Resource<T> {
  getSnapshot(): ResourceState<T>;
  subscribe(listener: () => void): () => void;
  /** Forces a read now, if someone is watching. Otherwise the next watcher gets one. */
  refresh(): void;
}

export interface ResourceDefinition<T> {
  key: string;
  load(signal: AbortSignal): Promise<T>;
  /** How long a value counts as fresh. */
  ttlMs?: number;
  isEmpty?(data: T): boolean;
  /** Mutations invalidate by tag. */
  tags?: readonly string[];
}

export interface ResourceStore {
  resource<T>(definition: ResourceDefinition<T>): Resource<T>;
  invalidate(tag: string): void;
  /** The app came back to the front. */
  wake(): void;
  /** Sign-out, or another account. Everything goes, and an answer still in flight is thrown away. */
  clear(): void;
  size(): number;
}

const DEFAULT_TTL_MS = 60_000;
const IDLE: ResourceState<never> = { status: "idle", data: null, error: null, stale: false, updatedAt: null };
/** Definitions nobody is watching are dropped oldest first past this, so the store cannot grow with every date a calendar visits. */
const MAX_UNWATCHED = 64;

const sameData = (left: unknown, right: unknown) => { try { return JSON.stringify(left) === JSON.stringify(right); } catch { return false; } };

export function createResourceStore({ connectivity, now = Date.now }: { connectivity?: Connectivity; now?: () => number } = {}): ResourceStore {
  interface Entry { refresh(force: boolean): void; reset(): void; tags: readonly string[]; watched(): boolean; touched: number; api: Resource<unknown> }
  const entries = new Map<string, Entry>();
  let generation = 0;
  let touch = 0;

  const prune = () => {
    if (entries.size <= MAX_UNWATCHED) return;
    const idle = [...entries.entries()].filter(([, entry]) => !entry.watched()).sort((a, b) => a[1].touched - b[1].touched);
    for (const [key] of idle.slice(0, entries.size - MAX_UNWATCHED)) entries.delete(key);
  };

  function resource<T>(definition: ResourceDefinition<T>): Resource<T> {
    const existing = entries.get(definition.key);
    if (existing) { existing.touched = ++touch; return existing.api as Resource<T>; }

    const ttl = definition.ttlMs ?? DEFAULT_TTL_MS;
    let state: ResourceState<T> = IDLE;
    let flight: AbortController | null = null;
    let endWait: (() => void) | null = null;
    const listeners = new Set<() => void>();
    const set = (next: ResourceState<T>) => { state = next; listeners.forEach((listener) => listener()); };
    const stopWaiting = () => { endWait?.(); endWait = null; };

    const run = async () => {
      flight?.abort();
      const controller = new AbortController();
      flight = controller;
      const started = generation;
      if (state.data === null && state.status !== "loading") set({ ...state, status: "loading", error: null });
      else if (state.data !== null && !state.stale) set({ ...state, stale: true });
      try {
        const data = await definition.load(controller.signal);
        if (started !== generation || flight !== controller) return;
        flight = null;
        stopWaiting();
        const status = definition.isEmpty?.(data) ? "empty" : "ready";
        const unchanged = state.data !== null && state.status === status && sameData(state.data, data);
        set({ status, data: unchanged ? state.data : data, error: null, stale: false, updatedAt: now() });
      } catch (thrown) {
        if (started !== generation || flight !== controller) return;
        flight = null;
        const error = thrown instanceof BackendError ? thrown : new BackendError("server", "Sylf had a problem. Try again shortly.");
        if (error.kind === "cancelled") { set({ ...state, status: state.data === null ? "idle" : state.status, stale: false }); return; }
        const status: ResourceStatus = error.kind === "signed-out" ? "signed-out" : error.kind === "offline" ? "offline" : "failed";
        set({ ...state, status, error, stale: state.data !== null });
        if (status === "offline" && listeners.size && connectivity && !endWait) endWait = connectivity.wait();
      }
    };

    const entry: Entry = {
      tags: definition.tags ?? [],
      touched: ++touch,
      watched: () => listeners.size > 0,
      refresh(force) {
        if (!listeners.size) { if (force) { state = state.data === null ? state : { ...state, updatedAt: 0 }; } return; }
        const fresh = state.updatedAt !== null && now() - state.updatedAt < ttl;
        if (force || !fresh) void run();
      },
      reset() { flight?.abort(); flight = null; stopWaiting(); if (state !== IDLE) set(IDLE); },
      api: {
        getSnapshot: () => state as ResourceState<unknown>,
        subscribe(listener) {
          listeners.add(listener);
          if (listeners.size === 1) entry.refresh(false);
          return () => {
            listeners.delete(listener);
            if (listeners.size) return;
            // Walking away cancels the read, and stops asking whether the network came back on this one's behalf.
            stopWaiting();
            if (flight) { flight.abort(); flight = null; if (state.status === "loading") state = { ...state, status: "idle" }; else if (state.stale) state = { ...state, stale: false }; }
          };
        },
        refresh() { entry.refresh(true); },
      },
    };
    entries.set(definition.key, entry);
    prune();
    return entry.api as Resource<T>;
  }

  // Coming back online re-reads whatever was left waiting, however fresh its last good value looks.
  let online = connectivity?.state() !== "offline";
  connectivity?.subscribe(() => {
    const back = connectivity.state() === "online";
    if (back && !online) entries.forEach((entry) => entry.refresh(true));
    online = back;
  });

  return {
    resource,
    invalidate(tag) { entries.forEach((entry) => { if (entry.tags.includes(tag)) entry.refresh(true); }); },
    wake() { connectivity?.wake(); entries.forEach((entry) => entry.refresh(false)); },
    clear() { generation++; entries.forEach((entry) => entry.reset()); entries.clear(); },
    size: () => entries.size,
  };
}
