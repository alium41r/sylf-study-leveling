import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SPACES_STORAGE_KEY, WORLD_MIN_WINDOW, createSpacesStore, createWorldController, createWorldResourceScope, nextWorldPhase, parseWorldSnapshot, resolveSky, worldEntryBlock, type WorldController, type WorldHost, type WorldHostContext, type WorldSaveReceipt } from "../index";

function memoryStorage() {
  const data = new Map<string, string>();
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem(key: string, value: string) { data.set(key, value); } };
}

const RECEIPT: WorldSaveReceipt = { ref: "save-1", savedAt: 5, location: "device", pendingSync: false };

function fakeHost(overrides: Partial<WorldHost> = {}) {
  const calls: string[] = [];
  let context: WorldHostContext | undefined;
  const host: WorldHost = {
    descriptor: { id: "fake", kind: "engine", label: "Fake" },
    async initialize(given) {
      context = given;
      calls.push("initialize");
      given.resources.track("surface", () => calls.push("release surface"));
      given.report({ stage: "start", label: "Starting", fraction: 0.5 });
    },
    async load(save) { calls.push(`load ${save?.ref ?? "new"}`); },
    async suspend(reason) { calls.push(`suspend ${reason}`); },
    async resume() { calls.push("resume"); },
    async save() { calls.push("save"); return RECEIPT; },
    async exit() { calls.push("exit"); },
    dispose() { calls.push("dispose"); },
    memory: () => ({ usedMb: 12 }),
    ...overrides,
  };
  return { host, calls, context: () => context! };
}

function setup(overrides: Partial<WorldHost> = {}, options: { from?: "home" | "workspace" } = {}) {
  const storage = memoryStorage();
  const store = createSpacesStore(storage, "tablet", () => 1234);
  const fake = fakeHost(overrides);
  const loadHost = vi.fn(async () => fake.host);
  const log = vi.fn();
  const controller = createWorldController(store, { loadHost, log, window: () => ({ width: 1280, height: 800 }), savedHoldMs: 10, loadTimeoutMs: 1000, saveTimeoutMs: 1000 });
  if (options.from) store.select(options.from);
  store.select("world");
  return { store, controller, loadHost, log, storage, ...fake };
}

const finish = async (run: Promise<unknown>) => { await vi.runAllTimersAsync(); await run; };
const play = async (controller: WorldController) => { const entered = controller.enter(); await finish(entered); return entered; };

describe("World lifecycle", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("creates no host until someone enters", () => {
    const { loadHost } = setup();
    expect(loadHost).not.toHaveBeenCalled();
  });
  it("walks initialize and load, and reports the phases the store has always had", async () => {
    const { controller, store, calls } = setup();
    const phases: string[] = [];
    store.subscribe(() => phases.push(store.getSnapshot().world));
    await play(controller);
    expect(calls).toEqual(["initialize", "load new"]);
    expect(store.getSnapshot().world).toBe("playing");
    expect(phases).toEqual(["entering", "playing"]);
    expect(controller.getRuntime().resources).toEqual(["surface"]);
  });
  it("loads from the last save", async () => {
    const { controller, calls } = setup();
    controller.updateSnapshot({ save: RECEIPT });
    await play(controller);
    expect(calls).toContain("load save-1");
  });
  it("refuses to enter from anywhere but World's entry, and refuses twice", async () => {
    const { controller, store, loadHost } = setup();
    store.select("home");
    expect(await controller.enter()).toBe(false);
    store.select("world");
    await play(controller);
    expect(await controller.enter()).toBe(false);
    expect(loadHost).toHaveBeenCalledTimes(1);
  });
  it("suspends for the menu and resumes the same host", async () => {
    const { controller, store, calls, loadHost } = setup();
    await play(controller);
    controller.pause();
    expect(store.getSnapshot().world).toBe("paused");
    controller.resume();
    expect(store.getSnapshot().world).toBe("playing");
    await vi.runAllTimersAsync();
    expect(calls).toEqual(["initialize", "load new", "suspend menu", "resume"]);
    expect(loadHost).toHaveBeenCalledTimes(1);
  });
  it("stops play when the app leaves the foreground, and waits at the menu on return", async () => {
    const { controller, store, calls } = setup();
    await play(controller);
    controller.setForeground(false);
    controller.setForeground(true);
    await vi.runAllTimersAsync();
    expect(store.getSnapshot().world).toBe("paused");
    expect(calls).toContain("suspend background");
    expect(calls).not.toContain("resume");
  });
  it("does not start play if the app left the foreground during the load", async () => {
    const { controller, store, calls } = setup();
    const entered = controller.enter();
    controller.setForeground(false);
    await finish(entered);
    expect(store.getSnapshot().world).toBe("paused");
    expect(calls).toContain("suspend background");
  });
  it("saves, exits, disposes, releases, then returns to the Space it came from", async () => {
    const { controller, store, calls } = setup({}, { from: "workspace" });
    await play(controller);
    controller.pause();
    await finish(controller.leave());
    expect(calls).toEqual(["initialize", "load new", "suspend menu", "save", "exit", "dispose", "release surface"]);
    const { world, state } = store.getSnapshot();
    expect(world).toBe("entry");
    expect(state.activeSpace).toBe("workspace");
    expect(parseWorldSnapshot(state.snapshots.world)).toEqual({ leftAt: 1234, save: RECEIPT });
    expect(controller.getRuntime()).toMatchObject({ host: null, resources: [], departure: "saved" });
  });
  it("reports what the host holds as play starts and as it ends", async () => {
    const { controller, log } = setup();
    await play(controller);
    controller.pause();
    await finish(controller.leave());
    expect(log).toHaveBeenCalledWith("playing", { usedMb: 12 });
    expect(log).toHaveBeenCalledWith("leaving", { usedMb: 12 });
  });
  it("writes the receipt at once, so a kill right after a save cannot lose it", async () => {
    const { controller, storage } = setup();
    await play(controller);
    controller.pause();
    const leaving = controller.leave();
    await vi.advanceTimersByTimeAsync(0);
    expect(JSON.parse(storage.data.get(SPACES_STORAGE_KEY)!).snapshots.world.save).toEqual(RECEIPT);
    await finish(leaving);
  });
  it("keeps the lobby's choices when leaving", async () => {
    const { controller, store } = setup();
    controller.updateSnapshot({ sky: "night", section: "traveller", drift: false });
    await play(controller);
    controller.pause();
    await finish(controller.leave());
    expect(parseWorldSnapshot(store.getSnapshot().state.snapshots.world)).toMatchObject({ sky: "night", section: "traveller", drift: false, leftAt: 1234 });
  });
  it("holds Space changes for the whole of a visit", async () => {
    const { controller, store } = setup();
    const entered = controller.enter();
    expect(store.select("home")).toBe(false);
    await finish(entered);
    expect(store.select("home")).toBe(false);
    controller.pause();
    expect(store.select("home")).toBe(false);
    await finish(controller.leave());
    expect(store.select("workspace")).toBe(true);
  });
});

describe("World faults", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("returns to the entry and releases everything when a load fails", async () => {
    const { controller, store, calls } = setup({ load: async () => { throw new Error("no"); } });
    await play(controller);
    expect(store.getSnapshot().world).toBe("entry");
    expect(controller.getRuntime()).toMatchObject({ host: null, resources: [], fault: { during: "load" } });
    expect(calls).toEqual(["initialize", "dispose", "release surface"]);
  });
  it("survives a host that cannot even be imported", async () => {
    const store = createSpacesStore(memoryStorage(), "tablet");
    const controller = createWorldController(store, { loadHost: async () => { throw new Error("chunk"); }, window: () => ({ width: 1, height: 1 }) });
    store.select("world");
    await play(controller);
    expect(store.getSnapshot().world).toBe("entry");
    expect(controller.getRuntime().fault?.during).toBe("load");
  });
  it("gives up on a load that never ends, and ignores it if it answers later", async () => {
    let finishLoad = () => undefined as void;
    const { controller, store, calls } = setup({ load: () => new Promise<void>((resolve) => { finishLoad = resolve; }) });
    const entered = controller.enter();
    await vi.advanceTimersByTimeAsync(1001);
    await entered;
    expect(store.getSnapshot().world).toBe("entry");
    finishLoad();
    await vi.runAllTimersAsync();
    expect(store.getSnapshot().world).toBe("entry");
    expect(calls.filter((call) => call === "dispose")).toHaveLength(1);
  });
  it("tells a stale host's progress to nobody, and tells it to stop", async () => {
    const { controller, store, context } = setup({ load: () => new Promise<void>(() => undefined) });
    const entered = controller.enter();
    await vi.advanceTimersByTimeAsync(1001);
    await entered;
    context().report({ stage: "late", label: "Late", fraction: 0.9 });
    expect(controller.getRuntime().progress).toBeNull();
    expect(context().cancelled()).toBe(true);
    expect(store.getSnapshot().world).toBe("entry");
  });
  it("keeps the host and stays in the menu when a save fails", async () => {
    const { controller, store, calls } = setup({ save: async () => { throw new Error("full"); } });
    await play(controller);
    controller.pause();
    await finish(controller.leave());
    expect(store.getSnapshot().world).toBe("paused");
    expect(controller.getRuntime()).toMatchObject({ host: "engine", fault: { during: "save" } });
    expect(calls).not.toContain("dispose");
  });
  it("never traps anyone: leaving without saving always gets out, and says it did not save", async () => {
    const { controller, store, calls } = setup({ save: async () => { throw new Error("full"); } });
    await play(controller);
    controller.pause();
    await finish(controller.leave());
    await finish(controller.leave({ discard: true }));
    expect(store.getSnapshot().world).toBe("entry");
    expect(store.getSnapshot().state.activeSpace).toBe("home");
    expect(controller.getRuntime().departure).toBe("discarded");
    expect(parseWorldSnapshot(store.getSnapshot().state.snapshots.world).save).toBeUndefined();
    expect(calls).toContain("dispose");
  });
  it("still finishes when a host fails on the way out, and reports what it left behind", async () => {
    const { controller, store, log } = setup({ exit: async () => { throw new Error("no"); }, dispose: () => { throw new Error("no"); } });
    await play(controller);
    controller.pause();
    await finish(controller.leave());
    expect(store.getSnapshot().world).toBe("entry");
    expect(controller.getRuntime().resources).toEqual([]);
    expect(log).toHaveBeenCalledWith("released-for-host", ["surface"]);
  });
  it("clears a fault on the next attempt", async () => {
    let fail = true;
    const { controller } = setup({ load: async () => { if (fail) throw new Error("no"); } });
    await play(controller);
    expect(controller.getRuntime().fault).not.toBeNull();
    fail = false;
    await play(controller);
    expect(controller.getRuntime().fault).toBeNull();
  });
  it("an event for a failure only applies where a failure can happen", () => {
    expect(nextWorldPhase("playing", "failed")).toBe("playing");
    expect(nextWorldPhase("entering", "failed")).toBe("entry");
    expect(nextWorldPhase("saving", "failed")).toBe("paused");
  });
});

describe("World resources", () => {
  it("releases in reverse order and survives a release that throws", () => {
    const order: string[] = [];
    const scope = createWorldResourceScope();
    scope.track("first", () => order.push("first"));
    scope.track("broken", () => { throw new Error("no"); });
    scope.track("last", () => order.push("last"));
    expect(scope.releaseAll()).toEqual({ released: 2, failed: ["broken"] });
    expect(order).toEqual(["last", "first"]);
    expect(scope.active()).toEqual([]);
  });
  it("a released resource is released once", () => {
    const release = vi.fn();
    const scope = createWorldResourceScope();
    const stop = scope.track("one", release);
    stop();
    stop();
    scope.releaseAll();
    expect(release).toHaveBeenCalledTimes(1);
  });
  it("cancels its timers", () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const scope = createWorldResourceScope();
    scope.after(100, run);
    expect(scope.active()).toEqual(["timer"]);
    scope.releaseAll();
    vi.advanceTimersByTime(200);
    expect(run).not.toHaveBeenCalled();
    scope.after(100, run);
    vi.advanceTimersByTime(200);
    expect(run).toHaveBeenCalledTimes(1);
    expect(scope.active()).toEqual([]);
    vi.useRealTimers();
  });
});

describe("World lobby", () => {
  it("parses a good record and drops only what does not belong", () => {
    expect(parseWorldSnapshot({ leftAt: 9, section: "traveller", sky: "night", drift: false, save: RECEIPT })).toEqual({ leftAt: 9, section: "traveller", sky: "night", drift: false, save: RECEIPT });
    expect(parseWorldSnapshot({ leftAt: "soon", section: "shop", sky: "green", drift: "no", save: { ref: 1 } })).toEqual({});
    expect(parseWorldSnapshot({ section: "shop", leftAt: 3 })).toEqual({ leftAt: 3 });
    expect(parseWorldSnapshot(null)).toEqual({});
    expect(parseWorldSnapshot("garbage")).toEqual({});
  });
  it("reads a record written before Phase 9", () => {
    expect(parseWorldSnapshot({ leftAt: 1234 })).toEqual({ leftAt: 1234 });
  });
  it("lets someone's chosen sky win, and their appearance decide otherwise", () => {
    expect(resolveSky("mist", 12)).toBe("mist");
    expect(resolveSky(undefined, 7)).toBe("dawn");
    expect([7, 12, 18, 20, 22, 3].map((hour) => resolveSky("auto", hour))).toEqual(["dawn", "day", "sunset", "dusk", "night", "night"]);
  });
  it("puts a running session first, because that is what the person can act on", () => {
    expect(worldEntryBlock({ width: 1280, height: 800 }, null)).toBeNull();
    expect(worldEntryBlock({ width: 1280, height: 800 }, { title: "Waves" })).toEqual({ kind: "session", title: "Waves" });
    expect(worldEntryBlock({ width: 400, height: 800 }, { title: "Waves" })).toEqual({ kind: "session", title: "Waves" });
    expect(worldEntryBlock({ width: 400, height: 800 }, null)).toEqual({ kind: "window" });
    expect(worldEntryBlock({ width: 900, height: WORLD_MIN_WINDOW.height - 1 }, null)).toEqual({ kind: "window" });
    expect(worldEntryBlock(WORLD_MIN_WINDOW, null)).toBeNull();
  });
});
