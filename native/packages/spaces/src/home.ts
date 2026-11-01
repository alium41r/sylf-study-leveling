// Home's own navigation, kept outside React like the Spaces store it writes through. The destination and each destination's
// scroll position are one small snapshot, so they survive a Space change, a recreated root and a process kill. A destination
// change is written at once. Scroll positions change quickly, so they wait for a pause, a destination change or a flush.
import type { SpacesStore } from "./store";

export const HOME_DESTINATIONS = ["today", "focus", "circle", "progress"] as const;
export type HomeDestination = (typeof HOME_DESTINATIONS)[number];

export const HOME_LABELS: Record<HomeDestination, string> = { today: "Today", focus: "Focus", circle: "Circle", progress: "Progress" };

export interface HomeSnapshot {
  destination: HomeDestination;
  scroll: Partial<Record<HomeDestination, number>>;
}

const SCROLL_DELAY_MS = 160;
export const INITIAL_HOME_SNAPSHOT: HomeSnapshot = { destination: "today", scroll: {} };

const isDestination = (value: unknown): value is HomeDestination => HOME_DESTINATIONS.includes(value as HomeDestination);

/** Reads what was stored, including Phase 5's single `scrollY`, which was Home's only page. Anything unknown is dropped. */
export function parseHomeSnapshot(raw: unknown): HomeSnapshot {
  if (!raw || typeof raw !== "object") return INITIAL_HOME_SNAPSHOT;
  const value = raw as { destination?: unknown; scroll?: unknown; scrollY?: unknown };
  const destination = isDestination(value.destination) ? value.destination : "today";
  const scroll: HomeSnapshot["scroll"] = {};
  if (value.scroll && typeof value.scroll === "object") {
    for (const [key, offset] of Object.entries(value.scroll)) if (isDestination(key) && typeof offset === "number" && Number.isFinite(offset) && offset > 0) scroll[key] = Math.round(offset);
  } else if (typeof value.scrollY === "number" && Number.isFinite(value.scrollY) && value.scrollY > 0) {
    scroll.today = Math.round(value.scrollY);
  }
  return { destination, scroll };
}

export interface HomeNavigation {
  destination(): HomeDestination;
  scrollOf(destination: HomeDestination): number;
  /** Fires when the destination changes, and never for a scroll, so a scrolling page renders nothing. */
  subscribe(listener: () => void): () => void;
  select(destination: HomeDestination): boolean;
  noteScroll(destination: HomeDestination, offset: number): void;
  flush(): void;
}

export function createHomeNavigation(store: Pick<SpacesStore, "getSnapshot" | "setSpaceSnapshot" | "subscribe" | "flush">): HomeNavigation {
  const read = () => parseHomeSnapshot(store.getSnapshot().state.snapshots.home);
  const pending = new Map<HomeDestination, number>();
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = read().destination;

  const write = (destination?: HomeDestination) => {
    if (timer) { clearTimeout(timer); timer = undefined; }
    if (!pending.size && !destination) return;
    const current = read();
    store.setSpaceSnapshot("home", { destination: destination ?? current.destination, scroll: { ...current.scroll, ...Object.fromEntries(pending) } } satisfies HomeSnapshot);
    pending.clear();
  };
  // Following the store, not this object, means a change from anywhere (a development link, say) reaches the rail too. This
  // object lives as long as the store does, so the subscription is never removed.
  store.subscribe(() => {
    const next = read().destination;
    if (next === last) return;
    last = next;
    listeners.forEach((listener) => listener());
  });

  return {
    destination: () => last,
    scrollOf: (destination) => pending.get(destination) ?? read().scroll[destination] ?? 0,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    select(destination) {
      if (destination === last) return false;
      write(destination);
      store.flush();
      return true;
    },
    noteScroll(destination, offset) {
      pending.set(destination, Math.max(0, Math.round(offset)));
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => write(), SCROLL_DELAY_MS);
    },
    flush: () => write(),
  };
}

/** Arrow keys wrap along the rail's own axis, and Home and End jump. Returns null for any other key. */
export function railTargetForKey(key: string, current: number, count: number, axis: "vertical" | "horizontal"): number | null {
  const [back, forward] = axis === "vertical" ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
  if (key === forward) return (current + 1) % count;
  if (key === back) return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}
