// ============================================================
// Epoch-Anchored Study Timer Engine — SINGLE SOURCE OF TRUTH
// ============================================================
// The displayed timer is ALWAYS derived from immutable wall-clock
// timestamps — never from accumulated tick counters. This makes the
// timer immune to throttled/suspended setInterval, background tabs,
// laptop sleep/wake, and refresh/navigation gaps:
//
//   focusSec    = floor((focusMs + liveMs) / 1000)   (focus phases only)
//   breakSec    = floor((breakMs + liveMs) / 1000)   (break phases only)
//   remainingMs = remainingMs(at anchor) - liveMs    (countdown phases)
//   liveMs      = now - runningSinceMs               (0 when paused)
//
// Pure functions only — no React, no timers, fully unit-testable.
// ============================================================

export type TimerPhase = "focus" | "short-break" | "long-break" | "rest" | "done";

const BREAK_PHASES: readonly TimerPhase[] = ["short-break", "long-break", "rest"];

export function isBreakPhase(phase: TimerPhase): boolean {
  return (BREAK_PHASES as readonly string[]).includes(phase);
}

/**
 * Immutable engine state. `focusMs` / `breakMs` are the BANKED totals
 * (excluding the live stretch); `runningSinceMs` anchors the current live
 * stretch (null = paused); `remainingMs` is the countdown value at that
 * anchor (null = stopwatch mode, no countdown).
 */
export interface TimerSnapshot {
  v: 2;
  focusMs: number;
  breakMs: number;
  runningSinceMs: number | null;
  isPaused: boolean;
  phase: TimerPhase;
  remainingMs: number | null;
  timestamp: number;
}

export interface DerivedTimer {
  focusSec: number;
  breakSec: number;
  /** Display countdown seconds (never negative). */
  remainingSec: number | null;
  /** Raw remaining ms — negative means the countdown crossed zero. */
  remainingRawMs: number | null;
  running: boolean;
  liveMs: number;
}

export function createInitialSnapshot(nowMs: number = Date.now()): TimerSnapshot {
  return {
    v: 2,
    focusMs: 0,
    breakMs: 0,
    runningSinceMs: nowMs,
    isPaused: false,
    phase: "focus",
    remainingMs: null,
    timestamp: nowMs,
  };
}

export function deriveTimer(s: TimerSnapshot, nowMs: number): DerivedTimer {
  const running = !s.isPaused && s.phase !== "done" && s.runningSinceMs !== null;
  const liveMs = running && s.runningSinceMs !== null ? Math.max(0, nowMs - s.runningSinceMs) : 0;

  const focusSec = Math.floor((s.focusMs + (s.phase === "focus" ? liveMs : 0)) / 1000);
  const breakSec = Math.floor((s.breakMs + (isBreakPhase(s.phase) ? liveMs : 0)) / 1000);

  const remainingRawMs = s.remainingMs === null ? null : s.remainingMs - liveMs;
  const remainingSec =
    remainingRawMs === null ? null : Math.max(0, Math.ceil(remainingRawMs / 1000));

  return { focusSec, breakSec, remainingSec, remainingRawMs, running, liveMs };
}

/**
 * Bank the live stretch into the current phase's accumulator, then freeze
 * (runningSinceMs = null). Idempotent when already paused.
 */
export function pauseSnapshot(s: TimerSnapshot, nowMs: number): TimerSnapshot {
  if (s.runningSinceMs === null) return { ...s, isPaused: true, timestamp: nowMs };
  const d = deriveTimer(s, nowMs);
  return {
    ...s,
    focusMs: s.focusMs + (s.phase === "focus" ? d.liveMs : 0),
    breakMs: s.breakMs + (isBreakPhase(s.phase) ? d.liveMs : 0),
    remainingMs: s.remainingMs === null ? null : Math.max(0, s.remainingMs - d.liveMs),
    runningSinceMs: null,
    isPaused: true,
    timestamp: nowMs,
  };
}

/** Re-anchor the live stretch at `nowMs`. Idempotent when already running. */
export function resumeSnapshot(s: TimerSnapshot, nowMs: number): TimerSnapshot {
  if (s.runningSinceMs !== null && !s.isPaused) return s;
  return { ...s, runningSinceMs: nowMs, isPaused: false, timestamp: nowMs };
}

/**
 * Set a new phase countdown (or clear it with null). Banks the live stretch
 * of the CURRENT phase first, then re-anchors at `nowMs` so the new phase
 * starts fresh. When paused, the countdown is set but stays frozen.
 */
export function setCountdownSnapshot(
  s: TimerSnapshot,
  seconds: number | null,
  nowMs: number
): TimerSnapshot {
  const d = deriveTimer(s, nowMs);
  return {
    ...s,
    focusMs: s.focusMs + (s.phase === "focus" ? d.liveMs : 0),
    breakMs: s.breakMs + (isBreakPhase(s.phase) ? d.liveMs : 0),
    remainingMs: seconds === null ? null : Math.max(0, Math.floor(seconds)) * 1000,
    runningSinceMs: s.isPaused ? null : nowMs,
    timestamp: nowMs,
  };
}

/**
 * Phase transition: bank the current phase's live stretch, move to the next
 * phase, set its countdown (or null), and optionally pause at the boundary.
 */
export function transitionSnapshot(
  s: TimerSnapshot,
  nowMs: number,
  opts: { phase: TimerPhase; remainingSec: number | null; paused?: boolean }
): TimerSnapshot {
  const d = deriveTimer(s, nowMs);
  const paused = opts.paused === true;
  return {
    ...s,
    focusMs: s.focusMs + (s.phase === "focus" ? d.liveMs : 0),
    breakMs: s.breakMs + (isBreakPhase(s.phase) ? d.liveMs : 0),
    phase: opts.phase,
    remainingMs: opts.remainingSec === null ? null : Math.max(0, Math.floor(opts.remainingSec)) * 1000,
    runningSinceMs: paused ? null : nowMs,
    isPaused: paused,
    timestamp: nowMs,
  };
}

/** Fields of a legacy (pre-epoch) localStorage cache entry. */
export interface LegacyTimerCache {
  elapsedSeconds?: number;
  breakSeconds?: number;
  isPaused?: boolean;
  pauseReason?: string;
  phase?: string;
  remainingSeconds?: number | null;
  timestamp?: number;
  sessionId?: number | null;
  lastSyncedSeconds?: number;
  lastSyncedBreakSeconds?: number;
}

const VALID_PHASES: TimerPhase[] = ["focus", "short-break", "long-break", "rest", "done"];

/**
 * Convert a legacy tick-accumulator cache entry into an epoch snapshot.
 * The legacy `timestamp` (wall clock at last persist) becomes the live
 * anchor when the timer was running — so time spent away from the page is
 * credited instead of discarded.
 */
export function legacyCacheToSnapshot(legacy: LegacyTimerCache, nowMs: number): TimerSnapshot {
  const phase = (VALID_PHASES as string[]).includes(legacy.phase ?? "")
    ? (legacy.phase as TimerPhase)
    : "focus";
  const isPaused = legacy.isPaused === true;
  const runningSinceMs =
    !isPaused && legacy.timestamp && Number.isFinite(legacy.timestamp)
      ? legacy.timestamp
      : isPaused
        ? null
        : nowMs;
  return {
    v: 2,
    focusMs: Math.max(0, Math.floor(legacy.elapsedSeconds ?? 0)) * 1000,
    breakMs: Math.max(0, Math.floor(legacy.breakSeconds ?? 0)) * 1000,
    runningSinceMs,
    isPaused,
    phase,
    remainingMs:
      legacy.remainingSeconds === null || legacy.remainingSeconds === undefined
        ? null
        : Math.max(0, Math.floor(legacy.remainingSeconds)) * 1000,
    timestamp: nowMs,
  };
}

/** Wall-clock-anchored countdown deadline check (true = crossed while away). */
export function countdownCrossed(s: TimerSnapshot, nowMs: number): boolean {
  if (s.remainingMs === null || s.isPaused || s.phase === "done") return false;
  const d = deriveTimer(s, nowMs);
  return d.remainingRawMs !== null && d.remainingRawMs <= 0;
}
