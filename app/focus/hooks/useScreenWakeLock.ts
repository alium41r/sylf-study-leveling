"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Keep the device screen awake while the user is studying.
 *
 * Uses the Web Screen Wake Lock API (navigator.wakeLock). The browser
 * auto-releases the lock whenever the tab is hidden or the screen is locked,
 * so the hook re-acquires it on visibilitychange while the toggle is on.
 * `isSupported` is false on older browsers (e.g. Safari < 16.4), letting the
 * UI show a disabled control instead of silently failing.
 */

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

interface WakeLockNavigator {
  request: (type: "screen") => Promise<WakeLockSentinelLike>;
}

export function useScreenWakeLock() {
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSupported] = useState<boolean>(
    () => typeof navigator !== "undefined" && "wakeLock" in navigator
  );

  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);
  const wantActiveRef = useRef(false);

  const request = useCallback(async (): Promise<boolean> => {
    const wl = (navigator as Navigator & { wakeLock?: WakeLockNavigator }).wakeLock;
    if (!wl) {
      setError("Keep-awake isn't supported on this device.");
      return false;
    }
    try {
      const sentinel = await wl.request("screen");
      sentinelRef.current = sentinel;
      wantActiveRef.current = true;
      setIsActive(true);
      setError(null);
      // Browser may auto-release (tab hidden / power state) — clear the ref
      // so the visibility handler can re-acquire a fresh one.
      sentinel.addEventListener?.("release", () => {
        if (sentinelRef.current === sentinel) {
          sentinelRef.current = null;
          setIsActive(false);
        }
      });
      return true;
    } catch (err) {
      console.warn("Screen wake lock request failed:", err);
      setIsActive(false);
      setError("Keep-awake was blocked by the browser on this device.");
      return false;
    }
  }, []);

  const release = useCallback(async () => {
    wantActiveRef.current = false;
    try {
      await sentinelRef.current?.release();
    } catch {
      // The sentinel may already be released by the browser.
    }
    sentinelRef.current = null;
    setIsActive(false);
  }, []);

  const toggle = useCallback(async () => {
    // Optimistic flip so the UI responds instantly; revert on failure.
    const turningOn = !wantActiveRef.current;
    setIsActive(turningOn);
    if (!turningOn) {
      await release();
      return;
    }
    const ok = await request();
    if (!ok) setIsActive(false);
  }, [request, release]);

  // Re-acquire the lock whenever the tab becomes visible again, as long as
  // the user still wants it (browsers release wake locks on tab hide).
  useEffect(() => {
    const onVisibility = async () => {
      if (document.visibilityState === "visible" && wantActiveRef.current && !sentinelRef.current) {
        await request();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      // Leaving the page (unmount) must release the lock so the device can
      // sleep again outside the focus room.
      wantActiveRef.current = false;
      try {
        sentinelRef.current?.release();
      } catch {}
      sentinelRef.current = null;
    };
  }, [request]);

  return { isActive, isSupported, error, toggle, request, release };
}
