"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { getTimerSync } from "@/lib/timer-sync";
import { invalidateClientCache } from "@/lib/client-data-cache";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

/** Mounted by the shared web/mobile shell, so navigation never owns delivery. */
export default function TimerSyncWorker() {
  const { user, refreshStats } = useAuth();
  const [notice, setNotice] = useState<{ ownerId: number; message: string } | null>(null);
  const ownerId = user?.id;
  const focus = usePathname()?.startsWith("/focus");
  useEffect(() => {
    if (!ownerId) return;
    const sync = getTimerSync(ownerId);
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let noticeTimer: ReturnType<typeof setTimeout> | undefined;
    let lastNotice: string | null = null;
    let authError: string | null = null;
    const unsubscribe = sync.subscribe(() => {
      const status = sync.status();
      const message = status.pending > 0 ? status.error : null;
      if (!message) {
        lastNotice = null; clearTimeout(noticeTimer); setNotice(null);
      } else if (message !== lastNotice) {
        lastNotice = message; clearTimeout(noticeTimer);
        setNotice({ ownerId, message });
        noticeTimer = setTimeout(() => setNotice(null), 6000);
      }
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
      sync.stop(); unsubscribe(); accepted(); clearInterval(retry); clearTimeout(refreshTimer); clearTimeout(noticeTimer);
      window.removeEventListener("online", wake); window.removeEventListener("pageshow", wake);
      window.removeEventListener("storage", storage); document.removeEventListener("visibilitychange", visibility);
    };
  }, [ownerId, refreshStats]);
  if (!ownerId || notice?.ownerId !== ownerId) return null;
  const message = notice.message === "Your session is saved on this device. Sync will retry automatically."
    ? "Your session is saved on this device. We'll update your account automatically."
    : notice.message.startsWith("Sign in")
    ? "Sign in to the original account to finish saving your session."
    : notice.message.replace(/\bsync\b/gi, "save to your account");
  return (
    <div role="status" className={`fixed ${focus ? "top-28 sm:top-4 sm:right-4 sm:left-auto sm:translate-x-0" : "bottom-4"} left-1/2 -translate-x-1/2 z-[90] w-[calc(100%-2rem)] max-w-sm rounded-xl border border-border-subtle bg-bg-panel p-3 text-sm text-text-primary shadow-lg pointer-events-none`}>
      <div className="flex items-start gap-3">
        <p className="flex-1">{message}</p>
        <button type="button" aria-label="Dismiss session notification" className="shrink-0 rounded-md p-1 text-text-muted hover:text-text-primary pointer-events-auto" onClick={() => setNotice(null)}><X size={18} aria-hidden="true" /></button>
      </div>
      <button type="button" className="mt-2 text-accent-text font-semibold pointer-events-auto" onClick={() => getTimerSync(ownerId).wake()}>Try again</button>
    </div>
  );
}
