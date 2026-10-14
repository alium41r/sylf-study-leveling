import { SYLF_CHARACTER_ASSET } from "./fixtures/retired-sylf/reference-character";
/**
 * ============================================================================
 * AUDIT REGRESSIONS — THE REACT HOST
 * ============================================================================
 * Two lifecycle defects the existing suites could not see, because they drove
 * the content directly instead of through the props the production surfaces use:
 *
 *   1. `content.state` was applied when the display was created and never again,
 *      so a level-up or an AI-thinking signal changed the card's `data-state`
 *      attribute while the drawing stayed in its opening posture.
 *   2. A change to `width`/`height` (the scholar's pixel-density preference)
 *      replaced the display, renderer and runtime, but the new renderer was
 *      never fitted and the container observer kept pointing at the dead one —
 *      so the display stopped drawing entirely.
 *
 * Both are asserted through the public component, and both read the framebuffer
 * rather than a prop, because the prop was what lied.
 */

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRecordingContext } from "./support/recording-renderer";
import {
  PixelDisplay,
  type PixelDisplayHandle,
} from "@/lib/pixel-display/react/PixelDisplay";

const recording = createRecordingContext();

/** jsdom has no ResizeObserver; the host must work with a real one present. */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  fire() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

const SLOT_SIZE = 110;

beforeEach(() => {
  recording.reset();
  FakeResizeObserver.instances = [];
  (globalThis as Record<string, unknown>).ResizeObserver = FakeResizeObserver;
  HTMLCanvasElement.prototype.getContext = (() =>
    recording.context) as unknown as HTMLCanvasElement["getContext"];
  HTMLElement.prototype.getBoundingClientRect = function () {
    return {
      width: SLOT_SIZE,
      height: SLOT_SIZE,
      top: 0,
      left: 0,
      right: SLOT_SIZE,
      bottom: SLOT_SIZE,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  };
});

afterEach(() => cleanup());

function display(props: {
  size: number;
  state: "IDLE" | "CELEBRATING";
  onReady: (handle: PixelDisplayHandle) => void;
}) {
  return (
    <PixelDisplay
      width={props.size}
      height={props.size}
      content={{
        state: props.state,
        characterFill: 0.9,
        autoBlink: false,
        composition: { base: SYLF_CHARACTER_ASSET, parts: [] },
      }}
      onReady={props.onReady}
    />
  );
}

function cellDiff(a: readonly number[], b: readonly number[]): number {
  return a.reduce((count, value, index) => (value === b[index] ? count : count + 1), 0);
}

describe("the content options a surface declares", () => {
  it("reaches the drawing when the declared state changes after mount", async () => {
    const handles: PixelDisplayHandle[] = [];
    const view = render(display({ size: 48, state: "IDLE", onReady: (h) => handles.push(h) }));
    await vi.waitFor(() => expect(handles.length).toBe(1));
    handles[0].runtime.tick();
    const idle = Array.from(handles[0].display.snapshot());

    view.rerender(
      display({ size: 48, state: "CELEBRATING", onReady: (h) => handles.push(h) }),
    );
    handles[0].runtime.tick();
    const celebrating = Array.from(handles[0].display.snapshot());

    // The same display object, so this is a state change and not a remount.
    expect(handles.length).toBe(1);
    expect(cellDiff(idle, celebrating)).toBeGreaterThan(0);
  });
});

describe("a logical-size change", () => {
  it("fits the new renderer and draws through it", async () => {
    const handles: PixelDisplayHandle[] = [];
    const view = render(display({ size: 48, state: "IDLE", onReady: (h) => handles.push(h) }));
    await vi.waitFor(() => expect(handles.length).toBe(1));
    expect(handles[0].renderer.getPresentationSize().cssWidth).toBe(SLOT_SIZE);
    handles[0].runtime.tick();
    expect(handles[0].renderer.isReady()).toBe(true);
    const drawsBefore = recording.drawCount + recording.rects.length;

    view.rerender(
      display({ size: 64, state: "IDLE", onReady: (h) => handles.push(h) }),
    );
    await vi.waitFor(() => expect(handles.length).toBe(2));
    const next = handles[1];
    expect(next.display.width).toBe(64);
    // The new renderer must have been given the slot, exactly as the first was.
    expect(next.renderer.getPresentationSize().cssWidth).toBe(SLOT_SIZE);
    expect(next.renderer.getCellPitch()).toBeGreaterThan(0);

    next.runtime.tick();
    expect(next.renderer.isReady()).toBe(true);
    expect(recording.drawCount + recording.rects.length).toBeGreaterThan(drawsBefore);
  });

  it("keeps the container observer pointing at the live display", async () => {
    const handles: PixelDisplayHandle[] = [];
    const view = render(display({ size: 48, state: "IDLE", onReady: (h) => handles.push(h) }));
    await vi.waitFor(() => expect(handles.length).toBe(1));
    view.rerender(
      display({ size: 64, state: "IDLE", onReady: (h) => handles.push(h) }),
    );
    await vi.waitFor(() => expect(handles.length).toBe(2));

    // A later resize must re-fit the display that is actually on screen.
    for (const observer of FakeResizeObserver.instances) observer.fire();
    expect(handles[1].renderer.getPresentationSize().cssWidth).toBe(SLOT_SIZE);
    expect(handles[1].renderer.isReady()).toBe(true);
  });
});
