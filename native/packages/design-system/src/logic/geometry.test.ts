import { describe, expect, it } from "vitest";
import { svgId } from "./svg-id";
import { clampRect, placeFloating, resolveSplit, snapValue } from "./geometry";

const none = { top: 0, left: 0, right: 0, bottom: 0 };
const window = { width: 1000, height: 700 };

describe("snapValue", () => {
  it("snaps and clamps without float noise", () => {
    expect(snapValue(0.31, 0, 1, 0.05)).toBe(0.3);
    expect(snapValue(5, 0, 1, 0.1)).toBe(1);
    expect(snapValue(1.04, 0.85, 1.4, 0.05)).toBe(1.05);
  });
});

describe("placeFloating", () => {
  it("opens on the preferred side", () => {
    const p = placeFloating({ x: 100, y: 100, width: 80, height: 40 }, { width: 200, height: 160 }, window, none);
    expect(p.side).toBe("bottom");
    expect(p).toMatchObject({ left: 100, top: 148, tuck: "topLeft" });
  });
  it("flips when there is no room, and tucks the corner facing the anchor", () => {
    const p = placeFloating({ x: 780, y: 640, width: 80, height: 40 }, { width: 200, height: 160 }, window, none);
    expect(p.side).toBe("top");
    expect(p.tuck).toBe("bottomLeft");
    expect(p.top + 160).toBeLessThanOrEqual(640);
  });
  it("stays inside safe areas", () => {
    const insets = { top: 40, left: 20, right: 20, bottom: 30 };
    const p = placeFloating({ x: 960, y: 10, width: 30, height: 20 }, { width: 200, height: 100 }, window, insets);
    expect(p.left + 200).toBeLessThanOrEqual(1000 - 20);
    expect(p.top).toBeGreaterThanOrEqual(40);
  });
  it("still fits when the surface is larger than the window", () => {
    const p = placeFloating({ x: 10, y: 10, width: 30, height: 20 }, { width: 2000, height: 2000 }, window, none);
    expect(p.left).toBeGreaterThanOrEqual(0);
    expect(p.top).toBeGreaterThanOrEqual(0);
  });
});

describe("resolveSplit", () => {
  const snaps = [1 / 3, 0.5, 2 / 3];
  it("snaps near useful ratios", () => { expect(resolveSplit(0.49, 1000, 200, snaps)).toBe(0.5); });
  it("moves freely between them", () => { expect(resolveSplit(0.42, 1000, 200, snaps)).toBe(0.42); });
  it("protects the minimum pane", () => { expect(resolveSplit(0.02, 1000, 200, snaps)).toBe(0.2); expect(resolveSplit(0.99, 1000, 200, snaps)).toBe(0.8); });
  it("handles windows narrower than two panes", () => { expect(resolveSplit(0.1, 300, 200, [])).toBe(0.5); });
});

describe("clampRect", () => {
  it("pulls a panel back after the window shrinks", () => {
    expect(clampRect({ x: 900, y: 600, width: 300, height: 200 }, { width: 800, height: 500 })).toEqual({ x: 500, y: 300, width: 300, height: 200 });
  });
  it("shrinks a panel that no longer fits", () => {
    expect(clampRect({ x: 0, y: 0, width: 900, height: 200 }, { width: 800, height: 500 }).width).toBe(800);
  });
});

describe("svgId", () => {
  it("makes any label safe to use in url(#id)", () => {
    expect(svgId("Day ground-hue")).toBe("Day-ground-hue");
    expect(svgId(":r3:")).toBe("-r3-");
    expect(svgId("Accent-depth")).toBe("Accent-depth");
  });
});
