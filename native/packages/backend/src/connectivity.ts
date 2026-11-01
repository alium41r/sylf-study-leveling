// Whether Sylf can be reached, learned from real requests. There is no connectivity library: an unreachable server looks the same as no
// network, and that is the only question that matters here. While it believes it is offline it asks a small ping on a growing delay, but
// only while someone is waiting, so an idle app schedules nothing.
export type ConnectivityState = "online" | "offline";

export interface Connectivity {
  state(): ConnectivityState;
  subscribe(listener: () => void): () => void;
  /** Every request reports how it went. */
  report(reached: boolean): void;
  /** Says something is waiting for a connection. Returns a function that ends the interest. */
  wait(): () => void;
  /** The app came back to the front. Asks at once instead of waiting out the delay. */
  wake(): void;
}

export const CONNECTIVITY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000] as const;

export function createConnectivity(probe: () => Promise<boolean>, timers: { set: (work: () => void, ms: number) => unknown; clear: (handle: unknown) => void } = { set: (work, ms) => setTimeout(work, ms), clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) }): Connectivity {
  let state: ConnectivityState = "online";
  let waiting = 0;
  let attempt = 0;
  let timer: unknown;
  let asking = false;
  const listeners = new Set<() => void>();

  const stop = () => { if (timer !== undefined) { timers.clear(timer); timer = undefined; } };
  const ask = async () => {
    if (asking) return;
    asking = true;
    let reached = false;
    try { reached = await probe(); } catch { reached = false; }
    asking = false;
    report(reached);
  };
  const schedule = () => {
    stop();
    if (state === "online" || waiting === 0) return;
    timer = timers.set(() => { timer = undefined; void ask(); }, CONNECTIVITY_DELAYS_MS[Math.min(attempt, CONNECTIVITY_DELAYS_MS.length - 1)]);
    attempt++;
  };
  function report(reached: boolean) {
    const next: ConnectivityState = reached ? "online" : "offline";
    const changed = next !== state;
    state = next;
    if (reached) attempt = 0;
    schedule();
    if (changed) listeners.forEach((listener) => listener());
  }

  return {
    state: () => state,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    report,
    wait() {
      waiting++;
      if (timer === undefined) schedule();
      let ended = false;
      return () => { if (ended) return; ended = true; waiting--; if (waiting === 0) stop(); };
    },
    wake() { if (state === "offline") { attempt = 0; stop(); void ask(); } },
  };
}
