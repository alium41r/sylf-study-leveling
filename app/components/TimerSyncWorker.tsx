"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { getTimerSync, type TimerSyncStatus } from "@/lib/timer-sync";
import { invalidateClientCache } from "@/lib/client-data-cache";
import { usePathname } from "next/navigation";

/** Mounted by the shared web/mobile shell, so navigation never owns delivery. */
export default function TimerSyncWorker() {
  const { user, refreshStats } = useAuth();
  const [status, setStatus] = useState<TimerSyncStatus>({ pending: 0, error: null });
  const ownerId = user?.id;
  const focus = usePathname()?.startsWith("/focus");
  useEffect(() => {
    if (!ownerId) return;
    const sync = getTimerSync(ownerId);
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let authError: string | null = null;
    const unsubscribe = sync.subscribe(() => {
      const status = sync.status(); setStatus(status);
      if (status.error?.startsWith("Sign in") && authError !== status.error) { authError = status.error; void refreshStats(); }
      if (!status.error) authError = null;
    });
    const accepted = sync.onAccepted(() => {
      for (const key of ["/api/subjects", "/api/quests", "/api/user/stats", "/api/goals", "/api/calendar"]) invalidateClientCache(key);
      if (!refreshTimer) refreshTimer = setTimeout(() => { refreshTimer = undefined; void refreshStats(); }, 250);
    });
    const wake = () => sync.wake();
    const storage = (event: StorageEvent) => { if (event.key?.startsWith("sylf_timer_journal_v1:")) wake(); };
    const visibility = () => { if (document.visibilityState === "visible") wake(); };
    sync.start();
    const retry = setInterval(() => { void sync.drain(); }, 2000);
    window.addEventListener("online", wake);
    window.addEventListener("pageshow", wake);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      sync.stop(); unsubscribe(); accepted(); clearInterval(retry); clearTimeout(refreshTimer);
      window.removeEventListener("online", wake); window.removeEventListener("pageshow", wake);
      window.removeEventListener("storage", storage); document.removeEventListener("visibilitychange", visibility);
    };
  }, [ownerId, refreshStats]);
  if (!ownerId || !status.error) return null;
  return (
    <div role="status" className={`fixed ${focus ? "top-28 sm:top-4 sm:right-4 sm:left-auto sm:translate-x-0" : "bottom-4"} left-1/2 -translate-x-1/2 z-[90] w-[calc(100%-2rem)] max-w-sm rounded-xl border border-border-subtle bg-bg-panel p-3 text-sm text-text-primary shadow-lg pointer-events-none`}>
      <p>{status.error}</p>
      <button type="button" className="mt-2 text-accent-text font-semibold pointer-events-auto" onClick={() => getTimerSync(ownerId).wake()}>Retry sync</button>
    </div>
  );
}
