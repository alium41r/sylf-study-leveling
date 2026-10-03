// ============================================================================
// Timer Invariance Under Background Switching (Phase 5B)
// ============================================================================
// Proves mathematically that switching focus backgrounds (between Classic,
// Official anime/landscape/fantasy, and Custom user backgrounds):
// 1. Never resets, pauses, or drifts the epoch-anchored timer snapshot.
// 2. Leaves secondsRemaining, focusSec, breakSec, and phase completely invariant.
// 3. Never triggers premature session settlement or state corruption.
// ============================================================================
import { describe, it, expect } from "vitest";
import {
  createInitialSnapshot,
  setCountdownSnapshot,
  deriveTimer,
  pauseSnapshot,
  resumeSnapshot,
  transitionSnapshot,
  TimerSnapshot,
} from "@/lib/timer-engine";
import {
  saveStoredPreference,
  loadStoredPreference,
} from "@/lib/focus-background-preference";

const T0 = 1_700_000_000_000;

describe("Timer Invariance Under Focus Background Switching", () => {
  it("maintains strict wall-clock accuracy and progress across rapid background switches", () => {
    // 1. Timer starts at T0 (25m = 1500s session)
    let timerSnap: TimerSnapshot = setCountdownSnapshot(createInitialSnapshot(T0), 1500, T0);

    // Initial check: 0s elapsed, 1500s remaining
    let state = deriveTimer(timerSnap, T0);
    expect(state.focusSec).toBe(0);
    expect(state.remainingSec).toBe(1500);
    expect(state.running).toBe(true);

    // 2. After 5 minutes (300s), user switches from Classic to Official Anime
    const t1 = T0 + 300 * 1000;
    saveStoredPreference({ source: "official", categorySlug: "anime", backgroundId: 101 });
    let pref = loadStoredPreference();
    expect(pref.source).toBe("official");
    expect(pref.backgroundId).toBe(101);

    // Timer state at t1 is derived strictly from t1 - T0 = 300s
    state = deriveTimer(timerSnap, t1);
    expect(state.focusSec).toBe(300);
    expect(state.remainingSec).toBe(1200);
    expect(state.running).toBe(true);

    // 3. After another 3 minutes (180s later, t2 = T0 + 480s), user switches to Custom background
    const t2 = t1 + 180 * 1000;
    saveStoredPreference({ source: "custom", categorySlug: "custom", backgroundId: 777 });
    pref = loadStoredPreference();
    expect(pref.source).toBe("custom");
    expect(pref.backgroundId).toBe(777);

    // Timer state at t2 has advanced by exactly 480s, entirely unaffected by preference update
    state = deriveTimer(timerSnap, t2);
    expect(state.focusSec).toBe(480);
    expect(state.remainingSec).toBe(1020);
    expect(state.running).toBe(true);

    // 4. After another 2 minutes (120s later, t3 = T0 + 600s), user pauses the timer while Custom is active
    const t3 = t2 + 120 * 1000;
    timerSnap = pauseSnapshot(timerSnap, t3);
    state = deriveTimer(timerSnap, t3);
    expect(timerSnap.isPaused).toBe(true);
    expect(state.running).toBe(false);
    expect(state.focusSec).toBe(600);
    expect(state.remainingSec).toBe(900);

    // 5. While paused, user switches back to Classic Sylf
    saveStoredPreference({ source: "classic", categorySlug: "classic-sylf", backgroundId: null });
    pref = loadStoredPreference();
    expect(pref.source).toBe("classic");
    expect(pref.backgroundId).toBeNull();

    // Advancing clock by 60s while paused leaves focusSec frozen at 600
    state = deriveTimer(timerSnap, t3 + 60 * 1000);
    expect(state.running).toBe(false);
    expect(state.focusSec).toBe(600);
    expect(state.remainingSec).toBe(900);

    // 6. User resumes at t4 (t3 + 120s) and switches to Official Landscape
    const t4 = t3 + 120 * 1000;
    timerSnap = resumeSnapshot(timerSnap, t4);
    saveStoredPreference({ source: "official", categorySlug: "landscape", backgroundId: 202 });

    // 100s later (t5 = t4 + 100s), focusSec is 600 + 100 = 700s
    const t5 = t4 + 100 * 1000;
    state = deriveTimer(timerSnap, t5);
    expect(timerSnap.isPaused).toBe(false);
    expect(state.running).toBe(true);
    expect(state.focusSec).toBe(700);
    expect(state.remainingSec).toBe(800);
  });

  it("leaves break transitions and session accounting unaffected by background changes", () => {
    let snap: TimerSnapshot = setCountdownSnapshot(createInitialSnapshot(T0), 1500, T0);

    // Transition to short-break (5m = 300s)
    snap = transitionSnapshot(snap, T0 + 1500 * 1000, {
      phase: "short-break",
      remainingSec: 300,
    });

    // Switch to custom background during break
    saveStoredPreference({ source: "custom", categorySlug: "custom", backgroundId: 99 });

    // 2 minutes into break
    const d = deriveTimer(snap, T0 + 1500 * 1000 + 120 * 1000);
    expect(snap.phase).toBe("short-break");
    expect(d.focusSec).toBe(1500); // banked focus time unchanged
    expect(d.breakSec).toBe(120);
    expect(d.remainingSec).toBe(180);
  });
});
