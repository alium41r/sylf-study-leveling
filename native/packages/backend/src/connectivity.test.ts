import { describe, expect, it, vi } from "vitest";
import { CONNECTIVITY_DELAYS_MS, createConnectivity } from "./connectivity";

function setup(probe: () => Promise<boolean>) {
  const scheduled: { work: () => void; ms: number }[] = [];
  const timers = { set: (work: () => void, ms: number) => { const entry = { work, ms }; scheduled.push(entry); return entry; }, clear: (handle: unknown) => { const index = scheduled.indexOf(handle as (typeof scheduled)[number]); if (index >= 0) scheduled.splice(index, 1); } };
  return { connectivity: createConnectivity(probe, timers), scheduled, tick: async () => { const entry = scheduled.shift(); entry?.work(); await new Promise((done) => setTimeout(done, 0)); return entry?.ms; } };
}

describe("connectivity", () => {
  it("schedules nothing while online", () => {
    const { connectivity, scheduled } = setup(async () => true);
    const end = connectivity.wait();
    expect(scheduled).toHaveLength(0);
    end();
  });

  it("schedules nothing offline unless someone is waiting", () => {
    const { connectivity, scheduled } = setup(async () => false);
    connectivity.report(false);
    expect(connectivity.state()).toBe("offline");
    expect(scheduled).toHaveLength(0);
  });

  it("asks on a growing delay, and stops at the longest", async () => {
    const { connectivity, tick } = setup(async () => false);
    connectivity.report(false);
    connectivity.wait();
    const delays = [];
    for (let step = 0; step < 6; step++) delays.push(await tick());
    expect(delays).toEqual([...CONNECTIVITY_DELAYS_MS, 60_000, 60_000]);
  });

  it("stops asking when nobody waits any more", () => {
    const { connectivity, scheduled } = setup(async () => false);
    connectivity.report(false);
    const end = connectivity.wait();
    expect(scheduled).toHaveLength(1);
    end(); end();
    expect(scheduled).toHaveLength(0);
  });

  it("tells listeners only when the state changes", async () => {
    const { connectivity, tick } = setup(async () => true);
    const listener = vi.fn();
    connectivity.subscribe(listener);
    connectivity.report(true);
    expect(listener).not.toHaveBeenCalled();
    connectivity.report(false);
    connectivity.report(false);
    expect(listener).toHaveBeenCalledTimes(1);
    connectivity.wait();
    await tick();
    expect(connectivity.state()).toBe("online");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("asks at once on returning to the foreground, and only when offline", async () => {
    const probe = vi.fn(async () => true);
    const { connectivity } = setup(probe);
    connectivity.wake();
    expect(probe).not.toHaveBeenCalled();
    connectivity.report(false);
    connectivity.wake();
    await new Promise((done) => setTimeout(done, 0));
    expect(probe).toHaveBeenCalledTimes(1);
    expect(connectivity.state()).toBe("online");
  });

  it("treats a probe that throws as still offline", async () => {
    const { connectivity } = setup(async () => { throw new Error("no"); });
    connectivity.report(false);
    connectivity.wake();
    await new Promise((done) => setTimeout(done, 0));
    expect(connectivity.state()).toBe("offline");
  });
});
