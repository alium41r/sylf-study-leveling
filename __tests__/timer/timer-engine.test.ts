import { describe, it, expect } from "vitest";
import {
  createInitialSnapshot,
  deriveTimer,
  pauseSnapshot,
  resumeSnapshot,
  setCountdownSnapshot,
  transitionSnapshot,
  legacyCacheToSnapshot,
  countdownCrossed,
  isBreakPhase,
} from "@/lib/timer-engine";

const T0 = 1_000_000_000_000; // fixed epoch

describe("timer-engine: epoch-anchored derivation", () => {
  it("derives elapsed focus from wall clock, not ticks", () => {
    const snap = createInitialSnapshot(T0);
    expect(deriveTimer(snap, T0).focusSec).toBe(0);
    // A single "tick" after 10 minutes in the background credits 600s.
    expect(deriveTimer(snap, T0 + 10 * 60 * 1000).focusSec).toBe(600);
  });

  it("never counts focus time during break phases (T-02 drift guard)", () => {
    const snap = transitionSnapshot(createInitialSnapshot(T0), T0, {
      phase: "short-break",
      remainingSec: 300,
    });
    const d = deriveTimer(snap, T0 + 240 * 1000);
    expect(d.focusSec).toBe(0);
    expect(d.breakSec).toBe(240);
    expect(d.remainingSec).toBe(60);
  });

  it("pause banks the live stretch and freezes", () => {
    let snap = createInitialSnapshot(T0);
    snap = pauseSnapshot(snap, T0 + 90 * 1000);
    expect(snap.focusMs).toBe(90_000);
    expect(deriveTimer(snap, T0 + 60 * 60 * 1000).focusSec).toBe(90); // frozen while paused
  });

  it("resume re-anchors and continues from the banked total", () => {
    let snap = createInitialSnapshot(T0);
    snap = pauseSnapshot(snap, T0 + 90 * 1000);
    snap = resumeSnapshot(snap, T0 + 5 * 60 * 1000);
    expect(deriveTimer(snap, T0 + 5 * 60 * 1000 + 30 * 1000).focusSec).toBe(120);
  });

  it("pause/resume round-trips with zero drift across many cycles", () => {
    let snap = createInitialSnapshot(T0);
    let now = T0;
    // Stretch 0: runs from T0 (already running) until the first pause.
    let expectedRunMs = 35_000; // 10_000 + 25_000 (first resume is a no-op)
    for (let i = 0; i < 50; i++) {
      now += 10_000 + i * 137; // uneven jitter — timer callbacks never fire on schedule
      snap = resumeSnapshot(snap, now);
      now += 25_000 - i * 31;
      snap = pauseSnapshot(snap, now);
      if (i > 0) expectedRunMs += 25_000 - i * 31;
    }
    const d = deriveTimer(snap, now);
    expect(Math.abs(d.focusSec - Math.floor(expectedRunMs / 1000))).toBeLessThanOrEqual(1);
  });

  it("countdown derives from the anchor and crosses zero in background (T-01/T-02)", () => {
    let snap = setCountdownSnapshot(createInitialSnapshot(T0), 25 * 60, T0);
    snap = resumeSnapshot(snap, T0);
    const d = deriveTimer(snap, T0 + 10 * 60 * 1000);
    expect(d.remainingSec).toBe(900);
    expect(countdownCrossed(snap, T0 + 26 * 60 * 1000)).toBe(true);
  });

  it("transition banks the current phase before switching", () => {
    let snap = createInitialSnapshot(T0);
    snap = transitionSnapshot(snap, T0 + 120 * 1000, {
      phase: "long-break",
      remainingSec: 900,
    });
    expect(snap.focusMs).toBe(120_000);
    expect(snap.breakMs).toBe(0);
    const d = deriveTimer(snap, T0 + 120 * 1000 + 60 * 1000);
    expect(d.focusSec).toBe(120);
    expect(d.breakSec).toBe(60);
    expect(d.remainingSec).toBe(840);
  });

  it("transition with paused=true freezes at the boundary", () => {
    const snap = transitionSnapshot(createInitialSnapshot(T0), T0 + 30 * 1000, {
      phase: "short-break",
      remainingSec: 300,
      paused: true,
    });
    expect(snap.isPaused).toBe(true);
    expect(deriveTimer(snap, T0 + 10 * 60 * 1000).remainingSec).toBe(300);
  });

  it("legacy cache converts elapsedSeconds into an epoch snapshot", () => {
    const legacy = {
      elapsedSeconds: 540,
      breakSeconds: 60,
      isPaused: false,
      phase: "focus",
      remainingSeconds: 240,
      timestamp: T0 - 60_000, // persisted one minute ago
    };
    const snap = legacyCacheToSnapshot(legacy, T0);
    // One minute away from the page IS credited on restore.
    expect(deriveTimer(snap, T0).focusSec).toBe(600);
    expect(deriveTimer(snap, T0).remainingSec).toBe(180);
  });

  it("legacy paused cache stays frozen on restore", () => {
    const snap = legacyCacheToSnapshot(
      { elapsedSeconds: 300, isPaused: true, remainingSeconds: 600, timestamp: T0 - 60_000 },
      T0
    );
    const d = deriveTimer(snap, T0 + 60 * 60 * 1000);
    expect(d.focusSec).toBe(300);
    expect(d.remainingSec).toBe(600);
  });

  it("isBreakPhase classifies rest phases", () => {
    expect(isBreakPhase("short-break")).toBe(true);
    expect(isBreakPhase("long-break")).toBe(true);
    expect(isBreakPhase("rest")).toBe(true);
    expect(isBreakPhase("focus")).toBe(false);
    expect(isBreakPhase("done")).toBe(false);
  });

  it("done phase stops accrual", () => {
    const snap = transitionSnapshot(createInitialSnapshot(T0), T0 + 60 * 1000, {
      phase: "done",
      remainingSec: null,
    });
    const d = deriveTimer(snap, T0 + 120 * 60 * 1000);
    expect(d.focusSec).toBe(60);
    expect(d.remainingSec).toBe(null);
  });
});
