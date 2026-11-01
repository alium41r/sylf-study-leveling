import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOME_DESTINATIONS, INITIAL_HOME_SNAPSHOT, SPACES_STORAGE_KEY, createHomeNavigation, createSpacesStore, parseHomeSnapshot, railTargetForKey } from "./index";

function setup(initial?: unknown) {
  const data = new Map<string, string>(initial === undefined ? [] : [[SPACES_STORAGE_KEY, JSON.stringify(initial)]]);
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const store = createSpacesStore(storage, "tablet");
  return { data, storage, store, navigation: createHomeNavigation(store), saved: () => JSON.parse(data.get(SPACES_STORAGE_KEY) ?? "{}").snapshots?.home };
}

describe("Home snapshot", () => {
  it("restores a valid snapshot", () => {
    expect(parseHomeSnapshot({ destination: "circle", scroll: { circle: 240, today: 12.6 } })).toEqual({ destination: "circle", scroll: { circle: 240, today: 13 } });
  });
  it("falls back to Today on anything unknown", () => {
    expect(parseHomeSnapshot(undefined)).toEqual(INITIAL_HOME_SNAPSHOT);
    expect(parseHomeSnapshot("garbage")).toEqual(INITIAL_HOME_SNAPSHOT);
    expect(parseHomeSnapshot({ destination: "garden" }).destination).toBe("today");
  });
  it("drops unknown destinations and values that are not positions", () => {
    expect(parseHomeSnapshot({ destination: "focus", scroll: { garden: 10, today: -4, circle: Number.NaN, progress: "90", focus: 30 } }).scroll).toEqual({ focus: 30 });
  });
  it("carries Phase 5's single scroll position over to Today", () => {
    expect(parseHomeSnapshot({ scrollY: 310 })).toEqual({ destination: "today", scroll: { today: 310 } });
  });
});

describe("Home navigation", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("opens on the saved destination", () => {
    expect(setup({ version: 1, activeSpace: "home", snapshots: { home: { destination: "progress", scroll: {} } } }).navigation.destination()).toBe("progress");
  });
  it("writes a destination at once, so a kill right after choosing cannot lose it", () => {
    const { navigation, saved } = setup();
    expect(navigation.select("circle")).toBe(true);
    expect(saved().destination).toBe("circle");
  });
  it("reports no change for the current destination", () => {
    const { navigation } = setup();
    const listener = vi.fn();
    navigation.subscribe(listener);
    expect(navigation.select("today")).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });
  it("keeps a scroll position per destination", () => {
    const { navigation } = setup();
    navigation.noteScroll("today", 120);
    navigation.select("focus");
    navigation.noteScroll("focus", 44);
    navigation.flush();
    navigation.select("today");
    expect(navigation.scrollOf("today")).toBe(120);
    expect(navigation.scrollOf("focus")).toBe(44);
    expect(navigation.scrollOf("circle")).toBe(0);
  });
  it("waits for a pause in scrolling before writing", () => {
    const { navigation, store } = setup();
    const set = vi.spyOn(store, "setSpaceSnapshot");
    for (let offset = 10; offset <= 100; offset += 10) { navigation.noteScroll("today", offset); vi.advanceTimersByTime(40); }
    expect(set).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(set).toHaveBeenCalledTimes(1);
    expect(navigation.scrollOf("today")).toBe(100);
  });
  it("answers with a position that is still waiting to be written", () => {
    const { navigation } = setup();
    navigation.noteScroll("circle", 75);
    expect(navigation.scrollOf("circle")).toBe(75);
  });
  it("does not disturb a listener while scrolling", () => {
    const { navigation } = setup();
    const listener = vi.fn();
    navigation.subscribe(listener);
    navigation.noteScroll("today", 90);
    navigation.flush();
    expect(listener).not.toHaveBeenCalled();
    navigation.select("focus");
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it("follows a change made directly in the store", () => {
    const { navigation, store } = setup();
    const listener = vi.fn();
    navigation.subscribe(listener);
    store.setSpaceSnapshot("home", { destination: "progress", scroll: {} });
    expect(navigation.destination()).toBe("progress");
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it("survives a restart, destination and scroll positions together", () => {
    const { navigation, storage, store } = setup();
    navigation.select("circle");
    navigation.noteScroll("circle", 222);
    navigation.flush();
    store.flush();
    const restarted = createHomeNavigation(createSpacesStore(storage, "tablet"));
    expect(restarted.destination()).toBe("circle");
    expect(restarted.scrollOf("circle")).toBe(222);
  });
  it("leaves other Spaces' snapshots alone", () => {
    const { navigation, store } = setup();
    store.setSpaceSnapshot("world", { leftAt: 5 });
    navigation.select("focus");
    expect(store.getSnapshot().state.snapshots.world).toEqual({ leftAt: 5 });
  });
  it("still works without storage", () => {
    const navigation = createHomeNavigation(createSpacesStore(undefined, "phone"));
    expect(navigation.select("progress")).toBe(true);
    expect(navigation.destination()).toBe("progress");
  });
});

describe("Rail keyboard", () => {
  it("moves along the rail's own axis and wraps", () => {
    expect(railTargetForKey("ArrowDown", 0, 4, "vertical")).toBe(1);
    expect(railTargetForKey("ArrowUp", 0, 4, "vertical")).toBe(3);
    expect(railTargetForKey("ArrowRight", 3, 4, "horizontal")).toBe(0);
    expect(railTargetForKey("ArrowLeft", 1, 4, "horizontal")).toBe(0);
  });
  it("ignores the other axis, so a vertical rail leaves left and right alone", () => {
    expect(railTargetForKey("ArrowRight", 1, 4, "vertical")).toBeNull();
    expect(railTargetForKey("ArrowDown", 1, 4, "horizontal")).toBeNull();
    expect(railTargetForKey("a", 1, 4, "vertical")).toBeNull();
  });
  it("jumps with Home and End", () => {
    expect(railTargetForKey("Home", 2, HOME_DESTINATIONS.length, "vertical")).toBe(0);
    expect(railTargetForKey("End", 0, HOME_DESTINATIONS.length, "vertical")).toBe(3);
  });
});
