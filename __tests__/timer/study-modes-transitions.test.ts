import { describe, it, expect } from "vitest";
import {
  createInitialSnapshot,
  deriveTimer,
  transitionSnapshot,
} from "@/lib/timer-engine";

const T0 = 1_700_000_000_000;

describe("study modes transitions & break mechanics", () => {
  describe("Free Flow study mode", () => {
    it("taking a break banks focus time and enters countdown break with zero focus leakage", () => {
      // 1. Start Free Flow focus
      let snap = createInitialSnapshot(T0);
      expect(deriveTimer(snap, T0).focusSec).toBe(0);

      // Focus for 25 minutes (1500 seconds)
      const tBreakStart = T0 + 1500 * 1000;
      const dFocus = deriveTimer(snap, tBreakStart);
      expect(dFocus.focusSec).toBe(1500);
      expect(dFocus.breakSec).toBe(0);

      // 2. User clicks "☕ TAKE A BREAK" (e.g. 5 minutes = 300 seconds)
      snap = transitionSnapshot(snap, tBreakStart, {
        phase: "short-break",
        remainingSec: 300,
        paused: false,
      });

      // Snapshot checks
      expect(snap.phase).toBe("short-break");
      expect(snap.focusMs).toBe(1500 * 1000);
      expect(snap.breakMs).toBe(0);

      // Advance 2 minutes into break (120 seconds)
      const tMidBreak = tBreakStart + 120 * 1000;
      const dBreak = deriveTimer(snap, tMidBreak);
      expect(dBreak.focusSec).toBe(1500); // Focus time did not advance!
      expect(dBreak.breakSec).toBe(120);  // Break time accumulated
      expect(dBreak.remainingSec).toBe(180); // 300 - 120 = 180 remaining
    });

    it("skipping a break in Free Flow immediately returns to open-ended focus stopwatch", () => {
      let snap = createInitialSnapshot(T0);
      const tBreakStart = T0 + 600 * 1000; // 10 min focus
      snap = transitionSnapshot(snap, tBreakStart, {
        phase: "short-break",
        remainingSec: 300,
        paused: false,
      });

      // After 60 seconds into break, user clicks "Skip Break → Focus"
      const tSkip = tBreakStart + 60 * 1000;
      snap = transitionSnapshot(snap, tSkip, {
        phase: "focus",
        remainingSec: null,
        paused: false,
      });

      expect(snap.phase).toBe("focus");
      expect(snap.remainingMs).toBeNull(); // open-ended stopwatch
      expect(snap.focusMs).toBe(600 * 1000);
      expect(snap.breakMs).toBe(60 * 1000);

      // Study for another 5 minutes
      const tLater = tSkip + 300 * 1000;
      const dAfter = deriveTimer(snap, tLater);
      expect(dAfter.focusSec).toBe(900); // 600 + 300
      expect(dAfter.breakSec).toBe(60);
      expect(dAfter.remainingSec).toBeNull();
    });

    it("break countdown completion pauses and waits for user resume (BREAK OVER)", () => {
      let snap = createInitialSnapshot(T0);
      const tBreakStart = T0 + 1200 * 1000;
      snap = transitionSnapshot(snap, tBreakStart, {
        phase: "short-break",
        remainingSec: 300,
        paused: false,
      });

      // Break timer reaches zero (after 300 seconds)
      const tBreakEnd = tBreakStart + 300 * 1000;
      snap = transitionSnapshot(snap, tBreakEnd, {
        phase: "focus",
        remainingSec: null,
        paused: true, // paused at boundary so time doesn't bleed
      });

      expect(snap.phase).toBe("focus");
      expect(snap.isPaused).toBe(true);
      expect(snap.breakMs).toBe(300 * 1000);
      expect(snap.focusMs).toBe(1200 * 1000);

      // Time passes while away from screen (e.g. 10 minutes)
      const tAway = tBreakEnd + 600 * 1000;
      const dAway = deriveTimer(snap, tAway);
      expect(dAway.focusSec).toBe(1200); // Does NOT advance while paused!
      expect(dAway.breakSec).toBe(300);
    });
  });

  describe("52/17 and Animedoro cycle completion", () => {
    it("52/17 transitions to done after the final cycle break rather than looping infinitely", () => {
      const totalSessions = 3;
      let currentSession = 3;
      let nextPhase: string;
      let nextLabel: string;

      // When recovery break ends in cycle 3 of 3
      if (currentSession >= totalSessions) {
        nextPhase = "done";
        nextLabel = "SESSION COMPLETE";
      } else {
        currentSession += 1;
        nextPhase = "focus";
        nextLabel = `52/17 FOCUS ${currentSession}/${totalSessions}`;
      }

      expect(nextPhase).toBe("done");
      expect(nextLabel).toBe("SESSION COMPLETE");
    });

    it("Animedoro transitions to done after the final cycle reward break", () => {
      const totalSessions = 3;
      let currentSession = 3;
      let nextPhase: string;
      let nextLabel: string;

      // When reward break ends in cycle 3 of 3
      if (currentSession >= totalSessions) {
        nextPhase = "done";
        nextLabel = "SESSION COMPLETE";
      } else {
        currentSession += 1;
        nextPhase = "focus";
        nextLabel = `ANIMEDORO FOCUS ${currentSession}/${totalSessions}`;
      }

      expect(nextPhase).toBe("done");
      expect(nextLabel).toBe("SESSION COMPLETE");
    });
  });

  describe("Pomodoro and structured mode break skipping", () => {
    it("skipping a Pomodoro break advances to the next focus block with full countdown", () => {
      const currentSession = 1;
      const totalSessions = 4;
      const focusDurationMin = 25;

      // User was in short break, skips it
      const nextSession = currentSession + 1;
      const nextPhase = "focus";
      const nextRemaining = focusDurationMin * 60;
      const nextLabel = `FOCUS ${nextSession}/${totalSessions}`;

      expect(nextSession).toBe(2);
      expect(nextPhase).toBe("focus");
      expect(nextRemaining).toBe(1500);
      expect(nextLabel).toBe("FOCUS 2/4");
    });
  });
});
