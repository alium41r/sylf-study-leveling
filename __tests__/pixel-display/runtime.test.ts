import { beforeEach, describe, expect, it, vi } from "vitest";
import { PixRuntime } from "@/lib/pixel-display/engine/runtime";
import type { PixContent, PixRenderer } from "@/lib/pixel-display/engine/runtime";

/**
 * Deterministic scheduler. The runtime takes its scheduling and clock as
 * injected dependencies precisely so the idle-to-zero-work guarantee can be
 * asserted without a browser or a real animation frame.
 */
function createHarness() {
  let handle = 0;
  const pending = new Map<number, (time: number) => void>();
  const cancelled: number[] = [];
  let now = 1000;

  const runtime = new PixRuntime({
    clock: () => now,
    schedule: (callback) => {
      handle += 1;
      pending.set(handle, callback);
      return handle;
    },
    cancel: (cancelledHandle) => {
      cancelled.push(cancelledHandle);
      pending.delete(cancelledHandle);
    },
  });

  return {
    runtime,
    get scheduledCount() {
      return pending.size;
    },
    cancelled,
    advance(ms: number) {
      now += ms;
    },
    /** Runs whatever frame is currently scheduled, if any. */
    flush() {
      const entries = Array.from(pending.entries());
      pending.clear();
      for (const [, callback] of entries) callback(now);
    },
  };
}

describe("pixel runtime", () => {
  let harness: ReturnType<typeof createHarness>;

  beforeEach(() => {
    harness = createHarness();
  });

  describe("idle is genuinely zero work", () => {
    it("starts stopped, scheduling nothing", () => {
      expect(harness.runtime.getPhase()).toBe("stopped");
      expect(harness.runtime.isStopped()).toBe(true);
      expect(harness.runtime.isRunning()).toBe(false);
      expect(harness.runtime.isIdle()).toBe(false);
      expect(harness.scheduledCount).toBe(0);
      expect(harness.runtime.getFrameCount()).toBe(0);
    });

    it("does nothing at all while stopped", () => {
      harness.runtime.start();
      harness.runtime.stop();
      const afterStop = harness.runtime.getFrameCount();

      // Stopped is not idle: the display is no longer being maintained.
      expect(harness.runtime.getPhase()).toBe("stopped");
      expect(harness.runtime.isIdle()).toBe(false);
      expect(harness.scheduledCount).toBe(0);

      harness.advance(10_000);
      harness.flush();

      // No scheduled callback existed, so no frame ran and nothing is pending.
      expect(harness.runtime.getFrameCount()).toBe(afterStop);
      expect(harness.scheduledCount).toBe(0);
    });

    it("cancels an in-flight frame when stopped", () => {
      harness.runtime.start();
      expect(harness.scheduledCount).toBe(1);

      harness.runtime.stop();
      expect(harness.cancelled).toHaveLength(1);
      expect(harness.scheduledCount).toBe(0);
    });

    it("returns to idle when content stops asking for frames", () => {
      const updates: number[] = [];
      const content: PixContent = {
        id: "settling",
        update: () => {
          updates.push(1);
          return updates.length < 3;
        },
      };
      harness.runtime.setContent(content);
      harness.runtime.start();

      harness.flush();
      expect(harness.runtime.isRunning()).toBe(true);

      harness.flush();
      expect(harness.runtime.isRunning()).toBe(true);

      harness.flush();
      expect(harness.runtime.isIdle()).toBe(true);
      expect(harness.scheduledCount).toBe(0);

      const frozen = harness.runtime.getFrameCount();
      harness.advance(5_000);
      harness.flush();
      expect(harness.runtime.getFrameCount()).toBe(frozen);
    });

    it("stays idle for content that never requests another frame", () => {
      harness.runtime.setContent({ id: "static", update: () => false });
      harness.runtime.start();
      harness.flush();

      expect(harness.runtime.isRunning()).toBe(false);
      expect(harness.scheduledCount).toBe(0);
      expect(harness.runtime.getFrameCount()).toBe(1);
    });
  });

  describe("waking from idle", () => {
    it("schedules exactly one frame per wake", () => {
      harness.runtime.start();
      expect(harness.scheduledCount).toBe(1);

      harness.runtime.requestFrame();
      harness.runtime.requestFrame();

      // Repeated wakes must not stack up duplicate frames.
      expect(harness.scheduledCount).toBe(1);
    });

    it("resumes work after settling", () => {
      harness.runtime.setContent({ id: "static", update: () => false });
      harness.runtime.start();
      harness.flush();
      expect(harness.runtime.isIdle()).toBe(true);

      // A late edit wakes the display for exactly one more frame that paints it.
      harness.runtime.requestFrame();
      expect(harness.runtime.isRunning()).toBe(true);
      harness.flush();

      expect(harness.runtime.getFrameCount()).toBe(2);
      expect(harness.runtime.isIdle()).toBe(true);
    });

    it("does not double-schedule when content requests a frame during update", () => {
      const content: PixContent = {
        id: "self-driving",
        update: () => {
          harness.runtime.requestFrame();
          return false;
        },
      };
      harness.runtime.setContent(content);
      harness.runtime.start();

      expect(harness.scheduledCount).toBe(1);
      harness.flush();
      // The content's own request is the single pending frame.
      expect(harness.scheduledCount).toBe(1);
    });
  });

  describe("frame lifecycle", () => {
    it("updates content, then draws, exactly once per frame", () => {
      const order: string[] = [];
      harness.runtime.setContent({
        id: "ordered",
        update: () => {
          order.push("update");
        },
        render: () => {
          order.push("content-render");
        },
      });
      const renderer: PixRenderer = {
        isReady: () => true,
        draw: () => {
          order.push("drawer");
        },
      };
      harness.runtime.setRenderer(renderer);

      harness.runtime.start();
      harness.flush();

      expect(order).toEqual(["update", "content-render", "drawer"]);
    });

    it("skips drawing when the renderer is not ready", () => {
      const draw = vi.fn();
      harness.runtime.setRenderer({ isReady: () => false, draw });
      harness.runtime.start();
      harness.flush();
      expect(draw).not.toHaveBeenCalled();
    });

    it("reports logical time, delta and a monotonic frame count", () => {
      const timelines: Array<{ elapsed: number; delta: number; frame: number }> =
        [];
      harness.runtime.setContent({
        id: "clocked",
        update: (timeline) => {
          timelines.push({
            elapsed: timeline.elapsed,
            delta: timeline.delta,
            frame: timeline.frame,
          });
          return timelines.length < 2;
        },
      });

      harness.runtime.start();
      expect(harness.runtime.getElapsed()).toBe(0);

      harness.flush();
      harness.advance(16);
      harness.flush();

      expect(timelines).toHaveLength(2);
      expect(timelines[0]).toEqual({ elapsed: 0, delta: 0, frame: 1 });
      expect(timelines[1]).toEqual({ elapsed: 16, delta: 16, frame: 2 });
    });

    it("runs one frame synchronously through tick() without scheduling", () => {
      const update = vi.fn();
      harness.runtime.setContent({ id: "manual", update });
      harness.runtime.tick();
      expect(update).toHaveBeenCalledTimes(1);
      expect(harness.scheduledCount).toBe(0);
    });

    it("tolerates having no content or renderer", () => {
      expect(() => {
        harness.runtime.start();
        harness.flush();
      }).not.toThrow();
      expect(harness.runtime.getFrameCount()).toBe(1);
    });
  });

  describe("overlay layer", () => {
    it("draws after content, so a clearing content pass cannot erase it", () => {
      const order: string[] = [];
      harness.runtime.setContent({
        id: "clearing",
        render: () => order.push("content"),
      });
      harness.runtime.setOverlay({
        id: "viewer",
        draw: () => order.push("overlay"),
      });

      harness.runtime.start();
      harness.flush();

      // The overlay's position in the sequence is the whole point: content
      // clears the framebuffer, so anything drawn before it would be wiped.
      expect(order).toEqual(["content", "overlay"]);
    });

    it("runs even when there is no content", () => {
      const draw = vi.fn();
      harness.runtime.setOverlay({ id: "viewer", draw });
      harness.runtime.start();
      harness.flush();
      expect(draw).toHaveBeenCalledTimes(1);
    });

    it("can be replaced and cleared", () => {
      const first = vi.fn();
      const second = vi.fn();
      harness.runtime.setOverlay({ id: "one", draw: first });
      harness.runtime.start();
      harness.flush();

      harness.runtime.setOverlay({ id: "two", draw: second });
      harness.runtime.requestFrame();
      harness.flush();

      harness.runtime.setOverlay(null);
      harness.runtime.requestFrame();
      harness.flush();

      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
    });

    it("does not keep the runtime awake on its own", () => {
      harness.runtime.setOverlay({ id: "viewer", draw: () => {} });
      harness.runtime.start();
      harness.flush();
      // Drawing an overlay is not a reason to request another frame.
      expect(harness.runtime.isIdle()).toBe(true);
      expect(harness.scheduledCount).toBe(0);
    });
  });
});
