// Home's own navigation, kept outside React like the Spaces store it writes through. The destination and each destination's
// scroll position are one small snapshot, so they survive a Space change, a recreated root and a process kill. A destination
// change is written at once. Scroll positions change quickly, so they wait for a pause, a destination change or a flush.
import type { SpacesStore } from "./store";

export const HOME_DESTINATIONS = ["today", "plan", "focus", "circle", "progress"] as const;
export type HomeDestination = (typeof HOME_DESTINATIONS)[number];

export const HOME_LABELS: Record<HomeDestination, string> = { today: "Today", plan: "Plan", focus: "Focus", circle: "Circle", progress: "Progress" };

/** The views inside a destination. They are one control on the page, not a second rail. A destination not listed here has one view. */
export const HOME_VIEWS = {
  plan: ["calendar", "quests", "plans"],
  progress: ["overview", "stats", "standing", "honours", "skills", "codex"],
} as const satisfies Partial<Record<HomeDestination, readonly string[]>>;
export type HomeViewDestination = keyof typeof HOME_VIEWS;
export type HomeViewOf<D extends HomeViewDestination> = (typeof HOME_VIEWS)[D][number];

export interface HomeSnapshot {
  destination: HomeDestination;
  scroll: Partial<Record<HomeDestination, number>>;
  /** Which view each destination with views was left on. Absent until someone changes one. */
  views?: Partial<Record<HomeViewDestination, string>>;
  /** The account page, which belongs to Home and to no destination. */
  account?: boolean;
}

const SCROLL_DELAY_MS = 160;
export const INITIAL_HOME_SNAPSHOT: HomeSnapshot = { destination: "today", scroll: {} };

const isDestination = (value: unknown): value is HomeDestination => HOME_DESTINATIONS.includes(value as HomeDestination);

/** Reads what was stored, including Phase 5's single `scrollY`, which was Home's only page. Anything unknown is dropped. */
export function parseHomeSnapshot(raw: unknown): HomeSnapshot {
  if (!raw || typeof raw !== "object") return INITIAL_HOME_SNAPSHOT;
  const value = raw as { destination?: unknown; scroll?: unknown; scrollY?: unknown; views?: unknown; account?: unknown };
  const destination = isDestination(value.destination) ? value.destination : "today";
  const scroll: HomeSnapshot["scroll"] = {};
  if (value.scroll && typeof value.scroll === "object") {
    for (const [key, offset] of Object.entries(value.scroll)) if (isDestination(key) && typeof offset === "number" && Number.isFinite(offset) && offset > 0) scroll[key] = Math.round(offset);
  } else if (typeof value.scrollY === "number" && Number.isFinite(value.scrollY) && value.scrollY > 0) {
    scroll.today = Math.round(value.scrollY);
  }
  const views: NonNullable<HomeSnapshot["views"]> = {};
  if (value.views && typeof value.views === "object") {
    for (const [key, view] of Object.entries(value.views)) if (key in HOME_VIEWS && (HOME_VIEWS[key as HomeViewDestination] as readonly string[]).includes(view as string)) views[key as HomeViewDestination] = view as string;
  }
  return { destination, scroll, ...(Object.keys(views).length ? { views } : {}), ...(value.account === true ? { account: true } : {}) };
}

export interface HomeNavigation {
  destination(): HomeDestination;
  scrollOf(destination: HomeDestination): number;
  /** Fires when the destination changes, and never for a scroll, so a scrolling page renders nothing. */
  subscribe(listener: () => void): () => void;
  select(destination: HomeDestination): boolean;
  /** The view a destination shows. Its first view until someone chooses another. */
  viewOf<D extends HomeViewDestination>(destination: D): HomeViewOf<D>;
  setView<D extends HomeViewDestination>(destination: D, view: HomeViewOf<D>): void;
  accountOpen(): boolean;
  setAccountOpen(open: boolean): void;
  /** Fires when a view or the account page changes. Kept apart from `subscribe`, so a scrolling page still renders nothing. */
  subscribeDetail(listener: () => void): () => void;
  noteScroll(destination: HomeDestination, offset: number): void;
  flush(): void;
}

export function createHomeNavigation(store: Pick<SpacesStore, "getSnapshot" | "setSpaceSnapshot" | "subscribe" | "flush">): HomeNavigation {
  const read = () => parseHomeSnapshot(store.getSnapshot().state.snapshots.home);
  const pending = new Map<HomeDestination, number>();
  const listeners = new Set<() => void>();
  const detail = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = read().destination;
  const detailKey = () => { const { views, account } = read(); return JSON.stringify([views ?? {}, account === true]); };
  let lastDetail = detailKey();

  const write = (destination?: HomeDestination) => {
    if (timer) { clearTimeout(timer); timer = undefined; }
    if (!pending.size && !destination) return;
    const current = read();
    store.setSpaceSnapshot("home", { ...current, destination: destination ?? current.destination, scroll: { ...current.scroll, ...Object.fromEntries(pending) } } satisfies HomeSnapshot);
    pending.clear();
  };
  // Following the store, not this object, means a change from anywhere (a development link, say) reaches the rail too. This
  // object lives as long as the store does, so the subscription is never removed.
  store.subscribe(() => {
    const nextDetail = detailKey();
    if (nextDetail !== lastDetail) { lastDetail = nextDetail; detail.forEach((listener) => listener()); }
    const next = read().destination;
    if (next === last) return;
    last = next;
    listeners.forEach((listener) => listener());
  });
  const writeDetail = (change: Partial<HomeSnapshot>) => { store.setSpaceSnapshot("home", { ...read(), ...change } satisfies HomeSnapshot); store.flush(); };

  return {
    destination: () => last,
    scrollOf: (destination) => pending.get(destination) ?? read().scroll[destination] ?? 0,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    select(destination) {
      if (read().account) writeDetail({ account: false });
      if (destination === last) return false;
      write(destination);
      store.flush();
      return true;
    },
    viewOf<D extends HomeViewDestination>(destination: D) { return (read().views?.[destination] ?? HOME_VIEWS[destination][0]) as HomeViewOf<D>; },
    setView(destination, view) { writeDetail({ views: { ...read().views, [destination]: view } }); },
    accountOpen: () => read().account === true,
    setAccountOpen(open) { if ((read().account === true) !== open) writeDetail({ account: open }); },
    subscribeDetail(listener) { detail.add(listener); return () => { detail.delete(listener); }; },
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
