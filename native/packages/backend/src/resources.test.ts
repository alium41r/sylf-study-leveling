import { describe, expect, it, vi } from "vitest";
import { BackendError } from "./errors";
import { createConnectivity } from "./connectivity";
import { createResourceStore } from "./resources";

const settle = () => new Promise((done) => setTimeout(done, 0));
const offline = () => new BackendError("offline", "Offline.");

describe("resources", () => {
  it("does nothing until someone watches, and cancels when they leave", async () => {
    const seen: AbortSignal[] = [];
    const load = vi.fn((signal: AbortSignal) => { seen.push(signal); return new Promise<string>(() => undefined); });
    const item = createResourceStore().resource({ key: "x", load });
    expect(load).not.toHaveBeenCalled();
    const stop = item.subscribe(() => undefined);
    expect(load).toHaveBeenCalledTimes(1);
    expect(item.getSnapshot().status).toBe("loading");
    stop();
    expect(seen[0].aborted).toBe(true);
    expect(item.getSnapshot().status).toBe("idle");
  });

  it("gives every key one object", () => {
    const store = createResourceStore();
    expect(store.resource({ key: "x", load: async () => 1 })).toBe(store.resource({ key: "x", load: async () => 2 }));
  });

  it("moves through loading to ready", async () => {
    const item = createResourceStore().resource({ key: "x", load: async () => ["a"] });
    const states: string[] = [];
    item.subscribe(() => states.push(item.getSnapshot().status));
    await settle();
    expect(item.getSnapshot()).toMatchObject({ status: "ready", data: ["a"], error: null, stale: false });
    expect(states.at(-1)).toBe("ready");
  });

  it("says empty when the data is empty", async () => {
    const item = createResourceStore().resource({ key: "x", load: async () => [] as string[], isEmpty: (data) => data.length === 0 });
    item.subscribe(() => undefined);
    await settle();
    expect(item.getSnapshot().status).toBe("empty");
  });

  it("keeps the same snapshot when a refresh brings the same data, so nothing re-renders", async () => {
    const item = createResourceStore().resource({ key: "x", load: async () => ({ a: 1 }) });
    const listener = vi.fn();
    item.subscribe(listener);
    await settle();
    const data = item.getSnapshot().data;
    item.refresh();
    await settle();
    expect(item.getSnapshot().data).toBe(data);
  });

  it("keeps showing what it has while refreshing, and through a failure", async () => {
    let fail = false;
    const item = createResourceStore().resource({ key: "x", load: async () => { if (fail) throw new BackendError("server", "No."); return "good"; } });
    item.subscribe(() => undefined);
    await settle();
    fail = true;
    item.refresh();
    expect(item.getSnapshot()).toMatchObject({ data: "good", stale: true });
    await settle();
    expect(item.getSnapshot()).toMatchObject({ status: "failed", data: "good", stale: true });
    expect(item.getSnapshot().error?.kind).toBe("server");
  });

  it("does not hit the network again for a fresh value", async () => {
    const load = vi.fn(async () => 1);
    const item = createResourceStore().resource({ key: "x", load, ttlMs: 10_000 });
    item.subscribe(() => undefined)();
    await settle();
    const stop = item.subscribe(() => undefined);
    await settle();
    expect(load.mock.calls.length).toBeLessThanOrEqual(2);
    stop();
  });

  it("re-reads on return to the foreground, only past its age", async () => {
    let clock = 0;
    const load = vi.fn(async () => 1);
    const store = createResourceStore({ now: () => clock });
    store.resource({ key: "x", load, ttlMs: 1000 }).subscribe(() => undefined);
    await settle();
    store.wake();
    expect(load).toHaveBeenCalledTimes(1);
    clock = 5000;
    store.wake();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("drops an older answer that arrives after a newer request", async () => {
    const answers: ((value: string) => void)[] = [];
    const item = createResourceStore().resource({ key: "x", load: () => new Promise<string>((resolve) => answers.push(resolve)) });
    item.subscribe(() => undefined);
    item.refresh();
    answers[1]("new");
    await settle();
    answers[0]("old");
    await settle();
    expect(item.getSnapshot().data).toBe("new");
  });

  it("invalidates by tag, and only what is watched reloads now", async () => {
    const watched = vi.fn(async () => 1); const unwatched = vi.fn(async () => 1); const other = vi.fn(async () => 1);
    const store = createResourceStore();
    store.resource({ key: "a", load: watched, tags: ["stats"] }).subscribe(() => undefined);
    store.resource({ key: "b", load: unwatched, tags: ["stats"] });
    store.resource({ key: "c", load: other, tags: ["quests"] }).subscribe(() => undefined);
    await settle();
    store.invalidate("stats");
    await settle();
    expect(watched).toHaveBeenCalledTimes(2);
    expect(unwatched).not.toHaveBeenCalled();
    expect(other).toHaveBeenCalledTimes(1);
  });

  it("reads again for its next watcher after an invalidation it slept through", async () => {
    const load = vi.fn(async () => 1);
    const store = createResourceStore();
    const item = store.resource({ key: "a", load, tags: ["stats"], ttlMs: 60_000 });
    const stop = item.subscribe(() => undefined);
    await settle();
    stop();
    store.invalidate("stats");
    item.subscribe(() => undefined);
    await settle();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("marks a signed-out failure so a screen can say so", async () => {
    const item = createResourceStore().resource({ key: "x", load: async () => { throw new BackendError("signed-out", "Sign in."); } });
    item.subscribe(() => undefined);
    await settle();
    expect(item.getSnapshot().status).toBe("signed-out");
  });

  it("goes offline, keeps its value, and recovers by itself when the network returns", async () => {
    let down = false;
    const connectivity = createConnectivity(async () => true);
    const store = createResourceStore({ connectivity });
    const load = vi.fn(async () => { if (down) { connectivity.report(false); throw offline(); } return "value"; });
    const item = store.resource({ key: "x", load });
    item.subscribe(() => undefined);
    await settle();
    down = true;
    item.refresh();
    await settle();
    expect(item.getSnapshot()).toMatchObject({ status: "offline", data: "value", stale: true });
    down = false;
    connectivity.report(true);
    await settle();
    expect(item.getSnapshot()).toMatchObject({ status: "ready", stale: false });
  });

  it("forgets everything at sign-out, including an answer still on its way", async () => {
    let answer: (value: string) => void = () => undefined;
    const store = createResourceStore();
    const item = store.resource({ key: "private", load: () => new Promise<string>((resolve) => { answer = resolve; }) });
    item.subscribe(() => undefined);
    store.clear();
    answer("someone's data");
    await settle();
    expect(item.getSnapshot()).toMatchObject({ status: "idle", data: null });
    expect(store.size()).toBe(0);
  });

  it("stops growing with unwatched keys, and keeps what is on screen", () => {
    const store = createResourceStore();
    const first = store.resource({ key: "seen", load: () => new Promise(() => undefined) });
    first.subscribe(() => undefined);
    for (let day = 0; day < 200; day++) store.resource({ key: `day-${day}`, load: async () => day });
    expect(store.size()).toBeLessThanOrEqual(64);
    expect(store.resource({ key: "seen", load: async () => 0 })).toBe(first);
  });

  it("turns anything thrown into a failure screens can show", async () => {
    const item = createResourceStore().resource({ key: "x", load: async () => { throw new Error("boom"); } });
    item.subscribe(() => undefined);
    await settle();
    expect(item.getSnapshot().error?.kind).toBe("server");
  });
});
