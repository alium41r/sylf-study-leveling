import { createRef } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CelestialWorld } from "@/app/components/landing/journey/CelestialDecor";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function world(width = 1440) {
  let intersect: IntersectionObserverCallback;
  let resized: ResizeObserverCallback;
  let queued: FrameRequestCallback | undefined;
  let reduced = false;
  let mediaChanged = () => {};
  const request = vi.fn((callback: FrameRequestCallback) => {
    queued = callback;
    return 1;
  });
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return reduced;
    },
    addEventListener: (_event: string, callback: () => void) => {
      mediaChanged = callback;
    },
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(fn: IntersectionObserverCallback) {
        intersect = fn;
      }
      observe() {}
      disconnect() {}
    }
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(fn: ResizeObserverCallback) {
        resized = fn;
      }
      observe() {}
      disconnect() {}
    }
  );
  vi.spyOn(window, "innerWidth", "get").mockReturnValue(width);
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);
  let scroll = 0;
  vi.spyOn(window, "scrollY", "get").mockImplementation(() => scroll);
  const rects = vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement) {
      const top = this.dataset.celestialDecor === "hero" ? 0 : 2000;
      return {
        top: top - scroll,
        y: top - scroll,
        left: 0,
        x: 0,
        width,
        height: 1000,
        bottom: top - scroll + 1000,
        right: width,
        toJSON() {},
      };
    });
  const root = createRef<HTMLDivElement>();
  const view = render(
    <div ref={root}>
      <div data-celestial-decor="hero" data-active="false" />
      <div data-celestial-decor="focus" data-active="false" />
      <CelestialWorld root={root} paused={false} />
    </div>
  );
  const layer = view.container.querySelector<HTMLElement>(
    '[data-celestial-decor="hero"]'
  )!;
  const entry = (isIntersecting: boolean): IntersectionObserverEntry => ({
    target: layer,
    isIntersecting,
    intersectionRatio: isIntersecting ? 1 : 0,
    boundingClientRect: new DOMRect(),
    intersectionRect: new DOMRect(),
    rootBounds: null,
    time: 0,
  });
  const flush = () =>
    act(() => {
      const fn = queued;
      queued = undefined;
      fn?.(0);
    });
  act(() =>
    intersect(
      [entry(true)],
      {} as IntersectionObserver
    )
  );
  flush();
  return {
    layer,
    rects,
    request,
    flush,
    scroll(y: number) {
      scroll = y;
      act(() => window.dispatchEvent(new Event("scroll")));
      flush();
    },
    resize() {
      act(() => resized([], {} as ResizeObserver));
      flush();
    },
    reduce() {
      reduced = true;
      act(() => mediaChanged());
      flush();
    },
    leaveViewport() {
      act(() =>
        intersect(
          [entry(false)],
          {} as IntersectionObserver
        )
      );
      flush();
    },
  };
}

it("uses cached layout during scroll and refreshes it on layout changes", () => {
  const w = world();
  const reads = w.rects.mock.calls.length;
  expect(w.layer.dataset.active).toBe("true");
  const initial = w.layer.style.getPropertyValue("--decor-drift");
  w.scroll(250);
  w.scroll(300);
  expect(w.rects).toHaveBeenCalledTimes(reads);
  expect(w.layer.style.getPropertyValue("--decor-drift")).not.toBe(initial);
  w.resize();
  expect(w.rects.mock.calls.length).toBeGreaterThan(reads);
});

it("avoids decoration scroll frames entirely on mobile", () => {
  const w = world(390);
  const frames = w.request.mock.calls.length;
  w.scroll(200);
  w.scroll(300);
  expect(w.request).toHaveBeenCalledTimes(frames);
  expect(w.layer.style.getPropertyValue("--decor-drift")).toBe("0.00px");
});

it("does not rewrite unchanged inherited styles on repeated scroll events", () => {
  const w = world();
  const writes = vi.spyOn(w.layer.style, "setProperty");
  w.scroll(0);
  w.scroll(0);
  expect(writes).not.toHaveBeenCalled();
});

it.each(["reduced", "hidden", "offscreen"])(
  "does not schedule decoration scroll frames when %s",
  (reason) => {
    const w = world();
    if (reason === "reduced") w.reduce();
    else if (reason === "offscreen") w.leaveViewport();
    else {
      vi.spyOn(document, "hidden", "get").mockReturnValue(true);
      act(() => document.dispatchEvent(new Event("visibilitychange")));
      w.flush();
    }
    expect(w.layer.dataset.active).toBe("false");
    const frames = w.request.mock.calls.length;
    w.scroll(300);
    expect(w.request).toHaveBeenCalledTimes(frames);
  }
);
