import { useRef } from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import JourneyPath from "@/app/components/landing/journey/JourneyPath";
import type { JourneyCompanionHandle } from "@/app/components/landing/companion/JourneyCompanion";

const { present } = vi.hoisted(() => ({ present: vi.fn() }));

vi.mock("@/app/components/landing/companion/JourneyCompanion", async () => {
  const { forwardRef, useImperativeHandle } = await import("react");
  return {
    default: forwardRef<JourneyCompanionHandle>(function Companion(_, ref) {
      useImperativeHandle(ref, () => ({
        present,
      }));
      return null;
    }),
  };
});

// A straight SVG path isolates the scroll controller from browser SVG rendering.
// Actual curve construction is covered by journey-geometry.test.ts.
const svgDescriptors = new Map<string, PropertyDescriptor | undefined>();

function JourneyFixture({ paused = false }: { paused?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  return (
    <div ref={root} data-top="0" data-height="5000">
      <span data-journey-stop data-top="500" />
      <section id="focus" data-top="1500" data-height="700">
        <figure data-top="1600" data-height="500" />
        <span data-journey-stop data-top="2000" />
      </section>
      <section id="early-access">
        <span data-journey-stop data-top="4500" />
      </section>
      <JourneyPath root={root} paused={paused} />
    </div>
  );
}

function advance(milliseconds: number) {
  act(() => vi.advanceTimersByTime(milliseconds));
}

function scrollTo(y: number) {
  vi.stubGlobal("scrollY", y);
  fireEvent.scroll(window);
}

function latestMotion() {
  return present.mock.lastCall?.slice(0, 2);
}

function worldY(walker: HTMLElement) {
  const match = walker.style.transform.match(
    /translate3d\([^,]+,\s*([\d.-]+)px/
  );
  if (!match) throw new Error("Companion has no measured world position");
  return Number(match[1]);
}

beforeEach(() => {
  vi.useFakeTimers();
  present.mockClear();
  vi.stubGlobal("scrollY", 500);
  vi.stubGlobal("innerHeight", 800);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 16)
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) =>
    window.clearTimeout(id)
  );
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(
    5000
  );
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
    function (this: HTMLElement) {
      return Number(this.dataset.height ?? 0);
    }
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const top = Number(this.dataset.top ?? 0) - window.scrollY;
      const height = Number(this.dataset.height ?? 0);
      return {
        top,
        bottom: top + height,
        left: 0,
        right: 1200,
        width: 1200,
        height,
        x: 0,
        y: top,
        toJSON: () => ({}),
      };
    }
  );
  for (const [name, value] of Object.entries({
    getTotalLength: () => 4000,
    getPointAtLength: (length: number) => ({ x: 600, y: 500 + length }),
  })) {
    svgDescriptors.set(
      name,
      Object.getOwnPropertyDescriptor(SVGElement.prototype, name)
    );
    Object.defineProperty(SVGElement.prototype, name, {
      configurable: true,
      value,
    });
  }
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.history.replaceState(null, "", "/");
  for (const [name, descriptor] of svgDescriptors) {
    if (descriptor)
      Object.defineProperty(SVGElement.prototype, name, descriptor);
    else Reflect.deleteProperty(SVGElement.prototype, name);
  }
  svgDescriptors.clear();
});

it("settles small movements and stops scheduling frames at rest", () => {
  const { container } = render(<JourneyFixture />);
  const walker = container.querySelector<HTMLElement>("[data-motion-state]")!;
  expect(latestMotion()).toEqual(["IDLE", true]);

  scrollTo(503);
  advance(1200);
  expect(latestMotion()).toEqual(["IDLE", true]);
  expect(walker.dataset.moving).toBe("false");
  const settledPosition = walker.style.transform;

  const calls = present.mock.calls.length;
  advance(4000);
  expect(present).toHaveBeenCalledTimes(calls);
  expect(walker.style.transform).toBe(settledPosition);
});

it("does not query SVG geometry again during scroll movement", () => {
  const geometry = vi.spyOn(
    SVGElement.prototype as SVGPathElement,
    "getPointAtLength"
  );
  render(<JourneyFixture />);
  const initializationReads = geometry.mock.calls.length;
  expect(initializationReads).toBeGreaterThan(0);
  scrollTo(1500);
  advance(2500);
  scrollTo(900);
  advance(2500);
  expect(geometry).toHaveBeenCalledTimes(initializationReads);
});

it("holds Focus while traveling through its section and resumes from the same position", () => {
  const { container } = render(<JourneyFixture />);
  const walker = container.querySelector<HTMLElement>("[data-motion-state]")!;

  scrollTo(1500);
  advance(336);
  // A large scroll temporarily outruns the traveler; local motion pauses until visible.
  expect(latestMotion()).toEqual(["FOCUSING", false]);
  expect(present.mock.lastCall?.[4]).toBe(true);
  expect(walker.dataset.moving).toBe("true");
  advance(2500);
  expect(latestMotion()).toEqual(["FOCUSING", true]);
  expect(walker.dataset.moving).toBe("false");
  const restingPosition = walker.style.transform;
  const restingY = worldY(walker);

  advance(1000);
  expect(walker.style.transform).toBe(restingPosition);
  scrollTo(1600);
  expect(walker.style.transform).toBe(restingPosition);
  advance(16);
  expect(latestMotion()).toEqual(["FOCUSING", true]);
  // Continue forward from the resting point without resetting or teleporting.
  expect(worldY(walker)).toBeGreaterThan(restingY);
  expect(worldY(walker)).toBeLessThan(restingY + 100);
  advance(2000);
  expect(latestMotion()).toEqual(["FOCUSING", true]);

  scrollTo(3100);
  advance(3000);
  expect(latestMotion()).toEqual(["IDLE", true]);
  scrollTo(1500);
  advance(3500);
  expect(latestMotion()).toEqual(["FOCUSING", true]);
});

it.each(["pixel", "pixel-layered"])(
  "preserves idle-on-travel behavior for %s",
  (variant) => {
    vi.stubEnv("NODE_ENV", "development");
    window.history.replaceState(null, "", `/?companion=${variant}`);
    const { container } = render(<JourneyFixture />);
    scrollTo(1500);
    advance(336);
    expect(latestMotion()).toEqual(["IDLE", false]);
    expect(present.mock.lastCall?.[4]).toBe(false);
    expect(container.querySelector("[data-journey-traveler]")).toHaveAttribute(
      "data-moving",
      "true"
    );
    advance(2500);
    expect(latestMotion()).toEqual(["FOCUSING", true]);
  }
);

it("remeasures section anchors when responsive layout changes", () => {
  vi.stubGlobal("scrollY", 1500);
  const { container } = render(<JourneyFixture />);
  const walker = container.querySelector<HTMLElement>("[data-motion-state]")!;
  expect(latestMotion()).toEqual(["FOCUSING", true]);
  const restingPosition = walker.style.transform;

  container.querySelector<HTMLElement>(
    "#focus [data-journey-stop]"
  )!.dataset.top = "3800";
  fireEvent.resize(window);
  expect(latestMotion()).toEqual(["IDLE", true]);
  expect(walker.style.transform).toBe(restingPosition);

  scrollTo(3000);
  advance(3000);
  expect(latestMotion()).toEqual(["FOCUSING", true]);
});

it("suspends page motion when paused or when the tab is hidden", () => {
  const { container, rerender } = render(<JourneyFixture paused />);
  const walker = container.querySelector<HTMLElement>(
    "[data-journey-traveler]"
  )!;
  const before = walker.style.transform;
  scrollTo(1800);
  advance(1000);
  expect(walker.style.transform).toBe(before);
  expect(latestMotion()).toEqual(["IDLE", false]);
  rerender(<JourneyFixture />);
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  fireEvent(document, new Event("visibilitychange"));
  const hiddenPosition = walker.style.transform;
  scrollTo(2400);
  advance(1000);
  expect(walker.style.transform).toBe(hiddenPosition);
  expect(latestMotion()).toEqual(["IDLE", false]);
});
