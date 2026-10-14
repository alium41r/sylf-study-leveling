import { beforeEach, describe, expect, it, vi } from "vitest";
import { PixRuntime } from "@/lib/pixel-display/engine/runtime";
import type {
  PixContent,
  PixOverlay,
  PixRenderer,
  PixRuntimePhase,
} from "@/lib/pixel-display/engine/runtime";

/**
 * The runtime's lifecycle is a three-phase machine, and this file is its
 * specification:
 *
 *   stopped ──start()/requestFrame()──► running ──(frame)──► idle
 *      ▲                                                      │
 *      └──────────────────── stop() ◄─────────────────────────┘
 *
 * `idle` and `stopped` are both zero work, but they mean different things:
 * `idle` is "on screen and correct, costing nothing", `stopped` is "not being
 * maintained at all". Every transition between them is asserted here, so the
 * distinction cannot silently collapse back into one boolean.
 */

interface Frame {
  time: number;
  callback: (time: number) => void;
}

function createHarness() {
  let nextHandle = 0;
  const pending = new Map<number, Frame>();
  const cancelled: number[] = [];
  let now = 1_000;

  const runtime = new PixRuntime({
    clock: () => now,
    schedule: (callback) => {
      nextHandle += 1;
      pending.set(nextHandle, { time: now, callback });
      return nextHandle;
    },
    cancel: (handle) => {
      cancelled.push(handle);
      pending.delete(handle);
    },
  });

  return {
    runtime,
    cancelled,
    get pendingCount() {
      return pending.size;
    },
    advance(ms: number) {
      now += ms;
    },
    /** Runs the single scheduled frame, as the browser would. */
    flush() {
      const frames = Array.from(pending.values());
      pending.clear();
      for (const frame of frames) frame.callback(now);
    },
  };
}

const PHASES: PixRuntimePhase[] = ["stopped", "running", "idle"];

describe("runtime phase machine", () => {
  let harness: ReturnType<typeof createHarness>;

  beforeEach(() => {
    harness = createHarness();
  });

  describe("every phase reports exactly one identity", () => {
    it.each(PHASES)("phase %s is exclusive", (phase) => {
      const content: PixContent = { id: "c", update: () => phase === "running" };
      harness.runtime.setContent(content);
      harness.runtime.start(); // always lands in running
      if (phase === "idle") harness.flush();
      if (phase === "stopped") harness.runtime.stop();

      expect(harness.runtime.getPhase()).toBe(phase);
      const flags = [
        harness.runtime.isStopped(),
        harness.runtime.isRunning(),
        harness.runtime.isIdle(),
      ];
      expect(flags.filter(Boolean)).toHaveLength(1);
      expect(flags[PHASES.indexOf(phase)]).toBe(true);
    });
  });

  describe("transitions out of every phase", () => {
    it("stopped → running on start()", () => {
      expect(harness.runtime.getPhase()).toBe("stopped");
      harness.runtime.start();
      expect(harness.runtime.getPhase()).toBe("running");
      expect(harness.pendingCount).toBe(1);
    });

    it("stopped → running on requestFrame()", () => {
      harness.runtime.requestFrame();
      expect(harness.runtime.getPhase()).toBe("running");
      expect(harness.pendingCount).toBe(1);
    });

    it("stopped → running on resume()", () => {
      harness.runtime.start();
      harness.flush();
      harness.runtime.stop();
      harness.advance(1_000);

      harness.runtime.resume();
      // Resume continues the session, so its timeline is preserved rather than
      // rebased the way start() would.
      expect(harness.runtime.getPhase()).toBe("running");
      expect(harness.runtime.getElapsed()).toBe(1_000);
    });

    it("running → idle when nothing continues the animation", () => {
      harness.runtime.start();
      expect(harness.runtime.getPhase()).toBe("running");
      harness.flush();
      expect(harness.runtime.getPhase()).toBe("idle");
      expect(harness.pendingCount).toBe(0);
    });

    it("running → running while content continues the animation", () => {
      harness.runtime.setContent({ id: "loop", update: () => true });
      harness.runtime.start();
      harness.flush();
      expect(harness.runtime.getPhase()).toBe("running");
      expect(harness.pendingCount).toBe(1);
    });

    it("idle → running on requestFrame()", () => {
      harness.runtime.start();
      harness.flush();
      expect(harness.runtime.getPhase()).toBe("idle");

      harness.runtime.requestFrame();
      expect(harness.runtime.getPhase()).toBe("running");
      expect(harness.pendingCount).toBe(1);
    });

    it("idle → stopped on stop()", () => {
      harness.runtime.start();
      harness.flush();
      harness.runtime.stop();
      expect(harness.runtime.getPhase()).toBe("stopped");
    });

    it("running → stopped on stop(), cancelling the in-flight frame", () => {
      harness.runtime.start();
      expect(harness.pendingCount).toBe(1);

      harness.runtime.stop();

      expect(harness.runtime.getPhase()).toBe("stopped");
      expect(harness.pendingCount).toBe(0);
      expect(harness.cancelled).toHaveLength(1);
    });

    it("resumes from stopped through start(), rebasing the session", () => {
      harness.runtime.start();
      harness.flush();
      harness.advance(4_000);
      harness.runtime.stop();

      harness.runtime.start();
      expect(harness.runtime.getPhase()).toBe("running");
      expect(harness.pendingCount).toBe(1);
      // A fresh session: suspended time does not carry over.
      expect(harness.runtime.getElapsed()).toBe(0);
    });
  });

  describe("stop() is idempotent", () => {
    it("can be called from any phase without side effects", () => {
      harness.runtime.stop(); // stopped
      expect(harness.runtime.getPhase()).toBe("stopped");
      expect(harness.cancelled).toHaveLength(0);

      harness.runtime.start(); // running
      harness.runtime.stop();
      harness.runtime.stop();
      expect(harness.runtime.getPhase()).toBe("stopped");
      // Only the one frame that existed was cancelled.
      expect(harness.cancelled).toHaveLength(1);

      harness.runtime.start();
      harness.flush(); // idle
      harness.runtime.stop();
      harness.runtime.stop();
      expect(harness.runtime.getPhase()).toBe("stopped");
      expect(harness.cancelled).toHaveLength(1);
    });
  });

  describe("in-flight frames cannot resurrect a stopped runtime", () => {
    it("a cancelled frame never runs", () => {
      const update = vi.fn();
      harness.runtime.setContent({ id: "c", update });
      harness.runtime.start();
      harness.runtime.stop();

      harness.advance(50);
      harness.flush(); // nothing is pending, so nothing runs

      expect(update).not.toHaveBeenCalled();
      expect(harness.runtime.getFrameCount()).toBe(0);
      expect(harness.runtime.getPhase()).toBe("stopped");
    });

    it("frames rendering after a stop do not reschedule", () => {
      // A renderer that stops the runtime mid-frame must not have its frame
      // re-scheduled by the continuation path.
      const renderer: PixRenderer = {
        isReady: () => true,
        draw: () => harness.runtime.stop(),
      };
      harness.runtime.setRenderer(renderer);
      harness.runtime.setContent({ id: "loop", update: () => true });

      harness.runtime.start();
      harness.flush();

      expect(harness.runtime.getPhase()).toBe("stopped");
      expect(harness.pendingCount).toBe(0);
    });
  });

  describe("logical time rebases exactly once per session", () => {
    it("does not accumulate suspended wall-clock time", () => {
      const seen: number[] = [];
      harness.runtime.setContent({
        id: "clocked",
        update: (timeline) => {
          seen.push(timeline.elapsed);
          return false;
        },
      });

      harness.runtime.start();
      harness.flush();
      expect(seen).toEqual([0]);

      // Suspended for an hour.
      harness.advance(3_600_000);
      harness.runtime.start();
      harness.flush();

      // The second session starts at zero again, not at 3,600,000.
      expect(seen[1]).toBe(0);
    });

    it("keeps reporting session time while stopped, because resume continues it", () => {
      harness.runtime.start();
      harness.flush();
      harness.advance(5_000);
      expect(harness.runtime.getElapsed()).toBe(5_000);

      harness.runtime.stop();
      // Still 5,000: a stopped display has not ended its session, it is simply
      // not being maintained. Only start() rebases to zero.
      expect(harness.runtime.getElapsed()).toBe(5_000);

      harness.runtime.start();
      expect(harness.runtime.getElapsed()).toBe(0);
    });

    it("a manual tick from stopped opens its own session", () => {
      const deltas: number[] = [];
      harness.runtime.setContent({
        id: "clocked",
        update: (timeline) => {
          deltas.push(timeline.delta);
          return false;
        },
      });

      // Advance well past any previous session, then drive one frame by hand.
      harness.advance(90_000);
      harness.runtime.tick();

      // The first frame of a session has no predecessor, so its delta is zero
      // rather than the entire suspended gap.
      expect(deltas).toEqual([0]);
      expect(harness.runtime.getPhase()).toBe("idle");
    });
  });

  describe("the zero-work invariant holds in both resting phases", () => {
    it.each(["idle", "stopped"] as const)(
      "phase %s schedules nothing and freezes the frame counter",
      (phase) => {
        harness.runtime.setContent({ id: "static", update: () => false });
        harness.runtime.start();
        harness.flush();
        if (phase === "stopped") harness.runtime.stop();

        expect(harness.runtime.getPhase()).toBe(phase);
        const frozen = harness.runtime.getFrameCount();
        const cancelledBefore = harness.cancelled.length;

        harness.advance(120_000);
        harness.flush();

        expect(harness.runtime.getFrameCount()).toBe(frozen);
        expect(harness.pendingCount).toBe(0);
        expect(harness.cancelled).toHaveLength(cancelledBefore);
      },
    );
  });

  describe("attachment does not schedule work", () => {
    it.each([
      ["content", (runtime: PixRuntime) => runtime.setContent({ id: "c" })],
      [
        "overlay",
        (runtime: PixRuntime) =>
          runtime.setOverlay({ id: "o", draw: () => {} } as PixOverlay),
      ],
      [
        "renderer",
        (runtime: PixRuntime) =>
          runtime.setRenderer({ isReady: () => true, draw: () => {} }),
      ],
    ])("attaching %s leaves the runtime stopped", (_label, attach) => {
      attach(harness.runtime);
      expect(harness.runtime.getPhase()).toBe("stopped");
      expect(harness.pendingCount).toBe(0);
    });
  });
});
