"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/** Custom event + storage key shared with the Focus Room. */
export const SESSION_ENDED_EVENT = "sylf:session-ended";
export const SESSION_SUMMARY_KEY = "sylf_last_session_summary";

export interface SessionEndSummary {
  durationSeconds: number;
  breakSeconds?: number;
  subjectName: string | null;
  questTitle: string | null;
}

/** "30m 00s" → "30m 00s", "1h 05m 12s" — precise session length. */
function formatDuration(seconds: number): string {
  const sec = Math.max(0, Math.floor(seconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`;
  return `${m}m ${pad(s)}s`;
}

/**
 * Global toast shown after a focus session ends. Auto-dismisses after ~3.5s.
 * Listens for the SESSION_ENDED_EVENT (client-side navigation) and also reads
 * SESSION_SUMMARY_KEY on mount (covers a hard reload right after ending).
 */
export default function SessionEndToast() {
  const [summary, setSummary] = useState<SessionEndSummary | null>(null);

  useEffect(() => {
    const handle = (e: Event) => {
      const detail = (e as CustomEvent<SessionEndSummary>).detail;
      if (detail && typeof detail.durationSeconds === "number") {
        setSummary(detail);
        try {
          localStorage.removeItem(SESSION_SUMMARY_KEY);
        } catch {}
      }
    };

    // Reload fallback: session ended right before a full page reload.
    try {
      const raw = localStorage.getItem(SESSION_SUMMARY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.durationSeconds === "number") {
          setSummary(parsed);
        }
        localStorage.removeItem(SESSION_SUMMARY_KEY);
      }
    } catch {}

    window.addEventListener(SESSION_ENDED_EVENT, handle);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, handle);
  }, []);

  useEffect(() => {
    if (!summary) return;
    const timer = setTimeout(() => setSummary(null), 3500);
    return () => clearTimeout(timer);
  }, [summary]);

  return (
    <AnimatePresence>
      {summary && (
        <motion.div
          initial={{ opacity: 0, y: -24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.97 }}
          transition={{ type: "spring", damping: 22, stiffness: 340 }}
          className="fixed top-5 left-1/2 -translate-x-1/2 z-[80] pointer-events-none w-[calc(100%-2rem)] max-w-md"
        >
          <div
            className="relative overflow-hidden rounded-2xl border border-accent-primary-mid bg-bg-abyss/95 backdrop-blur-xl shadow-[0_16px_50px_rgba(0,0,0,0.6)] px-5 py-4"
            style={{ boxShadow: "0 0 30px var(--accent-primary-dim), 0 16px 50px rgba(0,0,0,0.6)" }}
          >
            {/* Accent strip */}
            <div
              className="absolute top-0 left-0 right-0 h-0.5"
              style={{ background: "linear-gradient(90deg, transparent, var(--accent-primary-light), transparent)" }}
            />

            <div className="flex items-center gap-3.5">
              {/* Check icon */}
              <div className="w-11 h-11 rounded-xl bg-accent-primary-dim border border-accent-primary-mid flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-accent-text-light" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <div className="min-w-0 flex-1">
                <p
                  className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-text-muted"
                  style={{ fontFamily: "'Rajdhani', sans-serif" }}
                >
                  Focus Session Complete
                </p>
                <p
                  className="text-lg font-bold text-text-primary leading-tight truncate"
                  style={{ fontFamily: "'Rajdhani', sans-serif" }}
                >
                  {formatDuration(summary.durationSeconds)}
                  {summary.subjectName ? ` · ${summary.subjectName}` : ""}
                  {summary.questTitle ? ` — ${summary.questTitle}` : ""}
                </p>
                {(summary.breakSeconds ?? 0) > 0 && (
                  <p
                    className="text-[0.65rem] font-bold uppercase tracking-[0.15em] text-accent-green/80 mt-0.5"
                    style={{ fontFamily: "'Rajdhani', sans-serif" }}
                  >
                    incl. {formatDuration(summary.breakSeconds || 0)} break — study time only
                  </p>
                )}
              </div>

              {/* Progress-style ring hint */}
              <div className="w-9 h-9 rounded-full border-2 border-accent-primary border-t-transparent animate-spin shrink-0" style={{ animationDuration: "3.5s" }} />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
