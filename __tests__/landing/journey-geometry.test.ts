import { describe, expect, it, vi } from "vitest";
import {
  buildJourneyPath,
  journeyYForScroll,
  lengthAtY,
  pointAtJourneyY,
  journeyDistanceAtY,
  snapPixelPosition,
} from "@/app/components/landing/journey/journey-geometry";

describe("pixel-only position snapping", () => {
  it.each([1, 2, 3])(
    "aligns the displayed origin at DPR %s despite fractional layout and scroll offsets",
    (ratio) => {
      const origin = { x: 17.3125 - 28, y: 33.890625 - 503.25 - 63 };
      for (const point of [
        { x: 342.7, y: 710.13 },
        { x: -4.71, y: 201.82 },
      ]) {
        const snapped = snapPixelPosition(point, origin, ratio);
        expect((snapped.x + origin.x) * ratio).toBeCloseTo(
          Math.round((point.x + origin.x) * ratio),
          10
        );
        expect((snapped.y + origin.y) * ratio).toBeCloseTo(
          Math.round((point.y + origin.y) * ratio),
          10
        );
        expect(Math.abs(snapped.x - point.x)).toBeLessThanOrEqual(
          0.5 / ratio + Number.EPSILON
        );
        expect(Math.abs(snapped.y - point.y)).toBeLessThanOrEqual(
          0.5 / ratio + Number.EPSILON
        );
      }
    }
  );
});

describe("frame geometry without SVG queries", () => {
  const points = [
    { x: 1260, y: 550 },
    { x: 1100, y: 1000 },
    { x: 620, y: 1650 },
    { x: 820, y: 2400 },
  ];
  it("matches the actual vertical-handle Bézier at every sampled parameter", () => {
    for (let segment = 1; segment < points.length; segment++) {
      const a = points[segment - 1],
        b = points[segment];
      for (let step = 0; step <= 100; step++) {
        const t = step / 100;
        const y = a.y + (b.y - a.y) * (t * t * t - 1.5 * t * t + 1.5 * t);
        const x = a.x + (b.x - a.x) * t * t * (3 - 2 * t);
        const actual = pointAtJourneyY(points, y);
        expect(actual.x).toBeCloseTo(x, 8);
        expect(actual.y).toBeCloseTo(y, 8);
      }
    }
  });
  it("clamps endpoints and handles a single point or empty track", () => {
    expect(pointAtJourneyY(points, -100)).toEqual(points[0]);
    expect(pointAtJourneyY(points, 9000)).toEqual(points.at(-1));
    expect(pointAtJourneyY([points[0]], 9000)).toEqual(points[0]);
    expect(pointAtJourneyY([], 9000)).toEqual({ x: 0, y: 0 });
  });
  it("keeps position continuous on both sides of a section join", () => {
    for (const p of points.slice(1, -1)) {
      const before = pointAtJourneyY(points, p.y - 0.001);
      const after = pointAtJourneyY(points, p.y + 0.001);
      expect(Math.abs(before.x - after.x)).toBeLessThan(0.001);
      expect(after.y - before.y).toBeCloseTo(0.002, 8);
    }
  });
  it("reuses measured arc samples with bounded monotonic progress for growth marks", () => {
    const samples = [
      { y: 100, length: 0 },
      { y: 300, length: 250 },
      { y: 500, length: 600 },
    ];
    expect(journeyDistanceAtY(samples, -100)).toBe(0);
    expect(journeyDistanceAtY(samples, 999)).toBe(600);
    expect(journeyDistanceAtY(samples, 300)).toBe(250);
    expect(journeyDistanceAtY(samples, 400)).toBe(425);
    expect(journeyDistanceAtY([], 100)).toBe(0);
    let previous = 0;
    for (let y = 0; y < 700; y++) {
      const current = journeyDistanceAtY(samples, y);
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });
});

describe("hero scroll destination", () => {
  const desktop = {
    viewportHeight: 1000,
    origin: 0,
    startY: 557,
    heroExitY: 1097,
    endY: 6000,
  };

  it("starts at the hero instead of skipping to the viewport reading line", () => {
    expect(journeyYForScroll({ ...desktop, scrollY: 0 })).toBe(557);
    expect(journeyYForScroll({ ...desktop, scrollY: -20 })).toBe(557);
  });

  it("meets the existing scroll mapping continuously at the screenshot", () => {
    const join = desktop.heroExitY - desktop.viewportHeight * 0.68;
    expect(journeyYForScroll({ ...desktop, scrollY: join })).toBe(1097);
    expect(
      journeyYForScroll({ ...desktop, scrollY: join - 0.001 })
    ).toBeCloseTo(1097, 2);
    expect(
      journeyYForScroll({ ...desktop, scrollY: join + 0.001 })
    ).toBeCloseTo(1097, 2);
    expect(journeyYForScroll({ ...desktop, scrollY: 1500 })).toBe(2180);
  });

  it.each([
    desktop,
    { viewportHeight: 844, origin: 0, startY: 524, heroExitY: 760, endY: 5000 },
    {
      viewportHeight: 1800,
      origin: 0,
      startY: 557,
      heroExitY: 1097,
      endY: 6000,
    },
  ])(
    "is monotonic and bounded for desktop, mobile, and very tall viewports",
    (geometry) => {
      let previous = geometry.startY;
      for (let scrollY = 0; scrollY <= 10000; scrollY += 2) {
        const target = journeyYForScroll({ ...geometry, scrollY });
        expect(target).toBeGreaterThanOrEqual(previous);
        expect(target).toBeLessThanOrEqual(geometry.endY);
        // Smooth destinations still feed the existing acceleration controller.
        expect(target - previous).toBeLessThan(12);
        previous = target;
      }
    }
  );

  it("keeps the original mapping when a page has no hero start marker", () => {
    expect(
      journeyYForScroll({
        scrollY: 350,
        viewportHeight: 1000,
        origin: 100,
        startY: 100,
        endY: 3000,
      })
    ).toBe(930);
  });
});

describe("buildJourneyPath", () => {
  it("returns an empty path when no waypoints have been measured", () => {
    expect(buildJourneyPath([])).toBe("");
  });

  it("starts at the single waypoint without inventing another segment", () => {
    expect(buildJourneyPath([{ x: 32, y: 70 }])).toBe("M 32 70");
  });

  it("connects alternating waypoints through vertical cubic handles", () => {
    expect(
      buildJourneyPath([
        { x: 40, y: 100 },
        { x: 960, y: 500 },
        { x: 40, y: 1100 },
      ])
    ).toBe("M 40 100 C 40 300, 960 300, 960 500 C 960 800, 40 800, 40 1100");
  });
});

describe("lengthAtY", () => {
  function monotonicPath() {
    return {
      getPointAtLength: vi.fn(
        (length: number) => ({ x: 0, y: 100 + length * 2 }) as DOMPoint
      ),
    };
  }

  it.each([
    [100, 0],
    [350, 125],
    [1100, 500],
    [2100, 1000],
  ])("finds the arc length for document Y %s", (y, expected) => {
    expect(lengthAtY(monotonicPath(), 1000, y)).toBeCloseTo(expected, 2);
  });

  it.each([
    [-500, 0],
    [5000, 1000],
  ])("clamps out-of-range document Y %s to the path", (y, expected) => {
    const path = monotonicPath();
    expect(lengthAtY(path, 1000, y)).toBeCloseTo(expected, 2);
    for (const [sampledLength] of path.getPointAtLength.mock.calls) {
      expect(sampledLength).toBeGreaterThanOrEqual(0);
      expect(sampledLength).toBeLessThanOrEqual(1000);
    }
  });

  it("returns zero for a zero-length path", () => {
    expect(lengthAtY(monotonicPath(), 0, 500)).toBe(0);
  });
});
