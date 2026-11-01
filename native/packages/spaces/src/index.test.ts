import { describe, expect, it, vi } from "vitest";
import { INITIAL_SPACES_STATE, SPACES_STORAGE_KEY, availableSpaces, createSpacesStore, fitSwitcher, nextWorldPhase, parseSpacesState, tabForKey, transitionDirection, worldHoldsNavigation, type SpaceId, type WorldEvent, type WorldPhase } from "./index";

function memoryStorage(initial?: unknown) {
  const data = new Map<string, string>(initial === undefined ? [] : [[SPACES_STORAGE_KEY, typeof initial === "string" ? initial : JSON.stringify(initial)]]);
  return { data, writes: { count: 0 }, getItem: (key: string) => data.get(key) ?? null, setItem(key: string, value: string) { this.writes.count++; data.set(key, value); } };
}
const saved = (storage: ReturnType<typeof memoryStorage>) => JSON.parse(storage.data.get(SPACES_STORAGE_KEY)!);

describe("Spaces contracts", () => {
  it("limits phones to Home", () => {
    expect(availableSpaces("phone")).toEqual(["home"]);
    expect(availableSpaces("tablet")).toEqual(["home", "workspace", "world"]);
  });
  it("restores valid state and rejects unknown shapes", () => {
    expect(parseSpacesState({ version: 1, activeSpace: "workspace", snapshots: { workspace: { layout: "split" } } }, "tablet").activeSpace).toBe("workspace");
    expect(parseSpacesState({ version: 2, activeSpace: "workspace" }, "tablet")).toEqual(INITIAL_SPACES_STATE);
    expect(parseSpacesState("garbage", "desktop")).toEqual(INITIAL_SPACES_STATE);
  });
  it("falls back to Home when a restored Space is unavailable on this form factor", () => {
    expect(parseSpacesState({ version: 1, activeSpace: "world", snapshots: {} }, "phone").activeSpace).toBe("home");
  });
  it("never restores World as the place to return to", () => {
    expect(parseSpacesState({ version: 1, activeSpace: "world", returnSpace: "world", snapshots: {} }, "tablet").returnSpace).toBe("home");
    expect(parseSpacesState({ version: 1, activeSpace: "world", returnSpace: "workspace", snapshots: {} }, "tablet").returnSpace).toBe("workspace");
  });
});

describe("Spaces store", () => {
  it("writes the active Space at once, so a kill right after switching cannot lose it", () => {
    const storage = memoryStorage();
    const store = createSpacesStore(storage, "tablet");
    expect(store.select("workspace")).toBe(true);
    expect(saved(storage).activeSpace).toBe("workspace");
    expect(createSpacesStore(storage, "tablet").getSnapshot().state.activeSpace).toBe("workspace");
  });
  it("survives corrupt storage, a throwing writer and no storage at all", () => {
    expect(createSpacesStore(memoryStorage("{not json"), "tablet").getSnapshot().state).toEqual(INITIAL_SPACES_STATE);
    const store = createSpacesStore({ getItem: () => null, setItem: () => { throw new Error("full"); } }, "tablet");
    expect(store.select("world")).toBe(true);
    expect(createSpacesStore(undefined, "tablet").getSnapshot().state).toEqual(INITIAL_SPACES_STATE);
  });
  it("refuses a Space this form factor does not have", () => {
    const store = createSpacesStore(memoryStorage(), "phone");
    expect(store.select("world")).toBe(false);
    expect(store.getSnapshot().state.activeSpace).toBe("home");
  });
  it("notifies only on real changes", () => {
    const store = createSpacesStore(memoryStorage(), "tablet");
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    store.select("home");
    expect(listener).not.toHaveBeenCalled();
    store.select("workspace");
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    store.select("home");
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it("holds snapshots back until a pause, and flushes them on demand", () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    const store = createSpacesStore(storage, "tablet");
    store.setSpaceSnapshot("home", { scrollY: 120 });
    store.setSpaceSnapshot("home", { scrollY: 240 });
    expect(storage.writes.count).toBe(0);
    vi.advanceTimersByTime(300);
    expect(storage.writes.count).toBe(1);
    expect(saved(storage).snapshots.home).toEqual({ scrollY: 240 });
    store.setSpaceSnapshot("workspace", { canvas: 1 });
    store.flush();
    expect(saved(storage).snapshots.workspace).toEqual({ canvas: 1 });
    vi.advanceTimersByTime(300);
    expect(storage.writes.count).toBe(2);
    vi.useRealTimers();
  });
  it("keeps each Space's snapshot when others change", () => {
    const store = createSpacesStore(memoryStorage(), "tablet");
    store.setSpaceSnapshot("home", { scrollY: 40 });
    store.select("workspace");
    store.select("world");
    store.select("home");
    expect(store.getSnapshot().state.snapshots.home).toEqual({ scrollY: 40 });
  });
});

describe("World's flow", () => {
  const steps = (store: ReturnType<typeof createSpacesStore>, ...events: WorldEvent[]) => events.forEach((event) => store.worldEvent(event));

  it("runs entry to saved and back", () => {
    const path: WorldEvent[] = ["enter", "ready", "pause", "resume", "pause", "leave", "saved", "finish"];
    const expected: WorldPhase[] = ["entering", "playing", "paused", "playing", "paused", "saving", "saved", "entry"];
    let phase: WorldPhase = "entry";
    path.forEach((event, index) => { phase = nextWorldPhase(phase, event); expect(phase).toBe(expected[index]); });
  });
  it("ignores events that do not apply", () => {
    expect(nextWorldPhase("entry", "leave")).toBe("entry");
    expect(nextWorldPhase("playing", "saved")).toBe("playing");
    expect(nextWorldPhase("saving", "resume")).toBe("saving");
  });
  it("gives global navigation back only at the entry environment", () => {
    const held = (["entry", "entering", "playing", "paused", "saving", "saved"] as WorldPhase[]).filter(worldHoldsNavigation);
    expect(held).toEqual(["entering", "playing", "paused", "saving", "saved"]);
  });
  it("blocks every Space change while the game holds navigation", () => {
    const store = createSpacesStore(memoryStorage(), "tablet");
    store.select("world");
    steps(store, "enter", "ready");
    (["home", "workspace"] as SpaceId[]).forEach((space) => expect(store.select(space)).toBe(false));
    expect(store.getSnapshot().state.activeSpace).toBe("world");
  });
  it("returns to the Space it was entered from, and records the visit", () => {
    const storage = memoryStorage();
    const store = createSpacesStore(storage, "tablet", () => 1234);
    store.select("workspace");
    store.select("world");
    steps(store, "enter", "ready", "pause", "leave", "saved", "finish");
    const { state, world } = store.getSnapshot();
    expect(world).toBe("entry");
    expect(state.activeSpace).toBe("workspace");
    expect(state.snapshots.world).toEqual({ leftAt: 1234 });
    expect(saved(storage).activeSpace).toBe("workspace");
  });
  it("keeps the return Space when World is left through the switcher and entered again", () => {
    const store = createSpacesStore(memoryStorage(), "tablet");
    store.select("workspace");
    store.select("world");
    store.select("home");
    store.select("world");
    expect(store.getSnapshot().state.returnSpace).toBe("home");
  });
  it("restarts at the entry environment, never mid-game", () => {
    const storage = memoryStorage();
    const store = createSpacesStore(storage, "tablet");
    store.select("home");
    store.select("world");
    steps(store, "enter", "ready");
    store.flush();
    const restarted = createSpacesStore(storage, "tablet").getSnapshot();
    expect(restarted.state.activeSpace).toBe("world");
    expect(restarted.world).toBe("entry");
    expect(restarted.state.returnSpace).toBe("home");
  });
});

describe("Switcher logic", () => {
  const spaces: SpaceId[] = ["home", "workspace", "world"];
  it("moves in the order of the bar", () => {
    expect(transitionDirection(spaces, "home", "world")).toBe(1);
    expect(transitionDirection(spaces, "world", "workspace")).toBe(-1);
    expect(transitionDirection(spaces, "home", "home")).toBe(0);
  });
  it("wraps arrow keys and jumps with Home and End", () => {
    expect(tabForKey("ArrowRight", 2, 3)).toBe(0);
    expect(tabForKey("ArrowLeft", 0, 3)).toBe(2);
    expect(tabForKey("Home", 2, 3)).toBe(0);
    expect(tabForKey("End", 0, 3)).toBe(2);
    expect(tabForKey("Enter", 0, 3)).toBeNull();
  });
  it("drops labels before it leaves the window", () => {
    expect(fitSwitcher({ labelled: 330, iconOnly: 180, room: 800 })).toEqual({ width: 330, labelled: true });
    expect(fitSwitcher({ labelled: 330, iconOnly: 180, room: 300 })).toEqual({ width: 180, labelled: false });
    expect(fitSwitcher({ labelled: 330, iconOnly: 180, room: 150 })).toEqual({ width: 150, labelled: false });
  });
});
