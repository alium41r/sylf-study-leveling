import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useTimerLeadership } from "@/app/focus/hooks/useTimerLeadership";

/* Fake navigator.locks with observable hold/release semantics. */
function makeFakeLocks() {
  const held = new Set<string>();
  const request = vi.fn(
    (name: string, opts: { mode?: string; ifAvailable?: boolean } | undefined, cb: (lock: unknown) => any) => {
      if (held.has(name)) {
        if (opts?.ifAvailable) {
          cb(null);
          return Promise.resolve(null);
        }
        // blocking takeover: simulate an eventual grant when released
        return new Promise<void>((resolve) => {
          const poll = setInterval(() => {
            if (!held.has(name)) {
              clearInterval(poll);
              held.add(name);
              resolve(cb({ name }));
            }
          }, 10);
        });
      }
      held.add(name);
      const lock = { name };
      const ret = cb(lock);
      if (ret && typeof ret.then === "function") {
        ret.then(() => held.delete(name));
      } else {
        held.delete(name);
      }
      return Promise.resolve(lock);
    }
  );
  return {
    request,
    isHeld: (name: string) => held.has(name),
    prehold: (name: string) => held.add(name),
    release: (name: string) => held.delete(name),
  };
}

const CACHE_KEY = "t3-leadership-test";
const LOCK_NAME = `sylf-timer:${CACHE_KEY}`;

describe("useTimerLeadership (T3 regression)", () => {
  let fake: ReturnType<typeof makeFakeLocks>;
  let origLocks: unknown;

  beforeEach(() => {
    vi.useRealTimers();
    fake = makeFakeLocks();
    origLocks = (window.navigator as any).locks;
    Object.defineProperty(window.navigator, "locks", {
      configurable: true,
      value: fake,
    });
    localStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(window.navigator, "locks", {
      configurable: true,
      value: origLocks,
    });
  });

  it("acquires the lock and becomes primary on mount", async () => {
    const { result } = renderHook(() => useTimerLeadership(CACHE_KEY));
    await waitFor(() => expect(result.current.isPrimary).toBe(true));
    expect(fake.isHeld(LOCK_NAME)).toBe(true);
  });

  it("becomes a mirror when another tab holds the lock", async () => {
    fake.prehold(LOCK_NAME);
    const { result } = renderHook(() => useTimerLeadership(CACHE_KEY));
    await waitFor(() => expect(result.current.isPrimary).toBe(false));
    expect(fake.isHeld(LOCK_NAME)).toBe(true); // still held by the other tab
  });

  it("RELEASES the lock on unmount (no stale primary)", async () => {
    const { result, unmount } = renderHook(() => useTimerLeadership(CACHE_KEY));
    await waitFor(() => expect(result.current.isPrimary).toBe(true));
    expect(fake.isHeld(LOCK_NAME)).toBe(true);
    unmount();
    await waitFor(() => expect(fake.isHeld(LOCK_NAME)).toBe(false));
  });

  it("promotes to primary within the re-acquire window after the other tab releases", async () => {
    vi.useFakeTimers();
    fake.prehold(LOCK_NAME);
    const { result } = renderHook(() => useTimerLeadership(CACHE_KEY));
    await act(async () => {
      vi.advanceTimersByTime(800); // acquisition retries (3 × 200ms) all miss
    });
    expect(result.current.isPrimary).toBe(false);

    fake.release(LOCK_NAME);
    await act(async () => {
      vi.advanceTimersByTime(3_100); // next 3s re-acquire sweep
    });
    expect(result.current.isPrimary).toBe(true);
    expect(fake.isHeld(LOCK_NAME)).toBe(true);
  });

  it("falls back to the localStorage lease when Web Locks is unavailable", async () => {
    vi.useFakeTimers();
    Object.defineProperty(window.navigator, "locks", {
      configurable: true,
      value: undefined,
    });
    // A fresh lease held by a (simulated) other tab.
    localStorage.setItem(
      `sylf-timer-lease:${CACHE_KEY}`,
      JSON.stringify({ id: "other-tab", ts: Date.now() - 100 })
    );

    const { result } = renderHook(() => useTimerLeadership(CACHE_KEY));
    expect(result.current.isPrimary).toBe(false);

    // After the other tab's lease expires (TTL 4s) the heartbeat promotes us.
    await act(async () => {
      vi.advanceTimersByTime(4_500);
    });
    expect(result.current.isPrimary).toBe(true);
    const lease = JSON.parse(localStorage.getItem(`sylf-timer-lease:${CACHE_KEY}`)!);
    expect(lease.id).not.toBe("other-tab");
  });
});
