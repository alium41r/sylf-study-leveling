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
 * but never write. Explicit user actions (pause/end/complete) call
 * acquireLeadership() to take over first.
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

const heldLocks = new Set<string>();
const lockReleasers = new Map<string, () => void>();

const REACQUIRE_MS = 3_000;
const ACQUIRE_RETRY_MS = 200;
const ACQUIRE_RETRIES = 3;

export function useTimerLeadership(cacheKey: string) {
  const [isPrimary, setIsPrimary] = useState(true);
  const isPrimaryRef = useRef(true);
  const tabIdRef = useRef("");
  if (!tabIdRef.current) {
    tabIdRef.current = Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  const lockName = `sylf-timer:${cacheKey}`;
  const leaseKey = `sylf-timer-lease:${cacheKey}`;

  const setPrimary = useCallback((v: boolean) => {
    isPrimaryRef.current = v;
    setIsPrimary(v);
  }, []);

  useEffect(() => {
    const locks = (navigator as any)?.locks;
    const canUseLocks = locks && typeof locks.request === "function";

    if (canUseLocks) {
      let cancelled = false;
      let retryTimer: ReturnType<typeof setInterval> | null = null;

      const tryAcquire = (attempt: number = 0) => {
        if (cancelled || heldLocks.has(lockName)) {
          setPrimary(true);
          return;
        }
        locks
          .request(lockName, { mode: "exclusive", ifAvailable: true }, (lock: unknown) => {
            if (cancelled) return;
            if (!lock) {
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
            heldLocks.add(lockName);
            setPrimary(true);
            // Hold the lock until release (unmount / end-of-session) or tab
            // close — releasing is wired to the promise below.
            return new Promise<void>((resolve) => {
              lockReleasers.set(lockName, resolve);
            });
          })
          .catch(() => {
            if (!cancelled && attempt >= ACQUIRE_RETRIES) setPrimary(false);
          });
      };

      tryAcquire();

      // Mirror tabs retry periodically — if the primary tab ended its
      // session, navigated away, or closed, they promote to primary.
      retryTimer = setInterval(() => {
        if (!isPrimaryRef.current) tryAcquire();
      }, REACQUIRE_MS);

      return () => {
        cancelled = true;
        if (retryTimer) clearInterval(retryTimer);
        // RELEASE ON UNMOUNT: a previous visit must never leave a stale
        // lock that strands the next tab as a mirror.
        const releaser = lockReleasers.get(lockName);
        if (releaser) {
          lockReleasers.delete(lockName);
          heldLocks.delete(lockName);
          releaser();
        }
      };
    }

    // ── Fallback: localStorage lease with heartbeat ──────────
    const tryLease = () => {
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
      clearInterval(heartbeat);
      window.removeEventListener("storage", onStorage);
      // RELEASE ON UNMOUNT: drop our own lease so the next tab (or a later
      // visit) never inherits a stale primary claim.
      try {
        const lease = readLease(localStorage.getItem(leaseKey));
        if (lease && lease.id === tabIdRef.current) localStorage.removeItem(leaseKey);
      } catch { /* ignore */ }
    };
  }, [cacheKey, lockName, leaseKey, setPrimary]);

  /** Blocking takeover for explicit user actions (pause/end/complete). */
  const acquireLeadership = useCallback(async (): Promise<boolean> => {
    if (isPrimaryRef.current) return true;

    const locks = (navigator as any)?.locks;
    if (locks && typeof locks.request === "function") {
      await new Promise<void>((resolve) => {
        locks.request(lockName, { mode: "exclusive" }, (lock: unknown) => {
          heldLocks.add(lockName);
          setPrimary(true);
          resolve();
          return new Promise<void>((r) => {
            lockReleasers.set(lockName, r);
          });
        });
      });
      return true;
    }

    try {
      localStorage.setItem(leaseKey, serializeLease(tabIdRef.current, Date.now()));
    } catch { /* ignore */ }
    setPrimary(true);
    return true;
  }, [lockName, leaseKey, setPrimary]);

  /** Release leadership (session finished or page unmounted). */
  const releaseLeadership = useCallback(() => {
    const releaser = lockReleasers.get(lockName);
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
