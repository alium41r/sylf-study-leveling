import { describe, expect, it, vi } from "vitest";

// The generated index loads images, which only a bundler can do. Its numbers are what this test needs.
vi.mock("./art/plates.generated", () => ({ PLATE_SIZES: { sea: { width: 1200, height: 280 }, gate: { width: 780, height: 830 } }, GATE_ANCHORS: { threshold: { x: 0.496, y: 0.6256 } } }));
const { sceneLayout } = await import("./layout");

const WINDOWS = [[1920, 1080], [1680, 1000], [1280, 820], [1280, 746], [1024, 768], [820, 1180], [820, 900], [900, 420], [600, 800], [480, 800], [340, 640]] as const;

describe("World scene layout", () => {
  it.each(WINDOWS)("%i by %i keeps the sea edge to edge and the gate in the window", (width, height) => {
    const { sea, gate, horizon, threshold } = sceneLayout(width, height, width < 600);
    expect(sea.x).toBeLessThanOrEqual(0);
    expect(sea.x + sea.width).toBeGreaterThanOrEqual(width);
    expect(sea.y + sea.height).toBeGreaterThanOrEqual(height);
    expect(gate.y).toBeGreaterThanOrEqual(-gate.height * 0.04);
    expect(gate.x).toBeGreaterThanOrEqual(0);
    expect(gate.x + gate.width).toBeLessThanOrEqual(width);
    expect(threshold.y).toBeLessThan(horizon);
  });
  it("leaves the left of an expanded window for the lobby's text", () => {
    const { gate } = sceneLayout(1280, 746, false);
    expect(gate.x).toBeGreaterThan(420);
  });
  it("stands the gate at the middle of a compact window", () => {
    const { threshold } = sceneLayout(480, 800, true);
    expect(threshold.x).toBe(240);
  });
});
