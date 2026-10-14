"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  readLease,
  serializeLease,
  leaseIsHeldBy,
  leaseExpired,
} from "@/lib/timer-leader";

/**
 * Single-writer tab leadership for the study timer.
 *
 * PRIMARY tab owns session creation and all server flushes. MIRROR tabs
 * derive/display the same epoch-anchored state (synced via BroadcastChannel)
 * but never write routine checkpoints. Pause and phase changes request a
 * bounded takeover. End/Complete persist one terminal journal intent without
 * waiting for leadership, so a mirror can always close the session.
 *
 * Strategy:
 *  1. Web Locks API (`navigator.locks`, exclusive + ifAvailable) when
 *     available — the browser guarantees a single holder per name.
 *  2. localStorage heartbeat lease (TTL 4s) as a fallback for browsers
 *     without Web Locks. The server (adopt-POST + delta accounting +
 *     monotonic durations) remains the final authority either way.
 *
 * LOCK LIFECYCLE (T3-fix): the lock is ALWAYS released when the focus page
 * unmounts (navigation away, end-of-session) or when the tab dies — a
 * previous visit must never leave a stale lock that strands a new tab as a
 * mirror forever. Acquisition retries briefly after an ifAvailable miss so
 * StrictMode remounts and release races resolve within milliseconds, and
 * mirror tabs re-try every 3 seconds so they promote the moment the real
 * primary is gone.
 */

const heldLocks = new Map<string, string>();
const lockReleasers = new Map<string, () => void>();

const REACQUIRE_MS = 3_000;
const ACQUIRE_RETRY_MS = 200;
const ACQUIRE_RETRIES = 3;

export function useTimerLeadership(cacheKey: string) {
  const [isPrimary, setIsPrimary] = useState(false);
  const [locksUnavailable, setLocksUnavailable] = useState(false);
  const isPrimaryRef = useRef(false);
  const mountedRef = useRef(false);
  const handoffUntilRef = useRef(0);
  const tabIdRef = useRef("");

  const lockName = `sylf-timer:${cacheKey}`;
  const leaseKey = `sylf-timer-lease:${cacheKey}`;

  const setPrimary = useCallback((v: boolean) => {
    isPrimaryRef.current = v;
    setIsPrimary(v);
  }, []);

  useEffect(() => {
    tabIdRef.current ||= crypto.randomUUID();
    mountedRef.current = true;
    const handoff = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("sylf-timer-leadership") : null;
    const relinquish = (key: string, id: string) => {
      if (key !== lockName || id === tabIdRef.current) return;
      handoffUntilRef.current = Date.now() + REACQUIRE_MS;
      const release = heldLocks.get(lockName) === tabIdRef.current ? lockReleasers.get(lockName) : undefined;
      if (release) { lockReleasers.delete(lockName); heldLocks.delete(lockName); release(); }
      setPrimary(false);
    };
    if (handoff) handoff.onmessage = event => { if (event.data?.key && event.data?.id) relinquish(event.data.key, event.data.id); };
    const onHandoff = (event: StorageEvent) => {
      if (event.key === `${leaseKey}:takeover` && event.newValue) {
        try { const value = JSON.parse(event.newValue); relinquish(value.key, value.id); } catch { /* invalid request */ }
      }
    };
    window.addEventListener("storage", onHandoff);
    const cleanupHandoff = () => { mountedRef.current = false; handoff?.close(); window.removeEventListener("storage", onHandoff); };
    const locks = navigator.locks;
    const canUseLocks = !locksUnavailable && locks && typeof locks.request === "function";

    if (canUseLocks) {
      let cancelled = false;
      let retryTimer: ReturnType<typeof setInterval> | null = null;

      const tryAcquire = (attempt: number = 0) => {
        if (cancelled || Date.now() < handoffUntilRef.current) return;
        if (heldLocks.has(lockName)) { setPrimary(heldLocks.get(lockName) === tabIdRef.current); return; }
        locks
          .request(lockName, { mode: "exclusive", ifAvailable: true }, (lock: unknown) => {
            if (cancelled) return;
            if (!lock) {
              // A concurrent acquisition callback may already have won this
              // instance's lock. Its late miss must not demote the holder.
              if (heldLocks.get(lockName) === tabIdRef.current) { setPrimary(true); return; }
              setPrimary(false);
              // Someone else holds it — either a genuine primary tab or a
              // release race (StrictMode remount / a stale holder mid-release).
              // Retry a few times before settling on mirror.
              if (attempt < ACQUIRE_RETRIES) {
                setTimeout(() => tryAcquire(attempt + 1), ACQUIRE_RETRY_MS);
              } else {
                setPrimary(false);
              }
              return;
            }
            heldLocks.set(lockName, tabIdRef.current);
            setPrimary(true);
            // Hold the lock until release (unmount / end-of-session) or tab
            // close — releasing is wired to the promise below.
            return new Promise<void>((resolve) => {
              lockReleasers.set(lockName, resolve);
            });
          })
          .catch(() => {
            if (!cancelled) setLocksUnavailable(true);
          });
      };

      tryAcquire();

      // Mirror tabs retry periodically — if the primary tab ended its
      // session, navigated away, or closed, they promote to primary.
      retryTimer = setInterval(() => {
        if (!isPrimaryRef.current) tryAcquire();
      }, REACQUIRE_MS);

      return () => {
        cleanupHandoff();
        cancelled = true;
        if (retryTimer) clearInterval(retryTimer);
        // RELEASE ON UNMOUNT: a previous visit must never leave a stale
        // lock that strands the next tab as a mirror.
        const releaser = heldLocks.get(lockName) === tabIdRef.current ? lockReleasers.get(lockName) : undefined;
        if (releaser) {
          lockReleasers.delete(lockName);
          heldLocks.delete(lockName);
          releaser();
        }
      };
    }

    // ── Fallback: localStorage lease with heartbeat ──────────
    const tryLease = () => {
      if (Date.now() < handoffUntilRef.current) return;
      try {
        const lease = readLease(localStorage.getItem(leaseKey));
        if (leaseExpired(lease, Date.now())) {
          localStorage.setItem(leaseKey, serializeLease(tabIdRef.current, Date.now()));
          setPrimary(true);
        } else if (leaseIsHeldBy(lease, Date.now(), tabIdRef.current)) {
          setPrimary(true);
        } else {
          setPrimary(false);
        }
      } catch {
        setPrimary(true); // storage unavailable — behave as primary
      }
    };

    tryLease();
    const heartbeat = setInterval(() => {
      if (isPrimaryRef.current) {
        tryLease();
        if (!isPrimaryRef.current) return;
        try {
          localStorage.setItem(leaseKey, serializeLease(tabIdRef.current, Date.now()));
        } catch { /* ignore */ }
      } else {
        tryLease(); // primary died → promote (lease TTL: 4s)
      }
    }, 2000);

    const onStorage = (e: StorageEvent) => {
      if (e.key === leaseKey) tryLease();
    };
    window.addEventListener("storage", onStorage);

    return () => {
      cleanupHandoff();
      clearInterval(heartbeat);
      window.removeEventListener("storage", onStorage);
      // RELEASE ON UNMOUNT: drop our own lease so the next tab (or a later
      // visit) never inherits a stale primary claim.
      try {
        const lease = readLease(localStorage.getItem(leaseKey));
        if (lease && lease.id === tabIdRef.current) localStorage.removeItem(leaseKey);
      } catch { /* ignore */ }
    };
  }, [cacheKey, lockName, leaseKey, setPrimary, locksUnavailable]);

  /** Bounded takeover for explicit pause and phase changes. */
  const acquireLeadership = useCallback(async (): Promise<boolean> => {
    if (isPrimaryRef.current) return true;

    const locks = navigator.locks;
    if (!locksUnavailable && locks && typeof locks.request === "function") {
      const message = { key: lockName, id: tabIdRef.current };
      try {
        const channel = new BroadcastChannel("sylf-timer-leadership"); channel.postMessage(message); channel.close();
      } catch { /* storage handoff below */ }
      try { localStorage.setItem(`${leaseKey}:takeover`, JSON.stringify(message)); } catch { /* best effort */ }
      // Never queue an unbounded blocking Web Lock behind a live tab.
      const deadline = Date.now() + 2000;
      while (mountedRef.current && Date.now() < deadline) {
        const acquired = await new Promise<boolean>(resolve => {
          locks.request(lockName, { mode: "exclusive", ifAvailable: true }, (lock: unknown) => {
            if (!lock || !mountedRef.current) { resolve(false); return; }
            heldLocks.set(lockName, tabIdRef.current); setPrimary(true); resolve(true);
            return new Promise<void>(release => { lockReleasers.set(lockName, release); });
          }).catch(() => resolve(false));
        });
        if (acquired) return true;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return false;
    }

    try {
      localStorage.setItem(leaseKey, serializeLease(tabIdRef.current, Date.now()));
    } catch { /* ignore */ }
    setPrimary(true);
    return true;
  }, [lockName, leaseKey, setPrimary, locksUnavailable]);

  /** Release leadership (session finished or page unmounted). */
  const releaseLeadership = useCallback(() => {
    const releaser = heldLocks.get(lockName) === tabIdRef.current ? lockReleasers.get(lockName) : undefined;
    if (releaser) {
      lockReleasers.delete(lockName);
      heldLocks.delete(lockName);
      releaser();
    }
    try {
      const lease = readLease(localStorage.getItem(leaseKey));
      if (lease && lease.id === tabIdRef.current) localStorage.removeItem(leaseKey);
    } catch { /* ignore */ }
    setPrimary(false);
  }, [lockName, leaseKey, setPrimary]);

  return { isPrimary, isPrimaryRef, acquireLeadership, releaseLeadership };
}
